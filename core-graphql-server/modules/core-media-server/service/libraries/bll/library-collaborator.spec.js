'use strict';

jest.mock('../model', () => {
  const MockLibraryCollaborator = jest.fn().mockImplementation(function(data) {
    Object.assign(this, data || {});
    this.validate = jest.fn().mockReturnValue(null);
  });
  MockLibraryCollaborator.normalize = jest.fn().mockImplementation(function(data) {
    return new MockLibraryCollaborator(data);
  });
  MockLibraryCollaborator.statusEnum = {
    active: 'active',
    rejected: 'rejected',
    revoked: 'revoked'
  };
  return { LibraryCollaborator: MockLibraryCollaborator };
});

const { LibraryCollaborator } = require('../model');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const init = require('./library-collaborator');

describe('libraries bll: library-collaborator', () => {
  let dal;
  let bll;

  beforeEach(() => {
    jest.clearAllMocks();
    LibraryCollaborator.normalize.mockImplementation(function(data) {
      return new LibraryCollaborator(data);
    });
    dal = {
      libraryCollaborator: {
        getLibraryCollaborators: jest.fn().mockResolvedValue({ results: [] }),
        createLibraryCollaborator: jest.fn().mockResolvedValue({}),
        updateLibraryCollaborator: jest.fn().mockResolvedValue({}),
        deleteLibraryCollaborators: jest.fn().mockResolvedValue(1)
      }
    };
    bll = init(dal);
  });

  describe('init', () => {
    it('throws if dal is missing', () => {
      expect(() => init(undefined)).toThrow('dal.libraryCollaborator is required');
    });

    it('throws if dal.libraryCollaborator is missing', () => {
      expect(() => init({})).toThrow('dal.libraryCollaborator is required');
    });

    it('returns the expected interface', () => {
      expect(bll).toMatchObject({
        getLibraryCollaborators: expect.any(Function),
        getLibraryCollaborator: expect.any(Function),
        createLibraryCollaborator: expect.any(Function),
        updateLibraryCollaborator: expect.any(Function),
        deleteLibraryCollaborators: expect.any(Function)
      });
    });
  });

  describe('getLibraryCollaborators', () => {
    it('delegates to dal with default empty params', () => {
      bll.getLibraryCollaborators();
      expect(dal.libraryCollaborator.getLibraryCollaborators).toHaveBeenCalledWith({});
    });

    it('passes provided params to dal', () => {
      const params = { libraryId: 'lib-1' };
      bll.getLibraryCollaborators(params);
      expect(dal.libraryCollaborator.getLibraryCollaborators).toHaveBeenCalledWith(params);
    });
  });

  describe('getLibraryCollaborator', () => {
    it('rejects if libraryId is missing', () => {
      return expect(bll.getLibraryCollaborator()).rejects.toThrow('libraryId is required');
    });

    it('rejects if collaboratorOrgId is missing', () => {
      return expect(bll.getLibraryCollaborator('lib-1')).rejects.toThrow('collaboratorOrgId is required');
    });

    it('passes libraryId and collaboratorOrgId to dal', () => {
      dal.libraryCollaborator.getLibraryCollaborators.mockResolvedValue({ results: [{}] });
      return bll.getLibraryCollaborator('lib-1', 42).then(() => {
        expect(dal.libraryCollaborator.getLibraryCollaborators).toHaveBeenCalledWith(
          expect.objectContaining({ libraryId: 'lib-1', collaboratorOrgId: 42 })
        );
      });
    });

    it('returns the first result when found', () => {
      const record = { libraryId: 'lib-1', collaboratorOrgId: 42 };
      dal.libraryCollaborator.getLibraryCollaborators.mockResolvedValue({ results: [record] });
      return expect(bll.getLibraryCollaborator('lib-1', 42)).resolves.toBe(record);
    });

    it('returns null when results array is empty', () => {
      return expect(bll.getLibraryCollaborator('lib-1', 42)).resolves.toBeNull();
    });
  });

  describe('createLibraryCollaborator', () => {
    it('defaults status to active when not provided', () => {
      return bll.createLibraryCollaborator({ libraryId: 'lib-1' }).then(() => {
        expect(LibraryCollaborator.normalize).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'active' })
        );
      });
    });

    it('rejects with BadRequestError when validation fails', () => {
      const mockInst = { validate: jest.fn().mockReturnValue({ libraryId: { message: 'required' } }) };
      LibraryCollaborator.normalize.mockReturnValueOnce(mockInst);
      return expect(bll.createLibraryCollaborator({})).rejects.toBeInstanceOf(BadRequestError);
    });

    it('delegates to dal when validation passes', () => {
      return bll.createLibraryCollaborator({ libraryId: 'lib-1' }).then(() => {
        expect(dal.libraryCollaborator.createLibraryCollaborator).toHaveBeenCalledWith(expect.any(Object));
      });
    });
  });

  describe('updateLibraryCollaborator', () => {
    it('throws BadRequestError synchronously when validation fails', () => {
      const mockInst = { validate: jest.fn().mockReturnValue({ permissions: { message: 'required' } }) };
      LibraryCollaborator.normalize.mockReturnValueOnce(mockInst);
      expect(() => bll.updateLibraryCollaborator({})).toThrow(BadRequestError);
    });

    it('delegates to dal when validation passes', () => {
      return bll.updateLibraryCollaborator({ libraryId: 'lib-1' }).then(() => {
        expect(dal.libraryCollaborator.updateLibraryCollaborator).toHaveBeenCalledWith(expect.any(Object));
      });
    });
  });

  describe('deleteLibraryCollaborators', () => {
    it('passes null as client when no transaction provided', () => {
      bll.deleteLibraryCollaborators({ libraryId: 'lib-1' });
      expect(dal.libraryCollaborator.deleteLibraryCollaborators).toHaveBeenCalledWith(
        expect.any(Object),
        null
      );
    });

    it('passes transaction.client when transaction is provided', () => {
      const mockClient = { query: jest.fn() };
      bll.deleteLibraryCollaborators({ libraryId: 'lib-1' }, { client: mockClient });
      expect(dal.libraryCollaborator.deleteLibraryCollaborators).toHaveBeenCalledWith(
        expect.any(Object),
        mockClient
      );
    });
  });
});
