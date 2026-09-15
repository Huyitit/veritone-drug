const jwt = require('jsonwebtoken');

const serviceContext = require('../../../test/serviceContext.mock.js')();
serviceContext.config.jwt = { ...(serviceContext.config.jwt || {}), secret: 'test-secret' };

const util = require('./util.js')(serviceContext);

const BATCH_OPERATIONS = ['job:create', 'job:read', 'job:update', 'job:delete'];

function decode(token) {
  return jwt.verify(token, 'test-secret');
}

describe('batchActionsAPI bll util.createBatchJwtToken', () => {
  const userInfoContext = {
    requestContext: {
      userInfo: {
        userId: 'u1',
        organization: { organizationGuid: 'guid-1' }
      }
    }
  };

  it('mints a token carrying the org/user claims and the full batch scope', () => {
    const token = util.createBatchJwtToken(userInfoContext, { batchId: 'b1', organizationId: 7642 });
    const decoded = decode(token);

    expect(decoded.contentApplicationId).toBe('guid-1');
    expect(decoded.userId).toBe('u1');
    expect(decoded.contentOrganizationId).toBe(7642);
    expect(decoded.organizationId).toBe(7642);
    expect(decoded.scope[0].actions).toEqual(BATCH_OPERATIONS);
    expect(decoded.scope[0].resources).toEqual({ batchId: 'b1' });
  });

  it('includes batchProcessId in the scope resources when provided', () => {
    const token = util.createBatchJwtToken(userInfoContext, {
      batchId: 'b1',
      batchProcessId: 'bp9',
      organizationId: 7642
    });
    expect(decode(token).scope[0].resources).toEqual({ batchId: 'b1', batchProcessId: 'bp9' });
  });

  it('signs with the core-graphql-server issuer, engine-run subject, and a 1-day expiry', () => {
    const decoded = decode(util.createBatchJwtToken(userInfoContext, { batchId: 'b1', organizationId: 1 }));
    expect(decoded.iss).toBe('core-graphql-server');
    expect(decoded.sub).toBe('engine-run');
    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
  });

  it('falls back to the jwtToken userId/organizationGuid when userInfo is absent', () => {
    const context = {
      requestContext: {
        jwtToken: { userId: 'u2', organizationGuid: 'guid-2' }
      }
    };
    const decoded = decode(util.createBatchJwtToken(context, { batchId: 'b1', organizationId: 5 }));
    expect(decoded.userId).toBe('u2');
    expect(decoded.contentApplicationId).toBe('guid-2');
  });

  it('throws NotAllowed when the userId is missing', () => {
    const context = { requestContext: { userInfo: { organization: { organizationGuid: 'guid-1' } } } };
    expect(() => util.createBatchJwtToken(context, { batchId: 'b1', organizationId: 1 })).toThrow(
      'missing userId or organizationGuid'
    );
  });

  it('throws NotAllowed when the organizationGuid is missing', () => {
    const context = { requestContext: { userInfo: { userId: 'u1' } } };
    expect(() => util.createBatchJwtToken(context, { batchId: 'b1', organizationId: 1 })).toThrow(
      'missing userId or organizationGuid'
    );
  });
});
