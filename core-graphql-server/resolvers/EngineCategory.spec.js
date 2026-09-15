const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');

const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

let resolvers = require('./EngineCategory.js')(serviceContext);

describe('#EngineCategory', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(Object.keys(resolvers).length).to.equal(12);
    });
  });
  describe('modifiedDateTime', function () {
    it('should handle epoch', async function () {
      const res = await resolvers.modifiedDateTime({
        modifiedDateTime: 1561536401
      });
      chaiExpect(res).to.equal(1561536401000);
    });
    it('should handle string', async function () {
      const now = moment().toISOString();
      chaiExpect(
        await resolvers.modifiedDateTime({ modifiedDateTime: now })
      ).to.equal(now);
    });
  });
  describe('createdDateTime', function () {
    it('should handle epoch', async function () {
      const res = await resolvers.createdDateTime({
        createdDateTime: 1561536401
      });
      chaiExpect(res).to.equal(1561536401000);
    });
    it('should handle string', async function () {
      const now = moment().toISOString();
      chaiExpect(
        await resolvers.createdDateTime({ createdDateTime: now })
      ).to.equal(now);
    });
  });
  describe('#engines', function () {
    it('shoud return engines', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engine1',
          engine_alias_id: 'alias1',
          engine_name: 'test engine'
        }
      ]);
      const res = await resolvers.engines({}, {}, mockUtil.makeContext(), {});
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records[0].id).to.equal('engine1');
    });
  });
  describe('#engine IDs', function () {
    it('shoud return engine IDs', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engine1',
          engine_alias_id: 'alias1',
          engine_name: 'test engine'
        }
      ]);
      const res = await resolvers.engineIds({}, {}, mockUtil.makeContext(), {});
      chaiExpect(res).to.exist;
      chaiExpect(res).to.deep.equal(['engine1']);
    });
  });

  describe('#categoryMetadataKey', function () {
    it('should return category', function () {
      chaiExpect(
        resolvers.categoryMetadataKey({ dependencies: { category: 'test' } })
      ).to.equal('test');
    });
    it('should handle empty', function () {
      chaiExpect(resolvers.categoryMetadataKey({})).to.be.null;
    });
  });
  describe('#categoryType', function () {
    it('should return category', function () {
      chaiExpect(resolvers.categoryType({ dataField: 'test' })).to.equal(
        'test'
      );
      chaiExpect(resolvers.categoryType({})).to.be.undefined;
    });
  });
  describe('#totalEngines', function () {
    it('should return total number of engines', function () {
      chaiExpect(
        resolvers.totalEngines({ engineIds: ['test1', 'test2'] })
      ).to.equal(2);
      chaiExpect(resolvers.totalEngines({})).to.equal(0);
    });
  });

  describe('#libraryEntityIdentifierTypeIDs', function () {
    it('should get library entity identifier type IDs', async function () {
      const res = await resolvers.libraryEntityIdentifierTypeIds(
        {
          libraryIdentifierTypes: ['face', 'person']
        },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal(['face', 'person']);
    });
  });
  describe('#libraryEntityIdentifierTypes', function () {
    it('should get library entity identifier types', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'id1',
            label: 'type',
            label_plural: 'types',
            description: 'whatever',
            data_type: 'image'
          }
        ],
        true,
        ['entity_identifier_type_id', 'libraries.entity_identifier_type'],
        (sql, vars) => {
          if (vars.length != 3)
            throw new Error('should have 3 vars instead of ' + vars.length);
          if (!_.isString(vars[2]))
            throw new Error('vars[2] is wrong type:  ' + typeof vars[2]);
          if (vars[2] !== 'face')
            throw new Error('vars[2] is wrong:  ' + vars[2]);
          if (vars[0] !== 20)
            throw new Error('vars[0] limit is wrong:  ' + vars[0]);
          if (vars[1] !== 0)
            throw new Error('vars[1] offset is wrong:  ' + vars[1]);
          return true;
        }
      ); // VTN-25995 will cause SQL parse error or validation function fail

      const res = await resolvers.libraryEntityIdentifierTypes(
        {
          libraryIdentifierTypes: ['face']
        },
        { limit: 20 },
        mockUtil.makeContext(),
        {}
      );
    });

    it('should get library entity identifier types - multiple', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'id1',
            label: 'type',
            label_plural: 'types',
            description: 'whatever',
            data_type: 'image'
          },
          {
            id: 'id2',
            label: 'type2',
            label_plural: 'types2'
          }
        ],
        true,
        ['entity_identifier_type_id', 'libraries.entity_identifier_type'],
        (sql, vars) => {
          if (vars.length != 4)
            throw new Error('should have 4 vars instead of ' + vars.length);
          if (!_.isString(vars[2]))
            throw new Error('vars[2] is wrong type:  ' + typeof vars[2]);
          if (vars[2] !== 'face')
            throw new Error('vars[2] is wrong:  ' + vars[2]);
          if (vars[3] !== 'person')
            throw new Error('vars[3] is wrong:  ' + vars[3]);
          if (vars[0] !== 10)
            throw new Error('vars[0] limit is wrong:  ' + vars[0]);
          if (vars[1] !== 2)
            throw new Error('vars[1] offset is wrong:  ' + vars[1]);
          return true;
        }
      ); // VTN-25995 will cause SQL parse error or validation function fail

      const res = await resolvers.libraryEntityIdentifierTypes(
        {
          libraryIdentifierTypes: ['face', 'person']
        },
        { limit: 10, offset: 2 },
        mockUtil.makeContext(),
        {}
      );
    });
  });

  describe('exportFormats', function () {
    it('should default to []', async function () {
      const res = await resolvers.exportFormats({});
      chaiExpect(res).to.deep.equal([]);
    });
    it('should get values', async function () {
      const res = await resolvers.exportFormats({
        exportFormats: ['format1', 'format2']
      });
      chaiExpect(res).to.deep.equal(['format1', 'format2']);
    });
  });

  describe('searchConfiguration', function () {
    it('should map search config', async function () {
      const res = await resolvers.searchConfiguration({
        search: {
          autocompleteField: 'testField', // one autocompleteField
          searchField: 'testField2', // custom searchField
          enabled: true,
          metadataKey: 'meta'
        },
        elastic: {
          enabled: true
        }
      });

      chaiExpect(_.get(res, 'searchFields[0].searchField')).to.equal('custom');
      chaiExpect(_.get(res, 'searchFields[0].indexField')).to.equal(
        'testField2'
      );
      chaiExpect(
        _.get(res, 'autocompleteFields[0].autocompleteField')
      ).to.equal('custom');
      chaiExpect(_.get(res, 'autocompleteFields[0].indexField')).to.equal(
        'testField'
      );
      chaiExpect(_.get(res, 'isSearchEnabled')).to.be.true;
      chaiExpect(_.get(res, 'isElasticEnabled')).to.be.true;
      chaiExpect(_.get(res, 'searchMetadataKey')).to.equal('meta');
    });
  });
});
