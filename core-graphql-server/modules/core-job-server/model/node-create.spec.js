'use strict';
// VE-24956: coverage for the NodeCreate create-model (nodeId required).
describe('model NodeCreate', () => {
  const NodeCreate = require('../model')().NodeCreate;
  it('NodeCreate is a constructor function', () => {
    expect(NodeCreate).toEqual(expect.any(Function));
    expect(new NodeCreate({}).constructor).toBe(NodeCreate);
  });
  it('NodeCreate requires nodeId', () => {
    const errors = new NodeCreate({}).validate();
    expect(errors).not.toBeNull();
    expect(errors.nodeId).toBeTruthy();
  });
});
