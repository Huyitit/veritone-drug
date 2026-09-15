'use strict';

describe('model Cluster', () => {
  const Cluster = require('../model')().Cluster;

  it('Cluster is a constructor function', () => {
    expect(Cluster).toEqual(expect.any(Function));
    const inst = new Cluster({});
    expect(inst.constructor).toBe(Cluster);
  });

  it('Cluster sets clusterId and organizationId', () => {
    const inst = new Cluster({ clusterId: 'c1', organizationId: 5 });
    expect(inst.clusterId).toBe('c1');
    expect(inst.organizationId).toBe(5);
  });

  it('Cluster omits fields not in the schema', () => {
    const inst = new Cluster({ unknownField: 'ignored' });
    expect(inst.unknownField).toBeUndefined();
  });

  it('Cluster validate() returns null for a valid cluster instance', () => {
    const inst = new Cluster({ clusterId: 'c1', displayName: 'My Cluster' });
    expect(inst.validate()).toBeNull();
  });
});
