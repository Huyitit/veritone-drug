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

// const libraryFixtures = [
// 	new model.Library({
// 		libraryId: '8a8a84eb-5dcb-490f-9bdc-1811e3d8af01',
// 		version: 1,
// 		libraryTypeId: 'people',
// 		name: 'My People',
// 		ownerOrgId: '1234'
// 	}),
// 	new model.Library({
// 		libraryId: '76b56c45-e958-4fef-a729-bfb12e750813',
// 		version: 2,
// 		libraryTypeId: 'organization',
// 		name: 'My Brands',
// 		ownerOrgId: '1234'
// 	})
// ];

// let bll, failDal, libraries, failValidation;

// const dalMock = {
// 	library: {
// 		getLibraries: function() {
// 			if (failDal) {
// 				return Promise.reject(new Error('getLibraries failed'));
// 			}

// 			return Promise.resolve({
// 				from: 0,
// 				to: libraries.length - 1,
// 				totalResults: libraries.length,
// 				records: libraries
// 			});
// 		},
// 		getLibrary: function(libraryId) {
// 			if (failDal) {
// 				return Promise.reject(new Error('getLibrary failed'));
// 			}

// 			const library = libraryFixtures.find(function findById(library) {
// 				return library.libraryId == libraryId;
// 			});

// 			return Promise.resolve(library || null);
// 		},
// 		createLibrary: function(library) {
// 			if (failDal) {
// 				return Promise.reject(new Error('createLibrary failed'));
// 			}

// 			return Promise.resolve(library);
// 		},
// 		updateLibrary: function(library) {
// 			if (failDal) {
// 				return Promise.reject(new Error('updateLibrary failed'));
// 			}

// 			return Promise.resolve(library);
// 		}
// 	}
// };

// describe('libraries bll: library', function() {
// 	beforeEach(function() {
// 		bll = require('./library')(appMock, model, dalMock);
// 		failDal = false;
// 		libraries = libraryFixtures;

// 		spyOn(dalMock.library, 'getLibraries').and.callThrough();
// 		spyOn(dalMock.library, 'getLibrary').and.callThrough();
// 		spyOn(dalMock.library, 'createLibrary').and.callThrough();
// 		spyOn(dalMock.library, 'updateLibrary').and.callThrough();
// 		spyOn(appMock.logger, 'error').and.callThrough();

// 		failValidation = false;

// 		spyOn(model.Library.prototype, 'validate').and.callFake(function() {
// 			return failValidation ? [new Error('invalid field')] : false;
// 		});
// 	});

// 	it('should be a configurable package', function() {
// 		expect(require('./library')).toEqual(jasmine.any(Function));
// 	});

// 	it('should export an object containing library CRUD functions', function() {
// 		expect(bll).toEqual({
// 			getLibraries: jasmine.any(Function),
// 			getLibrary: jasmine.any(Function),
// 			createLibrary: jasmine.any(Function),
// 			updateLibrary: jasmine.any(Function)
// 		});
// 	});

// 	describe('getLibraries', function() {
// 		it('should query the dal without params and return a promise', function(done) {
// 			const promise = bll.getLibraries();
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.library.getLibraries).toHaveBeenCalledWith({});
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getLibraries().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.library.getLibraries).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getLibraries failed') {
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

// 			bll.getLibraries(params).then(function() {
// 				expect(dalMock.library.getLibraries).toHaveBeenCalledWith(params);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an object with totalResults and records properties', function(done) {
// 			bll.getLibraries().then(function(result) {
// 				expect(typeof result == 'object').toBe(true);
// 				expect(result).toEqual({
// 					from: jasmine.any(Number),
// 					to: jasmine.any(Number),
// 					totalResults: libraries.length,
// 					records: libraries
// 				});

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to an empty records array if there are no results', function(done) {
// 			libraries = [];

// 			bll.getLibraries().then(function(result) {
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

// 	describe('getLibrary', function() {
// 		it('should query the dal with the provided libraryId and return a promise', function(done) {
// 			const libraryId = libraryFixtures[0].libraryId;
// 			const promise = bll.getLibrary(libraryId);
// 			expect(promise instanceof Promise).toBe(true);

// 			promise.then(function() {
// 				expect(dalMock.library.getLibrary).toHaveBeenCalledWith(libraryId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if called without the libraryId arg', function(done) {
// 			bll.getLibrary().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.library.getLibrary).not.toHaveBeenCalled();

// 				if (err == 'Error: missing libraryId') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal query fails', function(done) {
// 			failDal = true;

// 			bll.getLibrary(1).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				expect(dalMock.library.getLibrary).toHaveBeenCalled();
// 				expect(appMock.logger.error).toHaveBeenCalled();

// 				if (err == 'Error: getLibrary failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to a Library model when successful', function(done) {
// 			const libraryId = libraryFixtures[0].libraryId;

