const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();

let dal;

describe('JSON schema validator', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    dal = require('./index.js')(serviceContext);
  });

  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(typeof dal.validateEngineOutput).toEqual('function');
    });
  });

  describe('#validateEngineOutput', function () {
    it('should throw an error when new AION schema properties are invalid', async function () {
      const input = {
        internalTaskId: 'invalid_guid', // count errors: 1
        object: [
          {
            referenceId: 1, // 2
            label: 'test',
            type: 'object',
            fingerprintVector: 'invalid_value', // 3
            tags: [{ k: 'require_key', value: 'baz' }] // 4
          }
        ],
        series: [
          {
            referenceId: 1, // 5
            startTimeMs: 0,
            stopTimeMs: 0,
            object: {
              referenceId: 1.1, // 6
              tags: [{ k: 'require_key', value: 'baz' }], // 7
              label: 'nested object',
              type: 'object'
            }
          }
        ],
        embedding: [
          {
            referenceId: 1, // 8
            vector: 'invalid_value', // 9
            tags: [{ k: 'require_key', value: 'baz' }] // 10
          },
          {
            vector: ['invalid_value'] // 11
          }
        ]
      };

      let err;
      try {
        await dal.validateEngineOutput(input, {}, mockUtil.makeContext());
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(_.size(err.data)).toEqual(11);
    });
    it('should not throw an error when new AION schema properties are valid', async function () {
      const input = {
        internalTaskId: '24e16b88-461a-4baa-9e46-e662df363f7e',
        object: [
          {
            referenceId: '24e16b88-461a-4baa-9e46-e662df363f7e',
            label: 'test',
            type: 'object',
            fingerprintVector: [0.23407, 0.11176, 0.94932],
            tags: [{ key: 'foo', value: 'baz' }]
          }
        ],
        series: [
          {
            referenceId: '24e16b88-461a-4baa-9e46-e662df363f7e',
            startTimeMs: 0,
            stopTimeMs: 0,
            object: {
              referenceId: '24e16b88-461a-4baa-9e46-e662df363f7e',
              label: 'nested object',
              type: 'object',
              tags: [{ key: 'foo', value: 'baz' }]
            }
          }
        ],
        embedding: [
          {
            referenceId: '24e16b88-461a-4baa-9e46-e662df363f7e',
            vector: [0.23407, 0.11176, 0.94932],
            tags: [{ key: 'foo', value: 'baz' }]
          }
        ]
      };

      let res, err;
      try {
        res = await dal.validateEngineOutput(input, {}, mockUtil.makeContext());
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toEqual(true);
      expect(err).toBeUndefined();
    });

    describe('#Sentiment', function () {
      it('the sentiment data is invalid: Missing required field', async function () {
        const input = {
          internalTaskId: '1e54aea0-1108-4421-9488-6e3dcbed0df9',
          sentiment: {}
        };

        let err;
        try {
          await dal.validateEngineOutput(input, {}, mockUtil.makeContext());
        } catch (error) {
          err = error ? JSON.stringify(error, null, 2) : '';
        }
        expect(err).toBeDefined();
        expect(`${err}`).toContain(`sentiment is not any of`);
      });
      it('the sentiment data is invalid: dependencies valitation fails', async function () {
        const input = {
          internalTaskId: '1e54aea0-1108-4421-9488-6e3dcbed0df9',
          sentiment: {
            negativeValue: 0,
            positiveConfidence: 0.1
          }
        };

        let err;
        try {
          await dal.validateEngineOutput(input, {}, mockUtil.makeContext());
        } catch (error) {
          err = error ? JSON.stringify(error, null, 2) : '';
        }
        expect(err).toBeDefined();
        expect(`${err}`).toContain(
          `does not meet dependency required by instance.sentiment.positiveConfidence`
        );
      });
      it('should not throw any errors when validating the sentiment data', async function () {
        const input = {
          internalTaskId: '1e54aea0-1108-4421-9488-6e3dcbed0df9',
          sentiment: {
            positiveValue: 0,
            negativeValue: 0.02
          },
          object: [
            {
              label: 'test',
              type: 'text',
              text: 'sentence 1',
              sentence: 1,
              sentiment: {
                positiveValue: 0,
                negativeValue: 1
              }
            },
            {
              label: 'test',
              type: 'text',
              text: 'sentence 2',
              sentence: 2,
              sentiment: {
                positiveValue: 1,
                negativeValue: 0
              }
            }
          ],
          series: [
            {
              startTimeMs: 0,
              stopTimeMs: 0,
              words: [
                {
                  word: 'sentence 3'
                }
              ],
              sentiment: {
                positiveValue: 1,
                negativeValue: 0
              }
            },
            {
              startTimeMs: 0,
              stopTimeMs: 0,
              words: [
                {
                  word: 'sentence 4'
                }
              ],
              sentiment: {
                positiveValue: 0,
                negativeValue: 1
              }
            }
          ]
        };

        let err;
        try {
          await dal.validateEngineOutput(input, {}, mockUtil.makeContext());
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }
        expect(err).toBeUndefined();
      });
      it('should throw an error when the sentiment data is invalid', async function () {
        const input = {
          internalTaskId: '1e54aea0-1108-4421-9488-6e3dcbed0df9',
          sentiment: {
            positiveValue: 1.1, // error 1
            negativeValue: 0.02
          },
          object: [
            {
              label: 'test',
              type: 'text',
              text: 'sentence 1',
              sentence: '1x', // 2
              sentiment: {
                positiveValue: 0,
                negativeValue: 1.02 // 3
              }
            },
            {
              label: 'test',
              type: 'text',
              text: 'sentence 2',
              sentence: 2,
              sentiment: {
                positiveValue: 1,
                negativeValue: 0
              }
            }
          ],
          series: [
            {
              startTimeMs: 0,
              stopTimeMs: 0,
              words: [
                {
                  word: 'sentence 3'
                },
                {
                  word: '3'
                }
              ],
              sentiment: {
                positiveValue: 1,
                negativeValue: 0,
                positiveConfidence: 1.5, // 4
                negativeConfidence: 2.5 // 5
              }
            },
            {
              startTimeMs: 0,
              stopTimeMs: 0,
              words: [
                {
                  word: 'sentence'
                },
                {
                  word: '4'
                }
              ],
              sentiment: {
                positiveValue: 2, // 6
                negativeValue: 3, // 7
                positiveConfidence: 0.5,
                negativeConfidence: 0.5
              }
            }
          ]
        };

        let err;
        try {
          await dal.validateEngineOutput(input, {}, mockUtil.makeContext());
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(_.size(err.data)).toEqual(7);
      });
    });
  });
});
