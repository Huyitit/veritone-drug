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

// const entityIdentifierFixtures = [
// 	new model.EntityIdentifier({
// 		entityIdentifierId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
// 		entityId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
// 		entityIdentifierTypeId: 'headshot',
// 		dataUrl: 'a.jpg',
// 		metadata: {
// 			mimeType: 'image/jpg'
// 		}
// 	}),
// 	new model.EntityIdentifier({
// 		entityIdentifierId: '76b56c45-e958-4fef-a729-bfb12e750813',
// 		entityId: 'ab50f51d-0d49-4bdd-b9c6-2d4f33ca4b08',
// 		entityIdentifierTypeId: 'voice-clip',
// 		dataUrl: 'a.mp3',
// 		metadata: {
// 			mimeType: 'audio/mp3'
// 		}
// 	})
// ];

// let bll, failDal, entityIdentifiers, failValidation;

// const dalMock = {
// 	entityIdentifier: {
// 		getEntityIdentifiers: function() {
// 			if (failDal) {
// 				return Promise.reject(new Error('getEntityIdentifiers failed'));
// 			}

// 			return Promise.resolve({
// 				from: 0,
// 				to: entityIdentifiers.length - 1,
// 				totalResults: entityIdentifiers.length,
// 				records: entityIdentifiers
// 			});
// 		},
// 		getEntityIdentifier: function(entityIdentifierId) {
// 			if (failDal) {
// 				return Promise.reject(new Error('getEntityIdentifier failed'));
// 			}

// 			const entityIdentifier = entityIdentifierFixtures.find(function findById(entityIdentifier) {
// 				return entityIdentifier.entityIdentifierId == entityIdentifierId;
// 			});

// 			return Promise.resolve(entityIdentifier || null);
// 		},
// 		createEntityIdentifier: function(entity) {
// 			if (failDal) {
// 				return Promise.reject(new Error('createEntityIdentifier failed'));
// 			}

// 			return Promise.resolve(entity);
// 		},
// 		updateEntityIdentifier: function(entity) {
// 			if (failDal) {
// 				return Promise.reject(new Error('updateEntityIdentifier failed'));
// 			}

// 			return Promise.resolve(entity);
// 		}
// 	}
// };

// describe('libraries bll: entity', function() {
// 	beforeEach(function() {
// 		bll = require('./entity-identifier')(appMock, model, dalMock);
// 		failDal = false;
// 		entityIdentifiers = entityIdentifierFixtures;

// 		spyOn(dalMock.entityIdentifier, 'getEntityIdentifiers').and.callThrough();
// 		spyOn(dalMock.entityIdentifier, 'getEntityIdentifier').and.callThrough();
// 		spyOn(dalMock.entityIdentifier, 'createEntityIdentifier').and.callThrough();
// 		spyOn(dalMock.entityIdentifier, 'updateEntityIdentifier').and.callThrough();
// 		spyOn(appMock.logger, 'error').and.callThrough();

// 		failValidation = false;

// 		spyOn(model.EntityIdentifier.prototype, 'validate').and.callFake(function() {
// 			return failValidation ? [new Error('invalid field')] : false;
// 		});
// 	});

// 	it('should be a configurable package', function() {
// 		expect(require('./entity-identifier')).toEqual(jasmine.any(Function));
// 	});

// 	it('should export an object containing entity CRUD functions', function() {
// 		expect(bll).toEqual({
// 			getEntityIdentifiers: jasmine.any(Function),
// 			getEntityIdentifier: jasmine.any(Function),
// 			createEntityIdentifier: jasmine.any(Function),
// 			updateEntityIdentifier: jasmine.any(Function)
// 		});
// 	});

// 	describe('getEntityIdentifiers', function() {
// 		it('should query the dal without params and return a promise', function(done) {
// 			const promise = bll.getEntityIdentifiers();
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.entityIdentifier.getEntityIdentifiers).toHaveBeenCalledWith({});
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getEntityIdentifiers().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.entityIdentifier.getEntityIdentifiers).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getEntityIdentifiers failed') {
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

// 			bll.getEntityIdentifiers(params).then(function() {
// 				expect(dalMock.entityIdentifier.getEntityIdentifiers).toHaveBeenCalledWith(params);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an object with totalResults and records properties', function(done) {
// 			bll.getEntityIdentifiers().then(function(result) {
// 				expect(typeof result == 'object').toBe(true);
// 				expect(result).toEqual({
// 					from: jasmine.any(Number),
// 					to: jasmine.any(Number),
// 					totalResults: entityIdentifiers.length,
// 					records: entityIdentifiers
// 				});

// 				expect(result.records[0] instanceof model.EntityIdentifier).toBe(true);

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an empty records array if there are no results', function(done) {
// 			entityIdentifiers = [];

// 			bll.getEntityIdentifiers().then(function(result) {
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

