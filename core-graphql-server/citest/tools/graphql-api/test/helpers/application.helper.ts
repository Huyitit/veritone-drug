import * as _ from 'lodash';
import * as uuid from 'uuid';
import chakram from 'chakram';

import { helpers } from '../../src/helpers/index';
import { GraphqlClient } from '../../src/graphqlUtil';
import {
  OrganizationStatus,
  OrganizationType,
  OrganizationsQuery,
  StringMatch
} from '../../src/gql/gql';

/**
 * Shared setup/teardown helpers for the application citest suites
 * (applicationRoles, applicationsRBAC, applicationWithResources,
 * applicationWithAppEventFeatureFlag). These four specs were converted from
 * the legacy jest suites independently and each carried an identical copy of
 * this block; keep the single source of truth here.
 */

export type RequestOptions = { headers: Record<string, string> };

export const getRequestHeaders = (
  options: RequestOptions
): Record<string, string> => options.headers;

export type OrgRecord = NonNullable<
  NonNullable<OrganizationsQuery['organizations']>['records']
>[number];

/**
 * Role ids granted to the impersonated test user. The Admin role is only
 * needed when the default desktop app is disabled (mirrors the legacy specs).
 */
export function buildApplicationTestRoleIds(
  isDesktopAppEnabled: boolean
): string[] {
  return [
    isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
    '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
    '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
    '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
    '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
  ].filter((roleId): roleId is string => roleId !== null);
}

/** Exchange a superadmin token for a session impersonating `userId` in the org. */
export async function impersonate(
  userId: string,
  applicationOrgGUID: string,
  token: string
): Promise<RequestOptions> {
  const url = `${helpers.config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token') as string | undefined;
  if (!adminToken) {
    const status = _.get(impersonated, 'response.statusCode', 'unknown');
    const body = JSON.stringify(_.get(impersonated, 'body', null));
    throw new Error(
      `Failed to impersonate user ${userId} (status ${status}): ${body}`
    );
  }
  return helpers.requestOptions(adminToken);
}

export async function getOrganization(
  gqlClient: GraphqlClient,
  name: string,
  ignoreExpect = false,
  nameMatch: StringMatch = StringMatch.Contains
): Promise<OrgRecord> {
  const result = await gqlClient.sdk.organizations({
    name,
    nameMatch,
    status: OrganizationStatus.Active
  });
  const applicationOrg = result.data.organizations?.records?.[0];

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg?.name).toContain(name);
  }

  if (!applicationOrg) {
    throw new Error(`Organization not found: ${name}`);
  }
  return applicationOrg;
}

export interface TestOrgOptions {
  isDesktopAppEnabled: boolean;
  /** Extra `metadata.features` entries (e.g. `{ enableRBACFeature: 'enabled' }`). */
  extraFeatures?: Record<string, string>;
  /** Look the created org back up by its exact generated name instead of by prefix. */
  exactLookup?: boolean;
}

export async function setupTestOrganization(
  gqlClient: GraphqlClient,
  prefixName: string,
  opts: TestOrgOptions
): Promise<OrgRecord> {
  const applications = [
    {
      applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
      applicationKey: 'cms'
    },
    opts.isDesktopAppEnabled
      ? null
      : {
          applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
          applicationKey: 'admin'
        },
    {
      applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
      applicationKey: 'developer'
    },
    {
      applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
      applicationKey: 'discovery'
    }
  ].filter(
    (app): app is { applicationId: string; applicationKey: string } =>
      app !== null
  );

  const result = await gqlClient.sdk.createOrganization({
    input: {
      name: `${prefixName}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: {
        test: 'value',
        features: {
          automaticPackageCreation: 'enabled',
          ...opts.extraFeatures
        }
      },
      applications
    }
  });

  const createdOrg = result.data.createOrganization;
  expect(createdOrg?.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(createdOrg?.id).toBeDefined();
  expect(createdOrg?.guid).toBeDefined();

  if (opts.exactLookup) {
    return getOrganization(
      gqlClient,
      createdOrg?.name ?? prefixName,
      true,
      StringMatch.Exact
    );
  }
  return getOrganization(gqlClient, prefixName);
}

export async function updateOrganizationForPackageCreation(
  gqlClient: GraphqlClient,
  orgId: string,
  extraFeatures?: Record<string, string>
): Promise<void> {
  await gqlClient.sdk.updateOrganization({
    input: {
      id: orgId,
      metadata: {
        features: {
          automaticPackageCreation: 'enabled',
          ...extraFeatures
        }
      }
    }
  });
}

export async function getOrCreateOrganization(
  gqlClient: GraphqlClient,
  organizationNamePrefix: string,
  opts: TestOrgOptions
): Promise<OrgRecord> {
  let applicationOrganization = await setupTestOrganization(
    gqlClient,
    organizationNamePrefix,
    opts
  );

  const automaticPackageCreation = _.get(
    applicationOrganization,
    'jsondata.features.automaticPackageCreation'
  ) as string | undefined;

  if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
    await updateOrganizationForPackageCreation(
      gqlClient,
      applicationOrganization.id,
      opts.extraFeatures
    );
    applicationOrganization = await getOrganization(
      gqlClient,
      organizationNamePrefix
    );
  }
  return applicationOrganization;
}

export async function createUser(
  gqlClient: GraphqlClient,
  uniqueId: number,
  orgId: string,
  roleIds: string[]
): Promise<string> {
  const result = await gqlClient.sdk.createUser({
    input: {
      name: `${uniqueId}-admin-user-${uuid.v4()}@localhost`,
      organizationId: orgId,
      firstName: 'Flow-User',
      lastName: 'Admin',
      jsondata: {
        firstName: 'Flow-User',
        lastName: 'Admin'
      },
      roleIds
    }
  });

  const userId = result.data.createUser?.id;
  if (!userId) {
    throw new Error('Failed to create user');
  }
  return userId;
}

/**
 * Poll `fn` until `isReady` accepts its result or `timeoutMs` elapses; returns
 * the last result either way (callers keep their own assertions). For state
 * that materializes asynchronously (e.g. the appRole auth group / permission
 * set that the eventing service creates after `applicationAddToOrg`) — a
 * fixed sleep is a race, a poll is not.
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  isReady: (value: T) => boolean,
  {
    timeoutMs = 60000,
    intervalMs = 2000
  }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await fn();
  while (!isReady(last) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = await fn();
  }
  return last;
}

export async function getOrCreateUser(
  gqlClient: GraphqlClient,
  applicationOrganization: OrgRecord,
  uniqueId: number,
  roleIds: string[]
): Promise<string> {
  const users = applicationOrganization.users?.records ?? [];
  const activeUsers = users.filter(
    (user): user is NonNullable<typeof user> =>
      user !== null &&
      user.status === 'active' &&
      (user.organizationGuids?.length ?? 0) === 1 &&
      roleIds.every((roleId) =>
        (user.roles ?? []).some((role) => role?.id === roleId)
      )
  );

  if (activeUsers.length === 0) {
    return createUser(gqlClient, uniqueId, applicationOrganization.id, roleIds);
  }

  const adminUser = activeUsers.find((user) => user.name.includes('admin'));
  return adminUser ? adminUser.id : activeUsers[0].id;
}
