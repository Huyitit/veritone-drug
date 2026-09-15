'use strict';

const EngineCreate = require('./engine-create')();

// All required fields present and well-typed.
const valid = {
  engineName: 'Engine',
  engineCategoryId: 'cat1',
  engineDescription: 'desc',
  deploymentModel: 1,
  isPublic: false
};

describe('core-job-server engine-create model — required fields', () => {
  it('marks engineName, engineCategoryId, engineDescription, deploymentModel and isPublic as required', () => {
    expect(EngineCreate.requiredFields).toEqual({
      engineName: true,
      engineCategoryId: true,
      engineDescription: true,
      deploymentModel: true,
      isPublic: true
    });
  });

  it('validates a well-formed instance with no errors', () => {
    expect(new EngineCreate(valid).validate()).toBeNull();
  });

  it('leaves optional fields (engineCurrency) unset without error', () => {
    const inst = new EngineCreate(valid);
    expect(inst.engineCurrency).toBeUndefined();
    expect(inst.validate()).toBeNull();
  });
});

describe('core-job-server engine-create model — field validation', () => {
  it('requires the string field engineName', () => {
    expect(new EngineCreate({ ...valid, engineName: undefined }).validate()).toEqual({
      engineName: { message: 'should be a String' }
    });
  });

  it('requires the boolean field isPublic', () => {
    expect(new EngineCreate({ ...valid, isPublic: undefined }).validate()).toEqual({
      isPublic: { message: 'should be a Boolean (or either 0 or 1)' }
    });
  });

  it('requires deploymentModel to be a Number', () => {
    expect(new EngineCreate({ ...valid, deploymentModel: 'x' }).validate()).toEqual({
      deploymentModel: { message: 'should be a Number' }
    });
  });
});
