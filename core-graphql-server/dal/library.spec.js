const chaiExpect = require('chai').expect;
const _ = require('lodash');

// get mock base service context
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.DEFAULT, {
  mockHttp: true
});

const nock = require('nock');

const libId = '112d250d-e853-4c20-a758-5e3ca11b4a81';
const libEngineModelId = '212d250d-e853-4c20-a758-5e3ca11b4a81';
const engId = '312d250d-e853-4c20-a758-5e3ca11b4a81';
const entId = '222d250d-e853-4c20-a758-5e3ca11b4a82';
const entIdentId = '332d250d-e853-4c20-a758-5e3ca11b4a83';
const libTypeId = '112d250d-e853-4c20-a758-5e3ca11b4a84';
const configId = '112d250d-e853-4c20-a758-5e3ca11b4a84';

_.set(serviceContext, 's3Buckets.library.storage', serviceContext.storage);
const fs = require('fs');
jest.mock('fs');

serviceContext.config.s3 = {
  region: 'us-east-1',
  bucket: 'dev.inspirent',
  path: 'assets',
  maxRetry: 3,
  timeout: 30000,
  enableUrlSigning: true,
  buckets: [
    {
      key: 'api',
      name: 'dev-api.veritone.com',
      path: 'signedUrl',
      signedUrlExpires: 86400
    },
    {
      key: 'library',
      name: 'dev-veritone-library',
      path: 'library',
      signedUrlExpires: 10800
    }
  ]
};

/*
const uploader = require('../modules/core-media-server/util/file-upload.js')({config: {tmpdir: './'}}, serviceContext.storage);
jest.mock('../modules/core-media-server/util/file-upload.js');
uploader.uploadContent();
uploader.uploadContent.mockResolvedValue('http://localhost/whatever');
uploader.readFromUrl.mockResolvedValue('');
*/
serviceContext.librariesService = {
  getLibraryTypes: (args) =>
    Promise.resolve({
      results: [
        {
          libraryTypeId: 'people',
          entityType: {
            name: 'person',
            namePlural: 'people'
          },
          entityIdentifierTypes: ['identifierTypeTest']
        }
      ],
      totalResults: 1
    }),
  createLibrary: (args) =>
    Promise.resolve(
      Object.assign(
        {
          id: libId
        },
        args
      )
    ),
  getLibrary: (id) =>
    Promise.resolve({
      libraryId: id,
      name: 'test lib',
      libraryTypeId: 'people',
      ownerOrgId: 7682
    }),
  getLibraries: (args) =>
    Promise.resolve({
      totalResults: 1,
      results: [
        {
          libraryId: libId,
          name: 'test lib',
          libraryTypeId: 'people',
          ownerOrgId: 7682
        }
      ]
    }),
  updateLibrary: (args) => {
    const res = Object.assign({}, args);
    return Promise.resolve(res);
  },
  deleteLibrary: (args) => Promise.resolve({}),
  // entity
  createEntity: (lib, args) =>
    Promise.resolve({
      entityId: entId,
      libraryId: lib.libraryId,
      name: args.name
    }),
  updateEntity: (entity, args) => {
    const res = Object.assign(
      {
        profileImageUrl: args.profileImageUrl || entity.profileImageUrl,
        name: args.name || entity.name
      },
      entity
    );
    if (!_.get(entity, 'library.ownerOrgId'))
      Promise.reject(new Error('no library'));
    if (!_.get(entity, 'organizationId'))
      Promise.reject(new Error('no org on library'));

    return Promise.resolve(res);
  },
  deleteEntity: (args) => Promise.resolve({}),
  getEntities: (args) =>
    Promise.resolve({
      totalResults: 1,
      results: [
        {
          entityId: entId,
          libraryId: libId,
          name: 'test entity',
          library: {
            libraryId: libId,
            ownerOrgId: 7682
          }
        }
      ]
    }),
  getEntity: (args) =>
    Promise.resolve({
      entityId: args.id,
      libraryId: libId,
      name: 'test entity',
      library: {
        libraryId: libId,
        ownerOrgId: 7682
      }
    }),
  deleteEntities: (args) => Promise.resolve({}),

  getEntityIdentifiers: (args) =>
    Promise.resolve({
      totalResults: 1,
      results: [
        {
          entityIdentifierId: entIdentId,
          entityId: entId,
          entity: {
            entityId: entId
          },
          libraryId: libId,
          name: 'entity identifier',
          entityIdentifierType: {
            entityIdentifierTypeId: 'person'
          },
          entityIdentifierTypeId: 'person'
        }
      ]
    }),
  createEntityIdentifier: (entity, args, fileInfo) => {
    if (!entity.library)
      return Promise.reject(new Error('no library on entity'));
    if (!entity.library.ownerOrgId)
      return Promise.reject(new Error('no org on library'));
    return Promise.resolve({
      entityIdentifierId: entIdentId,
      entityId: entity.entityId,
      url: args.url,
      entityIdentifierTypeId: 'person',
      entityIdentifierType: {
        entityIdentifierTypeId: 'person'
      },
      libraryId: libId
    });
  },
  updateEntityIdentifier: (entity, args, fileInfo) => {
    if (!entity.library)
      return Promise.reject(new Error('no library on entity identifier'));
    if (!entity.library.ownerOrgId)
      return Promise.reject(new Error('no org on library'));
    return Promise.resolve({
      entityIdentifierId: entIdentId,
      entityId: entity.entityId,
      libraryId: libId,
      url: args.url,
      entityIdentifierTypeId: 'person',
      entityIdentifierType: {
        entityIdentifierTypeId: 'person'
      }
    });
  },
  deleteEntityIdentifiers: (args) => Promise.resolve({}),
  publishLibraryVersion: (args) =>
    Promise.resolve({
      libraryId: args,
      organizationId: 7682,
      name: 'test publish version'
    }),
  createLibraryType: (args) => Promise.resolve(args),
  createEntityIdentifierType: (args) => Promise.resolve(args),
  deleteLibraryEngineModels: (args) =>
    Promise.resolve({ id: libEngineModelId }),
  saveLibraryEngineModelDataFile: (model, file) => {
    // fake file contentType to increase test coverage
    if (file.contentType == 'Invalid') {
      const err = new Error();
      err.errors = { foo: 'bar' };
      err.name = 'BadRequestError';
      return Promise.reject(err);
    } else if (file.contentType == 'Error' || !file.contentType) {
      return Promise.reject(new Error());
    } else if (!model.organizationId) {
      return Promise.reject(
        new Error('no organizationId in ' + JSON.stringify(model))
      );
    }
    return Promise.resolve({});
  },
  deleteLibraryCollaborators: (args) => Promise.resolve(args),
  getLibraryCollaborators: (args) =>
    Promise.resolve({
      totalResults: 1,
      results: [
        {
          collaboratorOrgId: 7682,
          library: { libraryId: libId },
          libraryId: libId,
          permissions: ['view'],
          status: 'active'
        }
      ]
    })
};

