const _ = require('lodash');
let serviceContext = require('../../../test/serviceContext.mock.js')();

describe('batch actions', function () {
  serviceContext.messageUtil = require('../../../test/messageUtil.mock.js')(
    serviceContext
  );
  let messageUtil = serviceContext.messageUtil;
  let dbCore = serviceContext.dbConnections['core'];

  serviceContext.dal.batchProcessRedis = require('./../dal/batchProcessRedis')(
    serviceContext
  );
  serviceContext.dal.tdoBatch = require('./../dal/tdoBatch')(serviceContext);

  serviceContext.dal.job.getJobs = jest.fn(() => {
    return {
      records: [
        {
          targetId: 'tdo_123',
          jobId: 'job_123',
          status: 'complete',
          name: `it's a job`,
          description: 'a mock description',
          clusterId: '13234-Q4Q3WWD',
          jobConfig: {}
        }
      ]
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
      organization: {
        organizationId: 7642
      },
      json: {
        rights: ['job:create', 'job:read', 'job:update', 'job:delete']
      }
    }
  };

  serviceContext = Object.assign({}, serviceContext, attributes);

  let tdoBatch = require('./tdoBatch')(serviceContext);

  describe('#batch', function () {
    beforeEach(() => {
      serviceContext._clearAll();
    });

    it('error creating a batch without valid organization', async () => {
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
          const result = await tdoBatch.createBatch(serviceContext, {
            input: {
              name: 'a static batch',
              batchSelector: {
                tdoIds: [1234, 5678]
              },
              orgId: 999,
              createdBy: 'rootUser'
            }
          });

          expect(result).toBeUndefined();
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
          expect(err.message).toEqual(
            `user does not belong to the organization`
          );
        }
      }
    });

    it('error creating a batch without rights user', async () => {
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
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a static batch',
            batchSelector: {
              tdoIds: [1234, 5678]
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });

        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          `The authenticated user does not have permission to perform the operation`
        );
      }
    });

    it('creating a batch with superadmin rights', async () => {
      const serviceContextOne = {
        _authInfo: {
          permissionMasks: [
            -2,
            4129023,
            -1071874560,
            1308622847,
            0,
            0,
            0,
            536870912
          ]
        },
        requestContext: {
          _authInfo: {
            organization: {
              organizationId: 7642
            }
          }
        }
      };

      const serviceContextTwo = {
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
      const serviceContextList = [serviceContextOne, serviceContextTwo];

      for (const context of serviceContextList) {
        dbCore.write._push([
          {
            batch_id: 'id_mock_123',
            status: 'created',
            batch_selector: {},
            organization_id: 7642,
            created_by: 'rootUser',
            modified_by: null,
            created_date: '2023-09-01',
            modified_date: '2023-09-01',
            is_mutable: false
          }
        ]);

        dbCore.write._push([]);

        const result = await tdoBatch.createBatch(context, {
          input: {
            name: 'a static batch',
            batchSelector: {
              tdoIds: [1234, 5678]
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });

        expect(result.id).toEqual('id_mock_123');
        expect(result.status).toEqual('created');
        expect(result.selectionCriteria).toEqual({});
        expect(result.orgId).toEqual(7642);
        expect(result.createdBy).toEqual('rootUser');
        expect(result.modifiedBy).toEqual(null);
        expect(result.createdDate).toEqual('2023-09-01');
        expect(result.modifiedDate).toEqual('2023-09-01');
        expect(result.isMutable).toEqual(false);
      }
    });

    it('creating a batch with static tdo list', async () => {
      dbCore.write._push([
        {
          batch_id: 'id_mock_123',
          status: 'created',
          batch_selector: {},
          organization_id: 7642,
          created_by: 'rootUser',
          modified_by: null,
          created_date: '2023-09-01',
          modified_date: '2023-09-01',
          is_mutable: false
        }
      ]);

      dbCore.write._push([]);

      const result = await tdoBatch.createBatch(serviceContext, {
        input: {
          name: 'a static batch',
          batchSelector: {
            tdoIds: [1234, 5678]
          },
          orgId: 7642,
          createdBy: 'rootUser'
        }
      });

      expect(result.id).toEqual('id_mock_123');
      expect(result.status).toEqual('created');
      expect(result.selectionCriteria).toEqual({});
      expect(result.orgId).toEqual(7642);
      expect(result.createdBy).toEqual('rootUser');
      expect(result.modifiedBy).toEqual(null);
      expect(result.createdDate).toEqual('2023-09-01');
      expect(result.modifiedDate).toEqual('2023-09-01');
      expect(result.isMutable).toEqual(false);
    });

    it('invalid batchSelector creating a batch with a static tdo list', async () => {
      dbCore.write._push([
        {
          batchId: 'id_mock_123'
        }
      ]);

      dbCore.write._push([]);
      try {
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a static batch',
            batchSelector: {},
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          "input argument 'batchSelector' must has one of mutually exclusive fields 'tdoIds' or 'searchQuery'"
        );
      }
    });

    it('creating a batch with dynamic tdo list', async () => {
      messageUtil._clearCounter();

      dbCore.write._push([
        {
          batch_id: 'id_mock_123',
          status: 'creating',
          batch_selector: {},
          organization_id: 7642,
          created_by: 'rootUser',
          modified_by: null,
          created_date: '2023-09-01',
          modified_date: '2023-09-01',
          is_mutable: true
        }
      ]);

      const result = await tdoBatch.createBatch(serviceContext, {
        input: {
          name: 'a dynamic batch',
          batchSelector: {
            searchQuery: {
              limit: 500,
              query: {
                operator: 'and',
                conditions: []
              }
            }
          },
          orgId: 7642,
          createdBy: 'rootUser',
          skipTdosAfterEventCreation: true
        }
      });
      const eventEmitted = messageUtil._messages();
      expect(result.id).toEqual('id_mock_123');
      expect(result.status).toEqual('creating');
      expect(result.selectionCriteria).toEqual({});
      expect(result.orgId).toEqual(7642);
      expect(result.createdBy).toEqual('rootUser');
      expect(result.modifiedBy).toEqual(null);
      expect(result.createdDate).toEqual('2023-09-01');
      expect(result.modifiedDate).toEqual('2023-09-01');
      expect(result.isMutable).toEqual(true);
      expect(eventEmitted[0].event).toEqual('TDOSearchProcessCreated');
      expect(eventEmitted[0].type).toEqual('batch');
      expect(eventEmitted[0].serviceName).toEqual('core-graphql-server');
      expect(eventEmitted[0].batchId).toEqual('id_mock_123');
      expect(eventEmitted[0].organizationId).toEqual(7642);
      expect(eventEmitted[0].searchQuery).toBeDefined();
      expect(eventEmitted[0].skipTdosAfterEventCreation).toEqual(true);
    });

    it('error creating a batch due to missing elements in tdoIds', async () => {
      try {
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a static batch',
            batchSelector: {
              tdoIds: []
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'tdoIds list must contain at least one element'
        );
      }
    });

    it('limit in searchQuery for dynamic batch is bigger than 200000', async () => {
      try {
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a static batch',
            batchSelector: {
              searchQuery: {
                limit: 200001,
                offset: 0,
                query: {
                  operator: 'and',
                  conditions: []
                }
              }
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'searchQuery.limit must be greater than 0 and equal or less than 200000 that is the maximum possible amount of elements per batch'
        );
      }
    });

    it('error creating a dynamic batch due to missing condition attribute in searchQuery', async () => {
      try {
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a static batch',
            batchSelector: {
              searchQuery: {
                limit: 5000,
                offset: 6000,
                query: {
                  operator: 'and'
                }
              }
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'operator and conditions must be added as part of the search query'
        );
      }
    });

    it('getting a batch', async () => {
      const serviceContextOne = {
        _authInfo: {
          permissionMasks: [
            -2,
            4129023,
            -1071874560,
            1308622847,
            0,
            0,
            0,
            536870912
          ]
        },
        requestContext: {
          _authInfo: {
            organization: {
              organizationId: 7642
            }
          }
        }
      };

      const serviceContextTwo = {
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
      const serviceContextList = [
        serviceContext,
        serviceContextOne,
        serviceContextTwo
      ];
      for (const context of serviceContextList) {
        dbCore.write._push([
          {
            batch_id: 'id_mock_123',
            status: 'created',
            batch_selector: {},
            organization_id: 4672,
            created_by: 'rootUser',
            modified_by: null,
            created_date: '2023-09-01',
            modified_date: '2023-09-01',
            is_mutable: false
          }
        ]);

        const result = await tdoBatch.getTdoBatch(context, {
          id: 'id_mock_123'
        });

        expect(result.id).toEqual('id_mock_123');
        expect(result.status).toEqual('created');
        expect(result.selectionCriteria).toEqual({});
        expect(result.orgId).toEqual(4672);
        expect(result.createdBy).toEqual('rootUser');
        expect(result.modifiedBy).toEqual(null);
        expect(result.createdDate).toEqual('2023-09-01');
        expect(result.modifiedDate).toEqual('2023-09-01');
        expect(result.isMutable).toEqual(false);
      }
    });

    it('getting a batch without organizationId but with super admin rights', async () => {
      const serviceContextOne = {
        _authInfo: {
          permissionMasks: [
            -2,
            4129023,
            -1071874560,
            1308622847,
            0,
            0,
            0,
            536870912
          ]
        }
      };

      const serviceContextTwo = {
        _authInfo: {
          json: {
            rights: ['superadmin'],
            internal: true
          },
          tokenId: '123'
        }
      };
      const serviceContextList = [serviceContextOne, serviceContextTwo];

      for (const context of serviceContextList) {
        dbCore.write._push([
          {
            batch_id: 'id_mock_123',
            status: 'created',
            batch_selector: {},
            organization_id: 4672,
            created_by: 'rootUser',
            modified_by: null,
            created_date: '2023-09-01',
            modified_date: '2023-09-01',
            is_mutable: false
          }
        ]);

        const result = await tdoBatch.getTdoBatch(context, {
          id: 'id_mock_123'
        });

        expect(result.id).toEqual('id_mock_123');
        expect(result.status).toEqual('created');
        expect(result.selectionCriteria).toEqual({});
        expect(result.orgId).toEqual(4672);
        expect(result.createdBy).toEqual('rootUser');
        expect(result.modifiedBy).toEqual(null);
        expect(result.createdDate).toEqual('2023-09-01');
        expect(result.modifiedDate).toEqual('2023-09-01');
        expect(result.isMutable).toEqual(false);
      }
    });

    it('error getting a batch without organizationId and without super admin rights', async () => {
      const serviceContextEmpty = {};

      try {
        const result = await tdoBatch.getTdoBatch(serviceContextEmpty, {
          id: 'id_mock_123'
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          `user does not belong to the organization or does not have rights`
        );
      }
    });

    it('error creating a dynamic batch due to invalid limit in searchQuery', async () => {
      try {
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a dynamic batch',
            batchSelector: {
              searchQuery: {
                limit: -1,
                query: {
                  operator: 'and'
                }
              }
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'searchQuery.limit must be greater than 0 and equal or less than 200000 that is the maximum possible amount of elements per batch'
        );
      }
    });

    it('error creating a dynamic batch due to invalid offset in searchQuery', async () => {
      try {
        const result = await tdoBatch.createBatch(serviceContext, {
          input: {
            name: 'a dynamic batch',
            batchSelector: {
              searchQuery: {
                offset: -1,
                query: {
                  operator: 'and'
                }
              }
            },
            orgId: 7642,
            createdBy: 'rootUser'
          }
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'searchQuery.offset must be equal or greater than 0'
        );
      }
    });
  });

  describe('#batch process', function () {
    beforeEach(() => {
      serviceContext._clearAll();
    });

    it('getting a batch process', async () => {
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'running',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      const result = await tdoBatch.getBatchProcesses(serviceContext, {
        input: {
          id: 'bp_id_123'
        }
      });

      expect(result[0].id).toEqual('bp_id_123');
      expect(result[0].batchId).toEqual('b_id_456');
      expect(result[0].status).toEqual('running');
      expect(result[0].concurrency).toEqual(12);
      expect(result[0].itemsCompleted).toEqual(0);
      expect(result[0].itemsFailed).toEqual(0);
      expect(result[0].itemsTotal).toEqual(12);
      expect(result[0].itemsRunning).toEqual(9);
      expect(result[0].itemsPending).toEqual(3);
      expect(result[0].details.batchId).toEqual('b_id_456');
      expect(result[0].organizationId).toEqual(7642);
    });

    it('getting a batch process without organizationId but with superadmin rights', async () => {
      const contextForSuperAdmin = {
        _authInfo: {
          json: {
            rights: ['superadmin'],
            internal: true
          },
          tokenId: '123'
        }
      };

      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'running',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      const result = await tdoBatch.getBatchProcesses(contextForSuperAdmin, {
        input: {
          id: 'bp_id_123'
        }
      });

      expect(result[0].id).toEqual('bp_id_123');
      expect(result[0].batchId).toEqual('b_id_456');
      expect(result[0].status).toEqual('running');
      expect(result[0].concurrency).toEqual(12);
      expect(result[0].itemsCompleted).toEqual(0);
      expect(result[0].itemsFailed).toEqual(0);
      expect(result[0].itemsTotal).toEqual(12);
      expect(result[0].itemsRunning).toEqual(9);
      expect(result[0].itemsPending).toEqual(3);
      expect(result[0].details.batchId).toEqual('b_id_456');
      expect(result[0].organizationId).toEqual(7642);
    });

    it('getting a batch process by tdoId', async () => {
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          item_id: '53423432342',
          action_id: 'running'
        }
      ]);

      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'running',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      const result = await tdoBatch.getBatchProcesses(serviceContext, {
        input: {
          tdoId: '53423432342'
        }
      });

      expect(result[0].id).toEqual('bp_id_123');
      expect(result[0].batchId).toEqual('b_id_456');
      expect(result[0].status).toEqual('running');
      expect(result[0].concurrency).toEqual(12);
      expect(result[0].itemsCompleted).toEqual(0);
      expect(result[0].itemsFailed).toEqual(0);
      expect(result[0].itemsTotal).toEqual(12);
      expect(result[0].itemsRunning).toEqual(9);
      expect(result[0].itemsPending).toEqual(3);
      expect(result[0].details.batchId).toEqual('b_id_456');
      expect(result[0].organizationId).toEqual(7642);
    });

    it('getting a batch process by tdoId, without organizationId but with superadmin rights', async () => {
      const contextForSuperAdmin = {
        _authInfo: {
          json: {
            rights: ['superadmin'],
            internal: true
          },
          tokenId: '123'
        }
      };

      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          item_id: '53423432342',
          action_id: 'running'
        }
      ]);

      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'running',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      const result = await tdoBatch.getBatchProcesses(contextForSuperAdmin, {
        input: {
          tdoId: '53423432342'
        }
      });

      expect(result[0].id).toEqual('bp_id_123');
      expect(result[0].batchId).toEqual('b_id_456');
      expect(result[0].status).toEqual('running');
      expect(result[0].concurrency).toEqual(12);
      expect(result[0].itemsCompleted).toEqual(0);
      expect(result[0].itemsFailed).toEqual(0);
      expect(result[0].itemsTotal).toEqual(12);
      expect(result[0].itemsRunning).toEqual(9);
      expect(result[0].itemsPending).toEqual(3);
      expect(result[0].details.batchId).toEqual('b_id_456');
      expect(result[0].organizationId).toEqual(7642);
    });

    it('error getting a batch process by tdoId than not exists', async () => {
      dbCore.write._push([]);

      try {
        const result = await tdoBatch.getBatchProcesses(serviceContext, {
          input: {
            tdoId: '53423432342'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toEqual(
          `Specified tdo doesn't exist or access denied`
        );
      }
    });

    it('error getting a batch process without organization and without super admin rights', async () => {
      const serviceContextEmpty = {};

      try {
        const result = await tdoBatch.getBatchProcesses(serviceContextEmpty, {
          input: {
            tdoId: '53423432342'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          `user does not belong to the organization or does not have rights`
        );
      }
    });

    it('getting actions for a batch process', async () => {
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          item_id: 'item_123',
          action_id: 'action_123',
          status: 'running'
        }
      ]);

      const result = await tdoBatch.GetActionsForABatchProcess(
        serviceContext,
        {
          id: 'bp_id_123'
        },
        {
          status: 'running',
          limit: 1,
          offset: 0
        }
      );

      expect(result.records[0].targetId).toEqual('tdo_123');
      expect(result.records[0].actionId).toEqual('job_123');
      expect(result.records[0].status).toEqual('complete');
      expect(result.records[0].details.name).toEqual(`it's a job`);
      expect(result.records[0].details.description).toEqual(
        'a mock description'
      );
      expect(result.records[0].details.clusterId).toEqual('13234-Q4Q3WWD');
      expect(result.records[0].details.jobConfig).toEqual({});
      expect(result.offset).toEqual(0);
      expect(result.limit).toEqual(1);
      expect(result.count).toEqual(1);
    });

    it('empty actions for a batch process that does not have batch process items', async () => {
      dbCore.write._push([]);

      const result = await tdoBatch.GetActionsForABatchProcess(
        serviceContext,
        {
          id: 'bp_id_123'
        },
        {
          status: 'running',
          limit: 1,
          offset: 0
        }
      );

      expect(result.records.length).toEqual(0);
      expect(result.offset).toEqual(0);
      expect(result.limit).toEqual(1);
      expect(result.count).toEqual(0);
    });

    it('canceling a batch process', async () => {
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'running',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      serviceContext.dal.tdoBatch.updateBatchProcess = jest.fn(() => {
        return {
          id: 'bp_id_123',
          batchId: 'b_id_456',
          status: 'canceling',
          organizationId: 7642,
          concurrency: 12,
          itemsCompleted: 0,
          itemsFailed: 0,
          itemsTotal: 12,
          itemsRunning: 9,
          itemsPending: 3
        };
      });

      const result = await tdoBatch.cancelTdoBatchProcess(serviceContext, {
        id: 'bp_id_123'
      });

      expect(result.id).toEqual('bp_id_123');
      expect(result.batchId).toEqual('b_id_456');
      expect(result.status).toEqual('canceling');
      expect(result.concurrency).toEqual(12);
      expect(result.itemsCompleted).toEqual(0);
      expect(result.itemsFailed).toEqual(0);
      expect(result.itemsTotal).toEqual(12);
      expect(result.itemsRunning).toEqual(9);
      expect(result.itemsPending).toEqual(3);
      expect(result.organizationId).toEqual(7642);
    });

    it('canceling a batch process without organizationId but with super admin rights', async () => {
      const contextForSuperAdmin = {
        _authInfo: {
          json: {
            rights: ['superadmin'],
            internal: true
          },
          tokenId: '123'
        }
      };

      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'running',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      serviceContext.dal.tdoBatch.updateBatchProcess = jest.fn(() => {
        return {
          id: 'bp_id_123',
          batchId: 'b_id_456',
          status: 'canceling',
          organizationId: 7642,
          concurrency: 12,
          itemsCompleted: 0,
          itemsFailed: 0,
          itemsTotal: 12,
          itemsRunning: 9,
          itemsPending: 3
        };
      });

      const result = await tdoBatch.cancelTdoBatchProcess(
        contextForSuperAdmin,
        {
          id: 'bp_id_123'
        }
      );

      expect(result.id).toEqual('bp_id_123');
      expect(result.batchId).toEqual('b_id_456');
      expect(result.status).toEqual('canceling');
      expect(result.concurrency).toEqual(12);
      expect(result.itemsCompleted).toEqual(0);
      expect(result.itemsFailed).toEqual(0);
      expect(result.itemsTotal).toEqual(12);
      expect(result.itemsRunning).toEqual(9);
      expect(result.itemsPending).toEqual(3);
      expect(result.organizationId).toEqual(7642);
    });

    it('error canceling a batch process with invalid status completed', async () => {
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          organization_id: 7642,
          status: 'completed',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      try {
        const result = await tdoBatch.cancelTdoBatchProcess(serviceContext, {
          id: 'bp_id_123'
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          `batchProcessId needs to be in status 'creating' or 'running' before to cancel the process. Current status: completed`
        );
      }
    });

    it('error canceling a batch process with invalid status canceled', async () => {
      dbCore.write._push([
        {
          batch_process_id: 'bp_id_123',
          batch_id: 'b_id_456',
          status: 'canceled',
          concurrency: 12,
          completed_count: 0,
          failed_count: 0,
          total_count: 12,
          running_count: 9,
          pending_count: 3
        }
      ]);

      try {
        const result = await tdoBatch.cancelTdoBatchProcess(serviceContext, {
          id: 'bp_id_123'
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          `batchProcessId needs to be in status 'creating' or 'running' before to cancel the process. Current status: canceled`
        );
      }
    });

    it('error canceling a batch process that not exists', async () => {
      dbCore.write._push([]);

      try {
        const result = await tdoBatch.cancelTdoBatchProcess(serviceContext, {
          id: 'bp_id_123'
        });
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toEqual(
          `batchProcessId not exists or access denied`
        );
      }
    });

    it('error canceling a batch process without organization and without super admin rights', async () => {
      const serviceContextEmpty = {};

      try {
        const result = await tdoBatch.cancelTdoBatchProcess(
          serviceContextEmpty,
          {
            id: 'bp_id_123'
          }
        );
        expect(result).toBeUndefined();
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual(
          `user does not belong to the organization or does not have rights`
        );
      }
    });
  });
});
