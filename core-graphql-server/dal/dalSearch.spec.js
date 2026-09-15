const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
//const httpMock = require('node-mocks-http');
const moment = require('moment');

// set up HTTP mocking
const nock = require('nock');
const coreSearchUrl = 'http://localhost/v1/';
const scope = nock(coreSearchUrl);

jest.mock('request-promise');
const httpResponses = [];

require('request-promise').mockImplementation((uri) => {
  const cur = httpResponses.shift();
  if (cur.error) return Promise.reject(cur.error);
  else return Promise.resolve(cur.data);
});

// get mock base service context
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);

_.set(serviceContext, 'config.services.core-search-server.uri', coreSearchUrl);

const dal = require('./dalSearch.js')(serviceContext);

describe('dalSearch.js', function () {
  afterAll(() => {
    jest.resetModules();
  });

  describe('#searchMentions', function () {
    it('should search mentions', async function () {
      httpResponses.push({ data: { foo1: 'bar' } });
      const res = await dal.searchMentions(mockUtil.makeContext(), {
        search: { fooIn1: 'bar' }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.jsondata).to.exist;
      chaiExpect(res.jsondata.foo1).to.equal('bar');
    });

    it('should search mentions and handle error', async function () {
      httpResponses.push({
        error: {
          error: {
            error: {
              errors: [
                {
                  fooIn2: 'bar'
                }
              ]
            }
          }
        }
      });
      try {
        await dal.searchMentions(mockUtil.makeContext(), {
          search: { fooOut2: 'bad' }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('service_unavailable');
        chaiExpect(err.internalData.uri).to.equal(
          coreSearchUrl + 'search/mention'
        );
      }
    });

    it('should search mentions and map request timeout error message', async function () {
      httpResponses.push({
        error: {
          statusCode: 503,
          error: {
            error: {
              errors: [
                {
                  message: 'Search store query error',
                  reason: 'Request timed out',
                  domain: 'dataServices'
                }
              ]
            }
          }
        }
      });
      try {
        await dal.searchMentions(mockUtil.makeContext(), {
          search: { fooOut2: 'bad' }
        });
        throw new Error('Expected searchMentions to throw');
      } catch (err) {
        chaiExpect(err.message).to.equal(
          'The search service is temporarily unavailable due to a timeout. Please try again later.'
        );
      }
    });

    it('should search mentions with aggregate', async function () {
      httpResponses.push({ data: { foo2: 'bar' } });

      const res = await dal.searchMentions(mockUtil.makeContext(), {
        search: { fooIn3: 'baz', aggregate: true }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.jsondata).to.exist;
      chaiExpect(res.jsondata.foo2).to.equal('bar');
    });
  });

  describe('#searchMedia', function () {
    it('should search media', async function () {
      httpResponses.push({ data: { foo1: 'bar' } });
      const res = await dal.searchMedia(mockUtil.makeContext(), {
        search: { fooIn1: 'bar' }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.jsondata).to.exist;
      chaiExpect(res.jsondata.foo1).to.equal('bar');
    });

    it('should search media and handle error', async function () {
      httpResponses.push({
        error: {
          error: {
            error: {
              errors: [
                {
                  fooIn2: 'bar'
                }
              ]
            }
          }
        }
      });
      try {
        await dal.searchMedia(mockUtil.makeContext(), {
          search: { fooOut2: 'bad' }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('service_unavailable');
        chaiExpect(err.internalData.uri).to.equal(coreSearchUrl + 'search');
      }
    });

    it('should search media and map request timeout error message', async function () {
      httpResponses.push({
        error: {
          statusCode: 503,
          error: {
            error: {
              errors: [
                {
                  message: 'Search store query error',
                  reason: 'Request timed out',
                  domain: 'dataServices'
                }
              ]
            }
          }
        }
      });
      try {
        await dal.searchMedia(mockUtil.makeContext(), {
          search: { fooOut2: 'bad' }
        });
        throw new Error('Expected searchMedia to throw');
      } catch (err) {
        chaiExpect(err.message).to.equal(
          'The search service is temporarily unavailable due to a timeout. Please try again later.'
        );
      }
    });

    it('should search media with aggregate', async function () {
      httpResponses.push({ data: { foo2: 'bar' } });

      const res = await dal.searchMedia(mockUtil.makeContext(), {
        search: { fooIn3: 'baz', aggregate: true }
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.jsondata).to.exist;
      chaiExpect(res.jsondata.foo2).to.equal('bar');
    });
  });
});
