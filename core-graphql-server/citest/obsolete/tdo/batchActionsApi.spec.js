const _ = require('lodash');
const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const { safe } = require('../helpers/cleanup/utils');
const config = helpers.config;
const util = require('../../util.js')();

let batchCreated;
let orgId;
const startTime = new Date().toISOString();
async function getGraphqlClient() {
  const env = config.env;
  const gqlClient = new GraphqlClient(env);
  const result = await gqlClient.connect();
  expect(result.apiToken).toBeDefined();
  expect(
    result.token,
    `result=${JSON.stringify(result, null, 2)}`
  ).toBeDefined();
  orgId = result.organizationId.toString();
  return gqlClient;
}
const citestMarker = global.citestMarker || 'citest-should-delete';

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

// This citest only works on an environment that enables enableBatchActionsAPI feature flag

describeif(global.enableBatchActionsAPI, 'citest_tdo: batch actions', () => {
  let tdoList = [];
  let dagTemplate;
  let cluster;
  let gqlClient;

  beforeAll(async () => {
    gqlClient = await getGraphqlClient();

    // get some tdos to be used as members of a new batch
    tdoList = await createTdos(gqlClient);
    dagTemplate = await createDagTemplate(gqlClient);
    cluster = await createCluster(gqlClient);
  });

  afterAll(async () => {
    // Cancel batch
    if (batchCreated) {
      await safe(`cancel batch ${batchCreated.id}`, async () => {
        const query = `
        mutation {
          cancelTDOBatchProcess (id: "${batchCreated.id}") {
            id
            status
            details
          }
        }
        `;
        const result = await gqlClient.query(query);
        expect(result.cancelTDOBatchProcess.id).toContain(batchCreated.id);
      });
    }

    // Delete DAG template
    if (dagTemplate) {
      await safe(`delete DAG template ${dagTemplate.id}`, async () => {
        await deleteDagTemplate(gqlClient, dagTemplate.id);
      });
    }

    // Delete cluster
    if (cluster) {
      await safe(`delete cluster ${cluster.id}`, async () => {
        await deleteCluster(gqlClient, cluster.id);
      });
    }

    // Delete TDOs
    if (tdoList.length) {
      await safe('delete TDOs', async () => {
        await deleteTdos(gqlClient, tdoList);
      });
    }
  });

  describe('#batch', function () {
    let dynamicBatchId;
    it('create a new batch with static tdo list and triggering a executeJobTemplate mutator', async () => {
      // creating a new batch
      const queryToCreate = `
       mutation createTDOBatch {
        createTDOBatch(input: {
          name: "${citestMarker} my new ci test batch"
          batchSelector: { 
              tdoIds: [
                  ${tdoList}
              ]
          }
          orgId: "${orgId}"
          createdBy: "rootUser"
        }) {
          id
          selectionCriteria
          isMutable
          temporalDataObjects(offset: 0, limit: 1){
              records{
               id
               name
              }
              count
              offset
              limit
          }
          temporalDataObjectsIds(offset: 0, limit: 2){
              records
              count
              offset
              limit
          }
          executeJobTemplate(input: {
            concurrency: 100
            processDefinition: {    
                dagTemplateId: "${dagTemplate.id}",
                clusterId: "${cluster.id}"
            }
          }){
              id
              status
              concurrency
              itemsCompleted
              itemsFailed
              itemsTotal
              itemsRunning
              itemsPending
              details
           }
        }
      }
      `;

      const result = await gqlClient.query(queryToCreate);
      batchCreated = _.get(result, 'createTDOBatch');
      expect(batchCreated).toBeDefined();
      expect(batchCreated.id).toBeDefined();
      expect(batchCreated.isMutable).toEqual(false);
      expect(batchCreated.selectionCriteria.tdoIds.length).toEqual(
        tdoList.length
      );
      expect(batchCreated.temporalDataObjects.records.length).toEqual(1);
      expect(batchCreated.temporalDataObjects.records[0].id).toBeDefined();
      expect(batchCreated.temporalDataObjects.records[0].name).toBeDefined();
      expect(batchCreated.temporalDataObjects.count).toEqual(1);
      expect(batchCreated.temporalDataObjects.limit).toEqual(1);
      expect(batchCreated.temporalDataObjects.offset).toEqual(0);
      expect(batchCreated.temporalDataObjectsIds.records.length).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.count).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.limit).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.offset).toEqual(0);
      expect(batchCreated.executeJobTemplate.id).toBeDefined();
      expect(batchCreated.executeJobTemplate.status).toEqual('pending');
      expect(batchCreated.executeJobTemplate.concurrency).toEqual(100);
      expect(batchCreated.executeJobTemplate.itemsCompleted).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsFailed).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsTotal).toEqual(
        tdoList.length
      );
      expect(batchCreated.executeJobTemplate.itemsRunning).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsPending).toEqual(
        tdoList.length
      );
      expect(batchCreated.executeJobTemplate.details.batchId).toEqual(
        batchCreated.id
      );
    });

    it('get the new batch with static tdo list', async () => {
      // getting the new batch
      const queryToGetBatch = `
       query TDOBatch {
        TDOBatch(id: "${batchCreated.id}") {
          id
          selectionCriteria
          isMutable
          temporalDataObjects(limit: 1){
              records{
               id
               name
              }
              count
              offset
              limit
          }
          temporalDataObjectsIds(limit: 2){
              records
              count
              offset
              limit
          }
        }
      }
      `;

      const batchFound = await gqlClient.query(queryToGetBatch);
      const tdoBatch = _.get(batchFound, 'TDOBatch');
      expect(tdoBatch).toBeDefined();
      expect(tdoBatch.id).toEqual(batchCreated.id);
      expect(tdoBatch.selectionCriteria.tdoIds.length).toEqual(tdoList.length);
      expect(tdoBatch.isMutable).toEqual(false);
      expect(tdoBatch.temporalDataObjects.records.length).toEqual(1);
      expect(tdoBatch.temporalDataObjects.records[0].id).toBeDefined();
      expect(tdoBatch.temporalDataObjects.records[0].name).toBeDefined();
      expect(tdoBatch.temporalDataObjects.count).toEqual(1);
      expect(tdoBatch.temporalDataObjects.limit).toEqual(1);
      expect(tdoBatch.temporalDataObjects.offset).toEqual(0);
      expect(tdoBatch.temporalDataObjectsIds.records.length).toEqual(2);
      expect(tdoBatch.temporalDataObjectsIds.count).toEqual(2);
      expect(tdoBatch.temporalDataObjectsIds.limit).toEqual(2);
      expect(tdoBatch.temporalDataObjectsIds.offset).toEqual(0);
    });

    it('creating a batch with dynamic tdo list and triggering a executeJobTemplate mutator', async () => {
      const query = queryToCreateADynamicBatchProcess(
        tdoList,
        dagTemplate,
        cluster
      );

      const result = await gqlClient.query(query);
      const batchCreated = _.get(result, 'createTDOBatch');
      expect(batchCreated).toBeDefined();
      expect(batchCreated.id).toBeDefined();
      expect(batchCreated.isMutable).toEqual(true);
      expect(batchCreated.selectionCriteria.searchQuery).toBeDefined();
      expect(batchCreated.temporalDataObjects.records.length).toEqual(0);
      expect(batchCreated.temporalDataObjects.count).toEqual(0);
      expect(batchCreated.temporalDataObjects.limit).toEqual(1);
      expect(batchCreated.temporalDataObjects.offset).toEqual(0);
      expect(batchCreated.temporalDataObjectsIds.records.length).toEqual(0);
      expect(batchCreated.temporalDataObjectsIds.count).toEqual(0);
      expect(batchCreated.temporalDataObjectsIds.limit).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.offset).toEqual(0);
      expect(batchCreated.executeJobTemplate.id).toBeDefined();
      expect(batchCreated.executeJobTemplate.status).toEqual('creating');
      expect(batchCreated.executeJobTemplate.concurrency).toEqual(100);
      expect(batchCreated.executeJobTemplate.itemsCompleted).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsFailed).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsTotal).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsRunning).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsPending).toEqual(0);
      expect(batchCreated.executeJobTemplate.details.batchId).toEqual(
        batchCreated.id
      );
      dynamicBatchId = batchCreated.id;
    });

    it('cancel batch', async () => {
      const query = `
      mutation {
        cancelTDOBatchProcess (id: "${dynamicBatchId}") {
          id
          status
          details
        }
      }
      `;
      try {
        const result = await gqlClient.query(query);
        expect(result.cancelTDOBatchProcess.id).toEqual(dynamicBatchId);
      } catch (error) {
        expect(`${error}`).toContain(`not_found`);
      }
    });
  });

  describe('#batch actions', function () {
    it('get the new batch process', async () => {
      // getting the batch process triggered with the batch creation at the first tests of this suit
      // its status at some point could be 'pending', 'inProgress' or 'completed'.
      let batchProcess;
      let status;
      const availableStatus = [
        'canceling',
        'canceled',
        'creating',
        'pending',
        'running',
        'completed',
        'failed',
        'aborted'
      ];
      for (let i = 0; i < availableStatus.length; i++) {
        await util.sleep(500);

        status = availableStatus[i];
        const query = queryToGetBatchProcess(
          batchCreated.executeJobTemplate.id,
          status
        );

        const batchProcessFound = await gqlClient.query(query);
        const tdoBatchProcess = _.get(batchProcessFound, 'TDOBatchProcesses');
        if (tdoBatchProcess.length > 0) {
          batchProcess = tdoBatchProcess[0];
          break;
        }
      }

      expect(batchProcess.id).toBeDefined();
      expect(batchProcess.concurrency).toEqual(100);
      if (batchProcess.status === 'pending') {
        expect(batchProcess.itemsPending).toEqual(tdoList.length);
        expect(batchProcess.itemsTotal).toEqual(tdoList.length);
      }

      if (batchProcess.status === 'running') {
        expect(batchProcess.itemsTotal).toEqual(tdoList.length);
      }

      if (batchProcess.status === 'completed') {
        expect(batchProcess.itemsCompleted + batchProcess.itemsFailed).toEqual(
          tdoList.length
        );
        expect(batchProcess.itemsTotal).toEqual(tdoList.length);
      }
      expect(batchProcess.details.batchId).toEqual(batchCreated.id);
      expect(batchProcess.TDOBatch.id).toEqual(batchCreated.id);
      expect(batchProcess.TDOBatch.isMutable).toEqual(false);
      expect(batchProcess.TDOBatch.selectionCriteria.tdoIds.length).toEqual(
        tdoList.length
      );
      expect(batchProcess.TDOBatch.temporalDataObjects.records.length).toEqual(
        1
      );
      expect(
        batchProcess.TDOBatch.temporalDataObjects.records[0].id
      ).toBeDefined();
      expect(
        batchProcess.TDOBatch.temporalDataObjects.records[0].name
      ).toBeDefined();
      expect(batchProcess.TDOBatch.temporalDataObjects.count).toEqual(1);
      expect(batchProcess.TDOBatch.temporalDataObjects.limit).toEqual(1);
      expect(batchProcess.TDOBatch.temporalDataObjects.offset).toEqual(0);
      expect(
        batchProcess.TDOBatch.temporalDataObjectsIds.records.length
      ).toEqual(2);
      expect(batchProcess.TDOBatch.temporalDataObjectsIds.count).toEqual(2);
      expect(batchProcess.TDOBatch.temporalDataObjectsIds.limit).toEqual(2);
      expect(batchProcess.TDOBatch.temporalDataObjectsIds.offset).toEqual(0);
    });
  });
});

