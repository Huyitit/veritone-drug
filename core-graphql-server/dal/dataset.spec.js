const chaiExpect = require('chai').expect;
const _ = require('lodash');
const uuid = require('uuid');

const regId = '81ca224a-ae73-4f8d-9d5a-feea644d4956';
// get mock base service context
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
_.set(serviceContext, 's3Buckets.dataset.storage', serviceContext.storage);
jest.mock('./../util/elastic.js');
const elasticclient = require('./../util/elastic.js');

elasticclient.mockImplementation(() => {
  return {
    client: {
      indices: {
        putMapping: jest.fn().mockResolvedValue(0)
      },
      index: jest.fn().mockResolvedValue(0),
      exists: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue({
        body: {
          _source: {
            datasetId: '50fed206-b535-4d1b-b683-eb0bf4a8bcdd',
            schemaId: '81ca224a-ae73-4f8d-9d5a-feea644d4956',
            schema: {
              id: '81ca224a-ae73-4f8d-9d5a-feea644d4956',
              dataRegistryMetadataId: '81ca224a-ae73-4f8d-9d5a-feea644d4956',
              organizationId: 7682,
              minorVersion: 1,
              majorVersion: 1,
              status: 'published'
            }
          }
        }
      })
    }
  };
});

const dal = require('./dataset.js')(serviceContext);

const dbRead = serviceContext.dbConnections['third_party'].read;
const dbWrite = serviceContext.dbConnections['third_party'].write;
let datasetId;
beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

afterAll(() => {
  jest.resetModules();
});

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}

describe('dataset.js', function () {
  beforeEach(() => {
    serviceContext.messageUtil._clearCounter();
    _.merge(serviceContext.bll, {
      rbacAuth: {
        addDefaultACEsToResources: jest.fn()
      }
    });
  });
  describe('#require', function () {
    it('should have correct function exports', function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(8);

      expectFunction(dal, 'createDatasetSchema');
      expectFunction(dal, 'getDataset');
      expectFunction(dal, 'datasetOperation');
      expectFunction(dal, 'getDatasetDataQuery');
    });
  });
  describe('#createDatasetSchema', function () {
    it('should create a dataset', async function () {
      //  //TODO: Finish this
      // chaiExpect(1).to.equal(1);
      // mock up
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

      // mock up upsertSchemaDraft
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
      // _findExistingSchemaByVersion (via _createOrReuseDraft) - no existing
      dbWrite._push([], false);

      // createNewDraft (insert draft)
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

      // mock publish: updateSchemaState
      dbRead._push(
        [
          {
            organizationId: '7682',
            dataRegistryMetadataId: regId,
            id: regId,
            schema: {
              properties: {
                name: {
                  type: 'string'
                },
                imageUrl: {
                  type: 'string'
                }
              }
            },
            status: 'draft',
            storageName: 'foo_bar',
            minorVersion: 0,
            majorVersion: 1
          }
        ],
        false
      );

      // updateSchemaState > get data registry
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

      // updateSchemaState > checkCompatibility (get published schemas)
      dbRead._push([], false);

      // updateSchemaState > _getInheritedStorageName (get published/inactive schemas for inheriting storageName)
      dbRead._push([], false);

      // updateSchemaState > createTable (new storage for major version)
      dbWrite._push([], false);

      // updateSchemaState > update schema to published
      dbWrite._push(
        [
          {
            organizationId: '7682',
            dataRegistryMetadataId: regId,
            id: regId,
            schema: {
              properties: {
                name: {
                  type: 'string'
                },
                imageUrl: {
                  type: 'string'
                }
              }
            },
            status: 'published',
            storageName: 'foo_bar'
          }
        ],
        false
      );

      // updateSchemaState > _deactivateSchemas: get schemas before updating to clear the cache
      dbRead._push([], false);

      // updateSchemaState > update schema properties
      dbWrite._push(
        [
          {
            dataRegistryMetadataId: regId,
            majorVersion: 1,
            storageName: 'foo_bar',
            path: 'name',
            type: 'string'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();
      const res = await dal.createDatasetSchema(context, {
        input: {
          name: 'test registry',
          description: 'dataset test',
          tags: [
            {
              name: 'class',
              value: 'audio'
            },
            {
              name: 'class',
              value: 'image'
            },
            {
              name: 'category',
              value: 'audio'
            }
          ],
          schema: {
            properties: {
              name: {
                type: 'string'
              },
              imageUrl: {
                type: 'string'
              }
            }
          }
        }
      });

      chaiExpect(res).to.exist;
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalled();

      datasetId = res.datasetId;
    });
  });

  describe('#getDataset', function () {
    it('should return a dataset', async function () {
      datasetId = uuid.v4();
      const context = mockUtil.makeContext();
      const res = await dal.getDataset(context, {
        id: datasetId
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.datasetId).to.exist;
      chaiExpect(res.schemaId).to.exist;
      chaiExpect(res.schema.dataRegistryMetadataId).to.exist;
      chaiExpect(res.schema.status).to.exist;
      chaiExpect(res.schema.status).to.equal('published');
    });
  });

  describe('#datasetOperation', function () {
    it('should Add rows to  dataset', async function () {
      // mock data_registries
      dbRead._push(
        [
          {
            organizationId: 7682,
            dataRegistryMetadataId: regId,
            id: regId,
            schema: {
              properties: {
                name: {
                  type: 'string',
                  required: true
                },
                imageUrl: {
                  type: 'string'
                }
              }
            },
            status: 'published',
            storageName: 'foo_bar'
          }
        ],
        false
      );
      // mock data_registry_metadata
      dbRead._push([
        {
          id: regId,
          name: 'test schema',
          description: 'test schema',
          source: 'test',
          organizationId: 7682,
          isSystem: true,
          dataset: [
            {
              id: 'f7448ea6-86d4-4bf9-9bbf-84a4cf7a2eea',
              data: {
                name: 'bar'
              }
            },
            {
              id: '739e5745-7f0d-4ded-8c6a-57e1a0f9440e',
              data: {
                name: 'foo'
              }
            }
          ]
        }
      ]);

      const context = mockUtil.makeContext();
      datasetId = uuid.v4();
      const res = await dal.datasetOperation(context, {
        id: datasetId,
        actions: [
          {
            action: 'ADD',
            data: [
              {
                id: 'f7448ea6-86d4-4bf9-9bbf-84a4cf7a2eea',
                data: {
                  name: 'bar'
                }
              },
              {
                id: '739e5745-7f0d-4ded-8c6a-57e1a0f9440e',
                data: {
                  name: 'foo'
                }
              }
            ]
          }
        ]
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.datasetId).to.equal(datasetId);
      chaiExpect(res.structuredDataObjects).to.have.lengthOf(2);
    });
  });
  describe('#getDatasetDataQuery', function () {
    it('should get rows to dataset', async function () {
      // insert draft
      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryMetadataId: regId,
            organizationId: 7682,
            minorVersion: 1,
            majorVersion: 1,
            status: 'published',
            storageName: 'foo_bar'
          }
        ],
        false
      );

      dbWrite._push(
        [
          {
            id: regId,
            dataRegistryMetadataId: regId,
            organizationId: 7682,
            minorVersion: 1,
            majorVersion: 1,
            status: 'published',
            storageName: 'foo_bar'
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

      const context = mockUtil.makeContext({ authType: 'user' });
      datasetId = uuid.v4();
      const res = await dal.getDatasetDataQuery(context, {
        datasetId: datasetId
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
    });
  });
});
