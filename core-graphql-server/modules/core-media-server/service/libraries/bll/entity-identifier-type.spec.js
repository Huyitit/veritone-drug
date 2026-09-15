'use strict';

jest.mock('../model', () => {
  const EntityIdentifierType = jest.fn().mockImplementation(function(data) {
    Object.assign(this, data || {});
    this.validate = jest.fn().mockReturnValue(null);
  });
  return { EntityIdentifierType };
});

const model = require('../model');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const init = require('./entity-identifier-type');

describe('libraries bll: entity-identifier-type', () => {
  let dal;
  let bll;

  beforeEach(() => {
    jest.clearAllMocks();
    dal = {
      entityIdentifierType: {
        getEntityIdentifierTypes: jest.fn().mockResolvedValue({ results: [] }),
        createEntityIdentifierType: jest.fn().mockResolvedValue({ entityIdentifierTypeId: 'face' }),
        updateEntityIdentifierType: jest.fn().mockResolvedValue({ entityIdentifierTypeId: 'face' })
      }
    };
    bll = init(dal);
  });

  describe('init', () => {
    it('throws if dal is missing', () => {
      expect(() => init(undefined)).toThrow('dal.entityIdentifierType is required');
    });

    it('throws if dal.entityIdentifierType is missing', () => {
      expect(() => init({})).toThrow('dal.entityIdentifierType is required');
    });

    it('returns the CRUD interface', () => {
      expect(bll).toMatchObject({
        getEntityIdentifierTypes: expect.any(Function),
        getEntityIdentifierType: expect.any(Function),
        createEntityIdentifierType: expect.any(Function),
        updateEntityIdentifierType: expect.any(Function)
      });
    });
  });

  describe('getEntityIdentifierTypes', () => {
    it('delegates to dal with default empty params', () => {
      bll.getEntityIdentifierTypes();
      expect(dal.entityIdentifierType.getEntityIdentifierTypes).toHaveBeenCalledWith({});
    });

    it('passes provided params to dal', () => {
      const params = { entityIdentifierTypeId: 'face' };
      bll.getEntityIdentifierTypes(params);
      expect(dal.entityIdentifierType.getEntityIdentifierTypes).toHaveBeenCalledWith(params);
    });
  });

  describe('getEntityIdentifierType', () => {
    it('rejects if entityIdentifierTypeId is missing', () => {
      return expect(bll.getEntityIdentifierType()).rejects.toThrow('entityIdentifierTypeId is required');
    });

    it('calls getEntityIdentifierTypes with entityIdentifierTypeId param', () => {
      dal.entityIdentifierType.getEntityIdentifierTypes.mockResolvedValue({ results: [{ entityIdentifierTypeId: 'face' }] });
      return bll.getEntityIdentifierType('face').then(() => {
        expect(dal.entityIdentifierType.getEntityIdentifierTypes).toHaveBeenCalledWith({ entityIdentifierTypeId: 'face' });
      });
    });

    it('returns the first result when found', () => {
      const record = { entityIdentifierTypeId: 'face' };
      dal.entityIdentifierType.getEntityIdentifierTypes.mockResolvedValue({ results: [record] });
      return expect(bll.getEntityIdentifierType('face')).resolves.toBe(record);
    });

    it('returns null when results array is empty', () => {
      return expect(bll.getEntityIdentifierType('unknown')).resolves.toBeNull();
    });
  });

  describe('createEntityIdentifierType', () => {
    it('wraps input in EntityIdentifierType model', () => {
      return bll.createEntityIdentifierType({ entityIdentifierTypeId: 'face' }).then(() => {
        expect(model.EntityIdentifierType).toHaveBeenCalledWith({ entityIdentifierTypeId: 'face' });
      });
    });

    it('rejects with BadRequestError when validation fails', () => {
      model.EntityIdentifierType.mockImplementationOnce(function(data) {
        Object.assign(this, data || {});
        this.validate = jest.fn().mockReturnValue({ label: { message: 'required' } });
      });
      return expect(bll.createEntityIdentifierType({})).rejects.toBeInstanceOf(BadRequestError);
    });

    it('delegates to dal when validation passes', () => {
      return bll.createEntityIdentifierType({ entityIdentifierTypeId: 'face' }).then(() => {
        expect(dal.entityIdentifierType.createEntityIdentifierType).toHaveBeenCalledWith(expect.any(Object));
      });
    });
  });

  describe('updateEntityIdentifierType', () => {
    it('wraps input in EntityIdentifierType model', () => {
      return bll.updateEntityIdentifierType({ entityIdentifierTypeId: 'face' }).then(() => {
        expect(model.EntityIdentifierType).toHaveBeenCalledWith({ entityIdentifierTypeId: 'face' });
      });
    });

    it('throws BadRequestError synchronously when validation fails', () => {
      model.EntityIdentifierType.mockImplementationOnce(function(data) {
        Object.assign(this, data || {});
        this.validate = jest.fn().mockReturnValue({ entityIdentifierTypeId: { message: 'required' } });
      });
      expect(() => bll.updateEntityIdentifierType({})).toThrow(BadRequestError);
    });

    it('delegates to dal when validation passes', () => {
      return bll.updateEntityIdentifierType({ entityIdentifierTypeId: 'face' }).then(() => {
        expect(dal.entityIdentifierType.updateEntityIdentifierType).toHaveBeenCalledWith(expect.any(Object));
      });
    });
  });
});