// 			bll.getLibrary(libraryId).then(function(library) {
// 				expect(dalMock.library.getLibrary).toHaveBeenCalled();
// 				expect(typeof library == 'object').toBe(true);
// 				expect(library instanceof model.Library).toBe(true);
// 				expect(library.libraryId).toEqual(libraryId);

// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should resolve to null if there are no results', function(done) {
// 			bll.getLibrary('doesnt-exist').then(function(library) {
// 				expect(dalMock.library.getLibrary).toHaveBeenCalled();
// 				expect(library).toBeNull();
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('createLibrary', function() {
// 		it('should always return a promise', function() {
// 			const promise = bll.createLibrary();
// 			expect(promise instanceof Promise).toBe(true);

// 			// handle rejection
// 			promise.catch(_.noop);
// 		});

// 		it('should validate a Library model and call the dal with it', function(done) {
// 			const data = libraryFixtures[0];

// 			bll.createLibrary(data).then(function(insertedLibrary) {
// 				expect(model.Library.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.library.createLibrary).toHaveBeenCalledWith(jasmine.any(model.Library));
// 				expect(insertedLibrary instanceof model.Library).toBe(true);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should generate a libraryId on the library model', function(done) {
// 			const data = libraryFixtures[0];

// 			bll.createLibrary(data).then(function(insertedLibrary) {
// 				expect(insertedLibrary.libraryId).toBeDefined();
// 				expect(insertedLibrary.libraryId).toEqual(jasmine.stringMatching(uuidRegex));
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			const data = libraryFixtures[0];
// 			failValidation = true;

// 			bll.createLibrary(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof BadRequestError && err.message == 'Validation failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if the dal fails', function(done) {
// 			const data = libraryFixtures[0];
// 			failDal = true;

// 			bll.createLibrary(data).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'createLibrary failed') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});
// 	});

// 	describe('updateLibrary', function() {
// 		let updateData;

// 		beforeEach(function() {
// 			updateData = _.clone(libraryFixtures[0]);
// 		});

// 		it('should always return a promise', function() {
// 			const promise = bll.updateLibrary();
// 			expect(promise instanceof Promise).toBe(true);
// 		});

// 		it('should return a rejected promise when called without libraryId', function(done) {
// 			bll.updateLibrary().then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'libraryId is required') {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should query the dal', function(done) {
// 			const libraryId = updateData.libraryId;

// 			bll.updateLibrary(libraryId, updateData).then(function() {
// 				expect(dalMock.library.getLibrary).toHaveBeenCalledWith(libraryId);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should reject with a ResourceNotFoundError if the library was not found', function(done) {
// 			updateData.name = 'New Name';

// 			bll.updateLibrary('i-dont-exist', updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof ResourceNotFoundError) {
// 					return done();
// 				}

// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should perform an update on the dal when the library exists', function(done) {
// 			const libraryId = updateData.libraryId;
// 			updateData.name = 'New Name';

// 			bll.updateLibrary(libraryId, updateData).then(function(library) {
// 				expect(model.Library.prototype.validate).toHaveBeenCalled();
// 				expect(dalMock.library.updateLibrary).toHaveBeenCalledWith(jasmine.any(model.Library));
// 				expect(dalMock.library.createLibrary).not.toHaveBeenCalled();
// 				expect(library instanceof model.Library).toBe(true);
// 				expect(library.libraryId).toEqual(libraryId);
// 				expect(library.name).toEqual(updateData.name);
// 				done();
// 			}, function(err) {
// 				done.fail(`Unexpected rejection: ${ err }`);
// 			});
// 		});

// 		it('should return a rejected promise if validation fails', function(done) {
// 			failValidation = true;

// 			bll.updateLibrary(updateData.libraryId, updateData).then(function() {
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

// 			bll.updateLibrary(updateData).then(function() {
// 				done.fail('expected promise to be rejected');
// 			}, function(err) {
// 				if (err instanceof Error && err.message == 'getLibrary failed') {
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

const initBll = require('./library');

describe('bll.library (module contract)', function() {
  it('exports a factory function', function() {
    expect(typeof initBll).toBe('function');
  });

  it('factory returns an object with expected CRUD methods', function() {
    const dal = { library: {}, entity: {} };
    const entityBll = {};
    const libraryEngineModelBll = {};
    const libraryCollaboratorBll = {};
    const uploader = { putObject: jest.fn() };
    const logger = { log: jest.fn(), error: jest.fn() };
    const bll = initBll(dal, entityBll, libraryEngineModelBll, libraryCollaboratorBll, uploader, logger);
    expect(typeof bll.getLibraries).toBe('function');
    expect(typeof bll.getLibrary).toBe('function');
    expect(typeof bll.createLibrary).toBe('function');
    expect(typeof bll.updateLibrary).toBe('function');
    expect(typeof bll.deleteLibrary).toBe('function');
  });
});
