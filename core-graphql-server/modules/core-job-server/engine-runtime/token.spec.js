const jwt = require('jsonwebtoken');
const _ = require('lodash');
const serviceContext = require('../../v3DataModel/test/serviceContext.mock.js')();
const serviceContext1 = _.cloneDeep(serviceContext);

describe('_createJwtToken', () => {
  let testContext = {};
  let tokenHelper;

  beforeAll(() => {
    tokenHelper = require('./token.js')(serviceContext);
  });

  it('should create a token with certain rights and object ids from task', async () => {
    const mockEngine = {
      createsRecording: false,
      jwtRights: {
        roles: [
          {
            roleName: 'eventEngine',
            taskRights: ['task:event'],
            assetRights: []
          }
        ]
      }
    };
    const token = await tokenHelper.createJwtToken(testContext, mockEngine, {
      recordingId: '21098228',
      jobId: '31onryck.ae8a21',
      taskId: '31onryck.ae8a21.a',
      taskPayload: {
        sourceId: 'source-123'
      },
      userId: '6e87674b-3645-4d01-9ec9-efe9f696538b'
    });

    expect(jwt.decode(token)).toEqual({
      userId: '6e87674b-3645-4d01-9ec9-efe9f696538b',
      iat: expect.any(Number),
      exp: expect.any(Number),
      sub: 'engine-run',
      jti: expect.any(String),
      scope: [
        {
          actions: [
            'asset:uri',
            'asset:all',
            'recording:read',
            'recording:update'
          ],
          resources: {
            recordingIds: ['21098228']
          }
        },
        {
          actions: ['task:update', 'task:event'],
          resources: {
            jobIds: ['31onryck.ae8a21'],
            taskIds: ['31onryck.ae8a21.a'],
            schemaIds: [],
            sourceIds: ['source-123']
          }
        }
      ]
    });
  });

  it('should create a token with recording create rights if is ingestion engine task', async () => {
    const mockEngine = {
      createsRecording: true,
      jwtRights: {
        roles: [
          {
            roleName: 'eventEngine',
            taskRights: ['task:event']
          },
          {
            roleName: 'assetEngine',
            assetRights: ['asset:all']
          }
        ]
      }
    };
    const token = await tokenHelper.createJwtToken(testContext, mockEngine, {
      userId: '2b9de8d8-77bb-4cc7-ad29-f576fbad3cd1',
      recordingId: '21098228',
      jobId: '31onryck.ae8a21',
      taskId: '31onryck.ae8a21.a',
      taskPayload: {
        sourceId: 'source-123'
      }
    });

    expect(jwt.decode(token)).toEqual({
      userId: '2b9de8d8-77bb-4cc7-ad29-f576fbad3cd1',
      iat: expect.any(Number),
      exp: expect.any(Number),
      sub: 'engine-run',
      jti: expect.any(String),
      scope: [
        {
          actions: [
            'asset:uri',
            'asset:all',
            'recording:read',
            'recording:update',
            'recording:create'
          ],
          resources: {
            recordingIds: ['21098228']
          }
        },
        {
          actions: ['task:update', 'task:event'],
          resources: {
            jobIds: ['31onryck.ae8a21'],
            taskIds: ['31onryck.ae8a21.a'],
            schemaIds: [],
            sourceIds: ['source-123']
          }
        }
      ]
    });
  });

  it('should create a token with authGroups', async function () {
    _.set(serviceContext1, 'config.featureFlags.enableRBACFeature', true);
    serviceContext1.bll.rbacAuth = {
      filterAuthGroupIdsByRights: jest.fn()
    };
    const helper = require('./token.js')(serviceContext1);
    const mockEngine = {
      createsRecording: false,
      jwtRights: {
        roles: [
          {
            roleName: 'eventEngine',
            taskRights: ['task:event'],
            assetRights: []
          }
        ]
      }
    };

    // get organization in mainUtil.isEnableFeatureInOrganization
    serviceContext1.dbConnections['media_platform'].read._push([{}]);
    serviceContext1.dbConnections['media_platform'].read._push([
      {
        organizationId: 7682,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      }
    ]);

    serviceContext1.bll.rbacAuth.filterAuthGroupIdsByRights.mockImplementationOnce(
      (context, args) => {
        expect(args.ids).toEqual(expect.arrayContaining(['21098228']));
        expect(args.resourceType).toEqual('recording');

        return Promise.resolve(['ag_1', 'ag_2']);
      }
    );

    serviceContext1.bll.rbacAuth.filterAuthGroupIdsByRights.mockImplementationOnce(
      (context, args) => {
        expect(args.ids).toEqual(
          expect.arrayContaining([
            '31onryck.ae8a21',
            '31onryck.ae8a21.a',
            'source-123'
          ])
        );
        expect(args.resourceType).toEqual('organization');

        return Promise.resolve(['ag_1', 'ag_3']);
      }
    );

    const newContext = {
      _authInfo: {
        permissionMasks: [-2, 268427519, 1073741824, 5189619] // superadmin permissionMarks
      }
    };

    const token = await helper.createJwtToken(
      newContext,
      mockEngine,
      {
        recordingId: '21098228',
        jobId: '31onryck.ae8a21',
        taskId: '31onryck.ae8a21.a',
        taskPayload: {
          sourceId: 'source-123',
          organizationId: 7682
        },
        userId: '6e87674b-3645-4d01-9ec9-efe9f696538b'
      },
      7682
    );

    expect(
      serviceContext1.bll.rbacAuth.filterAuthGroupIdsByRights
    ).toHaveBeenCalledTimes(2);
    expect(jwt.decode(token)).toEqual({
      userId: '6e87674b-3645-4d01-9ec9-efe9f696538b',
      iat: expect.any(Number),
      exp: expect.any(Number),
      sub: 'engine-run',
      jti: expect.any(String),
      authGroups: ['ag_1', 'ag_2', 'ag_3'],
      contentOrganizationId: 7682,
      scope: [
        {
          actions: [
            'asset:uri',
            'asset:all',
            'recording:read',
            'recording:update',
            'aiware.sdo.create',
            'aiware.sdo.read'
          ],
          resources: {
            recordingIds: ['21098228']
          }
        },
        {
          actions: ['task:update', 'task:event'],
          resources: {
            jobIds: ['31onryck.ae8a21'],
            taskIds: ['31onryck.ae8a21.a'],
            schemaIds: [],
            sourceIds: ['source-123']
          }
        }
      ]
    });
  });
  it('should filter out superadmin permissions from engineJWT', async () => {
    const mockEngine = {
      engineId: 'test-engine-id',
      jwtRights: {
        roles: [
          {
            roleName: 'adapter',
            taskRights: [
              'superadmin',
              'task:update',
              'task_type:internal',
              'SUPERADMIN',
              'veritone-superadmin'
            ],
            assetRights: [
              'asset:uri',
              'recording:read'
            ]
          }
        ]
      }
    };
    const task = {
      applicationId: 'test-app-id',
      userId: '6e87674b-3645-4d01-9ec9-efe9f696538b',
      taskPayload: {
        organizationId: 7682
      }
    };

    // Configure a blacklist mock for this test
    _.set(serviceContext, 'config.rbac.permissions.blacklist', [
      'SUPERADMIN',
      'veritone-superadmin',
      'task_type:internal'
    ]);

    const token = await tokenHelper.createJwtToken(testContext, mockEngine, task, 7682);
    const decoded = jwt.decode(token);

    const taskScope = decoded.scope.find(s => s.actions.includes('task:update'));

    // verified filtered out
    expect(taskScope.actions).not.toContain('superadmin');
    expect(taskScope.actions).not.toContain('SUPERADMIN');
    expect(taskScope.actions).not.toContain('veritone-superadmin');
    expect(taskScope.actions).not.toContain('task_type:internal');

    // verified kept
    expect(taskScope.actions).toContain('task:update');
  });

  describe('_createJwtToken userId resolution', () => {
    let testContext = { name: 'test-context' };
    let tokenHelper;

    beforeAll(() => {
      tokenHelper = require('./token.js')(serviceContext);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should resolve userId from source owner ID if userId is missing', async () => {
      const mockEngine = { createsRecording: false };
      const mockTask = {
        taskPayload: {
          sourceId: 'source-123',
          organizationId: 7682
        }
      };

      const mockSource = {
        id: 'source-123',
        ownedBy: 'user-from-source'
      };

      serviceContext.dal.source.getSource = jest.fn().mockResolvedValue(mockSource);

      const token = await tokenHelper.createJwtToken(testContext, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      expect(serviceContext.dal.source.getSource).toHaveBeenCalledWith(
        testContext,
        { id: 'source-123', organizationId: 7682 }
      );
      expect(decoded.userId).toBe('user-from-source');
    });

    it('should resolve userId from context _authInfo if missing in task', async () => {
      const mockEngine = { createsRecording: false };
      const mockTask = {
        taskPayload: {
          organizationId: 7682
        }
      };
      const context = {
        _authInfo: {
          userId: 'auth-user-id'
        }
      };

      const token = await tokenHelper.createJwtToken(context, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe('auth-user-id');
    });

    it('should resolve userId from context userInfo if missing in task and _authInfo', async () => {
      const mockEngine = { createsRecording: false };
      const mockTask = {
        taskPayload: {
          organizationId: 7682
        }
      };
      const context = {
        userInfo: {
          userId: 'user-info-id'
        }
      };

      const token = await tokenHelper.createJwtToken(context, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe('user-info-id');
    });

    it('should resolve userId from context tokenInfo if missing in task and other fields', async () => {
      const mockEngine = { createsRecording: false };
      const mockTask = {
        taskPayload: {
          organizationId: 7682
        }
      };
      const context = {
        tokenInfo: {
          userId: 'token-info-id'
        }
      };

      const token = await tokenHelper.createJwtToken(context, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe('token-info-id');
    });

    it('should resolve userId from source createdBy if ownedBy is missing', async () => {
      const mockEngine = { createsRecording: false };
      const mockTask = {
        taskPayload: {
          sourceId: 'source-123',
          organizationId: 7682
        }
      };

      const mockSource = {
        id: 'source-123',
        createdBy: 'creator-from-source'
      };

      serviceContext.dal.source.getSource = jest.fn().mockResolvedValue(mockSource);

      const token = await tokenHelper.createJwtToken(testContext, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe('creator-from-source');
    });

    it('should resolve userId from default org admin if userId and sourceId are missing', async () => {
      const mockEngine = { createsRecording: false };
      const mockTask = {
        taskPayload: {
          organizationId: 7682
        }
      };

      const mockAdmin = { id: 'default-admin-id' };
      serviceContext.dal.user.getDefaultOrgAdminUser = jest.fn().mockResolvedValue(mockAdmin);

      const token = await tokenHelper.createJwtToken(testContext, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      expect(serviceContext.dal.user.getDefaultOrgAdminUser).toHaveBeenCalledWith(
        { organizationId: 7682 },
        testContext
      );
      expect(decoded.userId).toBe('default-admin-id');
      expect(mockTask.userId).toBe('default-admin-id');
    });

    it('should NOT add SDO rights if jwtRights version is 2.0 or higher', async () => {
      const serviceContext1 = _.cloneDeep(serviceContext);
      const mockEngine = {
        createsRecording: false,
        jwtRights: {
          version: 2.0,
          roles: []
        }
      };
      const mockTask = {
        taskPayload: {
          organizationId: 7682
        },
        userId: 'some-user'
      };

      const mainUtil = require('../../../util.js')(serviceContext1);
      jest.spyOn(mainUtil, 'isEnableFeatureInOrganization').mockResolvedValue(true);
      serviceContext1.bll.rbacAuth = {
        filterAuthGroupIdsByRights: jest.fn().mockResolvedValue([])
      };

      const helper = require('./token.js')(serviceContext1);
      const token = await helper.createJwtToken(testContext, mockEngine, mockTask, 7682);
      const decoded = jwt.decode(token);

      const assetScope = decoded.scope.find(s => s.resources.recordingIds);
      expect(assetScope.actions).not.toContain('aiware.sdo.create');
      expect(assetScope.actions).not.toContain('aiware.sdo.read');
    });
  });
});
