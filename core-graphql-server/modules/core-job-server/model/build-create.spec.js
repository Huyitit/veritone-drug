'use strict';

const BuildCreate = require('./build-create')();

const valid = { deploymentModel: 1 };

describe('core-job-server build-create model — required fields', () => {
  it('marks only deploymentModel as required', () => {
    expect(BuildCreate.requiredFields).toEqual({ deploymentModel: true });
  });

  it('validates an instance carrying just the required deploymentModel', () => {
    expect(new BuildCreate(valid).validate()).toBeNull();
  });

  it('requires deploymentModel to be present as a Number', () => {
    expect(new BuildCreate({}).validate()).toEqual({
      deploymentModel: { message: 'should be a Number' }
    });
  });
});

describe('core-job-server build-create model — optional field types', () => {
  it('rejects a non-numeric price', () => {
    expect(new BuildCreate({ ...valid, price: 'x' }).validate()).toEqual({
      price: { message: 'should be a Number' }
    });
  });

  it('rejects a non-string id', () => {
    expect(new BuildCreate({ ...valid, id: 5 }).validate()).toEqual({
      id: { message: 'should be a String' }
    });
  });

  it('accepts an object for the json taskRuntime field', () => {
    expect(new BuildCreate({ ...valid, taskRuntime: { a: 1 } }).validate()).toBeNull();
  });

  it('rejects a non-object/array taskRuntime', () => {
    expect(new BuildCreate({ ...valid, taskRuntime: 'notjson' }).validate()).toEqual({
      taskRuntime: { message: 'should be an Object or Array' }
    });
  });
});
