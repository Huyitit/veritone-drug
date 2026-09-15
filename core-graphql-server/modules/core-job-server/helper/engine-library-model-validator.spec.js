const Task = require('../model/task');

describe('core-job-server.helper.engine-library-model-testContext.validator.js', () => {
  let testContext = {};

  const token = 'xxxxx-xx-xxxxxxxx-xxxxxxxxx';
  const config = {
    'veritone-api': {}
  };

  const libraryEngineModelFixture = {
    libraryEngineModelId: 'f8db0765-08be-49de-a6bb-80ddffcc74f9',
    libraryId: '8f69b517-4269-4831-8d5f-03771f2acea8',
    engineId: 'imagedetection-facerecognition-kairos',
    trainStatus: 'complete'
  };
  const mockedGetLibraryEngineModel = jest.fn();
  const mockedGetLibraryEngineModels = jest.fn();
  const mockedGetLibrary = jest.fn();

  testContext.validatorGenerator = require('./engine-library-model-validator');
  jest.mock('request-promise');
  testContext.mockRequest = require('request-promise');

  describe('on initialization', () => {
    it('should throw an error if called without arguments', () => {
      try {
        expect(testContext.validatorGenerator()).toThrowError(/is required/);
      } catch (e) {
        // nothing
      }
    });

    it('should throw an error if called without all required arguments', () => {
      try {
        expect(testContext.validatorGenerator(token)).toThrowError(
          /is required/
        );
      } catch (e) {
        // nothing
      }
    });

    it('should return a testContext.validator function', () => {
      testContext.validator = testContext.validatorGenerator(token, config);
      expect(typeof testContext.validator).toEqual('function');
    });
  });

  describe('the testContext.validator function', () => {
    let task;

    beforeEach(() => {
      const mockedDalLibrary = {
        getLibraryEngineModel: mockedGetLibraryEngineModel,
        getLibrary: mockedGetLibrary,
        getLibraryEngineModels: mockedGetLibraryEngineModels
      };

      testContext.validator = testContext.validatorGenerator(mockedDalLibrary);
      task = new Task({
        engineId: libraryEngineModelFixture.engineId,
        taskPayload: {
          libraryId: libraryEngineModelFixture.libraryId
        }
      });
    });

    it('should throw an error if called without a task', () => {
      try {
        expect(testContext.validator()).toThrowError(/task is required/);
      } catch (e) {
        // nothing
      }
    });

    it('should throw an error if called without a callback', () => {
      try {
        expect(testContext.validator(task)).toThrowError(
          /callback is required/
        );
      } catch (e) {
        // nothing
      }
    });

    it('should return without calling the api when there is no libraryId in the payload', (done) => {
      testContext.validator(
        { taskPayload: {} },
        function (err, validationErrors) {
          expect(err).toBeUndefined();
          expect(validationErrors).toBeUndefined();
          expect(testContext.mockRequest).not.toHaveBeenCalled();
          done();
        }
      );
    });

    describe('for a train task', () => {
      beforeEach(() => {
        task.taskPayload.mode = 'library-train';
        task.taskPayload.libraryEngineModelId =
          libraryEngineModelFixture.libraryEngineModelId;
      });

      it('should return a validation error if the task is a train task and no libraryEngineModelId is provided', (done) => {
        task.taskPayload.libraryEngineModelId = null;

        testContext.validator(task, function (err, validationErrors) {
          expect(testContext.mockRequest).not.toHaveBeenCalled();
          expect(err).toBe(null);
          expect(typeof validationErrors).toEqual('object');
          expect(validationErrors['taskPayload.libraryEngineModelId']).toMatch(
            /libraryEngineModelId is required/
          );

          done();
        });
      });

      it('should fetch the libraryEngineModel from the libraries api', (done) => {
        mockedGetLibraryEngineModel.mockImplementationOnce(() =>
          Promise.resolve({
            id: '123',
            libraryId: libraryEngineModelFixture.libraryId,
            engineId: libraryEngineModelFixture.engineId
          })
        );
        testContext.validator(task, function (err, validationErrors) {
          expect(mockedGetLibraryEngineModel).toHaveBeenCalledWith(
            expect.objectContaining({
              id: libraryEngineModelFixture.libraryEngineModelId
            })
          );

          expect(err).toBe(null);
          expect(validationErrors).toBeUndefined();

          done();
        });
      });

      it('should return a validation error if the library engine model doesnt exist', (done) => {
        testContext.mockRequest.mockReturnValueOnce({});
        testContext.validator(task, function (err, validationErrors) {
          expect(err).toBe(null);
          expect(typeof validationErrors).toEqual('object');
          expect(validationErrors['taskPayload.libraryEngineModelId']).toMatch(
            /does not exist/
          );

          done();
        });
      });

      it('should return a validation error if the library engine model is not associated with the engineId', (done) => {
        mockedGetLibraryEngineModel.mockImplementationOnce(() =>
          Promise.resolve({
            id: '123',
            libraryId: libraryEngineModelFixture.libraryId
          })
        );

        testContext.validator(task, function (err, validationErrors) {
          expect(err).toBe(null);
          expect(typeof validationErrors).toEqual('object');
          expect(validationErrors['taskPayload.libraryEngineModelId']).toMatch(
            /does not belong to engine/
          );

          done();
        });
      });

      it('should return a validation error if engine is not library-enabled', (done) => {
        task.engine = { libraryRequired: false };
        testContext.validator(task, function (err, validationErrors) {
          expect(err).toBe(null);
          expect(typeof validationErrors).toEqual('object');
          expect(validationErrors['taskPayload.runMode']).toMatch(
            /does not use libraries and cannot accept library-train run mode/
          );
          done();
        });
      });
    });

    describe('for a normal task', () => {
      it('should call the libraries api client and add libraryEngineModelId to the taskPayload', (done) => {
        mockedGetLibrary.mockImplementationOnce(() => {
          return Promise.resolve({ id: libraryEngineModelFixture.libraryId });
        });
        mockedGetLibraryEngineModels.mockImplementationOnce(() =>
          Promise.resolve({
            records: [
              {
                id: libraryEngineModelFixture.libraryEngineModelId,
                libraryId: libraryEngineModelFixture.libraryId,
                engineId: libraryEngineModelFixture.engineId
              }
            ]
          })
        );

        testContext.validator(task, function (err, validationErrors) {
          expect(!err).toBe(true);
          expect(!validationErrors).toBe(true);

          expect(mockedGetLibraryEngineModels).toHaveBeenCalledWith(
            expect.objectContaining({
              ownerOrgId: undefined,
              libraryId: libraryEngineModelFixture.libraryId,
              engineId: libraryEngineModelFixture.engineId,
              trainStatus: 'complete',
              limit: 1
            })
          );

          expect(task.taskPayload.libraryEngineModelId).toBeDefined();
          expect(task.taskPayload.libraryEngineModelId).toEqual(
            libraryEngineModelFixture.libraryEngineModelId
          );

          done();
        });
      });

      it('should call the callback with an error if the api request fails', (done) => {
        mockedGetLibrary.mockImplementationOnce(() => {
          return Promise.reject('failure');
        });

        testContext.validator(task, function (err, validationErrors) {
          expect(mockedGetLibrary).toHaveBeenCalled();
          expect(err).toBeNull();
          expect(validationErrors).toBeDefined();
          expect(task.taskPayload.libraryEngineModelId).toBeUndefined();

          done();
        });
      });

      it('should return a validation error if the library engine model doesnt exist', (done) => {
        mockedGetLibrary.mockImplementationOnce(() => {
          return Promise.resolve({ id: libraryEngineModelFixture.libraryId });
        });
        mockedGetLibraryEngineModels.mockImplementationOnce(() =>
          Promise.resolve({
            records: []
          })
        );

        testContext.validator(task, function (err, validationErrors) {
          expect(mockedGetLibraryEngineModels).toHaveBeenCalled();

          expect(err).toBe(null);
          expect(typeof validationErrors).toEqual('object');
          expect(validationErrors['taskPayload.libraryId']).toMatch(
            /engine has not been trained/
          );
          expect(task.taskPayload.libraryEngineModelId).toBeUndefined();

          done();
        });
      });
    });
  });
});
