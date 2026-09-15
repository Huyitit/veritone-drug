'use strict';

describe('model job-bundle family', () => {
  const models = require('../model')();
  const JobBundleCreate = models.JobBundleCreate;
  const JobBundleResults = models.JobBundleResults;
  const JobBundleStatus = models.JobBundleStatus;

  it('JobBundleCreate validate() returns errors when required fields are absent', () => {
    const inst = new JobBundleCreate({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.clusterId).toBeTruthy();
    expect(errors.displayName).toBeTruthy();
    expect(errors.selectCategory).toBeTruthy();
  });

  it('JobBundleResults validate() returns errors when required fields are absent', () => {
    const inst = new JobBundleResults({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.found).toBeTruthy();
    expect(errors.completed).toBeTruthy();
    expect(errors.errors).toBeTruthy();
  });

  it('JobBundleResults validate() returns null with all required fields', () => {
    const inst = new JobBundleResults({ found: 2, completed: 2, errors: [] });
    expect(inst.validate()).toBeNull();
  });

  it('JobBundleStatus validate() returns error when bundleResults is absent', () => {
    const inst = new JobBundleStatus({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.bundleResults).toBeTruthy();
  });
});
