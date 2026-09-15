const _ = require('lodash');
const createServiceContext = require('../modules/v3DataModel/test/serviceContext.mock.js');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);

const serviceContextForFeatureFlags = createServiceContext();
_.set(
  serviceContextForFeatureFlags,
  'config.featureFlags.enablePackageGrantLogic',
  true
);

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

serviceContextForFeatureFlags.redisCache = _.clone(serviceContext.redisCache);
serviceContextForFeatureFlags.dal.packages = {
  getPackageGrants: jest.fn()
};

const dal = require('./engineCategory.js')(serviceContext);
const dalForFeatureFlags = require('./engineCategory.js')(
  serviceContextForFeatureFlags
);
const context = mockUtil.makeContext();

describe('engineCategory.js', function () {
  describe('require', function () {
    it('should load module', function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(3);
    });
  });

  describe('#getEngineCategory', function () {
    it('should throw error, if missing engine category id', async function () {
      let res;
      const options = {};

      try {
        res = await dal.getEngineCategory(context, options);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toEqual('id param is required');
      }

      expect(res).toBeUndefined();
    });

    it('should throw error not_found, if engine category not found', async function () {
      let res, err;
      const options = { id: 'engineCategoryId' };

      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.getEngineCategory(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should return null, if engine category not found, and ignore not found', async function () {
      let res, err;
      const options = { id: 'engineCategoryId' };
      const ignoreNotFound = true;

      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.getEngineCategory(context, options, ignoreNotFound);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBe(null);
    });

    it('should return engine category by id', async function () {
      let res, err;
      const options = { id: 'engineCategoryId1' };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId1',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            editable: false,
            video_only: false,
            order: 12,
            elastic: { enabled: false },
            search: { enabled: false },
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            data_field: 'conductor',
            color: '#673AB7',
            created_date_time: 1491603996,
            modified_date_time: 1491603996,
            library_identifier_types: '{audio-recording}',
            export_formats: [
              { label: 'Plain Text', types: [], format: 'txt' },
              { label: 'Time Text Markup Language', types: [], format: 'ttml' },
              { label: 'WebVTT', types: ['subtitle'], format: 'vtt' },
              { label: 'SubRip Text', types: ['subtitle'], format: 'srt' }
            ],
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_name: 'Cognition',
            type_description: null,
            type_id: 'engineTypeId',
            class_id: 'engineClassId',
            class_name: 'speech',
            class_description: 'The input to engines in the Speech',
            engine_class_icon: 'icon-message'
          }
        ],
        false
      );

      try {
        res = await dal.getEngineCategory(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('engineCategoryId1');
      expect(res.name).toEqual('engineCategoryName');
      expect(res.iconClass).toEqual('icon-conductor');
      expect(res.dependencies.category).toEqual('voice-recognition');
    });
  });

  describe('#getEngineCategories', function () {
    it('should get list engine categories ', async function () {
      let res, err;
      const options = { organizationId: '7682', offset: 0, limit: 30 };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId1',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          },
          {
            id: 'engineCategoryId2',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId3', 'engineId4'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          }
        ],
        false
      );

      try {
        res = await dal.getEngineCategories(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.offset).toEqual(0);
      expect(res.limit).toEqual(30);
      expect(res.records[0].id).toEqual('engineCategoryId1');
      expect(res.records[1].id).toEqual('engineCategoryId2');
    });

    // Skipped. See https://github.com/veritone/aiware-core/issues/345.
    xit('should get list engine categories from cache', async function () {
      const options = { organizationId: '7682', offset: 0, limit: 30 };

      const res = await dal.getEngineCategories(context, options);

      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.offset).toEqual(0);
      expect(res.limit).toEqual(30);
      expect(res.records[0].id).toEqual('engineCategoryId1');
      expect(res.records[1].id).toEqual('engineCategoryId2');
    });
  });

  describe('#getEngineCategoriesDb', function () {
    it('should get list engine categories', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId1',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          },
          {
            id: 'engineCategoryId2',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId3', 'engineId4'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          }
        ],
        false
      );

      try {
        res = await dal.getEngineCategoriesDb(context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.offset).toBeUndefined();
      expect(res.limit).toBeUndefined();
      expect(res.records[0].id).toEqual('engineCategoryId1');
      expect(res.records[1].id).toEqual('engineCategoryId2');
    });

    it('should get list engine categories by id or ids', async function () {
      let res, err;
      const options = {
        id: ['engineCategoryId1'],
        ids: ['engineCategoryId1', 'engineCategoryId2', 'engineCategoryId2'] // the duplicate ID will be removed
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId1',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          },
          {
            id: 'engineCategoryId2',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId3', 'engineId4'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          }
        ],
        false
      );

      try {
        res = await dal.getEngineCategoriesDb(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.offset).toBeUndefined();
      expect(res.limit).toBeUndefined();
      expect(res.records[0].id).toEqual('engineCategoryId1');
      expect(res.records[1].id).toEqual('engineCategoryId2');
    });
  });

  describe('#getEngineCategoriesDb - useEngineGrant flag is enabled', function () {
    it('should get list engine categories', async function () {
      let res, err;
      const options = {
        id: ['engineCategoryId1'],
        ids: ['engineCategoryId1', 'engineCategoryId2', 'engineCategoryId2'] // the duplicate ID will be removed
      };
      serviceContextForFeatureFlags.dal.packages.getPackageGrants.mockResolvedValue(
        {
          records: [
            { packageId: 'packageGrant1', grantType: 'GRANT' },
            { packageId: 'packageGrant2', grantType: 'GRANT' },
            { packageId: 'packageGrant3', grantType: 'VIEW' }
          ]
        }
      );

      serviceContextForFeatureFlags.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId1',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          },
          {
            id: 'engineCategoryId2',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId3', 'engineId4'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          }
        ],
        false,
        [
          'WITH allowedEngines AS',
          'aiware.package__resource',
          `'engine'::aiware.aiw_package_resource_enum `
        ],
        (sql, params) => {
          expect(sql).toMatch(/owner_organization_id\s=/);
          expect(sql).toMatch(/pr\.package_id\s=\sANY/);
          expect(params[0]).toEqual(
            expect.arrayContaining(['engineCategoryId1', 'engineCategoryId2'])
          );
          expect(params[1]).toEqual(7682);
          expect(params[2]).toEqual(
            expect.arrayContaining(['packageGrant1', 'packageGrant2'])
          );
          return true;
        }
      );

      const newContext = mockUtil.makeContext();
      _.set(newContext, '_authInfo.organization.kvp.features', {
        useEngineGrant: 'enabled'
      });

      try {
        res = await dalForFeatureFlags.getEngineCategoriesDb(
          newContext,
          options
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.offset).toBeUndefined();
      expect(res.limit).toBeUndefined();
      expect(res.records[0].id).toEqual('engineCategoryId1');
      expect(res.records[1].id).toEqual('engineCategoryId2');
      expect(
        serviceContextForFeatureFlags.dal.packages.getPackageGrants
      ).toHaveBeenCalled();
    });
    it('should get list by owned if there are any package grants', async function () {
      let res, err;
      const options = {
        ids: ['engineCategoryId1', 'engineCategoryId2', 'engineCategoryId2'] // the duplicate ID will be removed
      };
      serviceContextForFeatureFlags.dal.packages.getPackageGrants.mockResolvedValue(
        {
          records: []
        }
      );

      serviceContextForFeatureFlags.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId1',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId1', 'engineId2'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          },
          {
            id: 'engineCategoryId2',
            name: 'engineCategoryName',
            description: 'engineCategory description',
            icon_class: 'icon-conductor',
            dependencies: {
              category: 'voice-recognition',
              dependencies: ['ingestion']
            },
            engine_ids: ['engineId3', 'engineId4'],
            engine_alias_ids: ['aliasId1', 'aliasId2'],
            type_id: 'engineTypeId',
            class_id: 'engineClassId'
          }
        ],
        false,
        [
          'WITH allowedEngines AS',
          'aiware.package__resource',
          `'engine'::aiware.aiw_package_resource_enum `
        ],
        (sql, params) => {
          expect(sql).toMatch(/owner_organization_id\s=/);
          expect(sql).not.toMatch(/pr\.package_id\s=\sANY/);
          expect(params[0]).toEqual(
            expect.arrayContaining(['engineCategoryId1', 'engineCategoryId2'])
          );
          expect(params[1]).toEqual(7682);
          return true;
        }
      );

      const newContext = mockUtil.makeContext();
      _.set(newContext, '_authInfo.organization.kvp.features', {
        useEngineGrant: 'enabled'
      });

      try {
        res = await dalForFeatureFlags.getEngineCategoriesDb(
          newContext,
          options
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(2);
      expect(res.offset).toBeUndefined();
      expect(res.limit).toBeUndefined();
      expect(
        serviceContextForFeatureFlags.dal.packages.getPackageGrants
      ).toHaveBeenCalled();
    });
  });
});
