const chaiExpect = require('chai').expect; //require('expect.js');
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();
const { v5: uuidv5 } = require('uuid'),
  uuidNamespace = 'a61091ed-1f70-45e1-b3c3-475378e8289d',
  stringify = require('json-stable-stringify');

const {
  graphqlSync,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLID,
  GraphQLString
} = require('graphql');

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

const resolver = require('./AssetSourceData.js')(serviceContext);

// Build a real GraphQLResolveInfo whose current field is `schema` returning a
// `Schema` type, so parseResolveInfo() inside the resolver sees the requested
// selection set (fieldsByTypeName.Schema) the same way it would at runtime.
function makeSchemaResolveInfo(query) {
  let capturedInfo;
  const SchemaType = new GraphQLObjectType({
    name: 'Schema',
    fields: {
      id: { type: GraphQLID },
      dataRegistryId: { type: GraphQLID },
      definition: { type: GraphQLString }
    }
  });
  const QueryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      schema: {
        type: SchemaType,
        resolve: (obj, args, ctx, info) => {
          capturedInfo = info;
          return {};
        }
      }
    }
  });
  const gqlSchema = new GraphQLSchema({ query: QueryType });
  const result = graphqlSync({ schema: gqlSchema, source: query });
  if (result.errors) {
    throw result.errors[0];
  }
  return capturedInfo;
}

