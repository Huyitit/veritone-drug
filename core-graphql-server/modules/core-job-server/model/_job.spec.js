'use strict';
// VE-24956: coverage for the Job create-model (no required fields; guard the field schema).
describe('model Job', () => {
  const Job = require('../model')().Job;
  it('Job is a constructor function', () => {
    expect(Job).toEqual(expect.any(Function));
    expect(new Job({}).constructor).toBe(Job);
  });
  it('Job exposes its documented fields', () => {
    const keys = Job.allFields.map((f) => f.key);
    expect(keys).toContain('jobId');
    expect(keys).toContain('applicationId');
    expect(keys).toContain('jobStatus');
    expect(keys).toContain('sourceAssetId');
  });
  it('Job.fromDB keeps source_asset_id as sourceAssetId', () => {
    const job = Job.fromDB({ job_id: 'j1', source_asset_id: 'asset-master' });
    expect(job.sourceAssetId).toBe('asset-master');
  });
});
