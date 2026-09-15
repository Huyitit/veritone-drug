'use strict';
// VE-24956: coverage for the JobBundleResults create-model (found required).
describe('model JobBundleResults', () => {
  const JobBundleResults = require('../model')().JobBundleResults;
  it('JobBundleResults is a constructor function', () => {
    expect(JobBundleResults).toEqual(expect.any(Function));
    expect(new JobBundleResults({}).constructor).toBe(JobBundleResults);
  });
  it('JobBundleResults requires found', () => {
    const errors = new JobBundleResults({}).validate();
    expect(errors).not.toBeNull();
    expect(errors.found).toBeTruthy();
  });
});
