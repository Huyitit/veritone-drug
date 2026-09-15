'use strict';

jest.mock('../../../../../resolvers/util', () => jest.fn().mockReturnValue({}));
jest.mock('../model', () => {
  const LibraryEngineModel = jest.fn().mockImplementation(function(data) {
    Object.assign(this, data || {});
    this.validate = jest.fn().mockReturnValue(null);
  });
  LibraryEngineModel.normalize = jest.fn().mockImplementation(function(data) {
    return new LibraryEngineModel(data);
  });
  LibraryEngineModel.statusEnum = { pending: 'pending' };
  return { LibraryEngineModel };
});

const init = require('./library-engine-model');

describe('libraries bll: library-engine-model', () => {
  const mockUploader = {
    readFromURL: jest.fn(),
    uploadContent: jest.fn()
  };
  const mockServiceContext = {};
  const mockDal = {
    libraryEngineModel: {
      getLibraryEngineModels: jest.fn().mockResolvedValue({ results: [] }),
      createLibraryEngineModel: jest.fn().mockResolvedValue({}),
      updateLibraryEngineModel: jest.fn().mockResolvedValue({}),
      deleteLibraryEngineModels: jest.fn().mockResolvedValue(0)
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('init guards', () => {
    it('throws if dal is missing', () => {
      expect(() => init(null, mockUploader, mockServiceContext)).toThrow('dal.libraryEngineModel is required');
    });

    it('throws if dal.libraryEngineModel is missing', () => {
      expect(() => init({}, mockUploader, mockServiceContext)).toThrow('dal.libraryEngineModel is required');
    });

    it('throws if uploader is missing', () => {
      expect(() => init(mockDal, null, mockServiceContext)).toThrow('uploader is required');
    });
  });

  describe('init success', () => {
    it('returns the expected interface', () => {
      const bll = init(mockDal, mockUploader, mockServiceContext);
      expect(bll).toMatchObject({
        getLibraryEngineModels: expect.any(Function),
        getLibraryEngineModel: expect.any(Function),
        createLibraryEngineModel: expect.any(Function),
        updateLibraryEngineModel: expect.any(Function),
        saveLibraryEngineModelDataFile: expect.any(Function),
        deleteLibraryEngineModels: expect.any(Function)
      });
    });
  });

  describe('getLibraryEngineModels', () => {
    it('delegates to dal with default empty params', () => {
      const bll = init(mockDal, mockUploader, mockServiceContext);
      bll.getLibraryEngineModels();
      expect(mockDal.libraryEngineModel.getLibraryEngineModels).toHaveBeenCalledWith({});
    });

    it('passes provided params to dal', () => {
      const bll = init(mockDal, mockUploader, mockServiceContext);
      const params = { libraryEngineModelId: 'lem-1' };
      bll.getLibraryEngineModels(params);
      expect(mockDal.libraryEngineModel.getLibraryEngineModels).toHaveBeenCalledWith(params);
    });
  });

  describe('getLibraryEngineModel', () => {
    it('rejects if libraryEngineModelId is missing', () => {
      const bll = init(mockDal, mockUploader, mockServiceContext);
      return expect(bll.getLibraryEngineModel()).rejects.toThrow('libraryEngineModelId is required');
    });

    it('returns null when no results', () => {
      const bll = init(mockDal, mockUploader, mockServiceContext);
      return expect(bll.getLibraryEngineModel('lem-1')).resolves.toBeNull();
    });

    it('returns first result when found', () => {
      const bll = init(mockDal, mockUploader, mockServiceContext);
      const record = { libraryEngineModelId: 'lem-1' };
      mockDal.libraryEngineModel.getLibraryEngineModels.mockResolvedValueOnce({ results: [record] });
      return expect(bll.getLibraryEngineModel('lem-1')).resolves.toBe(record);
    });
  });
});
