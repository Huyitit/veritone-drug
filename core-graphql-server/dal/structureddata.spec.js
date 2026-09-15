const _ = require('lodash');
const mockUtil = global.mockUtil;
const Validator = require('../modules/structureddata/model/validator.js');
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

let dal, mainUtil;
const regId = '81ca224a-ae73-4f8d-9d5a-feea644d4956';

const dbRead = serviceContext.dbConnections['third_party'].read;
const dbWrite = serviceContext.dbConnections['third_party'].write;

describe('structureddata.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    dal = require('./structureddata.js')(serviceContext);
    mainUtil = require('../util.js')(serviceContext);
    _.merge(serviceContext.bll, {
      rbacAuth: {
        addDefaultACEsToResources: jest.fn(),
        removeACEsFromResources: jest.fn()
      }
    });
  });

  describe('#getDataRegistry', function () {
    it('should get as internal token', async function () {
      const context = {
        _authInfo: mockUtil.getGraphQLContext(null, 'api_internal')
      };
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getDataRegistry(context, { id: regId });
      expect(res).toBeDefined();
    });
    it('should get as org token', async function () {
      const context = mockUtil.makeContext(null, { authType: 'api_org' });
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getDataRegistry(context, {
        id: regId,
        organizationId: '7682'
      });
      expect(res).toBeDefined();
    });
    it('should get as user token', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getDataRegistry(context, {
        id: regId,
        organizationId: '7682'
      });
      expect(res).toBeDefined();
    });
    it('should not found user token', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      dbRead._push([], false);
      try {
        await dal.getDataRegistry(context, {
          id: regId,
          organizationId: '7682'
        });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });
  describe('#getDataRegistries', function () {
    it('should get as internal token', async function () {
      const context = {
        _authInfo: mockUtil.getGraphQLContext(null, 'api_internal')
      };
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getDataRegistries(context, { id: regId });
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });
    it('should get as org token', async function () {
      const context = mockUtil.makeContext(null, { authType: 'api_org' });
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getDataRegistries(context, {
        id: regId,
        organizationId: '7682'
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });
    it('should get as user token', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getDataRegistries(context, {
        id: regId,
        organizationId: '7682'
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });
    it('should get as user token - empty result', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      dbRead._push([], false);
      const res = await dal.getDataRegistries(context, {
        id: regId,
        organizationId: '7682'
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(0);
    });

    it('should getDataRegistries when useEngineGrantFlagEnabled', async () => {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(
        context,
        '_authInfo.organization.kvp.features.useEngineGrant',
        'enabled'
      );
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;

      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: regId,
            resourceType: 'schema'
          },
          {
            resourceId: 'extra_schema',
            resourceType: 'schema'
          }
        ],
        false
      );
      dbRead._push([], false, [], (sql, params) => {
        expect(sql).toContain('LEFT JOIN data_registries');
        expect(sql).toContain('OR dr.id = ANY($3::uuid[])');
        return true;
      });

      const res = await dal.getDataRegistries(context, {
        organizationId: 7682
      });

      expect(res).toBeDefined();
    });

    it('should getDataRegistries when filterByOwnership = mine', async () => {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(
        context,
        '_authInfo.organization.kvp.features.useEngineGrant',
        'enabled'
      );
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: regId,
            resourceType: 'schema'
          },
          {
            resourceId: 'extra_schema',
            resourceType: 'schema'
          }
        ],
        false
      );

      dbRead._push([], false, [], (sql, params) => {
        expect(sql).toContain('AND (drm.org_id = $1)');
        return true;
      });

      const res = await dal.getDataRegistries(context, {
        organizationId: 7682,
        filterByOwnership: 'mine'
      });

      expect(res).toBeDefined();
    });

    it('should getDataRegistries when filterByOwnership = other', async () => {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(
        context,
        '_authInfo.organization.kvp.features.useEngineGrant',
        'enabled'
      );
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: regId,
            resourceType: 'schema'
          },
          {
            resourceId: 'extra_schema',
            resourceType: 'schema'
          }
        ],
        false
      );
      dbRead._push([], false, [], (sql, params) => {
        expect(sql).toContain('drm.org_id <> $1');
        return true;
      });

      const res = await dal.getDataRegistries(context, {
        organizationId: 7682,
        filterByOwnership: 'others'
      });

      expect(res).toBeDefined();
    });

    it('should getDataRegistries select by distinct', async () => {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(
        context,
        '_authInfo.organization.kvp.features.useEngineGrant',
        'enabled'
      );
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: regId,
            resourceType: 'schema'
          },
          {
            resourceId: 'extra_schema',
            resourceType: 'schema'
          }
        ],
        false
      );
      dbRead._push([], false, [], (sql, params) => {
        expect(sql).toContain('distinct on (drm.id)');
        return true;
      });

      const res = await dal.getDataRegistries(context, {
        organizationId: 7682,
        filterByOwnership: 'others'
      });

      expect(res).toBeDefined();
    });

    it('should getDataRegistries order by name when specify', async () => {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(
        context,
        '_authInfo.organization.kvp.features.useEngineGrant',
        'enabled'
      );
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: regId,
            resourceType: 'schema'
          },
          {
            resourceId: 'extra_schema',
            resourceType: 'schema'
          }
        ],
        false
      );
      dbRead._push([], false, [], (sql, params) => {
        expect(sql).toContain('distinct on (drm.id)');
        expect(sql).toContain('ORDER BY name desc');
        return true;
      });

      const res = await dal.getDataRegistries(context, {
        organizationId: 7682,
        filterByOwnership: 'others',
        orderBy: 'name',
        orderDirection: 'desc'
      });

      expect(res).toBeDefined();
    });
  });

  describe('#upsertSchemaDraft', function () {
    it('should upsert as internal token and add default ACEs', async function () {
      const context = JSON.parse(
        JSON.stringify(mockUtil.makeContext({ authType: 'api_internal' }))
      );
      const rights = _.get(context, '_authInfo.json.rights');
      rights.push('schema:update');
      _.set(context, '_authInfo.json.rights', rights);

      // get data registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );

      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _getLatestSchemaByMajor - no existing schema
      dbWrite._push([], false);
      // _getLatestSchemaAnyMajor - no existing schema
      dbWrite._push([], false);
      // _findExistingSchemaByVersion in _createOrReuseDraft - no existing
      dbWrite._push([], false);
      // INSERT new draft
      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryMetadataId: regId,
            organizationId: 7682,
            minorVersion: 0,
            majorVersion: 1,
            status: 'draft'
          }
        ],
        false
      );

      // Mock RBAC for schema draft creation
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (context, args) => {
          expect(args.objectId).toBeDefined();
          expect(args.organizationId).toBe(7682);
          expect(args.resourceType).toBe('SDOSchema');
          return Promise.resolve();
        }
      );

      const res = await dal.upsertSchemaDraft(context, {
        organizationId: 7682,
        input: {
          dataRegistryId: regId,
          majorVersion: 1,
          schema: {}
        }
      });
      expect(res).toBeDefined();

      // Verify RBAC was called for schema draft creation
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledWith(context, {
        objectId: expect.any(String),
        organizationId: 7682,
        resourceType: 'SDOSchema'
      });
    });
    it('should upsert as internal token - with aiware.schema.update right and add default ACEs', async function () {
      const context = JSON.parse(
        JSON.stringify(mockUtil.makeContext({ authType: 'api_internal' }))
      );
      const rights = _.get(context, '_authInfo.json.rights');
      rights.push('aiware.schema.update');
      _.set(context, '_authInfo.json.rights', rights);

      // get data registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _getLatestSchemaByMajor - no existing schema
      dbWrite._push([], false);
      // _getLatestSchemaAnyMajor - no existing schema
      dbWrite._push([], false);
      // _findExistingSchemaByVersion in _createOrReuseDraft - no existing
      dbWrite._push([], false);
      // INSERT new draft
      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryMetadataId: regId,
            organizationId: 7682,
            minorVersion: 0,
            majorVersion: 1,
            status: 'draft'
          }
        ],
        false
      );

      // Mock RBAC for schema draft creation
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (context, args) => {
          expect(args.objectId).toBeDefined();
          expect(args.organizationId).toBe(7682);
          expect(args.resourceType).toBe('SDOSchema');
          return Promise.resolve();
        }
      );

      const res = await dal.upsertSchemaDraft(context, {
        organizationId: 7682,
        input: {
          dataRegistryId: regId,
          majorVersion: 1,
          schema: {}
        }
      });
      expect(res).toBeDefined();

      // Verify RBAC was called for schema draft creation
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledWith(context, {
        objectId: expect.any(String),
        organizationId: 7682,
        resourceType: 'SDOSchema'
      });
    });

    it('should fail on update in wrong org', async function () {
      const context = mockUtil.makeContext({ authType: 'api_org' });

      // get data registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7680,
            is_system: false
          }
        ],
        false
      );
      try {
        await dal.upsertSchemaDraft(context, {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            dataRegistryId: regId,
            majorVersion: 1,
            schema: {}
          }
        });
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should get not allowed as internal token without rights', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      try {
        await dal.upsertSchemaDraft(context, {
          input: {
            dataRegistryId: regId,
            majorVersion: 1,
            schema: {}
          }
        });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });
    it('should get not allowed as apiKey token without rights', async function () {
      const context = mockUtil.makeContext({ authType: 'api_org' });

      try {
        await dal.upsertSchemaDraft(context, {
          input: {
            dataRegistryId: regId,
            majorVersion: 1,
            schema: {}
          }
        });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });

    it('should upsert schema with encrypted properties and query excluded properties', async function () {
      const context = JSON.parse(
        JSON.stringify(mockUtil.makeContext({ authType: 'api_internal' }))
      );
      const rights = _.get(context, '_authInfo.json.rights');
      rights.push('schema:update');
      _.set(context, '_authInfo.json.rights', rights);

      // get data registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false,
            encryptedProperties: null,
            queryExcludedProperties: null
          }
        ],
        false
      );
      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _getLatestSchemaByMajor - no existing schema
      dbWrite._push([], false);
      // _getLatestSchemaAnyMajor - no existing schema
      dbWrite._push([], false);
      // _findExistingSchemaByVersion in _createOrReuseDraft - no existing
      dbWrite._push([], false);
      // INSERT new draft with encryptedProperties and queryExcludedProperties
      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryMetadataId: regId,
            organizationId: 7682,
            minorVersion: 0,
            majorVersion: 1,
            status: 'draft',
            encryptedProperties: ['encryptedProperty'],
            queryExcludedProperties: ['excludedProperty']
          }
        ],
        false
      );

      const res = await dal.upsertSchemaDraft(context, {
        input: {
          dataRegistryId: regId,
          majorVersion: 1,
          schema: {},
          encryptedProperties: ['encryptedProperty'],
          queryExcludedProperties: ['excludedProperty']
        }
      });
      expect(res).toBeDefined();
      expect(res.encryptedProperties).toContain('encryptedProperty');
      expect(res.queryExcludedProperties).toContain('excludedProperty');
    });
  });

  describe('#createSchemaMetadata', function () {
    it('should create as internal', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      dbWrite._push([
        {
          id: regId,
          name: 'test schema',
          description: 'test schema',
          source: 'test',
          organizationId: 7682,
          isSystem: true
        }
      ]);
      const res = await dal.createSchemaMetadata(context, {
        organizationId: 7682,
        input: {
          id: regId,
          organizationId: 7682,
          isSystem: true,
          name: 'test schema',
          description: 'test schema',
          source: 'test'
        }
      });
      expect(res.id).toEqual(regId);
    });
  });

  describe('#updateSchemaState', function () {
    const testSchemaId = '5dd35ace-cc8c-41aa-9bc8-74aa3b005002';
    const testRegistryId = '7dd35ace-bb8c-41aa-9bc8-74aa3b005099';
    it('should update schema state when non-super-admin and owner of schema', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'published'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'deleted'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'deleted'
        }
      ]);
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      const messages = serviceContext.messageUtil._messages();
      // events and public topics
      expect(messages.length).toEqual(2);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success'
        })
      );
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('deleted');
      expect(serviceContext.messageUtil._counter()).toEqual(2);
    });
    it('should throw error when non-super-admin and owner of schema', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'published'
        }
      ]);

      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(res).toBeUndefined();
      expect(error).toBeDefined();
      expect(error.message).toEqual('Failed to delete schema');
      // should trigger the event with the failure actionResult
      expect(serviceContext.messageUtil._counter()).toEqual(2);
    });
    it('should throw error when non-super-admin and not owner of schema', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'published'
        }
      ]);
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(res).toBeUndefined();
      expect(error.name).toEqual('not_allowed');
      expect(_.toString(error)).toContain(
        'The authenticated user or token does not have privileges ' +
          'to update the state of a schema that belongs to another organization.'
      );
      // should trigger the event with the failure actionResult since input/access validation is now part of the try block
      expect(serviceContext.messageUtil._counter()).toEqual(2);
    });
    it('should update when super-admin and not owner of schema', async function () {
      const context = {
        ...mockUtil.makeContext(),
        _authInfo: {
          organization: {
            organizationId: 7682
          },
          permissionMasks: [2]
        }
      };
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'published'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'deleted'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'deleted'
        }
      ]);
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('deleted');
    });
    it('should update when super-admin and owner of schema', async function () {
      const context = {
        ...mockUtil.makeContext(),
        _authInfo: {
          organization: {
            organizationId: 7682
          },
          permissionMasks: [2]
        }
      };
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'published'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'deleted'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'deleted'
        }
      ]);
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('deleted');
    });
    it('should update when internal and not owner of schema', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'published'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'deleted'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 1,
          status: 'deleted'
        }
      ]);
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('deleted');
    });
    it('should update when internal and owner of schema', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'published'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'deleted'
        }
      ]);
      dbWrite._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'deleted'
        }
      ]);
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'deleted'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('deleted');
    });
    it('should publish schema and also deactivate other schemas by major version', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      // get schema
      dbRead._push(
        [
          {
            id: testSchemaId,
            organizationId: 7682,
            status: 'draft',
            majorVersion: 1,
            minorVersion: 1,
            storageName: null,
            dataRegistryMetadataId: testRegistryId,
            schema: {
              type: 'object',
              title: 'cantv-test-local-001',
              required: ['email'],
              properties: {
                email: {
                  type: 'string'
                },
                userName: {
                  type: 'string'
                }
              },
              description: 'For testing'
            }
          }
        ],
        false
      );
      // get registry
      dbRead._push(
        [
          {
            id: testRegistryId,
            name: 'test registry',
            org_id: 7682,
            is_public: false
          }
        ],
        false
      );
      // checkCompatibility
      dbRead._push(
        [
          // previous schema
          {
            id: 'previous-schema-id',
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: 'sdo_test_registry_existing',
            dataRegistryMetadataId: testRegistryId,
            schema: {
              type: 'object',
              title: 'cantv-test-local-001',
              required: ['email'],
              properties: {
                email: {
                  type: 'string'
                }
              },
              description: 'For testing'
            }
          }
        ],
        false
      );
      // checkCompatibility --> another call
      dbRead._push([], false);

      // getSchemas - inheritance check
      dbRead._push(
        [
          {
            id: 'previous-schema-id',
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: 'sdo_test_registry_existing',
            dataRegistryMetadataId: testRegistryId
          }
        ],
        false
      );

      // update state for the current schema
      dbWrite._push(
        [
          {
            id: testSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 1,
            storageName: 'sdo_test_registry_existing',
            dataRegistryMetadataId: testRegistryId,
            schema: {
              type: 'object',
              title: 'cantv-test-local-001',
              required: ['email'],
              properties: {
                email: {
                  type: 'string'
                },
                userName: {
                  type: 'string'
                }
              },
              description: 'For testing'
            }
          }
        ],
        false
      );
      // _deactivateSchemas: update other schemas to inactive
      //  ==> Get schemas before updating to clear the cache
      dbRead._push(
        [
          {
            id: 'previous-schema-id',
            organizationId: 7682,
            status: 'published'
          }
        ],
        false
      );
      //  ==> Deactivate schemas
      dbWrite._push(
        [
          {
            id: 'previous-schema-id',
            organizationId: 7682,
            status: 'inactive'
          }
        ],
        false
      );
      // update schema properties
      dbWrite._push(
        [
          {
            id: testSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 1,
            storageName: 'sdo_test_registry_existing',
            dataRegistryMetadataId: testRegistryId,
            schema: {
              type: 'object',
              title: 'cantv-test-local-001',
              required: ['email'],
              properties: {
                email: {
                  type: 'string'
                },
                userName: {
                  type: 'string'
                }
              },
              description: 'For testing'
            }
          }
        ],
        false
      );
      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'published'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('published');
    });

    it('should inherit storageName when publishing minor version draft', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      const minorSchemaId = '8dd35ace-cc8c-41aa-9bc8-74aa3b005004';
      const existingStorageName = 'sdo_test_registry_1_xyz789';

      // get schema (draft v1.2)
      dbRead._push(
        [
          {
            id: minorSchemaId,
            organizationId: 7682,
            status: 'draft',
            majorVersion: 1,
            minorVersion: 2,
            storageName: null,
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' },
                userName: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // get registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            org_id: 7682,
            is_public: false
          }
        ],
        false
      );

      // checkCompatibility - get published v1.0
      dbRead._push(
        [
          {
            id: 'published-v1.0-id',
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: existingStorageName,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // checkCompatibility - another call
      dbRead._push([], false);

      // getSchemas - inheritance check (get published v1.0)
      dbRead._push(
        [
          {
            id: 'published-v1.0-id',
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: existingStorageName,
            dataRegistryMetadataId: regId
          }
        ],
        false
      );

      // update schema to published
      dbWrite._push(
        [
          {
            id: minorSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 2,
            storageName: existingStorageName,
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' },
                userName: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // _deactivateSchemas - get schemas
      dbRead._push(
        [
          {
            id: 'published-v1.0-id',
            organizationId: 7682,
            status: 'published'
          }
        ],
        false
      );

      // _deactivateSchemas - update inactive
      dbWrite._push(
        [
          {
            id: 'published-v1.0-id',
            organizationId: 7682,
            status: 'inactive'
          }
        ],
        false
      );

      // updateSchemaProperties
      dbWrite._push([{}], false);

      const res = await dal.updateSchemaState(context, {
        organizationId: 7682,
        input: {
          id: minorSchemaId,
          status: 'published'
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toEqual(minorSchemaId);
      expect(res.status).toEqual('published');
    });

    it('should create new storage when publishing draft with breakingChanges true (draft has inherited storageName)', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      const draftSchemaId = '9dd35ace-cc8c-41aa-9bc8-74aa3b005009';
      const inheritedStorageName = 'sdo_test_registry_1_abc123';
      const majorVersionSchemaId = '8dd35ace-cc8c-41aa-9bc8-74aa3b005010';

      // get schema (draft v1.1 with inherited storageName from upsertSchemaDraft)
      dbRead._push(
        [
          {
            id: draftSchemaId,
            organizationId: 7682,
            status: 'draft',
            majorVersion: 1,
            minorVersion: 1,
            storageName: inheritedStorageName,
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' },
                newField: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // get registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            org_id: 7682,
            is_public: false
          }
        ],
        false
      );

      // _getInheritedStorageName (v1.x exists, returns storageName)
      dbRead._push(
        [
          {
            id: majorVersionSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: inheritedStorageName
          }
        ],
        false
      );

      // getSchemas for max version (breakingChanges bumps major version)
      dbRead._push(
        [
          {
            id: majorVersionSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: inheritedStorageName,
            dataRegistryMetadataId: regId
          }
        ],
        false
      );

      // createTable - new storage table
      dbWrite._push([], false);

      // update schema to published with new major version and new storage
      dbWrite._push(
        [
          {
            id: draftSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 2,
            minorVersion: 0,
            storageName: 'sdo_test_regi_2_newrandom',
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' },
                newField: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // _deactivateSchemas - get schemas
      dbRead._push([], false);

      // updateSchemaProperties
      dbWrite._push([{}], false);

      const res = await dal.updateSchemaState(context, {
        organizationId: 7682,
        input: {
          id: draftSchemaId,
          status: 'published',
          breakingChanges: true
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toEqual(draftSchemaId);
      expect(res.status).toEqual('published');
      // Verify new storage was created (not inherited)
      expect(res.storageName).not.toEqual(inheritedStorageName);
    });

    it('should create new storage when publishing first draft (v1.0) with breakingChanges true', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      const firstDraftSchemaId = 'add35ace-cc8c-41aa-9bc8-74aa3b005011';

      // get schema (draft v1.0 - first schema)
      dbRead._push(
        [
          {
            id: firstDraftSchemaId,
            organizationId: 7682,
            status: 'draft',
            majorVersion: 1,
            minorVersion: 0,
            storageName: null,
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // get registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            org_id: 7682,
            is_public: false
          }
        ],
        false
      );

      // _getInheritedStorageName (returns null - first v1.x)
      dbRead._push([], false);

      // createTable - new storage table
      dbWrite._push([], false);

      // update schema to published (v1.0 stays at v1.0, but gets new storage)
      dbWrite._push(
        [
          {
            id: firstDraftSchemaId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 1,
            minorVersion: 0,
            storageName: 'sdo_test_regi_1_newrandom',
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // _deactivateSchemas - get schemas
      dbRead._push([], false);

      // updateSchemaProperties
      dbWrite._push([{}], false);

      const res = await dal.updateSchemaState(context, {
        organizationId: 7682,
        input: {
          id: firstDraftSchemaId,
          status: 'published',
          breakingChanges: true
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toEqual(firstDraftSchemaId);
      expect(res.status).toEqual('published');
      // v1.0 should create its own storage
      expect(res.storageName).toBeDefined();
    });

    it('should create new storage when publishing major version draft (v2.0) WITHOUT breakingChanges flag', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      const majorVersionDraftId = 'bdd35ace-cc8c-41aa-9bc8-74aa3b005012';
      const inheritedStorageName = 'sdo_table_abc'; // This was copied from v1.0 by import/script

      // get schema (draft v2.0 with inherited storageName from previous import)
      dbRead._push(
        [
          {
            id: majorVersionDraftId,
            organizationId: 7682,
            status: 'draft',
            majorVersion: 2,
            minorVersion: 0,
            storageName: inheritedStorageName,
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' },
                newField: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // get registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            org_id: 7682,
            is_public: false
          }
        ],
        false
      );

      // checkCompatibility - get published schema of same major version (empty for v2.0)
      dbRead._push([], false);

      // _getInheritedStorageName (returns null - first v2.x)
      dbRead._push([], false);

      // createTable - new storage table (major version gets new storage)
      dbWrite._push([], false);

      // update schema to published with new storage
      dbWrite._push(
        [
          {
            id: majorVersionDraftId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 2,
            minorVersion: 0,
            storageName: 'sdo_test_regi_2_newrandom',
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' },
                newField: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // _deactivateSchemas - get schemas
      dbRead._push([], false);

      // updateSchemaProperties
      dbWrite._push([{}], false);

      const res = await dal.updateSchemaState(context, {
        organizationId: 7682,
        input: {
          id: majorVersionDraftId,
          status: 'published'
          // NOTE: NO breakingChanges flag!
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toEqual(majorVersionDraftId);
      expect(res.status).toEqual('published');
      // Major version should create new storage even WITHOUT breakingChanges flag
      expect(res.storageName).not.toEqual(inheritedStorageName);
    });

    it('should create new storage when publishing first schema of major version (v2.2 jump, no v2.0/v2.1 exists)', async function () {
      // This test covers the edge case: v1.2 exists, then v2.2 draft created directly
      // (skipping v2.0, v2.1). Since v2.2 is the FIRST v2.x schema, it should get new storage.
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      const jumpVersionDraftId = 'cdd35ace-cc8c-41aa-9bc8-74aa3b005013';
      const inheritedStorageFromV1 = 'sdo_table_v1'; // Inherited from v1.2 by import/script

      // get schema (draft v2.2, first v2.x schema, with inherited storageName)
      dbRead._push(
        [
          {
            id: jumpVersionDraftId,
            organizationId: 7682,
            status: 'draft',
            majorVersion: 2,
            minorVersion: 2, // NOT 0, but first v2.x schema
            storageName: inheritedStorageFromV1,
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // get registry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            org_id: 7682,
            is_public: false
          }
        ],
        false
      );

      // checkCompatibility - get published schema of same major version (empty, no v2.x exists)
      dbRead._push([], false);

      // _getInheritedStorageName (returns null - first v2.x)
      dbRead._push([], false);

      // createTable - new storage table (first of major version gets new storage)
      dbWrite._push([], false);

      // update schema to published with new storage
      dbWrite._push(
        [
          {
            id: jumpVersionDraftId,
            organizationId: 7682,
            status: 'published',
            majorVersion: 2,
            minorVersion: 2,
            storageName: 'sdo_test_regi_2_newrandom',
            dataRegistryMetadataId: regId,
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string' }
              }
            }
          }
        ],
        false
      );

      // _deactivateSchemas - get schemas
      dbRead._push([], false);

      // updateSchemaProperties
      dbWrite._push([{}], false);

      const res = await dal.updateSchemaState(context, {
        organizationId: 7682,
        input: {
          id: jumpVersionDraftId,
          status: 'published'
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toEqual(jumpVersionDraftId);
      expect(res.status).toEqual('published');
      // First schema of major version should get NEW storage, not inherit from v1.x
      expect(res.storageName).not.toEqual(inheritedStorageFromV1);
    });
  });

  describe('#updateSchemaMetadata', function () {
    it('should update as user', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      dbWrite._push([
        {
          id: regId,
          name: 'new name',
          organizationId: 7682
        }
      ]);
      const res = await dal.updateSchemaMetadata(context, {
        organizationId: 7682,
        input: {
          id: regId,
          name: 'new name',
          organizationId: 7682
        }
      });
      expect(res).toBeDefined();
    });

    it('should not found', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      dbWrite._push([]);
      try {
        const res = await dal.updateSchemaMetadata(context, {
          organizationId: 7682,
          input: {
            id: regId,
            name: 'new name',
            organizationId: 7682
          }
        });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });
  describe('#getStructuredDataObjects', function () {
    const mockSdoResponse = {
      id: regId,
      dataRegistryId: regId,
      data: {
        foo: 'bar'
      },
      organizationId: 7682,
      applicationId: '123',
      name: 'data registry'
    };
    const filteredSdoSearchDbMock = (options = { skipSDOSearch: false }) => {
      dbRead._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123'
          }
        ],
        false
      );
      dbRead._push(
        [
          {
            id: regId,
            name: 'data registry',
            isSystem: false
          }
        ],
        false
      );

      if (options.skipSDOSearch) return;
      // SDO search
      dbRead._push([mockSdoResponse], false);
    };
    const filteredSdoSearchInfoMock = {
      schema: {
        _typeMap: {
          SdoDateTimeField: {
            _values: [{ name: 'createdAt' }, { name: 'updatedAt' }]
          }
        }
      }
    };
    it('should get SDOs by id', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      dbRead._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123'
          }
        ],
        false
      );
      dbRead._push(
        [
          {
            id: regId,
            name: 'data registry',
            isSystem: false
          }
        ],
        false
      );
      dbRead._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            data: {
              foo: 'bar'
            },
            organizationId: 7682,
            applicationId: '123',
            name: 'data registry'
          }
        ],
        false
      );

      const res = await dal.getStructuredDataObjects(context, {
        organizationId: 7682,
        ids: [regId],
        owned: true,
        schemaId: regId,
        orderBy: [
          {
            field: 'createdDateTime',
            direction: 'asc'
          }
        ]
      });
    });

    it('should throw an error when fetching SDOs with incorrect dateTime filter', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      filteredSdoSearchDbMock();
      const getSDOs = async () =>
        await dal.getStructuredDataObjects(
          context,
          {
            organizationId: 7682,
            owned: true,
            schemaId: regId,
            dateTimeFilter: {
              fromDateTime: '2021-01-01T00:00:00Z'
            }
          },
          filteredSdoSearchInfoMock
        );
      expect(getSDOs()).rejects.toThrow('Invalid dateTime filter provided');
    });

    it('should throw an error when fetching SDOs with incorrect dateTime filter - fromDate is after toDate', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      filteredSdoSearchDbMock();
      const getSDOs = async () =>
        await dal.getStructuredDataObjects(
          context,
          {
            organizationId: 7682,
            owned: true,
            schemaId: regId,
            dateTimeFilter: {
              field: 'createdAt',
              fromDateTime: '2021-01-01T00:00:00Z',
              toDateTime: '2020-01-01T00:00:00Z'
            }
          },
          filteredSdoSearchInfoMock
        );
      expect(getSDOs()).rejects.toThrow('From date cannot be after to date');
    });

    it('should throw an error when fetching SDOs with incorrect dateTime filter - no range', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      filteredSdoSearchDbMock();
      const getSDOs = async () =>
        await dal.getStructuredDataObjects(
          context,
          {
            organizationId: 7682,
            owned: true,
            schemaId: regId,
            dateTimeFilter: {
              field: 'createdAt'
            }
          },
          filteredSdoSearchInfoMock
        );
      expect(getSDOs()).rejects.toThrow('At least one date must be provided');
    });

    it('should throw an error when fetching SDOs with incorrect dateTime filter - empty filter', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      filteredSdoSearchDbMock();
      const getSDOs = async () =>
        await dal.getStructuredDataObjects(
          context,
          {
            organizationId: 7682,
            owned: true,
            schemaId: regId,
            dateTimeFilter: {}
          },
          filteredSdoSearchInfoMock
        );
      expect(getSDOs()).rejects.toThrow('DateTime filter cannot be empty');
    });

    it('validates filters and returns results', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      filteredSdoSearchDbMock();
      const sdo = await dal.getStructuredDataObjects(
        context,
        {
          organizationId: 7682,
          owned: true,
          schemaId: regId,
          filter: {
            name: '911 audio'
          },
          dateTimeFilter: {
            field: 'createdAt',
            fromDateTime: '2021-01-01T00:00:00Z'
          }
        },
        filteredSdoSearchInfoMock
      );
      expect(sdo).toEqual(
        expect.objectContaining({ records: [mockSdoResponse] })
      );
    });

    it('should apply RBAC auth filter when provided', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      const mockAuthFilter = jest.fn((idField, argNum, dataRegistryField) => ({
        join: `JOIN public.acl_sdo _acl_sdo_ ON ${idField}= _acl_sdo_.sdo_id`,
        where: `(_acl_sdo_.auth_group_id=ANY($${argNum}::uuid[]) AND _acl_sdo_.permission_set_id=ANY($${argNum + 1}::uuid[]))`,
        args: [['auth-group-id'], ['permission-set-id']],
        metadata: {
          resourceType: 'SDO'
        }
      }));
      context._rbacAuthFilter = mockAuthFilter;

      filteredSdoSearchDbMock({ skipSDOSearch: true });
      dbRead._push([mockSdoResponse], false, [], (sql, params) => {
        expect(sql).toContain('public.acl_sdo _acl_sdo_');
        expect(sql).toContain('(_acl_sdo_.auth_group_id=ANY($');
        expect(sql).toContain('_acl_sdo_.permission_set_id=ANY($');
        expect(params[0]).toEqual(expect.arrayContaining(['auth-group-id']));
        expect(params[1]).toEqual(
          expect.arrayContaining(['permission-set-id'])
        );
        return true;
      });

      const result = await dal.getStructuredDataObjects(context, {
        organizationId: 7682,
        schemaId: regId,
        owned: true
      });
      expect(mockAuthFilter).toHaveBeenCalledWith(
        'sdo.id',
        1,
        'sdo.data_registry_id'
      );
      expect(result).toEqual(
        expect.objectContaining({ records: [mockSdoResponse] })
      );
    });

    it('should handle RBAC auth filter with non-SDO resource type', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      const mockAuthFilter = jest.fn((idField, argNum, dataRegistryField) => ({
        join: `JOIN rbac.acl_recording _acl_r_ ON (${idField})::text=_acl_r_.recording_id`,
        where: `(_acl_r_.auth_group_id=ANY($${argNum}::uuid[]))`,
        args: ['auth-group-id'],
        metadata: {
          resourceType: 'TDO' // Different resource type
        }
      }));
      context._rbacAuthFilter = mockAuthFilter;

      filteredSdoSearchDbMock({ skipSDOSearch: true });
      dbRead._push([mockSdoResponse], false, [], (sql, params) => {
        expect(sql).not.toContain('JOIN rbac.acl_recording _acl_r_');
        expect(params[0]).toEqual(7682);
        return true;
      });

      const result = await dal.getStructuredDataObjects(context, {
        organizationId: 7682,
        schemaId: regId,
        owned: true
      });

      expect(mockAuthFilter).toHaveBeenCalledWith(
        'sdo.id',
        1,
        'sdo.data_registry_id'
      );
      expect(result).toEqual(
        expect.objectContaining({ records: [mockSdoResponse] })
      );
    });
  });
  describe('mapDateFilterField', () => {
    it('should map modifiedAt to updatedAt', () => {
      expect(dal.mapDateFilterField('modifiedAt')).toBe('updatedAt');
    });

    it('should map updatedAt to updatedAt', () => {
      expect(dal.mapDateFilterField('updatedAt')).toBe('updatedAt');
    });

    it('should map createdAt to createdAt', () => {
      expect(dal.mapDateFilterField('createdAt')).toBe('createdAt');
    });

    it('should return undefined if not in mapping', () => {
      expect(dal.mapDateFilterField('otherField')).toBe(undefined);
    });
  });

  describe('#deleteStructuredData', function () {
    it('should delete structured data and emit 2 event messageUtil ', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      // get schema
      dbRead._push(
        [
          {
            id: regId,
            name: 'test schema',
            description: 'test schema',
            source: 'test',
            org_id: 7682,
            isSystem: true,
            data_registry_metadata_id: regId,
            storageName: 'storage123'
          }
        ],
        false
      );
      // get structured data from schema storage table
      dbRead._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123',
            organizationId: 7682
          }
        ],
        false
      );
      // delete structured data from schema storage table
      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123'
          }
        ],
        false
      );

      serviceContext.bll.rbacAuth.removeACEsFromResources.mockResolvedValueOnce();

      const res = await dal.deleteStructuredData(
        {
          organizationId: 7682,
          input: {
            id: regId,
            organizationId: 7682,
            schemaId: regId
          }
        },
        context
      );
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success',
          actionDetails: `Deleted SDO ${regId} using schema ${regId}`
        })
      );
      expect(res.id).toEqual(regId);
      expect(
        serviceContext.bll.rbacAuth.removeACEsFromResources
      ).toHaveBeenCalledWith(context, {
        resourceIds: [regId],
        organizationId: 7682,
        resourceType: 'SDO',
        dataRegistryId: regId
      });
    });

    it('User does not have permission to delete SDO', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      // get schema
      dbRead._push(
        [
          {
            id: regId,
            name: 'test schema',
            description: 'test schema',
            source: 'test',
            org_id: 7682,
            isSystem: true,
            data_registry_metadata_id: regId,
            storageName: 'storage123'
          }
        ],
        false
      );
      // get structured data from schema storage table
      dbRead._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123',
            organizationId: 7683
          }
        ],
        false
      );

      try {
        const res = await dal.deleteStructuredData(
          {
            organizationId: 7682,
            input: {
              id: regId,
              organizationId: 7682,
              schemaId: regId
            }
          },
          context
        );
        expect(serviceContext.messageUtil._counter()).toEqual(2);
        expect(res.id).toEqual(regId);
      } catch (err) {
        expect(err).toBeDefined();
        const messages = serviceContext.messageUtil._messages();
        expect(messages.length).toEqual(1);
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'delete',
            actionResult: 'failure',
            actionDetails: `Failed to delete SDO ${regId} using schema ${regId}`
          })
        );
        const errMsg = `${err}`;
        expect(errMsg).toContain('not_found');
        expect(errMsg).toContain(
          'This user does not have access to this SDO ID'
        );
      }
    });

    it('should not call delete structured data if not found and emit 2 event messageUtil ', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      // get schema
      dbRead._push(
        [
          {
            id: regId,
            name: 'test schema',
            description: 'test schema',
            source: 'test',
            org_id: 7682,
            isSystem: true,
            data_registry_metadata_id: regId,
            storageName: 'storage123'
          }
        ],
        false
      );
      // get structured data from schema storage table
      dbRead._push([], false);

      const res = await dal.deleteStructuredData(
        {
          organizationId: 7682,
          input: {
            id: regId,
            organizationId: 7682,
            schemaId: regId
          }
        },
        context
      );
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      expect(res.id).toEqual(regId);
    });

    it('should delete structured data when organizationId is a numeric string', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      // get schema
      dbRead._push(
        [
          {
            id: regId,
            name: 'test schema',
            description: 'test schema',
            source: 'test',
            org_id: 7682,
            isSystem: true,
            data_registry_metadata_id: regId,
            storageName: 'storage123'
          }
        ],
        false
      );
      // get structured data from schema storage table
      dbRead._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123',
            organizationId: 7682
          }
        ],
        false
      );
      // delete structured data from schema storage table
      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryId: regId,
            storageName: 'storage123'
          }
        ],
        false
      );

      serviceContext.bll.rbacAuth.removeACEsFromResources.mockResolvedValueOnce();

      const res = await dal.deleteStructuredData(
        {
          organizationId: 7682,
          input: {
            id: regId,
            organizationId: '7682',
            schemaId: regId
          }
        },
        context
      );
      expect(res.id).toEqual(regId);
    });

    it('should throw InvalidInput error when organizationId is NOT a numeric string', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      try {
        await dal.deleteStructuredData(
          {
            organizationId: 7682,
            input: {
              id: regId,
              organizationId: 'not-a-number',
              schemaId: regId
            }
          },
          context
        );
        jest.fail('Should have thrown an error');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('The provided value, not-a-number, is not valid.');
      }
    });

    it('should throw InvalidInput error when schemaId is NOT a UUID', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });

      try {
        await dal.deleteStructuredData(
          {
            organizationId: 7682,
            input: {
              id: regId,
              organizationId: 7682,
              schemaId: 'not-a-uuid'
            }
          },
          context
        );
        jest.fail('Should have thrown an error');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('The provided value, not-a-uuid, is not valid.');
      }
    });
  });

  describe('#emitStructuredDataEvent', function () {
    it('should throw an error if the payload is not passed in', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      let err;
      try {
        await dal.emitStructuredDataEvent(context, null);
      } catch (e) {
        err = e;
      }

      expect(serviceContext.messageUtil._counter()).toEqual(0);
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`the payload is required`);
    });
    it('should throw an error if the payload is not an object', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      let err;
      try {
        await dal.emitStructuredDataEvent(context, true);
      } catch (e) {
        err = e;
      }

      expect(serviceContext.messageUtil._counter()).toEqual(0);
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`the payload should be an object`);
    });
    it('shoul emit 1 event if it is a failure event', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      const payload = {
        id: 'test-id',
        schemaId: 'schema-id'
      };
      await dal.emitStructuredDataEvent(
        context,
        payload,
        new Error('failed to create SDO'),
        'create'
      );
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
    it('should emit 2 events if it is an event without an error', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      const payload = {
        id: 'test-id',
        schemaId: 'schema-id'
      };
      await dal.emitStructuredDataEvent(context, payload, null, 'create');
      expect(serviceContext.messageUtil._counter()).toEqual(2);
    });
  });

  describe('#emitDataRegistryEvent', function () {
    it('should throw an error if the payload is not passed in', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      let err;
      try {
        await dal.emitDataRegistryEvent(context, null);
      } catch (e) {
        err = e;
      }

      expect(serviceContext.messageUtil._counter()).toEqual(0);
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`the payload is required`);
    });
    it('should throw an error if the payload is not an object', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      let err;
      try {
        await dal.emitDataRegistryEvent(context, true);
      } catch (e) {
        err = e;
      }

      expect(serviceContext.messageUtil._counter()).toEqual(0);
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`the payload should be an object`);
    });
    it('shoul emit only 1 public event', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      const payload = {
        id: 'test-id',
        schemaId: 'schema-id'
      };
      await dal.emitDataRegistryEvent(context, payload, null, 'create');
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
  });

  describe('#getSchemas', function () {
    it('should get as user token - empty result', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      const res = await dal.getSchemas(context, {
        ids: [regId],
        organizationId: '7682'
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });

    it('should get with package enforcement', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(
        context,
        '_authInfo.organization.kvp.features.useEngineGrant',
        'enabled'
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: regId,
            resourceType: 'schema'
          },
          {
            resourceId: 'extra_schema',
            resourceType: 'schema'
          }
        ],
        false
      );

      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false,
        [],
        (sql, args) => {
          expect(args[0]).toEqual([regId]);
          return true;
        }
      );
      const res = await dal.getSchemas(context, {
        ids: [regId],
        organizationId: '7682'
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });

    describe('should filter by accessScope', () => {
      it('should get as user token - filter by owned and public scopes', async function () {
        const context = mockUtil.makeContext(null, { authType: 'user' });
        dbRead._push(
          [
            {
              id: regId,
              name: 'test registry',
              organizationId: 7682,
              is_system: false
            }
          ],
          false,
          [],
          (sql) => {
            expect(sql).toMatch(/WHERE.*\(org_id\s=/);
            expect(sql).toMatch(
              /WHERE.*OR\sdata_registry_metadata_id\sIN.*is_public\s\=\strue/
            );

            return true;
          }
        );
        const res = await dal.getSchemas(context, {
          ids: [regId],
          organizationId: '7682',
          accessScope: ['owned', 'public']
        });
        expect(res).toBeDefined();
        expect(res.count).toEqual(1);
      });
      it('should get as user token - return empty if filter by granted scope', async function () {
        const context = mockUtil.makeContext(null, { authType: 'user' });
        const res = await dal.getSchemas(context, {
          ids: [regId],
          organizationId: '7682',
          accessScope: ['owned', 'granted']
        });
        expect(res).toBeDefined();
        expect(res.count).toEqual(0);
      });
      it('should get with package enforcement - filter by any scope', async function () {
        const context = mockUtil.makeContext(null, { authType: 'user' });
        _.set(
          context,
          '_authInfo.organization.kvp.features.useEngineGrant',
          'enabled'
        );
        serviceContext.dbConnections['core'].read._push(
          [
            {
              resourceId: regId,
              resourceType: 'schema'
            },
            {
              resourceId: 'extra_schema',
              resourceType: 'schema'
            }
          ],
          false
        );

        dbRead._push(
          [
            {
              id: regId,
              name: 'test registry',
              organizationId: 7682,
              is_system: false
            }
          ],
          false,
          [],
          (sql) => {
            expect(sql).toMatch(/WHERE.*id.*OR/);
            expect(sql).toMatch(/WHERE.*org_id\s=/);
            expect(sql).toMatch(
              /WHERE.*OR\sdata_registry_metadata_id\sIN.*is_public\s\=\strue/
            );
            return true;
          }
        );
        const res = await dal.getSchemas(context, {
          organizationId: '7682',
          dataRegistryMetadataId: 'metadata_id',
          accessScope: ['any', 'owned']
        });
        expect(res).toBeDefined();
        expect(res.count).toEqual(1);
      });
      it('should get with package enforcement - filter by owned and granted scopes', async function () {
        const context = mockUtil.makeContext(null, { authType: 'user' });
        _.set(
          context,
          '_authInfo.organization.kvp.features.useEngineGrant',
          'enabled'
        );
        serviceContext.dbConnections['core'].read._push(
          [
            {
              resourceId: regId,
              resourceType: 'schema'
            },
            {
              resourceId: 'extra_schema',
              resourceType: 'schema'
            }
          ],
          false
        );

        dbRead._push(
          [
            {
              id: regId,
              name: 'test registry',
              organizationId: 7682,
              is_system: false
            }
          ],
          false,
          [],
          (sql) => {
            expect(sql).toMatch(/WHERE.*id.*OR/);
            expect(sql).toMatch(/WHERE.*org_id\s=/);
            expect(sql).not.toMatch(
              /WHERE.*OR\sdata_registry_metadata_id\sIN.*is_public\s\=\strue/
            );
            return true;
          }
        );
        const res = await dal.getSchemas(context, {
          organizationId: '7682',
          dataRegistryMetadataId: 'metadata_id',
          accessScope: ['owned', 'granted']
        });
        expect(res).toBeDefined();
        expect(res.count).toEqual(1);
      });
      it('should get with package enforcement - filter by ids and owned scope', async function () {
        const context = mockUtil.makeContext(null, { authType: 'user' });
        _.set(
          context,
          '_authInfo.organization.kvp.features.useEngineGrant',
          'enabled'
        );
        serviceContext.dbConnections['core'].read._push(
          [
            {
              resourceId: regId,
              resourceType: 'schema'
            },
            {
              resourceId: 'extra_schema',
              resourceType: 'schema'
            }
          ],
          false
        );

        dbRead._push(
          [
            {
              id: regId,
              name: 'test registry',
              organizationId: 7682,
              is_system: false
            }
          ],
          false,
          [],
          (sql) => {
            expect(sql).toMatch(/WHERE.*id.*OR/);
            expect(sql).toMatch(/.*AND\s\(org_id\s=/);
            return true;
          }
        );
        const res = await dal.getSchemas(context, {
          ids: [regId],
          organizationId: '7682',
          accessScope: ['owned']
        });
        expect(res).toBeDefined();
        expect(res.count).toEqual(1);
      });
    });
  });

  describe('#createSchema', function () {
    const schemaId = '0c80ed06-fd8d-4ef3-a42d-72ca88af663a';
    const input = Object.freeze({
      id: schemaId,
      dataRegistryId: regId,
      definition: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string'
          },
          title: {
            type: 'string'
          }
        },
        description: 'test schema'
      },
      majorVersion: 1,
      minorVersion: 2,
      status: 'draft'
    });

    const newSchema = Object.freeze({
      id: input.id,
      organizationId: 7682,
      dataRegistryMetadataId: input.dataRegistryId,
      majorVersion: input.majorVersion,
      minorVersion: input.minorVersion,
      schema: input.definition,
      status: input.status,
      storageName: null,

      createdBy: '233f9f21-6d7c-4f2a-9853-17792c1a5fc6',
      modifiedBy: '233f9f21-6d7c-4f2a-9853-17792c1a5fc6',
      createdDateTime: '2022-10-04T21:14:22.548Z',
      modifiedDateTime: '2022-10-04T21:14:22.548Z'
    });

    const schemaProperties = Object.freeze({
      data_registry_metadata_id: input.dataRegistryId,
      major_version: 2,
      storage_name: 'test-storage-name',
      path: 'test-pathh',
      type: 'test-type',
      title: 'test-title'
    });

    const dataReg = {
      id: regId,
      name: 'test registry',
      organizationId: 7682,
      is_system: false
    };

    const getContextWithAuth = (
      { shouldFail, appendRights = ['schema:update'] } = {},
      authType = 'api_internal'
    ) => {
      let context = mockUtil.makeContext({ authType });
      if (!shouldFail) {
        const rights = _.get(context, '_authInfo.json.rights');
        context._authInfo.json.rights = [...rights, ...appendRights];
      }
      return context;
    };

    it('should not insert new schema without schema:update right', async () => {
      const context = getContextWithAuth({ shouldFail: true });
      try {
        await dal.createSchema(context, { input });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });

    it('should fail if data registry does not exist', async () => {
      const context = getContextWithAuth();

      const modifiedInput = { ...input, status: 'inactive', definition: '' };
      try {
        await dal.createSchema(context, { input: modifiedInput });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('Schema has to be a JSON object');
      }
    });

    it('should fail if data registry does not exist', async () => {
      const context = getContextWithAuth();

      // prepare db
      dbRead._push([], false); // no data registries with given id

      try {
        await dal.createSchema(context, { input });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should fail if there is schema with same ID', async () => {
      const context = getContextWithAuth();

      // prepare DB
      dbRead._push([dataReg], false); // getDataRegistry - data registry found

      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - schema with same ID exists
      dbWrite._push([newSchema], false);

      try {
        await dal.createSchema(context, { input });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('resource_conflict');
        expect(err.message).toEqual('duplicate schema ID');
      }
    });

    it('should fail if there is schema with same majorVersion', async () => {
      const context = getContextWithAuth();

      // prepare DB
      dbRead._push([dataReg], false); // getDataRegistry - data registry found

      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - no schema with same ID
      dbWrite._push([], false);
      // _findExistingSchemaByVersion - schema with same version exists
      dbWrite._push([newSchema], false);

      try {
        await dal.createSchema(context, { input });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('resource_conflict');
        expect(err.message).toEqual(
          `a schema with version ${input.majorVersion}.${input.minorVersion} already exists`
        );
      }
    });

    it('should insert new schema with internal token and add default ACEs', async function () {
      // set correct right for internal token
      const context = getContextWithAuth();

      // prepare DB
      dbRead._push([dataReg], false); // for getDataRegistry
      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - no schema with same ID
      dbWrite._push([], false);
      // _findExistingSchemaByVersion - no schema with same version
      dbWrite._push([], false);
      // INSERT new schema
      dbWrite._push([newSchema], false);

      // Mock RBAC for schema creation
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (context, args) => {
          expect(args.objectId).toBe(newSchema.id);
          expect(args.organizationId).toBe(7682);
          expect(args.resourceType).toBe('SDOSchema');
          return Promise.resolve();
        }
      );

      const result = await dal.createSchema(context, {
        input,
        organizationId: 7682
      });
      expect(result).toBeDefined();
      expect(JSON.stringify(result)).toEqual(JSON.stringify(newSchema));

      // Verify RBAC was called for schema creation
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledWith(context, {
        objectId: newSchema.id,
        organizationId: 7682,
        resourceType: 'SDOSchema'
      });
    });

    it('should insert new schema with published status and emit event', async function () {
      // set correct right for internal token
      const context = getContextWithAuth();

      const publishedSchema = {
        ...newSchema,
        status: 'published',
        storageName: 'sdo_test_regis_1_abc123xyz'
      };

      // prepare DB
      dbRead._push([dataReg], false); // for getDataRegistry
      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - no schema with same ID
      dbWrite._push([], false);
      // _findExistingSchemaByVersion - no schema with same version
      dbWrite._push([], false);
      // _getInheritedStorageName (getSchemas) - minorVersion is 2 so this is called
      dbRead._push([], false);
      // createTable - DDL for new table
      dbWrite._push([{}], false);
      // INSERT new schema
      dbWrite._push([publishedSchema], false);
      // updateSchemaProperties - DELETE + INSERT
      dbWrite._push([schemaProperties], false);

      const modifiedInput = {
        ...input,
        status: 'published'
      };

      const result = await dal.createSchema(context, {
        input: modifiedInput,
        organizationId: 7682
      });
      expect(result).toBeDefined();
      expect(result.status).toEqual('published');
    });

    it('should fail if schema status is published and schema definition is not valid JSON', async function () {
      // set correct right for internal token
      const context = getContextWithAuth();

      // bad json case
      const badJSONInput = {
        ...input,
        status: 'published',
        definition: ''
      };

      try {
        await dal.createSchema(context, { input: badJSONInput });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('Schema has to be a JSON object');
      }
    });

    it('should fail if schema status is published and schema has no properties', async function () {
      // set correct right for internal token
      const context = getContextWithAuth();

      // prepare DB
      dbRead._push([dataReg], false); // for getDataRegistry
      // _lockDataRegistrySchemaVersioning - SELECT ... FOR UPDATE
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - no schema with same ID
      dbWrite._push([], false);
      // _findExistingSchemaByVersion - no schema with same version
      dbWrite._push([], false);

      // insufficien schema case
      const insufficientSchemaInput = {
        ...input,
        status: 'published',
        definition: { test: 'test-value' }
      };

      try {
        await dal.createSchema(context, { input: insufficientSchemaInput });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'You have to define at least one field in the schema'
        );
      }
    });

    it('should fail if schema status is deleted', async function () {
      // set correct right for internal token
      const context = getContextWithAuth();

      // prepare DB
      dbRead._push([dataReg], false); // for getDataRegistry
      dbRead._push([], false); // for getSchema db query when checking same ID
      dbRead._push([], false); // for getSchema db query when checking for major version

      // insufficien schema case
      const insufficientSchemaInput = {
        ...input,
        status: 'deleted'
      };

      try {
        await dal.createSchema(context, { input: insufficientSchemaInput });
        jest.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'schema with status "deleted" cannot be created as it has no transition available'
        );
      }
    });

    it('should insert new schema with aiware.schema.update right and add default ACEs', async function () {
      // set correct right for internal token
      const context = getContextWithAuth({
        appendRights: ['aiware.schema.update']
      });

      // prepare DB
      dbRead._push([dataReg], false); // for getDataRegistry
      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - no schema with same ID
      dbWrite._push([], false);
      // _findExistingSchemaByVersion - no schema with same version
      dbWrite._push([], false);
      // INSERT new schema
      dbWrite._push([newSchema], false);

      // Mock RBAC for schema creation
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (context, args) => {
          expect(args.objectId).toBe(newSchema.id);
          expect(args.organizationId).toBe(7682);
          expect(args.resourceType).toBe('SDOSchema');
          return Promise.resolve();
        }
      );

      const result = await dal.createSchema(context, {
        input,
        organizationId: 7682
      });
      expect(result).toBeDefined();
      expect(JSON.stringify(result)).toEqual(JSON.stringify(newSchema));

      // Verify RBAC was called for schema creation
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledWith(context, {
        objectId: newSchema.id,
        organizationId: 7682,
        resourceType: 'SDOSchema'
      });
    });

    it('should inherit storageName from published schema when creating minor version with published status', async function () {
      const context = getContextWithAuth();
      const existingStorageName = 'sdo_test_registry_1_abc123';
      const minorSchemaId = '7dd35ace-cc8c-41aa-9bc8-74aa3b005003';

      const minorInput = {
        id: minorSchemaId,
        dataRegistryId: regId,
        definition: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            title: { type: 'string' },
            newField: { type: 'string' } // Added field for minor version
          },
          description: 'test schema v1.1'
        },
        majorVersion: 1,
        minorVersion: 1, // Minor version
        status: 'published'
      };

      // Mock data registry
      dbRead._push([dataReg], false);

      // _lockDataRegistrySchemaVersioning
      dbWrite._push([{ id: regId }], false);
      // _findExistingSchemaById - no schema with same ID
      dbWrite._push([], false);
      // _findExistingSchemaByVersion - no schema with same version
      dbWrite._push([], false);

      // _getInheritedStorageName calls getSchemas - find existing published schema
      dbRead._push(
        [
          {
            id: 'existing-schema-id',
            majorVersion: 1,
            minorVersion: 0,
            status: 'published',
            storageName: existingStorageName,
            dataRegistryMetadataId: regId
          }
        ],
        false
      );

      const expectedSchema = {
        ...newSchema,
        id: minorSchemaId,
        majorVersion: 1,
        minorVersion: 1,
        storageName: existingStorageName,
        status: 'published'
      };
      // 5. INSERT new schema
      dbWrite._push([expectedSchema], false);

      // 6. updateSchemaProperties - DELETE + INSERT
      dbWrite._push([schemaProperties], false);

      // Mock RBAC
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        () => Promise.resolve()
      );

      const result = await dal.createSchema(context, {
        input: minorInput,
        organizationId: 7682
      });

      expect(result).toBeDefined();
      expect(result.storageName).toEqual(existingStorageName);
      expect(result.minorVersion).toEqual(1);
    });
  });

  describe('#getDataRegistryWithSchemasFromCache', function () {
    it('should return dataRegistry object with sorted schemas by version in descending order', async function () {
      let err;
      let dataRegistry;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: 'e5281739-ddbb-43cd-807e-9ac4ecd2e5a0',
        majorVersion: 1,
        minorVersion: 0
      };

      const dataRegistrySchemas = [
        inputSchema,
        {
          id: 'ffa65c17-99ca-44fc-b2f2-0b7f4ac860fd',
          majorVersion: 10,
          minorVersion: 0
        },
        {
          id: 'd868edff-88f8-4e71-94a7-6c245ac02de4',
          majorVersion: 10,
          minorVersion: 1
        },
        {
          id: '8a7f9835-a5a4-4ad6-ac77-f4c029095ebd',
          majorVersion: 10,
          minorVersion: 11
        }
      ];

      serviceContext.dbConnections['third_party'].read._push(
        [{ id: inputSchema.dataRegistryMetadataId }],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        dataRegistrySchemas,
        false
      );

      try {
        dataRegistry = await dal.getDataRegistryWithSchemasFromCache(
          context,
          inputSchema.dataRegistryMetadataId
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(dataRegistry).toBeDefined();
      expect(dataRegistry.id).toEqual('e5281739-ddbb-43cd-807e-9ac4ecd2e5a0');
      expect(dataRegistry.schemas.length).toEqual(4);
      expect(dataRegistry.schemas[0].id).toEqual(
        '8a7f9835-a5a4-4ad6-ac77-f4c029095ebd'
      );
      expect(dataRegistry.schemas[0].majorVersion).toEqual(10);
      expect(dataRegistry.schemas[0].minorVersion).toEqual(11);
    });
  });

  describe('#createStructuredData', function () {
    beforeEach(() => {
      _.merge(serviceContext.bll, {
        rbacAuth: {
          addDefaultACEsToResources: jest.fn()
        }
      });
    });
    it('should create SDO without ID (i.e create operation) and assign RBAC permissions with ignoreDefaultSDORole', async function () {
      let err;
      let dataRegistry;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398',
        majorVersion: 1,
        minorVersion: 0
      };

      // getSchemaRowFromCache
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );
      const args = {
        organizationId: 123,
        input: {
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'test1', test2: 'test2' }
        },
        ignoreDefaultSDORole: true
      };
      // getDataRegistryForSchema
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry'
          }
        ],
        false
      );

      // INSERT INTO
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            majorVersion: 1,
            minorVersion: 0,
            dataRegistryId: inputSchema.schemaId,
            id: inputSchema.id
          }
        ],
        false
      );

      // Mock the RBAC function with expectations
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (context, args) => {
          expect(args.objectId).toBeDefined();
          expect(typeof args.objectId).toBe('string');
          expect(args.organizationId).toBe(123);
          expect(args.resourceType).toBe('SDO');
          expect(args.dataRegistryId).toBeDefined();
          expect(typeof args.dataRegistryId).toBe('string');
          expect(args.ignoreDefaultSDORole).toBe(true);
          return Promise.resolve();
        }
      );

      try {
        dataRegistry = await dal.createStructuredData(args, context);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(dataRegistry).toBeDefined();
      expect(serviceContext.metrics.getValue('graphqlCreatedSDO')).toEqual(1);

      // Verify RBAC was called for new SDO creation
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledTimes(1);
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledWith(
        context,
        expect.objectContaining({
          ignoreDefaultSDORole: true
        })
      );

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Created SDO ${inputSchema.id} using schema ${inputSchema.schemaId}`
        })
      );
    });
    it('should create SDO with existing ID (i.e update operation) and not call RBAC for existing SDO', async function () {
      let err;
      let dataRegistry;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398',
        majorVersion: 1,
        minorVersion: 0
      };

      // getSchemaRowFromCache
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );
      const args = {
        organizationId: 123,
        input: {
          id: '17a2e83d-c920-4264-989f-9b51e42651c4', // Existing ID indicates update
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'test1', test2: 'test2' }
        }
      };
      // getDataRegistryForSchema
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry'
          }
        ],
        false
      );

      // _checkSDOExists
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: args.input.id
          }
        ],
        false
      );

      // INSERT INTO
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            majorVersion: 1,
            minorVersion: 0,
            dataRegistryId: inputSchema.schemaId,
            id: args.input.id // Use the existing ID from args.input
          }
        ],
        false
      );

      let clonedCtx = _.cloneDeep(context);
      try {
        dataRegistry = await dal.createStructuredData(args, clonedCtx);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(dataRegistry).toBeDefined();
      expect(dataRegistry.id).toEqual('17a2e83d-c920-4264-989f-9b51e42651c4');
      expect(serviceContext.metrics.getValue('graphqlUpdatedSDO')).toEqual(1);

      // Verify RBAC was NOT called for SDO update
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).not.toHaveBeenCalled();

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);

      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Updated SDO ${args.input.id} using schema ${inputSchema.schemaId}`
        })
      );

      expect(clonedCtx.requestInfo.warnings).toBeDefined();
      expect(clonedCtx.requestInfo.warnings.length).toEqual(1);
    });
    it('should create SDO with non-existing ID (i.e create operation) and assign RBAC permissions', async function () {
      let err;
      let dataRegistry;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398',
        majorVersion: 1,
        minorVersion: 0
      };

      // getSchemaRowFromCache
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );
      const args = {
        organizationId: 123,
        input: {
          id: '1fa61306-9441-4378-909c-4908f08c8afa', // Non-existing ID
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'test1', test2: 'test2' }
        }
      };
      // getDataRegistryForSchema
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry'
          }
        ],
        false
      );

      // _checkSDOExists
      serviceContext.dbConnections['third_party'].write._push([], false);

      // INSERT INTO
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            majorVersion: 1,
            minorVersion: 0,
            dataRegistryId: inputSchema.schemaId,
            id: inputSchema.id
          }
        ],
        false
      );

      // Mock the RBAC function with expectations
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (context, args) => {
          expect(args.objectId).toBeDefined();
          expect(typeof args.objectId).toBe('string');
          expect(args.organizationId).toBe(123);
          expect(args.resourceType).toBe('SDO');
          expect(args.dataRegistryId).toBeDefined();
          expect(typeof args.dataRegistryId).toBe('string');
          return Promise.resolve();
        }
      );

      let clonedCtx = _.cloneDeep(context);
      try {
        dataRegistry = await dal.createStructuredData(args, clonedCtx);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(dataRegistry).toBeDefined();
      expect(serviceContext.metrics.getValue('graphqlCreatedSDO')).toEqual(1);

      // Verify RBAC was called for new SDO creation
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledTimes(1);

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success',
          actionDetails: `Created SDO ${inputSchema.id} using schema ${inputSchema.schemaId}`
        })
      );

      expect(clonedCtx.requestInfo.warnings).toBeUndefined();
    });

    it('should coerce stringified object data based on schema before validating and saving', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });
      const coerceSpy = jest.spyOn(Validator.prototype, 'coerceDataBySchema');

      const inputSchema = {
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };

      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },
                discoveryPolicy: {
                  type: 'object',
                  properties: {
                    enabled: {
                      type: 'boolean'
                    }
                  }
                }
              }
            }
          }
        ],
        false
      );

      const args = {
        organizationId: 123,
        input: {
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: {
            name: 'coercion test',
            discoveryPolicy: '{"enabled":true}'
          }
        }
      };

      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry'
          }
        ],
        false
      );

      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
            dataRegistryId: inputSchema.schemaId
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[2]).toEqual({
            name: 'coercion test',
            discoveryPolicy: { enabled: true }
          });
          return true;
        }
      );

      const result = await dal.createStructuredData(args, context);

      expect(result).toBeDefined();
      expect(coerceSpy).toHaveBeenCalled();
      expect(coerceSpy).toHaveBeenCalledWith(
        {
          name: 'coercion test',
          discoveryPolicy: '{"enabled":true}'
        },
        expect.objectContaining({
          type: 'object'
        })
      );

      coerceSpy.mockRestore();
    });

    it('should throw for incorrect input and log an audit event', async function () {
      let err;
      let dataRegistry;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398',
        majorVersion: 1,
        minorVersion: 0
      };

      const args = {
        organizationId: 123,
        input: {
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'test1', test2: 'test2' }
        }
      };

      try {
        dataRegistry = await dal.createStructuredData(args, context);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: `Failed to create new SDO using schema ${inputSchema.schemaId}`
        })
      );
    });
  });

  describe('#createStructuredData - audit user fallback', function () {
    beforeEach(() => {
      _.merge(serviceContext.bll, {
        rbacAuth: {
          addDefaultACEsToResources: jest.fn()
        }
      });
    });

    function setupSDOCreateMocks(inputSchema, validator) {
      // getSchemaRowFromCache
      dbRead._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );
      // getDataRegistryForSchema
      dbRead._push(
        [{ id: inputSchema.dataRegistryMetadataId, name: 'data registry' }],
        false
      );
      // INSERT/UPDATE with optional validator
      dbWrite._push(
        [{ id: inputSchema.id, dataRegistryId: inputSchema.schemaId }],
        false,
        [],
        validator
      );
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockResolvedValue();
    }

    it('should use userInfo.userId for createdBy/modifiedBy when available (user token)', async function () {
      const context = mockUtil.makeContext({ authType: 'user' });
      const expectedUserId = context.requestContext.userInfo.userId;

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };
      setupSDOCreateMocks(inputSchema, (sql, params) => {
        expect(sql).toContain('INSERT INTO');
        expect(params[3]).toEqual(expectedUserId); // createdBy
        expect(params[4]).toEqual(expectedUserId); // modifiedBy
        return true;
      });

      const result = await dal.createStructuredData(
        {
          organizationId: 123,
          input: {
            schemaId: inputSchema.schemaId,
            dataRegistryId: inputSchema.dataRegistryMetadataId,
            data: { test1: 'test1' }
          }
        },
        context
      );

      expect(result).toBeDefined();
    });

    it('should fallback to tokenInfo.userId for createdBy/modifiedBy when no userInfo.userId (org token)', async function () {
      const context = mockUtil.makeContext({ authType: 'api_org' });
      const expectedUserId = '00000000-0000-0000-0000-000000000000';
      _.set(context, 'requestContext.tokenInfo.userId', expectedUserId);

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };
      setupSDOCreateMocks(inputSchema, (sql, params) => {
        expect(sql).toContain('INSERT INTO');
        expect(params[3]).toEqual(expectedUserId); // createdBy = tokenInfo.userId
        expect(params[4]).toEqual(expectedUserId); // modifiedBy = tokenInfo.userId
        return true;
      });

      const result = await dal.createStructuredData(
        {
          organizationId: 123,
          input: {
            schemaId: inputSchema.schemaId,
            dataRegistryId: inputSchema.dataRegistryMetadataId,
            data: { test1: 'test1' }
          }
        },
        context
      );

      expect(result).toBeDefined();
    });

    it('should throw NotAllowed for orgless internal token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      // api_internal fixture has organization: null — no org context

      await expect(
        dal.createStructuredData(
          {
            // no organizationId
            input: {
              schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
              data: { test1: 'test1' }
            }
          },
          context
        )
      ).rejects.toMatchObject({
        name: 'not_allowed',
        message: expect.stringContaining('requires an organization context')
      });
    });
  });

  describe('#updateStructuredData', function () {
    beforeEach(() => {
      _.merge(serviceContext.bll, {
        rbacAuth: {
          addDefaultACEsToResources: jest.fn()
        }
      });
    });

    it('should update existing SDO successfully', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };

      // getSchemaRowFromCache
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );

      // getDataRegistryForSchema
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry',
            isSystem: false
          }
        ],
        false
      );

      // Check if SDO exists (when shouldCheckExist = true)
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.id
          }
        ],
        false
      );

      const args = {
        organizationId: 123,
        input: {
          id: inputSchema.id,
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'updated', test2: 'data' }
        }
      };

      // UPSERT query result (from createStructuredData)
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            majorVersion: 1,
            minorVersion: 0,
            dataRegistryId: inputSchema.schemaId,
            id: inputSchema.id
          }
        ],
        false
      );

      const result = await dal.updateStructuredData(args, context);

      expect(result).toBeDefined();
      expect(result.id).toEqual(inputSchema.id);
      expect(result.schemaId).toEqual(inputSchema.schemaId);
      expect(serviceContext.metrics.getValue('graphqlUpdatedSDO')).toEqual(1);

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success',
          actionDetails: `Updated SDO ${inputSchema.id} using schema ${inputSchema.schemaId}`
        })
      );
    });

    it('should throw error when ID is not provided', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const args = {
        organizationId: 123,
        input: {
          schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
          dataRegistryId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398',
          data: { test1: 'test', test2: 'data' }
        }
      };

      let error;
      try {
        await dal.updateStructuredData(args, context);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.name).toEqual('invalid_input');
      expect(error.message).toContain('Missing or empty id field'); // This comes from checkId validation

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
    });

    it('should throw error when SDO does not exist', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };

      // getSchemaRowFromCache
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );

      // getDataRegistryForSchema
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry',
            isSystem: false
          }
        ],
        false
      );

      // Check if SDO exists - return empty (SDO not found)
      serviceContext.dbConnections['third_party'].read._push([], false);

      const args = {
        organizationId: 123,
        input: {
          id: inputSchema.id,
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'updated', test2: 'data' }
        }
      };

      let error;
      try {
        await dal.updateStructuredData(args, context);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.name).toEqual('not_found');
      expect(error.message).toContain('Structured data object not found');

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
    });

    it('should throw error when schema not found', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };

      // getSchemaRowFromCache - return null (schema not found)
      serviceContext.dbConnections['third_party'].read._push([], false);

      const args = {
        organizationId: 123,
        input: {
          id: inputSchema.id,
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'updated', test2: 'data' }
        }
      };

      let error;
      try {
        await dal.updateStructuredData(args, context);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.name).toEqual('not_found');
      expect(error.message).toContain('was not found');

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
    });

    it('should throw error when schema is not published', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };

      // getSchemaRowFromCache - schema with draft status
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'draft', // Not published
            storageName: 'test-storageName',
            schema: {}
          }
        ],
        false
      );

      const args = {
        organizationId: 123,
        input: {
          id: inputSchema.id,
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'updated', test2: 'data' }
        }
      };

      let error;
      try {
        await dal.updateStructuredData(args, context);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.name).toEqual('invalid_input');
      expect(error.message).toContain('The schema is not in a published state');

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
    });

    it('should handle encrypted properties when updating SDO', async function () {
      const context = mockUtil.makeContext(null, { authType: 'user' });

      const inputSchema = {
        id: '1a76f9af-62d2-40cd-a4fc-c15aa95b9afc',
        schemaId: '5ade0cca-0fa3-4c10-9fa4-adcd872aa132',
        dataRegistryMetadataId: '6c66fc5e-8a3d-4838-b87c-cf528bfba398'
      };

      // getSchemaRowFromCache with encrypted properties
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            status: 'published',
            storageName: 'test-storageName',
            schema: {},
            encryptedProperties: ['sensitiveField']
          }
        ],
        false
      );

      // getDataRegistryForSchema
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.dataRegistryMetadataId,
            name: 'data registry',
            isSystem: false
          }
        ],
        false
      );

      // Check if SDO exists (when shouldCheckExist = true)
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: inputSchema.id
          }
        ],
        false
      );

      const args = {
        organizationId: 123,
        input: {
          id: inputSchema.id,
          schemaId: inputSchema.schemaId,
          dataRegistryId: inputSchema.dataRegistryMetadataId,
          data: { test1: 'updated', sensitiveField: 'secret' }
        }
      };

      // UPSERT query result (from createStructuredData)
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            majorVersion: 1,
            minorVersion: 0,
            dataRegistryId: inputSchema.schemaId,
            id: inputSchema.id
          }
        ],
        false
      );

      const result = await dal.updateStructuredData(args, context);

      expect(result).toBeDefined();
      expect(result.id).toEqual(inputSchema.id);
      expect(serviceContext.metrics.getValue('graphqlUpdatedSDO')).toEqual(1);

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(2);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
    });
  });

  describe('#checkCompatibility', () => {
    const context = mockUtil.makeContext(null, { authType: 'user' });
    const testSchema = {
      id: 'my-schema',
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string'
        },
        title: {
          type: 'string'
        }
      },
      description: 'test schema'
    };

    it('identical schema should pass', async () => {
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false,
            schema: testSchema
          }
        ],
        false
      );
      return expect(
        dal.checkCompatibility(context, { schema: testSchema })
      ).resolves.toBe(undefined);
    });

    it('added fields should pass', async () => {
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false,
            schema: testSchema
          }
        ],
        false
      );
      return expect(
        dal.checkCompatibility(context, {
          schema: {
            id: 'my-schema',
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                type: 'string'
              },
              title: {
                type: 'string'
              },
              address: {
                type: 'string'
              }
            },
            description: 'test schema'
          }
        })
      ).resolves.toBe(undefined);
    });

    it('removed fields should fail', async () => {
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false,
            schema: testSchema
          }
        ],
        false
      );
      return expect(
        dal.checkCompatibility(context, {
          schema: {
            id: 'my-schema',
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                type: 'string'
              }
            },
            description: 'test schema'
          }
        })
      ).rejects.toThrow(
        new Error(
          `The schema is not backward compatible. Difference include breaking change = [{"op":"remove","path":"/properties/title"}]`
        )
      );
    });
    it('changed field types should fail', async () => {
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false,
            schema: testSchema
          }
        ],
        false
      );
      return expect(
        dal.checkCompatibility(context, {
          schema: {
            id: 'my-schema',
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                type: 'string'
              },
              title: {
                type: 'integer'
              },
              address: {
                type: 'string'
              }
            },
            description: 'test schema'
          }
        })
      ).rejects.toThrow(
        new Error(
          `The schema is not backward compatible. Difference include breaking change = [{"op":"replace","path":"/properties/title/type","value":"integer"}]`
        )
      );
    });
  });
  describe('Audit Log events', () => {
    const testSchemaId = '5dd35ace-cc8c-41aa-9bc8-74aa3b005002';
    it('should emit update schema event when status is published - success', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'inactive',
          schema: {
            properties: { foo: 'bar' }
          }
        }
      ]);
      // getDataRegistry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );
      // updateDBSchema
      dbWrite._push(
        [
          {
            id: testSchemaId,
            organizationId: 7682,
            status: 'published',
            schema: {
              properties: { foo: 'bar' }
            }
          }
        ],
        false
      );
      // _deactivateSchemas
      dbRead._push([], true);

      // updateSchemaProperties
      dbWrite._push(
        [
          {
            id: testSchemaId,
            organizationId: 7682,
            status: 'published',
            schema: {
              properties: { foo: 'bar2' }
            }
          }
        ],
        false
      );

      let res;
      let error;
      try {
        res = await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'published'
          }
        });
      } catch (err) {
        error = err;
      }
      const messages = serviceContext.messageUtil._messages();
      // private 'publish', public audit log and publish event
      expect(messages.length).toEqual(3);
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(error).toBeUndefined();
      expect(res.id).toEqual(testSchemaId);
      expect(res.status).toEqual('published');
    });
    it('should emit update schema event when status is published - failure', async function () {
      const context = mockUtil.makeContext({
        authType: 'user',
        authRole: 'regularUser'
      });
      dbRead._push([
        {
          id: testSchemaId,
          organizationId: 7682,
          status: 'inactive',
          schema: {
            properties: { foo: 'bar' }
          }
        }
      ]);
      // getDataRegistry
      dbRead._push(
        [
          {
            id: regId,
            name: 'test registry',
            organizationId: 7682,
            is_system: false
          }
        ],
        false
      );

      dbWrite.query = jest.fn().mockRejectedValueOnce(new Error('Beep boop'));

      try {
        await dal.updateSchemaState(context, {
          organizationId: 7682,
          input: {
            id: testSchemaId,
            status: 'published'
          }
        });
      } catch (err) {
        //
      }
      const messages = serviceContext.messageUtil._messages();
      //public audit log
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
    });
  });
});
