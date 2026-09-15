/* global describe, it, expect, beforeEach, spyOn, jasmine */
/* eslint func-names:off,camelcase:off */

// TODO add a eslintrc rule for unit tests to include above settings

'use strict';

const _ = require('lodash');
const model = require('../model');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
jest.mock('./common', () => () => commonDalMock);
const initDal = require('./library-collaborator');

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

const libraryCollaboratorFixtures = [
  {
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    collaboratorOrgId: 1234,
    status: 'active',
    permissions: ['view', 'edit']
  },
  {
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    collaboratorOrgId: 5678,
    status: 'active',
    permissions: ['view']
  },
  {
    libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
    collaboratorOrgId: 1234,
    status: 'active',
    permissions: ['view']
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

const libraryCollaboratorArgErr =
  'Error: expected libraryCollaborator to be an instance of model.LibraryCollaborator';

describe('libraries.dal.library-collaborator:', function() {
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

    it('should export an object containing library collaborator CRUD functions', function() {
      expect(dal).toEqual({
        getLibraryCollaborators: expect.any(Function),
        createLibraryCollaborator: expect.any(Function),
        updateLibraryCollaborator: expect.any(Function),
        deleteLibraryCollaborators: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function() {
      //expect(commonDalMock._init).toHaveBeenCalledWith(db);
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getLibraryCollaborators', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2
      };

      resultRows = libraryCollaboratorFixtures.map(function(
        libraryCollaborator
      ) {
        const row = _.mapKeys(libraryCollaborator, (value, key) =>
          _.snakeCase(key)
        );
        const library = libraryFixtures[libraryCollaborator.libraryId];
        const libraryType = libraryTypeFixtures[library.libraryTypeId];

        Object.assign(
          row,
          { total: libraryCollaboratorFixtures.length },
          _.mapKeys(library, (value, key) => 'l__' + _.snakeCase(key)),
          _.mapKeys(libraryType, (value, key) => 'lt__' + _.snakeCase(key))
        );

        delete row.library_id;
        delete row.l__library_type_id;

        return row;
      });
    });

    it('should return a promise', function() {
      const promise = dal.getLibraryCollaborators();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getLibraryCollaborators().then(
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

      dal.getLibraryCollaborators().then(
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
        dal.getLibraryCollaborators().then(
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
        dal.getLibraryCollaborators(params).then(
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

      it('should contain a libraryId condition if provided', function(done) {
        params.libraryId = 'xxxxx';

        dal.getLibraryCollaborators(params).then(
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

        dal.getLibraryCollaborators(params).then(
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

      it('should contain a ownerOrgId condition if provided', function(done) {
        params.ownerOrgId = 1234;

        dal.getLibraryCollaborators(params).then(
          function() {
            const expectedValues = [
              params.ownerOrgId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/owner_org_id = \$1/);
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

      it('should contain an array of ownerOrgIds if multiple are provided', function(done) {
        params.ownerOrgId = [1234, 4321];

        dal.getLibraryCollaborators(params).then(
          function() {
            const expectedValues = [
              params.ownerOrgId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /owner_org_id = ANY\(\$1::int\[\]\)/
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

      it('should contain a collaboratorOrgId condition if provided', function(done) {
        params.collaboratorOrgId = 1234;

        dal.getLibraryCollaborators(params).then(
          function() {
            const expectedValues = [
              params.collaboratorOrgId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /collaborator_org_id = \$1/
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

      it('should contain an array of collaboratorOrgIds if multiple are provided', function(done) {
        params.collaboratorOrgId = [1234, 4321];

        dal.getLibraryCollaborators(params).then(
          function() {
            const expectedValues = [
              params.collaboratorOrgId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /collaborator_org_id = ANY\(\$1::int\[\]\)/
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

      it('should contain a permissionType condition if provided', function(done) {
        params.permissionType = ['view'];

        dal.getLibraryCollaborators(params).then(
          function() {
            const expectedValues = [
              JSON.stringify(params.permissionType),
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/permissions <@/);
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

      it('should cast the permissionType param to an array if it isnt one', function(done) {
        params.permissionType = 'view';

        dal.getLibraryCollaborators(params).then(
          function() {
            const expectedValues = [
              JSON.stringify([params.permissionType]),
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/permissions <@/);
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
        dal.getLibraryCollaborators(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + libraryCollaboratorFixtures.length - 1,
              totalResults: libraryCollaboratorFixtures.length,
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

        dal.getLibraryCollaborators(params).then(
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

      it('contains an array of library collaborators when there is a valid result', function(done) {
        dal.getLibraryCollaborators(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(result.results[0] instanceof model.LibraryCollaborator).toBe(
              true
            );
            expect(result.results[0].collaboratorOrgId).toEqual(
              libraryCollaboratorFixtures[0].collaboratorOrgId
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains library collaborators with nested library -> libraryType models', function(done) {
        dal
          .getLibraryCollaborators(params)
          .then(function(result) {
            const expectedLibrary =
              libraryFixtures[libraryCollaboratorFixtures[0].libraryId];
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

  describe('createLibraryCollaborator', function() {
    let libraryCollaborator,
      conflict = false;

    beforeEach(function() {
      libraryCollaborator = new model.LibraryCollaborator(
        libraryCollaboratorFixtures[0]
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
      const promise = dal.createLibraryCollaborator();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the libraryCollaborator argument', function(done) {
      dal.createLibraryCollaborator().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryCollaboratorArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryCollaborator argument is of the wrong type', function(done) {
      dal.createLibraryCollaborator({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryCollaboratorArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided libraryCollaborator model', function(done) {
      const expectedParams = [
        libraryCollaborator.libraryId,
        libraryCollaborator.collaboratorOrgId,
        JSON.stringify(libraryCollaborator.permissions),
        libraryCollaborator.status,
        expect.any(Number),
        expect.any(Number)
      ];

      dal.createLibraryCollaborator(libraryCollaborator).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.library_collaborator/i
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

      dal.createLibraryCollaborator(libraryCollaborator).then(
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

      dal.createLibraryCollaborator(libraryCollaborator, clientMock).then(
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

    it('should resolve to the inserted library collaborator model when successful', function(done) {
      jest.spyOn(model.LibraryCollaborator, 'fromDB');

      resultRows = [
        _.mapKeys(libraryCollaboratorFixtures[0], (value, key) =>
          _.snakeCase(key)
        )
      ];

      dal.createLibraryCollaborator(libraryCollaborator).then(
        function(insertedLibraryCollaborator) {
          expect(model.LibraryCollaborator.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(
            insertedLibraryCollaborator instanceof model.LibraryCollaborator
          ).toBe(true);
          expect(insertedLibraryCollaborator).toEqual(
            expect.objectContaining(libraryCollaborator)
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

      dal.createLibraryCollaborator(libraryCollaborator).then(
        function(insertedLibraryCollaborator) {
          expect(insertedLibraryCollaborator).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should reject with a ResourceConflictError if the library collaborator exists', function(done) {
      conflict = true;

      dal.createLibraryCollaborator(libraryCollaborator).then(
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

  describe('updateLibraryCollaborator', function() {
    let libraryCollaborator;

    beforeEach(function() {
      libraryCollaborator = new model.LibraryCollaborator(
        libraryCollaboratorFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.updateLibraryCollaborator();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the libraryCollaborator argument', function(done) {
      dal.updateLibraryCollaborator().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryCollaboratorArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryCollaborator argument is of the wrong type', function(done) {
      dal.updateLibraryCollaborator({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryCollaboratorArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryCollaborator argument is missing libraryId', function(done) {
      libraryCollaborator.libraryId = null;

      dal.updateLibraryCollaborator(libraryCollaborator).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: libraryCollaborator.libraryId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryCollaborator argument is missing collaboratorOrgId', function(done) {
      libraryCollaborator.collaboratorOrgId = null;

      dal.updateLibraryCollaborator(libraryCollaborator).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (
            err == 'Error: libraryCollaborator.collaboratorOrgId is required'
          ) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided library collaborator model', function(done) {
      const expectedParams = [
        JSON.stringify(libraryCollaborator.permissions),
        libraryCollaborator.status,
        expect.any(Number),
        libraryCollaborator.libraryId,
        libraryCollaborator.collaboratorOrgId
      ];

      dal.updateLibraryCollaborator(libraryCollaborator).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^UPDATE libraries.library_collaborator/i
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

      dal.updateLibraryCollaborator(libraryCollaborator).then(
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

      dal.updateLibraryCollaborator(libraryCollaborator, clientMock).then(
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

    it('should resolve to the updated library collaborator model when successful', function(done) {
      jest.spyOn(model.LibraryCollaborator, 'fromDB');

      resultRows = [
        _.mapKeys(libraryCollaboratorFixtures[0], (value, key) =>
          _.snakeCase(key)
        )
      ];

      dal.updateLibraryCollaborator(libraryCollaborator).then(
        function(updatedLibraryCollaborator) {
          expect(model.LibraryCollaborator.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(
            updatedLibraryCollaborator instanceof model.LibraryCollaborator
          ).toBe(true);
          expect(updatedLibraryCollaborator).toEqual(
            expect.objectContaining(libraryCollaborator)
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

      dal.updateLibraryCollaborator(libraryCollaborator).then(
        function(updatedLibraryCollaborator) {
          expect(updatedLibraryCollaborator).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteLibraryCollaborators', function() {
    let libraryCollaborator;

    beforeEach(function() {
      libraryCollaborator = new model.LibraryCollaborator(
        libraryCollaboratorFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.deleteLibraryCollaborators();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the libraryCollaborator argument', function(done) {
      dal.deleteLibraryCollaborators().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryCollaboratorArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the libraryCollaborator argument is of the wrong type', function(done) {
      dal.deleteLibraryCollaborators({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == libraryCollaboratorArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when neither libraryId nor collaboratorOrgId are not set', function(done) {
      libraryCollaborator.libraryId = null;
      libraryCollaborator.collaboratorOrgId = null;

      dal.deleteLibraryCollaborators(libraryCollaborator).then(
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

    it('should perform a soft delete on all records with matching libraryId if provided', function(done) {
      libraryCollaborator.collaboratorOrgId = null;
      dal.deleteLibraryCollaborators(libraryCollaborator).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryCollaborator.libraryId
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

    it('should perform a soft delete on all records with matching collaboratorOrgId if provided', function(done) {
      libraryCollaborator.libraryId = null;
      dal.deleteLibraryCollaborators(libraryCollaborator).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryCollaborator.collaboratorOrgId
          ];
          let sqlMatch = expect.stringMatching(/SET deleted_date_time = /i);
          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/collaborator_org_id = /);
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

    it('should perform a soft delete on all records with matching libraryId and collaboratorOrgId if provided', function(done) {
      dal.deleteLibraryCollaborators(libraryCollaborator).then(
        function() {
          const valuesMatch = [
            expect.any(Number),
            libraryCollaborator.collaboratorOrgId,
            libraryCollaborator.libraryId
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

          sqlMatch = expect.stringMatching(/collaborator_org_id = /);
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

      dal.deleteLibraryCollaborators(libraryCollaborator).then(
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

      dal.deleteLibraryCollaborators(libraryCollaborator, clientMock).then(
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
          library_id: libraryCollaboratorFixtures[0].libraryId
        }
      ];

      dal.deleteLibraryCollaborators(libraryCollaborator).then(
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
