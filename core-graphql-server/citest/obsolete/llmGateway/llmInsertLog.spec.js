const GraphqlClient = require('../../helpers/gql');
const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const uuid = require('uuid');
const config = helpers.config;
const _ = require('lodash');
let supertestLib = require('supertest');
const jobDb = require('../../helpers/jobDb.js');
const { safe } = require('../../helpers/cleanup/utils');

const env = config.env;
let gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';

const testOrgInput = {
  name: citestMarker + '-org-' + uuid.v4(),
  businessUnit: 'Legal',
  types: ['agency', 'broadcaster'],
  kvp: {
    features: {
      enableRBACFeature: 'enabled'
    }
  },
  apps: [
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
  ].filter((app) => app)
};

const password = 'testPassowrd';

const superAdmin = {
  option: {},
  token: '',
  orgId: ''
};

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

describe('citest_llm: insert log', () => {
  let supertest = supertestLib(localBaseUrl); // local base url
  beforeAll(async () => {
    const superAdminLogin = await userHelpers.loginUser(
      { gqlClient },
      { userName: config.userName, password: config.password }
    );
    superAdmin.token = superAdminLogin.token;
    superAdmin.option = helpers.requestOptions(superAdmin.token);
    gqlClient.userAuth = superAdmin.option;
    gqlClient.tokenAuth = helpers.requestOptions(superAdminLogin.apiToken);
    gqlClient.userToken = superAdmin.token;

    // environment check by call health check
    try {
      // test with local base url first, if failed then test with ci base url
      let localTestRes = await supertest
        .get('/health')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .expect(200);

      expect(localTestRes.body).toBeDefined();
      console.log('Local test response:', localTestRes.body);
    } catch (error) {
      supertest = supertestLib(ciBaseUrl); // local base url
      let ciTestRes = await supertest
        .get('/health')
        .set('Authorization', `Bearer sk-local`)
        .set('Content-Type', `application/json`)
        .expect(200);

      expect(ciTestRes.body).toBeDefined();
    }
  });

  describe('call /completions API and check log', () => {
    let chatResponse = null;
    let chatId = null;
    let modelIds = [];

    const model = {
      model_name: `citest-should-delete-model-${uuid.v4()}`,
      api_key: apiKey,
      model: 'gpt-4-mini',
      custom_llm_provider: 'openai'
    };

    const user = {
      option: {},
      token: '',
      orgId: ''
    };

    const testData = {
      org: {
        orgId: '',
        adminId: '',
        adminName: '',
        adminOption: {}
      }
    };

    beforeAll(async () => {
      const features = {
        enableRBACFeature: 'enabled'
      };
      // create org
      const newOrg = await orgHelpers.orgSetup(
        citestMarker,
        { gqlClient },
        { ...testOrgInput, kvp: features },
        true
      );

      expect(newOrg.id).toBeDefined();
      testData.org.orgId = newOrg.id;

      // create admin user
      const newUser = await userHelpers.createUser(
        { gqlClient },
        {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          orgId: newOrg.id,
          rolesIds: roleIds
        }
      );
      expect(newUser.id).toBeDefined();
      testData.org.adminId = newUser.id;
      testData.org.adminName = newUser.name;

      // login user
      const loginRes = await userHelpers.loginUser(
        { gqlClient },
        { userName: newUser.name, password }
      );
      expect(loginRes.token).toBeDefined();
      testData.org.adminOption = helpers.requestOptions(loginRes.token);
      user.option = testData.org.adminOption;
      user.token = loginRes.token;
      user.orgId = newOrg.id;
    });

    afterAll(async () => {
      // delete model
      if (modelIds.length > 0) {
        const promiseArray = modelIds.map((modelId) =>
          safe('deleteModel', async () =>
            supertest
              .post(`/model/delete`)
              .set('Authorization', `Bearer sk-local`)
              .set('Content-Type', `application/json`)
              .set('x-aiware-api-token', user.token)
              .send({ id: modelId })
          )
        );

        await Promise.all(promiseArray);
      }

      // delete user
      if (user.orgId && testData.org.adminId) {
        await safe('deleteUser', async () =>
          userHelpers.deleteUser(
            { gqlClient, options: superAdmin.option },
            testData.org.adminId
          )
        );
      }

      // delete org
      if (testData.org.orgId) {
        await safe('deleteOrg', async () =>
          orgHelpers.updateOrganization(
            { gqlClient, options: superAdmin.option },
            { id: testData.org.orgId, status: 'deleted' }
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
        (m) => m.model_name === model.model_name
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
      let dbValue;

      for (let i = 0; i < 5; i++) {
        try {
          dbValue = await jobDb.getLlmGatewayLogBuffer(chatId);
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