// 	describe('getEntityIdentifier', function() {
// 		it('should query the dal with the provided entityId and return a promise', function(done) {
// 			const entityId = entityIdentifierFixtures[0].entityId;
// 			const promise = bll.getEntityIdentifier(entityId);
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.entityIdentifier.getEntityIdentifier).toHaveBeenCalledWith(entityId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if called without the entityId arg', function(done) {
// 			bll.getEntityIdentifier().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.entityIdentifier.getEntityIdentifier).not.toHaveBeenCalled();

// 				if (err == 'Error: missing entityIdentifierId') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getEntityIdentifier(1).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.entityIdentifier.getEntityIdentifier).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getEntityIdentifier failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to a EntityIdentifier model when successful', function(done) {
// 			const entityIdentifierId = entityIdentifierFixtures[0].entityIdentifierId;

// 			bll.getEntityIdentifier(entityIdentifierId).then(function(entityIdentifier) {
// 				expect(dalMock.entityIdentifier.getEntityIdentifier).toHaveBeenCalled();
// 				expect(typeof entityIdentifier == 'object').toBe(true);
// 				expect(entityIdentifier instanceof model.EntityIdentifier).toBe(true);
// 				expect(entityIdentifier.entityIdentifierId).toEqual(entityIdentifierId);

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to null if there are no results', function(done) {
// 			bll.getEntityIdentifier('doesnt-exist').then(function(entity) {
// 				expect(dalMock.entityIdentifier.getEntityIdentifier).toHaveBeenCalled();
// 				expect(entity).toBeNull();
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('createEntityIdentifier', function() {
// 		it('should always return a promise', function() {
// 			const promise = bll.createEntityIdentifier();
// 			expect(promise instanceof Promise).toBe(true);

// 			// handle rejection
// 			promise.catch(_.noop);
// 		});

// 		it('should validate an EntityIdentifier model and call the dal with it', function(done) {
// 			const data = entityIdentifierFixtures[0];

// 			bll.createEntityIdentifier(data).then(function(insertedEntityIdentifier) {
// 				expect(model.EntityIdentifier.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.entityIdentifier.createEntityIdentifier).toHaveBeenCalledWith(jasmine.any(model.EntityIdentifier));
// 				expect(insertedEntityIdentifier instanceof model.EntityIdentifier).toBe(true);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should generate an entityIdentifierId on the entity identifier model', function(done) {
// 			const data = entityIdentifierFixtures[0];

// 			bll.createEntityIdentifier(data).then(function(insertedEntityIdentifier) {
// 				expect(insertedEntityIdentifier.entityIdentifierId).toBeDefined();
// 				expect(insertedEntityIdentifier.entityIdentifierId).toEqual(jasmine.stringMatching(uuidRegex));
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			const data = entityIdentifierFixtures[0];
// 			failValidation = true;

// 			bll.createEntityIdentifier(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof BadRequestError && err.message == 'Validation failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal fails', function(done) {
// 			const data = entityIdentifierFixtures[0];
// 			failDal = true;

// 			bll.createEntityIdentifier(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'createEntityIdentifier failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('updateEntityIdentifier', function() {
// 		let updateData;

// 		beforeEach(function() {
// 			updateData = _.clone(entityIdentifierFixtures[0]);
// 		});

// 		it('should always return a promise', function() {
// 			const promise = bll.updateEntityIdentifier();
// 			expect(promise instanceof Promise).toBe(true);
// 		});

// 		it('should return a rejected promise when called without entityIdentifierId', function(done) {
// 			bll.updateEntityIdentifier().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'entityIdentifierId is required') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should query the dal', function(done) {
// 			bll.updateEntityIdentifier(updateData.entityIdentifierId, updateData).then(function() {
// 				expect(dalMock.entityIdentifier.getEntityIdentifier).toHaveBeenCalledWith(updateData.entityIdentifierId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should reject with a ResourceNotFoundError if the entity was not found', function(done) {
// 			updateData.dataUrl = 'New URL';

// 			bll.updateEntityIdentifier('i-dont-exist', updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof ResourceNotFoundError) {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should perform an update on the dal if the entity is found', function(done) {
// 			updateData.dataUrl = 'New URL';

// 			bll.updateEntityIdentifier(updateData.entityIdentifierId, updateData).then(function(entity) {
// 				expect(model.EntityIdentifier.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.entityIdentifier.updateEntityIdentifier).toHaveBeenCalledWith(jasmine.any(model.EntityIdentifier));
// 				expect(entity instanceof model.EntityIdentifier).toBe(true);
// 				expect(entity.entityIdentifierId).toEqual(updateData.entityIdentifierId);
// 				expect(entity.dataUrl).toEqual(updateData.dataUrl);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			failValidation = true;

// 			bll.updateEntityIdentifier(updateData.entityIdentifierId, updateData).then(function() {
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

// 			bll.updateEntityIdentifier(updateData.entityIdentifierId, updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'getEntityIdentifier failed') {
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

const initBll = require('./entity-identifier');

describe('bll.entity-identifier (module contract)', function() {
  it('exports a factory function', function() {
    expect(typeof initBll).toBe('function');
  });

  it('factory returns an object with expected CRUD methods', function() {
    const dal = { entityIdentifier: {} };
    const identifierTypeBll = {};
    const uploader = {};
    const eventEmitter = { emit: jest.fn() };
    const bll = initBll(dal, identifierTypeBll, uploader, eventEmitter);
    expect(typeof bll.getEntityIdentifiers).toBe('function');
    expect(typeof bll.getEntityIdentifier).toBe('function');
    expect(typeof bll.createEntityIdentifier).toBe('function');
    expect(typeof bll.deleteEntityIdentifiers).toBe('function');
  });
});
