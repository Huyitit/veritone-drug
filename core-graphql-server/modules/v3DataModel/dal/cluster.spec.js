const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = require('../../../test/mockUtil.js')();
const createServiceContext = require('../../../test/serviceContext.mock.js');
const serviceContext = createServiceContext();
const customServiceContext = createServiceContext();

serviceContext.coreJob.cjdal.node = {
  getNodes: (node, x, cb) => {
    cb(null, [node]);
  },
  updatePauseStatusForNodes: (nodeIds, f, g, cb) => {
    cb(null, []);
  }
};
serviceContext.coreJob.cjdal.cluster = {
  createCluster: (cluster, x, cb) => {
    cb(null, cluster);
  },
  deleteCluster: (id, x, cb) => {
    cb(null, { clusterId: id, displayName: 'test cluster' });
  },
  pauseCluster: (id, x, cb) => {
    cb(null, { id });
  },
  unpauseCluster: (id, x, cb) => {
    cb(null, { id });
  },
  updateCluster: (cluster, x, cb) => {
    cb(null, cluster);
  }
};
serviceContext.coreJob.cjdal.jobBundle = {
  getJobBundle: (bundle, x, cb) => {
    cb(null, {
      clusterId: '123',
      bundleId: 'b123'
    });
  }
};
serviceContext.redisCache = {
  isCacheDirty: () => true,
  markCacheDirty: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  asyncSet: jest.fn(),
  clear: jest.fn(),
  incr: jest.fn(),
  incrBy: jest.fn(),
  incrByFloat: jest.fn(),
  decr: jest.fn(),
  multiExec: jest.fn()
};
serviceContext.bll.cluster = {
  updateClusterPreferences: jest.fn()
};

const dal = require('./cluster.js')(serviceContext);
const customDal = require('./cluster.js')(customServiceContext);
const clusterNodeId = 'aaabbbccc-111-2222-2222';

