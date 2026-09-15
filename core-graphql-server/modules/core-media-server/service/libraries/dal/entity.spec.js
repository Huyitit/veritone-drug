/* global describe, it, expect, beforeEach, spyOn, jasmine */
/* eslint func-names:off,camelcase:off */

// TODO add a eslintrc rule for unit tests to include above settings

'use strict';

const _ = require('lodash');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
const model = require('../model');
jest.mock('./common', () => () => commonDalMock);
const initDal = require('./entity');

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

const entityFixtures = [
  {
    entityId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    name: 'Hillary Clinton',
    profileImageUrl: 'http://pic.jpg',
    description: 'Ol Hilldog',
    metadata: {
      description: 'bla bla bla'
    }
  },
  {
    entityId: '76b56c45-e958-4fef-a729-bfb12e750813',
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    name: 'Donald Drumpf',
    profileImageUrl: 'http://pic.jpg',
    description: 'an idiot',
    metadata: {
      description: 'bla bla bla'
    }
  },
  {
    entityId: 'c4556e04-2795-4151-8693-0e89e78c8d64',
    libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
    name: 'Dollar Shave Club',
    profileImageUrl: 'http://pic.jpg',
    description: 'an ad',
    metadata: {
      description: 'bla bla bla'
    }
  }
];

const libraryFixtures = {
  '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01': {
    libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    version: 1,
    libraryTypeId: 'people',
    name: 'My People',
    description: 'a library of people',
    ownerOrgId: '1234'
  },
  '76b56c45-e958-4fef-a729-bfb12e750813': {
    libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
    version: 2,
    libraryTypeId: 'ad',
    name: 'My Brands',
    description: 'a library of brands',
    ownerOrgId: '1234'
  }
};

const libraryTypeFixtures = {
  people: {
    libraryTypeId: 'people',
    label: 'People',
    iconClass: 'icon-person',
    entityIdentifierTypes: []
  },
  ad: {
    libraryTypeId: 'ad',
    label: 'Ads',
    iconClass: 'icon-org',
    entityIdentifierTypes: []
  }
};

const entityArgErrRegex = /expected [a-z]+ to be an instance of model.Entity/i;

