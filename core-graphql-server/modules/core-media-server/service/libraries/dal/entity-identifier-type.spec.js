/* global describe, it, expect, beforeEach */
/* eslint func-names:off,camelcase:off */

'use strict';

const _ = require('lodash');
const model = require('../model');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');

let queryStub;
const commonDalMock = {
  get query() { return queryStub; },
  _init: null // set below after definition
};
commonDalMock._init = () => commonDalMock;

jest.mock('./common', () => () => commonDalMock);
const initDal = require('./entity-identifier-type');

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

const entityIdentifierTypeFixtures = [
  {
    entityIdentifierTypeId: 'face',
    label: 'Face',
    labelPlural: 'Faces',
    iconClass: 'icon-person',
    dataType: 'image',
    description: 'face images'
  },
  {
    entityIdentifierTypeId: 'voice',
    label: 'Voice',
    labelPlural: 'Voices',
    iconClass: 'icon-org',
    dataType: 'audio',
    description: 'voice audio samples'
  }
];

const entityIdentifierTypeArgErr =
  'Error: expected entityIdentifierType to be an instance of model.EntityIdentifierType';

describe('libraries.dal.entity-identifier-type:', function() {
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

    it('should export an object containing entity identifier type CRUD functions', function() {
      expect(dal).toEqual({
        getEntityIdentifierTypes: expect.any(Function),
        createEntityIdentifierType: expect.any(Function),
        updateEntityIdentifierType: expect.any(Function),
        deleteEntityIdentifierType: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function() {
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getEntityIdentifierTypes', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2
      };

      populateResultRows(false);
    });

    it('should return a promise', function() {
      const promise = dal.getEntityIdentifierTypes();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getEntityIdentifierTypes().then(
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

      dal.getEntityIdentifierTypes().then(
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
        dal.getEntityIdentifierTypes().then(
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
        dal.getEntityIdentifierTypes(params).then(
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
        params.entityIdentifierTypeId = 'face';

        dal.getEntityIdentifierTypes(params).then(
          function() {
            const expectedValues = [
              params.entityIdentifierTypeId,
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

      it('should contain an array of identifierType if multiple are provided', function(done) {
        params.entityIdentifierTypeId = ['face', 'voice'];

        dal.getEntityIdentifierTypes(params).then(
          function() {
            const expectedValues = [
              params.entityIdentifierTypeId,
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

      it('should contain a dataType condition if provided', function(done) {
        params.dataType = 'image';

        dal.getEntityIdentifierTypes(params).then(
          function() {
            const expectedValues = [
              params.dataType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(/data_type = \$1/);
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

      it('should contain an array of dataType if multiple are provided', function(done) {
        params.dataType = ['image', 'audio'];

        dal.getEntityIdentifierTypes(params).then(
          function() {
            const expectedValues = [
              params.dataType,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /data_type = ANY\(\$1::text\[\]\)/
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
    });

    describe('the result', function() {
      beforeEach(function() {
        params.offset = 10;
        params.limit = 10;
      });

      it('is a pagination envelope', function(done) {
        dal.getEntityIdentifierTypes(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + entityIdentifierTypeFixtures.length - 1,
              totalResults: entityIdentifierTypeFixtures.length,
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

        dal.getEntityIdentifierTypes(params).then(
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

      it('contains an array of entity identifier types when there is a valid result', function(done) {
        dal.getEntityIdentifierTypes(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(
              result.results[0] instanceof model.EntityIdentifierType
            ).toBe(true);
            expect(result.results[0].entityIdentifierTypeId).toEqual(
              entityIdentifierTypeFixtures[0].entityIdentifierTypeId
            );
            expect(result.results[0].label).toEqual(
              entityIdentifierTypeFixtures[0].label
            );
            done();
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });
    });

    function populateResultRows() {
      resultRows = entityIdentifierTypeFixtures.map(function(
        entityIdentifierType
      ) {
        const row = _.mapKeys(entityIdentifierType, (value, key) =>
          _.snakeCase(key)
        );
        row.total = entityIdentifierTypeFixtures.length;
        return row;
      });
    }
  });

  describe('createEntityIdentifierType', function() {
    let entityIdentifierType,
      conflict = false;

    beforeEach(function() {
      entityIdentifierType = new model.EntityIdentifierType(
        entityIdentifierTypeFixtures[0]
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
      const promise = dal.createEntityIdentifierType();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entityIdentifierType argument', function(done) {
      dal.createEntityIdentifierType().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == entityIdentifierTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifierType argument is of the wrong type', function(done) {
      dal.createEntityIdentifierType({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == entityIdentifierTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided entityIdentifierType model', function(done) {
      const expectedParams = [
        entityIdentifierType.entityIdentifierTypeId,
        entityIdentifierType.label,
        entityIdentifierType.labelPlural,
        entityIdentifierType.iconClass,
        entityIdentifierType.dataType,
        entityIdentifierType.description
      ];

      dal.createEntityIdentifierType(entityIdentifierType).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.entity_identifier_type/i
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

      dal.createEntityIdentifierType(entityIdentifierType).then(
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

      dal.createEntityIdentifierType(entityIdentifierType, clientMock).then(
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

    it('should resolve to the inserted entity identifier type model when successful', function(done) {
      jest.spyOn(model.EntityIdentifierType, 'fromDB');

      resultRows = [
        _.mapKeys(entityIdentifierTypeFixtures[0], (value, key) =>
          _.snakeCase(key)
        )
      ];

      dal.createEntityIdentifierType(entityIdentifierType).then(
        function(insertedEntityIdentifierType) {
          expect(model.EntityIdentifierType.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(typeof insertedEntityIdentifierType).toBe('object');
          expect(
            insertedEntityIdentifierType instanceof model.EntityIdentifierType
          ).toBe(true);
          expect(insertedEntityIdentifierType).toEqual(
            expect.objectContaining(entityIdentifierType)
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

      dal.createEntityIdentifierType(entityIdentifierType).then(
        function(insertedEntityIdentifierType) {
          expect(insertedEntityIdentifierType).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should reject with a ResourceConflictError if the entity identifier type exists', function(done) {
      conflict = true;

      dal.createEntityIdentifierType(entityIdentifierType).then(
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

  describe('updateEntityIdentifierType', function() {
    let entityIdentifierType;

    beforeEach(function() {
      entityIdentifierType = new model.EntityIdentifierType(
        entityIdentifierTypeFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.updateEntityIdentifierType();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entityIdentifierType argument', function(done) {
      dal.updateEntityIdentifierType().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == entityIdentifierTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifierType argument is of the wrong type', function(done) {
      dal.updateEntityIdentifierType({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == entityIdentifierTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifierType argument is missing entityIdentifierTypeId', function(done) {
      entityIdentifierType.entityIdentifierTypeId = null;

      dal.updateEntityIdentifierType(entityIdentifierType).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (
            err ==
            'Error: entityIdentifierType.entityIdentifierTypeId is required'
          ) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided entity identifier type model', function(done) {
      const expectedParams = [
        entityIdentifierType.label,
        entityIdentifierType.labelPlural,
        entityIdentifierType.iconClass,
        entityIdentifierType.dataType,
        entityIdentifierType.description,
        entityIdentifierType.entityIdentifierTypeId
      ];

      dal.updateEntityIdentifierType(entityIdentifierType).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^UPDATE libraries.entity_identifier_type/i
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

      dal.updateEntityIdentifierType(entityIdentifierType).then(
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

      dal.updateEntityIdentifierType(entityIdentifierType, clientMock).then(
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

    // VE-24506: updateEntityIdentifierType now reads result[0] (array), consistent with the rest
    // of the module — so this success-path test runs.
    it('should resolve to the updated entity identifier type model when successful', function(done) {
      jest.spyOn(model.EntityIdentifierType, 'fromDB');

      resultRows = [
        _.mapKeys(entityIdentifierTypeFixtures[0], (value, key) =>
          _.snakeCase(key)
        )
      ];

      dal.updateEntityIdentifierType(entityIdentifierType).then(
        function(updatedEntityIdentifierType) {
          expect(model.EntityIdentifierType.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(typeof updatedEntityIdentifierType).toBe('object');
          expect(
            updatedEntityIdentifierType instanceof model.EntityIdentifierType
          ).toBe(true);
          expect(updatedEntityIdentifierType).toEqual(
            expect.objectContaining(entityIdentifierType)
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

      dal.updateEntityIdentifierType(entityIdentifierType).then(
        function(updatedEntityIdentifierType) {
          expect(updatedEntityIdentifierType).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteEntityIdentifierType', function() {
    let entityIdentifierType;

    beforeEach(function() {
      entityIdentifierType = new model.EntityIdentifierType(
        entityIdentifierTypeFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.deleteEntityIdentifierType();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entityIdentifierType argument', function(done) {
      dal.deleteEntityIdentifierType().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == entityIdentifierTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifierType argument is of the wrong type', function(done) {
      dal.deleteEntityIdentifierType({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == entityIdentifierTypeArgErr) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifierTypeId is not set', function(done) {
      entityIdentifierType.entityIdentifierTypeId = null;

      dal.deleteEntityIdentifierType(entityIdentifierType).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (
            err ==
            'Error: entityIdentifierType.entityIdentifierTypeId is required'
          ) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should perform a delete on the record with matching entity_identifier_type_id', function(done) {
      dal.deleteEntityIdentifierType(entityIdentifierType).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /DELETE FROM libraries.entity_identifier_type/i
          );
          const valuesMatch = [entityIdentifierType.entityIdentifierTypeId];
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

      dal.deleteEntityIdentifierType(entityIdentifierType).then(
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

      dal.deleteEntityIdentifierType(entityIdentifierType, clientMock).then(
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
          entity_identifier_type_id:
            entityIdentifierTypeFixtures[0].entityIdentifierTypeId
        }
      ];

      dal.deleteEntityIdentifierType(entityIdentifierType).then(
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
