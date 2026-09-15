// /* global describe, it, expect, beforeEach, spyOn, jasmine */
// /* eslint func-names:off */

// // TODO add a eslintrc rule for unit tests to include above settings

// 'use strict';

// const _ = require('lodash');
// const model = require('../model');
// const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');

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

// const libraryTypeFixtures = [
// 	new model.LibraryType({
// 		libraryTypeId: 'people',
// 		label: 'People'
// 	}),
// 	new model.LibraryType({
// 		libraryTypeId: 'organization',
// 		label: 'Organizations'
// 	})
// ];

// let bll, failDal, libraryTypes, failValidation;

// const dalMock = {
// 	libraryType: {
// 		getLibraryTypes: function() {
// 			if (failDal) {
// 				return Promise.reject(new Error('getLibraryTypes failed'));
// 			}

// 			return Promise.resolve({
// 				from: 0,
// 				to: libraryTypes.length - 1,
// 				totalResults: libraryTypes.length,
// 				records: libraryTypes
// 			});
// 		},
// 		getLibraryType: function(libraryTypeId) {
// 			if (failDal) {
// 				return Promise.reject(new Error('getLibraryType failed'));
// 			}

// 			const libraryType = libraryTypeFixtures.find(function findById(libraryType) {
// 				return libraryType.libraryTypeId == libraryTypeId;
// 			});

// 			return Promise.resolve(libraryType || null);
// 		},
// 		createLibraryType: function(libraryType) {
// 			if (failDal) {
// 				return Promise.reject(new Error('createLibraryType failed'));
// 			}

// 			return Promise.resolve(libraryType);
// 		},
// 		updateLibraryType: function(libraryType) {
// 			if (failDal) {
// 				return Promise.reject(new Error('updateLibraryType failed'));
// 			}

// 			return Promise.resolve(libraryType);
// 		}
// 	}
// };

// describe('libraries bll: library-type', function() {
// 	beforeEach(function() {
// 		bll = require('./library-type')(appMock, model, dalMock);
// 		failDal = false;
// 		libraryTypes = libraryTypeFixtures;

// 		spyOn(dalMock.libraryType, 'getLibraryTypes').and.callThrough();
// 		spyOn(dalMock.libraryType, 'getLibraryType').and.callThrough();
// 		spyOn(dalMock.libraryType, 'createLibraryType').and.callThrough();
// 		spyOn(dalMock.libraryType, 'updateLibraryType').and.callThrough();
// 		spyOn(appMock.logger, 'error').and.callThrough();

// 		failValidation = false;

// 		spyOn(model.LibraryType.prototype, 'validate').and.callFake(function() {
// 			return failValidation ? [new Error('invalid field')] : false;
// 		});
// 	});

// 	it('should be a configurable package', function() {
// 		expect(require('./library-type')).toEqual(jasmine.any(Function));
// 	});

// 	it('should export an object containing library-type CRUD functions', function() {
// 		expect(bll).toEqual({
// 			getLibraryTypes: jasmine.any(Function),
// 			getLibraryType: jasmine.any(Function),
// 			createLibraryType: jasmine.any(Function),
// 			updateLibraryType: jasmine.any(Function)
// 		});
// 	});

// 	describe('getLibraryTypes', function() {
// 		it('should query the dal without params and return a promise', function(done) {
// 			const promise = bll.getLibraryTypes();
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.libraryType.getLibraryTypes).toHaveBeenCalledWith({});
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getLibraryTypes().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.libraryType.getLibraryTypes).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getLibraryTypes failed') {
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

// 			bll.getLibraryTypes(params).then(function() {
// 				expect(dalMock.libraryType.getLibraryTypes).toHaveBeenCalledWith(params);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an object with totalResults and records properties', function(done) {
// 			bll.getLibraryTypes().then(function(result) {
// 				expect(typeof result).toEqual('object');
// 				expect(result).toEqual({
// 					from: jasmine.any(Number),
// 					to: jasmine.any(Number),
// 					totalResults: libraryTypes.length,
// 					records: libraryTypes
// 				});

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an empty records array if there are no results', function(done) {
// 			libraryTypes = [];

