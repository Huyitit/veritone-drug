'use strict';
const chaiExpect = require('chai').expect;

const makeDAL = (overrides = {}) => ({
  ingestSlug: {
    getSource: overrides.getSource || jest.fn().mockResolvedValue({ id: 'src-1' }),
    getTDO: overrides.getTDO || jest.fn().mockResolvedValue({ id: 'tdo-1' }),
    getAsset: overrides.getAsset || jest.fn().mockResolvedValue({ id: 'asset-1' }),
    getTDOId: overrides.getTDOId || jest.fn().mockResolvedValue('tdo-id-1'),
    getAssetId: overrides.getAssetId || jest.fn().mockResolvedValue('asset-id-1')
  }
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#IngestSlug', function () {
  describe('#source', function () {
    it('delegates to dal.ingestSlug.getSource with context and slug', async function () {
      const dal = makeDAL();
      const resolvers = require('./IngestSlug.js')({ dal });
      const slug = { id: 'slug-1' };
      const ctx = { token: 'tok' };
      const result = await resolvers.source(slug, {}, ctx);
      chaiExpect(dal.ingestSlug.getSource.mock.calls[0]).to.deep.equal([ctx, slug]);
      chaiExpect(result).to.deep.equal({ id: 'src-1' });
    });
  });

  describe('#tdo', function () {
    it('delegates to dal.ingestSlug.getTDO with context and slug', async function () {
      const dal = makeDAL();
      const resolvers = require('./IngestSlug.js')({ dal });
      const slug = { id: 'slug-2' };
      const ctx = {};
      const result = await resolvers.tdo(slug, {}, ctx);
      chaiExpect(dal.ingestSlug.getTDO.mock.calls[0]).to.deep.equal([ctx, slug]);
      chaiExpect(result).to.deep.equal({ id: 'tdo-1' });
    });
  });

  describe('#asset', function () {
    it('delegates to dal.ingestSlug.getAsset with context and slug', async function () {
      const dal = makeDAL();
      const resolvers = require('./IngestSlug.js')({ dal });
      const slug = { id: 'slug-3' };
      const ctx = {};
      const result = await resolvers.asset(slug, {}, ctx);
      chaiExpect(dal.ingestSlug.getAsset.mock.calls[0]).to.deep.equal([ctx, slug]);
      chaiExpect(result).to.deep.equal({ id: 'asset-1' });
    });
  });

  describe('#tdoId', function () {
    it('delegates to dal.ingestSlug.getTDOId with context and slug', async function () {
      const dal = makeDAL();
      const resolvers = require('./IngestSlug.js')({ dal });
      const slug = { id: 'slug-4' };
      const ctx = {};
      const result = await resolvers.tdoId(slug, {}, ctx);
      chaiExpect(dal.ingestSlug.getTDOId.mock.calls[0]).to.deep.equal([ctx, slug]);
      chaiExpect(result).to.equal('tdo-id-1');
    });
  });

  describe('#assetId', function () {
    it('delegates to dal.ingestSlug.getAssetId with context and slug', async function () {
      const dal = makeDAL();
      const resolvers = require('./IngestSlug.js')({ dal });
      const slug = { id: 'slug-5' };
      const ctx = {};
      const result = await resolvers.assetId(slug, {}, ctx);
      chaiExpect(dal.ingestSlug.getAssetId.mock.calls[0]).to.deep.equal([ctx, slug]);
      chaiExpect(result).to.equal('asset-id-1');
    });
  });
});
