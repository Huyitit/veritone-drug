const chaiExpect = require('chai').expect; //require('expect.js');
const _ = require('lodash');
const config = {
  directiveValidation: {
    scopes: {
      additionalRights: ['foo:create', 'bar:create', 'foo:read']
    }
  },
  tokenFragmentLength: 7,
  recordingIdParser: {
    prefix: 'mri-',
    baseUri: 'https://api.aws-dev.veritone.com/media-streamer'
  },
  s3: {
    region: 'us-east-1'
  }
};
const dal = require('./internalToken.js')({ config });

describe('internalToken', function () {
  describe('#getTokenTag()', function () {
    it('should extract token correctly', function () {
      chaiExpect(dal.getTokenTag('foo')).to.equal('');
      chaiExpect(dal.getTokenTag('foo:234h5g2345g234hg523jh5')).to.equal('foo');
      chaiExpect(dal.getTokenTag('')).to.equal('');
      chaiExpect(dal.getTokenTag(null)).to.equal('');
    });
  });

  describe('#obscureToken', function () {
    it('should create obscured token', function () {
      const token =
        'foo:24b982635dc59b89e018d6995e634900ead0ddb3043ee18d8e38efbbd225011d3dd7bd9729cd0645';
      const obs = dal.obscureToken(token);
      chaiExpect(obs).to.equal('foo:24b9826...9cd0645');
      chaiExpect(dal.obscureToken('')).to.equal('');
      chaiExpect(dal.obscureToken(null)).to.equal('');
      chaiExpect(dal.obscureToken('foo:123')).to.equal('foo:123');
      chaiExpect(dal.obscureToken('123423545345')).to.equal('123423545345');
      chaiExpect(
        dal.obscureToken(
          '24b982635dc59b89e018d6995e634900ead0ddb3043ee18d8e38efbbd225011d3dd7bd9729cd0645'
        )
      ).to.equal('24b9826...9cd0645');
      chaiExpect(
        dal.obscureToken(
          'watcher-dropbox-worker:c189fcfe0f604075b0c5974f5d2270562ab6a53df70146feaf3d3e3af1b7d50b'
        )
      ).to.equal('watcher-dropbox-worker:c189fcf...1b7d50b');
    });
  });

  describe('#generateToken', function () {
    it('should create obscured token', function () {
      const t1 = dal.generateToken('foo');
      chaiExpect(t1).to.exist;
      chaiExpect(t1.length).to.equal(84);
      chaiExpect(t1.startsWith('foo:')).to.equal(true);
    });
  });

  describe('#listAllRights', function () {
    it('should list all available rights', function () {
      const res = dal.listAllRights({}, {});
      chaiExpect(res).to.exist;
      chaiExpect(res.length > 1).to.equal(true);
    });
  });

  describe('#validateTag', function () {
    it('should enforce length', function () {
      chaiExpect(dal.validateTag('111111111111111111111111111111')).to.equal(
        true
      );
      chaiExpect(
        dal.validateTag('111111111111111111111111111111111111')
      ).to.equal(false);
    });
    it('should require value', function () {
      chaiExpect(dal.validateTag('')).to.equal(false);
      chaiExpect(dal.validateTag(null)).to.equal(false);
      chaiExpect(dal.validateTag(undefined)).to.equal(false);
    });
    it('should accept valid chars', function () {
      chaiExpect(dal.validateTag('123abced')).to.equal(true);
      chaiExpect(dal.validateTag('123abced:2354-kd3.09')).to.equal(true);
    });
    it('should reject invalid chars', function () {
      chaiExpect(dal.validateTag('123abced:2354-kd#3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd@3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd!3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd&3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd$3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd%3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd*3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd()3')).to.equal(false);
      chaiExpect(dal.validateTag('123abced:2354-kd,3')).to.equal(false);
    });
  });
  describe('#validateRights', function () {
    it('should accept valid rights list', function () {
      const fun = function () {
        dal.validateRights([
          'job.create',
          'task:create',
          'discovery.folder.create'
        ]);
      };
      chaiExpect(fun).to.not.throw();
    });
    it('should reject invalid rights', function () {
      const fun = function () {
        dal.validateRights([
          'job.whatever',
          'task:create',
          'discovery.watchlist.update'
        ]);
      };
      chaiExpect(fun).to.throw();
    });
    it('should reject banned rights', function () {
      let fun = function () {
        dal.validateRights([
          'superadmin',
          'job.create',
          'task:create',
          'discovery.watchlist.update'
        ]);
      };
      chaiExpect(fun).to.throw();
      fun = function () {
        dal.validateRights([
          'veritone.superadmin',
          'job.create',
          'task:create',
          'discovery.watchlist.update'
        ]);
      };
      chaiExpect(fun).to.throw();
      fun = function () {
        dal.validateRights([
          'veritone:superadmin',
          'job.create',
          'task:create',
          'discovery.watchlist.update'
        ]);
      };
      chaiExpect(fun).to.throw();
    });
  });

  describe('#getInternalTokens() id obfuscation (VE-27611 row 12)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();
    const rawId = 'usertoken:abcdefghijklmnopqrstuvwxyz1234567890';

    it('should obscure the id by default (internalToken.obscureIds defaults to true)', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          id: rawId,
          json: { tokenLabel: 'my label', rights: ['foo:read'] }
        }
      ]);

      const res = await fullDal.getInternalTokens(mockUtil.makeContext(), {});

      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].id).to.not.equal(rawId);
      chaiExpect(res.records[0].id).to.equal(fullDal.obscureToken(rawId));
    });

    it('should return the raw id when internalToken.obscureIds is explicitly false', async function () {
      serviceContext.config.internalToken = { obscureIds: false };
      try {
        serviceContext.dbConnections['sso'].read._push([
          {
            id: rawId,
            json: { tokenLabel: 'my label', rights: ['foo:read'] }
          }
        ]);

        const res = await fullDal.getInternalTokens(mockUtil.makeContext(), {});

        chaiExpect(res.count).to.equal(1);
        chaiExpect(res.records[0].id).to.equal(rawId);
      } finally {
        delete serviceContext.config.internalToken;
      }
    });

    it('should support pagination fields on the returned page', async function () {
      serviceContext.dbConnections['sso'].read._push([
        { id: rawId, json: { tokenLabel: 'a', rights: [] } },
        {
          id: 'othertoken:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
          json: { tokenLabel: 'b', rights: [] }
        }
      ]);

      const res = await fullDal.getInternalTokens(mockUtil.makeContext(), {
        limit: 30,
        offset: 0
      });

      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records.length).to.equal(2);
      chaiExpect(res.limit).to.equal(30);
      chaiExpect(res.offset).to.equal(0);
    });
  });

  describe('#approveInternalToken() self-approval guard (VE-27378 row 4)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();
    // matches the userId embedded in test/tokenContextUser.json, which is
    // what mockUtil.makeContext() (default authType 'user') resolves to.
    const selfUserId = '513e96ec-2bea-49a5-9d98-dc74ac19b396';

    it('should throw NotAllowed when the approver is the same user who requested the token', async function () {
      const tokenId = 'admintoken:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: true,
            isPending: true,
            requestorId: selfUserId,
            requested_rights: ['foo:read']
          }
        }
      ]);

      let err;
      try {
        await fullDal.approveInternalToken(mockUtil.makeContext(), {
          input: { id: tokenId }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(err.data.requestorId).to.equal(selfUserId);
    });
  });

  describe('#approveInternalToken() already-revoked / already-approved guards (VE-27378 row 5)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();

    it('should throw InvalidInput when the token has already been revoked', async function () {
      const tokenId = 'admintoken:cccccccccccccccccccccccccccccccc';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: true,
            isPending: false,
            requestorId: 'someone-else',
            rights: []
          }
        }
      ]);

      let err;
      try {
        await fullDal.approveInternalToken(mockUtil.makeContext(), {
          input: { id: tokenId }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.status).to.equal('revoked');
    });

    it('should throw InvalidInput when the token is already active (already approved)', async function () {
      const tokenId = 'admintoken:dddddddddddddddddddddddddddddddd';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: false,
            isPending: false,
            requestorId: 'someone-else',
            rights: ['foo:read']
          }
        }
      ]);

      let err;
      try {
        await fullDal.approveInternalToken(mockUtil.makeContext(), {
          input: { id: tokenId }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.status).to.equal('active');
    });
  });

  describe('#approveInternalToken() rights swap on approval (VE-27378 row 6)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();
    const approverUserId = '513e96ec-2bea-49a5-9d98-dc74ac19b396';

    it('should move requested_rights into rights, clear isRevoked/isPending/requestId, and stamp approverId/approvedDateTime', async function () {
      const tokenId = 'admintoken:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: true,
            isPending: true,
            requestId: 'req-123',
            requestorId: 'someone-else',
            requested_rights: ['foo:read', 'bar:create']
          }
        }
      ]);

      let capturedJson;
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: tokenId,
            json: { isRevoked: false, rights: ['foo:read', 'bar:create'] }
          }
        ],
        false,
        [],
        (sql, values) => {
          capturedJson = values[0];
          return true;
        }
      );

      const res = await fullDal.approveInternalToken(mockUtil.makeContext(), {
        input: { id: tokenId }
      });

      chaiExpect(res).to.exist;
      chaiExpect(capturedJson.rights).to.deep.equal(['foo:read', 'bar:create']);
      chaiExpect(capturedJson.requested_rights).to.not.exist;
      chaiExpect(capturedJson.requestedRights).to.not.exist;
      chaiExpect(capturedJson.isRevoked).to.equal(false);
      chaiExpect(capturedJson.isPending).to.not.exist;
      chaiExpect(capturedJson.requestId).to.not.exist;
      chaiExpect(capturedJson.approverId).to.equal(approverUserId);
      chaiExpect(capturedJson.approvedDateTime).to.exist;
    });
  });

  describe('#revokeInternalToken() already-revoked guard + self-revoke allowed (VE-27378 row 7)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();
    const selfUserId = '513e96ec-2bea-49a5-9d98-dc74ac19b396';

    it('should throw InvalidInput when the token has already been revoked', async function () {
      const tokenId = 'admintoken:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: { isRevoked: true, isPending: false, rights: ['foo:read'] }
        }
      ]);

      let err;
      try {
        await fullDal.revokeInternalToken(mockUtil.makeContext(), {
          input: { id: tokenId }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.status).to.equal('revoked');
    });

    it('should allow a token owner to revoke their own token (documented intentional behavior: "any superadmin can revoke token; no check needed")', async function () {
      const tokenId = 'admintoken:ffffffffffffffffffffffffffffffff';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: false,
            isPending: false,
            requestorId: selfUserId,
            rights: ['foo:read']
          }
        }
      ]);

      let capturedJson;
      serviceContext.dbConnections['sso'].write._push(
        [{ id: tokenId, json: { isRevoked: true } }],
        false,
        [],
        (sql, values) => {
          capturedJson = values[0];
          return true;
        }
      );

      // the requesting context (mockUtil.makeContext()) resolves to selfUserId,
      // the same as the token's own requestorId -- self-revocation must succeed.
      const res = await fullDal.revokeInternalToken(mockUtil.makeContext(), {
        input: { id: tokenId }
      });

      chaiExpect(res).to.exist;
      chaiExpect(capturedJson.isRevoked).to.equal(true);
      chaiExpect(capturedJson.isPending).to.not.exist;
      chaiExpect(capturedJson.revokerId).to.equal(selfUserId);
      chaiExpect(capturedJson.revokedDateTime).to.exist;
    });
  });

  describe('#updateInternalToken() label-only change bypasses approval (VE-27378 row 8)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();

    it('should update the label without setting isPending or touching active rights when input.rights is not supplied', async function () {
      const tokenId = 'admintoken:0011223344556677889900112233445566';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: false,
            isPending: false,
            tokenLabel: 'old label',
            rights: ['foo:read']
          }
        }
      ]);

      let capturedJson;
      serviceContext.dbConnections['sso'].write._push(
        [{ id: tokenId, json: { tokenLabel: 'new label' } }],
        false,
        [],
        (sql, values) => {
          capturedJson = values[1];
          return true;
        }
      );

      const res = await fullDal.updateInternalToken(mockUtil.makeContext(), {
        input: { id: tokenId, label: 'new label' }
      });

      chaiExpect(res).to.exist;
      chaiExpect(capturedJson.tokenLabel).to.equal('new label');
      chaiExpect(capturedJson.rights).to.deep.equal(['foo:read']);
      chaiExpect(capturedJson.isPending).to.equal(false);
      chaiExpect(capturedJson.requestId).to.not.exist;
    });
  });

  describe('#requestInternalToken() tag validation + forced task_type:internal (VE-27378 row 9)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();

    it('should throw InvalidInput when the tag fails validation', async function () {
      let err;
      try {
        await fullDal.requestInternalToken(mockUtil.makeContext(), {
          input: { tag: 'bad tag!', rights: ['job.create'] }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.tag).to.equal('bad tag!');
    });

    it('should force task_type:internal into the requested rights even when the caller did not ask for it', async function () {
      let capturedJson;
      serviceContext.dbConnections['sso'].write._push(
        [{ id: 'svc1:abcdef', json: {} }],
        false,
        [],
        (sql, values) => {
          capturedJson = values[1];
          return true;
        }
      );

      const res = await fullDal.requestInternalToken(mockUtil.makeContext(), {
        input: { tag: 'svc1', rights: ['job.create'] }
      });

      chaiExpect(res).to.exist;
      chaiExpect(capturedJson.requested_rights).to.deep.equal([
        'job.create',
        'task_type:internal'
      ]);
    });
  });

  describe('#requestInternalToken() / #updateInternalToken() label validation (VE-27378 row 10)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();
    const overlongLabel = 'x'.repeat(300);

    it('should throw InvalidInput from requestInternalToken when the label exceeds the max length', async function () {
      let err;
      try {
        await fullDal.requestInternalToken(mockUtil.makeContext(), {
          input: { tag: 'svc2', rights: ['job.create'], label: overlongLabel }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.length).to.equal(300);
    });

    it('should throw InvalidInput from updateInternalToken when the label exceeds the max length', async function () {
      const tokenId = 'admintoken:1122334455667788990011223344556677';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: tokenId,
          json: {
            isRevoked: false,
            isPending: false,
            tokenLabel: 'ok',
            rights: ['job.create']
          }
        }
      ]);

      let err;
      try {
        await fullDal.updateInternalToken(mockUtil.makeContext(), {
          input: { id: tokenId, label: overlongLabel }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.length).to.equal(300);
    });
  });

  describe('#getTokenState() 4-way classification via getInternalTokens (VE-27378 row 11)', function () {
    const serviceContext = require('../../../test/serviceContext.mock.js')();
    const fullDal = require('./internalToken.js')(serviceContext);
    const mockUtil = require('../../../test/mockUtil.js')();

    it('should classify each isRevoked/isPending combination into the correct status', async function () {
      serviceContext.dbConnections['sso'].read._push([
        { id: 'a:1', json: { isRevoked: true, isPending: true, requested_rights: [] } },
        { id: 'b:1', json: { isRevoked: true, isPending: false, rights: [] } },
        { id: 'c:1', json: { isRevoked: false, isPending: false, rights: [] } },
        { id: 'd:1', json: { isRevoked: false, isPending: true, rights: [] } }
      ]);

      const res = await fullDal.getInternalTokens(mockUtil.makeContext(), {});

      chaiExpect(res.records[0].status).to.equal('pending');
      chaiExpect(res.records[1].status).to.equal('revoked');
      chaiExpect(res.records[2].status).to.equal('active');
      chaiExpect(res.records[3].status).to.equal('updatePending');
    });
  });
});
