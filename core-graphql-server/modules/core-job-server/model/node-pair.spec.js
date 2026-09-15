'use strict';

const NodePair = require('./node-pair')();

const valid = {
  clusterId: 'c1',
  displayName: 'node',
  role: 'primary',
  offlineBrowsing: false
};

describe('core-job-server node-pair model — required fields', () => {
  it('marks clusterId, displayName, role and offlineBrowsing as required', () => {
    expect(NodePair.requiredFields).toEqual({
      clusterId: true,
      displayName: true,
      role: true,
      offlineBrowsing: true
    });
  });

  it('validates a well-formed instance with no errors', () => {
    expect(new NodePair(valid).validate()).toBeNull();
  });
});

describe('core-job-server node-pair model — field validation', () => {
  it('requires the string field clusterId', () => {
    expect(new NodePair({ ...valid, clusterId: undefined }).validate()).toEqual({
      clusterId: { message: 'should be a String' }
    });
  });

  it('requires role to be a String', () => {
    expect(new NodePair({ ...valid, role: 5 }).validate()).toEqual({
      role: { message: 'should be a String' }
    });
  });

  it('requires the boolean field offlineBrowsing', () => {
    expect(
      new NodePair({ ...valid, offlineBrowsing: undefined }).validate()
    ).toEqual({
      offlineBrowsing: { message: 'should be a Boolean (or either 0 or 1)' }
    });
  });
});
