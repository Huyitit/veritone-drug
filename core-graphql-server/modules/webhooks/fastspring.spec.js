const chaiExpect = require('chai').expect;
const crypto = require('crypto');
const httpMock = require('node-mocks-http');

const Fastspring = require('./fastspring.js');

// Minimal DI service context. TODO_TESTS calls for serviceContext DI with
// jest.fn() over the DAL + write.query path the handlers touch.
function makeServiceContext(opts) {
  const accountProfile = (opts && opts.accountProfile) || 'sss-redact-business';
  const orgId = (opts && opts.orgId) || '7682';
  return {
    dal: {
      organization: {
        getOrganization: jest
          .fn()
          .mockResolvedValue({ kvp: { accountProfile } })
      }
    },
    dbConnections: {
      media_platform: {
        write: {
          query: jest.fn().mockResolvedValue([{ organization_id: orgId }])
        }
      }
    }
  };
}

function orderEvent(orgId) {
  return {
    id: 'evt-1',
    type: 'order.completed',
    processed: false,
    data: {
      tags: { orgId: orgId || '7682' },
      items: [
        {
          subscription: 'sub-1',
          attributes: {
            type: 'subscription',
            mediaLimit: '1000',
            period: 'monthly',
            allowMediaOverage: 'true'
          }
        }
      ]
    }
  };
}

describe('fastspring.js', function () {
  describe('#isValidSignature (TODO #1 — HMAC verification)', function () {
    const secret = 'veritone-self-service';
    const rawBody = Buffer.from('{"events":[]}');
    const goodSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest()
      .toString('base64');

    it('returns true when x-fs-signature matches the HMAC of rawBody', function () {
      const fs = new Fastspring(makeServiceContext());
      const req = { rawBody, headers: { 'x-fs-signature': goodSig } };
      chaiExpect(fs.isValidSignature(req, secret)).to.equal(true);
    });

    it('returns false when the signature does not match', function () {
      const fs = new Fastspring(makeServiceContext());
      const req = { rawBody, headers: { 'x-fs-signature': 'forged-sig' } };
      chaiExpect(fs.isValidSignature(req, secret)).to.equal(false);
    });

    it('returns false when rawBody is missing', function () {
      const fs = new Fastspring(makeServiceContext());
      const req = { headers: { 'x-fs-signature': goodSig } };
      chaiExpect(fs.isValidSignature(req, secret)).to.equal(false);
    });
  });

  describe('#handleOrderCompleted (TODO #2 — account-profile guard)', function () {
    it('returns false and does not mutate the DB for non-sss-redact orgs', async function () {
      const ctx = makeServiceContext({ accountProfile: 'enterprise-standard' });
      const fs = new Fastspring(ctx);
      const result = await fs.handleOrderCompleted(orderEvent());
      chaiExpect(result).to.equal(false);
      chaiExpect(
        ctx.dbConnections.media_platform.write.query.mock.calls.length
      ).to.equal(0);
    });
  });

  describe('#handleEvents (TODO #3 — request dispatch and filter)', function () {
    it('responds 400 when the request body is empty', function () {
      const fs = new Fastspring(makeServiceContext());
      const req = httpMock.createRequest({ body: {} });
      const res = httpMock.createResponse();
      fs.handleEvents(req, res);
      chaiExpect(res.statusCode).to.equal(400);
    });

    it('responds 400 when there are no processable subscription events', function () {
      const fs = new Fastspring(makeServiceContext());
      const req = httpMock.createRequest({
        body: {
          events: [
            {
              id: 'x',
              type: 'order.completed',
              processed: true,
              data: {
                tags: { orgId: '7682' },
                items: [{ attributes: { type: 'subscription' } }]
              }
            }
          ]
        }
      });
      const res = httpMock.createResponse();
      fs.handleEvents(req, res);
      chaiExpect(res.statusCode).to.equal(400);
    });

    it('responds 202 with the processed id for a valid subscription order', function () {
      const fs = new Fastspring(makeServiceContext());
      const req = httpMock.createRequest({ body: { events: [orderEvent()] } });
      const res = httpMock.createResponse();
      fs.handleEvents(req, res);
      chaiExpect(res.statusCode).to.equal(202);
      chaiExpect(res._getData()).to.contain('evt-1');
    });
  });
});
