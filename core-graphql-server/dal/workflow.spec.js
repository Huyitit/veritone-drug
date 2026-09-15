const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const config = {
  recordingIdParser: {
    prefix: 'mri-',
    baseUri: 'https://api.aws-dev.veritone.com/media-streamer'
  },
  workflow: {
    flowRoleId: 'foo',
    baseUri: 'workflow_baseUri'
  }
};
const logger = serviceContext.logger;
const context = mockUtil.makeContext();
context.config = {
  services: {
    coreAdminUri: 'https://api.aws-dev.veritone.com/v1/admin/'
  }
};
const dal = require('./workflow.js')(
  logger,
  config,
  serviceContext.dbConnections,
  serviceContext
);
describe('workflow', function () {
  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(8);
    });
  });
  describe('startWorkflow', function () {
    it('should start workflow', async function () {
      // mock out a response get org token
      require('request-promise')
        .mockImplementationOnce((uri) =>
          Promise.resolve([
            {
              tokenId:
                '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
              json: {
                applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
                isRevoked: false,
                rights: ['workflow:create'],
                tokenId:
                  '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
                internal: true,
                tokenLabel: 'Master token',
                tokenType: 'workflow'
              }
            }
          ])
        )
        .mockImplementationOnce((uri) =>
          Promise.resolve({
            success: true,
            message: {}
          })
        );

      // mock dal admin create internal api token
      let createInternalApiToken = jest.fn();
      _.set(
        serviceContext,
        'dal.admin.createInternalApiToken',
        createInternalApiToken
      );
      createInternalApiToken.mockImplementation(() =>
        Promise.resolve({
          token_id:
            '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          group_id: 'a123',
          json: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
        })
      );

      // get workflow
      const data = {
        authToken: 'authToken0',
        hostUri: 'hostUri0',
        createdAt: 'c0',
        updatedAt: 'c1'
      };
      serviceContext.dbConnections['core'].read._push(
        [data],
        true,
        [],
        (sql, args) => args[0] == 'nr'
      );
      // insert into workflow_runtime
      serviceContext.dbConnections['core'].read._push([
        {
          workflow_runtime_id: 123,
          organization_id: 123,
          token_id: 123,
          auth_token: {}
        }
      ]);

      const res = await dal.startWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.success).to.be.true;
    });
    it('should start workflow without workflow create permission', async function () {
      // mock out a response get org token
      require('request-promise')
        .mockImplementationOnce((uri) =>
          Promise.resolve([
            {
              tokenId:
                '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
              json: {
                applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
                isRevoked: false,
                rights: [],
                tokenId:
                  '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
                internal: true,
                tokenLabel: 'Master token',
                tokenType: 'workflow'
              }
            }
          ])
        )
        .mockImplementationOnce((uri) =>
          Promise.resolve({
            success: true,
            message: {}
          })
        );

      // mock dal admin create internal api token
      let createInternalApiToken = jest.fn();
      _.set(
        serviceContext,
        'dal.admin.createInternalApiToken',
        createInternalApiToken
      );
      createInternalApiToken.mockImplementation(() =>
        Promise.resolve({
          token_id:
            '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          group_id: 'a123',
          json: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
        })
      );

      // get workflow
      const data = {
        authToken: 'authToken0',
        hostUri: 'hostUri0',
        createdAt: 'c0',
        updatedAt: 'c1'
      };
      serviceContext.dbConnections['core'].read._push(
        [data],
        true,
        [],
        (sql, args) => args[0] == 'nr'
      );
      // insert into workflow_runtime
      serviceContext.dbConnections['core'].read._push([
        {
          workflow_runtime_id: 123,
          organization_id: 123,
          token_id: 123,
          auth_token: {}
        }
      ]);

      const res = await dal.startWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.success).to.be.true;
    });
    it('should work with hostEntry', async function () {
      // mock out a response get org token
      require('request-promise')
        .mockImplementationOnce((uri) =>
          Promise.resolve([
            {
              tokenId:
                '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
              json: {
                applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
                isRevoked: false,
                rights: [
                  'asset:uri',
                  'job:create',
                  'job:read',
                  'job:update',
                  'job:delete'
                ],
                tokenId:
                  '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
                internal: true,
                tokenLabel: 'Master token',
                tokenType: 'workflow'
              }
            }
          ])
        )
        .mockImplementationOnce((uri) =>
          Promise.resolve({
            success: true,
            message: JSON.stringify({
              Tasks: [
                {
                  Overrides: {
                    ContainerOverrides: [
                      {
                        Environment: [
                          {
                            Name: 'NODE_INSTANCE_URL',
                            value: 'hostEntry'
                          }
                        ]
                      }
                    ]
                  }
                }
              ]
            })
          })
        );

      // mock dal admin create internal api token
      let createInternalApiToken = jest.fn();
      _.set(
        serviceContext,
        'dal.admin.createInternalApiToken',
        createInternalApiToken
      );
      createInternalApiToken.mockImplementation(() =>
        Promise.resolve({
          token_id:
            '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
          application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          group_id: 'a123',
          json: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
        })
      );

      // get workflow
      const data = {
        authToken: 'authToken0',
        hostUri: 'hostUri0',
        createdAt: 'c0',
        updatedAt: 'c1'
      };
      serviceContext.dbConnections['core'].read._push(
        [data],
        true,
        [],
        (sql, args) => args[0] == 'nr'
      );
      // insert into workflow_runtime
      serviceContext.dbConnections['core'].read._push([
        {
          workflow_runtime_id: 123,
          organization_id: 123,
          token_id: 123,
          auth_token: {}
        }
      ]);

      const res = await dal.startWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.success).to.be.true;
    });
    it('should fail if response error', async function () {
      // mock out a response get org token
      require('request-promise')
        .mockImplementationOnce((uri) =>
          Promise.resolve([
            {
              tokenId:
                '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
              applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
              groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
              json: {
                applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
                isRevoked: false,
                rights: [
                  'asset:uri',
                  'job:create',
                  'job:read',
                  'job:update',
                  'job:delete'
                ],
                tokenId:
                  '78180f:299eaa9d30b5438e9912016f3c7593addd91540485dc4dae856fe723a3644a6c',
                internal: true,
                tokenLabel: 'Master token',
                tokenType: 'workflow'
              }
            }
          ])
        )
        .mockImplementationOnce((uri) =>
          Promise.resolve({
            success: false,
            message: {}
          })
        );
      const res = await dal.startWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.be.exist;
      chaiExpect(res.success).to.be.false;
    });
    it('should return success is false', async function () {
      // mock out a response get org token
      require('request-promise').mockImplementationOnce((uri) =>
        Promise.reject(
          new Error({
            statusCode: 409,
            message: 'Service failed'
          })
        )
      );
      const res = await dal.startWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.be.exist;
      chaiExpect(res.success).to.be.false;
    });
  });
  describe('stopWorkflow', function () {
    it('should stop workflow', async function () {
      // update workflow_runtime
      serviceContext.dbConnections['core'].write._push([
        {
          host_uri: 'host_uri',
          token_id: 'token_id',
          organization_id: 7682
        }
      ]);
      require('request-promise').mockImplementationOnce((uri) =>
        Promise.resolve('stopWorkflow')
      );
      const res = await dal.stopWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.be.exist;
      chaiExpect(res.success).to.be.true;
      chaiExpect(res.uri).to.be.equal('host_uri');
    });
    it('should return success fail', async function () {
      // update workflow_runtime
      serviceContext.dbConnections['core'].write._push([
        {
          host_uri: 'host_uri',
          token_id: 'token_id',
          organization_id: 7682
        }
      ]);
      require('request-promise').mockImplementationOnce((uri) =>
        Promise.reject('stopWorkflow')
      );
      const res = await dal.stopWorkflow(context, {
        workflowRuntimeId: 'nr',
        orgId: 7682
      });
      chaiExpect(res).to.be.exist;
      chaiExpect(res.success).to.be.false;
      chaiExpect(res.message).to.equal('Unknown Error');
    });
  });
  describe('getWorkflow', function () {
    it('should get workflow', async function () {
      const data = {
        authToken: 'authToken0',
        hostUri: 'hostUri0',
        createdAt: 'c0',
        updatedAt: 'c1'
      };
      serviceContext.dbConnections['core'].read._push(
        [data],
        true,
        [],
        (sql, args) => args[0] == 'nr'
      );
      const {
        authToken,
        uri,
        createdDateTime,
        modifiedDateTime
      } = await dal.getWorkflow(null, {
        workflowRuntimeId: 'nr'
      });
      chaiExpect(authToken).to.eq(data.authToken);
      chaiExpect(uri).to.eq(data.hostUri);
      chaiExpect(createdDateTime).to.eq(data.createdAt);
      chaiExpect(modifiedDateTime).to.eq(data.updatedAt);
    });
    it('should get workflow isActive', async function () {
      const data = {
        authToken: 'authToken0',
        hostUri: 'hostUri0',
        createdAt: 'c0',
        updatedAt: 'c1'
      };
      serviceContext.dbConnections['core'].read._push(
        [data],
        true,
        [],
        (sql, args) => args[0] == 'nr'
      );
      const {
        authToken,
        uri,
        createdDateTime,
        modifiedDateTime
      } = await dal.getWorkflow(null, {
        workflowRuntimeId: 'nr',
        isActive: true
      });
      chaiExpect(authToken).to.eq(data.authToken);
      chaiExpect(uri).to.eq(data.hostUri);
      chaiExpect(createdDateTime).to.eq(data.createdAt);
      chaiExpect(modifiedDateTime).to.eq(data.updatedAt);
    });
    it('should get workflow isInactive', async function () {
      const data = {
        authToken: 'authToken0',
        hostUri: 'hostUri0',
        createdAt: 'c0',
        updatedAt: 'c1'
      };
      serviceContext.dbConnections['core'].read._push(
        [data],
        true,
        [],
        (sql, args) => args[0] == 'nr'
      );
      const {
        authToken,
        uri,
        createdDateTime,
        modifiedDateTime
      } = await dal.getWorkflow(null, {
        workflowRuntimeId: 'nr',
        isInactive: true
      });
      chaiExpect(authToken).to.eq(data.authToken);
      chaiExpect(uri).to.eq(data.hostUri);
      chaiExpect(createdDateTime).to.eq(data.createdAt);
      chaiExpect(modifiedDateTime).to.eq(data.updatedAt);
    });
    it('should fail if invalid id', async function () {
      try {
        const res = await dal.getWorkflow(null, {});
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal('id format is invalid');
      }
    });
    it('should fail if not found', async function () {
      try {
        serviceContext.dbConnections['core'].read._push([]);
        const res = await dal.getWorkflow(null, {
          workflowRuntimeId: 'nr'
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('not_found');
        chaiExpect(err.message).to.equal('workflow nr not found');
      }
    });
  });
  describe('workflowMetric', function () {
    it('should throw on missing organization', async function () {
      try {
        await dal.workflowMetric(null, {});
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.message).to.eq(
          'missing organization id in request context'
        );
      }
    });
    it('should query flowSeatCount and flowTaskCount', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [{ count: 1 }],
        true,
        [],
        (sql, args) => args[0] == '1' && args[1] == 'foo'
      );
      serviceContext.dbConnections['core'].read._push(
        [{ count: 2 }],
        true,
        [],
        (sql, args) => args[0] == 1
      );
      const { flowSeatCount, flowTaskCount } = await dal.workflowMetric(null, {
        organizationId: 1
      });
      chaiExpect(flowSeatCount).to.eq(1);
      chaiExpect(flowTaskCount).to.eq(2);
    });
  });
  describe('dailyTaskMetrics', function () {
    it('should throw on missing organization', async function () {
      try {
        await dal.dailyTaskMetrics(null, {});
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.name).to.eq('invalid_input');
        chaiExpect(err.message).to.eq(
          'missing organization id in request context'
        );
      }
    });
    it('should return empty records', async function () {
      const { records } = await dal.dailyTaskMetrics(null, {
        organizationId: 1,
        applicationId: 'applicationId'
      });
      chaiExpect(records.length).to.equal(0);
    });
    it('should return null if empty', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.dailyTaskMetrics(null, {
        organizationId: 1
      });
      chaiExpect(res).to.be.a('null');
    });
    it('should query consumption', async function () {
      const consumption = [
        {
          taskCount: 1,
          storageBytes: 2,
          mediaSecs: 3,
          date: 'foo'
        }
      ];
      serviceContext.dbConnections['media_platform'].read._push(
        [{ consumption }],
        true,
        [],
        (sql, args) => args[0] == '1'
      );
      const { records } = await dal.dailyTaskMetrics(null, {
        organizationId: 1
      });
      chaiExpect(records).to.deep.eq([
        { taskCount: 1, storageBytes: 2, mediaSecs: 3, date: 'foo' }
      ]);
    });
  });
  describe('canAccessWorkflowRuntime', function () {
    it('should throw on workflow runtime not found', async function () {
      const workflowRuntimeId = 'nr0';
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        await dal.canAccessWorkflowRuntime(null, { workflowRuntimeId });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.message).to.eq(
          `workflow ${workflowRuntimeId} not found`
        );
      }
    });
    it('should throw on unmatched organization id', async function () {
      const workflowRuntimeId = 'nr0';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId: 'foo' }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        await dal.canAccessWorkflowRuntime(null, {
          workflowRuntimeId,
          organizationId
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.message).to.eq(
          `access to workflow ${workflowRuntimeId} not allowed`
        );
      }
    });
    it('should be able to access the workflow runtime', async function () {
      const workflowRuntimeId = 'nr0';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        await dal.canAccessWorkflowRuntime(null, {
          workflowRuntimeId,
          organizationId
        });
      } catch (err) {
        expect.fail(err);
      }
    });
    it('should be able to access if superAdmin', async function () {
      const workflowRuntimeId = 'nr0';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        await dal.canAccessWorkflowRuntime(context, {
          workflowRuntimeId,
          organizationId
        });
      } catch (err) {
        expect.fail(err);
      }
    });
    it('should be able to access if valid checkRights', async function () {
      const workflowRuntimeId = 'nr0';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        context._authInfo.permissionMasks = {};
        context._authInfo.json = { rights: ['workflow.create'] };
        // context._authInfo.json
        await dal.canAccessWorkflowRuntime(context, {
          workflowRuntimeId,
          organizationId
        });
      } catch (err) {
        expect.fail(err);
      }
    });
  });
  describe('setWorkflowRuntimeStorageData', function () {
    it('should set work flow runtime storage data', async function () {
      // canAccessWorkflowRuntime
      const workflowRuntimeId = 'workflowRuntimeId';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            workflow_runtime_id: 'workflowRuntimeId',
            storage_key: 'storage_key',
            storage_data: 'storage_data'
          }
        ],
        false
      );
      try {
        const res = await dal.setWorkflowRuntimeStorageData(context, {
          workflowRuntimeId: 'workflowRuntimeId',
          input: {
            storageKey: 'storageKey',
            storageData: 'storageData',
            storageMetadata: 'storageMetadata'
          }
        });
        chaiExpect(res).to.exist;
      } catch (err) {
        expect.fail(err);
      }
    });
    it('should throw on missing workflowRuntimeId', async function () {
      // canAccessWorkflowRuntime
      const workflowRuntimeId = 'workflowRuntimeId';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        const res = await dal.setWorkflowRuntimeStorageData(context, {
          input: {
            storageKey: 'storageKey',
            storageData: 'storageData',
            storageMetadata: 'storageMetadata'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.message).to.equal(
          'workflowRuntimeId cannot be an empty string'
        );
      }
    });
    it('should throw on missing dataKey', async function () {
      // canAccessWorkflowRuntime
      const workflowRuntimeId = 'workflowRuntimeId';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      try {
        const res = await dal.setWorkflowRuntimeStorageData(context, {
          workflowRuntimeId: 'workflowRuntimeId',
          input: {
            storageData: 'storageData',
            storageMetadata: 'storageMetadata'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.message).to.equal('dataKey cannot be an empty string');
      }
    });
  });
  describe('getWorkflowRuntimeStorageData', function () {
    it('should work with storageKey', async function () {
      // canAccessWorkflowRuntime
      const workflowRuntimeId = 'workflowRuntimeId';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            storage_key: 'storage_key',
            storage_data: 'storage_data',
            storage_metadata: 'storage_metadata'
          }
        ],
        false
      );
      try {
        const res = await dal.getWorkflowRuntimeStorageData(context, {
          workflowRuntimeId: 'workflowRuntimeId',
          storageKey: 'storageKey'
        });
        chaiExpect(res).to.exist;
      } catch (err) {
        expect.fail(err);
      }
    });
    it('should work with storageKeyPrefix', async function () {
      // canAccessWorkflowRuntime
      const workflowRuntimeId = 'workflowRuntimeId';
      const organizationId = 'org0';
      serviceContext.dbConnections['core'].read._push(
        [{ organizationId }],
        true,
        [],
        (sql, args) => args[0] == workflowRuntimeId
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            storage_key: 'storage_key',
            storage_data: 'storage_data',
            storage_metadata: 'storage_metadata'
          }
        ],
        false
      );
      try {
        const res = await dal.getWorkflowRuntimeStorageData(context, {
          workflowRuntimeId: 'workflowRuntimeId',
          storageKeyPrefix: 'storageKeyPrefix'
        });
        chaiExpect(res).to.exist;
      } catch (err) {
        expect.fail(err);
      }
    });
  });
});