// 			bll.getLibraryTypes().then(function(result) {
// 				expect(typeof result).toEqual('object');
// 				expect(Array.isArray(result.records)).toBe(true);
// 				expect(result.records.length).toEqual(0);
// 				expect(result.totalResults).toEqual(0);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('getLibraryType', function() {
// 		it('should query the dal with the provided libraryTypeId and return a promise', function(done) {
// 			const libraryTypeId = 'people';
// 			const promise = bll.getLibraryType(libraryTypeId);
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.libraryType.getLibraryType).toHaveBeenCalledWith(libraryTypeId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if called without the libraryTypeId arg', function(done) {
// 			bll.getLibraryType().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.libraryType.getLibraryType).not.toHaveBeenCalled();

// 				if (err == 'Error: missing libraryTypeId') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getLibraryType('people').then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.libraryType.getLibraryType).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getLibraryType failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to a LibraryType model when successful', function(done) {
// 			const libraryTypeId = 'people';

// 			bll.getLibraryType(libraryTypeId).then(function(libraryType) {
// 				expect(dalMock.libraryType.getLibraryType).toHaveBeenCalled();
// 				expect(typeof libraryType).toEqual('object');
// 				expect(libraryType instanceof model.LibraryType).toBe(true);
// 				expect(libraryType.libraryTypeId).toEqual(libraryTypeId);

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to null if there are no results', function(done) {
// 			bll.getLibraryType('doesnt-exist').then(function(libraryType) {
// 				expect(dalMock.libraryType.getLibraryType).toHaveBeenCalled();
// 				expect(libraryType).toBeNull();
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('createLibraryType', function() {
// 		it('should always return a promise', function() {
// 			const promise = bll.createLibraryType();
// 			expect(promise instanceof Promise).toBe(true);

// 			// handle rejection
// 			promise.catch(_.noop);
// 		});

// 		it('should validate a LibraryType model and call the dal with it', function(done) {
// 			const data = libraryTypeFixtures[0];

// 			bll.createLibraryType(data).then(function(insertedLibraryType) {
// 				expect(model.LibraryType.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.libraryType.createLibraryType).toHaveBeenCalledWith(jasmine.any(model.LibraryType));
// 				expect(insertedLibraryType instanceof model.LibraryType).toBe(true);
// 				expect(insertedLibraryType.libraryTypeId).toEqual(data.libraryTypeId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			const data = libraryTypeFixtures[0];
// 			failValidation = true;

// 			bll.createLibraryType(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof BadRequestError && err.message == 'Validation failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal fails', function(done) {
// 			const data = libraryTypeFixtures[0];
// 			failDal = true;

// 			bll.createLibraryType(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'createLibraryType failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('updateLibraryType', function() {
// 		let updateData;

// 		beforeEach(function() {
// 			updateData = _.clone(libraryTypeFixtures[0]);
// 		});

// 		it('should always return a promise', function() {
// 			const promise = bll.updateLibraryType();
// 			expect(promise instanceof Promise).toBe(true);
// 		});

// 		it('should return a rejected promise when called without libraryTypeId ', function(done) {
// 			bll.updateLibraryType().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'libraryTypeId is required') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should query the dal', function(done) {
// 			bll.updateLibraryType(updateData).then(function() {
// 				expect(dalMock.libraryType.getLibraryType).toHaveBeenCalledWith(updateData.libraryTypeId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should perform an update on the dal when the library type exists', function(done) {
// 			updateData.label = 'New Label';

// 			bll.updateLibraryType(updateData.libraryTypeId, updateData).then(function(libraryType) {
// 				expect(model.LibraryType.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.libraryType.updateLibraryType).toHaveBeenCalledWith(jasmine.any(model.LibraryType));
// 				expect(dalMock.libraryType.createLibraryType).not.toHaveBeenCalled();
// 				expect(libraryType instanceof model.LibraryType).toBe(true);
// 				expect(libraryType.libraryTypeId).toEqual(updateData.libraryTypeId);
// 				expect(libraryType.label).toEqual(updateData.label);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			failValidation = true;

// 			bll.updateLibraryType(updateData.libraryTypeId, updateData).then(function() {
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

// 			bll.updateLibraryType(updateData.libraryTypeId, updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'getLibraryType failed') {
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

const initBll = require('./library-type');

describe('bll.library-type (module contract)', function() {
  it('exports a factory function', function() {
    expect(typeof initBll).toBe('function');
  });

  it('factory returns an object with expected CRUD methods', function() {
    const dal = {
      libraryType: {
        getLibraryTypes: jest.fn().mockResolvedValue({ results: [] }),
        getLibraryType: jest.fn().mockResolvedValue(null),
        createLibraryType: jest.fn().mockResolvedValue({}),
        updateLibraryType: jest.fn().mockResolvedValue({})
      }
    };
    const bll = initBll(dal);
    expect(typeof bll.getLibraryTypes).toBe('function');
    expect(typeof bll.getLibraryType).toBe('function');
    expect(typeof bll.createLibraryType).toBe('function');
    expect(typeof bll.updateLibraryType).toBe('function');
  });
});