let dal = require('./library.js')(serviceContext);

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}

describe('library.js', function () {
  afterAll(() => {
    jest.resetModules();
  });

  describe('#require', function () {
    it('should have correct function exports', function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(45);
      expectFunction(dal, 'createLibrary');
      expectFunction(dal, 'createLibraryType');
      expectFunction(dal, 'getLibraryTypes');
      expectFunction(dal, 'getLibraryType');
      expectFunction(dal, 'deleteLibrary');
      expectFunction(dal, 'updateLibrary');
      expectFunction(dal, 'publishLibrary');
      expectFunction(dal, 'createEntityIdentifierType');
      expectFunction(dal, 'createEntity');

      expectFunction(dal, 'updateEntity');
      expectFunction(dal, 'deleteEntity');
      expectFunction(dal, 'createEntityIdentifier');
      expectFunction(dal, 'updateEntityIdentifier');
      expectFunction(dal, 'deleteEntityIdentifier');
      expectFunction(dal, 'getEntities');
      expectFunction(dal, 'getEntityIdentifiers');
      expectFunction(dal, 'createLibraryEngineModel');
      expectFunction(dal, 'updateLibraryEngineModel');
      expectFunction(dal, 'deleteLibraryEngineModel');
      expectFunction(dal, 'createLibraryCollaborator');
      expectFunction(dal, 'updateLibraryCollaborator');
      expectFunction(dal, 'deleteLibraryCollaborator');
      expectFunction(dal, 'getLibraryEngineModels');
      expectFunction(dal, 'getLibraryEngineModel');
      expectFunction(dal, 'getLibrary');
      expectFunction(dal, 'getEntity');
      expectFunction(dal, 'getEntityIdentifierType');
      expectFunction(dal, 'getEntityIdentifierTypes');
      expectFunction(dal, 'getLibraryConfiguration');
      expectFunction(dal, 'getLibraryConfigurations');
      expectFunction(dal, 'createModelConfiguration');
      expectFunction(dal, 'updateModelConfiguration');
      expectFunction(dal, 'createDatasetConfiguration');
      expectFunction(dal, 'updateDatasetConfiguration');
      expectFunction(dal, 'deleteLibraryConfiguration');

      const migrated = require('../modules/core-media-server/service/libraries/bll')(
        serviceContext
      ).flatten();
      chaiExpect(typeof migrated).to.equal('object');
      chaiExpect(Object.keys(migrated).length).to.equal(47);
    });
  });
  describe('#getLibrary', function () {
    it('should get a library', async function () {
      const res = await dal.getLibrary({
        id: libId,
        organizationId: 7682,
        organizationIds: [7682]
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(libId);
      chaiExpect(res.name).to.equal('test lib');
    });
    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.getLibrary({
          id: libId,
          organizationId: 7682,
          organizationIds: [7682]
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
  });
  describe('#getLibraries', function () {
    it('should get libraries by id', async function () {
      serviceContext.dbConnections['core'].write._push(
        [{ libraryTypeId: 123 }],
        false
      );
      const res = await dal.getLibraries({
        id: libId,
        organizationId: 7682,
        organizationIds: [7682],
        includeOwnedOnly: true,
        type: 'test',
        includeSummary: true
      });
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].id')).to.equal(libId);
      chaiExpect(_.get(res, 'records[0].name')).to.equal('test lib');
      chaiExpect(res.count).to.equal(1);
    });
    it('should get empty libraries by id with empty libraryType', async function () {
      //serviceContext.dbConnections['core'].write._push([], false);
      const librariesService = Object.assign(
        {},
        _.get(serviceContext, 'librariesService')
      );
      librariesService.getLibraryTypes = () =>
        Promise.resolve({
          totalResults: 0,
          results: []
        });
      serviceContext.librariesService = librariesService;
      const dalLib = require('./library.js')(serviceContext);
      const res = await dalLib.getLibraries({
        id: libId,
        organizationId: 7682,
        organizationIds: [7682],
        includeOwnedOnly: true,
        type: 'test'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
    it('should get libraries by name', async function () {
      const res = await dal.getLibraries({
        organizationId: 7682,
        organizationIds: [7682],
        name: 'test'
      });
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].id')).to.equal(libId);
      chaiExpect(_.get(res, 'records[0].name')).to.equal('test lib');
      chaiExpect(res.count).to.equal(1);
    });

    it('should get libraries by type', async function () {
      const res = await dal.getLibraries({
        organizationId: 7682,
        organizationIds: [7682],
        type: 'people'
      });
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].id')).to.equal(libId);
      chaiExpect(_.get(res, 'records[0].libraryTypeId')).to.equal('people');
      chaiExpect(res.count).to.equal(1);
    });

    it('should map lastTrainedDateTime orderBy to last_trained_date_time and pass to service', async function () {
      let capturedParams;
      const librariesService = Object.assign(
        {},
        _.get(serviceContext, 'librariesService')
      );
      librariesService.getLibraries = (params) => {
        capturedParams = params;
        return Promise.resolve({ totalResults: 0, results: [] });
      };
      serviceContext.librariesService = librariesService;
      const dalLib = require('./library.js')(serviceContext);

      await dalLib.getLibraries({
        organizationId: 7682,
        organizationIds: [7682],
        orderBy: 'lastTrainedDateTime',
        orderDirection: 'desc'
      });

      chaiExpect(capturedParams.orderBy).to.equal('last_trained_date_time');
      chaiExpect(capturedParams.orderDesc).to.equal(true);
    });

    it('should map lastTrainedDateTime orderBy with asc direction', async function () {
      let capturedParams;
      const librariesService = Object.assign(
        {},
        _.get(serviceContext, 'librariesService')
      );
      librariesService.getLibraries = (params) => {
        capturedParams = params;
        return Promise.resolve({ totalResults: 0, results: [] });
      };
      serviceContext.librariesService = librariesService;
      const dalLib = require('./library.js')(serviceContext);

      await dalLib.getLibraries({
        organizationId: 7682,
        organizationIds: [7682],
        orderBy: 'lastTrainedDateTime',
        orderDirection: 'asc'
      });

      chaiExpect(capturedParams.orderBy).to.equal('last_trained_date_time');
      chaiExpect(capturedParams.orderDesc).to.equal(false);
    });
  });

  describe('#createLibrary', function () {
    it('should create a library', async function () {
      const res = await dal.createLibrary({
        organizationId: 7682,
        organizationIds: [7682],
        input: {
          name: 'foo',
          libraryTypeId: 'people'
        }
      });
      chaiExpect(res).to.exist;
    });
  });
  describe('#updateLibrary', function () {
    it('should update the library', async function () {
      const res = await dal.updateLibrary({
        input: {
          organizationId: 7682,
          organizationIds: [7682],
          id: '112d250d-e853-4c20-a758-5e3ca11b4a81',
          name: 'updated library'
        }
      });
      chaiExpect(res).to.exist;
    });
    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateLibrary({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: '112d250d-e853-4c20-a758-5e3ca11b4a81',
            name: 'updated library'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
    it('should throw error when have greater then 1 library', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 2,
            results: [
              {
                libraryId: libId,
                name: 'test lib',
                libraryTypeId: 'people',
                ownerOrgId: 7682
              },
              {
                libraryId: libId,
                name: 'test lib',
                libraryTypeId: 'people',
                ownerOrgId: 7682
              }
            ]
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateLibrary({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: '112d250d-e853-4c20-a758-5e3ca11b4a81',
            name: 'updated library'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('Error');
      }
    });
  });
  describe('#deleteLibrary', function () {
    it('should delete the library', async function () {
      const res = await dal.deleteLibrary({
        id: '112d250d-e853-4c20-a758-5e3ca11b4a81'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('112d250d-e853-4c20-a758-5e3ca11b4a81');
    });
  });

  // entity
  describe('#getEntity', function () {
    it('should get an entity', async function () {
      const res = await dal.getEntity({
        id: entId,
        organizationId: 7682,
        organizationIds: [7682]
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entId);
      chaiExpect(res.name).to.equal('test entity');
      chaiExpect(res.libraryId).to.equal(libId);
    });
    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getEntities = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.getEntity({
          id: entId,
          organizationId: 7682,
          organizationIds: [7682]
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
  });
  describe('#getEntities', function () {
    it('should get entities by lib ID', async function () {
      const res = await dal.getEntities({
        libraryId: libId,
        organizationId: 7682,
        organizationIds: [7682]
      });
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].id')).to.equal(entId);
      chaiExpect(_.get(res, 'records[0].name')).to.equal('test entity');
      chaiExpect(res.count).to.equal(1);
      chaiExpect(_.get(res, 'records[0].libraryId')).to.equal(libId);
    });
    it('should get entities by lib IDs', async function () {
      const res = await dal.getEntities({
        libraryIds: [libId],
        libraryId: libId,
        organizationId: 7682,
        organizationIds: [7682],
        isPublished: true,
        includeSummary: true
      });
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].id')).to.equal(entId);
      chaiExpect(_.get(res, 'records[0].name')).to.equal('test entity');
      chaiExpect(res.count).to.equal(1);
      chaiExpect(_.get(res, 'records[0].libraryId')).to.equal(libId);
    });
    it('should get entities by entity ID', async function () {
      const res = await dal.getEntities({
        ids: [entId],
        organizationId: 7682,
        organizationIds: [7682],
        id: entId
      });
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].id')).to.equal(entId);
      chaiExpect(_.get(res, 'records[0].name')).to.equal('test entity');
      chaiExpect(res.count).to.equal(1);
      chaiExpect(_.get(res, 'records[0].libraryId')).to.equal(libId);
    });
    it('should throw error when missing id', async function () {
      try {
        await dal.getEntities({
          entityIds: [entId],
          organizationId: 7682,
          organizationIds: [7682]
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
      }
    });
  });
  describe('#createEntity', function () {
    it('should create an entity', async function () {
      const res = await dal.createEntity({
        input: {
          libraryId: libId,
          name: 'new entity',
          organizationId: 7682,
          organizationIds: [7682]
        }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entId);
      chaiExpect(res.name).to.equal('new entity');
      chaiExpect(res.libraryId).to.equal(libId);
    });
    it('should throw error invalid input when parse jsonstring failed', async function () {
      try {
        await dal.createEntity({
          input: {
            libraryId: libId,
            name: 'new entity',
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: 'foo,bars'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'The supplied jsonstring did not contain valid JSON.'
        );
      }
    });
    it('should throw error invalid input when jsonstring and jsondata existed', async function () {
      try {
        await dal.createEntity({
          input: {
            libraryId: libId,
            name: 'new entity',
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: 'foo,bars',
            jsondata: 'foobar'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'Supply either jsondata or jsonstring to createEntity, not both.'
        );
      }
    });
    it('should throw error not found library', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibrary = () => Promise.resolve(null);
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.createEntity({
          input: {
            libraryId: libId,
            name: 'new entity',
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: '{"foo": "bar"}'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal('The requested object was not found');
        chaiExpect(e.data.objectId).to.equal(libId);
      }
    });
    it('should throw error invalid input when result of createEntity', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.createEntity = () =>
          Promise.reject(new Error('rejectURL'));
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.createEntity({
          input: {
            libraryId: libId,
            name: 'new entity',
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: '{"foo": "bar"}',
            profileImageUrl: 'https://example.com'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          `The supplied profile image URL, https://example.com, could not be resolved`
        );
      }
    });
    it('should throw error invalid input when result of createEntity', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.createEntity = () => {
          const err = new Error();
          err.stack = 'foobar';
          err.code = 23505;
          return Promise.reject(err);
        };
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.createEntity({
          input: {
            libraryId: libId,
            name: 'new entity',
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: '{"foo": "bar"}',
            profileImageUrl: 'https://example.com'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('resource_conflict');
        chaiExpect(e.message).to.equal(
          'The requested mutation could not be executed because of a conflict with an existing resource, such as duplicate name or ID.'
        );
      }
    });
    it('should throw error unexpected', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.createEntity = () => Promise.resolve('foobar');
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.createEntity({
          input: {
            libraryId: libId,
            name: 'new entity',
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: '{"foo": "bar"}',
            profileImageUrl: 'https://example.com'
          }
        });
      } catch (e) {
        chaiExpect(e.message).to.equal('Missing input!string');
      }
    });
  });
  describe('#updateEntity', function () {
    it('should update an entity', async function () {
      const res = await dal.updateEntity({
        input: {
          organizationId: 7682,
          organizationIds: [7682],
          id: entId,
          name: 'updated entity',
          profileImageUrl: 'http://localhost/image.jpeg'
        }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entId);
      chaiExpect(res.name).to.equal('updated entity');
      chaiExpect(res.libraryId).to.equal(libId);
      chaiExpect(res.profileImageUrl).to.exist;
      chaiExpect(res.profileImageUrl).to.equal('http://localhost/image.jpeg');
    });
    it('should throw error invalid input when libraryservices throw error bad request', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.updateEntity = () => {
          const err = new Error();
          err.errors = { foo: 'bar' };
          err.name = 'BadRequestError';
          return Promise.reject(err);
        };
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateEntity({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entId,
            name: 'updated entity'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'The updated entity data caused a validation error. See the data section below for details.'
        );
      }
    });
    it('should throw error service unavailable', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.updateEntity = () => {
          const err = new Error();
          err.errors = { foo: 'bar' };
          err.name = 'InvalidAccessKeyId';
          return Promise.reject(err);
        };
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateEntity({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entId,
            name: 'updated entity'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('service_unavailable');
        chaiExpect(e.message).to.equal(
          'The entity profile image could not be stored due to a ' +
            'temporary configuration error on this server. To continue, ' +
            'contact Veritone support and include this entire error payload.'
        );
      }
    });
    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getEntities = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateEntity({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entId,
            name: 'updated entity'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
    it('should throw error not allowed', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getEntities = () =>
          Promise.resolve({
            totalResults: 1,
            results: [
              {
                library: {
                  ownerOrgId: 7684
                }
              }
            ]
          });
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateEntity({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entId,
            name: 'updated entity'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_allowed');
      }
    });
  });
  describe('#deleteEntity', function () {
    it('should delete an entity', async function () {
      const res = await dal.deleteEntity({
        id: entId,
        organizationId: 7682,
        organizationIds: [7682]
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entId);
    });
  });

  // entity identifier
  describe('#getEntityIdentifiers', function () {
    it('should get entity identifiers by entity ID', async function () {
      const res = await dal.getEntityIdentifiers({
        entityId: entId,
        organizationId: 7682,
        organizationIds: [7682]
      });
      chaiExpect(res).to.exist;

      chaiExpect(_.get(res, 'records[0].id')).to.equal(entIdentId);
      chaiExpect(_.get(res, 'records[0].name')).to.equal('entity identifier');
      chaiExpect(res.count).to.equal(1);
      chaiExpect(_.get(res, 'records[0].libraryId')).to.equal(libId);
      chaiExpect(_.get(res, 'records[0].entityId')).to.equal(entId);
    });
  });
  describe('#createEntityIdentifier', function () {
    it('should create an entity identifier', async function () {
      serviceContext.dbConnections['core'].write._push([{ id: entId }]);
      const res = await dal.createEntityIdentifier({
        input: {
          libraryId: libId,
          entityId: entId,
          organizationId: 7682,
          organizationIds: [7682],
          url: 'http://localhost/whatever',
          file: {
            inputStream: 'whatever'
          },
          profileUpdateMode: 'always'
        }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entIdentId);
      chaiExpect(res.libraryId).to.equal(libId);
      chaiExpect(res.entityId).to.equal(entId);
    });
    it('should throw error invalid input', async function () {
      try {
        await dal.createEntityIdentifier({
          input: {
            libraryId: libId,
            entityId: entId,
            organizationId: 7682,
            organizationIds: [7682]
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
      }
    });
    it('should throw error invalid input when input jsonstring is invalid json stringify', async function () {
      try {
        await dal.createEntityIdentifier({
          input: {
            libraryId: libId,
            entityId: entId,
            organizationId: 7682,
            organizationIds: [7682],
            jsonstring: 'foobar',
            url: 'http://localhost/whatever',
            profileUpdateMode: 'always'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
      }
    });
  });
  describe('#updateEntityIdentifier', function () {
    it('should update an entityIdentifier', async function () {
      const res = await dal.updateEntityIdentifier({
        input: {
          organizationId: 7682,
          organizationIds: [7682],
          id: entIdentId,
          name: 'updated entity identifier',
          url: 'http://localhost/whatever',
          contentType: 'everything',
          jsondata: '{"foo":"bar"}'
        }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entIdentId);
      chaiExpect(res.libraryId).to.equal(libId);
      chaiExpect(res.entityId).to.equal(entId);
    });
    it('should throw error invalid input url', async function () {
      try {
        await dal.updateEntityIdentifier({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entIdentId,
            name: 'updated entity identifier',
            url: ''
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'The URL for an entity identifier cannot be set to an empty value.'
        );
      }
    });
    it('should throw error not found entity identifier', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getEntityIdentifiers = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateEntityIdentifier({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entIdentId,
            name: 'updated entity identifier',
            url: ''
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal('The requested object was not found');
      }
    });
    it('should throw error not found library', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getEntityIdentifiers = () =>
          Promise.resolve({
            totalResults: 1,
            results: [
              {
                entityIdentifierId: entIdentId,
                entityId: entId,
                entity: {
                  entityId: entId,
                  libraryId: libId
                },
                libraryId: libId,
                name: 'entity identifier',
                entityIdentifierType: {
                  entityIdentifierTypeId: 'person'
                },
                entityIdentifierTypeId: 'person'
              }
            ]
          });
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateEntityIdentifier({
          input: {
            organizationId: 7682,
            organizationIds: [7682],
            id: entIdentId,
            name: 'updated entity identifier',
            url: ''
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal('The requested object was not found');
      }
    });
  });
  describe('#deleteEntityIdentifier', function () {
    it('should delete an entity identifier', async function () {
      const res = await dal.deleteEntityIdentifier({
        id: entIdentId,
        organizationId: 7682,
        organizationIds: [7682]
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(entIdentId);
    });
  });

  describe('#getEntityIdentifierTypes', function () {
    it('should get entity identifier types with multiple args', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'type-id-1'
          },
          {
            id: 'type-id-2'
            // test for proper OR in where clause. defect was AND instead of OR.
          }
        ],
        true,
        [' OR ', 'type-id-1', 'type-id-2']
      );
      const res = await dal.getEntityIdentifierTypes({
        ids: ['type-id-1', 'type-id-2'],
        libraryTypeId: '123'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(2);
    });
  });

  describe('#getEntityIdentifierType', function () {
    it('should get entity identifier type', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'type-id-1'
          }
        ],
        true
      );
      const res = await dal.getEntityIdentifierType({
        id: 'type-id-1'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('type-id-1');
    });
    it('should throw error not found entity identifier type', async function () {
      serviceContext.dbConnections['core'].read._push([], true);
      try {
        await dal.getEntityIdentifierType({
          id: 'type-id-1'
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
  });

  describe('#checkId', function () {
    it('should throw error invalid input', async function () {
      try {
        dal.checkId();
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should throw error invalid input', async function () {
      try {
        dal.checkId('engindId#123');
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
  });
  describe('#publishLibrary', function () {
    it('should throw error invalid input', async function () {
      try {
        await dal.publishLibrary({});
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should throw error invalid input', async function () {
      try {
        await dal.publishLibrary({ id: 'engindId#123' });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should publish library version successfully', async function () {
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '6916605a-6ace-4cb2-90ab-f03ff21fd63a' }
      ]);
      const result = await dal.publishLibrary(
        {
          id: libId,
          organizations: [7682]
        },
        mockUtil.makeContext({ authType: 'api_org' })
      );
      chaiExpect(result.id).to.equal(libId);
    });
  });

  describe('#createLibraryType', function () {
    it('should create library type successfully', async function () {
      const result = await dal.createLibraryType({
        input: {
          id: libTypeId,
          entityIdentifierTypeIds: [1, 2, 3],
          label: 'test label',
          iconClass: 'library',
          entityType: 'test entity'
        }
      });
      chaiExpect(result.id).to.equal(libTypeId);
    });
  });
  describe('#createEntityIdentifierType', function () {
    it('should create entity identifier type successfully', async function () {
      const result = await dal.createEntityIdentifierType({
        input: {
          id: entIdentId,
          label: 'test label',
          labelPlural: 'library',
          dataType: 'test entity identifier'
        }
      });
      chaiExpect(result.id).to.equal(entIdentId);
    });
  });

  describe('#getLibraryEngineModels', function () {
    it('should getLibraryEngineModels successfully with args current version', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );
      const result = await dal.getLibraryEngineModels({
        currentVersion: 1,
        id: libEngineModelId,
        libraryId: libId,
        engineId: engId,
        trainStatus: 1,
        libraryVersion: 'test',
        lastModified: true,
        limit: 10,
        offset: 1
      });
      chaiExpect(result.count).to.equal(1);
      chaiExpect(result.records[0].libraryEngineModelId).to.equal(
        libEngineModelId
      );
    });
    it('should getLibraryEngineModels successfully with args library version', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (!_.isString(vars[4]))
            throw new Error('version param $3 not a string');
          if (vars[0] !== libEngineModelId)
            throw new Error('wrong $1:  ' + vars[0]);
          if (vars[1] !== libId) throw new Error('wrong $2:  ' + vars[1]);
          if (vars[2] !== engId) throw new Error('wrong $3:  ' + vars[2]);
          return true;
        }
      );
      const result = await dal.getLibraryEngineModels({
        libraryVersion: 1,
        id: libEngineModelId,
        libraryId: libId,
        engineId: engId,
        trainStatus: 1,
        lastModified: true,
        limit: 10,
        offset: 1
      });
      chaiExpect(result.count).to.equal(1);
      chaiExpect(result.records[0].libraryEngineModelId).to.equal(
        libEngineModelId
      );
    });
    it('should getLibraryEngineModels successfully without args last modified', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );
      const result = await dal.getLibraryEngineModels({
        libraryVersion: 1,
        id: libEngineModelId,
        libraryId: libId,
        engineId: engId,
        trainStatus: 1,
        limit: 10,
        offset: 1
      });
      chaiExpect(result.count).to.equal(1);
      chaiExpect(result.records[0].libraryEngineModelId).to.equal(
        libEngineModelId
      );
    });
  });
  describe('#getLibraryEngineModel', function () {
    it('should getLibraryEngineModel successfully', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );
      const result = await dal.getLibraryEngineModel({
        id: libEngineModelId
      });
      chaiExpect(result.libraryEngineModelId).to.equal(libEngineModelId);
    });
    it('should error when missing id field', async function () {
      try {
        await dal.getLibraryEngineModel({});
      } catch (e) {
        chaiExpect(e.message).to.equal('id parameter is required');
      }
    });
    it('should error not found', async function () {
      serviceContext.dbConnections['core'].read._push([], false);
      try {
        await dal.getLibraryEngineModel({
          id: libEngineModelId
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.data.objectType).to.equal('LibraryEngineModel');
      }
    });
  });
  describe('#createLibraryEngineModel', function () {
    it('should createLibraryEngineModel successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          id: libEngineModelId,
          alias_id: libEngineModelId,
          category_id: 123
        }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );
      const result = await dal.createLibraryEngineModel(
        mockUtil.makeContext(),
        {
          input: {
            organizationId: 7682,
            libraryId: libId,
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId,
            dataUrl: 'http://dev-veritone-library.s3.amazonaws/model/1'
          }
        }
      );
      chaiExpect(result.id).to.equal(libEngineModelId);
    });
    it('should createLibraryEngineModel successfully - Content-Type', async function () {
      jest.setTimeout(15000);
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId', ownerOrganizationId: 7682 }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );

      const result = await dal.createLibraryEngineModel(
        mockUtil.makeContext(),
        {
          input: {
            organizationId: 7682,
            libraryId: libId,
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId,
            dataUrl: 'http://dev-veritone-library.s3.amazonaws/model/2'
          }
        }
      );
      chaiExpect(result.id).to.equal(libEngineModelId);
    });

    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.createLibraryEngineModel(mockUtil.makeContext(), {
          input: {
            organizationId: 7682,
            libraryId: libId,
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
  });
  describe('#updateLibraryEngineModel', function () {
    it('should throw error not found', async function () {
      try {
        serviceContext.dbConnections['core'].write._push([], false);
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateLibraryEngineModel(mockUtil.makeContext(), {
          input: {
            id: libId,
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(serviceContext.messageUtil._messages().length).to.equal(0);
      }
    });
    it('should throw error invalid id field', async function () {
      try {
        await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
          input: {
            id: 'te&asdsa',
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should throw error invalid input', async function () {
      try {
        serviceContext.dbConnections['core'].write._push(
          [
            {
              libraryEngineModelId: libEngineModelId
            }
          ],
          false
        );
        await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
          input: {
            id: libEngineModelId,
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId,
            trainStatus: true,
            accuracy: 'test',
            configurationId: 'test',
            contentType: 'Invalid',
            file: { contentType: 'Invalid' }
          }
        });
      } catch (e) {
        chaiExpect(e).to.exist;
        chaiExpect(e.name).to.equal('invalid_input');
      }
    });
    it('should throw error', async function () {
      try {
        serviceContext.dbConnections['core'].write._push(
          [
            {
              libraryEngineModelId: libEngineModelId
            }
          ],
          false
        );
        await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
          input: {
            id: libEngineModelId,
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId,
            trainStatus: true,
            accuracy: 'test',
            configurationId: 'test',
            contentType: 'Error',
            file: { contentType: 'Error' }
          }
        });
      } catch (e) {
        chaiExpect(e).to.exist;
      }
    });
    it('should update library engine model successfully', async function () {
      serviceContext.dbConnections['core'].write._push([{}], false);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );

      const res = await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
        input: {
          organizationId: 7682,
          id: libEngineModelId,
          jsondata: '{"foo":"bar"}',
          engineId: entId,
          trainJobId: libId,
          trainStatus: true,
          accuracy: 'test',
          configurationId: 'test',
          contentType: 'test',
          file: { contentType: 'test' }
        }
      });
      chaiExpect(res.id).to.equal(libEngineModelId);
    });

    it('should update library engine model with url content', async function () {
      jest.setTimeout(15000);
      serviceContext.dbConnections['core'].write._push([{}], false);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );
      const res = await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
        input: {
          organizationId: 7682,
          id: libEngineModelId,
          jsondata: '{"foo":"bar"}',
          engineId: entId,
          trainJobId: libId,
          trainStatus: true,
          accuracy: 'test',
          configurationId: 'test',
          dataUrl: 'http://dev-veritone-library.s3.amazonaws/model/3'
        }
      });
      chaiExpect(res.id).to.equal(libEngineModelId);
    });

    it('should update library engine model with url content - content-type', async function () {
      jest.setTimeout(15000);
      serviceContext.dbConnections['core'].write._push([{}], false);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );

      const res = await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
        input: {
          organizationId: 7682,
          id: libEngineModelId,
          jsondata: '{"foo":"bar"}',
          engineId: entId,
          trainJobId: libId,
          trainStatus: true,
          accuracy: 'test',
          configurationId: 'test',
          dataUrl: 'http://dev-veritone-library.s3.amazonaws/model/3'
        }
      });
      chaiExpect(res.id).to.equal(libEngineModelId);
    });

    it('should emit audit log event if trainStatus is "complete"', async function () {
      jest.setTimeout(15000);
      serviceContext.dbConnections['core'].write._push([{}], false);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );

      await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
        input: {
          organizationId: 7682,
          id: libEngineModelId,
          jsondata: '{"foo":"bar"}',
          engineId: entId,
          trainJobId: libId,
          trainStatus: 'complete',
          accuracy: 'test',
          configurationId: 'test',
          dataUrl: 'http://dev-veritone-library.s3.amazonaws/model/3'
        }
      });
      // events and public topic
      chaiExpect(serviceContext.messageUtil._messages().length).to.equal(2);
      chaiExpect(
        serviceContext.messageUtil._messages()[1].actionInfo.actionResult
      ).to.equal('success');
    });

    it('should emit audit log event if library training fails and trainStatus is "complete"', async function () {
      try {
        await dal.updateLibraryEngineModel(mockUtil.makeContext(), {
          input: {
            id: 'te&asdsa',
            jsondata: '{"foo":"bar"}',
            engineId: entId,
            trainJobId: libId,
            trainStatus: 'complete'
          }
        });
      } catch (e) {
        // public event for audit purposes only
        chaiExpect(serviceContext.messageUtil._messages().length).to.equal(1);
        chaiExpect(
          serviceContext.messageUtil._messages()[0].actionInfo.actionResult
        ).to.equal('failure');
      }
    });
  });

  describe('#deleteLibraryEngineModel', function () {
    it('should throw error not found', async function () {
      try {
        serviceContext.dbConnections['core'].write._push([], false);
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.deleteLibraryEngineModel({
          id: libId
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
    it('should throw error invalid id field', async function () {
      try {
        await dal.deleteLibraryEngineModel({
          id: 'te&asdsa'
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should update library engine model successfully', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            libraryEngineModelId: libEngineModelId
          }
        ],
        false
      );
      const res = await dal.deleteLibraryEngineModel({
        id: libEngineModelId
      });
      chaiExpect(res.id).to.equal(libEngineModelId);
    });
  });

  describe('#createLibraryCollaborator', function () {
    it('should createLibraryCollaborator successfully', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            collaborator_org_id: 7682,
            library_id: libId,
            permissions: ['view'],
            status: 'active'
          }
        ],
        false
      );

      const result = await dal.createLibraryCollaborator(
        mockUtil.makeContext(),
        {
          input: {
            organizationId: 7682,
            libraryId: libId,
            permissions: ['view'],
            status: 'active'
          }
        }
      );
      chaiExpect(result.organizationId).to.equal(7682);
      chaiExpect(result.libraryId).to.equal(libId);
      chaiExpect(result.status).to.equal('active');
    });

    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraries = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.createLibraryCollaborator(mockUtil.makeContext(), {
          input: {
            organizationId: 7682,
            libraryId: libId,
            permissions: ['view'],
            status: 'active'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
  });

  describe('#updateLibraryCollaborator', function () {
    it('Unable to get Library Collaborators', async function () {
      let error;
      try {
        serviceContext.dbConnections['core'].write._push([], false);
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraryCollaborators = () => Promise.resolve(null);
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateLibraryCollaborator(mockUtil.makeContext(), {
          input: {
            organizationId: 7682,
            libraryId: libId,
            permissions: ['view'],
            status: 'active'
          }
        });
      } catch (e) {
        error = e;
      }

      chaiExpect(_.isNil(error)).to.equal(false);
      chaiExpect(`${error}`).to.contain(
        'unable to get the library collaborators.'
      );
    });
    it('should throw error not found: the result is empty/ count = 0', async function () {
      let error;
      try {
        serviceContext.dbConnections['core'].write._push([], false);
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraryCollaborators = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        serviceContext.librariesService = librariesService;
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.updateLibraryCollaborator(mockUtil.makeContext(), {
          input: {
            organizationId: 7682,
            libraryId: libId,
            permissions: ['view'],
            status: 'active'
          }
        });
      } catch (e) {
        error = e;
      }

      chaiExpect(_.isNil(error)).to.equal(false);
      chaiExpect(error.name).to.equal('not_found');
      chaiExpect(error.data.objectId).to.equal(`${libId} - ${7682}`);
    });
    it('should throw error invalid libraryId field', async function () {
      try {
        await dal.updateLibraryCollaborator(mockUtil.makeContext(), {
          input: {
            organizationId: 7682,
            libraryId: 'te&asdsa',
            permissions: ['view'],
            status: 'active'
          }
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should update library collaborator successfully', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            collaborator_org_id: 7682,
            library_id: libId,
            permissions: ['view'],
            status: 'rejected'
          }
        ],
        false
      );

      const res = await dal.updateLibraryCollaborator(mockUtil.makeContext(), {
        input: {
          organizationId: 7682,
          libraryId: libId,
          permissions: ['view'],
          status: 'rejected'
        }
      });
      chaiExpect(res.libraryId).to.equal(libId);
      chaiExpect(res.status).to.equal('rejected');
    });
  });

  describe('#deleteLibraryCollaborator', function () {
    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          _.get(serviceContext, 'librariesService')
        );
        librariesService.getLibraryCollaborators = () =>
          Promise.resolve({
            totalResults: 0,
            results: []
          });
        let dalLib = require('./library.js')(serviceContext);
        await dalLib.deleteLibraryCollaborator({
          libraryId: libId,
          organizationId: 7682
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
    it('should throw error invalid id field', async function () {
      try {
        await dal.deleteLibraryEngineModel({
          libraryId: 'te&asdsa',
          organizationId: 7682
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('invalid_input');
        chaiExpect(e.message).to.equal(
          'Invalid ID format. A UUID is required.'
        );
      }
    });
    it('should delete library collaborator successfully', async function () {
      const res = await dal.deleteLibraryCollaborator({
        libraryId: libId,
        organizationId: 7682
      });
      chaiExpect(res.id).to.equal(`${libId} - 7682`);
    });
  });
  describe('#getEntityIdentifierItems', function () {
    it('should get entity identifier items successfully', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            library_type_id: 'lib-type-id',
            entity_identifier_type_id: entIdentId
          },
          {
            library_type_id: 'lib-type-id',
            entity_identifier_type_id: entIdentId
          }
        ],
        false
      );
      const res = await dal.getEntityIdentifierItems({
        libraryTypeId: 'lib-type-id',
        entityIdentifierTypeId: entIdentId
      });
      chaiExpect(res.count).to.equal(2);
    });
  });
  describe('#getLibraryTypes', function () {
    it('should get library type successfully', async function () {
      const res = await dal.getLibraryTypes({
        libraryTypeId: 'lib-type-id',
        entityIdentifierTypeId: entIdentId
      });
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].libraryTypeId).to.equal('people');
    });
  });
  describe('#getLibraryType', function () {
    it('should throw error not found', async function () {
      try {
        const librariesService = Object.assign(
          {},
          serviceContext.librariesService
        );
        librariesService.getLibraryTypes = (args) =>
          Promise.resolve({
            results: [],
            totalResults: 0
          });
        const dalLib = require('./library')(serviceContext);
        await dalLib.getLibraryType({
          id: 'lib-type-id'
        });
      } catch (e) {
        chaiExpect(e.name).to.equal('not_found');
      }
    });
    it('should throw error when missing id field', async function () {
      try {
        const librariesService = Object.assign(
          {},
          serviceContext.librariesService
        );
        librariesService.getLibraryTypes = (args) =>
          Promise.resolve({
            results: [],
            totalResults: 0
          });
        await dal.getLibraryType({});
      } catch (e) {
        chaiExpect(e).to.exist;
        chaiExpect(e.message).to.equal('id arg is required');
      }
    });
  });

  describe('#addDataset', function () {
    it('should add data set successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          recording_id: 123
        }
      ]);
      const res = await dal.addDataset({
        input: {
          libraryId: libId,
          tdoIds: ['tdo-id-1']
        }
      });
      chaiExpect(res.tdoIds[0]).to.equal(123);
    });
  });
  describe('#deleteDataset', function () {
    it('should delete data set successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          recording_id: 123
        }
      ]);
      const res = await dal.deleteDataset({
        input: {
          libraryId: libId,
          tdoIds: ['tdo-id-1']
        }
      });
      chaiExpect(res.tdoIds[0]).to.equal(123);
    });
  });
  describe('#getDataset', function () {
    it('should get data set successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          recording_id: 123
        }
      ]);
      const res = await dal.getDataset({
        libraryId: libId
      });
      chaiExpect(res.tdoIds[0]).to.equal(123);
    });
  });
  describe('#authConfiguration', function () {
    it('should throw error too many libraries response', async function () {
      try {
        serviceContext.dbConnections['core'].read._push([
          {
            library_id: libId
          },
          {
            library_id: libId
          }
        ]);
        await dal.authConfiguration(libId, ['7682']);
      } catch (e) {
        chaiExpect(e).to.exist;
        chaiExpect(e.message).to.equal(
          '2 libraries with configuration id ' + libId
        );
      }
    });
    it('should throw error not found', async function () {
      try {
        serviceContext.dbConnections['core'].read._push([]);
        await dal.authConfiguration(libId, ['7682']);
      } catch (e) {
        chaiExpect(e).to.exist;
        chaiExpect(e.message).to.equal(
          'Cannot find matched library configuration'
        );
      }
    });
    it('should auth configuration successfully', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          library_id: libId
        }
      ]);
      const res = await dal.authConfiguration(libId, ['7682']);
      chaiExpect(res.libraryId).to.equal(libId);
    });
  });
  describe('#getLibraryConfiguration', function () {
    it('should throw error not found', async function () {
      try {
        serviceContext.dbConnections['core'].read._push([]);
        await dal.getLibraryConfiguration({
          id: libId
        });
      } catch (e) {
        chaiExpect(e).to.exist;
        chaiExpect(e.message).to.equal('Cannot find library configuration');
      }
    });
    it('should get configuration successfully', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          library_id: libId,
          configuration_id: 1
        }
      ]);
      const res = await dal.getLibraryConfiguration({
        id: libId
      });
      chaiExpect(res.id).to.equal(1);
    });
  });
  describe('#getLibraryConfigurations', function () {
    it('should ger library configuration successfully', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          library_id: libId,
          configuration_id: 1,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      const res = await dal.getLibraryConfigurations({
        libraryId: libId,
        limit: 10
      });
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].id).to.equal(1);
    });
  });
  describe('#createModelConfiguration', function () {
    it('should create model configuration successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          library_id: libId,
          configuration_id: configId,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          library_id: libId,
          configuration_id: configId,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      const res = await dal.createModelConfiguration(
        {
          input: {
            id: configId,
            libraryId: libId
          }
        },
        true
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(configId);
      chaiExpect(res.libraryId).to.equal(libId);
    });
    it('should create model configuration successfully without returning save config', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          library_id: libId,
          configuration_id: 1,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      const res = await dal.createModelConfiguration(
        {
          input: {
            libraryId: libId
          }
        },
        false
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.exist;
    });
  });
  describe('#updateModelConfiguration', function () {
    it('should update model configuration successfully', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            library_id: libId,
            configuration_id: configId,
            ranked_source_engine_ids: [1, 2, 3]
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_id: libId,
            configuration_id: configId,
            ranked_source_engine_ids: [1, 2, 3]
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_id: libId,
            configuration_id: configId,
            ranked_source_engine_ids: [1, 2, 3]
          }
        ],
        false
      );
      const res = await dal.updateModelConfiguration(
        {
          input: {
            id: configId
          }
        },
        true
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(configId);
    });
    it('should update model configuration successfully without returning save config', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          library_id: libId,
          configuration_id: 1,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_id: libId,
            configuration_id: configId,
            ranked_source_engine_ids: [1, 2, 3]
          }
        ],
        false
      );
      const res = await dal.updateModelConfiguration(
        {
          input: {
            id: configId
          }
        },
        false
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(configId);
    });
  });
  describe('#deleteModelConfiguration', function () {
    it('should delete configuration successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          library_id: libId,
          configuration_id: 1,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_id: libId,
            configuration_id: configId,
            ranked_source_engine_ids: [1, 2, 3]
          }
        ],
        false
      );
      const res = await dal.deleteModelConfiguration({
        id: configId
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.message).to.equal(configId + ' is deleted');
    });
  });
  describe('#createDatasetConfiguration', function () {
    it('should create data set successfully', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          library_id: libId,
          configuration_id: 1,
          ranked_source_engine_ids: [1, 2, 3]
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          configuration_id: 1,
          ranked_source_engine_ids: [1, 2, 3],
          min_confidence: 1,
          max_confidence: 2
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            configuration_id: 1,
            library_id: libId,
            ranked_source_engine_ids: [1, 2, 3],
            min_confidence: 1,
            max_confidence: 2
          }
        ],
        false
      );
      const res = await dal.createDatasetConfiguration({
        input: {
          libraryId: libId,
          confidence: {
            min: 1,
            max: 2,
            allowNull: true
          }
        }
      });
      chaiExpect(res).to.exist;
    });
  });
  describe('#updateDatasetConfiguration', function () {
    it('should update data set successfully', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            library_id: libId,
            configuration_id: 1,
            ranked_source_engine_ids: [1, 2, 3]
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            configuration_id: 1,
            ranked_source_engine_ids: [1, 2, 3],
            min_confidence: 1,
            max_confidence: 2
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            configuration_id: 1,
            library_id: libId,
            ranked_source_engine_ids: [1, 2, 3],
            min_confidence: 1,
            max_confidence: 2
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            configuration_id: 1,
            library_id: libId,
            ranked_source_engine_ids: [1, 2, 3],
            min_confidence: 1,
            max_confidence: 2
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            configuration_id: 1,
            library_id: libId,
            ranked_source_engine_ids: [1, 2, 3],
            min_confidence: 1,
            max_confidence: 2
          }
        ],
        false
      );
      const res = await dal.updateDatasetConfiguration({
        input: {
          id: configId,
          libraryId: libId,
          confidence: {
            min: 1,
            max: 2,
            allowNull: true
          }
        }
      });
      chaiExpect(res).to.exist;
    });
  });
  describe('#hydrateLibraryEngineModel', function () {
    it('should mapping successfully', async function () {
      const res = await dal.hydrateLibraryEngineModel({
        l__library_id: libId,
        modified_date_time: new Date(),
        created_date_time: new Date()
      });
      chaiExpect(res).to.exist;
    });
  });
  describe('#getLibraryTypes', function () {
    it('should get library types, full filters', async function () {
      let res, err;
      const params = {
        libraryType: 'libraryTypeTest',
        identifierType: 'identifierTypeTest',
        name: 'nameTest',
        nameOrId: 'nameOrIdTest',
        limit: 30,
        offset: 0
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_type_id: 'libraryTypeTest',
            label: 'labelTest',
            icon_class: 'iconClassTest',
            entity_type_name: 'nameTest',
            entity_type_name_plural: 'nameTestPlural',
            entity_identifier_types: 'identifierTypeTest'
          }
        ],
        false
      );

      try {
        res = await dal.getLibraryTypes(params);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].libraryTypeId).to.equal('people');
      chaiExpect(res.records[0].entityIdentifierTypes).to.deep.equal([
        'identifierTypeTest'
      ]);
    });

    it('should get library types, empty filter', async function () {
      let res, err;
      const params = {};

      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_type_id: 'libraryTypeTest',
            label: 'labelTest',
            icon_class: 'iconClassTest',
            entity_type_name: 'nameTest',
            entity_type_name_plural: 'nameTestPlural',
            entity_identifier_types: 'identifierTypeTest'
          }
        ],
        false
      );

      try {
        res = await dal.getLibraryTypes(params);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].libraryTypeId).to.equal('people');
      chaiExpect(res.records[0].entityIdentifierTypes).to.deep.equal([
        'identifierTypeTest'
      ]);
    });
  });
  describe('#authEntityIdentifier', function () {
    it('should add library', async function () {
      const res = await dal.authEntityIdentifier('123', [7682]);
      chaiExpect(res).to.exist;
      chaiExpect(res.library).to.exist;
      chaiExpect(res.library.ownerOrgId).to.exist;
    });
  });
});
