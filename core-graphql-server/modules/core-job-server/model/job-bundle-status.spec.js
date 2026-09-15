'use strict';

const JobBundleStatus = require('./job-bundle-status')();

const valid = { bundleResults: { ok: true } };

describe('core-job-server job-bundle-status model — required fields', () => {
  it('marks only bundleResults as required', () => {
    expect(JobBundleStatus.requiredFields).toEqual({ bundleResults: true });
  });

  it('validates an instance carrying just the required bundleResults object', () => {
    expect(new JobBundleStatus(valid).validate()).toBeNull();
  });

  it('accepts an array for the json bundleResults field', () => {
    expect(new JobBundleStatus({ bundleResults: [1, 2] }).validate()).toBeNull();
  });

  it('requires bundleResults to be present as an object or array', () => {
    expect(new JobBundleStatus({}).validate()).toEqual({
      bundleResults: { message: 'should be an Object or Array' }
    });
  });
});

describe('core-job-server job-bundle-status model — optional field types', () => {
  it('rejects a non-object/array bundleResults', () => {
    expect(new JobBundleStatus({ bundleResults: 'x' }).validate()).toEqual({
      bundleResults: { message: 'should be an Object or Array' }
    });
  });

  it('rejects a non-boolean markAsCompleted', () => {
    expect(
      new JobBundleStatus({ ...valid, markAsCompleted: 'nope' }).validate()
    ).toEqual({
      markAsCompleted: { message: 'should be a Boolean (or either 0 or 1)' }
    });
  });
});
