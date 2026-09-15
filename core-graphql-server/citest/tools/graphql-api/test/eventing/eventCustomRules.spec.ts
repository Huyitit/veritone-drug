import { v4 as uuidv4 } from 'uuid';

import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  EventActionTemplateActionType,
  EventActionTemplateInputType
} from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { getCitestMarker } from '../helpers/citestGlobals';

/**
 * Event action template CRUD, converted from the legacy
 * citest/eventCustomRules.spec.js. The templates are scoped to a throwaway
 * owner application so the list assertion can expect exactly one record.
 */
const citestMarker = getCitestMarker();
const actionName = `${citestMarker}-test_create_asset`;

describe('citest_eventing: Event action templates', () => {
  let gqlClient: GraphqlClient;
  let applicationId: string | null = null;
  let eventActionTemplateId: string | null = null;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();

    const name = `${citestMarker}-${uuidv4()}-custom-rules-e2e`;
    const createResult = await gqlClient.sdk.createApplication({
      input: {
        name,
        key: `${name}-key`,
        url: 'https://example.com',
        checkPermissions: false
      }
    });
    applicationId = createResult?.data?.createApplication?.id ?? null;
    expect(applicationId).not.toBeNull();
  });

  afterAll(async () => {
    if (applicationId) {
      await safe('delete owner application', () =>
        gqlClient.sdk.deleteApplication({ id: applicationId as string })
      );
    }
  });

  it('create action template', async () => {
    if (!applicationId) {
      throw new Error('applicationId was not set by beforeAll');
    }

    const result = await gqlClient.sdk.createEventActionTemplate({
      input: {
        ownerApplicationId: applicationId,
        name: actionName,
        inputType: EventActionTemplateInputType.Event,
        inputValidation: {},
        inputAttributes: {
          type: 'asset',
          name: 'AssetUploaded',
          application: 'system',
          conditions: {
            operator: 'and',
            conditions: [
              {
                field: 'watchlistId',
                operator: 'eq',
                value: '{{watchlistId}}'
              }
            ]
          }
        },
        actionType: EventActionTemplateActionType.Job,
        actionValidation: {},
        actionAttributes: {
          recordingId: '{{recordingId}}'
        },
        actionDestination: '{{engineId}}'
      }
    });

    expect(result?.data?.createEventActionTemplate?.id).toBeDefined();
  });

  it('list action templates', async () => {
    const result = await gqlClient.sdk.eventActionTemplates({
      ownerApplicationId: applicationId as string
    });
    const records = result?.data?.eventActionTemplates?.records ?? [];

    expect(records).toHaveLength(1);
    const [r0] = records;
    expect(r0?.name).toEqual(actionName);

    eventActionTemplateId = r0?.id ?? null;
    expect(eventActionTemplateId).not.toBeNull();
  });

  it('update action template', async () => {
    if (!eventActionTemplateId) {
      throw new Error(
        'eventActionTemplateId was not set by the list action templates test'
      );
    }

    const newName = `${citestMarker}-${uuidv4()}`;
    const result = await gqlClient.sdk.updateEventActionTemplate({
      input: {
        id: eventActionTemplateId,
        name: newName
      }
    });

    expect(result?.data?.updateEventActionTemplate?.name).toEqual(newName);
  });
});
