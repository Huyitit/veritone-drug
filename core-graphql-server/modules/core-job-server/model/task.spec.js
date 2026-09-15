'use strict';

const Task = require('./task');

describe('model Task', () => {
  it('Task is a constructor that copies data properties', () => {
    const inst = new Task({ taskId: 't1', engineId: 'e1' });
    expect(inst.taskId).toBe('t1');
    expect(inst.engineId).toBe('e1');
  });

  it('getPayloadMode returns taskPayload.mode', () => {
    const inst = new Task({ taskPayload: { mode: 'library-train' } });
    expect(inst.getPayloadMode()).toBe('library-train');
  });

  it('isTrainingTask returns true when mode is library-train', () => {
    const inst = new Task({ taskPayload: { mode: 'library-train' } });
    expect(inst.isTrainingTask()).toBe(true);
  });

  it('isTrainingTask returns false when mode is not library-train', () => {
    const inst = new Task({ taskPayload: { mode: 'other' } });
    expect(inst.isTrainingTask()).toBe(false);
  });

  it('setToLibraryRunMode sets taskPayload.mode to library-run', () => {
    const inst = new Task({ taskPayload: { mode: 'library-train' } });
    inst.setToLibraryRunMode();
    expect(inst.getPayloadMode()).toBe('library-run');
  });
});

describe('model TaskUpdate', () => {
  const TaskUpdate = require('../model')().TaskUpdate;

  it('TaskUpdate validate() returns error when notificationUris is not an array', () => {
    const inst = new TaskUpdate({ notificationUris: 'not-an-array' });
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.notificationUris).toBeTruthy();
  });

  it('TaskUpdate validate() returns error when notificationUris contains a non-string', () => {
    const inst = new TaskUpdate({ notificationUris: [123] });
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.notificationUris).toBeTruthy();
  });

  it('TaskUpdate validate() returns null when notificationUris is a string array', () => {
    const inst = new TaskUpdate({ notificationUris: ['http://hook1'] });
    expect(inst.validate()).toBeNull();
  });
});
