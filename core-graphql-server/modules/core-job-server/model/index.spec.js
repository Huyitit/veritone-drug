'use strict';

describe('model', () => {
  it('should be a configurable package', () => {
    expect(require('./index.js')).toEqual(expect.any(Function));
  });

  it('should export an object contain model type constructors, when configured', () => {
    expect(require('./index.js')()).toEqual({
      Cluster: expect.any(Function),
      Node: expect.any(Function),
      NodeCreate: expect.any(Function),
      AmiNodeCreate: expect.any(Function),
      NodePair: expect.any(Function),
      NodeUpdate: expect.any(Function),
      NodeMetrics: expect.any(Function),
      JobBundle: expect.any(Function),
      JobBundleCreate: expect.any(Function),
      JobBundleResults: expect.any(Function),
      JobBundleStatus: expect.any(Function),
      Engine: expect.any(Function),
      EngineCategory: expect.any(Function),
      EngineUpdate: expect.any(Function),
      EngineCreate: expect.any(Function),
      Build: expect.any(Function),
      BuildCreate: expect.any(Function),
      BuildUpload: expect.any(Function),
      Job: expect.any(Function),
      Task: expect.any(Function),
      TaskUpdate: expect.any(Function),
      Recording: expect.any(Function),
      Asset: expect.any(Function)
    });
  });
});
