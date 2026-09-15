'use strict';

const JobBundleSelectDetail = require('./job-bundle-select-detail')();

const valid = { select: { q: 1 }, paths: ['/a'], files: [], tasks: {} };

describe('core-job-server job-bundle-select-detail model — required fields', () => {
  it('marks select, paths, files and tasks as required', () => {
    expect(JobBundleSelectDetail.requiredFields).toEqual({
      select: true,
      paths: true,
      files: true,
      tasks: true
    });
  });

  it('validates a well-formed instance with no errors', () => {
    expect(new JobBundleSelectDetail(valid).validate()).toBeNull();
  });

  it('requires the json field select to be present as an object or array', () => {
    expect(
      new JobBundleSelectDetail({ paths: [], files: [], tasks: {} }).validate()
    ).toEqual({ select: { message: 'should be an Object or Array' } });
  });
});

describe('core-job-server job-bundle-select-detail model — optional field types', () => {
  it('rejects a non-string category', () => {
    expect(new JobBundleSelectDetail({ ...valid, category: 5 }).validate()).toEqual({
      category: { message: 'should be a String' }
    });
  });

  it('rejects a non-boolean recursiveDescent', () => {
    expect(
      new JobBundleSelectDetail({ ...valid, recursiveDescent: 'x' }).validate()
    ).toEqual({ recursiveDescent: { message: 'should be a Boolean (or either 0 or 1)' } });
  });

  it('rejects a non-string afterTime', () => {
    expect(new JobBundleSelectDetail({ ...valid, afterTime: 9 }).validate()).toEqual({
      afterTime: { message: 'should be a String' }
    });
  });
});