function queryToGetBatchProcess(id, status) {
  return `query TDOBatchProcesses {
          TDOBatchProcesses(input: {
            id: "${id}"
            status: ${status}
            orderBy: {
                field:dateCreated
                direction: desc
            }
            dateTimeFilter: {
                field: dateCreated,
                fromDateTime: "${startTime}"
                toDateTime: "${new Date().toISOString()}"
            }
            limit: 2
            offset: 0
          })
          {
              id
              status
              details
              concurrency
              itemsCompleted
              itemsFailed
              itemsTotal
              itemsRunning
              itemsPending
              TDOBatch{
                id
                isMutable
                selectionCriteria
                temporalDataObjects(limit: 1){
                    records{
                    id
                    name
                    }
                    count
                    offset
                    limit
                }
                temporalDataObjectsIds(limit: 2){
                    records
                    count
                    offset
                    limit
                }
              }
              actions(offset:0, limit:2, status: failed){
                  records{
                      targetId
                      actionId
                      status
                      details
                      job{
                          id
                          name
                          status
                      }
                      temporalDataObject{
                          id
                          organizationId
                          name
                          status
                      }
                  }
                  offset
                  limit
                  count
                }
          }
        }
              `;
}

function queryToCreateADynamicBatchProcess(tdoList, dagTemplate, cluster) {
  const conditionAsString = tdoList
    .map((tdo) => {
      return `{
      field: "recordingId",
      operator: "query_string",
      value: "${tdo}"
    }`;
    })
    .join(',');

  return `
        mutation createTDOBatch {
          createTDOBatch(input: {
            name: "${citestMarker} my new dynamic batch"
            batchSelector: { 
                searchQuery: {
                    index: ["mine"],
                    limit: 500,
                    offset: 0, 
                    query: {
                        operator: "or",
                        conditions: [
                          ${conditionAsString}
                        ]
                    },
                    sort: [
                        {
                            field: "recordingId",
                            order: "desc"
                        }
                    ]
                }
            } 
            orgId: "${orgId}"
            createdBy: "rootUser"
          }) {
            id
            selectionCriteria
            isMutable
            temporalDataObjects(limit: 1){
                records{
                 id
                 name
                }
                count
                offset
                limit
            }
            temporalDataObjectsIds(limit: 2){
                records
                count
                offset
                limit
            }
            executeJobTemplate(input: {
            concurrency: 100
            processDefinition: {    
                dagTemplateId: "${dagTemplate.id}",
                clusterId: "${cluster.id}"
            }
            }){
                id
                status
                concurrency
                itemsCompleted
                itemsFailed
                itemsTotal
                itemsRunning
                itemsPending
                details
             }
          }
        }
      `;
}

