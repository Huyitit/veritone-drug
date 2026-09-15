/* global describe, it, expect, beforeEach, spyOn, jasmine */
/* eslint func-names:off,camelcase:off */

// TODO add a eslintrc rule for unit tests to include above settings

'use strict';

const _ = require('lodash');
const model = require('../model');
jest.mock('./common', () => () => commonDalMock);
const initDal = require('./entity-identifier');

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

const entityIdentifierFixtures = [
  {
    entityIdentifierId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
    entityId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
    entityIdentifierTypeId: 'face',
    priority: true,
    dataUrl: 'a.jpg',
    metadata: {
      mimeType: 'image/jpg'
    }
  },
  {
    entityIdentifierId: '76b56c45-e958-4fef-a729-bfb12e750813',
    entityId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
    entityIdentifierTypeId: 'voice',
    priority: false,
    dataUrl: 'a.mp3',
    metadata: {
      mimeType: 'audio/mp3'
    }
  }
];

const entityIdentifierTypeFixtures = {
  face: {
    entityIdentifierId: 'face',
    label: 'Face',
    iconClass: 'icon-person',
    dataType: 'image'
  },
  voice: {
    entityIdentifierId: 'voice',
    label: 'Voice',
    iconClass: 'icon-org',
    dataType: 'audio'
  }
};

const entityIdentifierTypeErrRegex = /expected [a-z]+ to be an instance of model.EntityIdentifier/i;

