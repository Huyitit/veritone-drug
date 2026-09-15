/* global describe, it, expect, beforeEach, spyOn, jasmine */
/* eslint func-names:off,camelcase:off */

// TODO add a eslintrc rule for unit tests to include above settings

'use strict';

const _ = require('lodash');
const model = require('../model');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
jest.mock('./common', () => () => commonDalMock);
const initDal = require('./library-engine-model');

const db = {
  read: 'postgres://read@libraries',
  write: 'postgres://write@libraries',
  schemaName: 'libraries'
};

const pagingConfig = {
  defaultLimit: 10,
  maxLimit: 25
};

const paging = require('../../../util/pagination')(pagingConfig);

let queryStub;
const commonDalMock = {
  get query() { return queryStub; },
  _init: () => commonDalMock
};

const libraryEngineModelFixtures = [
  {
    libraryEngineModelId: 'c7c1c5c4-12b9-11e7-93ae-92361f002671',
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    engineId: 'face-engine-1',
    trainStatus: 'complete'
  },
  {
    libraryEngineModelId: 'c7c1cb0a-12b9-11e7-93ae-92361f002671',
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    engineId: 'face-engine-2',
    trainStatus: 'pending'
  },
  {
    libraryEngineModelId: 'c7c1cc22-12b9-11e7-93ae-92361f002671',
    libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
    engineId: 'logo-detection-1',
    trainStatus: 'complete'
  }
];

const libraryFixtures = {
  '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01': {
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    version: 1,
    libraryTypeId: 'people',
    name: 'My People',
    description: 'a library of people',
    ownerOrgId: 2222
  },
  '76b56c45-e958-4fef-a729-bfb12e750813': {
    libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
    version: 2,
    libraryTypeId: 'organization',
    name: 'My Brands',
    description: 'a library of brands',
    ownerOrgId: 1234
  }
};

const libraryTypeFixtures = {
  people: {
    libraryTypeId: 'people',
    label: 'People',
    iconClass: 'icon-person',
    entityIdentifierTypes: []
  },
  organization: {
    libraryTypeId: 'organization',
    label: 'Organizations',
    iconClass: 'icon-org',
    entityIdentifierTypes: []
  }
};

const libraryEngineModelArgErr =
  'Error: expected libraryEngineModel to be an instance of model.LibraryEngineModel';

