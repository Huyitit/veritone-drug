const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');

let flowId, flowRevisionId;
const env = config.env;
const gqlClient = new GraphqlClient(env);
let newName;
const citestMarker = global.citestMarker || 'citest-should-delete';
(gqlClient.isEnableResourceTest() ? describe : describe.skip)(
  'citest_flow: Flow revision resource test using internal orgless token and ai data token',
  () => {
    it('create flow by ai data org token', async () => {
      const currentDatetime = Date.now();
      const query = `
      mutation{
        createFlow(input:{
          name:"${citestMarker} flow - ${currentDatetime}"
        }){
          id
        }
      }`;

      // use ai data org token
      const result = await gqlClient.queryByAIDataOrgToken(query);
      flowId = _.get(result, 'createFlow.id');
      expect(flowId).toBeDefined();
    });

    it('create flow revision by ai data org token', async () => {
      expect(flowId).toBeDefined();
      const runtime = JSON.stringify(
        '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
      );
      const query = `
      mutation createFlowRevision {
        createFlowRevision(input:{
          flowId: "${flowId}",
          runtime: ${runtime}
        }){
          flowRevisionId
        }
      }`;

      // use ai data org token
      const result = await gqlClient.queryByAIDataOrgToken(query);
      flowRevisionId = _.get(result, 'createFlowRevision.flowRevisionId');
      expect(flowRevisionId).toBeDefined();
    });

    it('update flow revision by ai data org token', async () => {
      newName = citestMarker + ' update flow revision';
      const query = `mutation{
        updateFlowRevision(input:{
          flowRevisionId:"${flowRevisionId}"
          description:"${newName}"
        }){
          description
        }
      }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);

      expect(result.updateFlowRevision).toBeDefined();
      expect(result.updateFlowRevision.description).toEqual(newName);
    });

    it('Get flow revision by internal orgless token', async () => {
      const query = `query {
        flowRevision(id: "${flowRevisionId}"){
          flowRevisionId
          description
        }
      }`;
      const result = await gqlClient.queryByInternalOrglessToken(query);

      expect(result.flowRevision.flowRevisionId).toEqual(flowRevisionId);
      expect(result.flowRevision.description).toEqual(newName);
    });

    it('delete the flow', async () => {
      const query = `
      mutation{
        deleteEngine(
          id:"${flowId}"
        ){
          id
        }
      }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);
      expect(_.get(result, 'deleteEngine.id')).toEqual(flowId);
    });
  }
);
