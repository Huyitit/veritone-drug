const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const resolver = require('./Trigger.js')(serviceContext);

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config
  };
});

describe('Trigger.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolver).to.be.a('object');
      const keys = Object.keys(resolver);
      chaiExpect(keys.length).to.equal(7);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });

    it('should return empty string when there is no eventTriggerId', () => {
      const res = resolver.id({ eventTriggerId: '' });
      chaiExpect(res).to.equal('');
    });

    it('should return eventTriggerId when provide it', () => {
      const res = resolver.id({ eventTriggerId: 'eventTriggerId' });
      chaiExpect(res).to.equal('eventTriggerId');
    });

    it('should return undefined when there is no eventName', () => {
      const res = resolver.event({});
      chaiExpect(res).to.equal(undefined);
    });

    it('should return eventName when provide it', () => {
      const res = resolver.event({ eventName: 'eventName' });
      chaiExpect(res).to.equal('eventName');
    });

    it('should return undefined when there is no targetName', () => {
      const res = resolver.target({ targetName: 'targetName' });
      chaiExpect(res).to.equal('targetName');
    });

    it('should return undefined when there is no createdAtUtc', () => {
      const res = resolver.createdDateTime({});
      chaiExpect(res).to.equal(undefined);
    });

    it('should return createdDateTime when provide it', () => {
      const res = resolver.createdDateTime({
        createdAtUtc: 'createdAtUtc'
      });
      chaiExpect(res).to.equal('createdAtUtc');
    });

    it('should return undefined when there is no modifiedDateTime', () => {
      const res = resolver.modifiedDateTime({});
      chaiExpect(res).to.equal(undefined);
    });

    it('should return updatedAtUtc when provide it', () => {
      const res = resolver.modifiedDateTime({
        updatedAtUtc: 'updatedAtUtc'
      });
      chaiExpect(res).to.equal('updatedAtUtc');
    });

    it('should return empty string when there is no createdBy', () => {
      const res = resolver.createdBy({});
      chaiExpect(res).to.equal('');
    });

    it('should return createdBy when provide it', () => {
      const res = resolver.createdBy({
        createdBy: 'createdBy'
      });
      chaiExpect(res).to.equal('createdBy');
    });

    it('should return empty string when there is no updatedBy', () => {
      const res = resolver.updatedBy({});
      chaiExpect(res).to.equal('');
    });

    it('should return updatedBy when provide it', () => {
      const res = resolver.updatedBy({
        updatedBy: 'updatedBy'
      });
      chaiExpect(res).to.equal('updatedBy');
    });
  });
});