describe('libraries.dal.library-engine-model:', function() {
  let dal, failQuery, resultRows, queryError;

  beforeEach(function() {

    failQuery = false;
    queryError = new Error('i failed');

    queryStub = jest.fn().mockImplementation(function() {
      return new Promise(function(resolve) {
        if (failQuery) {
          throw queryError;
        }

        resolve(resultRows);
      });
    });

    jest.spyOn(paging, 'enforceParams');
    jest.spyOn(paging, 'toPaginationEnvelope');

    dal = initDal(db, paging);
  });

  it('should return a function', function() {
    expect(initDal).toEqual(expect.any(Function));
  });

  it('should throw an error if any arguments are missing', function() {
    try {
      expect(initDal()).toThrowError('conn is required');
    } catch (e) {
      //nothing
    }

    try {
      expect(initDal({})).toThrowError('conn.schemaName is required');
    } catch (e) {
      //nothing
    }

    try {
      expect(initDal(db)).toThrowError('paging is required');
    } catch (e) {
      //nothing
    }

    try {
      expect(initDal(db, paging)).not.toThrowError();
    } catch (e) {
      //nothing
    }
  });

  describe('after init', function() {
    beforeEach(function() {
      jest.spyOn(commonDalMock, '_init');
    });

    it('should export an object containing library engine model CRUD functions', function() {
      expect(dal).toEqual({
        getLibraryEngineModels: expect.any(Function),
        createLibraryEngineModel: expect.any(Function),
        updateLibraryEngineModel: expect.any(Function),
        deleteLibraryEngineModels: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function() {
      //expect(commonDalMock._init).toHaveBeenCalledWith(db);
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getLibraryEngineModels', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2
      };

      resultRows = libraryEngineModelFixtures.map(function(libraryEngineModel) {
        const row = _.mapKeys(libraryEngineModel, (value, key) =>
          _.snakeCase(key)
        );
        const library = libraryFixtures[libraryEngineModel.libraryId];
        const libraryType = libraryTypeFixtures[library.libraryTypeId];

        Object.assign(
          row,
          { total: libraryEngineModelFixtures.length },
          _.mapKeys(library, (value, key) => 'l__' + _.snakeCase(key)),
          _.mapKeys(libraryType, (value, key) => 'lt__' + _.snakeCase(key))
        );

        delete row.library_id;
        delete row.l__library_type_id;

        return row;
      });
    });

    it('should return a promise', function() {
      const promise = dal.getLibraryEngineModels();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getLibraryEngineModels().then(
        function() {
          expect(queryStub).toHaveBeenCalledWith(
            db.read,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function(done) {
      failQuery = true;

      dal.getLibraryEngineModels().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    describe('the query', function() {
      it('should use the default paging params when called without arguments', function(done) {
        dal.getLibraryEngineModels().then(
          function() {
            const sqlMatch = expect.stringMatching(/LIMIT \$1\s+OFFSET \$2/);
            const expectedValues = [pagingConfig.defaultLimit, 0];

            expect(paging.enforceParams).toHaveBeenCalled();
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should use the provided paging params when set', function(done) {
        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [params.limit, params.offset];
            const sqlMatch = expect.stringMatching(/LIMIT \$1\s+OFFSET \$2/);
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a engineId filter if provided', function(done) {
        params.engineId = '1234';

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.engineId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/engine_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of engineIds if multiple are provided', function(done) {
        params.engineId = ['1234', '4321'];

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.engineId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /engine_id = ANY\(\$1::text\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a libraryId filter if provided', function(done) {
        params.libraryId = 'xxxxx';

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.libraryId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/library_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of libraryIds if multiple are provided', function(done) {
        params.libraryId = ['xxxxxx', 'yyyyy'];

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.libraryId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /library_id = ANY\(\$1::uuid\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a engineId filter if provided', function(done) {
        params.engineId = '1234';

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.engineId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/engine_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of engineIds if multiple are provided', function(done) {
        params.engineId = ['1234', '4321'];

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.engineId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /engine_id = ANY\(\$1::text\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a trainStatus filter if provided', function(done) {
        params.trainStatus = 'complete';

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.trainStatus,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/train_status = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of trainStatus if multiple are provided', function(done) {
        params.trainStatus = ['complete', 'pending'];

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.trainStatus,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /train_status = ANY\(\$1::text\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a libraryVersion filter if provided', function(done) {
        params.libraryVersion = 3;

        dal.getLibraryEngineModels(params).then(
          function() {
            const expectedValues = [
              params.libraryVersion,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/library_version = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              db.read,
              sqlMatch,
              expectedValues
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      // TODO test with lastModified
    });

    describe('the result', function() {
      beforeEach(function() {
        params.offset = 10;
        params.limit = 10;
      });

      it('is a pagination envelope', function(done) {
        dal.getLibraryEngineModels(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + libraryEngineModelFixtures.length - 1,
              totalResults: libraryEngineModelFixtures.length,
              results: expect.any(Array)
            });

            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains an empty array if there are no results', function(done) {
        resultRows = [];

        dal.getLibraryEngineModels(params).then(
          function(result) {
            expect(typeof result).toEqual('object');
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(0);
            expect(result.totalResults).toEqual(0);
            expect(result.from).toEqual(10);
            expect(result.to).toEqual(10);
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains an array of library engine models when there is a valid result', function(done) {
        dal.getLibraryEngineModels(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(result.results[0] instanceof model.LibraryEngineModel).toBe(
              true
            );
            expect(result.results[0].libraryEngineModelId).toEqual(
              libraryEngineModelFixtures[0].libraryEngineModelId
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains library engine models with nested library -> libraryType models', function(done) {
        dal
          .getLibraryEngineModels(params)
          .then(function(result) {
            const expectedLibrary =
              libraryFixtures[libraryEngineModelFixtures[0].libraryId];
            const expectedLibraryType =
              libraryTypeFixtures[expectedLibrary.libraryTypeId];

            expect(result.results[0].libraryId).toBeUndefined();
            expect(result.results[0].library instanceof model.Library).toBe(
              true
            );
            expect(result.results[0].library).toEqual(
              expect.objectContaining(
                _.omit(expectedLibrary, ['libraryTypeId'])
              )
            );
            expect(result.results[0].library.libraryTypeId).toBeUndefined();
            expect(result.results[0].library.libraryType).toEqual(
              expect.objectContaining(expectedLibraryType)
            );

            done();
          })
          .catch(function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          });
      });
    });
  });

  describe('createLibraryEngineModel', function() {
    let libraryEngineModel,
      conflict = false;

    beforeEach(function() {
      libraryEngineModel = new model.LibraryEngineModel(
        libraryEngineModelFixtures[0]
      );

      queryStub.mockImplementation(function() {
        return new Promise(function(resolve) {
          if (failQuery) {
            throw queryError;
          }

          if (conflict) {
            throw new ResourceConflictError();
          }

          resolve(resultRows);
        });
      });
    });

    it('should return a promise', function() {
      const promise = dal.createLibraryEngineModel();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the libraryEngineModel argument', function(done) {
      dal.createLibraryEngineModel().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryEngineModelArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryEngineModel argument is of the wrong type', function(done) {
      dal.createLibraryEngineModel({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryEngineModelArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided libraryEngineModel model', function(done) {
      const expectedParams = [
        libraryEngineModel.libraryEngineModelId,
        libraryEngineModel.libraryId,
        libraryEngineModel.engineId,
        libraryEngineModel.trainJobId,
        libraryEngineModel.trainStatus,
        libraryEngineModel.dataUrl,
        JSON.stringify(libraryEngineModel.metadata),
        expect.any(Number),
        expect.any(Number),
        libraryEngineModel.libraryId
      ];

      dal.createLibraryEngineModel(libraryEngineModel).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.library_engine_model/i
          );
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            expectedParams
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function(done) {
      failQuery = true;

      dal.createLibraryEngineModel(libraryEngineModel).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function(done) {
      const clientMock = {};

      dal.createLibraryEngineModel(libraryEngineModel, clientMock).then(
        function() {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the inserted library engine model model when successful', function(done) {
      jest.spyOn(model.LibraryEngineModel, 'fromDB');

      resultRows = [
        _.mapKeys(libraryEngineModelFixtures[0], (value, key) =>
          _.snakeCase(key)
        )
      ];

      dal.createLibraryEngineModel(libraryEngineModel).then(
        function(insertedLibraryEngineModel) {
          expect(model.LibraryEngineModel.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(
            insertedLibraryEngineModel instanceof model.LibraryEngineModel
          ).toBe(true);
          expect(insertedLibraryEngineModel).toEqual(
            expect.objectContaining(libraryEngineModel)
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to null when no results are returned by the query', function(done) {
      resultRows = [];

      dal.createLibraryEngineModel(libraryEngineModel).then(
        function(insertedLibraryEngineModel) {
          expect(insertedLibraryEngineModel).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should reject with a ResourceConflictError if the library engine model exists', function(done) {
      conflict = true;

      dal.createLibraryEngineModel(libraryEngineModel).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err instanceof ResourceConflictError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('updateLibraryEngineModel', function() {
    let libraryEngineModel;

    beforeEach(function() {
      libraryEngineModel = new model.LibraryEngineModel(
        libraryEngineModelFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.updateLibraryEngineModel();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the libraryEngineModel argument', function(done) {
      dal.updateLibraryEngineModel().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryEngineModelArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryEngineModel argument is of the wrong type', function(done) {
      dal.updateLibraryEngineModel({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryEngineModelArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryEngineModel argument is missing libraryEngineModelId', function(done) {
      libraryEngineModel.libraryEngineModelId = null;

      dal.updateLibraryEngineModel(libraryEngineModel).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (
            err == 'Error: libraryEngineModel.libraryEngineModelId is required'
          ) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided library engine model model', function(done) {
      const expectedParams = [
        libraryEngineModel.trainJobId,
        libraryEngineModel.trainStatus,
        libraryEngineModel.dataUrl,
        JSON.stringify(libraryEngineModel.metadata),
        expect.any(Number),
        libraryEngineModel.libraryEngineModelId
      ];

      dal.updateLibraryEngineModel(libraryEngineModel).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^UPDATE libraries.library_engine_model/i
          );
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            expectedParams
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function(done) {
      failQuery = true;

      dal.updateLibraryEngineModel(libraryEngineModel).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function(done) {
      const clientMock = {};

      dal.updateLibraryEngineModel(libraryEngineModel, clientMock).then(
        function() {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the updated library engine model model when successful', function(done) {
      jest.spyOn(model.LibraryEngineModel, 'fromDB');

      resultRows = [
        _.mapKeys(libraryEngineModelFixtures[0], (value, key) =>
          _.snakeCase(key)
        )
      ];

      dal.updateLibraryEngineModel(libraryEngineModel).then(
        function(updatedLibraryEngineModel) {
          expect(model.LibraryEngineModel.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(
            updatedLibraryEngineModel instanceof model.LibraryEngineModel
          ).toBe(true);
          expect(updatedLibraryEngineModel).toEqual(
            expect.objectContaining(libraryEngineModel)
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to null when no results are returned by the query', function(done) {
      resultRows = [];

      dal.updateLibraryEngineModel(libraryEngineModel).then(
        function(updatedLibraryEngineModel) {
          expect(updatedLibraryEngineModel).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteLibraryEngineModels', function() {
    let libraryEngineModel;

    beforeEach(function() {
      libraryEngineModel = new model.LibraryEngineModel(
        libraryEngineModelFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.deleteLibraryEngineModels();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the libraryEngineModel argument', function(done) {
      dal.deleteLibraryEngineModels().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryEngineModelArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryEngineModel argument is of the wrong type', function(done) {
      dal.deleteLibraryEngineModels({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryEngineModelArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when neither libraryEngineModelId nor libraryId are not set', function(done) {
      libraryEngineModel = new model.LibraryEngineModel();

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (/require/.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should perform a soft delete on all records with matching libraryEngineModelId if provided', function(done) {
      libraryEngineModel = new model.LibraryEngineModel({
        libraryEngineModelId: 'xxxxx'
      });

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryEngineModel.libraryEngineModelId
          ];
          let sqlMatch = expect.stringMatching(/SET deleted_date_time = /i);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/library_engine_model_id = /);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should perform a soft delete on all records with matching libraryId if provided', function(done) {
      libraryEngineModel = new model.LibraryEngineModel({ libraryId: 'xxxxx' });

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryEngineModel.libraryId
          ];
          let sqlMatch = expect.stringMatching(/SET deleted_date_time = /i);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/library_id = /);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should perform a soft delete on all records with matching libraryId and libraryVersion if provided', function(done) {
      libraryEngineModel = new model.LibraryEngineModel({
        libraryId: 'xxxxx',
        libraryVersion: 4
      });

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryEngineModel.libraryId,
            libraryEngineModel.libraryVersion
          ];
          let sqlMatch = expect.stringMatching(/SET deleted_date_time = /i);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/library_id = /);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/library_version = /);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should perform a soft delete on all records with matching libraryId and engineId if provided', function(done) {
      libraryEngineModel = new model.LibraryEngineModel({
        libraryId: 'xxxxx',
        engineId: 'yyyyy'
      });

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryEngineModel.libraryId,
            libraryEngineModel.engineId
          ];
          let sqlMatch = expect.stringMatching(/SET deleted_date_time = /i);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/library_id = /);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/engine_id = /);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function(done) {
      failQuery = true;

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function(done) {
      const clientMock = {};

      dal.deleteLibraryEngineModels(libraryEngineModel, clientMock).then(
        function() {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the number of rows deleted when successful', function(done) {
      resultRows = [
        {
          library_id: libraryEngineModelFixtures[0].libraryId
        }
      ];

      dal.deleteLibraryEngineModels(libraryEngineModel).then(
        function(rowsDeleted) {
          expect(typeof rowsDeleted).toBe('number');
          expect(rowsDeleted).toEqual(1);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });
});
