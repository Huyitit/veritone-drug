'use strict';

describe('model build family (Build, BuildCreate, BuildUpload)', () => {
  const models = require('../model')();
  const Build = models.Build;
  const BuildCreate = models.BuildCreate;
  const BuildUpload = models.BuildUpload;

  it('Build constructor sets required fields', () => {
    const inst = new Build({
      engineId: 'e1',
      buildId: 'b1',
      price: 1.5,
      validateUri: 'http://v',
      executeUri: 'http://x'
    });
    expect(inst.engineId).toBe('e1');
    expect(inst.buildId).toBe('b1');
    expect(inst.price).toBe(1.5);
  });

  it('Build validate() returns errors when required fields are absent', () => {
    const inst = new Build({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.engineId).toBeTruthy();
    expect(errors.buildId).toBeTruthy();
    expect(errors.validateUri).toBeTruthy();
    expect(errors.executeUri).toBeTruthy();
  });

  it('BuildCreate validate() returns error when deploymentModel is absent', () => {
    const inst = new BuildCreate({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.deploymentModel).toBeTruthy();
  });

  it('BuildUpload validate() returns error when dockerImage is absent', () => {
    const inst = new BuildUpload({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.dockerImage).toBeTruthy();
  });
});
