import { GraphQLClient } from 'graphql-request';
import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  AuthType,
  GraphqlClient,
  createGraphqlClient
} from '../../src/graphqlUtil';
import {
  ApplicationStatus,
  DeploymentModel,
  IngestSlugQuery,
  IngestSlugUpdateMutation,
  IngestSlugUpdateStatusMutation,
  IngestSlugsCreateMutation,
  IngestSlugsDeleteMutation,
  IngestSlugsQuery,
  OrderDirection,
  Sdk,
  SourceOrderField,
  SourcePermission,
  getSdk
} from '../../src/gql';

/**
 * The generated SDK types every ingestSlug payload as nullable because the
 * schema does. Derive the non-null shapes once here (there are no top-level
 * named exports for them) so specs can name what they are asserting on.
 */
export type IngestSlugPayload = IngestSlugQuery['ingestSlug'];
export type IngestSlugsPagePayload = IngestSlugsQuery['ingestSlugs'];
export type IngestSlugsCreatePayload = NonNullable<
  IngestSlugsCreateMutation['ingestSlugsCreate']
>;
export type IngestSlugUpdatePayload = NonNullable<
  IngestSlugUpdateMutation['ingestSlugUpdate']
>;
export type IngestSlugUpdateStatusPayload = NonNullable<
  IngestSlugUpdateStatusMutation['ingestSlugUpdateStatus']
>;
export type IngestSlugsDeletePayload = NonNullable<
  IngestSlugsDeleteMutation['ingestSlugsDelete']
>;

/**
 * Unwraps a nullable SDK payload, failing loudly with the operation name
 * instead of letting an absent payload turn into a downstream
 * "cannot read property of undefined".
 */
export function requirePayload<T>(
  payload: T | null | undefined,
  operation: string
): T {
  if (payload === null || payload === undefined) {
    throw new Error(`${operation} returned no payload`);
  }
  return payload;
}

/**
 * The legacy jest harness set `global.citestMarker` in jest.global.setup.js.
 * Bun never runs that file, so read the same value from a constant instead of
 * a global that would be undefined under `bun test` (and would silently
 * degrade the cleanup-marker naming to `undefined-...`).
 */
export const citestMarker = 'citest-should-delete';

/** Engine category ("Sample Engine Category") shared by every legacy
 * ingestSlug spec's throwaway engine. */
const ENGINE_CATEGORY_ID = '4be1a1b2-653d-4eaa-ba18-747a265305d8';

/** Keep generated names comfortably short: `createApplication` derives an
 * auto-created package name from the app name, and long names have overflowed
 * downstream varchar columns before (see PR #4238 follow-ups). */
const uniqueSuffix = (): string => `${Date.now()}-${uuidv4().slice(0, 8)}`;

export const testFileUri = (area: string, fileName: string): string =>
  `s3://test-bucket/${area}/${uuidv4()}/${fileName}`;

export interface IngestSlugFixture {
  /** Shared-superadmin client; its SDK already carries the auth header. */
  client: GraphqlClient;
  /** Sources discovered for the run, newest first. */
  sourceIds: string[];
  /** Convenience alias for `sourceIds[0]`, the source most specs use. */
  sourceId: string;
  engineId: string;
  appId: string;
  /** Record a slug so `cleanup` deletes it. Defaults to the primary source. */
  trackSlug: (fileUri: string, sourceId?: string) => void;
  /** Deletes tracked slugs, then the throwaway app and engine. Never throws. */
  cleanup: () => Promise<void>;
}

/**
 * Builds the setup all four ingestSlug specs share: a superadmin client, one or
 * two pre-existing sources to hang slugs off, and a throwaway engine + app to
 * attribute them to.
 *
 * The legacy specs additionally created an organization here (and, in
 * ingestSlug.spec.js, a user inside it) that no assertion ever referenced —
 * bundleLocking/conditionalUpdates/statusLifecycle did not even capture the id,
 * so every CI run leaked one org per spec and enrolled the shared superadmin
 * into it. That dead setup is deliberately not carried over; the one spec that
 * genuinely needs its own org (ingestSlug.spec.ts's cross-org block) creates it
 * through `createIsolatedSuperadmin`.
 */
export async function createIngestSlugFixture(options: {
  /** Short spec label used in generated engine/app names. */
  label: string;
  /** How many distinct sources the spec needs. Defaults to 1. */
  sourceCount?: number;
}): Promise<IngestSlugFixture> {
  const { label, sourceCount = 1 } = options;
  const client = await createGraphqlClient(
    AuthType.SESSION_TOKEN,
    helpers.config.env
  );

  const sourcesResult = await client.sdk.sources({
    permission: SourcePermission.Viewer,
    limit: sourceCount,
    offset: 0,
    orderBy: [{ field: SourceOrderField.Id, direction: OrderDirection.Desc }]
  });
  const sourceIds = (sourcesResult?.data?.sources?.records ?? []).map(
    (record) => record.id
  );
  if (sourceIds.length < sourceCount) {
    throw new Error(
      `ingestSlug fixture (${label}): needed ${sourceCount} source(s) for testing but the org has ${sourceIds.length}`
    );
  }

  const engineResult = await client.sdk.createEngine({
    input: {
      name: `${citestMarker}-${label}-engine-${uniqueSuffix()}`,
      categoryId: ENGINE_CATEGORY_ID,
      deploymentModel: DeploymentModel.FullyNetworkIsolated
    }
  });
  const engineId = engineResult?.data?.createEngine?.id;
  if (!engineId) {
    throw new Error(
      `ingestSlug fixture (${label}): createEngine returned no engine id`
    );
  }

  const appResult = await client.sdk.createApplication({
    input: {
      name: `${citestMarker}-${label}-app-${uniqueSuffix()}`,
      checkPermissions: false
    }
  });
  const appId = appResult?.data?.createApplication?.id;
  if (!appId) {
    throw new Error(
      `ingestSlug fixture (${label}): createApplication returned no app id`
    );
  }

  /** fileUris grouped by the source they belong to, so cleanup can issue one
   * ingestSlugsDelete per source (the mutation is source-scoped). */
  const trackedSlugs = new Map<string, Set<string>>();

  const trackSlug = (fileUri: string, slugSourceId = sourceIds[0]): void => {
    const forSource = trackedSlugs.get(slugSourceId) ?? new Set<string>();
    forSource.add(fileUri);
    trackedSlugs.set(slugSourceId, forSource);
  };

  const cleanup = async (): Promise<void> => {
    for (const [slugSourceId, fileUris] of trackedSlugs) {
      if (fileUris.size === 0) {
        continue;
      }
      await safe(`delete ingest slugs for source ${slugSourceId}`, () =>
        client.sdk.ingestSlugsDelete({
          sourceId: slugSourceId,
          fileUris: [...fileUris]
        })
      );
    }
    trackedSlugs.clear();

    await safe(`delete application ${appId}`, () =>
      client.sdk.updateApplication({
        input: { id: appId, status: ApplicationStatus.Deleted }
      })
    );
    await safe(`delete engine ${engineId}`, () =>
      client.sdk.deleteEngine({ id: engineId })
    );
  };

  return {
    client,
    sourceIds,
    sourceId: sourceIds[0],
    engineId,
    appId,
    trackSlug,
    cleanup
  };
}

/**
 * An SDK with no Authorization header, for the tests that assert the ingestSlug
 * mutations reject anonymous callers. `createGraphqlClient` always attaches
 * credentials, and passing an empty `Authorization` request header would test
 * "malformed token" rather than "no token".
 */
export function createUnauthenticatedSdk(url: string): Sdk {
  return getSdk(new GraphQLClient(url));
}
