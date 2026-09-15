const chaiExpect = require('chai').expect;
const mockUtil = require('../../../../test/mockUtil.js')();

const serviceContext = require('../../test/serviceContext.mock.js')();
const dal = require('./destination.js')(serviceContext);
const context = mockUtil.makeContext();

// VE-25263: the DAL now encrypts vendor_profile_id at rest and decrypts on read. Give the crypto helper a key
// and store CIPHERTEXT in the fixtures so decrypt-on-read round-trips.
serviceContext.config.decryptKeyDefault =
  serviceContext.config.decryptKeyDefault || 'test-platform-key-ve-25263';
const profileKeyCrypto = require('./profileKeyCrypto.js')(serviceContext);
const PLAINTEXT_VPID = 'PROFILE-KEY-123';

const DEST_TYPE_ID = 'c42be8c9-a848-4bc7-b461-5001dc342232';
const DEST_ID = 'b1d3f5a7-0000-4000-8000-000000000001';

const ROW = {
  id: DEST_ID,
  organization_id: 7682,
  destination_type_id: DEST_TYPE_ID,
  label: 'My Channel',
  details: { foo: 'bar' },
  vendor_profile_id: profileKeyCrypto.encrypt(PLAINTEXT_VPID),
  vendor_profile_id_hmac: profileKeyCrypto.hmac(PLAINTEXT_VPID),
  platform_account_label: '@my-channel',
  status: 'PENDING_OAUTH',
  oauth_url: 'https://app.ayrshare.com/jwt/xyz',
  oauth_url_expires_at: '2026-06-26T00:05:00.000Z',
  created_by_user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
  created_date_time: '2026-06-26T00:00:00.000Z',
  modified_date_time: '2026-06-26T00:00:00.000Z'
};

// Schemas live in a different DB connection; the DAL's validation hook calls
// these dal collaborators, so stub them here (registered lazily at call time).
function stubConfigSchema(definition) {
  serviceContext.dal.destinationType = {
    getDestinationType: async () => ({
      id: DEST_TYPE_ID,
      configSchemaId: definition ? 'cfg-schema-id' : null
    })
  };
  serviceContext.dal.structuredData = {
    getSchema: async () => ({ schema: definition })
  };
}

