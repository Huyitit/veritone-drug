'use strict';
// VE-24956: coverage for the JobBundleCreate create-model (clusterId required).
describe('model JobBundleCreate', () => {
  const JobBundleCreate = require('../model')().JobBundleCreate;
  it('JobBundleCreate is a constructor function', () => {
    expect(JobBundleCreate).toEqual(expect.any(Function));
    expect(new JobBundleCreate({}).constructor).toBe(JobBundleCreate);
  });
  it('JobBundleCreate requires clusterId', () => {
    const errors = new JobBundleCreate({}).validate();
    expect(errors).not.toBeNull();
    expect(errors.clusterId).toBeTruthy();
  });
});