describe('AssetSourceData.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });
  describe('#require', function () {
    it('should have correct structure', async function () {
      chaiExpect(typeof resolver).to.equal('object');
      chaiExpect(Object.keys(resolver).length).to.equal(4);
      chaiExpect(typeof resolver.task).to.equal('function');
      chaiExpect(typeof resolver.engine).to.equal('function');
      chaiExpect(typeof resolver.engineId).to.equal('function');
      chaiExpect(typeof resolver.schema).to.equal('function');
    });
  });
  describe('#task', function () {
    it('should get task if there is one', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '20010101_t123',
          engine_id: 'e123'
        }
      ]);
      const res = await resolver.task(
        {
          taskId: '20010101_t123'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('20010101_t123');
      chaiExpect(res.engineId).to.equal('e123');
    });
    it('should not fail if there is no task', async function () {
      const res = await resolver.task({}, {}, mockUtil.makeContext('user'));
      chaiExpect(res).to.be.null;
    });
  });
  describe('#engineId', function () {
    it('should handle no engine ID', async function () {
      const res = await resolver.engineId(
        { id: 'a123' },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.be.undefined;
    });
    it('should get engineId off asset source data', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'ea123'
        }
      ]);
      const res = await resolver.engineId(
        {
          engineId: 'e123'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.equal('e123');
    });
    it('should get engineId off task', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '20010101_t123',
          engine_id: 'e123'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'e123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'e123',
          name: 'test engine'
        }
      ]);

      const res = await resolver.engineId(
        {
          taskId: '20010101_t123'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.equal('e123');
    });
    it('should get engineId off task if engineId also on source data', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          asset: 'source123',
          id: 'e223'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '20010101_t123',
          engine_id: 'e123' // we should prefer this engine ID
        }
      ]);
      const res = await resolver.engineId(
        {
          engineId: 'source123',
          taskId: '20010101_t123'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.equal('e123');
    });
    it('should get engineId off source if no task ID', async function () {
      serviceContext.dbConnections['core'].read._clearResultQueue();
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          asset: 'source124',
          id: 'e124'
        }
      ]);
      const res = await resolver.engineId(
        {
          engineId: 'source124'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.equal('e124');
    });
  });
  describe('#engine', function () {
    // same as engineId tests, except that we return
    // an engine object instead of just ID.
    it('should handle no engine ID', async function () {
      const res = await resolver.engine(
        { id: 'a123' },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.be.null;
    });
    it('should get engineId off asset source data', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'ea123'
        }
      ]);
      const res = await resolver.engine(
        {
          engineId: 'e123'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('ea123');
    });
    it('should get engine off task', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '20010101_t123',
          engine_id: 'e123'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'ea123',
          name: 'test engine'
        }
      ]);

      const res = await resolver.engine(
        {
          taskId: '20010101_t123'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('ea123');
    });
    it('should get engineId off task if engineId also on source data', async function () {
      serviceContext.dbConnections['core'].read._push([]);

      serviceContext.dbConnections['core'].read._push([
        {
          asset: 'source1234',
          id: 'e223'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 't1234',
          engine_id: 'e1234' // we should prefer this engine ID
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e1234'
        }
      ]);

      const res = await resolver.engine(
        {
          engineId: 'source1234',
          taskId: mockUtil.toTaskId('t1234')
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('e1234');
    });

    it('should get engineId off source if no task ID', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          asset: 'source125',
          id: 'e124'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124'
        }
      ]);

      const res = await resolver.engine(
        {
          engineId: 'source125'
        },
        {},
        mockUtil.makeContext('user')
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('e124');
    });
  });
  describe('#schema', function () {
    afterEach(() => {
      jest.restoreAllMocks();
    });
    it('should handle no schema ID', async function () {
      const res = await resolver.schema({}, {}, mockUtil.makeContext());
      chaiExpect(res).to.be.null;
    });
    it('should return an id stub without any dal call when only id is requested', async function () {
      const cacheSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchemaRowFromCache'
      );
      const getSchemaSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchema'
      );
      const info = makeSchemaResolveInfo('{ schema { id } }');
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        {},
        mockUtil.makeContext(),
        info
      );
      chaiExpect(res).to.deep.equal({
        id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
      });
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(getSchemaSpy).not.toHaveBeenCalled();
    });
    it('should serve id + dataRegistryId from the cache row, not getSchema', async function () {
      const getSchemaSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchema'
      );
      const cacheSpy = jest
        .spyOn(serviceContext.dal.structuredData, 'getSchemaRowFromCache')
        .mockResolvedValue({
          id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
          dataRegistryMetadataId: 'reg-999'
        });
      const info = makeSchemaResolveInfo('{ schema { id dataRegistryId } }');
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        {},
        mockUtil.makeContext(),
        info
      );
      chaiExpect(res.id).to.equal('67cd4dd0-2f75-445d-a6f0-2f297d6cd182');
      chaiExpect(res.dataRegistryMetadataId).to.equal('reg-999');
      expect(cacheSpy).toHaveBeenCalledWith(
        '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
      );
      expect(getSchemaSpy).not.toHaveBeenCalled();
    });
    it('should fall through to getSchema when a heavy field is requested', async function () {
      const cacheSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchemaRowFromCache'
      );
      const getSchemaSpy = jest
        .spyOn(serviceContext.dal.structuredData, 'getSchema')
        .mockResolvedValue({
          id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
          dataRegistryMetadataId: 'reg-999'
        });
      const info = makeSchemaResolveInfo('{ schema { id definition } }');
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        { organizationId: 'org-1' },
        mockUtil.makeContext(),
        info
      );
      chaiExpect(res.id).to.equal('67cd4dd0-2f75-445d-a6f0-2f297d6cd182');
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(getSchemaSpy).toHaveBeenCalledWith(expect.any(Object), {
        id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
        organizationId: 'org-1'
      });
    });
    // Regression: fieldsByTypeName is keyed by response key (alias), so the
    // light paths must be chosen from each node's real field `name`.
    // Jira: VE-24648, PR: #4234 (review by @cantv6605-seta)
    it('should not take the id-only fast path when a heavy field is aliased to id', async function () {
      const cacheSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchemaRowFromCache'
      );
      const getSchemaSpy = jest
        .spyOn(serviceContext.dal.structuredData, 'getSchema')
        .mockResolvedValue({
          id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
          schema: { real: true }
        });
      const info = makeSchemaResolveInfo('{ schema { id: definition } }');
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        { organizationId: 'org-1' },
        mockUtil.makeContext(),
        info
      );
      // the aliased `definition` must still be resolvable off the returned object
      chaiExpect(res.schema).to.deep.equal({ real: true });
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(getSchemaSpy).toHaveBeenCalledWith(expect.any(Object), {
        id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
        organizationId: 'org-1'
      });
    });
    it('should not take the cache path when a heavy field is aliased to dataRegistryId', async function () {
      const cacheSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchemaRowFromCache'
      );
      const getSchemaSpy = jest
        .spyOn(serviceContext.dal.structuredData, 'getSchema')
        .mockResolvedValue({
          id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
          schema: { real: true }
        });
      const info = makeSchemaResolveInfo(
        '{ schema { id dataRegistryId: definition } }'
      );
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        { organizationId: 'org-1' },
        mockUtil.makeContext(),
        info
      );
      chaiExpect(res.schema).to.deep.equal({ real: true });
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(getSchemaSpy).toHaveBeenCalled();
    });
    it('should still take the id-only fast path when id is aliased to a heavy name', async function () {
      const cacheSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchemaRowFromCache'
      );
      const getSchemaSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchema'
      );
      const info = makeSchemaResolveInfo('{ schema { definition: id } }');
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        {},
        mockUtil.makeContext(),
        info
      );
      chaiExpect(res).to.deep.equal({
        id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
      });
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(getSchemaSpy).not.toHaveBeenCalled();
    });
    it('should take the id-only fast path when id is requested twice under different aliases', async function () {
      const cacheSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchemaRowFromCache'
      );
      const getSchemaSpy = jest.spyOn(
        serviceContext.dal.structuredData,
        'getSchema'
      );
      const info = makeSchemaResolveInfo('{ schema { a: id b: id } }');
      const res = await resolver.schema(
        { schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' },
        {},
        mockUtil.makeContext(),
        info
      );
      chaiExpect(res).to.deep.equal({
        id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
      });
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(getSchemaSpy).not.toHaveBeenCalled();
    });
    it('should get a schema', async function () {
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
          }
        ],
        false
      );
      const res = await resolver.schema(
        {
          schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
        },
        {},
        mockUtil.makeContext()
      );
    });
    it('should not_found on missing or bad schema', async function () {
      serviceContext.dbConnections['third_party'].read._push([], false);
      try {
        await resolver.schema(
          {
            schemaId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
          },
          {},
          mockUtil.makeContext()
        );
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
    it('should not_found on missing or bad schema', async function () {
      serviceContext.dbConnections['third_party'].read._push([], false);
      try {
        await resolver.schema(
          {
            schemaId: 'not a guid'
          },
          {},
          mockUtil.makeContext()
        );
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
  });
});
