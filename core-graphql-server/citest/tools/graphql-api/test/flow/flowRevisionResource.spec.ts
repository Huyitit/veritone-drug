import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';

const runtime =
  '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}';

const describeif = (condition: boolean, name: string, fn: () => void): void =>
  condition ? describe(name, fn) : describe.skip(name, fn);

const isResourceTestEnabled = !!(
  config.apiAIDataOrgToken && config.apiInternalOrgLessToken
);

describeif(
  isResourceTestEnabled,
  'citest_flow: Flow revision resource test using internal orgless token and ai data token',
  () => {
    let aiDataOrgClient: GraphqlClient;
    let orglessClient: GraphqlClient;

    let flowId: string;
    let flowRevisionId: string;
    let newDescription: string;

    beforeAll(async () => {
      const env = config.env;
      aiDataOrgClient = await createGraphqlClient(AuthType.API_KEY, env);
      orglessClient = await createGraphqlClient(
        AuthType.ORGLESS_API_KEY,
        env
      );
    });

    it('create flow by ai data org token', async () => {
      const currentDatetime = Date.now();
      const res = await aiDataOrgClient.sdk.createFlow({
        input: {
          name: `${citestMarker} flow - ${currentDatetime}`
        }
      });

      flowId = res?.data?.createFlow?.id as string;
      expect(flowId).toBeDefined();
    });

    it('create flow revision by ai data org token', async () => {
      expect(flowId).toBeDefined();

      const res = await aiDataOrgClient.sdk.createFlowRevision({
        input: {
          flowId,
          runtime
        }
      });

      flowRevisionId = res?.data?.createFlowRevision?.flowRevisionId as string;
      expect(flowRevisionId).toBeDefined();
    });

    it('update flow revision by ai data org token', async () => {
      newDescription = `${citestMarker} update flow revision`;

      const result = await aiDataOrgClient.sdk.updateFlowRevision({
        flowRevisionId,
        description: newDescription
      });

      expect(result.data.updateFlowRevision).toBeDefined();
      expect(result.data.updateFlowRevision?.description).toEqual(
        newDescription
      );
    });

    it('Get flow revision by internal orgless token', async () => {
      const result = await orglessClient.sdk.getFlowRevision({
        id: flowRevisionId
      });

      expect(result.data.flowRevision?.flowRevisionId).toEqual(
        flowRevisionId
      );
      expect(result.data.flowRevision?.description).toEqual(newDescription);
    });

    it('delete the flow', async () => {
      const res = await aiDataOrgClient.sdk.deleteEngine({ id: flowId });
      expect(res?.data?.deleteEngine?.id).toEqual(flowId);
    });
  }
);
