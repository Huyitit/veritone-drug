const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

const dir = require('./TokenType.js')(serviceContext);

describe('#TokenType', function () {
  describe('#name', function () {
    it('should return name', function () {
      chaiExpect(dir.name).to.equal('tokenType');
      chaiExpect(dir.before).to.equal(true);
    });
  });
  describe('#resolver', function () {
    it('should fail on  API required with user session', function () {
      try {
        dir.resolver(
          { type: 'API' },
          {},
          {
            requestContext: {
              userInfo: {
                userId: '123'
              }
            }
          },
          {}
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
      }
    });

    it('should allow user required with user session', function () {
      dir.resolver(
        { type: 'User' },
        {},
        {
          requestContext: {
            userInfo: {
              userId: '123'
            }
          }
        },
        {}
      );
    });

    it('should fail on user required with API key', function () {
      try {
        dir.resolver(
          { type: 'User' },
          {},
          {
            requestContext: {
              tokenInfo: {
                tokenType: 'api'
              },
              authTokenType: 'apikey'
            }
          },
          {}
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
      }
    });

    it('should allow API required with API key', function () {
      dir.resolver(
        { type: 'API' },
        {},
        {
          requestContext: {
            tokenInfo: {
              tokenType: 'api'
            },
            authTokenType: 'apikey'
          }
        },
        {}
      );
    });

    it('should fail on user required with JWT', function () {
      try {
        dir.resolver(
          { type: 'User' },
          {},
          {
            requestContext: {
              tokenInfo: {
                tokenType: 'jwt'
              },
              jwtToken: 'token'
            }
          },
          {}
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_allowed');
      }
    });

    it('should allow API required with JWT', function () {
      dir.resolver(
        { type: 'API' },
        {},
        {
          requestContext: {
            tokenInfo: {
              tokenType: 'jwt'
            },
            jwtToken: 'token'
          }
        },
        {}
      );
    });
  });
});
