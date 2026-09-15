/* global describe, it, expect, beforeEach, spyOn, jasmine */
/* eslint func-names:off,camelcase:off */

// TODO add a eslintrc rule for unit tests to include above settings

'use strict';

const _ = require('lodash');
const model = require('../model');
jest.mock('./common', () => () => commonDalMock);
const initDal = require('./library');

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

const searchIndexMock = {
  emit: _.noop
};

const libraryFixtures = [
  {
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    version: 1,
    libraryTypeId: 'people',
    name: 'My People',
    description: 'a library of people',
    ownerOrgId: '1234'
  },
  {
    libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
    version: 2,
    libraryTypeId: 'organization',
    name: 'My Brands',
    description: 'a library of brands',
    ownerOrgId: '1234'
  }
];

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

const libraryCollaboratorFixtures = [
  {
    collaboratorOrgId: 1234,
    status: 'active',
    permissions: ['view']
  }
];

const libraryArgErr =
  'Error: expected library to be an instance of model.Library';

describe('libraries.dal.library:', function () {
  let dal, failQuery, resultRows, queryError;

  beforeEach(function () {

    failQuery = false;
    queryError = new Error('i failed');

    queryStub = jest.fn().mockImplementation(function () {
      return new Promise(function (resolve) {
        if (failQuery) {
          throw queryError;
        }

        resolve(resultRows);
      });
    });

    jest.spyOn(paging, 'enforceParams');
    jest.spyOn(paging, 'toPaginationEnvelope');
    searchIndexMock.emit = jest.fn();
    dal = initDal(db, paging, searchIndexMock);
  });

  it('should return a function', function () {
    expect(initDal).toEqual(expect.any(Function));
  });

  it('should throw an error if any arguments are missing', function () {
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

  describe('after init', function () {
    beforeEach(function () {
      jest.spyOn(commonDalMock, '_init');
    });

    it('should export an object containing library functions', function () {
      expect(dal).toEqual({
        getLibraries: expect.any(Function),
        createLibrary: expect.any(Function),
        updateLibrary: expect.any(Function),
        deleteLibrary: expect.any(Function),
        incrementVersion: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function () {
      //expect(commonDalMock._init).toHaveBeenCalledWith(db);
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getLibraries', function () {
    let params;

    beforeEach(function () {
      params = {
        offset: 0,
        limit: 2
      };

      populateResultRows(false);
    });

    it('should return a promise', function () {
      const promise = dal.getLibraries();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function (done) {
      dal.getLibraries().then(
        function () {
          expect(queryStub).toHaveBeenCalledWith(
            db.read,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function (done) {
      failQuery = true;

      dal.getLibraries().then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    describe('the query', function () {
      it('should use the default paging params when called without arguments', function (done) {
        dal.getLibraries().then(
          function () {
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
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should use the provided paging params when set', function (done) {
        dal.getLibraries(params).then(
          function () {
            const expectedValues = [params.limit, params.offset];
            const sqlMatch = expect.stringMatching(/LIMIT \$1\s+OFFSET \$2/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a libraryType condition if provided', function (done) {
        params.libraryType = 'people';

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              params.libraryType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/library_type_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of libraryTypes if multiple are provided', function (done) {
        params.libraryType = ['people', 'organization'];

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              params.libraryType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /library_type_id = ANY\(\$1::text\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a libraryId condition if provided', function (done) {
        params.libraryId = 'a1';

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              params.libraryId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/library_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of libraryIds if multiple are provided', function (done) {
        params.libraryId = ['a1', 'b2'];

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              params.libraryId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /library_id = ANY\(\$1::uuid\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an ownerOrgId condition if provided', function (done) {
        params.ownerOrgId = 1234;

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              params.ownerOrgId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/owner_org_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of ownerOrgIds if multiple are provided', function (done) {
        params.ownerOrgId = [1234, 4321];

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              params.ownerOrgId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /owner_org_id = ANY\(\$1::int\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a name condition if provided', function (done) {
        params.name = 'test';

        dal.getLibraries(params).then(
          function () {
            const expectedValues = [
              '%' + params.name + '%',
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/name ILIKE lower\(\$1\)/i);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValues
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain a condition for owner_org_id and collaborator_org_id if the orgId param is provided', function (done) {
        params.orgId = 1234;

        dal.getLibraries(params).then(
          function () {
            const expectedValuesMatch = expect.arrayContaining([params.orgId]);
            let sqlMatch = expect.stringMatching(
              /LEFT JOIN libraries.library_collaborator/i
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValuesMatch
            );

            sqlMatch = expect.stringMatching(/owner_org_id =/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValuesMatch
            );

            sqlMatch = expect.stringMatching(/collaborator_org_id =/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValuesMatch
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain include the specified library collaborator if includes.collaborator is provided', function (done) {
        const includes = {
          collaborator: libraryCollaboratorFixtures[0].collaboratorOrgId
        };

        dal.getLibraries(params, includes).then(
          function () {
            const expectedValuesMatch = expect.arrayContaining([
              libraryCollaboratorFixtures[0].collaboratorOrgId
            ]);
            let sqlMatch = expect.stringMatching(
              /LEFT JOIN libraries.library_collaborator/i
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
              sqlMatch,
              expectedValuesMatch
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });
    });

    describe('the result', function () {
      beforeEach(function () {
        params.offset = 10;
        params.limit = 10;
      });

      it('is a pagination envelope', function (done) {
        dal.getLibraries(params).then(
          function (result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + libraryFixtures.length - 1,
              totalResults: libraryFixtures.length,
              results: expect.any(Array)
            });

            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains an empty array if there are no results', function (done) {
        resultRows = [];

        dal.getLibraries(params).then(
          function (result) {
            expect(typeof result).toEqual('object');
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(0);
            expect(result.totalResults).toEqual(0);
            expect(result.from).toEqual(10);
            expect(result.to).toEqual(10);
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains an array of libraries when there is a valid result', function (done) {
        dal.getLibraries(params).then(
          function (result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(result.results[0] instanceof model.Library).toBe(true);
            expect(result.results[0].libraryId).toEqual(
              libraryFixtures[0].libraryId
            );
            expect(result.results[0].name).toEqual(libraryFixtures[0].name);
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains libraries with an embedded LibraryType model', function (done) {
        dal.getLibraries(params).then(
          function (result) {
            const libraryType =
              libraryTypeFixtures[libraryFixtures[0].libraryTypeId];
            expect(result.results[0].libraryTypeId).toBeUndefined();
            expect(result.results[0].libraryType).toBeDefined();
            expect(
              result.results[0].libraryType instanceof model.LibraryType
            ).toBe(true);
            expect(result.results[0].libraryType).toEqual(
              expect.objectContaining(libraryType)
            );
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an embedded library collaborator model if includes.collaborator is provided', function (done) {
        populateResultRows(true);
        const includes = { collaborator: 1234 };

        dal.getLibraries(params, includes).then(
          function (result) {
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results[0].collaborator).toBeDefined();
            expect(
              result.results[0].collaborator instanceof
                model.LibraryCollaborator
            ).toBe(true);
            done();
          },
          function (err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });
    });

    function populateResultRows(includeCollaborator) {
      resultRows = libraryFixtures.map(function (library) {
        const row = _.mapKeys(library, (value, key) => _.snakeCase(key));
        const libraryType = libraryTypeFixtures[library.libraryTypeId];

        Object.assign(
          row,
          { total: libraryFixtures.length },
          _.mapKeys(libraryType, (value, key) => 'lt__' + _.snakeCase(key))
        );

        if (includeCollaborator) {
          Object.assign(
            row,
            _.mapKeys(
              libraryCollaboratorFixtures[0],
              (value, key) => 'lc__' + _.snakeCase(key)
            )
          );
        }

        return row;
      });
    }
  });

  describe('createLibrary', function () {
    let library;

    beforeEach(function () {
      library = new model.Library(libraryFixtures[0]);
    });

    it('should return a promise', function () {
      const promise = dal.createLibrary();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the library argument', function (done) {
      dal.createLibrary().then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function (done) {
      dal.createLibrary({}).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided library model', function (done) {
      const expectedParams = [
        library.libraryId,
        library.name,
        library.ownerOrgId,
        library.libraryTypeId,
        library.coverImageUrl,
        library.description,
        expect.any(Number),
        expect.any(Number)
      ];

      dal.createLibrary(library).then(
        function () {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.library/i
          );
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            expectedParams
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function (done) {
      failQuery = true;

      dal.createLibrary(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function (done) {
      const clientMock = {};

      dal.createLibrary(library, clientMock).then(
        function () {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the inserted library model when successful', function (done) {
      jest.spyOn(model.Library, 'fromDB');

      resultRows = [
        _.mapKeys(libraryFixtures[0], (value, key) => _.snakeCase(key))
      ];

      dal.createLibrary(library).then(
        function (insertedLibrary) {
          expect(model.Library.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(typeof insertedLibrary).toBe('object');
          expect(insertedLibrary instanceof model.Library).toBe(true);
          expect(insertedLibrary).toEqual(expect.objectContaining(library));
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to null when no results are returned by the query', function (done) {
      resultRows = [];

      dal.createLibrary(library).then(
        function (insertedLibrary) {
          expect(insertedLibrary).toBe(null);
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('updateLibrary', function () {
    let library;

    beforeEach(function () {
      library = new model.Library(libraryFixtures[0]);
    });

    it('should return a promise', function () {
      const promise = dal.updateLibrary();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the library argument', function (done) {
      dal.updateLibrary().then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function (done) {
      dal.updateLibrary({}).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryId is not set', function (done) {
      library.libraryId = null;

      dal.updateLibrary(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == 'Error: library.libraryId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided library model', function (done) {
      const expectedParams = [
        library.name,
        library.libraryTypeId,
        library.coverImageUrl,
        library.description,
        expect.any(Number),
        library.libraryId
      ];

      dal.updateLibrary(library).then(
        function () {
          const sqlMatch = expect.stringMatching(/^UPDATE libraries.library/i);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            expectedParams
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function (done) {
      failQuery = true;

      dal.updateLibrary(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function (done) {
      const clientMock = {};

      dal.updateLibrary(library, clientMock).then(
        function () {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the updated library model when successful', function (done) {
      jest.spyOn(model.Library, 'fromDB');

      resultRows = [
        _.mapKeys(libraryFixtures[0], (value, key) => _.snakeCase(key))
      ];

      dal.updateLibrary(library).then(
        function (updatedLibrary) {
          expect(model.Library.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(typeof updatedLibrary).toBe('object');
          expect(updatedLibrary instanceof model.Library).toBe(true);
          expect(updatedLibrary).toEqual(expect.objectContaining(library));
          expect(searchIndexMock.emit).toHaveBeenCalled();
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to null when no results are returned by the query', function (done) {
      resultRows = [];

      dal.updateLibrary(library).then(
        function (updatedLibrary) {
          expect(updatedLibrary).toBe(null);
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteLibrary', function () {
    let library;

    beforeEach(function () {
      library = new model.Library(libraryFixtures[0]);
    });

    it('should return a promise', function () {
      const promise = dal.deleteLibrary();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the library argument', function (done) {
      dal.deleteLibrary().then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function (done) {
      dal.deleteLibrary({}).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryId is not set', function (done) {
      library.libraryId = null;

      dal.deleteLibrary(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == 'Error: library.libraryId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should perform a soft delete on the record with matching library_id', function (done) {
      dal.deleteLibrary(library).then(
        function () {
          const sqlMatch = expect.stringMatching(/SET deleted_date_time =/i);
          const valuesMatch = [expect.any(Number), library.libraryId];
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function (done) {
      failQuery = true;

      dal.deleteLibrary(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function (done) {
      const clientMock = {};

      dal.deleteLibrary(library, clientMock).then(
        function () {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the number of rows deleted when successful', function (done) {
      resultRows = [
        {
          library_id: libraryFixtures[0].libraryId
        }
      ];

      dal.deleteLibrary(library).then(
        function (rowsDeleted) {
          expect(typeof rowsDeleted).toBe('number');
          expect(rowsDeleted).toEqual(1);
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('incrementVersion', function () {
    let library;

    beforeEach(function () {
      library = new model.Library(libraryFixtures[0]);
    });

    it('should return a promise', function () {
      const promise = dal.deleteLibrary();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the library argument', function (done) {
      dal.incrementVersion().then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the library argument is of the wrong type', function (done) {
      dal.incrementVersion({}).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == libraryArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryId is not set', function (done) {
      library.libraryId = null;

      dal.incrementVersion(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          if (err == 'Error: library.libraryId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should perform an update on the version field of the record with matching library_id', function (done) {
      dal.incrementVersion(library).then(
        function () {
          const sqlMatch = expect.stringMatching(
            /SET version = version \+ 1/i
          );
          const valuesMatch = [expect.any(Number), library.libraryId];
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should return a rejected promise if the query fails', function (done) {
      failQuery = true;

      dal.incrementVersion(library).then(
        function () {
          done(new Error('expected promise to be rejected'));
        },
        function (err) {
          expect(queryStub).toHaveBeenCalled();

          if (err == queryError) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should call the query method with the a client object when provided', function (done) {
      const clientMock = {};

      dal.incrementVersion(library, clientMock).then(
        function () {
          expect(queryStub).toHaveBeenCalledWith(
            clientMock,
            expect.any(String),
            expect.any(Array)
          );
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to the updated library model when successful', function (done) {
      jest.spyOn(model.Library, 'fromDB');

      resultRows = [
        {
          library_id: libraryFixtures[0].libraryId,
          library_type_id: libraryFixtures[0].libraryTypeId,
          owner_org_id: libraryFixtures[0].ownerOrgId,
          name: libraryFixtures[0].name,
          description: libraryFixtures[0].description
        }
      ];

      dal.updateLibrary(library).then(
        function (updatedLibrary) {
          expect(model.Library.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(typeof updatedLibrary).toBe('object');
          expect(updatedLibrary instanceof model.Library).toBe(true);

          expect(updatedLibrary).toEqual(
            expect.objectContaining({
              libraryId: library.libraryId,
              libraryTypeId: library.libraryTypeId,
              ownerOrgId: library.ownerOrgId,
              name: library.name,
              description: library.description
            })
          );

          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should resolve to null when no results are returned by the query', function (done) {
      resultRows = [];

      dal.incrementVersion(library).then(
        function (updatedLibrary) {
          expect(updatedLibrary).toBe(null);
          done();
        },
        function (err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });
});

describe('getLibraries — last_trained_date_time orderBy (TODO row #4)', function () {
  let dal;

  beforeEach(function () {
    queryStub = jest.fn().mockResolvedValue([]);
    dal = initDal(db, paging, searchIndexMock);
  });

  // getLibraries issues a single query: query(conn.read, sql, values)
  function sqlFor(params) {
    return dal.getLibraries(params).then(function () {
      return queryStub.mock.calls[0][1];
    });
  }

  it('builds the MAX(lem.created_date_time) subquery from library_engine_model', function () {
    return sqlFor({ orderBy: 'last_trained_date_time' }).then(function (sql) {
      expect(sql).toMatch(/SELECT\s+MAX\(lem\.created_date_time\)/);
      expect(sql).toMatch(/library_engine_model lem/);
      expect(sql).toMatch(/lem\.library_id = l\.library_id/);
      expect(sql).toMatch(/lem\.deleted_date_time IS NULL/);
      expect(sql).toMatch(/lem\.train_status = 'complete'/);
      expect(sql).toMatch(/NULLS LAST/);
    });
  });

  it('orders the last-trained subquery DESC when orderDesc is set', function () {
    return sqlFor({ orderBy: 'last_trained_date_time', orderDesc: true }).then(function (sql) {
      expect(sql).toMatch(/\)\s*DESC NULLS LAST/);
    });
  });

  it('orders the last-trained subquery ASC by default', function () {
    return sqlFor({ orderBy: 'last_trained_date_time' }).then(function (sql) {
      expect(sql).toMatch(/\)\s*ASC NULLS LAST/);
    });
  });

  it('does NOT emit the last-trained subquery for a normal orderBy', function () {
    return sqlFor({ orderBy: 'name' }).then(function (sql) {
      expect(sql).not.toMatch(/library_engine_model lem/);
      expect(sql).toMatch(/ORDER BY l\.name ASC/);
    });
  });
});
