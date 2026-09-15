const chaiExpect = require('chai').expect;

const serviceContext = require('../test/serviceContext.mock.js')();
let resolver;
describe('Collection.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    resolver = require('./Share')(serviceContext);
  });

  describe('#require', function () {
    it('should have correct structure', async function () {
      chaiExpect(typeof resolver).to.equal('object');
      chaiExpect(Object.keys(resolver).length).to.equal(5);
      chaiExpect(typeof resolver.id).to.equal('function');
      chaiExpect(typeof resolver.folderId).to.equal('function');
      chaiExpect(typeof resolver.type).to.equal('function');
      chaiExpect(typeof resolver.mentionId).to.equal('function');
      chaiExpect(typeof resolver.shareOptionsJson).to.equal('function');
    });

    it('should return empty string if there is no shareId', () => {
      const res = resolver.id({});
      chaiExpect(res).to.equal('');
    });

    it('should return provided sharedId with sharedId provided', () => {
      const res = resolver.id({ shareId: 'shareId' });
      chaiExpect(res).to.equal('shareId');
    });

    it('should return shareInfo.objectMetadata.collectionId when objectType is not collection', () => {
      const res = resolver.folderId({
        objectType: 'not_collection',
        shareInfo: {
          objectMetadata: {
            collectionId: 'collectionId'
          }
        }
      });
      chaiExpect(res).to.equal('collectionId');
    });

    it('should return objectId when objectType is collection', () => {
      const res = resolver.folderId({
        objectType: 'collection',
        objectId: 'objectId'
      });
      chaiExpect(res).to.equal('objectId');
    });

    it('should return undefined when there is no objectType', () => {
      const res = resolver.type({});
      chaiExpect(res).to.equal(undefined);
    });

    it('should return objectType when provide it', () => {
      const res = resolver.type({ objectType: 'objectType' });
      chaiExpect(res).to.equal('objectType');
    });

    it('should return mentionId when objectType is not mention', () => {
      const res = resolver.mentionId({
        objectType: 'not_mention',
        mentionId: 'mentionId'
      });
      chaiExpect(res).to.equal('mentionId');
    });

    it('should return objectId when objectType is mention', () => {
      const res = resolver.mentionId({
        objectType: 'mention',
        objectId: 'objectId'
      });
      chaiExpect(res).to.equal('objectId');
    });

    it('should return undefined when there is no shareOptions', () => {
      const res = resolver.shareOptionsJson({});
      chaiExpect(res).to.equal(undefined);
    });

    it('should return shareOptionsJson when provide it', () => {
      const res = resolver.shareOptionsJson({
        shareOptions: 'shareOptionsJson'
      });
      chaiExpect(res).to.equal('shareOptionsJson');
    });
  });
});