describe('libraries.dal.entity:', function() {
  let dal, failQuery, resultRows, queryError, mockIndex;

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

    mockIndex = { emit: jest.fn() };
    dal = initDal(db, paging, mockIndex);
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
      expect(initDal(db, paging)).toThrowError('searchIndex is required');
    } catch (e) {
      //nothing
    }

    try {
      expect(initDal(db, paging, mockIndex)).not.toThrowError();
    } catch (e) {
      //nothing
    }
  });

  describe('after init', function() {
    beforeEach(function() {
      jest.spyOn(commonDalMock, '_init');
    });

    it('should export an object containing entity functions', function() {
      expect(dal).toEqual({
        getEntities: expect.any(Function),
        createEntity: expect.any(Function),
        updateEntity: expect.any(Function),
        deleteEntities: expect.any(Function),
        getEntityCountByLibrary: expect.any(Function),
        setIsPublishedFlag: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function() {
      //expect(commonDalMock._init).toHaveBeenCalledWith(db);
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getEntities', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2
      };

      resultRows = entityFixtures.map(function(entity) {
        const row = _.mapKeys(entity, (value, key) => _.snakeCase(key));
        const library = libraryFixtures[entity.libraryId];
        const libraryType = libraryTypeFixtures[library.libraryTypeId];

        Object.assign(
          row,
          { total: entityFixtures.length },
          _.mapKeys(library, (value, key) => 'l__' + _.snakeCase(key)),
          _.mapKeys(libraryType, (value, key) => 'lt__' + _.snakeCase(key))
        );

        delete row.library_id;
        delete row.l__library_type_id;

        return row;
      });
    });

    it('should return a promise', function() {
      const promise = dal.getEntities();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getEntities().then(
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

      dal.getEntities().then(
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
        dal.getEntities().then(
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
        dal.getEntities(params).then(
          function() {
            const expectedValues = [params.limit, params.offset];
            const sqlMatch = expect.stringMatching(/LIMIT \$1\s+OFFSET \$2/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
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
        params.identifierType = 'people';

        dal.getEntities(params).then(
          function() {
            const expectedValues = [
              params.identifierType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /entity_identifier_type_id = \$1/
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
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

      it('should contain an array of identifierTypes if multiple are provided', function(done) {
        params.identifierType = ['people', 'ad'];

        dal.getEntities(params).then(
          function() {
            const expectedValues = [
              params.identifierType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /entity_identifier_type_id = ANY\(\$1::text\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
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
        params.libraryId = 'a1';

        dal.getEntities(params).then(
          function() {
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
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of libraryIds if multiple are provided', function(done) {
        params.libraryId = ['a1', 'b2'];

        dal.getEntities(params).then(
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
              expect.any(String),
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

      it('should contain an entityId condition if provided', function(done) {
        params.entityId = '1234';

        dal.getEntities(params).then(
          function() {
            const expectedValues = [
              params.entityId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/entity_id = \$1/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
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

      it('should contain an array of entityIds if multiple are provided', function(done) {
        params.entityId = ['1234', '4321'];

        dal.getEntities(params).then(
          function() {
            const expectedValues = [
              params.entityId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /entity_id = ANY\(\$1::uuid\[\]\)/
            );
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
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

      it('should contain a name condition if provided', function(done) {
        params.name = 'test';

        dal.getEntities(params).then(
          function() {
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
        dal.getEntities(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + entityFixtures.length - 1,
              totalResults: entityFixtures.length,
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

        dal.getEntities(params).then(
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

      it('contains an array of entities when there is a valid result', function(done) {
        dal.getEntities(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(result.results[0] instanceof model.Entity).toBe(true);
            expect(result.results[0].entityId).toEqual(
              entityFixtures[0].entityId
            );
            expect(result.results[0].name).toEqual(entityFixtures[0].name);
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('contains entities with an embedded Library -> LibraryType models', function(done) {
        const library = libraryFixtures[entityFixtures[0].libraryId];
        const libraryType = libraryTypeFixtures[library.libraryTypeId];

        dal.getEntities(params).then(
          function(result) {
            expect(result.results[0].libraryId).toBeUndefined();
            expect(result.results[0].library).toBeDefined();
            expect(result.results[0].library instanceof model.Library).toBe(
              true
            );
            expect(result.results[0].library).toEqual(
              expect.objectContaining({
                libraryId: library.libraryId,
                name: library.name
              })
            );
            expect(result.results[0].library.libraryTypeId).toBeUndefined();
            expect(result.results[0].library.libraryType).toBeDefined();
            expect(
              result.results[0].library.libraryType instanceof model.LibraryType
            ).toBe(true);
            expect(result.results[0].library.libraryType).toEqual(
              expect.objectContaining(libraryType)
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

  describe('createEntity', function() {
    let entity,
      conflict = false;

    beforeEach(function() {
      entity = new model.Entity(entityFixtures[0]);

      queryStub.mockImplementation(function() {
        return new Promise(function(resolve) {
          if (failQuery) {
            throw queryError;
          }

          if (conflict) {
            const err = new Error('unique constraint violation');
            err.constraint = '_fk_library_id,name';
            throw new ResourceConflictError(err);
          }

          resolve(resultRows);
        });
      });
    });

    it('should return a promise', function() {
      const promise = dal.createEntity();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entity argument', function(done) {
      dal.createEntity().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityArgErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entity argument is of the wrong type', function(done) {
      dal.createEntity({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityArgErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided entity model', function(done) {
      const expectedParams = [
        entity.entityId,
        entity.libraryId,
        entity.name,
        entity.profileImageUrl.toString(),
        entity.description,
        JSON.stringify(entity.metadata),
        expect.any(Number),
        expect.any(Number)
      ];

      dal.createEntity(entity).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.entity/i
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

      dal.createEntity(entity).then(
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

      dal.createEntity(entity, clientMock).then(
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

    it('should resolve to the inserted entity model when successful', function(done) {
      jest.spyOn(model.Entity, 'fromDB');

      resultRows = [
        _.mapKeys(entityFixtures[0], (value, key) => _.snakeCase(key))
      ];

      dal.createEntity(entity).then(
        function(insertedEntity) {
          expect(model.Entity.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(insertedEntity instanceof model.Entity).toBe(true);
          expect(insertedEntity).toEqual(
            expect.objectContaining({
              entityId: entity.entityId,
              libraryId: entity.libraryId,
              profileImageUrl: expect.any(Object),
              name: entity.name,
              metadata: entity.metadata
            })
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

      dal.createEntity(entity).then(
        function(insertedEntity) {
          expect(insertedEntity).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should reject with a ResourceConflictError if the entity already exists in the library', function(done) {
      conflict = true;

      dal.createEntity(entity).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (
            err instanceof ResourceConflictError &&
            err.message ==
              'An entity of the same name already exists in this library.'
          ) {
            return done();
          }

          done(new Error(`Unexpected rejection: ${JSON.stringify(err)}`));
        }
      );
    });
  });

  describe('updateEntity', function() {
    let entity;

    beforeEach(function() {
      entity = new model.Entity(entityFixtures[0]);
    });

    it('should return a promise', function() {
      const promise = dal.updateEntity();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entity argument', function(done) {
      dal.updateEntity().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityArgErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entity argument is of the wrong type', function(done) {
      dal.updateEntity({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityArgErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityId is not set', function(done) {
      entity.entityId = null;

      dal.updateEntity(entity).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: entity.entityId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided entity model', function(done) {
      const expectedParams = [
        entity.libraryId,
        entity.name,
        entity.profileImageUrl.toString(),
        entity.description,
        JSON.stringify(entity.metadata),
        false,
        expect.any(Number),
        entity.entityId
      ];

      dal.updateEntity(entity).then(
        function() {
          const sqlMatch = expect.stringMatching(/^UPDATE libraries.entity/i);
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

      dal.updateEntity(entity).then(
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

      dal.updateEntity(entity, clientMock).then(
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

    it('should resolve to the updated entity model when successful', function(done) {
      jest.spyOn(model.Entity, 'fromDB');

      resultRows = [
        _.mapKeys(entityFixtures[0], (value, key) => _.snakeCase(key))
      ];

      dal.updateEntity(entity).then(
        function(updatedEntity) {
          expect(model.Entity.fromDB).toHaveBeenCalledWith(resultRows[0]);
          expect(updatedEntity instanceof model.Entity).toBe(true);
          expect(updatedEntity).toEqual(
            expect.objectContaining({
              entityId: entity.entityId,
              libraryId: entity.libraryId,
              profileImageUrl: expect.any(Object),
              name: entity.name,
              metadata: entity.metadata
            })
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

      dal.updateEntity(entity).then(
        function(updatedEntity) {
          expect(updatedEntity).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteEntities', function() {
    let entity;

    beforeEach(function() {
      entity = new model.Entity(entityFixtures[0]);
    });

    it('should return a promise', function() {
      const promise = dal.deleteEntities();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entity argument', function(done) {
      dal.deleteEntities().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityArgErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entity argument is of the wrong type', function(done) {
      dal.deleteEntities({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityArgErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise if none of the required query params are present', function(done) {
      entity.entityId = null;
      entity.libraryId = null;

      dal.deleteEntities(entity).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (/is required/.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should perform a soft delete', function(done) {
      dal.deleteEntities(entity).then(
        function() {
          const sqlMatch = expect.stringMatching(/SET deleted_date_time =/i);
          const valuesMatch = [expect.any(Number), expect.any(String)];
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

    it('should include a condition for entity_id if provided the entityId param', function(done) {
      dal.deleteEntities(entity).then(
        function() {
          const sqlMatch = expect.stringMatching(/entity_id =/);
          const valuesMatch = [expect.any(Number), entity.entityId];
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

    it('should include a condition for library_id if provided the libraryId param and not entityId', function(done) {
      entity.entityId = null;

      dal.deleteEntities(entity).then(
        function() {
          let sqlMatch = expect.stringMatching(/library_id =/);
          const valuesMatch = [expect.any(Number), entity.libraryId];
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

      dal.deleteEntities(entity).then(
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

      dal.deleteEntities(entity, clientMock).then(
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
          entity_id: entityFixtures[0].entityId
        }
      ];

      dal.deleteEntities(entity).then(
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

  describe('getEntityCountByLibrary', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2,
        libraryId: ['xxxxx', 'yyyyy']
      };

      resultRows = [
        {
          total: 2,
          library_id: params.libraryId[0],
          entity_count: 4
        },
        {
          total: 2,
          library_id: params.libraryId[1],
          entity_count: 1
        }
      ];
    });

    it('should return a promise', function() {
      const promise = dal.getEntityCountByLibrary();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getEntityCountByLibrary().then(
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

      dal.getEntityCountByLibrary().then(
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
        dal.getEntityCountByLibrary().then(
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
        dal.getEntityCountByLibrary({ limit: 20, offset: 40 }).then(
          function() {
            const expectedValues = [20, 40];
            const sqlMatch = expect.stringMatching(/LIMIT \$1\s+OFFSET \$2/);
            expect(queryStub).toHaveBeenCalledWith(
              expect.any(String),
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

        dal.getEntityCountByLibrary(params).then(
          function() {
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
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should contain an array of libraryId if multiple are provided', function(done) {
        dal.getEntityCountByLibrary(params).then(
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
              expect.any(String),
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
        params.libraryId = null;
        params.ownerOrgId = 1234;

        dal.getEntityCountByLibrary(params).then(
          function() {
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
        dal.getEntityCountByLibrary(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + params.libraryId.length - 1,
              totalResults: params.libraryId.length,
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

        dal.getEntityCountByLibrary(params).then(
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

      it('contains an array of entity summary models when there is a valid result', function(done) {
        dal.getEntityCountByLibrary(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(2);

            expect(result.results[0] instanceof model.LibrarySummary).toBe(
              true
            );
            expect(result.results[0].libraryId).toEqual(params.libraryId[0]);
            expect(typeof result.results[0].entityCount).toEqual('number');
            expect(result.results[0].entityCount).toEqual(4);

            expect(result.results[1] instanceof model.LibrarySummary).toBe(
              true
            );
            expect(result.results[1].libraryId).toEqual(params.libraryId[1]);
            expect(typeof result.results[1].entityCount).toEqual('number');
            expect(result.results[1].entityCount).toEqual(1);

            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });
    });
  });
});
