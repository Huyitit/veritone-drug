import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import {
  OrganizationStatus,
  OrganizationType,
  EventNameEnum,
  InstanceAuditLogOrderByField,
  OrderDirection
} from '../../src/gql';

const env = helpers.config.env;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';

// Audit-log entries only land in Elasticsearch once eventing has finished
// indexing them, so this suite (like the legacy JS version it replaces) is
// restricted to environments where the eventing/ES pipeline is known to be
// warm and reachable.
const describeIfLocal = env.includes('local') ? describe : describe.skip;

const ORG_ADMIN_ROLE_ID = 'ddca9b68-d775-4934-8ffd-7aecc779b652';

interface AuditLogEntry {
  id: string;
  eventName?: string | null;
  organizationId?: string | null;
  userId?: string | null;
}

async function getInstanceAuditLog(
  gqlClient: GraphqlClient,
  options: Record<string, string>,
  input?: { organizationId?: string; userId?: string }
): Promise<AuditLogEntry[]> {
  const variables = {
    input: {
      eventNames: [EventNameEnum.LoginSucceeded],
      userId: input?.userId,
      organizationId: input?.organizationId,
      offset: 0,
      limit: 3,
      orderBy: [
        {
          field: InstanceAuditLogOrderByField.CreatedDateTime,
          direction: OrderDirection.Desc
        }
      ]
    }
  };
  let result = await gqlClient.sdk.instanceAuditLog(variables, options);
  let attempts = 0;
  // 30s bounded wait. The beforeAll warmup ensures the eventing pipeline is
  // already processing events before any test runs, so this loop should exit
  // on the first try.
  while (result.data.instanceAuditLog.records.length === 0 && attempts < 30) {
    console.log(
      'The audit log entry is still not available in Elasticsearch.'
    );
    await helpers.sleep(1000);
    result = await gqlClient.sdk.instanceAuditLog(variables, options);
    attempts++;
  }
  return result.data.instanceAuditLog.records;
}

async function waitForAuditLogEntry(
  gqlClient: GraphqlClient,
  options: Record<string, string>,
  input: { userId?: string; organizationId?: string },
  maxAttempts: number
): Promise<void> {
  const variables = {
    input: {
      eventNames: [EventNameEnum.LoginSucceeded],
      userId: input.userId,
      organizationId: input.organizationId,
      limit: 1
    }
  };
  for (let i = 0; i < maxAttempts; i++) {
    const r = await gqlClient.sdk.instanceAuditLog(variables, options);
    if (r.data.instanceAuditLog.records.length > 0) return;
    await helpers.sleep(1000);
  }
}

