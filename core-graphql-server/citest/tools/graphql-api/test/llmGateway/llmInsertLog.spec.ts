import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import supertestLib from 'supertest';

import { helpers } from '../../src/helpers';
import { getLlmGatewayLogBuffer } from '../../src/helpers/dbHelper';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  createClientWithUser,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationType, OrganizationStatus } from '../../src/gql';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

const password = 'testPassowrd';

const roleIds = [
  '032218c3-d47e-4287-9d16-7bb867c01266',
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  '912e377e-f4a4-4184-8db1-baa9670d8081'
];

const apiKey = 'sk-local';

const prompt = 'Return a short mocked response for testing.';
const mockResponse = 'This is mocked response from CITest';
const localBaseUrl = 'http://localhost:4000';
const ciBaseUrl = 'http://core-llm-gateway:4000';

const testOrgInput = {
  name: `${citestMarker}-org-${uuidv4()}`,
  businessUnit: 'Legal',
  types: [OrganizationType.Agency, OrganizationType.Broadcaster],
  metadata: {
    features: {
      enableRBACFeature: 'enabled'
    }
  },
  applications: [
    {
      applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
      applicationKey: 'cms'
    },
    {
      applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
      applicationKey: 'developer'
    },
    {
      applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
      applicationKey: 'discovery'
    }
  ]
};

describe('citest_llm: insert log', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let supertest = supertestLib(localBaseUrl);

  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);

    // environment check by call health check
    try {
      // test with local base url first, if failed then test with ci base url
      const localTestRes = await supertest
        .get('/health')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .expect(200);

      expect(localTestRes.body).toBeDefined();
      console.log('Local test response:', localTestRes.body);
    } catch (error) {
      supertest = supertestLib(ciBaseUrl);
      const ciTestRes = await supertest
        .get('/health')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .expect(200);

      expect(ciTestRes.body).toBeDefined();
    }
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () => isolatedSuperadmin.cleanup());
  });

  describe('call /completions API and check log', () => {
    let chatResponse: any = null;
    let chatId: string | undefined;
    let modelIds: string[] = [];

    const model = {
      model_name: `citest-should-delete-model-${uuidv4()}`,
      api_key: apiKey,
      model: 'gpt-4-mini',
      custom_llm_provider: 'openai'
    };

    const user = {
      option: {} as Record<string, string>,
      token: '',
      orgId: ''
    };

    const testData = {
      org: {
        orgId: '',
        adminId: ''
      }
    };

    beforeAll(async () => {
      const isoClient = isolatedSuperadmin.client;

      // create org
      const orgRes = await isoClient.sdk.createOrganization({
        input: testOrgInput
      });
      const newOrg = orgRes?.data?.createOrganization;
      expect(newOrg?.id).toBeDefined();
      testData.org.orgId = newOrg!.id;

      // create admin user
      const userRes = await isoClient.sdk.createUser({
        input: {
          name: `${citestMarker}-user-${uuidv4()}`,
          password,
          organizationId: newOrg!.id,
          roleIds
        }
      });
      const newUser = userRes?.data?.createUser;
      expect(newUser?.id).toBeDefined();
      testData.org.adminId = newUser!.id;

      // login user
      const userClient = await createClientWithUser(
        newUser!.name!,
        password,
        isoClient.environment
      );
      expect(userClient.sessionToken).toBeDefined();
      user.token = userClient.sessionToken!;
      user.option = helpers.requestOptions(user.token).headers;
      user.orgId = newOrg!.id;
    });

    afterAll(async () => {
      const isoClient = isolatedSuperadmin.client;

      // delete model
      if (modelIds.length > 0) {
        await Promise.all(
          modelIds.map((modelId) =>
            safe('deleteModel', () =>
              supertest
                .post(`/model/delete`)
                .set('Authorization', `Bearer sk-local`)
                .set('Content-Type', `application/json`)
                .set('x-aiware-api-token', user.token)
                .send({ id: modelId })
            )
          )
        );
      }

      // delete user
      if (testData.org.adminId) {
        await safe('deleteUser', () =>
          isoClient.sdk.deleteUser(
            { id: testData.org.adminId },
            isolatedSuperadmin.options
          )
        );
      }

      // delete org
      if (testData.org.orgId) {
        await safe('deleteOrg', () =>
          isoClient.sdk.updateOrganization(
            { input: { id: testData.org.orgId, status: OrganizationStatus.Deleted } },
            isolatedSuperadmin.options
          )
        );
      }
    });

    it('create new test model', async () => {
      const newModelRes = await supertest
        .post('/model/new')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .send({
          model_name: model.model_name,
          litellm_params: {
            api_key: model.api_key,
            model: model.model,
            custom_llm_provider: model.custom_llm_provider
          },
          model_info: {
            mode: 'chat'
          }
        })
        .expect(200);

      expect(newModelRes.body).toBeDefined();
      const newModelData = _.get(newModelRes, 'body');
      expect(newModelData).toBeDefined();

      const modelId = _.get(newModelData, 'model_id');
      expect(modelId).toBeDefined();
      modelIds.push(modelId);

      expect(newModelData.model_name).toBe(model.model_name);
    });

    it('check new model exists', async () => {
      const res = await supertest
        .get('/model/info')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .set('x-aiware-api-token', user.token)
        .expect(200);

      expect(res.body).toBeDefined();

      const modelsDatas = _.get(res.body, 'data', []);
      expect(modelsDatas).toBeDefined();

      expect(modelsDatas.length).toBeGreaterThan(0);
      const newModelData = modelsDatas.find(
        (m: any) => m.model_name === model.model_name
      );
      expect(newModelData).toBeDefined();

      const modelId = _.get(newModelData, 'model_info.id');
      expect(modelId).toBeDefined();
      expect(modelIds).toContain(modelId);

      const modelType = _.get(newModelData, 'litellm_params.model');
      expect(modelType).toBeDefined();
      expect(modelType).toBe(model.model);
    });

    it('call /completions API', async () => {
      const res = await supertest
        .post('/completions')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .set('x-aiware-api-token', user.token)
        .send({
          model: model.model_name,
          prompt: prompt,
          // this is a mock response for testing, it will be returned instead of calling the actual LLM provider
          mock_response: mockResponse
        })
        .expect(200);

      expect(res.body).toBeDefined();
      chatResponse = res.body;
      chatId = _.get(chatResponse, 'id');
    });

    it('check log in llmGateway', async () => {
      let dbValue: any;

      for (let i = 0; i < 5; i++) {
        try {
          dbValue = await getLlmGatewayLogBuffer(chatId!);
          break;
        } catch (err) {
          await helpers.sleep(20000);
        }
      }

      expect(dbValue).toBeDefined();
      const logData = _.get(dbValue, 'log_data');
      const logDataJson = JSON.parse(logData);

      expect(logDataJson).toBeDefined();
      expect(logDataJson.id).toBe(chatId);
      expect(logDataJson.model).toBe(model.model);
      expect(logDataJson.llm_parameters).toBeDefined();
      const logPrompt = _.get(logDataJson, 'llm_parameters.prompt');
      expect(logPrompt).toBeDefined();
      if (logPrompt === 'Redaction unavailable') {
        expect(logDataJson.llm_output_text).toBe('Redaction unavailable');
      } else {
        expect(logDataJson.llm_parameters.prompt).toBe(prompt);
        expect(logDataJson.llm_parameters.model).toBe(model.model_name);

        expect(logDataJson.llm_output_text).toBeDefined();
        expect(logDataJson.llm_output_text).toContain(mockResponse);
      }
    }, 120000);
  });
});
