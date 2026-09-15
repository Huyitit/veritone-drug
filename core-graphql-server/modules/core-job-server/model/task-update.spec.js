'use strict';

const TaskUpdate = require('./task-update')();

describe('core-job-server task-update model — notificationUris validation', () => {
  it('reports no error when notificationUris is absent', () => {
    expect(new TaskUpdate({ taskStatus: 'complete' }).validate()).toBeNull();
  });

  it('accepts an array of strings', () => {
    expect(new TaskUpdate({ notificationUris: ['https://a', 'https://b'] }).validate()).toBeNull();
  });

  it('accepts an empty array', () => {
    expect(new TaskUpdate({ notificationUris: [] }).validate()).toBeNull();
  });

  it('rejects a non-array value', () => {
    expect(new TaskUpdate({ notificationUris: 'https://a' }).validate()).toEqual({
      notificationUris: { message: 'should be an Array' }
    });
  });

  it('rejects an array containing a non-string element', () => {
    expect(new TaskUpdate({ notificationUris: ['https://a', 123] }).validate()).toEqual({
      notificationUris: { message: 'should contain strings' }
    });
  });
});
