const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = require('../../../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.config.featureFlags = {
  getSourceIdsForScheduleFromTaskTable: true
};
serviceContext.dal.structuredData = {
  createStructuredData: jest.fn().mockResolvedValue({ id: '1234sdo' }),
  getSchema: jest.fn().mockResolvedValue({
    id: 'amazon-s3-schema',
    status: 'published',
    majorVersion: 1,
    minorVersion: 0,
    dataRegistryMetadataId: 'default-registry'
  })
};
serviceContext.dal.organization = {
  getGroupIdForOrgId: (args, context) => Promise.resolve('group_id'),
  getOrgIdForGroupId: (args, context) => Promise.resolve('org_id')
};
serviceContext.dal.user = {
  getDefaultOrgAdminUser: jest.fn(),
  getOldestUserForOrg: jest.fn(),
  getOldestSuperAdmin: jest.fn()
};
serviceContext.dal.application = {
  getAppIdFromOrgId: jest.fn()
};

serviceContext.s3 = {
  presignUrl: jest.fn().mockImplementation((x) => x)
};

const dal = require('./source')(serviceContext);

beforeEach(() => {
  serviceContext._clearAll();
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

function expectFunction(object, key) {
  expect(typeof object[key]).toBe('function');
}

function validateCapturedSqlForCreatedSourceOwnerIds(capturedSql, capturedValues, expectedId) {
  // Check SQL to find parameter positions
  const columnsPart = capturedSql.split('VALUES')[0];
  const columns = columnsPart.match(/\((.+)\)/s)[1].split(',').map(c => c.trim());
  const createdByIdx = columns.indexOf('created_by');
  const updatedByIdx = columns.indexOf('updated_by');
  const ownedByIdx = columns.indexOf('owned_by');

  expect(createdByIdx).toBeGreaterThan(-1);
  expect(updatedByIdx).toBeGreaterThan(-1);
  expect(ownedByIdx).toBeGreaterThan(-1);

  expect(capturedValues[createdByIdx]).toBe(expectedId);
  expect(capturedValues[updatedByIdx]).toBe(expectedId);
  expect(capturedValues[ownedByIdx]).toBe(expectedId);
}

describe('#source', () => {
  describe('#require', () => {
    it('should load module', () => {
      // load the module and validate basic structure
      expect(dal).toBeInstanceOf(Object);
      expect(Object.keys(dal).length).toBe(32);
      expectFunction(dal, 'getSource');
      expectFunction(dal, 'getSourcesQuery');
      expectFunction(dal, 'getSources');
      expectFunction(dal, 'createSource');
      expectFunction(dal, 'updateSource');
      expectFunction(dal, 'deleteSource');
      expectFunction(dal, 'getSourceContentTemplates');
      expectFunction(dal, 'createSourceContentTemplate');
      expectFunction(dal, 'deleteSourceContentTemplate');
      expectFunction(dal, 'getSourcesForSchedule');
      expectFunction(dal, 'getSourcePermission');
      expectFunction(dal, 'getDetails');
      expectFunction(dal, 'clearDetails');
      expectFunction(dal, 'getCollaborators');

      expectFunction(dal, 'updateSourceCollaborators');
      expectFunction(dal, 'getSourceIdsForSchedule');
      expectFunction(dal, 'cacheSourceFormats');
      expectFunction(dal, 'getSourceFormatId');
      expectFunction(dal, 'getDetailsFromDb');
      expectFunction(dal, 'getMarketIds');
      expectFunction(dal, 'setMarketIds');
      expectFunction(dal, 'createContentTemplateSql');
      expectFunction(dal, 'getSourceJWT');
    });
  });

  describe('#getSource', () => {
    it('should get source successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getSource(context, {
        id: 134
      });
      expect(res).toBeDefined();
    });

    it('should throw error invalid id', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.getSource(context, {});
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
      }
    });

    it('should throw error not found', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getSource(context, {
          id: '1234'
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('not_found');
      }
    });
  });
  describe('#getSources', () => {
    describe('#getSourcesQuery', () => {
      const context = mockUtil.makeContext();
      let groupId = null;
      it('should not build any condition for ids', () => {
        const args = {};
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).not.toEqual('');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(0);
        expect(sqlArgs).toEqual([]);
      });
      it('should get source by id', () => {
        const args = {
          id: 1
        };
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).toContain('s.media_source_id IN ($1)');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(1);
        expect(sqlArgs).toEqual([1]);
      });
      it('the original logic: the id field supports an array', () => {
        const args = {
          id: [1, 2]
        };
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).toContain('s.media_source_id IN ($1, $2)');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(2);
        expect(sqlArgs).toEqual([1, 2]);
      });
      it('the ids field will be ignored if the id field is passed in', () => {
        const args = {
          id: 1,
          ids: [3, 2]
        };
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).toContain('s.media_source_id IN ($1)');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(1);
        expect(sqlArgs).toEqual([1]);
      });
      it('the ids field will be used if the id field does not have any value', () => {
        const args = {
          id: null,
          ids: [3, 2]
        };
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).toContain('s.media_source_id IN ($1, $2)');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(2);
        expect(sqlArgs).toEqual([3, 2]);
      });
      it('should filter by sourceConfig', () => {
        const args = {
          storageConfigFilter: {
            key: 'test-key',
            bucket: 'test-bucket'
          }
        };
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).toContain('JOIN media_source_storage sc');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(2);
        expect(sqlArgs).toEqual(['test-bucket', 'test-key']);
      });

      it('should filter by sourceConfig url', () => {
        const args = {
          storageConfigFilter: {
            url: 'https://s3.us-west-1.amazonaws.com/myBucket/myFolder/doc.txt'
          }
        };
        const { sql, sqlArgs } = dal.getSourcesQuery(context, args, groupId);

        expect(sql).toBeDefined();
        expect(sql).toContain('JOIN media_source_storage sc');
        expect(sqlArgs).toBeDefined();
        expect(sqlArgs.length).toEqual(2);
        expect(sqlArgs).toEqual(['myBucket', 'myFolder/doc.txt']);
      });
    });

    it('should get source by organizationId', async () => {
      const context = mockUtil.makeContext();
      context._authInfo.groups[0].groupId = null;

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getSources(context, {
        id: 134,
        organizationId: 7682,
        sourceTypeId: 1,
        includePublic: true,
        correlationSchemaId: 123
      });
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records.length).toBe(1);
      expect(res.records[0].id).toBe(134);
    });
    it('should get source successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getSources(context, {
        id: 134,
        sourceTypeId: 1,
        includePublic: true,
        correlationSchemaId: 123
      });
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records.length).toBe(1);
      expect(res.records[0].id).toBe(134);
    });
    it('should get source successfully with array id', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getSources(context, {
        id: [134],
        sourceTypeId: 1,
        includePublic: true,
        correlationSchemaId: 123,
        hasContentTemplates: true
      });
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records.length).toBe(1);
      expect(res.records[0].id).toBe(134);
    });
    it('should get source successfully with sourceTypeIds', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getSources(context, {
        id: 134,
        sourceTypeIds: [1],
        permission: 'viewer',
        includePublic: true
      });
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records.length).toBe(1);
      expect(res.records[0].id).toBe(134);
    });
    it('should throw error permission owner with include public', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        await dal.getSources(context, {
          id: 134,
          sourceTypeIds: [1],
          permission: 'owner',
          includePublic: true
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should throw error permission editor with include public', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        await dal.getSources(context, {
          id: 134,
          sourceTypeIds: [1],
          permission: 'editor',
          includePublic: true
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
      }
    });

    it('should throw error missing id', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      try {
        await dal.getSources(context, {});
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should throw error empty ids', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getSources(context, {
          id: []
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
  });
  describe('#createSource', function () {
    // removed this test as a correlating SDO is created when a source is created with a correlationSchemaId now (AWT-13099)
    // it('should throw error with missing correlationSDOId', async function () {
    //   try {
    //     const context = mockUtil.makeContext();
    //     await dal.createSource(context, {
    //       input: {
    //         correlationSchemaId: 134
    //       }
    //     });
    //     throw new Error('internal_error');
    //   } catch (err) {
    //     expect(err).to.exist;
    //     expect(err.name).to.equal('invalid_input');
    //   }
    // });
    it('should throw error with missing correlationSchemaId', async function () {
      try {
        const context = mockUtil.makeContext();
        await dal.createSource(context, {
          input: {
            correlationSDOId: 134
          }
        });
        throw new Error('internal_error');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should create source successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'sourceId' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);

      let res = await dal.createSource(context, {
        input: {
          correlationSDOId: 134,
          correlationSchemaId: 134,
          details: {
            networkIds: [1, 2, 3],
            marketIds: [2, 3, 4]
          },
          contentTemplates: [{ sdoId: 123 }],
          collaborators: [{ foo: 'bar' }]
        }
      });
      expect(res).toBeDefined();
      expect(res.id).toBe('sourceId');

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
    it('should create source with default org admin as owner when userId is not in context', async () => {
      const context = mockUtil.makeContext();
      // Remove all potential userId sources from context
      context._authInfo = undefined;
      context.userInfo = undefined;
      context.tokenInfo = undefined;

      const defaultOwnerId = 'default-org-admin';
      serviceContext.dal.user.getDefaultOrgAdminUser.mockResolvedValue({ userId: defaultOwnerId });

      const organizationId = 'test-org-id';

      let capturedSql, capturedValues;
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 'sourceId' }],
        true,
        [],
        (sql, values) => {
          if (sql.includes('INSERT INTO media_source')) {
            capturedSql = sql;
            capturedValues = values;
          }
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);

      let res = await dal.createSource(context, {
        input: {
          name: 'Test Source',
          organizationId: organizationId
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toBe('sourceId');
      expect(serviceContext.dal.user.getDefaultOrgAdminUser).toHaveBeenCalledWith({
        organizationId: organizationId,
        getAppIdFromOrgId: true,
        excludeSuperAdmin: true
      }, context);
      expect(capturedSql).toBeDefined();
      expect(capturedValues).toContain(defaultOwnerId);
      validateCapturedSqlForCreatedSourceOwnerIds(capturedSql, capturedValues, defaultOwnerId);
    });
    it('should create source with default org user as owner when default org admin does not exist', async () => {
      const context = mockUtil.makeContext();
      context._authInfo = undefined;
      context.userInfo = undefined;
      context.tokenInfo = undefined;

      const defaultOwnerId = 'default-org-user-id';
      const orgGuid = 'org-guid';
      serviceContext.dal.user.getDefaultOrgAdminUser.mockResolvedValue(null);
      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValue(orgGuid);
      serviceContext.dal.user.getOldestUserForOrg.mockResolvedValue({ userId: defaultOwnerId });

      const organizationId = 'test-org-id';

      let capturedSql;
      let capturedValues;
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 'sourceId' }],
        true,
        [],
        (sql, values) => {
          if (sql.includes('INSERT INTO media_source')) {
            capturedSql = sql;
            capturedValues = values;
          }
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([{ id: 'media_source_acl' }]);

      await dal.createSource(context, {
        input: { name: 'Test Source', organizationId: organizationId }
      });

      expect(serviceContext.dal.user.getDefaultOrgAdminUser).toHaveBeenCalled();
      expect(serviceContext.dal.application.getAppIdFromOrgId).toHaveBeenCalledWith(organizationId);
      expect(serviceContext.dal.user.getOldestUserForOrg).toHaveBeenCalledWith(orgGuid);
      expect(capturedSql).toBeDefined();
      expect(capturedValues).toContain(defaultOwnerId);
      validateCapturedSqlForCreatedSourceOwnerIds(capturedSql, capturedValues, defaultOwnerId);
    });
    it('should create source with default instance admin as owner when default org user does not exist', async () => {
      const context = mockUtil.makeContext();
      context._authInfo = undefined;
      context.userInfo = undefined;
      context.tokenInfo = undefined;

      const defaultOwnerId = 'superadmin-id';
      serviceContext.dal.user.getDefaultOrgAdminUser.mockResolvedValue(null);
      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValue('org-guid');
      serviceContext.dal.user.getOldestUserForOrg.mockResolvedValue(null);
      serviceContext.dal.user.getOldestSuperAdmin.mockResolvedValue({ userId: defaultOwnerId });

      const organizationId = 'test-org-id';

      let capturedSql;
      let capturedValues;
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 'sourceId' }],
        true,
        [],
        (sql, values) => {
          if (sql.includes('INSERT INTO media_source')) {
            capturedSql = sql;
            capturedValues = values;
          }
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([{ id: 'media_source_acl' }]);

      await dal.createSource(context, {
        input: { name: 'Test Source', organizationId: organizationId }
      });

      expect(serviceContext.dal.user.getDefaultOrgAdminUser).toHaveBeenCalled();
      expect(serviceContext.dal.user.getOldestUserForOrg).toHaveBeenCalled();
      expect(serviceContext.dal.user.getOldestSuperAdmin).toHaveBeenCalled();
      expect(capturedSql).toBeDefined();
      expect(capturedValues).toContain(defaultOwnerId);
      validateCapturedSqlForCreatedSourceOwnerIds(capturedSql, capturedValues, defaultOwnerId);
    });

    it('should create source and SDO successfully', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 'sourceId',
          correlationSDOId: 'sdoId'
        }
      ]);
      serviceContext.dbConnections['third_party'].write._push([
        {
          id: 'sdoId',
          dataRegistryId: 'amazon-s3-schema',
          data: {
            bucket: 'test-bucket',
            accessKeyId: 'test',
            secretAccessKey: 'secret-key-test'
          }
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);

      let res = await dal.createSource(context, {
        input: {
          correlationSchemaId: 'amazon-s3-schema',
          details: {
            bucket: 'test-bucket',
            accessKeyId: 'test',
            secretAccessKey: 'secret-key-test'
          },
          contentTemplates: [{ sdoId: 123 }],
          collaborators: [{ foo: 'bar' }]
        }
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('sourceId');
      expect(res.correlationSDOId).toBe('sdoId');
    });

    it('should merge created SDO data into source kvp on create', async () => {
      const context = mockUtil.makeContext();

      serviceContext.dal.structuredData.createStructuredData.mockResolvedValueOnce({
        id: 'sdoId',
        data: {
          normalizedField: 'normalized-value',
          nested: { enabled: true }
        }
      });

      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 'sourceId', correlationSDOId: 'sdoId' }],
        false,
        [],
        (sql, args) => {
          const kvpArg = args.find((v) => _.isPlainObject(v) && v.originalField);
          expect(kvpArg).toEqual(
            expect.objectContaining({
              originalField: 'from-details',
              normalizedField: 'normalized-value',
              nested: { enabled: true }
            })
          );
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);

      const res = await dal.createSource(context, {
        input: {
          organizationId: 7682,
          correlationSchemaId: 'amazon-s3-schema',
          details: {
            originalField: 'from-details'
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toBe('sourceId');
    });

    it('should create source and sourceStorage successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'sourceId' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'media_source_acl' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 'storage_config_id' }
      ]);
      let res = await dal.createSource(context, {
        input: {
          storageConfig: {
            type: 's3',
            bucket: 'test-bucket',
            accessKeyId: 'test'
          }
        }
      });
      expect(res).toBeDefined();
      expect(res.id).toBe('sourceId');

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
  describe('#updateSource', () => {
    it('should update source successfully', async () => {
      try {
        const context = mockUtil.makeContext();
        // getSource (initial load) — oldSource has a published correlationSchemaId
        // so _resolveCompatibleSchema returns immediately without DB calls
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test',
            source_type_id: 'e8636c4c-55a4-4e42-91f8-a18694f6687a',
            correlation_schema_id: 'amazon-s3-schema'
          }
        ]);
        // getSchema returns published — no migration needed
        serviceContext.dal.structuredData.getSchema = jest.fn().mockResolvedValueOnce({
          id: 'amazon-s3-schema',
          status: 'published',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: 'default-registry'
        });
        // main updateSource SQL write
        serviceContext.dbConnections['media_platform'].write._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        // setNetworkIds write
        serviceContext.dbConnections['media_platform'].write._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        // setMarketIds write
        serviceContext.dbConnections['media_platform'].write._push([
          {
            id: 134,
            collaborator: 'test'
          }
        ]);
        // content templates (DELETE + INSERT combined) write
        serviceContext.dbConnections['media_platform'].write._push([
          {
            id: 134
          }
        ]);
        // updateSourceCollaborators (delete + insert) write
        serviceContext.dbConnections['media_platform'].write._push([
          {
            id: 134,
            collaborator: 'test'
          }
        ]);
        // final getSource read
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        const res = await dal.updateSource(context, {
          input: {
            id: 1432,
            organizationId: 7682,
            details: {
              networkIds: [1, 2, 3],
              marketIds: [2, 3, 4]
            },
            contentTemplates: [{ sdoId: 123 }],
            collaborators: [{ foo: 'bar' }]
          }
        });
        expect(res).toBeDefined();

        // event
        expect(serviceContext.messageUtil._counter()).toBe(2);
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].event).toBe('source_updated');
        expect(messages[0].type).toBe('program');
        expect(messages[1].actionInfo).toEqual(expect.any(Object));
        expect(messages[1].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'success'
          })
        );
      } catch (err) {
        expect(err).toBeNull();
      }
    });
    // FIXME: this test asserts the opposite form what its title suggests
    it('should throw error when user is owner permission', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        const res = await dal.updateSource(context, {
          input: {
            id: 1432,
            organizationId: 7682,
            isPublic: true
          }
        });
        expect(res).toBeDefined();
      } catch (err) {
        expect(err).toBeNull();
      }
    });
    it('should throw error not_allowed', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test',
            organizationId: 7681
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        await dal.updateSource(context, {
          input: {
            id: 1432,
            organizationId: 7684
          }
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('not_allowed');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error with missing id', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        const res = await dal.updateSource(context, {
          input: {}
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error with missing correlationSDOId', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        await dal.updateSource(context, {
          input: {
            id: 123,
            correlationSchemaId: 134
          }
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
      }
    });

    it('should throw error with missing correlationSchemaId', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            name: 'test'
          }
        ]);
        await dal.updateSource(context, {
          input: {
            correlationSDOId: 134,
            id: 1234
          }
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
      }
    });

    it('should auto-migrate SDO schema on minor version upgrade when updating source with details', async () => {
      const context = mockUtil.makeContext();

      const SCHEMA_V1_0 = 'd616220e-101e-48cd-aa81-5cca955b6f41';
      const SCHEMA_V1_1 = 'a7933955-095e-440e-a8bf-95883bb46be3';
      const DATA_REGISTRY_ID = 'df36ca52-2b56-443d-bcd4-45f5b72aa862';

      // getSchema called twice: first for currentSchema (v1.0, inactive),
      // then for sourceType schema (v1.1, published)
      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_0,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V1_1,
          status: 'published',
          majorVersion: 1,
          minorVersion: 1,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        });

      // getSource (initial load) — oldSource has correlationSchemaId = SCHEMA_V1_0
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'test',
          source_type_id: '24',
          correlation_schema_id: SCHEMA_V1_0,
          correlation_sdo_id: 'd18ed590-970d-42f6-ab0f-34035f8dff04'
        }
      ]);
      // getSourceType inside _resolveCompatibleSchema — runs before the update SQL
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: '24', config_schema_id: SCHEMA_V1_1 }
      ]);
      // main updateSource SQL write
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 134, name: 'test' }
      ]);
      // setNetworkIds write
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 134 }
      ]);
      // setMarketIds write
      serviceContext.dbConnections['media_platform'].write._push([
        { id: 134 }
      ]);
      // final getSource read
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 134, name: 'test' }
      ]);

      const res = await dal.updateSource(context, {
        input: {
          id: 134,
          organizationId: 7682,
          details: {
            networkIds: [1, 2],
            marketIds: [3, 4]
          }
        }
      });

      expect(res).toBeDefined();
      // createStructuredData should have been called with the migrated schema v1.1
      expect(serviceContext.dal.structuredData.createStructuredData).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ schemaId: SCHEMA_V1_1 })
        }),
        expect.anything()
      );
    });

    it('should merge updated SDO data into source kvp on update', async () => {
      const context = mockUtil.makeContext();

      serviceContext.dal.structuredData.getSchema = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'amazon-s3-schema',
          status: 'published',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: 'default-registry'
        });
      serviceContext.dal.structuredData.createStructuredData.mockResolvedValueOnce({
        id: 'updated-sdo-id',
        data: {
          normalizedField: 'normalized-update',
          nested: { enabled: true }
        }
      });

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'old-source',
          source_type_id: '24',
          correlation_schema_id: 'amazon-s3-schema',
          correlation_sdo_id: 'existing-sdo-id',
          organization_id: 7682
        }
      ]);

      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: 134, name: 'old-source' }],
        false,
        [],
        (sql, args) => {
          const kvpArg = args.find((v) => _.isPlainObject(v) && v.originalField);
          expect(kvpArg).toEqual(
            expect.objectContaining({
              originalField: 'from-update-details',
              normalizedField: 'normalized-update',
              nested: { enabled: true }
            })
          );
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'updated-source'
        }
      ]);

      const res = await dal.updateSource(context, {
        input: {
          id: 134,
          organizationId: 7682,
          details: {
            originalField: 'from-update-details'
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.id).toBe(134);
    });

    it('should throw invalid_input when updating source with details and sourceType has major version change', async () => {
      const context = mockUtil.makeContext();

      const SCHEMA_V1_0 = 'd616220e-101e-48cd-aa81-5cca955b6f41';
      const SCHEMA_V2_0 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const DATA_REGISTRY_ID = 'df36ca52-2b56-443d-bcd4-45f5b72aa862';

      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_0,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V2_0,
          status: 'published',
          majorVersion: 2,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        });

      // getSource — oldSource references v1.0 schema
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134,
          name: 'test',
          sourceTypeId: '24',
          correlationSchemaId: SCHEMA_V1_0,
          correlationSdoId: 'sdo-id'
        }
      ]);
      // getSourceType inside _resolveCompatibleSchema — sourceType now on v2.0
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: '24', config_schema_id: SCHEMA_V2_0 }
      ]);

      await expect(
        dal.updateSource(context, {
          input: {
            id: 134,
            organizationId: 7682,
            details: { bucket: 'my-bucket' }
          }
        })
      ).rejects.toMatchObject({
        name: 'invalid_input',
        data: expect.objectContaining({
          currentSchemaVersion: '1.0',
          sourceTypeSchemaVersion: '2.0'
        })
      });
    });
  });

  describe('#_resolveCompatibleSchema', () => {
    const SCHEMA_V1_0 = 'd616220e-101e-48cd-aa81-5cca955b6f41';
    const SCHEMA_V1_1 = 'a7933955-095e-440e-a8bf-95883bb46be3';
    const SCHEMA_V2_0 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const DATA_REGISTRY_ID = 'df36ca52-2b56-443d-bcd4-45f5b72aa862';
    const SOURCE_TYPE_ID = '24';
    const oldSource = { id: 78040, sourceTypeId: SOURCE_TYPE_ID };

    afterEach(() => {
      // Restore default mock after each test so other suites are unaffected
      serviceContext.dal.structuredData.getSchema = jest.fn().mockResolvedValue({
        id: 'amazon-s3-schema',
        status: 'published',
        majorVersion: 1,
        minorVersion: 0,
        dataRegistryMetadataId: 'default-registry'
      });
    });

    it('should return the original schemaId when the schema is already published', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn().mockResolvedValueOnce({
        id: SCHEMA_V1_1,
        status: 'published',
        majorVersion: 1,
        minorVersion: 1,
        dataRegistryMetadataId: DATA_REGISTRY_ID
      });

      const result = await dal._resolveCompatibleSchema(context, SCHEMA_V1_1, oldSource);

      expect(result).toBe(SCHEMA_V1_1);
    });

    it('should throw invalid_input when currentSchemaId is falsy', async () => {
      const context = mockUtil.makeContext();

      await expect(
        dal._resolveCompatibleSchema(context, null, oldSource)
      ).rejects.toMatchObject({
        name: 'invalid_input',
        message: expect.stringContaining('No schema is defined')
      });
    });

    it('should throw invalid_input when oldSource has no sourceTypeId and schema is inactive', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn().mockResolvedValueOnce({
        id: SCHEMA_V1_0,
        status: 'inactive',
        majorVersion: 1,
        minorVersion: 0,
        dataRegistryMetadataId: DATA_REGISTRY_ID
      });

      await expect(
        dal._resolveCompatibleSchema(context, SCHEMA_V1_0, { id: 78040 })
      ).rejects.toMatchObject({
        name: 'invalid_input',
        message: expect.stringContaining('source has no source type')
      });
    });

    it('should migrate to sourceType schema on valid minor version upgrade', async () => {
      const context = mockUtil.makeContext();
      // First call: current schema (inactive v1.0)
      // Second call: sourceType schema (published v1.1)
      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_0,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V1_1,
          status: 'published',
          majorVersion: 1,
          minorVersion: 1,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        });
      // getSourceType reads from media_platform.read
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: SOURCE_TYPE_ID, config_schema_id: SCHEMA_V1_1 }
      ]);

      const result = await dal._resolveCompatibleSchema(context, SCHEMA_V1_0, oldSource);

      expect(result).toBe(SCHEMA_V1_1);
    });

    it('should throw invalid_input when sourceType schema is not published', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_0,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V1_1,
          status: 'draft',
          majorVersion: 1,
          minorVersion: 1,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        });
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: SOURCE_TYPE_ID, config_schema_id: SCHEMA_V1_1 }
      ]);

      await expect(
        dal._resolveCompatibleSchema(context, SCHEMA_V1_0, oldSource)
      ).rejects.toMatchObject({
        name: 'invalid_input',
        data: expect.objectContaining({
          sourceId: 78040,
          sourceTypeSchemaId: SCHEMA_V1_1
        })
      });
    });

    it('should throw invalid_input when schemas belong to different data registries', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_0,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: 'registry-A'
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V1_1,
          status: 'published',
          majorVersion: 1,
          minorVersion: 1,
          dataRegistryMetadataId: 'registry-B'
        });
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: SOURCE_TYPE_ID, config_schema_id: SCHEMA_V1_1 }
      ]);

      await expect(
        dal._resolveCompatibleSchema(context, SCHEMA_V1_0, oldSource)
      ).rejects.toMatchObject({
        name: 'invalid_input',
        data: expect.objectContaining({
          currentSchemaDataRegistryId: 'registry-A',
          sourceTypeSchemaDataRegistryId: 'registry-B'
        })
      });
    });

    it('should throw invalid_input when sourceType schema has a higher major version', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_0,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V2_0,
          status: 'published',
          majorVersion: 2,
          minorVersion: 0,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        });
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: SOURCE_TYPE_ID, config_schema_id: SCHEMA_V2_0 }
      ]);

      await expect(
        dal._resolveCompatibleSchema(context, SCHEMA_V1_0, oldSource)
      ).rejects.toMatchObject({
        name: 'invalid_input',
        data: expect.objectContaining({
          currentSchemaVersion: '1.0',
          sourceTypeSchemaVersion: '2.0'
        })
      });
    });

    it('should throw invalid_input when sourceType minor version is not newer than the current schema', async () => {
      const context = mockUtil.makeContext();
      // Both schemas on v1.1 but current is inactive — nothing to migrate to
      serviceContext.dal.structuredData.getSchema = jest.fn()
        .mockResolvedValueOnce({
          id: SCHEMA_V1_1,
          status: 'inactive',
          majorVersion: 1,
          minorVersion: 1,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        })
        .mockResolvedValueOnce({
          id: SCHEMA_V1_1,
          status: 'published',
          majorVersion: 1,
          minorVersion: 1,
          dataRegistryMetadataId: DATA_REGISTRY_ID
        });
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: SOURCE_TYPE_ID, config_schema_id: SCHEMA_V1_1 }
      ]);

      await expect(
        dal._resolveCompatibleSchema(context, SCHEMA_V1_1, oldSource)
      ).rejects.toMatchObject({
        name: 'invalid_input',
        data: expect.objectContaining({ sourceId: 78040 })
      });
    });

    it('should throw invalid_input when sourceType has no newer schema (same schema ID, current is inactive)', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn().mockResolvedValueOnce({
        id: SCHEMA_V1_0,
        status: 'inactive',
        majorVersion: 1,
        minorVersion: 0,
        dataRegistryMetadataId: DATA_REGISTRY_ID
      });
      // getSourceType returns same schema ID as the current (no migration available)
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_type_id: SOURCE_TYPE_ID, config_schema_id: SCHEMA_V1_0 }
      ]);

      await expect(
        dal._resolveCompatibleSchema(context, SCHEMA_V1_0, oldSource)
      ).rejects.toMatchObject({
        name: 'invalid_input',
        data: expect.objectContaining({ sourceId: 78040, currentSchemaId: SCHEMA_V1_0 })
      });
    });

    it('should fall back to original schemaId on unexpected errors', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dal.structuredData.getSchema = jest.fn().mockRejectedValueOnce(
        new Error('DB connection timeout')
      );

      const result = await dal._resolveCompatibleSchema(context, SCHEMA_V1_0, oldSource);

      expect(result).toBe(SCHEMA_V1_0);
    });
  });
  describe('#deleteSource', () => {
    it('should delete source successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.deleteSource(context, {
        id: 134,
        organizationId: 7682
      });
      expect(res).toBeDefined();

      // event
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].event).toBe('source_deleted');
      expect(messages[0].type).toBe('program');
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success'
        })
      );
    });
    it('should delete throw error not_allowed', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            organizationId: 7683
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        const res = await dal.deleteSource(context, {
          id: 134,
          organizationId: 7682
        });
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('not_allowed');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'delete',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error missing org id', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.deleteSource(context, {
          input: {
            id: 'asd'
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'delete',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error missing source id', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.deleteSource(context, {
          id: '1234'
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'delete',
            actionResult: 'failure'
          })
        );
      }
    });
  });
  describe('#getSourceContentTemplates', () => {
    it('should get source successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          source_id: 123,
          sdo_id: 432
        }
      ]);
      const res = await dal.getSourceContentTemplates(context, {
        id: 123
      });
      expect(res).toBeDefined();
    });
  });
  describe('#createSourceContentTemplate', () => {
    it('should create source content template successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          source_id: 123
        }
      ]);
      const res = await dal.createSourceContentTemplate(context, {
        input: {
          organizationId: 7682,
          sourceId: 1234,
          schemaId: 123,
          sdoId: 111
        }
      });
      expect(res).toBeDefined();
    });
    it('should create source content template successfully without organizationId', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          source_id: 123
        }
      ]);
      const res = await dal.createSourceContentTemplate(context, {
        input: {
          sourceId: 1234,
          schemaId: 123,
          sdoId: 111
        }
      });
      expect(res).toBeDefined();
    });
    it('should throw error missing sdoId', async () => {
      const context = mockUtil.makeContext();
      try {
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 123
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            source_id: 123
          }
        ]);
        const res = await dal.createSourceContentTemplate(context, {
          input: {
            organizationId: 7682,
            sourceId: 1234,
            schemaId: 123,
            sdoId: 111
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should throw error missing sourceId', async () => {
      const context = mockUtil.makeContext();
      try {
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 123
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            source_id: 123
          }
        ]);
        const res = await dal.createSourceContentTemplate(context, {
          input: {
            organizationId: 7682,
            schemaId: 123,
            sdoId: 111
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should throw error when data and sdoId existed', async () => {
      const context = mockUtil.makeContext();
      try {
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 123
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134,
            source_id: 123
          }
        ]);
        const res = await dal.createSourceContentTemplate(context, {
          input: {
            organizationId: 7682,
            schemaId: 123,
            sdoId: 111,
            data: { foo: 'bar' }
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
  });
  describe('#deleteSourceContentTemplate', () => {
    it('should delete source content successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      const res = await dal.deleteSourceContentTemplate(context, {
        id: 134
      });
      expect(res).toBeDefined();
      expect(res.id).toBe(134);
    });
    it('should throw error not found source content template', async () => {
      const context = mockUtil.makeContext();
      try {
        serviceContext.dbConnections['media_platform'].write._push([]);
        await dal.deleteSourceContentTemplate(context, {
          id: 134
        });
      } catch (err) {
        expect(err.name).toBe('not_found');
        expect(err.data.objectType).toBe('SourceContentTemplate');
        expect(err.data.objectId).toBe(134);
      }
    });
  });
  describe('#getSourceIdsForSchedule', () => {
    it('should get source ids successfully', async () => {
      const context = mockUtil.makeContext(null, 'user');
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          sourceId: 123
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 134,
          sourceId: 123
        }
      ]);
      const res = await dal.getSourceIdsForSchedule(
        context,
        {
          id: 134
        },
        123
      );
      expect(res).toBeDefined();
    });
  });
  describe('#getSourcePermission', () => {
    it('should get source permission successfully', async () => {
      const context = mockUtil.makeContext();
      const res = await dal.getSourcePermission(
        context,
        {
          organizationId: 134
        },
        {
          organizationId: 134
        }
      );
      expect(res).toBeDefined();
      expect(typeof res).toBe('string');
    });
    it('should get source permission successfully with role owner', async () => {
      const context = mockUtil.makeContext();
      const res = await dal.getSourcePermission(
        context,
        {
          organizationId: 7682
        },
        {}
      );
      expect(res).toBeDefined();
      expect(typeof res).toBe('string');
      expect(res).toBe('owner');
    });
    it('should get source permission successfully with role owner when source does not have organizationId', async () => {
      const context = mockUtil.makeContext();
      const res = await dal.getSourcePermission(
        context,
        {
          organizationId: 7682
        },
        {}
      );
      expect(res).toBeDefined();
      expect(typeof res).toBe('string');
      expect(res).toBe('owner');
    });
    it('should get source permission successfully with permission of source', async () => {
      const context = mockUtil.makeContext();
      const res = await dal.getSourcePermission(
        context,
        {
          organizationId: 7683
        },
        {
          organizationId: 7887,
          permission: 'editor'
        }
      );
      expect(res).toBeDefined();
      expect(typeof res).toBe('string');
      expect(res).toBe('editor');
    });
    it('should get source permission successfully with role viewer', async () => {
      const context = mockUtil.makeContext();
      const res = await dal.getSourcePermission(
        context,
        {
          organizationId: 7682
        },
        {
          organizationId: 7683
        }
      );
      expect(res).toBeDefined();
      expect(typeof res).toBe('string');
      expect(res).toBe('viewer');
    });
  });
  describe('#getCollaborators', () => {
    it('should get collaborators successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getCollaborators(
        context,
        {
          id: 134
        },
        {
          id: 134
        }
      );
      expect(res).toBeDefined();
    });
  });
  describe('#updateSourceCollaborators', () => {
    it('should updateSourceCollaborators successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      const res = await dal.updateSourceCollaborators({}, {});
      expect(res).toBeDefined();
    });
    it('should updateSourceCollaborators successfully with clear existing', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      const res = await dal.updateSourceCollaborators({}, [
        {
          groupId: 123
        }
      ]);
      expect(res).toBeDefined();
    });
  });
  describe('#clearDetails', () => {
    it('should clearDetails successfully', async () => {
      try {
        let object = {
          id: 134,
          foo: 'bar'
        };
        await serviceContext.redisCache.set('SourceDetails', object.id, object);
        const context = mockUtil.makeContext();
        await dal.clearDetails(context, object);
        expect(
          await serviceContext.redisCache.get('SourceDetails', object.id)
        ).toBeUndefined();
      } catch (err) {
        expect(err).toBeUndefined();
      }
    });
  });
  describe('#getDetails', () => {
    it('should getDetails successfully from cache', async () => {
      try {
        let object = {
          id: 134,
          foo: 'bar'
        };
        await serviceContext.redisCache.set('SourceDetails', object.id, object);
        const context = mockUtil.makeContext();
        const res = await dal.getDetails(context, object);
        expect(res).toBeDefined();
        expect(res.id).toBe(object.id);
        expect(res.foo).toBe(object.foo);
      } catch (err) {
        expect(err).toBeUndefined();
      }
    });
    it('should getDetails successfully from database', async () => {
      let object = {
        id: 134,
        foo: 'bar'
      };
      await serviceContext.redisCache.clear('SourceDetails', object.id);
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getDetails(context, object);
      expect(res).toBeDefined();
    });
  });
  describe('#cacheSourceFormats', () => {
    it('should cacheSourceFormats successfully', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        await dal.cacheSourceFormats();
      } catch (err) {
        expect(err).toBeUndefined();
      }
    });
  });
  describe('#getSourceFormatId', () => {
    it('should return null when empty sourceFormatName', async () => {
      let res = await dal.getSourceFormatId(null, '1');
      expect(res).toBeNull();
    });

    it('should throw error when not found', async () => {
      serviceContext.dbConnections['media_platform'].read._push([], false);

      try {
        await dal.getSourceFormatId('Media', '1');
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should return source format id', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1
          }
        ],
        false
      );

      let res = await dal.getSourceFormatId('Media', '1');
      expect(res).toBeDefined();
    });
  });
  describe('#getDetailsFromDb', () => {
    it('should getDetailsFromDb successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getDetailsFromDb(context, 1234);
      expect(res).toBeDefined();
    });
    it('should getDetailsFromDb successfully with sourceDetail key', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getDetailsFromDb(context, {
        liveTimezone: 'UTC'
      });
      expect(res).toBeDefined();
      expect(res.liveTimezone).toBe('UTC');
    });
    it('should getDetailsFromDb successfully with mediaSourceFormatId', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134,
          name: 'source_format'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getDetailsFromDb(context, {
        mediaSourceFormatId: 134
      });
      expect(res).toBeDefined();
    });
  });
  describe('#getMarketIds', () => {
    it('should getMarketIds successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getMarketIds(context, 1234, [1, 2, 3]);
      expect(res).toBeDefined();
    });
  });
  describe('#setMarketIds', () => {
    it('should set MarketIds successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      const res = await dal.setMarketIds(context, 1234, [1, 2, 3]);
      expect(res).toBeDefined();
    });
    it('should set MarketIds successfully with clear Existing', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 135
        }
      ]);
      const res = await dal.setMarketIds(context, 1234, [1, 2, 3], true);
      expect(res).toBeDefined();
    });
  });
  describe('#setNetworkIds', () => {
    it('should set networkIds successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      const res = await dal.setNetworkIds(context, 1234, [1, 2, 3]);
      expect(res).toBeDefined();
    });
    it('should set networkIds successfully with clear Existing', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 134
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 135
        }
      ]);
      const res = await dal.setNetworkIds(context, 1234, [1, 2, 3], true);
      expect(res).toBeDefined();
    });
  });
  describe('#getNetworkIds', () => {
    it('should get networkIds successfully', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 134
        }
      ]);
      const res = await dal.getNetworkIds(context, {
        id: 134
      });
      expect(res).toBeDefined();
    });
  });
  describe('#createContentTemplateSql', () => {
    it('should throw error when have sdoId and data', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        await dal.createContentTemplateSql(context, {
          sdoId: 134,
          data: 'testdata'
        });
      } catch (e) {
        expect(e).toBeDefined();
        expect(e.name).toBe('invalid_input');
        expect(e.message).toBe(
          'Only one of CreateSourceContentTemplate data or sdoId can be provided.'
        );
      }
    });
    it('should throw error when missing sdoId or data', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        await dal.createContentTemplateSql(context, {});
      } catch (e) {
        expect(e).toBeDefined();
        expect(e.name).toBe('invalid_input');
        expect(e.message).toBe(
          'One of CreateSourceContentTemplate data or sdoId must be provided.'
        );
      }
    });
  });
  describe('#getSourcesForSchedule', () => {
    it('should get source successfully', async () => {
      try {
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        serviceContext.dbConnections['media_platform'].read._push([
          {
            id: 134
          }
        ]);
        serviceContext.dbConnections['core'].read._push([
          {
            id: 134,
            sourceId: 123
          }
        ]);
        await dal.getSourcesForSchedule(
          context,
          {
            id: 123
          },
          'scheduleId'
        );
      } catch (e) {
        expect(e).toBeNull();
      }
    });
  });

  describe('#cipherTextConvert', () => {
    it('should encypt and decrypt text successfully', async () => {
      const text = '{"test": "test", "payload": {"test1": "test1"}}';
      const encryptedText = dal.cipherTextConvert('encrypt', text);
      const decryptedText = dal.cipherTextConvert('decrypt', encryptedText);
      // can't compare to a hard-coded encrypted text because the iv used in the encryption is random
      // so the encrypted text will be different every time
      expect(decryptedText).toBe(text);
    });
  });

  describe('#setStorageCredentials', () => {
    it('should insert new external credential', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['sso'].write._push([
        {
          id: 134
        }
      ]);
      const res = await dal.setStorageCredentials(
        context,
        '__storageId__',
        {
          bucket: 'test-bucket',
          accessKeyId: 'test',
          secretAccessKey: 'secret-key'
        },
        '1234'
      );
      expect(res).toEqual('storage-credentials-__storageId__');
    });
  });

  describe('#getStorageSignedUrl', () => {
    it('should validate input', async () => {
      const context = mockUtil.makeContext();
      await expect(async () =>
        dal.getStorageSignedUrl(context, {}, { input: { access: 'GET' } })
      ).rejects.toThrow('Invalid input');
    });
    it('should build correct sign payload from key and prefix', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          key_prefix: 'test-folder',
          bucket: 'test-bucket'
        }
      ]);
      const res = await dal.getStorageSignedUrl(
        context,
        {
          id: '__source_id__',
          organizationId: '__organization_id__'
        },
        {
          input: {
            access: 'GET',
            key: 'test-key'
          }
        }
      );
      expect(res.url).toEqual(
        expect.objectContaining({
          region: 'us-east-1',
          bucket: 'test-bucket',
          key: 'test-folder/test-key',
          method: 'GET'
        })
      );
    });

    it('should build correct sign payload from key', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          bucket: 'test-bucket'
        }
      ]);
      const res = await dal.getStorageSignedUrl(
        context,
        {
          id: '__source_id__',
          organizationId: '__organization_id__'
        },
        {
          input: {
            access: 'GET',
            key: 'test-key'
          }
        }
      );
      expect(res.url).toEqual(
        expect.objectContaining({
          region: 'us-east-1',
          bucket: 'test-bucket',
          key: 'test-key',
          method: 'GET'
        })
      );
    });

    it('should build correct sign payload from url and key prefix', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          bucket: 'test-bucket',
          key_prefix: 'test-folder'
        }
      ]);
      const res = await dal.getStorageSignedUrl(
        context,
        {
          id: '__source_id__',
          organizationId: '__organization_id__'
        },
        {
          input: {
            access: 'GET',
            url:
              'https://s3.us-east-1.amazonaws.com/test-bucket/doc.txt?versionId=abc123&partNumber=77'
          }
        }
      );
      expect(res.url).toEqual(
        expect.objectContaining({
          region: 'us-east-1',
          bucket: 'test-bucket',
          key: 'test-folder/doc.txt',
          method: 'GET'
        })
      );
    });

    it('should build correct sign payload from url', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          bucket: 'test-bucket'
        }
      ]);
      const res = await dal.getStorageSignedUrl(
        context,
        {
          id: '__source_id__',
          organizationId: '__organization_id__'
        },
        {
          input: {
            access: 'GET',
            url:
              'https://s3.us-east-1.amazonaws.com/test-bucket/doc.txt?versionId=abc123&partNumber=77'
          }
        }
      );
      expect(res.url).toEqual(
        expect.objectContaining({
          region: 'us-east-1',
          bucket: 'test-bucket',
          key: 'doc.txt',
          method: 'GET'
        })
      );
    });

    it('should throw mismatch region', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          bucket: 'test-bucket'
        }
      ]);
      await expect(async () =>
        dal.getStorageSignedUrl(
          context,
          {
            id: '__source_id__',
            organizationId: '__organization_id__'
          },
          {
            input: {
              access: 'GET',
              url:
                'https://s3.us-west-1.amazonaws.com/test-bucket/doc.txt?versionId=abc123&partNumber=77'
            }
          }
        )
      ).rejects.toThrow('Region URL does not match source config');
    });

    it('should throw mismatch bucket', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          bucket: 'test-bucket'
        }
      ]);
      await expect(async () =>
        dal.getStorageSignedUrl(
          context,
          {
            id: '__source_id__',
            organizationId: '__organization_id__'
          },
          {
            input: {
              access: 'GET',
              url:
                'https://s3.us-east-1.amazonaws.com/my-bucket/doc.txt?versionId=abc123&partNumber=77'
            }
          }
        )
      ).rejects.toThrow('Bucket in URL does not match source bucket');
    });

    it('should throw invalid s3 url', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          storage_id: '__storageId__',
          region: 'us-east-1',
          bucket: 'test-bucket'
        }
      ]);
      await expect(async () =>
        dal.getStorageSignedUrl(
          context,
          {
            id: '__source_id__',
            organizationId: '__organization_id__'
          },
          {
            input: {
              access: 'GET',
              url: 'https://www.amazon.com'
            }
          }
        )
      ).rejects.toThrow(
        'Invalid S3 URI: hostname does not appear to be a valid S3 endpoint'
      );
    });
  });

  describe('#getSourceJWT', () => {
    it('should successfully generate a JWT for a valid source', async () => {
      const context = mockUtil.makeContext();
      const sourceId = '123-source-id';
      const organizationId = 456;
      const ownedBy = 'user-789';
      const contentApplicationId = 'app-guid-123';

      // Mock the database response for source lookup
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: organizationId,
          owned_by: ownedBy
        }
      ]);

      // Mock getAppIdFromOrgId
      serviceContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue(contentApplicationId);

      const result = await dal.getSourceJWT(context, { sourceId });

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.sourceId).toBe(sourceId);
      expect(result.organizationId).toBe(organizationId);
      expect(result.ownerId).toBe(ownedBy);
      expect(serviceContext.dal.application.getAppIdFromOrgId).toHaveBeenCalledWith(organizationId);
    });

    it('should throw InvalidInput when sourceId is null', async () => {
      const context = mockUtil.makeContext();

      await expect(async () =>
        dal.getSourceJWT(context, { sourceId: null })
      ).rejects.toThrow('The sourceId is required to get a JWT for a source.');
    });

    it('should throw InvalidInput when sourceId is undefined', async () => {
      const context = mockUtil.makeContext();

      await expect(async () =>
        dal.getSourceJWT(context, {})
      ).rejects.toThrow('The sourceId is required to get a JWT for a source.');
    });

    it('should throw NotFound when source does not exist', async () => {
      const context = mockUtil.makeContext();
      const sourceId = 'non-existent-source';

      // Mock empty database response
      serviceContext.dbConnections['media_platform'].read._push([]);

      await expect(async () =>
        dal.getSourceJWT(context, { sourceId })
      ).rejects.toThrow('The source for which the JWT was requested could not be found.');
    });

    it('should include correct scope in JWT token', async () => {
      const context = mockUtil.makeContext();
      const sourceId = '123-source-id';
      const organizationId = 456;
      const ownedBy = 'user-789';
      const contentApplicationId = 'app-guid-123';
      const jwt = require('jsonwebtoken');

      // Mock the database response
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: organizationId,
          owned_by: ownedBy
        }
      ]);

      // Mock getAppIdFromOrgId
      serviceContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue(contentApplicationId);

      const result = await dal.getSourceJWT(context, { sourceId });

      // Decode and verify the token contents
      const decoded = jwt.decode(result.token);
      expect(decoded).toBeDefined();
      expect(decoded.contentOrganizationId).toBe(organizationId);
      expect(decoded.contentApplicationId).toBe(contentApplicationId);
      expect(decoded.userId).toBe(ownedBy);
      expect(decoded.sub).toBe('jwt-for-source');
      expect(decoded.scope).toBeDefined();
      expect(decoded.scope[0].actions).toContain('aiware.folder.create');
      expect(decoded.scope[0].actions).toContain('aiware.folder.delete');
      expect(decoded.scope[0].actions).toContain('aiware.folder.read');
      expect(decoded.scope[0].actions).toContain('aiware.folder.update');
      expect(decoded.scope[0].actions).toContain('aiware.slug.create');
      expect(decoded.scope[0].actions).toContain('aiware.slug.delete');
      expect(decoded.scope[0].actions).toContain('aiware.slug.read');
      expect(decoded.scope[0].actions).toContain('aiware.slug.update');
      expect(decoded.scope[0].actions).toContain('aiware.source.read');
      expect(decoded.scope[0].actions).toContain('aiware.tdo.create');
      expect(decoded.scope[0].actions).toContain('aiware.tdo.delete');
      expect(decoded.scope[0].actions).toContain('aiware.tdo.read');
      expect(decoded.scope[0].actions).toContain('aiware.tdo.update');
      expect(decoded.scope[0].actions).toContain('aiware.job.read');
      expect(decoded.scope[0].actions).toContain('aiware.job.create');
      expect(decoded.scope[0].resources.sourceIds).toContain(sourceId);
    });

    it('should include only read permissions when access is read', async () => {
      const context = mockUtil.makeContext();
      const sourceId = '123-source-id';
      const organizationId = 456;
      const ownedBy = 'user-789';
      const contentApplicationId = 'app-guid-123';
      const jwt = require('jsonwebtoken');

      // Mock the database response
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: organizationId,
          owned_by: ownedBy
        }
      ]);

      // Mock getAppIdFromOrgId
      serviceContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue(contentApplicationId);

      const result = await dal.getSourceJWT(context, { sourceId, access: 'read' });

      // Decode and verify the token contents
      const decoded = jwt.decode(result.token);
      expect(decoded).toBeDefined();
      expect(decoded.scope).toBeDefined();
      const actions = decoded.scope[0].actions;
      expect(actions).toContain('aiware.folder.read');
      expect(actions).toContain('aiware.slug.read');
      expect(actions).toContain('aiware.source.read');
      expect(actions).toContain('aiware.tdo.read');
      expect(actions).toContain('aiware.job.read');
      expect(actions).not.toContain('aiware.folder.create');
      expect(actions).not.toContain('aiware.folder.update');
      expect(actions).not.toContain('aiware.folder.delete');
      expect(actions).not.toContain('aiware.slug.create');
      expect(actions).not.toContain('aiware.slug.update');
      expect(actions).not.toContain('aiware.slug.delete');
      expect(actions).not.toContain('aiware.tdo.create');
      expect(actions).not.toContain('aiware.tdo.update');
      expect(actions).not.toContain('aiware.tdo.delete');
      expect(actions).not.toContain('aiware.job.create');
      expect(decoded.scope[0].resources.sourceIds).toContain(sourceId);
    });

    it('should include all read/write permissions when access is readwrite', async () => {
      const context = mockUtil.makeContext();
      const sourceId = '123-source-id';
      const organizationId = 456;
      const ownedBy = 'user-789';
      const contentApplicationId = 'app-guid-123';
      const jwt = require('jsonwebtoken');

      // Mock the database response
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: organizationId,
          owned_by: ownedBy
        }
      ]);

      // Mock getAppIdFromOrgId
      serviceContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue(contentApplicationId);

      const result = await dal.getSourceJWT(context, { sourceId, access: 'readwrite' });

      // Decode and verify the token contents
      const decoded = jwt.decode(result.token);
      expect(decoded).toBeDefined();
      expect(decoded.scope).toBeDefined();
      const actions = decoded.scope[0].actions;
      expect(actions).toContain('aiware.folder.create');
      expect(actions).toContain('aiware.folder.delete');
      expect(actions).toContain('aiware.folder.read');
      expect(actions).toContain('aiware.folder.update');
      expect(actions).toContain('aiware.slug.create');
      expect(actions).toContain('aiware.slug.delete');
      expect(actions).toContain('aiware.slug.read');
      expect(actions).toContain('aiware.slug.update');
      expect(actions).toContain('aiware.source.read');
      expect(actions).toContain('aiware.tdo.create');
      expect(actions).toContain('aiware.tdo.delete');
      expect(actions).toContain('aiware.tdo.read');
      expect(actions).toContain('aiware.tdo.update');
      expect(actions).toContain('aiware.job.read');
      expect(actions).toContain('aiware.job.create');
      expect(decoded.scope[0].resources.sourceIds).toContain(sourceId);
    });
    it('filters out restricted permissions during getSourceJWT', async () => {
      const context = mockUtil.makeContext();
      const sourceId = '123-source-id-security';
      const jwt = require('jsonwebtoken');
      
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 111, owned_by: 'u1' }
      ]);
      serviceContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue('app1');

      const result = await dal.getSourceJWT(context, { sourceId, access: 'readwrite' });
      const decoded = jwt.decode(result.token);
      
      const actions = decoded.scope[0].actions;
      expect(actions).not.toContain('superadmin');
      expect(actions).not.toContain('SUPERADMIN');
      expect(actions).not.toContain('VERITONE_SUPERADMIN');
      expect(actions).not.toContain('finance-admin');
    });

    it('should use default org admin as ownerId when owned_by is null in the database row', async () => {
      const context = mockUtil.makeContext();
      const sourceId = 'source-null-owner';
      const organizationId = 789;
      const contentApplicationId = 'app-guid-999';
      const defaultOwnerId = 'default-admin-user';

      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: organizationId,
          owned_by: null
        }
      ]);

      serviceContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue(contentApplicationId);
      serviceContext.dal.user.getDefaultOrgAdminUser = jest.fn().mockResolvedValue({ userId: defaultOwnerId });

      const result = await dal.getSourceJWT(context, { sourceId });

      expect(result.ownerId).toBe(defaultOwnerId);
      expect(serviceContext.dal.user.getDefaultOrgAdminUser).toHaveBeenCalled();
    });
  });
});
