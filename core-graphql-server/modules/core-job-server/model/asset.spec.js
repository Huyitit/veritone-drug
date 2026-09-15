'use strict';

describe('model Asset and AmiNodeCreate (lower-frequency models)', () => {
  const models = require('../model')();
  const Asset = models.Asset;
  const AmiNodeCreate = models.AmiNodeCreate;

  it('Asset is a constructor function', () => {
    expect(Asset).toEqual(expect.any(Function));
    const inst = new Asset({});
    expect(inst.constructor).toBe(Asset);
  });

  it('Asset sets assetId and type fields', () => {
    const inst = new Asset({ assetId: 7, type: 'media' });
    expect(inst.assetId).toBe(7);
    expect(inst.type).toBe('media');
  });

  it('AmiNodeCreate validate() returns error when nodeId is absent', () => {
    const inst = new AmiNodeCreate({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.nodeId).toBeTruthy();
  });
});
