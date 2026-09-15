'use strict';
// VE-24956: coverage for the Task create-model (no required fields; guard the field schema).
describe('model Task', () => {
  const Task = require('../model')().Task;
  it('Task is a constructor function', () => {
    expect(Task).toEqual(expect.any(Function));
    expect(new Task({}).constructor).toBe(Task);
  });
  it('Task exposes its documented fields', () => {
    const keys = Task.allFields.map((f) => f.key);
    expect(keys).toContain('taskId');
    expect(keys).toContain('jobId');
    expect(keys).toContain('taskStatus');
  });
});
