'use strict';

describe('model engine schemas (EngineCategory, EngineCreate, EngineUpdate)', () => {
  const models = require('../model')();
  const EngineCategory = models.EngineCategory;
  const EngineCreate = models.EngineCreate;
  const EngineUpdate = models.EngineUpdate;

  it('EngineCategory validate() returns error when engineCategoryId is absent', () => {
    const inst = new EngineCategory({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.engineCategoryId).toBeTruthy();
  });

  it('EngineCategory has generateFilteredTaskTypeCategory that omits elastic field', () => {
    const inst = new EngineCategory({
      engineCategoryId: 'cat1',
      engineCategoryName: 'Test',
      elastic: { index: 'some-index' }
    });
    const filtered = inst.generateFilteredTaskTypeCategory();
    expect(filtered.engineCategoryId).toBe('cat1');
    expect(filtered.elastic).toBeUndefined();
  });

  it('EngineCreate validate() returns errors when required fields are absent', () => {
    const inst = new EngineCreate({});
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.engineName).toBeTruthy();
    expect(errors.engineCategoryId).toBeTruthy();
    expect(errors.deploymentModel).toBeTruthy();
  });

  it('EngineUpdate jwtRights validation fails when isPublic is true', () => {
    const inst = new EngineUpdate({
      engineName: 'E',
      engineCategoryId: 'c1',
      engineDescription: 'desc',
      deploymentModel: 1,
      isPublic: true,
      jwtRights: { roles: [] }
    });
    const errors = inst.validate();
    expect(errors).not.toBeNull();
    expect(errors.jwtRights).toBeTruthy();
  });
});
