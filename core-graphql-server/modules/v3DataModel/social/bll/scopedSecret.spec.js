'use strict';

// VE-25263 — authorization tests for the engine fetch-from-core resolver.
// vsec: the negative cases (non-engine, wrong-task, wrong-org/IDOR, non-CONNECTED) are the highest-priority coverage.

class NotAllowed extends Error {
  constructor(o) { super((o && o.message) || 'not allowed'); this.name = 'NotAllowed'; }
}
class InvalidInput extends Error {
  constructor(o) { super((o && o.message) || 'invalid input'); this.name = 'InvalidInput'; }
}
class NotFound extends Error {
  constructor() { super('not found'); this.name = 'NotFound'; }
}

// Replace the heavy error + util modules with light stand-ins so this stays a true unit test.
jest.mock('../../../../error/index.js', () => () => ({ NotAllowed, InvalidInput, NotFound }));
jest.mock('../../../../util.js', () => () => ({
  hasEngineJwt: (context) =>
    require('lodash').get(context, 'requestContext.jwtToken.sub') === 'engine-run'
}));
jest.mock('../../../../resolvers/util.js', () => () => ({
  // engine token's task id, mirrored onto the test context as __taskId
  getClientInfo: (context) => ({ taskId: require('lodash').get(context, '__taskId') })
}));

const createScopedSecret = require('./scopedSecret.js');

// context for an engine-run token carrying taskId (or a non-engine sub)
function ctx(sub, taskId) {
  return { requestContext: { jwtToken: { sub } }, __taskId: taskId };
}
// serviceContext stub: the caller's task distributes to `taskDestinationId`; the destination row (or a load error).
function svc({ destination, loadError, taskDestinationId, engineTransitSecret = 'test-transit-secret' } = {}) {
  return {
    config: { engineTransitSecret },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    dal: {
      destination: {
        loadOwnedDestination: jest.fn(async () => {
          if (loadError) throw loadError;
          return destination;
        })
      },
      task: {
        getTask: jest.fn(async () => ({ payload: { destinationId: taskDestinationId } }))
      }
    }
  };
}

describe('scopedSecret.resolveDestinationVendorProfile (VE-25263)', () => {
  const connected = {
    id: 'd1',
    status: 'CONNECTED',
    organizationId: 7682,
    vendorProfileId: 'pk-abc' // DAL map() already decrypted it
  };

  it('returns the key transit-encrypted (never plaintext) when an engine-run task is distributing to that CONNECTED destination', async () => {
    const s = createScopedSecret(svc({ destination: connected, taskDestinationId: 'd1' }));
    const res = await s.resolveDestinationVendorProfile(ctx('engine-run', 'task-1'), { destinationId: 'd1' });
    // The response carries ciphertext, not the plaintext Profile-Key.
    expect(res.vendorProfileId).toBeUndefined();
    expect(res.vendorProfileIdEncrypted).toEqual(expect.any(String));
    expect(res.vendorProfileIdEncrypted).not.toContain('pk-abc');
    // The engine (holding the same shared secret) recovers the plaintext.
    const transitCrypto = require('./transitCrypto.js')({ config: { engineTransitSecret: 'test-transit-secret' } });
    expect(transitCrypto.decrypt(res.vendorProfileIdEncrypted)).toBe('pk-abc');
  });

  it('fails closed when the engine transit secret is not configured — no key returned', async () => {
    const s = createScopedSecret(svc({ destination: connected, taskDestinationId: 'd1', engineTransitSecret: null }));
    await expect(
      s.resolveDestinationVendorProfile(ctx('engine-run', 'task-1'), { destinationId: 'd1' })
    ).rejects.toThrow(/transit secret/);
  });

  it('denies a non-engine caller — no key returned', async () => {
    const s = createScopedSecret(svc({ destination: connected, taskDestinationId: 'd1' }));
    await expect(
      s.resolveDestinationVendorProfile(ctx('user', 'task-1'), { destinationId: 'd1' })
    ).rejects.toThrow(NotAllowed);
  });

  it('denies an engine token that is not task-scoped (no taskId)', async () => {
    const s = createScopedSecret(svc({ destination: connected, taskDestinationId: 'd1' }));
    await expect(
      s.resolveDestinationVendorProfile(ctx('engine-run', undefined), { destinationId: 'd1' })
    ).rejects.toThrow(NotAllowed);
  });

  it('denies a different engine/task requesting a destination it is not distributing to (least-privilege)', async () => {
    // caller's task distributes to d2, but it asks for d1's key
    const s = createScopedSecret(svc({ destination: connected, taskDestinationId: 'd2' }));
    await expect(
      s.resolveDestinationVendorProfile(ctx('engine-run', 'task-other'), { destinationId: 'd1' })
    ).rejects.toThrow(NotAllowed);
  });

  it('denies wrong-org / not-owned (IDOR): loadOwnedDestination throws NotFound', async () => {
    const s = createScopedSecret(svc({ loadError: new NotFound(), taskDestinationId: 'other-org-dest' }));
    await expect(
      s.resolveDestinationVendorProfile(ctx('engine-run', 'task-x'), { destinationId: 'other-org-dest' })
    ).rejects.toThrow(NotFound);
  });

  it('denies a non-CONNECTED destination', async () => {
    const s = createScopedSecret(svc({ destination: { ...connected, status: 'PENDING_OAUTH' }, taskDestinationId: 'd1' }));
    await expect(
      s.resolveDestinationVendorProfile(ctx('engine-run', 'task-1'), { destinationId: 'd1' })
    ).rejects.toThrow(InvalidInput);
  });

  it('never logs the key value', async () => {
    const s = svc({ destination: connected, taskDestinationId: 'd1' });
    const inst = createScopedSecret(s);
    await inst.resolveDestinationVendorProfile(ctx('engine-run', 'task-1'), { destinationId: 'd1' });
    const loggedArgs = JSON.stringify(s.logger.info.mock.calls);
    expect(loggedArgs).not.toContain('pk-abc');
  });
});
