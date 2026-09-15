'use strict';
// VE-24956: coverage for the NodeUpdate create-model (displayName required).
describe('model NodeUpdate', () => {
  const NodeUpdate = require('../model')().NodeUpdate;
  it('NodeUpdate is a constructor function', () => {
    expect(NodeUpdate).toEqual(expect.any(Function));
    expect(new NodeUpdate({}).constructor).toBe(NodeUpdate);
  });
  it('NodeUpdate requires displayName', () => {
    const errors = new NodeUpdate({}).validate();
    expect(errors).not.toBeNull();
    expect(errors.displayName).toBeTruthy();
  });
});
