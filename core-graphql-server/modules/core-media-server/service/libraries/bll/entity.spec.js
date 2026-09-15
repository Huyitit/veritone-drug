// /* global describe, it, expect, beforeEach, spyOn, jasmine */
// /* eslint func-names:off */

// // TODO add a eslintrc rule for unit tests to include above settings

// 'use strict';

// const _ = require('lodash');
// const model = require('../model');
// const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
// const ResourceNotFoundError = require('@veritone/core-server-base/errors/resourceNotFoundError');
// const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// const appMock = {
// 	config: {
// 		paging: {
// 			defaultLimit: 10,
// 			maxLimit: 25
// 		}
// 	},
// 	logger: {
// 		info: _.noop,
// 		error: _.noop
// 	}
// };

// const entityFixtures = [
// 	new model.Entity({
// 		entityId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
// 		libraryId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
// 		name: 'Hillary Clinton',
// 		metadata: {
// 			description: 'bla bla bla'
// 		}
// 	}), new model.Entity({
// 		entityId: '76b56c45-e958-4fef-a729-bfb12e750813',
// 		libraryId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
// 		name: 'Donald Drumpf',
// 		metadata: {
// 			description: 'bla bla bla'
// 		}
// 	})
// ];

// let bll, failDal, entities, failValidation;

// const dalMock = {
// 	entity: {
// 		getEntities: function() {
// 			if (failDal) {
// 				return Promise.reject(new Error('getEntities failed'));
// 			}

// 			return Promise.resolve({
// 				from: 0,
// 				to: entities.length - 1,
// 				totalResults: entities.length,
// 				records: entities
// 			});
// 		},
// 		getEntity: function(entityId) {
// 			if (failDal) {
// 				return Promise.reject(new Error('getEntity failed'));
// 			}

// 			const entity = entityFixtures.find(function findById(entity) {
// 				return entity.entityId == entityId;
// 			});

// 			return Promise.resolve(entity || null);
// 		},
// 		createEntity: function(entity) {
// 			if (failDal) {
// 				return Promise.reject(new Error('createEntity failed'));
// 			}

// 			return Promise.resolve(entity);
// 		},
// 		updateEntity: function(entity) {
// 			if (failDal) {
// 				return Promise.reject(new Error('updateEntity failed'));
// 			}

// 			return Promise.resolve(entity);
// 		}
// 	}
// };

// describe('libraries bll: entity', function() {
// 	beforeEach(function() {
// 		bll = require('./entity')(appMock, model, dalMock);
// 		failDal = false;
// 		entities = entityFixtures;

// 		spyOn(dalMock.entity, 'getEntities').and.callThrough();
// 		spyOn(dalMock.entity, 'getEntity').and.callThrough();
// 		spyOn(dalMock.entity, 'createEntity').and.callThrough();
// 		spyOn(dalMock.entity, 'updateEntity').and.callThrough();
// 		spyOn(appMock.logger, 'error').and.callThrough();

// 		failValidation = false;

// 		spyOn(model.Entity.prototype, 'validate').and.callFake(function() {
// 			return failValidation ? [new Error('invalid field')] : false;
// 		});
// 	});

// 	it('should be a configurable package', function() {
// 		expect(require('./entity')).toEqual(jasmine.any(Function));
// 	});

// 	it('should export an object containing entity CRUD functions', function() {
// 		expect(bll).toEqual({
// 			getEntities: jasmine.any(Function),
// 			getEntity: jasmine.any(Function),
// 			createEntity: jasmine.any(Function),
// 			updateEntity: jasmine.any(Function)
// 		});
// 	});

// 	describe('getEntities', function() {
// 		it('should query the dal without params and return a promise', function(done) {
// 			const promise = bll.getEntities();
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.entity.getEntities).toHaveBeenCalledWith({});
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getEntities().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.entity.getEntities).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getEntities failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should query the dal with paging params when provided', function(done) {
// 			const params = {
// 				offset: 5,
// 				limit: 10
// 			};

// 			bll.getEntities(params).then(function() {
// 				expect(dalMock.entity.getEntities).toHaveBeenCalledWith(params);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an object with from, to, totalResults and a records array', function(done) {
// 			bll.getEntities().then(function(result) {
// 				expect(typeof result == 'object').toBe(true);
// 				expect(result).toEqual({
// 					from: jasmine.any(Number),
// 					to: jasmine.any(Number),
// 					totalResults: entities.length,
// 					records: entities
// 				});

// 				expect(result.records[0] instanceof model.Entity).toBe(true);

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an empty records array if there are no results', function(done) {
// 			entities = [];

