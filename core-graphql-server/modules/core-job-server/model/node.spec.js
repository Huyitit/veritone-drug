'use strict';

describe('model node family (Node, NodeCreate, NodeMetrics, NodePair, NodeUpdate)', () => {
  const models = require('../model')();
  const NodeCreate = models.NodeCreate;
  const NodeMetrics = models.NodeMetrics;
  const NodePair = models.NodePair;
  const NodeUpdate = models.NodeUpdate;

  it('NodeMetrics validate() returns errors when required fields are absent', () => {
    const inst = new NodeMetrics({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.cpuCount).toBeTruthy();
    expect(errors.mbDisk).toBeTruthy();
  });

  it('NodeCreate validate() returns errors when required fields are absent', () => {
    const inst = new NodeCreate({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.nodeId).toBeTruthy();
  });

  it('NodePair validate() returns errors when required fields are absent', () => {
    const inst = new NodePair({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.clusterId).toBeTruthy();
    expect(errors.displayName).toBeTruthy();
    expect(errors.role).toBeTruthy();
  });

  it('NodeUpdate validate() returns error when displayName is absent', () => {
    const inst = new NodeUpdate({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.displayName).toBeTruthy();
  });
});