describeIfLocal('audit-log: Instance Audit log tests', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superOptions: Record<string, string>;
  let testOrg: any;
  let orgAdmin: any;
  let regularUser: any;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superOptions = isolatedSuperadmin.options;

    // Wait for the eventing/ES pipeline to be warm before running any tests.
    // Eventing's NSQ consumer registers asynchronously after its HTTP healthcheck
    // passes (can take 60-90s), so events fired early in beforeAll queue in NSQ
    // and arrive in a burst. Polling here absorbs that delay so tests don't race.
    await waitForAuditLogEntry(
      isolatedSuperadmin.client,
      superOptions,
      { userId: isolatedSuperadmin.userId },
      180
    );

    const setup = await setupTestOrgAndUser(isolatedSuperadmin.client, {
      orgInput: {
        name: `${citestMarker}-org-testing-${uuidv4()}`,
        businessUnit: 'Legal',
        types: [OrganizationType.Agency, OrganizationType.Broadcaster],
        metadata: {
          test: 'value',
          features: {
            automaticPackageCreation: 'enabled'
          }
        },
        applications: [],
        remainingBudget: 0,
        isLimitEnforced: true
      },
      userInputs: [
        {
          name: `${citestMarker}-org-admin-testUser-${uuidv4()}@localhost`,
          password: 'testPassword',
          roleIds: [ORG_ADMIN_ROLE_ID]
        },
        {
          name: `${citestMarker}-regular-user-testUser-${uuidv4()}@localhost`,
          password: 'testPassword',
          roleIds: []
        }
      ]
    });

    testOrg = setup.org;
    [orgAdmin, regularUser] = setup.listOptions;

    // Second warmup: wait for orgAdmin's LoginSucceeded event to be indexed.
    // The first warmup only guarantees the isolated superadmin's own login event
    // is indexed; orgAdmin logs in (via setupTestOrgAndUser) after that warmup
    // exits, so its event is still in the eventing defer window (up to ~15s)
    // when the tests start. Polling here with the superadmin token (cross-org
    // access) absorbs that delay.
    await waitForAuditLogEntry(
      isolatedSuperadmin.client,
      superOptions,
      { userId: orgAdmin.userId, organizationId: testOrg.id },
      60
    );
  });

  afterAll(async () => {
    if (testOrg?.id) {
      await safe(`delete org ${testOrg.id}`, () =>
        isolatedSuperadmin.client.sdk.updateOrganization(
          { input: { id: testOrg.id, status: OrganizationStatus.Deleted } },
          superOptions
        )
      );
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('Super admin get audit log from its own organization', async () => {
    const records = await getInstanceAuditLog(
      isolatedSuperadmin.client,
      superOptions,
      {
        organizationId: isolatedSuperadmin.orgId,
        userId: isolatedSuperadmin.userId
      }
    );
    const log = records[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(isolatedSuperadmin.orgId.toString());
    expect(log.userId).toEqual(isolatedSuperadmin.userId);
  });

  it('Super admin get audit log from other organization', async () => {
    const records = await getInstanceAuditLog(
      isolatedSuperadmin.client,
      superOptions,
      {
        organizationId: testOrg.id,
        userId: orgAdmin.userId
      }
    );
    const log = records[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(testOrg.id);
    expect(log.userId).toEqual(orgAdmin.userId);
  });

  // by default, it'll recover the audit log entries from the last week.
  it('Super admin get audit log from other organization without using input.', async () => {
    const records = await getInstanceAuditLog(
      isolatedSuperadmin.client,
      superOptions
    );
    expect(records.length).toBeGreaterThan(0);
  });

  it('Org admin get audit log from its own organization', async () => {
    const records = await getInstanceAuditLog(
      isolatedSuperadmin.client,
      orgAdmin.requestOptions,
      {
        organizationId: testOrg.id,
        userId: orgAdmin.userId
      }
    );
    const log = records[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(testOrg.id);
    expect(log.userId).toEqual(orgAdmin.userId);
  });

  it('Org admin get audit log from other user within its own organization', async () => {
    const records = await getInstanceAuditLog(
      isolatedSuperadmin.client,
      orgAdmin.requestOptions,
      {
        organizationId: testOrg.id,
        userId: regularUser.userId
      }
    );
    const log = records[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(testOrg.id);
    expect(regularUser).toBeDefined();
    expect(log.userId).toEqual(regularUser.userId);
  });

  it('Regular user can get only its own audit log entries', async () => {
    const records = await getInstanceAuditLog(
      isolatedSuperadmin.client,
      regularUser.requestOptions,
      {
        organizationId: testOrg.id,
        userId: orgAdmin.userId
      }
    );
    const log = records[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(testOrg.id);
    expect(log.userId).toEqual(regularUser.userId);
  });

  it('Org admin can not get audit log from other user outside its own organization', async () => {
    let resp: any;
    try {
      await getInstanceAuditLog(
        isolatedSuperadmin.client,
        orgAdmin.requestOptions,
        {
          organizationId: isolatedSuperadmin.orgId,
          userId: isolatedSuperadmin.userId
        }
      );
    } catch (err) {
      resp = err;
    }
    const errObj = resp.response.errors[0];
    expect(errObj.message).toEqual(
      'Only a super admin can get audit logs from different organizations'
    );
    expect(errObj.data.organizationId).toEqual(
      Number(isolatedSuperadmin.orgId)
    );
  });

  it('Regular user can not get audit log from other user outside its own organization', async () => {
    let resp: any;
    try {
      await getInstanceAuditLog(
        isolatedSuperadmin.client,
        regularUser.requestOptions,
        {
          organizationId: isolatedSuperadmin.orgId,
          userId: isolatedSuperadmin.userId
        }
      );
    } catch (err) {
      resp = err;
    }
    const errObj = resp.response.errors[0];
    expect(errObj.message).toEqual(
      'Only a super admin can get audit logs from different organizations'
    );
    expect(errObj.data.organizationId).toEqual(
      Number(isolatedSuperadmin.orgId)
    );
  });
});