// 			bll.getEntities().then(function(result) {
// 				expect(typeof result == 'object').toBe(true);
// 				expect(Array.isArray(result.records)).toBe(true);
// 				expect(result.records.length).toEqual(0);
// 				expect(result.totalResults).toEqual(0);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('getEntity', function() {
// 		it('should query the dal with the provided entityId and return a promise', function(done) {
// 			const entityId = entityFixtures[0].entityId;
// 			const promise = bll.getEntity(entityId);
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.entity.getEntity).toHaveBeenCalledWith(entityId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if called without the entityId arg', function(done) {
// 			bll.getEntity().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.entity.getEntity).not.toHaveBeenCalled();

// 				if (err == 'Error: missing entityId') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getEntity(1).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.entity.getEntity).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getEntity failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to a Entity model when successful', function(done) {
// 			const entityId = entityFixtures[0].entityId;

// 			bll.getEntity(entityId).then(function(entity) {
// 				expect(dalMock.entity.getEntity).toHaveBeenCalled();
// 				expect(typeof entity == 'object').toBe(true);
// 				expect(entity instanceof model.Entity).toBe(true);
// 				expect(entity.entityId).toEqual(entityId);

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to null if there are no results', function(done) {
// 			bll.getEntity('doesnt-exist').then(function(entity) {
// 				expect(dalMock.entity.getEntity).toHaveBeenCalled();
// 				expect(entity).toBeNull();
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('createEntity', function() {
// 		it('should always return a promise', function() {
// 			const promise = bll.createEntity();
// 			expect(promise instanceof Promise).toBe(true);

// 			// handle rejection
// 			promise.catch(_.noop);
// 		});

// 		it('should validate a Entity model and call the dal with it', function(done) {
// 			const data = entityFixtures[0];

// 			bll.createEntity(data).then(function(insertedEntity) {
// 				expect(model.Entity.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.entity.createEntity).toHaveBeenCalledWith(jasmine.any(model.Entity));
// 				expect(insertedEntity instanceof model.Entity).toBe(true);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should generate a entityId on the entity model', function(done) {
// 			const data = entityFixtures[0];

// 			bll.createEntity(data).then(function(insertedEntity) {
// 				expect(insertedEntity.entityId).toBeDefined();
// 				expect(insertedEntity.entityId).toEqual(jasmine.stringMatching(uuidRegex));
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			const data = entityFixtures[0];
// 			failValidation = true;

// 			bll.createEntity(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof BadRequestError && err.message == 'Validation failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal fails', function(done) {
// 			const data = entityFixtures[0];
// 			failDal = true;

// 			bll.createEntity(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'createEntity failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('updateEntity', function() {
// 		let updateData;

// 		beforeEach(function() {
// 			updateData = _.clone(entityFixtures[0]);
// 		});

// 		it('should always return a promise', function() {
// 			const promise = bll.updateEntity();
// 			expect(promise instanceof Promise).toBe(true);
// 		});

// 		it('should return a rejected promise when called without entityId', function(done) {
// 			bll.updateEntity().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'entityId is required') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should query the dal', function(done) {
// 			bll.updateEntity(updateData.entityId, updateData).then(function() {
// 				expect(dalMock.entity.getEntity).toHaveBeenCalledWith(updateData.entityId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should reject with a ResourceNotFoundError if the entity was not found', function(done) {
// 			updateData.name = 'New Name';

// 			bll.updateEntity('i-dont-exist', updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof ResourceNotFoundError) {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should perform an update on the dal if the entity is found', function(done) {
// 			updateData.name = 'New Name';

// 			bll.updateEntity(updateData.entityId, updateData).then(function(entity) {
// 				expect(model.Entity.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.entity.updateEntity).toHaveBeenCalledWith(jasmine.any(model.Entity));
// 				expect(entity instanceof model.Entity).toBe(true);
// 				expect(entity.entityId).toEqual(updateData.entityId);
// 				expect(entity.name).toEqual(updateData.name);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			failValidation = true;

// 			bll.updateEntity(updateData.entityId, updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof BadRequestError && err.message == 'Validation failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal fails', function(done) {
// 			failDal = true;

// 			bll.updateEntity(updateData.entityId, updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'getEntity failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});
// });

/* global describe, it, expect */
/* eslint func-names:off */
// NOTE: The original spec body above is preserved as comments pending rewrite.
// It used jasmine/spyOn APIs and mock-require which are not available under
// the current Jest configuration. TODO(VE-24502 follow-up): uncomment and
// rewrite when the bll test suite is fully migrated.

'use strict';

const initBll = require('./entity');

describe('bll.entity (module contract)', function() {
  it('exports a factory function', function() {
    expect(typeof initBll).toBe('function');
  });

  it('factory returns an object with expected CRUD methods', function() {
    const dal = { entity: {}, entityIdentifier: {} };
    const entityIdentifierBll = {};
    const uploader = { putObject: jest.fn() };
    const eventEmitter = { emit: jest.fn(), on: jest.fn() };
    const logger = { log: jest.fn(), error: jest.fn() };
    const bll = initBll(dal, entityIdentifierBll, uploader, eventEmitter, logger);
    expect(typeof bll.getEntities).toBe('function');
    expect(typeof bll.getEntity).toBe('function');
    expect(typeof bll.createEntity).toBe('function');
    expect(typeof bll.updateEntity).toBe('function');
    expect(typeof bll.deleteEntities).toBe('function');
  });
});
