'use strict';

const newS3Helper = require('./storage.s3');

describe('util/storage.s3', function() {
  describe('newS3Helper()', function() {
    it('throws when config.s3 is missing from the app config', function() {
      expect(() => newS3Helper({ config: {} })).toThrow('Missing s3 config!');
    });

    it('throws when config.s3.region is missing', function() {
      expect(() =>
        newS3Helper({ config: { s3: { maxRetry: 3 } } })
      ).toThrow('Missing from s3 config region!');
    });

    it('throws when config.s3.maxRetry is not a number', function() {
      expect(() =>
        newS3Helper({ config: { s3: { region: 'us-east-1', maxRetry: '3' } } })
      ).toThrow('Missing from s3 config maxRetry!');
    });
  });
});