async function createCluster(gqlClient) {
  const testName = citestMarker + '_engine_' + Date.now();
  const query = `mutation {
      createCluster(input: {
        name: "${testName}_cluster"
        allowedEngines: []
        dockerCredentials: {}
        organizationId: "${orgId}"
      }) {
        id
        edgeVersion
      }
    }`;

  const cluster = await gqlClient.query(query);
  const clusterCreated = _.get(cluster, 'createCluster');
  expect(clusterCreated).toBeDefined();
  expect(clusterCreated.id).toBeDefined();
  return clusterCreated;
}

async function deleteCluster(gqlClient, clusterId) {
  const query = `mutation {
      deleteCluster(id: "${clusterId}") {
        id
        message
      }
    }`;
  const cluster = await gqlClient.query(query);
  const clusterDeleted = _.get(cluster, 'deleteCluster');
  expect(clusterDeleted).toBeDefined();
  expect(clusterDeleted.id).toEqual(clusterId);
  return clusterDeleted;
}

async function createDagTemplate(gqlClient) {
  const queryDagTemplate = `
    mutation createDagTemplate{
      createDagTemplate(input:{
      targetOrganizationId:"${orgId}"
      name:"${citestMarker} Webstream Speechmatics Reprocess Template"
      description:"English Transcription"
      tags:[
        "transcription"
      ]
      dagTemplateLanguage:"Handlebars"
      dag: "{\\"targetId\\": \\"{{{TARGET_ID}}}\\",\\n\\"clusterId\\":\\"rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272\\",\\"tasks\\":[{\\"engineId\\":\\"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255\\",\\"ioFolders\\":[{\\"referenceId\\":\\"0_0 OUTPUT\\",\\"mode\\":\\"stream\\",\\"type\\":\\"output\\"}],\\"executionPreferences\\":{\\"parentCompleteBeforeStarting\\":null}},{\\"engineId\\":\\"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440\\",\\"ioFolders\\":[{\\"referenceId\\":\\"1_0 OUTPUT\\",\\"mode\\":\\"chunk\\",\\"type\\":\\"output\\"},{\\"referenceId\\":\\"1_0 INPUT\\",\\"mode\\":\\"stream\\",\\"type\\":\\"input\\"}],\\"executionPreferences\\":{\\"parentCompleteBeforeStarting\\":true},\\"payload\\":{\\"ffmpegTemplate\\":\\"audio\\"}},{\\"engineId\\":\\"352556c7-de07-4d55-b33f-74b1cf237f25\\",\\"ioFolders\\":[{\\"referenceId\\":\\"1_1 INPUT\\",\\"mode\\":\\"stream\\",\\"type\\":\\"input\\"}],\\"executionPreferences\\":{\\"parentCompleteBeforeStarting\\":true}},{\\"engineId\\":\\"bbb11671-e21e-4e0f-a790-2ef1841ee554\\",\\"ioFolders\\":[{\\"referenceId\\":\\"2_0 OUTPUT\\",\\"mode\\":\\"chunk\\",\\"type\\":\\"output\\"},{\\"referenceId\\":\\"2_0 INPUT\\",\\"mode\\":\\"chunk\\",\\"type\\":\\"input\\"}],\\"executionPreferences\\":{\\"parentCompleteBeforeStarting\\":true},\\"payload\\":{\\"keywords\\":null,\\"advancedPunctuation\\":\\"true\\",\\"diarization\\":null,\\"speakerChangeSensitivity\\":\\"0.4\\",\\"entitiesRecognition\\":\\"false\\"}},{\\"engineId\\":\\"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3\\",\\"ioFolders\\":[{\\"referenceId\\":\\"3_0 INPUT\\",\\"mode\\":\\"chunk\\",\\"type\\":\\"input\\"}],\\"executionPreferences\\":{\\"parentCompleteBeforeStarting\\":true}}],\\"routes\\":[{\\"parentIoFolderReferenceId\\":\\"0_0 OUTPUT\\",\\"childIoFolderReferenceId\\":\\"1_0 INPUT\\"},{\\"parentIoFolderReferenceId\\":\\"0_0 OUTPUT\\",\\"childIoFolderReferenceId\\":\\"1_1 INPUT\\"},{\\"parentIoFolderReferenceId\\":\\"1_0 OUTPUT\\",\\"childIoFolderReferenceId\\":\\"2_0 INPUT\\"},{\\"parentIoFolderReferenceId\\":\\"2_0 OUTPUT\\",\\"childIoFolderReferenceId\\":\\"3_0 INPUT\\"}]}"
      }){
        id
        cognitiveCategoryId
        targetOrganizationId
       }
    }`;
  const dagResult = await gqlClient.query(queryDagTemplate);
  const dagCreated = _.get(dagResult, 'createDagTemplate');
  expect(dagCreated).toBeDefined();
  expect(dagCreated.id).toBeDefined();
  expect(dagCreated.targetOrganizationId).toEqual(orgId);
  return dagCreated;
}

