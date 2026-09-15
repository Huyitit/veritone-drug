'use strict';
// VE-24956: coverage for the AmiNodeCreate create-model (nodeId required).
describe('model AmiNodeCreate', () => {
  const AmiNodeCreate = require('../model')().AmiNodeCreate;
  it('AmiNodeCreate is a constructor function', () => {
    expect(AmiNodeCreate).toEqual(expect.any(Function));
    expect(new AmiNodeCreate({}).constructor).toBe(AmiNodeCreate);
  });
  it('AmiNodeCreate requires nodeId', () => {
    const errors = new AmiNodeCreate({}).validate();
    expect(errors).not.toBeNull();
    expect(errors.nodeId).toBeTruthy();
  });
});
