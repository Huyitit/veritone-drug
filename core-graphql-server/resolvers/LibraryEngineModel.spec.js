'use strict';

jest.mock('../dal/mapper.js', () => ({
  mapLibrary: jest.fn((lib) => ({ mappedLibrary: lib }))
}));

const mapper = require('../dal/mapper.js');

const dalEngine = { getIdById: jest.fn(), getEngine: jest.fn() };
const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.engine = dalEngine;

const resolvers = require('./LibraryEngineModel.js')(serviceContext);

const context = { reqId: 'r1' };

beforeEach(() => {
  jest.clearAllMocks();
  mapper.mapLibrary.mockImplementation((lib) => ({ mappedLibrary: lib }));
});

describe('LibraryEngineModel.library', () => {
  it('maps the embedded library via the mapper', () => {
    const lib = { id: 'l1' };
    expect(resolvers.library({ library: lib }, {}, context, {})).toEqual({ mappedLibrary: lib });
    expect(mapper.mapLibrary).toHaveBeenCalledWith(lib);
  });
});

describe('LibraryEngineModel.engineId', () => {
  it('resolves the engine id from obj.engineId', () => {
    dalEngine.getIdById.mockReturnValue('eid');
    expect(resolvers.engineId({ engineId: 'e1' }, {}, context, {})).toBe('eid');
    expect(dalEngine.getIdById).toHaveBeenCalledWith(context, 'e1');
  });
});

describe('LibraryEngineModel.engine', () => {
  it('loads the engine scoped to engineId + organizationId', () => {
    dalEngine.getEngine.mockReturnValue('engine');
    expect(resolvers.engine({ engineId: 'e1', organizationId: 'org1' }, {}, context, {})).toBe('engine');
    expect(dalEngine.getEngine).toHaveBeenCalledWith(context, { id: 'e1', organizationId: 'org1' });
  });
});

describe('LibraryEngineModel.contentType', () => {
  it('returns jsondata.contentType when jsondata is present', () => {
    expect(resolvers.contentType({ jsondata: { contentType: 'image' } }, {}, context, {})).toBe('image');
  });

  it('returns null when jsondata is absent', () => {
    expect(resolvers.contentType({}, {}, context, {})).toBeNull();
  });
});