describe('libraries.dal.entity-identifier:', function() {
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

    it('should export an object containing entity identifier CRUD functions', function() {
      expect(dal).toEqual({
        getEntityIdentifiers: expect.any(Function),
        createEntityIdentifier: expect.any(Function),
        updateEntityIdentifier: expect.any(Function),
        deleteEntityIdentifiers: expect.any(Function),
        getIdentifierCountsByType: expect.any(Function)
      });
    });

    it('should have initialized common dal and linked to its prototype', function() {
      //expect(commonDalMock._init).toHaveBeenCalledWith(db);
      expect(Object.getPrototypeOf(dal)).toBe(commonDalMock);
    });
  });

  describe('getEntityIdentifiers', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2
      };

      populateResultRows(false);
    });

    it('should return a promise', function() {
      const promise = dal.getEntityIdentifiers();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getEntityIdentifiers().then(
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

      dal.getEntityIdentifiers().then(
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
        dal.getEntityIdentifiers().then(
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
        dal.getEntityIdentifiers(params).then(
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

      it('should contain a entityIdentifierId condition if provided', function(done) {
        params.entityIdentifierId = 'xxxxx';

        dal.getEntityIdentifiers(params).then(
          function() {
            const expectedValues = [
              params.entityIdentifierId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /entity_identifier_id = \$1/
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

      it('should contain an array of entityIdentifierId if multiple are provided', function(done) {
        params.entityIdentifierId = ['xxxxx', 'yyyyy'];

        dal.getEntityIdentifiers(params).then(
          function() {
            const expectedValues = [
              params.entityIdentifierId,
              params.limit,
              params.offset
            ];
            const sqlMatch = expect.stringMatching(
              /entity_identifier_id = ANY\(\$1::uuid\[\]\)/
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

      it('should contain a entityId condition if provided', function(done) {
        params.entityId = 'xxxxx';

        dal.getEntityIdentifiers(params).then(
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

      it('should contain an array of entityId if multiple are provided', function(done) {
        params.entityId = ['xxxxx', 'yyyyy'];

        dal.getEntityIdentifiers(params).then(
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

      it('should contain a libraryId condition if provided', function(done) {
        params.libraryId = 'xxxxx';

        dal.getEntityIdentifiers(params).then(
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
        params.libraryId = ['xxxxx', 'yyyyy'];

        dal.getEntityIdentifiers(params).then(
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

      it('should contain a identifierType condition if provided', function(done) {
        params.identifierType = 'face';

        dal.getEntityIdentifiers(params).then(
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

      it('should contain an array of identifierType if multiple are provided', function(done) {
        params.identifierType = ['face', 'voice'];

        dal.getEntityIdentifiers(params).then(
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

      it('should contain a dataType condition if provided', function(done) {
        params.dataType = 'image';

        dal.getEntityIdentifiers(params).then(
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

        dal.getEntityIdentifiers(params).then(
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
        dal.getEntityIdentifiers(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + entityIdentifierFixtures.length - 1,
              totalResults: entityIdentifierFixtures.length,
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

        dal.getEntityIdentifiers(params).then(
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

      it('contains an array of entity identifiers when there is a valid result', function(done) {
        dal.getEntityIdentifiers(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(resultRows.length);
            expect(result.results[0] instanceof model.EntityIdentifier).toBe(
              true
            );
            expect(result.results[0].entityIdentifierId).toEqual(
              entityIdentifierFixtures[0].entityIdentifierId
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
      resultRows = entityIdentifierFixtures.map(function(entityIdentifier) {
        const row = _.mapKeys(entityIdentifier, (value, key) =>
          _.snakeCase(key)
        );
        const type =
          entityIdentifierTypeFixtures[entityIdentifier.entityIdentifierTypeId];

        Object.assign(row, {
          total: entityIdentifierFixtures.length,
          eit__entity_identifier_type_id: type.entityIdentifierTypeId,
          eit__label: type.label,
          eit__icon_class: type.iconClass,
          eit__data_type: type.dataType
        });

        return row;
      });
    }
  });

  describe('createEntityIdentifier', function() {
    let entityIdentifier;

    beforeEach(function() {
      entityIdentifier = new model.EntityIdentifier(
        entityIdentifierFixtures[0]
      );

      queryStub.mockImplementation(function() {
        return new Promise(function(resolve) {
          if (failQuery) {
            throw queryError;
          }

          resolve(resultRows);
        });
      });
    });

    it('should return a promise', function() {
      const promise = dal.createEntityIdentifier();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entityIdentifier argument', function(done) {
      dal.createEntityIdentifier().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityIdentifierTypeErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifier argument is of the wrong type', function(done) {
      dal.createEntityIdentifier({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityIdentifierTypeErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an insert query with values from the provided entityIdentifier model', function(done) {
      const expectedParams = [
        entityIdentifier.entityIdentifierId,
        entityIdentifier.entityId,
        entityIdentifier.entityIdentifierTypeId,
        entityIdentifier.priority,
        entityIdentifier.dataUrl.toString(),
        JSON.stringify(entityIdentifier.metadata),
        expect.any(Number),
        expect.any(Number)
      ];

      dal.createEntityIdentifier(entityIdentifier).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^INSERT INTO libraries.entity_identifier/i
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

      dal.createEntityIdentifier(entityIdentifier).then(
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

      dal.createEntityIdentifier(entityIdentifier, clientMock).then(
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

    it('should resolve to the inserted entity identifier model when successful', function(done) {
      jest.spyOn(model.EntityIdentifier, 'fromDB');

      resultRows = [
        _.mapKeys(entityIdentifierFixtures[0], (value, key) => _.snakeCase(key))
      ];

      dal.createEntityIdentifier(entityIdentifier).then(
        function(insertedEntityIdentifier) {
          expect(model.EntityIdentifier.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(typeof insertedEntityIdentifier).toBe('object');
          expect(
            insertedEntityIdentifier instanceof model.EntityIdentifier
          ).toBe(true);
          expect(insertedEntityIdentifier).toEqual(
            expect.objectContaining({
              entityIdentifierId: entityIdentifier.entityIdentifierId,
              entityId: entityIdentifier.entityId,
              entityIdentifierTypeId: entityIdentifier.entityIdentifierTypeId,
              dataUrl: expect.any(Object),
              priority: entityIdentifier.priority,
              metadata: entityIdentifier.metadata
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

      dal.createEntityIdentifier(entityIdentifier).then(
        function(insertedEntityIdentifier) {
          expect(insertedEntityIdentifier).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('updateEntityIdentifier', function() {
    let entityIdentifier;

    beforeEach(function() {
      entityIdentifier = new model.EntityIdentifier(
        entityIdentifierFixtures[0]
      );
    });

    it('should return a promise', function() {
      const promise = dal.updateEntityIdentifier();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entityIdentifier argument', function(done) {
      dal.updateEntityIdentifier().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityIdentifierTypeErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifier argument is of the wrong type', function(done) {
      dal.updateEntityIdentifier({}).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (entityIdentifierTypeErrRegex.test(err)) {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifier argument is missing entityIdentifierId', function(done) {
      entityIdentifier.entityIdentifierId = null;

      dal.updateEntityIdentifier(entityIdentifier).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: entityIdentifier.entityIdentifierId is required') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should execute an update query with values from the provided entity identifier model', function(done) {
      const expectedParams = [
        entityIdentifier.entityId,
        entityIdentifier.entityIdentifierTypeId,
        entityIdentifier.priority,
        entityIdentifier.dataUrl.toString(),
        JSON.stringify(entityIdentifier.metadata),
        expect.any(Number),
        entityIdentifier.entityIdentifierId
      ];

      dal.updateEntityIdentifier(entityIdentifier).then(
        function() {
          const sqlMatch = expect.stringMatching(
            /^UPDATE libraries.entity_identifier/i
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

      dal.updateEntityIdentifier(entityIdentifier).then(
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

      dal.updateEntityIdentifier(entityIdentifier, clientMock).then(
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

    it('should resolve to the updated entity identifier model when successful', function(done) {
      jest.spyOn(model.EntityIdentifier, 'fromDB');

      resultRows = [
        _.mapKeys(entityIdentifierFixtures[0], (value, key) => _.snakeCase(key))
      ];

      dal.updateEntityIdentifier(entityIdentifier).then(
        function(updatedEntityIdentifier) {
          expect(model.EntityIdentifier.fromDB).toHaveBeenCalledWith(
            resultRows[0]
          );
          expect(typeof updatedEntityIdentifier).toBe('object');
          expect(
            updatedEntityIdentifier instanceof model.EntityIdentifier
          ).toBe(true);
          expect(updatedEntityIdentifier).toEqual(
            expect.objectContaining({
              entityIdentifierId: entityIdentifier.entityIdentifierId,
              entityId: entityIdentifier.entityId,
              entityIdentifierTypeId: entityIdentifier.entityIdentifierTypeId,
              dataUrl: expect.any(Object),
              priority: entityIdentifier.priority,
              metadata: entityIdentifier.metadata
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

      dal.updateEntityIdentifier(entityIdentifier).then(
        function(updatedEntityIdentifier) {
          expect(updatedEntityIdentifier).toBe(null);
          done();
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });
  });

  describe('deleteEntityIdentifiers', function() {
    let params;

    beforeEach(function() {
      params = _.pick(entityIdentifierFixtures[0], [
        'entityIdentifierId',
        'entityIdentifierTypeId',
        'entityId'
      ]);
    });

    it('should return a promise', function() {
      const promise = dal.deleteEntityIdentifiers();
      expect(promise instanceof Promise).toBe(true);

      // handle rejection
      promise.catch(_.noop);
    });

    it('should return a rejected promise when missing the entityIdentifier argument', function(done) {
      dal.deleteEntityIdentifiers().then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: expected params to be an object') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise when the entityIdentifier argument is of the wrong type', function(done) {
      dal.deleteEntityIdentifiers(123).then(
        function() {
          done(new Error('expected promise to be rejected'));
        },
        function(err) {
          if (err == 'Error: expected params to be an object') {
            return done();
          }

          done(new Error(`Unexpected rejection reason: ${err}`));
        }
      );
    });

    it('should return a rejected promise if at least one query id is not set', function(done) {
      params.entityIdentifierId = null;
      params.entityId = null;

      dal.deleteEntityIdentifiers(params).then(
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
      dal.deleteEntityIdentifiers(params).then(
        function() {
          const sqlMatch = expect.stringMatching(/SET deleted_date_time =/);
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

    it('should include a condition for entity_identifier_id if provided the entityIdentifierId', function(done) {
      dal.deleteEntityIdentifiers(params).then(
        function() {
          const sqlMatch = expect.stringMatching(/entity_identifier_id =/);
          const valuesMatch = [expect.any(Number), params.entityIdentifierId];
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

    it('should include a condition for entity_id if provided the entityId argument', function(done) {
      params.entityIdentifierId = null;
      params.entityIdentifierTypeId = null;

      dal.deleteEntityIdentifiers(params).then(
        function() {
          const sqlMatch = expect.stringMatching(/entity_id =/);
          const valuesMatch = [expect.any(Number), params.entityId];
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

    it('should include a condition for entity_id and entity_identifier_type_id if provided both the entityId and entityIdentifierTypeId argument', function(done) {
      params.entityIdentifierId = null;

      dal.deleteEntityIdentifiers(params).then(
        function() {
          let sqlMatch = expect.stringMatching(/entity_id =/);
          const valuesMatch = [
            expect.any(Number),
            params.entityId,
            params.entityIdentifierTypeId
          ];

          expect(queryStub).toHaveBeenCalledWith(
            db.write,
            sqlMatch,
            valuesMatch
          );

          sqlMatch = expect.stringMatching(/entity_identifier_type_id =/);
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

    it('should include a condition for library_id if provided the libraryId argument but not entityId', function(done) {
      params.entityIdentifierId = null;
      params.entityId = null;
      params.libraryId = 'xxxxx';

      dal.deleteEntityIdentifiers(params).then(
        function() {
          const sqlMatch = expect.stringMatching(/library_id =/);
          const valuesMatch = [expect.any(Number), params.libraryId];
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

      dal.deleteEntityIdentifiers(params).then(
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

      dal.deleteEntityIdentifiers(params, clientMock).then(
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
          entity_identifier_id: entityIdentifierFixtures[0].entityIdentifierId
        }
      ];

      dal.deleteEntityIdentifiers(params).then(
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

  describe('getIdentifierCountsByType', function() {
    let params;

    beforeEach(function() {
      params = {
        offset: 0,
        limit: 2,
        entityId: ['xxxxx', 'yyyyy']
      };

      resultRows = [
        {
          total: 2,
          entity_id: params.entityId[0],
          entity_identifier_type_id: 'face',
          identifier_count: 4
        },
        {
          total: 2,
          entity_id: params.entityId[0],
          entity_identifier_type_id: 'voice',
          identifier_count: 2
        },
        {
          total: 2,
          entity_id: params.entityId[1],
          entity_identifier_type_id: 'face',
          identifier_count: 1
        }
      ];
    });

    it('should return a promise', function() {
      const promise = dal.getIdentifierCountsByType();
      expect(promise instanceof Promise).toBe(true);
    });

    it('should execute a query using the read connection', function(done) {
      dal.getIdentifierCountsByType().then(
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

      dal.getIdentifierCountsByType().then(
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
        dal.getIdentifierCountsByType().then(
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
        dal.getIdentifierCountsByType({ limit: 20, offset: 40 }).then(
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

      it('should contain a entityId condition if provided', function(done) {
        params.entityId = 'xxxxx';

        dal.getIdentifierCountsByType(params).then(
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

      it('should contain an array of entityId if multiple are provided', function(done) {
        dal.getIdentifierCountsByType(params).then(
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
    });

    describe('the result', function() {
      beforeEach(function() {
        params.offset = 10;
        params.limit = 10;
      });

      it('is a pagination envelope', function(done) {
        dal.getIdentifierCountsByType(params).then(
          function(result) {
            expect(paging.toPaginationEnvelope).toHaveBeenCalled();
            expect(typeof result).toEqual('object');
            expect(result).toEqual({
              from: 10,
              to: 10 + params.entityId.length - 1,
              totalResults: params.entityId.length,
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

        dal.getIdentifierCountsByType(params).then(
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
        dal.getIdentifierCountsByType(params).then(
          function(result) {
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toEqual(2);

            expect(result.results[0] instanceof model.EntitySummary).toBe(true);
            expect(result.results[0].entityId).toEqual(params.entityId[0]);
            expect(typeof result.results[0].identifierCountsByType).toEqual(
              'object'
            );
            expect(result.results[0].identifierCountsByType).toEqual({
              face: 4,
              voice: 2
            });

            expect(result.results[1] instanceof model.EntitySummary).toBe(true);
            expect(result.results[1].entityId).toEqual(params.entityId[1]);
            expect(typeof result.results[1].identifierCountsByType).toEqual(
              'object'
            );
            expect(result.results[1].identifierCountsByType).toEqual({
              face: 1
            });
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
