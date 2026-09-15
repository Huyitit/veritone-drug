'use strict';
// VE-24956: coverage for the BuildUpload create-model (dockerImage required).
describe('model BuildUpload', () => {
  const BuildUpload = require('../model')().BuildUpload;
  it('BuildUpload is a constructor function', () => {
    expect(BuildUpload).toEqual(expect.any(Function));
    expect(new BuildUpload({}).constructor).toBe(BuildUpload);
  });
  it('BuildUpload requires dockerImage', () => {
    const errors = new BuildUpload({}).validate();
    expect(errors).not.toBeNull();
    expect(errors.dockerImage).toBeTruthy();
  });
});