async function deleteDagTemplate(gqlClient, dagTemplateId) {
  const queryDagTemplate = `mutation {
      deleteDagTemplate(id: "${dagTemplateId}") {
        id
        message
      }
    }`;
  const dagResult = await gqlClient.query(queryDagTemplate);
  const dagDeleted = _.get(dagResult, 'deleteDagTemplate');
  expect(dagDeleted).toBeDefined();
  expect(dagDeleted.id).toEqual(dagTemplateId);
  expect(dagDeleted.message).toEqual('DAG Template deleted');
}

async function createTdos(gqlClient) {
  const queryTdos = `
      mutation createTDO {
      tdo1: createTDO(
        input: {
          status: "uploaded"
          startDateTime: 1682050619
          stopDateTime: 1682052419
          addToIndex: true
          isPublic: true
          contentTemplates: [
            {
              schemaId: "f4e3bb04-f84d-45ad-a088-5942f731eda2"
              data: { name: "test-0205-dev", userId: "19592130" }
            }
          ]
        }
      ) {
        id
        startDateTime
        stopDateTime
        isPublic
      }
      tdo2: createTDO(
        input: {
          status: "uploaded"
          startDateTime: 1682050619
          stopDateTime: 1682052419
          addToIndex: true
          isPublic: true
          contentTemplates: [
            {
              schemaId: "f4e3bb04-f84d-45ad-a088-5942f731eda2"
              data: { name: "test-0205-dev", userId: "19592130" }
            }
          ]
        }
      ) {
        id
        startDateTime
        stopDateTime
        isPublic
      }
      tdo3: createTDO(
        input: {
          status: "uploaded"
          startDateTime: 1682050619
          stopDateTime: 1682052419
          addToIndex: true
          isPublic: true
          contentTemplates: [
            {
              schemaId: "f4e3bb04-f84d-45ad-a088-5942f731eda2"
              data: { name: "test-0205-dev", userId: "19592130" }
            }
          ]
        }
      ) {
        id
        startDateTime
        stopDateTime
        isPublic
      }
      tdo4: createTDO(
        input: {
          status: "uploaded"
          startDateTime: 1682050619
          stopDateTime: 1682052419
          addToIndex: true
          isPublic: true
          contentTemplates: [
            {
              schemaId: "f4e3bb04-f84d-45ad-a088-5942f731eda2"
              data: { name: "test-0205-dev", userId: "19592130" }
            }
          ]
        }
      ) {
        id
        startDateTime
        stopDateTime
        isPublic
      }
    }
  `;
  const tdoResult = await gqlClient.query(queryTdos);
  let tdoList = [];
  for (let key in tdoResult) {
    if (tdoResult[key] && tdoResult[key].id) {
      tdoList.push(tdoResult[key].id);
    }
  }
  expect(tdoList.length).toEqual(4);
  return tdoList;
}

async function deleteTdos(gqlClient, tdoList) {
  let queryList = [];
  for (let i = 0; i < tdoList.length; i++) {
    const query = `
      ${'tdo' + tdoList[i]}: deleteTDO(
        id: "${tdoList[i]}") {
        id
        message
      }
    `;
    queryList.push(query);
  }
  const queries = queryList.join('\n');
  const mutation = `
    mutation {${queries}}
  `;
  const tdoResult = await gqlClient.query(mutation);
  expect(tdoResult).toBeDefined();
}