describe('#cluster', () => {
  const clusterId = 'ami-0f8646b1-585a-4c07-95dc-d8d2838e2580';
  const clusterName = 'test_123456';
  const testClusterNodeName = 'test_cluster_node_' + Date.now();
  const testClusterSubscriptons = [
    {
      userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
      emailAddress: 'example@email.com',
      createdDateTime: 1546196157,
      modifiedDateTime: 1546196157,
      isActive: true
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('#require', () => {
    it('should load module', () => {
      // load the module and validate basic structure
      expect(dal).toBeInstanceOf(Object);
      expect(Object.keys(dal).length).toBe(18);
      expect(typeof dal.getCluster).toBe('function');
      expect(typeof dal.getClusterList).toBe('function');
      expect(typeof dal.createCluster).toBe('function');
      expect(typeof dal.updateCluster).toBe('function');
      expect(typeof dal.deleteCluster).toBe('function');
      expect(typeof dal.pauseCluster).toBe('function');
      expect(typeof dal.unpauseCluster).toBe('function');
      expect(typeof dal.getCollaborators).toBe('function');
      expect(typeof dal.getClusterTags).toBe('function');
      expect(typeof dal.getClusterByPreference).toBe('function');
      expect(typeof dal.setClusterByPreference).toBe('function');
      expect(typeof dal.createClusterCollaborators).toBe('function');
    });
  });

  describe('#getCluster', () => {
    describe('#getCluster', () => {
      it('should get a cluster with org ID', async () => {
        serviceContext.dbConnections['core'].read._push(
          [
            {
              id: '123',
              organization_id: '17560',
              name: 'test cluster'
            }
          ],
          true,
          ['is_public']
        );
        const cl = await dal.getCluster(mockUtil.makeContext(), {
          id: '123',
          organizationId: '7682',
          orgId: '17560'
        });
        expect(cl).toBeDefined();
        expect(cl.id).toBe('123');
        expect(cl.organizationId).toBe('17560');
      });
      it('should get a cluster without org ID', async () => {
        serviceContext.dbConnections['core'].read._push([
          {
            id: '123',
            name: 'test cluster'
          }
        ]);
        const cl = await dal.getCluster(mockUtil.makeContext(), { id: '123' });
        expect(cl).toBeDefined();
        expect(cl.id).toBe('123');
      });
    });
  });

  describe('#getClusters', () => {
    it('should get clusters with org ID as superadmin', async () => {
      const context = mockUtil.makeContext();
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123',
            organization_id: '17560',
            name: 'test cluster'
          }
        ],
        true,
        ['is_public']
      );
      const cl = await dal.getClusterList(context, {
        organizationId: '7682',
        orgId: '17560'
      });
      expect(cl).toBeDefined();
      expect(cl.records).toBeDefined();
      expect(cl.records.length).toBe(1);
      expect(cl.records[0].organizationId).toBe('17560');
    });

    it('should get clusters without org ID', async () => {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          name: 'test cluster'
        }
      ]);
      const cl = await dal.getClusterList(mockUtil.makeContext(), {
        organizationId: '7682'
      });
      expect(cl).toBeDefined();
      expect(cl.records).toBeDefined();
      expect(cl.records.length).toBe(1);
      expect(cl.records[0].id).toBe('123');
    });

    it('should get clusters by allowed engines', async () => {
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          name: 'test cluster'
        }
      ]);
      const cl = await dal.getClusterList(mockUtil.makeContext(), {
        organizationId: '7682',
        allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55']
      });
      expect(cl).toBeDefined();
      expect(cl.records).toBeDefined();
      expect(cl.records.length).toBe(1);
      expect(cl.records[0].id).toBe('123');
    });

    it('should get clusters by clusterGroupId and clusterGroupIds', async () => {
      let res, err;
      const args = {
        clusterGroupId: 'fde51248-b697-45f3-a7f5-014b1ad08839',
        clusterGroupIds: [
          '28cd4655-2ed5-4332-a590-a6a01f54fefd',
          '6c4b1e72-3ffa-4a9c-a233-165453fe9f2a'
        ]
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '39e7a05b-21aa-4c55-88c4-618949a37639',
            name: 'test cluster',
            is_group: false,
            cluster_group_id: 'fde51248-b697-45f3-a7f5-014b1ad08839'
          }
        ],
        true,
        [
          'is_group',
          'cluster_group_id',
          'in_group',
          'c.in_group IN',
          'c.deleted_date is null'
        ],
        (sql, values) => {
          // if (values[0] !== false) return false;
          if (values[0] !== 'fde51248-b697-45f3-a7f5-014b1ad08839')
            return false;
          if (values[1] !== '28cd4655-2ed5-4332-a590-a6a01f54fefd')
            return false;
          if (values[2] !== '6c4b1e72-3ffa-4a9c-a233-165453fe9f2a')
            return false;
          return true;
        }
      );

      try {
        res = await dal.getClusterList(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('39e7a05b-21aa-4c55-88c4-618949a37639');
      expect(res.records[0].name).toBe('test cluster');
      expect(res.records[0].isGroup).toBe(false);
      expect(res.records[0].clusterGroupId).toBe(
        'fde51248-b697-45f3-a7f5-014b1ad08839'
      );
    });
  });

  describe('#getCollaborators', () => {
    it('should get collaborators', async () => {
      serviceContext.dbConnections['core'].read._push([
        {
          cluster_id: '123',
          organization_id: '7682'
        }
      ]);
      const res = await dal.getCollaborators(mockUtil.makeContext(), {
        id: '123',
        organizationId: 7862
      });
      expect(res).toBeDefined();
      expect(res.records).toBeDefined();
      expect(res.records.length).toBeDefined();
      expect(res.records[0].organizationId).toBe('7682');
      expect(res.records[0].permission).toBeDefined();
    });
  });

  describe('#createCluster', () => {
    beforeEach(() => {
      serviceContext._clearAll();
    });

    let context = mockUtil.makeContext();

    it('should throw InvalidInput error when invalid memorySize', async () => {
      let res, err;
      const args = {
        input: {
          name: testClusterNodeName,
          memorySize: '33gb'
        }
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);
      _.set(context, '_authInfo.organization.maxAiwareClusters', 4);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        }
      ]);
      try {
        res = await dal.createCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw InvalidInput error when invalid storageSize', async () => {
      let res, err;
      const args = {
        input: {
          name: testClusterNodeName,
          storageSize: '1001gb'
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        }
      ]);
      try {
        res = await dal.createCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw NotAllowed error when org is full clusters', async () => {
      let res, err;
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 7682,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        }
      ]);
      try {
        res = await dal.createCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(res).toBeUndefined();
    });

    it('should throw InvalidInput for edgeVersion mismatch', async () => {
      let res, err;
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          edgeVersion: 2,
          organizationId: 7682,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organization_id: 7682,
          name: clusterName,
          allowed_engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secret_key: 'extrasecret',
          access_key: 'C2C10079C93A718E1CF0',
          default: false,
          container_tag: 'test',
          queue_credentials: {},
          docker_hub_credentials: {},
          paused: false,
          memory_size_bytes: '1073741824',
          storage_size_bytes: '8589934592',
          deleted_date_time: null,
          created_date_time: 1546196157,
          modified_date_time: 1546196157,
          is_public: true,
          bypass_allowed_engines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      try {
        res = await dal.createCluster(context, args);
      } catch (error) {
        err = error;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create Cluster with empty Collaborators', async () => {
      let res;
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 7682,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };

      // cluster
      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organization_id: 7682,
          name: clusterName,
          allowed_engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secret_key: 'extrasecret',
          access_key: 'C2C10079C93A718E1CF0',
          default: false,
          container_tag: 'test',
          queue_credentials: {},
          docker_hub_credentials: {},
          paused: false,
          memory_size_bytes: '1073741824',
          storage_size_bytes: '8589934592',
          deleted_date_time: null,
          created_date_time: 1546196157,
          modified_date_time: 1546196157,
          is_public: true,
          bypass_allowed_engines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      // cluster
      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organization_id: 7682,
          name: clusterName,
          allowed_engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secret_key: 'extrasecret',
          access_key: 'C2C10079C93A718E1CF0',
          default: false,
          container_tag: 'test',
          queue_credentials: {},
          docker_hub_credentials: {},
          paused: false,
          memory_size_bytes: '1073741824',
          storage_size_bytes: '8589934592',
          deleted_date_time: null,
          created_date_time: 1546196157,
          modified_date_time: 1546196157,
          is_public: true,
          bypass_allowed_engines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        }
      ]);

      res = await dal.createCluster(context, args);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(clusterId);
      expect(res.organizationId).toBe(7682);
      expect(res.name).toBe(clusterName);
      expect(res.allowedEngines[0]).toBe(
        'd1bc57fe-675d-435d-9f4d-2f074485ec55'
      );
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
    });

    it('should create Cluster with Collaborators viewer', async () => {
      let res;
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 7682,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          collaborators: [
            {
              organizationId: 7862,
              permission: 'viewer'
            }
          ],
          tags: ['foo', 'bar'],
          status: 'active'
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        }
      ]);

      res = await dal.createCluster(context, args);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
    });

    it('should create Cluster with Collaborators none', async () => {
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 7682,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          collaborators: [
            {
              organizationId: 7862,
              permission: 'none'
            }
          ],
          tags: ['foo', 'bar'],
          status: 'active'
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };
      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      const res = await dal.createCluster(context, args);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
    });

    it('should create Cluster for another org', async () => {
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 17560,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          collaborators: [
            {
              organizationId: 17560,
              permission: 'none'
            }
          ],
          tags: ['foo', 'bar'],
          status: 'active'
        }
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);
      _.set(context, '_authInfo.organization.maxAiwareClusters', 4);
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      const res = await dal.createCluster(context, args);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
    });

    it('should update state in cluster', async () => {
      const args = {
        input: {
          id: clusterId
        }
      };
      context.requestContext = {
        userInfo: {
          organization: {
            organizationId: 7682,
            maxAiwareClusters: 4
          }
        }
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        },
        {
          id: '123'
        },
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterNodeId,
          nodes: [
            {
              nodeId: clusterNodeId,
              metrics: {
                mbRam: 4
              }
            }
          ]
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '7682',
          name: 'test cluster'
        }
      ]);

      const res = await dal.updateClusterState(context, args);
      expect(res).toBeDefined();
      expect(res.nodes[0].metrics.mbRam).toBe(4);
    });

    it('should create ClusterGroup', async () => {
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 17560,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          edgeVersion: 3,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          collaborators: [
            {
              organizationId: 17560,
              permission: 'none'
            }
          ],
          tags: ['foo', 'bar'],
          status: 'active',
          isGroup: true
        }
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);
      _.set(context, '_authInfo.organization.maxAiwareClusters', 4);
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: clusterId,
            organizationId: 17560,
            name: clusterName,
            allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
            type: 'ami',
            secretKey: 'extrasecret',
            accessKey: 'C2C10079C93A718E1CF0',
            default: false,
            edgeVersion: 3,
            containerTag: 'test',
            queueCredentials: {},
            dockerHubCredentials: {},
            paused: false,
            memorySizeBytes: '1073741824',
            storageSizeBytes: '8589934592',
            deletedDateTime: null,
            createdDateTime: 1546196157,
            modifiedDateTime: 1546196157,
            isPublic: true,
            bypassAllowedEngines: true,
            tags: ['foo', 'bar'],
            status: 'active',
            is_group: true
          }
        ],
        true,
        ['is_group'],
        (sql, values) => {
          if (values.length !== 20) return false;
          if (values[19] !== true) return false;
          return true;
        }
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        }
      ]);

      const res = await dal.createCluster(context, args);

      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
      expect(res.isGroup).toBe(true);
    });

    it('should throw NotFound error if input Group is invalid when creating Cluster in Group', async () => {
      let res, err;
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 17560,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active',
          clusterGroupId: '88e6dffe-03e4-4a33-9167-72afd65e49d0'
        }
      };

      _.set(context, '_authInfo.organization.organizationId', 7682);
      _.set(context, '_authInfo.organization.maxAiwareClusters', 4);
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);
      // getCluster to check valid input group (but invalid group)
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(res).toBeUndefined();
    });

    it('should throw InvalidInput error if creating a Group in another Group', async () => {
      let res, err;
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 17560,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active',
          isGroup: true,
          clusterGroupId: '88e6dffe-03e4-4a33-9167-72afd65e49d0'
        }
      };

      _.set(context, '_authInfo.organization.organizationId', 7682);
      _.set(context, '_authInfo.organization.maxAiwareClusters', 4);
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      // get list current Cluster for checking limit
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        }
      ]);

      try {
        res = await dal.createCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create a Cluster in a Group', async () => {
      const args = {
        input: {
          name: clusterName,
          type: 'ami',
          organizationId: 17560,
          secretKey: 'supersecret',
          accessKey: 'C1C413EEC3E160EC958D',
          defaultCluster: false,
          edgeVersion: 3,
          containerTag: 'test',
          memorySize: '1gb',
          storageSize: '8gb',
          dockerCredentials: {},
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active',
          clusterGroupId: '88e6dffe-03e4-4a33-9167-72afd65e49d0'
        }
      };
      _.set(context, '_authInfo.organization.organizationId', 7682);
      _.set(context, '_authInfo.organization.maxAiwareClusters', 4);
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: 'extrasecret',
          accessKey: 'C2C10079C93A718E1CF0',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '8589934592',
          deletedDateTime: null,
          createdDateTime: 1546196157,
          modifiedDateTime: 1546196157,
          isPublic: true,
          bypassAllowedEngines: true,
          tags: ['foo', 'bar'],
          status: 'active'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      // getCluster to check valid input group
      serviceContext.dbConnections['core'].read._push([
        { id: '88e6dffe-03e4-4a33-9167-72afd65e49d0' }
      ]);

      // Insert new Cluster
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: clusterId,
            organizationId: 17560,
            name: clusterName,
            allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
            type: 'ami',
            secretKey: 'extrasecret',
            accessKey: 'C2C10079C93A718E1CF0',
            default: false,
            edgeVersion: 3,
            containerTag: 'test',
            queueCredentials: {},
            dockerHubCredentials: {},
            paused: false,
            memorySizeBytes: '1073741824',
            storageSizeBytes: '8589934592',
            deletedDateTime: null,
            createdDateTime: 1546196157,
            modifiedDateTime: 1546196157,
            isPublic: true,
            bypassAllowedEngines: true,
            tags: ['foo', 'bar'],
            status: 'active',
            is_group: false,
            cluster_group_id: '88e6dffe-03e4-4a33-9167-72afd65e49d0'
          }
        ],
        true,
        ['is_group', 'in_group', '88e6dffe-03e4-4a33-9167-72afd65e49d0'],
        (sql, values) => {
          if (values.length !== 21) return false;
          if (values[19] !== false) return false;
          if (values[20] !== '88e6dffe-03e4-4a33-9167-72afd65e49d0')
            return false;
          return true;
        }
      );

      // get list current Cluster for checking limit
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        },
        {
          id: '123',
          organization_id: '17560',
          name: 'test cluster'
        }
      ]);

      const res = await dal.createCluster(context, args);

      expect(res).toBeDefined();
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
      expect(res.isGroup).toBe(false);
      expect(res.clusterGroupId).toBe('88e6dffe-03e4-4a33-9167-72afd65e49d0');
      // event
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });
  });

  describe('#deleteCluster', () => {
    beforeEach(() => {
      serviceContext._clearAll();
    });

    const validClusterId = 'ami-0f8646b1-585a-4c07-95dc-d8d2838e2580';

    it('should delete a cluster', async () => {
      const context = mockUtil.makeContext();
      
      serviceContext.coreJob.cjdal.cluster.deleteCluster = (id, x, cb) => {
        cb(null, { clusterId: id, displayName: 'Test Cluster' });
      };      
      
      const res = await dal.deleteCluster(context, { id: validClusterId });

      expect(res).toBeDefined();
      expect(res.id).toBe(validClusterId);
      expect(res.name).toBe('Test Cluster');

      // event
      const messages = serviceContext.messageUtil._messages();
      expect(serviceContext.messageUtil._counter()).toBe(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success'
        })
      );
    });

    it('should throw InvalidInput error for invalid clusterId', async () => {
      const context = mockUtil.makeContext();
      let err;

      try {
        await dal.deleteCluster(context, { id: 'invalid-id' });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');

      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'failure'
        })
      );
    });

    it('should throw ServiceFailure when deleteCluster fails', async () => {
      const context = mockUtil.makeContext();
      let err;

      serviceContext.coreJob.cjdal.cluster.deleteCluster = (id, x, cb) => {
        cb(new Error('delete failed'));
      };

      try {
        await dal.deleteCluster(context, { id: validClusterId });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('service_failure');

      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'failure'
        })
      );
    });
  });

  describe('#pauseCluster', () => {
    it('should pause a cluster', async () => {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          name: 'test cluster'
        }
      ]);
      const res = await dal.pauseCluster(mockUtil.makeContext(), {
        input: { id: '123' }
      });
      expect(res).toBeDefined();
    });
  });

  describe('#unpauseCluster', () => {
    it('should unpause a cluster', async () => {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          name: 'test cluster'
        }
      ]);
      const res = await dal.unpauseCluster(mockUtil.makeContext(), {
        input: { id: '123' }
      });
      expect(res).toBeDefined();
    });
  });

  describe('#updateCluster', () => {
    beforeEach(() => {
      serviceContext._clearAll();
    });

    let context = {};

    it('should throw NotAllow error when clusterPermission is not owner', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          memorySize: '1gb',
          storageSize: '8gb'
        },
        organizationId: 1234
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false
        }
      ]);

      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(res).toBeUndefined();
    });

    it('should throw NotAllow error when internal token dont have require perm', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          memorySize: '1gb',
          storageSize: '8gb'
        },
        organizationId: 1234
      };
      const apiInternalContext = mockUtil.makeContext({
        authType: 'api_internal'
      });

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false
        }
      ]);

      try {
        res = await dal.updateCluster(apiInternalContext, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(res).toBeUndefined();
    });

    it('should throw InvalidInput on edgeVersion mismatch', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          name: clusterName,
          edgeVersion: 2,
          memorySize: '1gb',
          storageSize: '7gb',
          collaborators: [
            {
              organizationId: '7862',
              permission: 'none'
            }
          ],
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        },
        organizationId: 7682,
        tags: ['foo', 'bar'],
        status: 'active'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false,
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd1bc57fe-675d-435d-9f4d-2f074485ec55',
          category_id: 'category1',
          name: 'Engine_d1bc57fe-675d-435d-9f4d-2f074485ec55',
          edge_version: 3
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: '64A50DEDD4B5A83AB26BE5949008175E89202C9',
          accessKey: '9A7FC03DC6310C89D622',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '7516192768',
          deletedDateTime: null,
          createdDateTime: 1546313282,
          modifiedDateTime: 1546313289,
          isPublic: false,
          bypassAllowedEngines: null,
          tags: ['foo', 'bar'],
          status: 'active',
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '7862',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId
        }
      ]);

      let dbGetUser = jest.fn();
      dbGetUser.mockImplementation(() =>
        Promise.resolve({
          id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
          name: 'example@gmail.com'
        })
      );
      _.set(serviceContext, 'dal.admin.getUser', dbGetUser);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId,
          subscription_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4'
        }
      ]);

      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should ignore edgeVersion check if both allowedEngines and edgeVersion were not set', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          name: clusterName,
          memorySize: '1gb',
          storageSize: '7gb',
          collaborators: [
            {
              organizationId: '7862',
              permission: 'none'
            }
          ],
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        },
        organizationId: 7682,
        tags: ['foo', 'bar'],
        status: 'active'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false,
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: '64A50DEDD4B5A83AB26BE5949008175E89202C9',
          accessKey: '9A7FC03DC6310C89D622',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '7516192768',
          deletedDateTime: null,
          createdDateTime: 1546313282,
          modifiedDateTime: 1546313289,
          isPublic: false,
          bypassAllowedEngines: null,
          tags: ['foo', 'bar'],
          status: 'active',
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '7862',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId
        }
      ]);

      let dbGetUser = jest.fn();
      dbGetUser.mockImplementation(() =>
        Promise.resolve({
          id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
          name: 'example@gmail.com'
        })
      );
      _.set(serviceContext, 'dal.admin.getUser', dbGetUser);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId,
          subscription_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4'
        }
      ]);

      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
      expect(res.subscriptions.length).toBe(1);
      expect(res.subscriptions[0].emailAddress).toBe('example1@email.com');
    });

    it('should update Cluster', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          name: clusterName,
          memorySize: '1gb',
          storageSize: '7gb',
          collaborators: [
            {
              organizationId: '7862',
              permission: 'none'
            }
          ],
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        },
        organizationId: 7682,
        tags: ['foo', 'bar'],
        status: 'active'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false,
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 7682,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: '64A50DEDD4B5A83AB26BE5949008175E89202C9',
          accessKey: '9A7FC03DC6310C89D622',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '7516192768',
          deletedDateTime: null,
          createdDateTime: 1546313282,
          modifiedDateTime: 1546313289,
          isPublic: false,
          bypassAllowedEngines: null,
          tags: ['foo', 'bar'],
          status: 'active',
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '7862',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId
        }
      ]);

      let dbGetUser = jest.fn();
      dbGetUser.mockImplementation(() =>
        Promise.resolve({
          id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
          name: 'example@gmail.com'
        })
      );
      _.set(serviceContext, 'dal.admin.getUser', dbGetUser);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId,
          subscription_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4'
        }
      ]);

      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
      expect(res.subscriptions.length).toBe(1);
      expect(res.subscriptions[0].emailAddress).toBe('example1@email.com');
      // event
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
    });

    it('should update Cluster for another org as super admin', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          name: clusterName,
          memorySize: '1gb',
          storageSize: '7gb',
          collaborators: [
            {
              organizationId: '7862',
              permission: 'none'
            }
          ],
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        },
        organizationId: 7682,
        tags: ['foo', 'bar'],
        status: 'active'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false,
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: '64A50DEDD4B5A83AB26BE5949008175E89202C9',
          accessKey: '9A7FC03DC6310C89D622',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '7516192768',
          deletedDateTime: null,
          createdDateTime: 1546313282,
          modifiedDateTime: 1546313289,
          isPublic: false,
          bypassAllowedEngines: null,
          tags: ['foo', 'bar'],
          status: 'active',
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '17560',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId
        }
      ]);

      let dbGetUser = jest.fn();
      dbGetUser.mockImplementation(() =>
        Promise.resolve({
          id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
          name: 'example@gmail.com'
        })
      );
      _.set(serviceContext, 'dal.admin.getUser', dbGetUser);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId,
          subscription_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4'
        }
      ]);
      context._authInfo = {
        permissionMasks: [-2, 268427519, 1073741824, 5189619]
      };
      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
      expect(res.subscriptions.length).toBe(1);
      expect(res.subscriptions[0].emailAddress).toBe('example1@email.com');
      expect(res.organizationId).toBe(17560);
    });

    it('should update Cluster for another org use internal API token', async () => {
      let res, err;
      const args = {
        input: {
          id: clusterId,
          name: clusterName,
          memorySize: '1gb',
          storageSize: '7gb',
          collaborators: [
            {
              organizationId: '7862',
              permission: 'none'
            }
          ],
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        },
        organizationId: 7682,
        tags: ['foo', 'bar'],
        status: 'active'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          secretKey: 'C37A176B57CFDB556B6040FA9688F8150991824',
          accessKey: '8AC098A2ABFB31C313B9',
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          cachedVeritoneApiKey: null,
          cachedDateTime: null,
          deletedDateTime: null,
          createdDateTime: 1546311759,
          modifiedDateTime: 1546311759,
          storageSizeBytes: '8589934592',
          type: 'ami',
          default: false,
          bypassAllowedEngines: false,
          isPublic: false,
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          organizationId: 17560,
          name: clusterName,
          allowedEngines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55'],
          type: 'ami',
          secretKey: '64A50DEDD4B5A83AB26BE5949008175E89202C9',
          accessKey: '9A7FC03DC6310C89D622',
          default: false,
          containerTag: 'test',
          queueCredentials: {},
          dockerHubCredentials: {},
          paused: false,
          memorySizeBytes: '1073741824',
          storageSizeBytes: '7516192768',
          deletedDateTime: null,
          createdDateTime: 1546313282,
          modifiedDateTime: 1546313289,
          isPublic: false,
          bypassAllowedEngines: null,
          tags: ['foo', 'bar'],
          status: 'active',
          subscriptions: [
            {
              userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
              emailAddress: 'example1@email.com',
              createdDateTime: 1546196157,
              modifiedDateTime: 1546196157,
              isActive: true
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '17560',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId
        }
      ]);

      let dbGetUser = jest.fn();
      dbGetUser.mockImplementation(() =>
        Promise.resolve({
          id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
          name: 'example@gmail.com'
        })
      );
      _.set(serviceContext, 'dal.admin.getUser', dbGetUser);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: clusterId,
          subscription_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4'
        }
      ]);

      const apiInternalContext = mockUtil.makeContext({
        authType: 'api_internal'
      });
      // add the cluster:manager right for internal Token
      apiInternalContext.requestContext.tokenInfo.json.rights.push(
        'cluster:manager'
      );
      apiInternalContext._authInfo.json.rights.push('cluster:manager');
      try {
        res = await dal.updateCluster(apiInternalContext, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe(clusterId);
      expect(res.tags.length).toBe(2);
      expect(res.tags[0]).toBe('foo');
      expect(res.subscriptions.length).toBe(1);
      expect(res.subscriptions[0].emailAddress).toBe('example1@email.com');
      expect(res.organizationId).toBe(17560);
    });

    it('should update config Cluster without cluster config json', async () => {
      let res, err;
      let managementNodeID = 1;
      let mediaStoragePath = 'mnt/data';
      let restartTimeUTC = '02:00';
      let serviceToken = 'aASDSAVREQWE32432FR';
      const args = {
        input: {
          id: clusterId,
          managementNodeID,
          mediaStoragePath,
          restartTimeUTC,
          serviceToken
        }
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          clusterConfig: {
            managementNodeID,
            mediaStoragePath,
            restartTimeUTC,
            serviceToken
          }
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          clusterConfig: {
            managementNodeID,
            mediaStoragePath,
            restartTimeUTC,
            serviceToken
          }
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '7862',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe(clusterId);
      expect(res.clusterConfig.serviceToken).toBe(serviceToken);
      expect(res.clusterConfig.managementNodeID).toBe(managementNodeID);
      expect(res.clusterConfig.mediaStoragePath).toBe(mediaStoragePath);
      expect(res.clusterConfig.restartTimeUTC).toBe(restartTimeUTC);
    });

    it('should update config Cluster with cluster config json', async () => {
      let res, err;
      let managementNodeID = 1;
      let mediaStoragePath = undefined;
      let restartTimeUTC = '02:00';
      let serviceToken = 'aASDSAVREQWE32432FR';
      const args = {
        input: {
          id: clusterId,
          clusterConfig: {
            managementNodeID,
            mediaStoragePath
          },
          managementNodeID: 4,
          serviceToken: 'token'
        }
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterId,
          clusterConfig: {
            managementNodeID: 10,
            mediaStoragePath: 'mnt',
            restartTimeUTC: '04:00',
            serviceToken: 'token 2'
          }
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          id: clusterId,
          clusterConfig: {
            managementNodeID,
            mediaStoragePath: undefined,
            restartTimeUTC: '04:00',
            serviceToken: 'token'
          }
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '7862',
          cluster_id: clusterId
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.updateCluster(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe(clusterId);
      expect(res.clusterConfig.serviceToken).toBe('token');
      expect(res.clusterConfig.managementNodeID).toBe(managementNodeID);
      expect(res.clusterConfig.mediaStoragePath).toBeUndefined();
      expect(res.clusterConfig.restartTimeUTC).toBe('04:00');
    });
  });

  describe('#getClusterTags', () => {
    let context = {};

    it('cluster tags in use by this organization', async () => {
      let res, err;
      const args = {
        matchType: 'startsWith',
        match: 'fo'
      };
      customServiceContext.dbConnections[
        'core'
      ].read.query = jest
        .fn()
        .mockImplementation(() => [{ tag: 'foo' }, { tag: 'food' }]);

      try {
        res = await customDal.getClusterTags(context, args);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
      expect(res[0]).toBe('foo');
    });
  });

  describe('#getClusterByPreference', () => {
    let context = {};
    const clusters = {
      BusinessUnit: '-bu_cluster-',
      Organization: '-org_cluster-'
    };
    const preferenceKeys = {
      Organization: '-org_id-',
      BusinessUnit: '-business_unit-'
    };
    beforeEach(() => {
      customServiceContext._clearAll();
      customServiceContext.dbConnections[
        'core'
      ].read.query = jest.fn().mockImplementation((query, values) => {
        for (const key in preferenceKeys) {
          if (
            Object.prototype.hasOwnProperty.call(preferenceKeys, key) &&
            values.indexOf(preferenceKeys[key]) >= 0
          ) {
            return [{ cluster_id: clusters[key] }];
          }
        }
        if (values.indexOf('default') >= 0) {
          return [{ cluster_id: clusters.Default }];
        }
        return [];
      });
    });
    async function testClusterSelection(args, expectedCluster) {
      let err;
      let res;
      try {
        res = await customDal.getClusterByPreference(context, args);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBe(expectedCluster);
    }
    it('get highest preference cluster when all preference match', async () => {
      await testClusterSelection(
        {
          organization: preferenceKeys.Organization,
          businessUnit: preferenceKeys.BusinessUnit
        },
        clusters.Organization
      );
    });
    it('get highest preference cluster when some preference match', async () => {
      await testClusterSelection(
        {
          organization: '-other-org-',
          businessUnit: preferenceKeys.BusinessUnit
        },
        clusters.BusinessUnit
      );
    });
    xit('get highest preference cluster when some preference match', async function () {
      await testClusterSelection(
        {
          organization: '-other2-org-',
          businessUnit: '-other-bu-'
        },
        clusters.Default
      );
    });
  });

  describe('#getClusterByPreference - extend', () => {
    let context = {};
    const newServiceContext = require('../../../test/serviceContext.mock.js')();
    const newDal = require('./cluster.js')(newServiceContext);

    beforeEach(() => {
      context = mockUtil.makeContext();
    });

    it('should get clusterId is null when cluster preference not exists', async () => {
      let res, err;
      const args = { OrgAlwaysRun: 7682 };

      newServiceContext._clearAll();
      newServiceContext.redisCache.markCacheDirty(true);
      newServiceContext.dbConnections['core'].read._push([]);

      try {
        res = await newDal.getClusterByPreference(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeNull();
    });

    it('should get clusterId from DB when the cache is no results', async () => {
      let res, err;
      const args = { OrgAlwaysRun: 7682 };

      newServiceContext.redisCache.markCacheDirty(true);
      newServiceContext.dbConnections['core'].read._push([
        { cluster_id: 'e6ffdc5a-ce05-4f6e-8fde-abb96fa9ac38' }
      ]);

      try {
        res = await newDal.getClusterByPreference(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBe('e6ffdc5a-ce05-4f6e-8fde-abb96fa9ac38');
    });

    it('should get clusterId from cache when the cache is exists', async () => {
      let res, err;
      const args = { OrgAlwaysRun: 7682 };

      newServiceContext.redisCache.markCacheDirty(false);

      try {
        res = await newDal.getClusterByPreference(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBe('e6ffdc5a-ce05-4f6e-8fde-abb96fa9ac38'); // value get from redis
    });
  });

  describe('#setClusterByPreference', () => {
    let context = {};

    beforeEach(() => {
      serviceContext._clearAll();
      context = mockUtil.makeContext();
    });

    it('should throw error - clusterId is required', async () => {
      let res, err;
      const args = {};

      try {
        res = await dal.setClusterByPreference(context, args);
      } catch (error) {
        expect(error.message).toBe('clusterId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw error - preferenceType is required', async () => {
      let res, err;
      const args = { clusterId: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' };

      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);

      try {
        res = await dal.setClusterByPreference(context, args);
      } catch (error) {
        expect(error.message).toBe('preferenceType is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw error - preferenceKey is required', async () => {
      let res, err;
      const args = {
        clusterId: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd',
        preferenceType: 'organization'
      };

      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);

      try {
        res = await dal.setClusterByPreference(context, args);
      } catch (error) {
        expect(error.message).toBe('preferenceKey is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should set the cluster preference successfully', async () => {
      let res, err;
      const args = {
        clusterId: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd',
        preferenceType: 'organization',
        preferenceKey: '7682'
      };

      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);
      // insert preference
      serviceContext.dbConnections['core'].write._push([
        {
          preference_key: 7682,
          preference_type: 'organization',
          cluster_id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd'
        }
      ]);

      try {
        res = await dal.setClusterByPreference(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.preferenceKey).toBe(7682);
      expect(res.preferenceType).toBe('organization');
      expect(res.clusterId).toBe('cc5daf0d-7b64-4524-815e-2fcd852e92cd');
    });
  });

  //TODO update later

  // describe('#createClusterSubscription', () => {
  //   it('should create a cluster subscription', async () => {
  //     let ssoWrite = jest.fn(),
  //       subscriptionWrite = jest.fn();
  //     ssoWrite.mockImplementation(() =>
  //       Promise.resolve([
  //         {
  //           name: 'example@gmail.com',
  //           user_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
  //           kvp: {
  //             firstName: 'Demo',
  //             lastName: 'Test'
  //           }
  //         }
  //       ])
  //     );
  //     subscriptionWrite.mockImplementation(() =>
  //       Promise.resolve({
  //         id: '123',
  //         user_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
  //         is_active: true,
  //         email_address: 'example@gmail.com',
  //         object_type_id: 2
  //       })
  //     );
  //     _.set(serviceContext, 'dbConnections.sso.write.map', ssoWrite);
  //     _.set(
  //       serviceContext,
  //       'dbConnections.subscription.write.oneOrNone',
  //       subscriptionWrite
  //     );
  //     const input = {
  //       userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
  //       isActive: true
  //     };
  //     const subscription = await dal.createClusterSubscription(
  //       mockUtil.makeContext(),
  //       { input }
  //     );
  //     expect(subscription).to.exist;
  //     expect(subscription.userId).to.equal(input.userId);
  //   });
  //   it('should throw error with user notfound', async () => {
  //     let ssoWrite = jest.fn(),
  //       subscriptionWrite = jest.fn();
  //     ssoWrite.mockImplementation(() => Promise.resolve([]));
  //     subscriptionWrite.mockImplementation(() =>
  //       Promise.resolve({
  //         id: '123',
  //         user_id: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
  //         is_active: true,
  //         email_address: 'example@gmail.com',
  //         object_type_id: 2
  //       })
  //     );
  //     _.set(serviceContext, 'dbConnections.sso.write.map', ssoWrite);
  //     _.set(
  //       serviceContext,
  //       'dbConnections.subscription.write.oneOrNone',
  //       subscriptionWrite
  //     );
  //     const input = {
  //       userId: 'db82e9cb-cf29-45bb-9147-cddda9c972a4',
  //       isActive: true
  //     };
  //     let error;
  //     try {
  //       await dal.createClusterSubscription(mockUtil.makeContext(), { input });
  //     } catch (e) {
  //       error = e;
  //     }
  //     expect(error).to.exist;
  //   });
  // });
});
