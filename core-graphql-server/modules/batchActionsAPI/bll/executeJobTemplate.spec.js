let serviceContext = require('../../../test/serviceContext.mock.js')();

describe('executeJobTemplate mutator', function () {
  serviceContext.messageUtil = require('../../../test/messageUtil.mock.js')(
    serviceContext
  );
  let messageUtil = serviceContext.messageUtil;
  let dbCore = serviceContext.dbConnections['core'];

  serviceContext.dal.batchProcessRedis = require('./../dal/batchProcessRedis')(
    serviceContext
  );
  serviceContext.bll.dagTemplate = require('../../../bll/dagTemplate')(
    serviceContext
  );
  serviceContext.dal.dagTemplate = require('../../../modules/v3DataModel/dal/dagTemplate')(
    serviceContext
  );
  serviceContext.dal.tdoBatch = require('./../dal/tdoBatch')(serviceContext);
  serviceContext.dal.tdoBatch.updateBatchProcess = jest.fn(() => {
    return {
      id: 'bp_id_123',
      batchId: 'b_id_456',
      status: 'pending',
      concurrency: 10,
      itemsCompleted: 0,
      itemsFailed: 0,
      itemsTotal: 2,
      itemsRunning: 0,
      itemsPending: 2
    };
  });

  const attributes = {
    redisCache: {
      set: jest.fn(
        JSON.stringify({
          batchProcessId: 'bp_id_123',
          jobsRunning: 0,
          concurrency: 10
        })
      ),
      get: jest.fn()
    },
    requestContext: {
      userInfo: {
        userId: '1234',
        organization: {
          organizationId: 7642,
          organizationGuid: 'd935b417-6e3a-435f-9d29-713567a4cf4e'
        }
      }
    },
    _authInfo: {
      json: {
        rights: ['job:create', 'job:read', 'job:update', 'job:delete']
      }
    }
  };

  serviceContext = { ...serviceContext, ...attributes };

  let executeJobTemplate = require('./executeJobTemplate')(serviceContext);

  it('trigger mutator without valid organization', async () => {
    const serviceContextOne = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 7642
          }
        }
      }
    };
    const serviceContextTwo = {
      requestContext: {
        tokenInfo: {
          organization: {
            organizationId: 7642
          }
        }
      }
    };
    const serviceContextThree = {
      requestContext: {
        _authInfo: {
          organization: {
            organizationId: 7642
          }
        }
      }
    };
    const serviceContextList = [
      serviceContextOne,
      serviceContextTwo,
      serviceContextThree
    ];

    for (const serviceContext of serviceContextList) {
      try {
        const result = await executeJobTemplate.exec(
          serviceContext,
          { orgId: '999' }, //invalid org
          {
            input: {}
          }
        );
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(`user does not belong to the organization`);
      }
    }
  });

  it('trigger mutator with a user without rights', async () => {
    const serviceContext = {
      _authInfo: {
        json: {
          rights: ['invalid:rights']
        }
      },
      requestContext: {
        _authInfo: {
          organization: {
            organizationId: 7642
          }
        }
      }
    };

    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        { orgId: '7642' }, //valid org
        {
          input: {}
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('not_allowed');
      expect(err.message).toEqual(
        `The authenticated user does not have permission to perform the operation`
      );
    }
  });

  it('trigger mutator without a processDefinition in input', async () => {
    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        { orgId: '7642' }, //valid org
        {
          input: {}
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('invalid_input');
      expect(err.message).toEqual(
        `processDefinition is a mandatory input argument`
      );
    }
  });

  it('trigger mutator without dagTemplateId into processDefinition input', async () => {
    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        { orgId: '7642' },
        {
          input: {
            processDefinition: {
              clusterId: '1287128_CLUSTER_AWS'
            }
          }
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('invalid_input');
      expect(err.message).toEqual(
        `dagTemplateId is a mandatory input argument in processDefinition`
      );
    }
  });

  it('trigger mutator without clusterId into processDefinition input', async () => {
    dbCore.write._push([
      {
        id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
        name: 'new webstream dag builder updated code',
        description: '',
        cognitiveCategoryId: null,
        mimeType: null,
        dag: {
          template:
            '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
        },
        dagTemplateLanguage: 'Handlebars',
        targetOrganizationId: '7642',
        deletedDateTime: null,
        createdDateTime: 1694194474,
        modifiedDateTime: 1694194474,
        tags: ['']
      }
    ]);
    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        { orgId: '7642' },
        {
          input: {
            processDefinition: {
              dagTemplateId: 'TEMPLATE_323232'
            }
          }
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('invalid_input');
      expect(err.message).toEqual(
        `clusterId is a mandatory input argument in processDefinition`
      );
    }
  });

  it('error creating BatchJwtToken due to missing userId in context', async () => {
    dbCore.write._push([]);

    dbCore.write._push([
      {
        batch_process_id: 'bp_id_123',
        batch_id: 'b_id_456',
        organization_id: '7642',
        status: 'pending',
        concurrency: 10,
        completed_count: 0,
        failed_count: 0,
        total_count: 2,
        running_count: 0,
        pending_count: 2
      }
    ]);

    const serviceContext = {
      _authInfo: {
        json: {
          rights: ['job:create', 'job:read']
        }
      },
      requestContext: {
        _authInfo: {
          organization: {
            organizationId: 7642
          }
        }
      }
    };

    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        {
          id: 'batch_1234',
          orgId: 7642,
          selectionCriteria: {
            tdoIds: [1234, 5678]
          }
        },
        {
          input: {
            concurrency: 10,
            processDefinition: {
              dagTemplateId: 'TEMPLATE_323232',
              clusterId: '1287128_CLUSTER_AWS'
            }
          }
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('not_allowed');
      expect(err.message).toEqual(
        `The authenticated user does not have permission to perform the operation`
      );
    }
  });

  it('a new static batch process created successfully', async () => {
    dbCore.write._clearResultQueue();
    dbCore.write._push([
      {
        id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
        name: 'new webstream dag builder updated code',
        description: '',
        cognitiveCategoryId: null,
        mimeType: null,
        dag: {
          template:
            '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
        },
        dagTemplateLanguage: 'Handlebars',
        targetOrganizationId: '7642',
        deletedDateTime: null,
        createdDateTime: 1694194474,
        modifiedDateTime: 1694194474,
        tags: ['']
      }
    ]);

    dbCore.write._push([
      {
        id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272',
        organizationId: 7642,
        name: 'STAGE cluster for testing',
        allowedEngines: ['all']
      }
    ]);

    dbCore.write._push([]);

    dbCore.write._push([
      {
        batch_process_id: 'bp_id_123',
        batch_id: 'b_id_456',
        organization_id: '7642',
        status: 'pending',
        concurrency: 10,
        completed_count: 0,
        failed_count: 0,
        total_count: 2,
        running_count: 0,
        pending_count: 2
      }
    ]);

    const result = await executeJobTemplate.exec(
      serviceContext,
      {
        id: 'batch_1234',
        orgId: 7642,
        selectionCriteria: {
          tdoIds: [1234, 5678]
        }
      },
      {
        input: {
          concurrency: 10,
          processDefinition: {
            dagTemplateId: 'TEMPLATE_323232',
            clusterId: '1287128_CLUSTER_AWS'
          }
        }
      }
    );

    const eventEmitted = messageUtil._messages();
    expect(result.id).toEqual('bp_id_123');
    expect(result.batchId).toEqual('b_id_456');
    expect(result.status).toEqual('pending');
    expect(result.concurrency).toEqual(10);
    expect(result.itemsCompleted).toEqual(0);
    expect(result.itemsFailed).toEqual(0);
    expect(result.itemsTotal).toEqual(2);
    expect(result.itemsRunning).toEqual(0);
    expect(result.itemsPending).toEqual(2);
    expect(result.details.batchId).toEqual('b_id_456');
    expect(eventEmitted.length).toEqual(1);
    expect(eventEmitted[0].event).toEqual('TDOBatchJobProcessCreated');
    expect(eventEmitted[0].type).toEqual('batch');
    expect(eventEmitted[0].serviceName).toEqual('core-graphql-server');
    expect(eventEmitted[0].batchProcessId).toEqual('bp_id_123');
  });

  it('a new dynamic batch process created successfully', async () => {
    messageUtil._clearCounter();
    dbCore.write._clearResultQueue();
    dbCore.write._push([
      {
        id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
        name: 'new webstream dag builder updated code',
        description: '',
        cognitiveCategoryId: null,
        mimeType: null,
        dag: {
          template:
            '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
        },
        dagTemplateLanguage: 'Handlebars',
        targetOrganizationId: '7642',
        deletedDateTime: null,
        createdDateTime: 1694194474,
        modifiedDateTime: 1694194474,
        tags: ['']
      }
    ]);

    dbCore.write._push([
      {
        id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272',
        organizationId: 7642,
        name: 'STAGE cluster for testing',
        allowedEngines: ['all']
      }
    ]);

    dbCore.write._push([]);

    dbCore.write._push([
      {
        batch_process_id: 'bp_id_123',
        batch_id: 'b_id_456',
        organization_id: '7642',
        status: 'creating',
        concurrency: 10,
        completed_count: 0,
        failed_count: 0,
        total_count: 0,
        running_count: 0,
        pending_count: 0
      }
    ]);

    const result = await executeJobTemplate.exec(
      serviceContext,
      {
        id: 'batch_1234',
        orgId: 7642,
        selectionCriteria: {
          searchQuery: {}
        }
      },
      {
        input: {
          concurrency: 10,
          processDefinition: {
            dagTemplateId: 'TEMPLATE_323232',
            clusterId: '1287128_CLUSTER_AWS'
          }
        }
      }
    );

    const eventEmitted = messageUtil._messages();
    expect(result.id).toEqual('bp_id_123');
    expect(result.batchId).toEqual('b_id_456');
    expect(result.status).toEqual('creating');
    expect(result.concurrency).toEqual(10);
    expect(result.itemsCompleted).toEqual(0);
    expect(result.itemsFailed).toEqual(0);
    expect(result.itemsTotal).toEqual(0);
    expect(result.itemsRunning).toEqual(0);
    expect(result.itemsPending).toEqual(0);
    expect(result.details.batchId).toEqual('b_id_456');
    expect(eventEmitted.length).toEqual(0);
  });

  it('error rerunning a batch process with invalid status', async () => {
    const notAllowedStatuses = ['creating', 'pending', 'running', 'canceling'];

    for (const status of notAllowedStatuses) {
      dbCore.write._clearResultQueue();
      dbCore.write._push([
        {
          id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
          name: 'new webstream dag builder updated code',
          description: '',
          cognitiveCategoryId: null,
          mimeType: null,
          dag: {
            template:
              '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
          },
          dagTemplateLanguage: 'Handlebars',
          targetOrganizationId: '7642',
          deletedDateTime: null,
          createdDateTime: 1694194474,
          modifiedDateTime: 1694194474,
          tags: ['']
        }
      ]);
      dbCore.write._push([
        {
          id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272',
          organizationId: 7642,
          name: 'STAGE cluster for testing',
          allowedEngines: ['all']
        }
      ]);
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'batch_1234',
          organization_id: '7642',
          status: status,
          concurrency: 10,
          completed_count: 2,
          failed_count: 0,
          total_count: 2,
          running_count: 0,
          pending_count: 0
        }
      ]);

      try {
        const result = await executeJobTemplate.exec(
          serviceContext,
          {
            id: 'batch_1234',
            orgId: 7642,
            selectionCriteria: {
              tdoIds: [1234, 5678]
            }
          },
          {
            input: {
              concurrency: 10,
              processDefinition: {
                dagTemplateId: 'TEMPLATE_323232',
                clusterId: '1287128_CLUSTER_AWS'
              }
            }
          }
        );
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          `batchProcess need to be with status 'completed', 'canceled' or 'aborted'.
           batchProcess with id bp_id_123 has status ${status}`
        );
      }
    }
  });

  it('rerun a batch process that already exists', async () => {
    messageUtil._clearCounter();
    dbCore.write._clearResultQueue();
    dbCore.write._push([
      {
        id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
        name: 'new webstream dag builder updated code',
        description: '',
        cognitiveCategoryId: null,
        mimeType: null,
        dag: {
          template:
            '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
        },
        dagTemplateLanguage: 'Handlebars',
        targetOrganizationId: '7642',
        deletedDateTime: null,
        createdDateTime: 1694194474,
        modifiedDateTime: 1694194474,
        tags: ['']
      }
    ]);
    dbCore.write._push([
      {
        id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272',
        organizationId: 7642,
        name: 'STAGE cluster for testing',
        allowedEngines: ['all']
      }
    ]);
    dbCore.write._push([
      {
        batch_process_id: 'bp_id_123',
        batch_id: 'b_id_456',
        organization_id: '7642',
        status: 'completed',
        concurrency: 10,
        completed_count: 2,
        failed_count: 0,
        total_count: 2,
        running_count: 0,
        pending_count: 0
      }
    ]);

    const result = await executeJobTemplate.exec(
      serviceContext,
      {
        id: 'batch_1234',
        orgId: 7642,
        selectionCriteria: {
          tdoIds: [1234, 5678]
        }
      },
      {
        input: {
          concurrency: 10,
          processDefinition: {
            dagTemplateId: 'TEMPLATE_323232',
            clusterId: '1287128_CLUSTER_AWS'
          }
        }
      }
    );

    const eventEmitted = messageUtil._messages();
    expect(result.id).toEqual('bp_id_123');
    expect(result.batchId).toEqual('b_id_456');
    expect(result.status).toEqual('pending');
    expect(result.concurrency).toEqual(10);
    expect(result.itemsCompleted).toEqual(0);
    expect(result.itemsFailed).toEqual(0);
    expect(result.itemsTotal).toEqual(2);
    expect(result.itemsRunning).toEqual(0);
    expect(result.itemsPending).toEqual(2);
    expect(eventEmitted.length).toEqual(1);
    expect(eventEmitted[0].event).toEqual('TDOBatchJobProcessCreated');
    expect(eventEmitted[0].type).toEqual('batch');
    expect(eventEmitted[0].serviceName).toEqual('core-graphql-server');
    expect(eventEmitted[0].batchProcessId).toEqual('bp_id_123');
  });

  it('error creating a batch process due to dagTemplate not exists', async () => {
    dbCore.write._clearResultQueue();
    dbCore.write._push([]);
    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        {
          id: 'batch_1234',
          orgId: 7642,
          selectionCriteria: {
            tdoIds: [1234, 5678]
          }
        },
        {
          input: {
            concurrency: 10,
            processDefinition: {
              dagTemplateId: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
              clusterId: '1287128_CLUSTER_AWS'
            }
          }
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('not_found');
      expect(err.message).toEqual(`The DAG template was not found`);
    }
  });

  it('error creating a batch process due to clusterId not exists', async () => {
    dbCore.write._clearResultQueue();
    dbCore.write._push([
      {
        id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
        name: 'new webstream dag builder updated code',
        description: '',
        cognitiveCategoryId: null,
        mimeType: null,
        dag: {
          template:
            '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
        },
        dagTemplateLanguage: 'Handlebars',
        targetOrganizationId: '7642',
        deletedDateTime: null,
        createdDateTime: 1694194474,
        modifiedDateTime: 1694194474,
        tags: ['']
      }
    ]);
    dbCore.write._push([]);
    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        {
          id: 'batch_1234',
          orgId: 7642,
          selectionCriteria: {
            tdoIds: [1234, 5678]
          }
        },
        {
          input: {
            concurrency: 10,
            processDefinition: {
              dagTemplateId: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
              clusterId: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272'
            }
          }
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('not_found');
      expect(err.message).toEqual(`The cluster was not found`);
    }
  });

  it('error creating a batch process due to dagTemplate belongs to a different organization from that of the super admin user.', async () => {
    dbCore.write._clearResultQueue();
    dbCore.write._push([
      {
        id: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
        name: 'new webstream dag builder updated code',
        description: '',
        cognitiveCategoryId: null,
        mimeType: null,
        dag: {
          template:
            '{"clusterId":"{{{CLUSTER_ID}}}","tasks":[{"engineId":"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255","ioFolders":[{"referenceId":"0_0 OUTPUT","mode":"stream","type":"output"}],"executionPreferences":{"parentCompleteBeforeStarting":null},"payload":{"mode":"ingest","sourceId":"{{{SOURCE_ID}}}","url":"{{{UPLOAD_URL}}}"}},{"engineId":"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440","ioFolders":[{"referenceId":"1_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"1_0 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"ffmpegTemplate":"audio"}},{"engineId":"352556c7-de07-4d55-b33f-74b1cf237f25","ioFolders":[{"referenceId":"1_1 INPUT","mode":"stream","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}},{"engineId":"e97d1564-39ff-4016-a034-e1f32aa9eb7d","ioFolders":[{"referenceId":"2_0 OUTPUT","mode":"chunk","type":"output"},{"referenceId":"2_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true},"payload":{"keywords":null,"advancedPunctuation":"true","diarization":null,"speakerChangeSensitivity":"0.4","entitiesRecognition":"false"}},{"engineId":"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3","ioFolders":[{"referenceId":"3_0 INPUT","mode":"chunk","type":"input"}],"executionPreferences":{"parentCompleteBeforeStarting":true}}],"routes":[{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_0 INPUT"},{"parentIoFolderReferenceId":"0_0 OUTPUT","childIoFolderReferenceId":"1_1 INPUT"},{"parentIoFolderReferenceId":"1_0 OUTPUT","childIoFolderReferenceId":"2_0 INPUT"},{"parentIoFolderReferenceId":"2_0 OUTPUT","childIoFolderReferenceId":"3_0 INPUT"}]}'
        },
        dagTemplateLanguage: 'Handlebars',
        targetOrganizationId: '7788',
        deletedDateTime: null,
        createdDateTime: 1694194474,
        modifiedDateTime: 1694194474,
        tags: ['']
      }
    ]);
    const serviceContext = {
      _authInfo: {
        json: {
          rights: ['superadmin'],
          internal: true
        },
        tokenId: '123'
      },
      requestContext: {
        _authInfo: {
          organization: {
            organizationId: 7642
          }
        }
      }
    };
    try {
      const result = await executeJobTemplate.exec(
        serviceContext,
        {
          id: 'batch_1234',
          orgId: 7642,
          selectionCriteria: {
            tdoIds: [1234, 5678]
          }
        },
        {
          input: {
            concurrency: 10,
            processDefinition: {
              dagTemplateId: '008bf9ec-33c7-4b26-b838-26b6e3ab00ca',
              clusterId: '1287128_CLUSTER_AWS'
            }
          }
        }
      );
      expect(result).toBeUndefined();
    } catch (err) {
      expect(err.name).toEqual('invalid_input');
      expect(err.message).toEqual(
        `dagTemplate does not belong to the organization`
      );
    }
  });
});
