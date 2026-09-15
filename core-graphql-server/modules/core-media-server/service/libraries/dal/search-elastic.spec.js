/* global describe, it, expect, beforeEach */
/* eslint func-names:off,camelcase:off */

'use strict';

// The SUT calls require('./../../../../../util/elastic.js')(config) which returns { client, newConnection }.
// Then calls esClient.newConnection(host) for each operation.
// We mock util/elastic.js to return a factory that provides our esmock as the newConnection result.
let esmock;

jest.mock('./../../../../../util/elastic.js', () => () => ({
  get client() { return esmock; },
  newConnection: () => esmock
}));

const config = {
  elastic: {
    connection: {
      host: '127.0.0.1:9200',
      version: '1.7'
    },
    indexName: 'library',
    indexType: 'library-entity',
    libraryTypeIndentifierTypes: {
      people: ['face']
    }
  }
};

const libraryInfo = {
  libraryId: '-lib-1-',
  name: '-lib-1-',
  libraryType: {
    entityIdentifierTypes: [{ entityIdentifierTypeId: 'people' }]
  },
  ownerOrgId: '-owner-org-id-'
};

const entity = {
  entityId: '-entity-1-',
  libraryId: '-lib-1-',
  profileImageUrl: '-photo-uri-',
  name: '-name-',
  createdDateTime: new Date(),
  modifiedDateTime: new Date()
};

const initSearch = require('./search-elastic').init;

describe('search-elastic.dal', function() {
  let libraryDal;

  beforeEach(function() {
    esmock = {
      index: jest.fn((req, callback) => callback()),
      delete: jest.fn((req, callback) => callback()),
      deleteByQuery: jest.fn((req, callback) => callback())
    };

    libraryDal = {
      getLibraries: jest.fn().mockResolvedValue({
        totalResults: 1,
        results: [libraryInfo]
      })
    };
  });

  it('index entity', function(done) {
    let search = initSearch(config, libraryDal);
    search.sync._indexEntity(entity, function onIndex(err) {
      try {
        expect(err).toBeUndefined();
        expect(libraryDal.getLibraries).toHaveBeenCalledWith({
          libraryId: '-lib-1-'
        });
        expect(esmock.index).toHaveBeenCalledWith(
          {
            index: 'library',
            type: 'library-entity',
            id: '-entity-1-',
            body: {
              entityId: '-entity-1-',
              entityName: '-name-',
              libraryId: '-lib-1-',
              libraryName: '-lib-1-',
              libraryCoverImageUrl: null,
              organizationId: '-owner-org-id-',
              profileImageUrl: '-photo-uri-',
              created: entity.createdDateTime.valueOf(),
              modified: entity.modifiedDateTime.valueOf(),
              identifierType: ['people']
            }
          },
          expect.any(Function)
        );
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('delete entity', function(done) {
    let search = initSearch(config, libraryDal);
    search.sync._deleteEntity('-entity-1-', function onDelete() {
      expect(esmock.delete).toHaveBeenCalledWith(
        {
          index: 'library',
          type: 'library-entity',
          id: '-entity-1-'
        },
        expect.any(Function)
      );
      done();
    });
  });

  it('delete libarary entities', function(done) {
    let search = initSearch(config, libraryDal);
    search.sync._deleteLibraryEntities('-library-1-', function onDelete() {
      expect(esmock.deleteByQuery).toHaveBeenCalled();
      done();
    });
  });

  it('test autopopulate dates', function() {
    // _buildElasticDocument stamps `created`/`modified` from a real-clock read
    // (`new Date()`) taken inside the call when the entity has no explicit
    // date. Comparing that against a second, independently-taken
    // `new Date()` read in the test with a hardcoded ms tolerance is a
    // real-clock-boundary race: under CI scheduling delay (GC pause, event
    // loop contention from sibling suites) the two reads can be far enough
    // apart to blow the tolerance (T53 - observed 31ms elapsed vs a 30ms
    // budget). Freeze the clock with Jest fake timers -- already a
    // dependency of this package (used elsewhere for timer/interval
    // control, e.g. dal/dalAdmin.spec.js, bll/asset.spec.js; this is the
    // first use to freeze `Date` for an equality assertion) -- so both
    // reads land on the exact same instant. This removes the flakiness
    // rather than just widening the window (T36/PR #4373 precedent), which
    // fits here because the timestamp comes from a plain `new Date()` in
    // _buildElasticDocument, not from a value floored deep inside a
    // third-party library the way T36's JWT `exp` was.
    const fixedNow = new Date('2024-01-01T00:00:00.000Z');
    jest.useFakeTimers({ now: fixedNow });
    try {
      let search = initSearch(config, libraryDal);
      let e = Object.assign(entity);
      e.createdDateTime = undefined;
      e.modifiedDateTime = undefined;
      let doc = search.sync._buildElasticDocument(entity, libraryInfo);
      expect(doc.created).toBeTruthy();
      expect(doc.modified).toBeTruthy();
      expect(doc.created).toBe(fixedNow.valueOf());
      expect(doc.modified).toBe(fixedNow.valueOf());
    } finally {
      jest.useRealTimers();
    }
  });
});
