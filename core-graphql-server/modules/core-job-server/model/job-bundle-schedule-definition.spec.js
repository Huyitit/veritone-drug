'use strict';
// VE-24956: coverage for the job-bundle-schedule-definition create-model (no required fields; guard schema).
// Not exposed via the model barrel (used internally by JobBundleCreate) — required directly.
describe('model JobBundleScheduleDefinition', () => {
  const JobBundleScheduleDefinition = require('../model/job-bundle-schedule-definition')();
  it('JobBundleScheduleDefinition is a constructor function', () => {
    expect(JobBundleScheduleDefinition).toEqual(expect.any(Function));
    expect(new JobBundleScheduleDefinition({}).constructor).toBe(JobBundleScheduleDefinition);
  });
  it('JobBundleScheduleDefinition exposes its documented fields', () => {
    const keys = JobBundleScheduleDefinition.allFields.map((f) => f.key);
    expect(keys).toContain('recurringStartTime');
    expect(keys).toContain('repeatMinutes');
    expect(keys).toContain('repeatDaysOfWeek');
  });
});
