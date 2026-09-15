/* global describe, it, expect, beforeEach, spyOn, jasmine */
/* eslint func-names:off,camelcase:off */

// TODO add a eslintrc rule for unit tests to include above settings

'use strict';

const _ = require('lodash');
const model = require('../model');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
jest.mock('./common', () => () => commonDalMock);
const initDal = require('./library-type');

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

const libraryTypeFixtures = [
  {
    libraryTypeId: 'people',
    label: 'People',
    iconClass: 'icon-person',
    entityIdentifierTypes: [],
    entityType: {
      name: 'person',
      namePlural: 'people'
    }
  },
  {
    libraryTypeId: 'organization',
    label: 'Organizations',
    iconClass: 'icon-org',
    entityIdentifierTypes: [],
    entityType: {
      name: 'organization',
      namePlural: 'organization'
    }
  }
];

const libraryTypeArgErr =
  'Error: expected libraryType to be an instance of model.LibraryType';

describe('libraries.dal.library-type:', function() {
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

    it('should export an object containing library type CRUD functions', function() {
      expect(dal).toEqual({
        getLibraryTypes: expect.any(Function),
        createLibraryType: expect.any(Function),
        saveEntityIdentifierLinks: expect.any(Function),
        updateLibraryType: expect.any(Function),
        deleteLibraryType: expect.any(Function),
        deleteEntityIdentifierLinks: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function() {
      //expect(commonDalMock._init).toHaveBeenCalledWith(db);
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getLibraryTypes', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2
      };

      populateResultRows();
    });

    it('should return a promise', function() {
      const promise = dal.getLibraryTypes();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getLibraryTypes().then(
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

      dal.getLibraryTypes().then(
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
        dal.getLibraryTypes().then(
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
        dal.getLibraryTypes(params).then(
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

      it('should contain a libraryType condition if provided', function(done) {
        params.libraryType = 'people';

        dal.getLibraryTypes(params).then(
          function() {
            const expectedValues = [
              params.libraryType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/library_type_id = \$1/);
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

      it('should contain an array of libraryTypes if multiple are provided', function(done) {
        params.libraryType = ['people', 'organization'];

        dal.getLibraryTypes(params).then(
          function() {
            const expectedValues = [
              params.libraryType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /library_type_id = ANY\(\$1::text\[\]\)/
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

      it('should contain a identifierType condition if provided', function(done) {
        params.identifierType = 'face';

        dal.getLibraryTypes(params).then(
          function() {
            const expectedValues = [params.limit, params.offset];
            const sqlMatch = expect.stringMatching(/'face'/);
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
    });

    describe('the result', function() {
      beforeEach(function() {
        params.offset = 10;
        params.limit = 10;
      });

      it('is a pagination envelope', function(done) {
        dal.getLibraryTypes(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + libraryTypeFixtures.length - 1,
              totalResults: libraryTypeFixtures.length,
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

        dal.getLibraryTypes(params).then(
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

      it('contains an array of library types when there is a valid result', function(done) {
        dal.getLibraryTypes(params).then(
          function(result) {
            const expected = Object.assign({}, libraryTypeFixtures[0], {
              entityType: expect.objectContaining(
                libraryTypeFixtures[0].entityType
              )
            });

            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(result.results[0] instanceof model.LibraryType).toBe(true);
            expect(result.results[0]).toEqual(
              expect.objectContaining(expected)
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });
    });
  });

  describe('createLibraryType', function() {
    let libraryType,
      conflict = false;

    beforeEach(function() {
      libraryType = new model.LibraryType(libraryTypeFixtures[0]);

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

      populateResultRows();
    });

    it('should return a promise', function() {
      const promise = dal.createLibraryType(libraryType);
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should throw an exception when missing the libraryType argument', function(done) {
      dal.createLibraryType().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function(done) {
      dal.createLibraryType({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided library model', function(done) {
      const expectedParams = [
        libraryType.libraryTypeId,
        libraryType.label,
        libraryType.iconClass,
        libraryType.entityType.name,
        libraryType.entityType.namePlural,
        JSON.stringify(libraryType.entityType.schema || null)
      ];

      dal.createLibraryType(libraryType).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.library_type/i
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

      dal.createLibraryType(libraryType).then(
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

      dal.createLibraryType(libraryType, clientMock).then(
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

    it('should resolve to the inserted library type model when successful', function(done) {
      jest.spyOn(model.LibraryType, 'fromDB');

      dal.createLibraryType(libraryType).then(
        function(insertedLibraryType) {
          expect(model.LibraryType.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(typeof insertedLibraryType).toBe('object');
          expect(insertedLibraryType instanceof model.LibraryType).toBe(true);
          expect(insertedLibraryType).toEqual(
            expect.objectContaining(libraryType)
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

      dal.createLibraryType(libraryType).then(
        function(insertedLibraryType) {
          expect(insertedLibraryType).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should reject with a ResourceConflictError if the library type exists', function(done) {
      conflict = true;

      dal.createLibraryType(libraryType).then(
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

  describe('updateLibraryType', function() {
    let libraryType;

    beforeEach(function() {
      libraryType = new model.LibraryType(libraryTypeFixtures[0]);
    });

    it('should return a promise', function() {
      const promise = dal.updateLibraryType();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the library argument', function(done) {
      dal.updateLibraryType().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function(done) {
      dal.updateLibraryType({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryType argument is missing libraryTypeId', function(done) {
      libraryType.libraryTypeId = null;

      dal.updateLibraryType(libraryType).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: libraryType.libraryTypeId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided library type model', function(done) {
      const expectedParams = [
        libraryType.label,
        libraryType.iconClass,
        libraryType.entityType.name,
        libraryType.entityType.namePlural,
        JSON.stringify(libraryType.entityType.schema || null),
        libraryType.libraryTypeId
      ];

      dal.updateLibraryType(libraryType).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^UPDATE libraries.library_type/i
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

      dal.updateLibraryType(libraryType).then(
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

      dal.updateLibraryType(libraryType, clientMock).then(
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

    it('should resolve to the updated library type model when successful', function(done) {
      jest.spyOn(model.LibraryType, 'fromDB');

      dal.updateLibraryType(libraryType).then(
        function(updatedLibraryType) {
          expect(model.LibraryType.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(typeof updatedLibraryType).toBe('object');
          expect(updatedLibraryType instanceof model.LibraryType).toBe(true);
          expect(updatedLibraryType).toEqual(
            expect.objectContaining(libraryType)
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

      dal.updateLibraryType(libraryType).then(
        function(updatedLibraryType) {
          expect(updatedLibraryType).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteLibraryType', function() {
    let libraryType;

    beforeEach(function() {
      libraryType = new model.LibraryType(libraryTypeFixtures[0]);
    });

    it('should return a promise', function() {
      const promise = dal.deleteLibraryType();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the library argument', function(done) {
      dal.deleteLibraryType().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function(done) {
      dal.deleteLibraryType({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryTypeId is not set', function(done) {
      libraryType.libraryTypeId = null;

      dal.deleteLibraryType(libraryType).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: libraryType.libraryTypeId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should perform a delete on the record with matching library_type_id', function(done) {
      dal.deleteLibraryType(libraryType).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /DELETE FROM libraries.library_type/i
          );
          const valuesMatch = [libraryType.libraryTypeId];
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

      dal.deleteLibraryType(libraryType).then(
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

      dal.deleteLibraryType(libraryType, clientMock).then(
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
          library_id: libraryTypeFixtures[0].libraryId
        }
      ];

      dal.deleteLibraryType(libraryType).then(
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

  function populateResultRows() {
    resultRows = libraryTypeFixtures.map(function(libraryType) {
      const row = _.mapKeys(libraryType, (value, key) => _.snakeCase(key));
      row.entity_type_name = libraryType.entityType.name;
      row.entity_type_name_plural = libraryType.entityType.namePlural;
      row.total = libraryTypeFixtures.length;
      return row;
    });
  }
});
