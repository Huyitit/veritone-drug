'use strict';

describe('model Recording', () => {
  const Recording = require('../model')().Recording;

  it('Recording is a constructor function', () => {
    expect(Recording).toEqual(expect.any(Function));
    const inst = new Recording({});
    expect(inst.constructor).toBe(Recording);
  });

  it('Recording sets recordingId and applicationId', () => {
    const inst = new Recording({ recordingId: 42, applicationId: 'app1' });
    expect(inst.recordingId).toBe(42);
    expect(inst.applicationId).toBe('app1');
  });

  it('Recording.fromDB maps scheduled_job_id to programId', () => {
    const inst = Recording.fromDB({ scheduled_job_id: 99 });
    expect(inst.programId).toBe(99);
  });
});
