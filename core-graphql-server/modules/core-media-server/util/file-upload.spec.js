'use strict';

/* global describe, it, expect, beforeEach */
/* eslint func-names:off */

const fs = require('fs');
const { Writable, PassThrough } = require('stream');

// storage.shim is mocked so the SUT cannot accidentally import real AWS deps.
// The mock module's return value is wired below as the second arg to fileUploadInit.
jest.mock('@veritone/core-server-base/storage.shim');
const mockStorageModule = require('@veritone/core-server-base/storage.shim');

// file-upload must be required last as its dependencies are mocked above
const fileUploadInit = require('./file-upload');

global.__base = './';
const content = 'test';
const destFilePath = '/libraryId/myfile';
const baseUri = 'https://s3.amazon.com';
const config = {
  s3: {
    region: 'us-east-1',
    maxRetry: 1,
    bucket: 'library-test'
  }
};

class MockReadStream {
  constructor() {
    this.events = {};
  }
  on(evt, fn) {
    this.events[evt] = fn;
    if (evt === 'open') fn();
  }
}

describe('util/file-upload', function() {
  let uploader,
    fsCreateReadStreamSpy,
    fsMkdirSpy,
    fsStatSpy,
    fsUnlinkSpy,
    fsWriteFileSpy,
    fsWriteStream,
    fsWriteStreamSpy,
    mockStoragePutObject;
  let mkdirError, writeFileError, unlinkError;
  const mockReadStream = new MockReadStream();

  beforeEach(function() {
    mockStoragePutObject = jest
      .fn((dst, cType, sz, content, cb) => {
        cb(null, baseUri + dst);
      })
      .mockName('mockStoragePutObject');

    const mockStorageInstance = { putObject: mockStoragePutObject };
    mockStorageModule.mockImplementation(() => mockStorageInstance);

    // The SUT takes (app, storage) — pass the mock storage instance as the second arg.
    // The mock module is a jest.fn so calling it returns the instance above.
    uploader = fileUploadInit({ config }, mockStorageInstance);
    mkdirError = writeFileError = unlinkError = undefined;

    fsMkdirSpy = jest
      .spyOn(fs, 'mkdir')
      .mockImplementation((dir, cb) => cb(mkdirError));
    fsWriteFileSpy = jest
      .spyOn(fs, 'writeFile')
      .mockImplementation((file, content, enc, cb) => cb(writeFileError));
    fsUnlinkSpy = jest
      .spyOn(fs, 'unlink')
      .mockImplementation((file, cb) => cb(unlinkError));
    fsStatSpy = jest.spyOn(fs, 'statSync').mockImplementation(file => {
      return { size: content.length };
    });
    fsCreateReadStreamSpy = jest
      .spyOn(fs, 'createReadStream')
      .mockImplementation(filename => mockReadStream);
    fsWriteStream = new Writable();
    fsWriteStreamSpy = jest
      .spyOn(fs, 'createWriteStream')
      .mockReturnValue(fsWriteStream);
  });

  it('should return an object containing functions', function() {
    expect(typeof uploader).toEqual('object');
    expect(uploader).toEqual(
      expect.objectContaining({
        uploadContent: expect.any(Function),
        readFromURL: expect.any(Function),
        createWriteStream: expect.any(Function)
      })
    );
  });

  describe('uploadContent()', function() {
    it('should throw an error when providing invalid content', function() {
      expect(() => uploader.uploadContent([])).toThrowError(Error, /stream/i);
    });

    it('should throw an error if destFilePath is not provided', function() {
      expect(() => uploader.uploadContent('test', 'text/plain')).toThrowError(
        Error,
        'destFilePath is required'
      );
    });

    it('should resolve to the uploaded file location on success', function(done) {
      const contentType = 'text/plain';
      const localFile = 'tmp/myfile';

      uploader.uploadContent(content, contentType, destFilePath).then(
        function(location) {
          try {
            expect(location).toEqual(baseUri + destFilePath);
            expect(fsMkdirSpy).toHaveBeenCalled();
            expect(fsWriteFileSpy).toHaveBeenCalledWith(
              localFile,
              content,
              expect.any(String),
              expect.any(Function)
            );
            expect(fsWriteStreamSpy).not.toHaveBeenCalled();
            expect(mockStoragePutObject).toHaveBeenCalledWith(
              destFilePath,
              contentType,
              content.length,
              mockReadStream,
              expect.any(Function)
            );
            expect(fsUnlinkSpy).toHaveBeenCalledWith(
              localFile,
              expect.any(Function)
            );
            done();
          } catch (e) {
            done(e);
          }
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should proceed even if mkdir fails', function(done) {
      mkdirError = new Error('dir exists');

      uploader.uploadContent('test', 'text/plain', destFilePath).then(
        function(location) {
          try {
            expect(location).toEqual(baseUri + destFilePath);
            done();
          } catch (e) {
            done(e);
          }
        },
        function(err) {
          done(new Error(`Unexpected rejection: ${err}`));
        }
      );
    });

    it('should reject if failing to delete the temp file', function(done) {
      unlinkError = new Error('dir exists');

      uploader.uploadContent('test', 'text/plain', destFilePath).then(
        function() {
          done(new Error('expected a rejection'));
        },
        function(err) {
          if (err === unlinkError) {
            done();
          } else {
            done(new Error(`Unexpected rejection reason: ${err}`));
          }
        }
      );
    });

    describe('when providing a stream', function() {
      const contentType = 'text/plain';
      let contentStream;
      let writeStreamError, readStreamError;

      beforeEach(function() {
        fsWriteFileSpy.mockClear();
        writeStreamError = readStreamError = undefined;
        contentStream = new PassThrough();

        jest.spyOn(contentStream, 'pipe').mockImplementation(function() {
          if (readStreamError) {
            contentStream.emit('error', readStreamError);
          } else if (writeStreamError) {
            fsWriteStream.emit('error', writeStreamError);
          } else {
            setTimeout(() => fsWriteStream.emit('finish'));
          }
        });

        contentStream.resume = jest.fn();
        fsWriteStream.end = jest.fn();
      });

      it('should stream the file to disk and upload it', function(done) {
        const localFile = 'tmp/myfile';

        uploader.uploadContent(contentStream, contentType, destFilePath).then(
          function(location) {
            try {
              expect(location).toEqual(baseUri + destFilePath);
              expect(fsMkdirSpy).toHaveBeenCalled();
              expect(fsWriteFileSpy).not.toHaveBeenCalled();
              expect(fsWriteStreamSpy).toHaveBeenCalledWith(localFile);
              expect(mockStoragePutObject).toHaveBeenCalledWith(
                destFilePath,
                contentType,
                content.length,
                mockReadStream,
                expect.any(Function)
              );
              expect(fsUnlinkSpy).toHaveBeenCalledWith(
                localFile,
                expect.any(Function)
              );
              done();
            } catch (e) {
              done(e);
            }
          },
          function(err) {
            done(new Error(`Unexpected rejection: ${err}`));
          }
        );
      });

      it('should reject and end the write stream if the content stream emits an error', function(done) {
        readStreamError = new Error('something happened');

        uploader.uploadContent(contentStream, contentType, destFilePath).then(
          function() {
            done(new Error('expected a rejection'));
          },
          function(err) {
            if (err === readStreamError) {
              try {
                expect(fsWriteStream.end).toHaveBeenCalled();
                expect(mockStoragePutObject).not.toHaveBeenCalled();
                done();
              } catch (e) {
                done(e);
              }
            } else {
              done(new Error(`Unexpected rejection reason: ${err}`));
            }
          }
        );
      });

      it('should reject and resume the content stream if the write stream emits an error', function(done) {
        writeStreamError = new Error('write failed');

        uploader.uploadContent(contentStream, contentType, destFilePath).then(
          function() {
            done(new Error('expected a rejection'));
          },
          function(err) {
            if (err === writeStreamError) {
              try {
                expect(contentStream.resume).toHaveBeenCalled();
                expect(mockStoragePutObject).not.toHaveBeenCalled();
                done();
              } catch (e) {
                done(e);
              }
            } else {
              done(new Error(`Unexpected rejection reason: ${err}`));
            }
          }
        );
      });
    });
  });
});
