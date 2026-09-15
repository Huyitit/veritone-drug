import * as _ from 'lodash';

import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { CreateTriggerTarget, OrganizationStatus } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

interface CitestGlobals {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

// No createTriggers/deleteTrigger/createHooks operation exists in the
// generated SDK at all - every call in this file is a raw query.
describe('citest_trigger: trigger tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let triggerId: string | undefined;

  beforeAll(async () => {
    /**
     * Isolated throwaway superadmin instead of the legacy shared session, so
     * this spec's trigger/hook lifecycle can never collaterally affect the
     * session shared by every other spec (see
     * test/helpers/superadminSession.ts).
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
  });

  afterAll(async () => {
    await safe('delete test org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization({
        input: {
          id: isolatedSuperadmin.orgId,
          status: OrganizationStatus.Deleted
        }
      })
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('register a trigger', async () => {
    const testName = citestMarker + 'testEventName';
    const result = await gqlClient.sdk.createTriggers({
      input: {
        events: testName,
        targets: [
          {
            name: CreateTriggerTarget.Webhook,
            params: {
              url: 'http://testendpoint.com'
            }
          }
        ]
      }
    });
    triggerId = _.get(result, 'data.createTriggers[0].id');
    expect(triggerId).toBeDefined();
    expect(_.get(result, 'data.createTriggers[0].event')).toEqual(testName);
    expect(_.get(result, 'data.createTriggers[0].target')).toEqual('Webhook');
  });

  it('delete a trigger', async () => {
    const result = await gqlClient.sdk.deleteTrigger({ id: triggerId! });
    triggerId = _.get(result, 'data.deleteTrigger.id');
    expect(triggerId).toBeDefined();
  });

  it('delete an invalid trigger', async () => {
    await expect(
      gqlClient.sdk.deleteTrigger({ id: triggerId! })
    ).rejects.toThrow();
  });

  describe('register invalid hook', () => {
    it('should be a bad request with unsupported target', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        targets:[
          {
            name: "Email"
            params: {}
          }
        ]
      }) {
        id
      }
    }`;
      await expect(gqlClient.query(query)).rejects.toThrow();
    });

    it('should be a bad request with incorrect payload for target', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        targets:[
          {
            name: Email
            params: {}
          }
        ]
      }) {
        id
      }
    }`;
      await expect(gqlClient.query(query)).rejects.toThrow();
    });

    it('should have error providing both events and types input', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        types:"type1"
        targets:[
          {
            name: Email,
            params:""
          }
        ]
      }) {
        id
      }
    }`;
      await expect(gqlClient.query(query)).rejects.toThrow();
    });

    it('should have error for empty target', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        targets:[]
      }) {
        id
      }
    }`;
      await expect(gqlClient.query(query)).rejects.toThrow();
    });
  });

  describe('register valid hook', () => {
    const createdTriggers: Array<Array<{ id: string }>> = [];

    afterAll(async () => {
      await safe('delete created hooks', async () => {
        const query = `mutation {
      delete1: deleteTrigger(id: ${createdTriggers[0][0].id}) {id}
      delete2: deleteTrigger(id: ${createdTriggers[0][1].id}) {id}
      delete3: deleteTrigger(id: ${createdTriggers[1][0].id}) {id}
      delete4: deleteTrigger(id: ${createdTriggers[1][1].id}) {id}
    }`;
        await gqlClient.query(query);
      });
    });

    it('should create two hooks, one per event', async () => {
      const result = await gqlClient.sdk.createTriggers({
        input: {
          events: `${citestMarker}-citest1,citest2`,
          targets: [
            {
              name: CreateTriggerTarget.Email,
              params: {
                address: 'graphql_test@veritone.com'
              }
            }
          ]
        }
      });
      expect(_.get(result, 'data.createTriggers', null)).toHaveLength(2);
      const trigger = _.get(result, 'data.createTriggers') as Array<{
        id: string;
      }>;
      createdTriggers.push(trigger);
    });

    it('should create two hooks, one per type', async () => {
      const result = await gqlClient.sdk.createTriggers({
        input: {
          types: `${citestMarker}-t1,t2`,
          targets: [
            {
              name: CreateTriggerTarget.Email,
              params: {
                address: 'graphql_test@veritone.com'
              }
            }
          ]
        }
      });
      expect(_.get(result, 'data.createTriggers', null)).toHaveLength(2);
      const trigger = _.get(result, 'data.createTriggers') as Array<{
        id: string;
      }>;

      createdTriggers.push(trigger);
    });
  });
});
