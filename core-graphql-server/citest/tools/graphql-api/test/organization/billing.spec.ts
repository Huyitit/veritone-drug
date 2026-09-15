import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { AccessScope } from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { getCitestMarker } from '../helpers/citestGlobals';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

/**
 * Organization billing-plan and application-access operations, converted from
 * the legacy citest/billing.spec.js.
 *
 * Two deliberate departures from the legacy spec, both required by the harness's
 * session rules:
 *
 *  - The spec creates its own test org, so it runs as a throwaway isolated
 *    superadmin rather than the shared citest superadmin. `createOrganization`
 *    auto-enrols the calling identity in the new org, so doing this on the
 *    shared session risks that session being collateral damage of the org's
 *    teardown.
 *  - Teardown soft-deletes the org (`updateOrganization` with status "deleted")
 *    instead of the legacy REST hard-delete (`helpers.deleteOrganization`),
 *    which terminates every session enrolled in the org.
 */
const citestMarker = getCitestMarker();

/** Billing plan id the legacy spec used; not validated against a real plan. */
const BILLING_PLAN_ID = 'BP_cit';

/** The seeded "Data Center"/CMS application. */
const CMS_APPLICATION_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';

describe('citest_billing: billing tests', () => {
  let sa: IsolatedSuperadmin;
  let superClient: GraphqlClient;
  let orgId: string | null = null;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(bootstrapClient.sessionToken).toBeDefined();

    sa = await createIsolatedSuperadmin(bootstrapClient);
    superClient = sa.client;
  });

  afterAll(async () => {
    if (orgId) {
      await safe('soft-delete test organization', () =>
        superClient.sdk.updateOrganization({
          input: { id: orgId as string, status: 'deleted' }
        })
      );
    }
    await sa.cleanup();
  });

  it('create test organization', async () => {
    const result = await superClient.sdk.createOrganization({
      input: {
        name: `${citestMarker}-${new Date().toISOString()}`,
        businessUnit: 'Legal',
        types: [],
        metadata: { test: 'value' }
      }
    });
    const createOrganization = result?.data?.createOrganization ?? null;

    expect(createOrganization).not.toBeNull();
    expect(createOrganization?.jsondata).toHaveProperty('test', 'value');

    orgId = createOrganization?.id ?? null;
    expect(orgId).not.toBeNull();
  });

  it('update organization billing plan', async () => {
    if (!orgId) {
      throw new Error('orgId was not set by the create test organization test');
    }

    const result = await superClient.sdk.updateOrganizationBilling({
      targetOrganizationId: orgId,
      planId: BILLING_PLAN_ID
    });

    expect(result?.data?.updateOrganizationBilling?.planId).toEqual(
      BILLING_PLAN_ID
    );
  });

  it('query organization billing plan', async () => {
    if (!orgId) {
      throw new Error('orgId was not set by the create test organization test');
    }

    const result = await superClient.sdk.organizationBilling({ id: orgId });
    const organization = result?.data?.organization ?? null;

    expect(organization).not.toBeNull();
    expect(organization?.id).toEqual(orgId);

    /**
     * Temporary carve-out inherited from the legacy spec: when createdDateTime
     * and modifiedDateTime are identical the billing columns have not been
     * flushed yet, so the plan assertions are skipped. Tracked by
     * https://steel-ventures.atlassian.net/browse/AWT-7064.
     */
    if (organization?.createdDateTime !== organization?.modifiedDateTime) {
      expect(organization?.billingDirty).toEqual(true);
      expect(organization?.billingPlanId).toEqual(BILLING_PLAN_ID);
    }
  });

  it('add to the list of available applications', async () => {
    if (!orgId) {
      throw new Error('orgId was not set by the create test organization test');
    }

    const result = await superClient.sdk.updateOrganization({
      input: {
        id: orgId,
        applicationAccess: [
          {
            applicationId: CMS_APPLICATION_ID,
            enable: true
          }
        ]
      }
    });

    expect(result?.data?.updateOrganization?.id).toEqual(orgId);
  });

  it('query the list of available applications', async () => {
    if (!orgId) {
      throw new Error('orgId was not set by the create test organization test');
    }

    /**
     * `accessScope: [public, granted]` is the non-deprecated spelling of the
     * legacy `owned: false` argument — the resolver maps `owned: false` to
     * exactly hasOwned=false / hasPublic=true / hasGranted=true. Omitting
     * accessScope would instead default to [public, owned, granted] and make
     * this assertion pass vacuously.
     */
    const result = await superClient.sdk.applicationsByOrg({
      orgId,
      accessScope: [AccessScope.Public, AccessScope.Granted]
    });
    const applications = result?.data?.applications ?? null;

    expect(applications).not.toBeNull();
    const records = applications?.records ?? [];
    expect(records.length).toBeGreaterThan(0);
    expect(records.map((a) => a?.id)).toContain(CMS_APPLICATION_ID);
  });
});
