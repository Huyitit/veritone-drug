'use strict';

jest.mock('../../../../../resolvers/util.js', () => jest.fn().mockReturnValue({ getSignedUrl: jest.fn() }));
jest.mock('../dal', () => jest.fn().mockReturnValue({}));
jest.mock('../../../util/file-upload', () => jest.fn().mockReturnValue({}));
jest.mock('../model', () => ({}));
jest.mock('./entity-identifier-type', () => jest.fn().mockReturnValue({}));
jest.mock('./library-type', () => jest.fn().mockReturnValue({}));
jest.mock('./library-engine-model', () => jest.fn().mockReturnValue({}));
jest.mock('./library-collaborator', () => jest.fn().mockReturnValue({}));
jest.mock('./entity-identifier', () => jest.fn().mockReturnValue({}));
jest.mock('./entity', () => jest.fn().mockReturnValue({}));
jest.mock('./library', () => jest.fn().mockReturnValue({}));

const init = require('./index');

const validContext = {
  config: { paging: { defaultLimit: 10 } },
  logger: { info: () => {}, error: () => {} },
  dbConnections: {},
  s3Buckets: { library: { storage: {} } }
};

describe('libraries bll: index', () => {
  describe('init guards', () => {
    it('throws if config is missing', () => {
      const ctx = { logger: {}, dbConnections: {}, s3Buckets: { library: { storage: {} } } };
      expect(() => init(ctx)).toThrow('config is required');
    });

    it('throws if logger is missing', () => {
      const ctx = { config: {}, dbConnections: {}, s3Buckets: { library: { storage: {} } } };
      expect(() => init(ctx)).toThrow('logger is required');
    });

    it('throws if dbConnections is missing', () => {
      const ctx = { config: {}, logger: {}, s3Buckets: { library: { storage: {} } } };
      expect(() => init(ctx)).toThrow('dbConnections is required');
    });

    it('throws if library storage is missing', () => {
      const ctx = { config: {}, logger: {}, dbConnections: {} };
      expect(() => init(ctx)).toThrow('library storage is required');
    });
  });

  describe('init success', () => {
    it('returns all sub-services and flatten', () => {
      const blls = init(validContext);
      expect(blls).toMatchObject({
        flatten: expect.any(Function),
        entityIdentifierType: expect.any(Object),
        libraryType: expect.any(Object),
        libraryEngineModel: expect.any(Object),
        libraryCollaborator: expect.any(Object),
        entityIdentifier: expect.any(Object),
        entity: expect.any(Object),
        library: expect.any(Object)
      });
    });

    it('flatten returns an object merging all sub-service methods', () => {
      const blls = init(validContext);
      const flat = blls.flatten();
      expect(typeof flat).toBe('object');
    });
  });
});