describe('destination.js (BE-11)', function () {
  beforeEach(function () {
    serviceContext._clearAll();
    // default: no config schema -> validation is a no-op
    stubConfigSchema(null);
  });

  describe('#require', function () {
    it('loads the module with the expected CRUD API', function () {
      chaiExpect(dal).to.be.a('object');
      ['getDestination', 'getDestinations', 'createDestination', 'updateDestination', 'deleteDestination'].forEach(
        (fn) => chaiExpect(dal[fn], fn).to.be.a('function')
      );
    });
  });

  describe('#getDestinations', function () {
    it('returns org-scoped, camelized rows', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.getDestinations(context, {});
      chaiExpect(res).to.be.an('array').with.length(1);
      chaiExpect(res[0].id).to.equal(DEST_ID);
      chaiExpect(res[0].vendorProfileId).to.equal('PROFILE-KEY-123');
      chaiExpect(res[0].status).to.equal('PENDING_OAUTH');
      chaiExpect(res[0].oauthUrlExpiresAt).to.exist;
      chaiExpect(res[0].modifiedDateTime).to.exist;
    });
  });

  describe('#requireOrg (security-coverage)', function () {
    it('throws not_allowed instead of querying when the context has no organization', async function () {
      // No read result is queued: if the guard regressed and let the query
      // through, the mock DB's "no SQL result in queue" error would surface
      // instead of the expected not_allowed — still failing this assertion.
      let err;
      try {
        await dal.getDestinations({}, {});
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
    });
  });

  describe('#getDestination', function () {
    it('returns the row when found and owned', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.getDestination(context, { id: DEST_ID });
      chaiExpect(res.id).to.equal(DEST_ID);
    });

    it('returns null (not an error) when absent / other-org / soft-deleted', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      const res = await dal.getDestination(context, { id: DEST_ID });
      chaiExpect(res).to.equal(null);
    });
  });

  describe('#createDestination', function () {
    it('inserts and returns the created destination (no config schema)', async function () {
      serviceContext.dbConnections['core'].write._push([ROW]);
      const res = await dal.createDestination(context, {
        input: {
          destinationTypeId: DEST_TYPE_ID,
          label: 'My Channel',
          details: { foo: 'bar' },
          vendorProfileId: 'PROFILE-KEY-123'
        }
      });
      chaiExpect(res.id).to.equal(DEST_ID);
      chaiExpect(res.vendorProfileId).to.equal('PROFILE-KEY-123');
    });

    it('rejects details that violate the configSchema (BE-09 hook)', async function () {
      stubConfigSchema({
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string' } }
      });
      let err;
      try {
        await dal.createDestination(context, {
          input: {
            destinationTypeId: DEST_TYPE_ID,
            label: 'Bad',
            details: { notTitle: 1 },
            vendorProfileId: 'PK'
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('rejects inherited Object keys, which a plain-literal allowlist would let through', async function () {
      // A plain `{...}` map resolves 'constructor' and friends to truthy inherited values, so the key would pass
      // the check and bind a Function as the excluded status — the predicate would then match nothing and the
      // guard would silently become a no-op, which is exactly the race it exists to close.
      for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        let err;
        try {
          await dal.updateDestination(context, {
            notStatus: key,
            input: { id: DEST_ID, status: 'PENDING_OAUTH' }
          });
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }
        chaiExpect(err, key).to.exist;
        chaiExpect(err.name, key).to.equal('invalid_input');
      }
    });
  });

  describe('#updateDestination', function () {
    it('merges details, re-validates, and updates', async function () {
      // loadOwnedDestination -> getDestination read
      serviceContext.dbConnections['core'].read._push([ROW]);
      // the UPDATE ... RETURNING
      serviceContext.dbConnections['core'].write._push([
        Object.assign({}, ROW, { label: 'Renamed' })
      ]);
      const res = await dal.updateDestination(context, {
        input: { id: DEST_ID, label: 'Renamed' }
      });
      chaiExpect(res.label).to.equal('Renamed');
    });

    it('throws not_found when the destination is not owned', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      let err;
      try {
        await dal.updateDestination(context, {
          input: { id: DEST_ID, label: 'x' }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('returns the existing row unchanged when the input has no defined columns besides id (no-op)', async function () {
      // loadOwnedDestination -> getDestination read only; no write result is
      // queued, so a regression that always issues the UPDATE ... RETURNING
      // write would surface the mock DB's "no SQL result in queue" error here.
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.updateDestination(context, {
        input: { id: DEST_ID }
      });
      chaiExpect(res.id).to.equal(DEST_ID);
      chaiExpect(res.label).to.equal(ROW.label);
      chaiExpect(res.modifiedDateTime).to.equal(ROW.modified_date_time);
    });
  });

  describe('#updateDestination notStatus guard (VE-26675)', function () {
    it('folds the status guard into the predicate as a bound param and renumbers the SET params', async function () {
      // The caller's earlier status read is stale by the time a slow vendor round-trip returns, so the guard has
      // to live in the UPDATE's own WHERE. It must be a bound parameter — never interpolated into the SQL text.
      serviceContext.dbConnections['core'].read._push([ROW]);
      let capturedSql;
      let capturedVars;
      serviceContext.dbConnections['core'].write._push(
        [Object.assign({}, ROW, { status: 'PENDING_OAUTH' })],
        true,
        [],
        (sql, vars) => {
          capturedSql = sql;
          capturedVars = vars;
          return true;
        }
      );

      await dal.updateDestination(context, {
        notStatus: 'CONNECTED',
        input: { id: DEST_ID, status: 'PENDING_OAUTH', oauthUrl: 'https://x/fresh' }
      });

      chaiExpect(capturedSql).to.contain('status <> $3');
      chaiExpect(capturedSql).to.not.contain("'CONNECTED'");
      chaiExpect(capturedVars[0]).to.equal(DEST_ID);
      chaiExpect(capturedVars[2]).to.equal('CONNECTED');
      // SET params start after the three WHERE params, so the first column value is $4 and lines up with vars[3].
      chaiExpect(capturedSql).to.contain('$4');
      chaiExpect(capturedVars[3]).to.equal('PENDING_OAUTH');
    });

    it('leaves the predicate untouched when notStatus is omitted', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      let capturedSql;
      let capturedVars;
      serviceContext.dbConnections['core'].write._push([ROW], true, [], (sql, vars) => {
        capturedSql = sql;
        capturedVars = vars;
        return true;
      });

      await dal.updateDestination(context, { input: { id: DEST_ID, label: 'Renamed' } });

      chaiExpect(capturedSql).to.not.contain('status <>');
      chaiExpect(capturedSql).to.contain('$3');
      chaiExpect(capturedVars[2]).to.equal('Renamed');
    });

    it('returns undefined when the guard matches zero rows, so the caller can tell a no-op from a write', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      serviceContext.dbConnections['core'].write._push([]);

      const res = await dal.updateDestination(context, {
        notStatus: 'CONNECTED',
        input: { id: DEST_ID, status: 'PENDING_OAUTH' }
      });

      chaiExpect(res).to.equal(undefined);
    });

    it('applies the guard on the no-op path too, so the empty-result contract is the same either way', async function () {
      // No write is queued: a regression that issued the UPDATE here would surface as the mock DB's empty-queue
      // error rather than a silent pass.
      serviceContext.dbConnections['core'].read._push([Object.assign({}, ROW, { status: 'CONNECTED' })]);

      const res = await dal.updateDestination(context, {
        notStatus: 'CONNECTED',
        input: { id: DEST_ID }
      });

      chaiExpect(res).to.equal(undefined);
    });

    it('rejects an unknown notStatus key instead of building a predicate from it (security-coverage)', async function () {
      // The allowlist is what keeps the guard an internal, closed vocabulary — an unrecognised key is a bug in
      // the caller, not a value to pass through.
      let err;
      try {
        await dal.updateDestination(context, {
          notStatus: "CONNECTED' OR '1'='1",
          input: { id: DEST_ID, status: 'PENDING_OAUTH' }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('#deleteDestination', function () {
    it('soft-deletes and returns a delete payload', async function () {
      serviceContext.dbConnections['core'].write._push([{ id: DEST_ID }]);
      const res = await dal.deleteDestination(context, { id: DEST_ID });
      chaiExpect(res.id).to.equal(DEST_ID);
      chaiExpect(res.message).to.match(/deleted/i);
    });

    it('throws not_found when nothing was deleted', async function () {
      serviceContext.dbConnections['core'].write._push([]);
      let err;
      try {
        await dal.deleteDestination(context, { id: DEST_ID });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });
  });

  describe('VE-25263 encryption', function () {
    it('decrypts vendor_profile_id transparently on read', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.getDestination(context, { id: DEST_ID });
      chaiExpect(res.vendorProfileId).to.equal(PLAINTEXT_VPID);
      // the value stored at rest is ciphertext, not the plaintext key
      chaiExpect(ROW.vendor_profile_id).to.not.equal(PLAINTEXT_VPID);
      chaiExpect(ROW.vendor_profile_id).to.contain('::');
    });

    it('fails closed reading a non-ciphertext (legacy plaintext) value', async function () {
      serviceContext.dbConnections['core'].read._push([
        Object.assign({}, ROW, { vendor_profile_id: 'legacy-plaintext' })
      ]);
      let threw = false;
      try {
        await dal.getDestination(context, { id: DEST_ID });
      } catch (e) {
        threw = true;
      }
      chaiExpect(threw).to.equal(true);
    });
  });

  describe('VE-25263 encrypt-on-write (security-coverage)', function () {
    it('createDestination encrypts vendorProfileId and computes its HMAC before the INSERT write, never the plaintext', async function () {
      let capturedVars;
      serviceContext.dbConnections['core'].write._push(
        [ROW],
        true,
        [],
        (sql, vars) => {
          capturedVars = vars;
          return true;
        }
      );
      await dal.createDestination(context, {
        input: {
          destinationTypeId: DEST_TYPE_ID,
          label: 'My Channel',
          details: { foo: 'bar' },
          vendorProfileId: PLAINTEXT_VPID
        }
      });

      chaiExpect(capturedVars, 'INSERT values').to.not.include(PLAINTEXT_VPID);
      chaiExpect(capturedVars).to.include(profileKeyCrypto.hmac(PLAINTEXT_VPID));
      const cipherVar = capturedVars.find(
        (v) => typeof v === 'string' && v.includes('::')
      );
      chaiExpect(cipherVar, 'ciphertext column value').to.exist;
      chaiExpect(cipherVar).to.not.equal(PLAINTEXT_VPID);
    });

    it('updateDestination encrypts vendorProfileId and computes its HMAC before the UPDATE write when vendorProfileId is defined', async function () {
      const NEW_VPID = 'NEW-PROFILE-KEY-456';
      serviceContext.dbConnections['core'].read._push([ROW]);
      let capturedVars;
      serviceContext.dbConnections['core'].write._push(
        [
          Object.assign({}, ROW, {
            vendor_profile_id: profileKeyCrypto.encrypt(NEW_VPID),
            vendor_profile_id_hmac: profileKeyCrypto.hmac(NEW_VPID)
          })
        ],
        true,
        [],
        (sql, vars) => {
          capturedVars = vars;
          return true;
        }
      );
      await dal.updateDestination(context, {
        input: { id: DEST_ID, vendorProfileId: NEW_VPID }
      });

      chaiExpect(capturedVars, 'UPDATE values').to.not.include(NEW_VPID);
      chaiExpect(capturedVars).to.include(profileKeyCrypto.hmac(NEW_VPID));
      const cipherVar = capturedVars.find(
        (v) => typeof v === 'string' && v.includes('::')
      );
      chaiExpect(cipherVar, 'ciphertext column value').to.exist;
      chaiExpect(cipherVar).to.not.equal(NEW_VPID);
    });
  });
});
