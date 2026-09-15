'use strict';

jest.mock('../dal/mapper.js', () => ({
  mapLibraryType: jest.fn((lt) => `LT:${lt}`),
  mapLibraryCollaborator: jest.fn((c) => ({ mapped: c }))
}));

const mapper = require('../dal/mapper.js');

const dalLibrary = {
  getEntities: jest.fn(),
  getLibrary: jest.fn(),
  getLibraryEngineModels: jest.fn(),
  getLibraryConfigurations: jest.fn(),
  getDataset: jest.fn()
};
const librariesService = { getLibraryCollaborators: jest.fn() };

const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.library = dalLibrary;
serviceContext.dal.libraryService = librariesService;

const resolvers = require('./Library.js')(serviceContext);

const context = {};
const info = {};
const obj = { id: 'lib1', organizationId: 'org1', libraryType: 'faces' };

beforeEach(() => {
  jest.clearAllMocks();
  mapper.mapLibraryType.mockImplementation((lt) => `LT:${lt}`);
  mapper.mapLibraryCollaborator.mockImplementation((c) => ({ mapped: c }));
});

describe('Library resolvers — arg building', () => {
  it('entities sets libraryId onto a clone of args', () => {
    dalLibrary.getEntities.mockReturnValue('entities');
    expect(resolvers.entities(obj, { q: 'x' }, context, info)).toBe('entities');
    expect(dalLibrary.getEntities).toHaveBeenCalledWith({ q: 'x', libraryId: 'lib1' });
  });

  it('summary requests the summary and returns lib.summary', async () => {
    dalLibrary.getLibrary.mockResolvedValue({ summary: 'the-summary' });
    const result = await resolvers.summary(obj, { foo: 1 }, context, info);
    expect(dalLibrary.getLibrary).toHaveBeenCalledWith({ includeSummary: true, id: 'lib1', foo: 1 });
    expect(result).toBe('the-summary');
  });

  it('engineModels maps args.id to libraryEngineModelId and sets owner/library', () => {
    resolvers.engineModels(obj, { id: 'em1', offset: 0 }, context, info);
    expect(dalLibrary.getLibraryEngineModels).toHaveBeenCalledWith({
      id: 'em1',
      offset: 0,
      ownerOrgId: 'org1',
      libraryId: 'lib1',
      libraryEngineModelId: 'em1'
    });
  });

  it('configurations sets libraryId and organizationId', () => {
    resolvers.configurations(obj, { a: 1 }, context, info);
    expect(dalLibrary.getLibraryConfigurations).toHaveBeenCalledWith({ a: 1, libraryId: 'lib1', organizationId: 'org1' });
  });

  it('dataset sets libraryId and organizationId', () => {
    resolvers.dataset(obj, { a: 1 }, context, info);
    expect(dalLibrary.getDataset).toHaveBeenCalledWith({ a: 1, libraryId: 'lib1', organizationId: 'org1' });
  });
});

describe('Library.libraryType', () => {
  it('maps the raw libraryType via the mapper', () => {
    expect(resolvers.libraryType(obj, {}, context, info)).toBe('LT:faces');
    expect(mapper.mapLibraryType).toHaveBeenCalledWith('faces');
  });
});

describe('Library.collaborators', () => {
  it('queries by library + owner org and pages the mapped results', async () => {
    librariesService.getLibraryCollaborators.mockResolvedValue({ results: [{ u: 1 }, { u: 2 }] });
    const result = await resolvers.collaborators(obj, { offset: 5, limit: 10 }, context, info);

    expect(librariesService.getLibraryCollaborators).toHaveBeenCalledWith({
      offset: 5,
      limit: 10,
      libraryId: 'lib1',
      ownerOrgId: 'org1'
    });
    expect(result).toEqual({
      records: [{ mapped: { u: 1 } }, { mapped: { u: 2 } }],
      count: 2,
      offset: 5,
      limit: 10
    });
  });
});
