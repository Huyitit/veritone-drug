'use strict';

const createJwt = require('./jwt');

const SECRET = 'test-secret-for-worker-psd-aqa-2026';
const OPTIONS_HS256 = { algorithm: 'HS256', expiresIn: '1h' };

describe('jwt.js — createJwt factory', () => {
  describe('sign()', () => {
    it('returns Error when signingKey is absent', () => {
      const svc = createJwt({ options: OPTIONS_HS256 });
      const result = svc.sign({ userId: 1 });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('No signing key');
    });

    it('returns a three-part string token when signingKey is present', () => {
      const svc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      const result = svc.sign({ userId: 42 });
      expect(typeof result).toBe('string');
      expect(result.split('.')).toHaveLength(3);
    });
  });

  describe('verify()', () => {
    it('returns Error when decodingKey is absent', () => {
      const svc = createJwt({ options: OPTIONS_HS256 });
      const result = svc.verify('any.token.here');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('No decoding key');
    });

    it('returns the original payload for a validly signed token (round-trip)', () => {
      const svc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      const token = svc.sign({ userId: 99, role: 'admin' });
      const result = svc.verify(token);
      expect(result).toMatchObject({ userId: 99, role: 'admin' });
    });

    it('returns Error when the token was signed with a different key [security-coverage]', () => {
      const signerSvc = createJwt({ secret: 'attacker-secret', options: OPTIONS_HS256 });
      const verifierSvc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      const token = signerSvc.sign({ userId: 1 });
      const result = verifierSvc.verify(token);
      expect(result).toBeInstanceOf(Error);
    });

    it('returns Error for an alg:none unsigned token — rejects unauthenticated JWTs [security-coverage]', () => {
      const svc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      // Manually construct a JWT with alg:none (no signature)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 1 })).toString('base64url');
      const noneAlgToken = `${header}.${payload}.`;
      const result = svc.verify(noneAlgToken);
      expect(result).toBeInstanceOf(Error);
    });

    it('returns Error for an expired token [security-coverage]', () => {
      const signerSvc = createJwt({
        secret: SECRET,
        options: { algorithm: 'HS256', expiresIn: '-1s' }
      });
      const verifierSvc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      const token = signerSvc.sign({ userId: 1 });
      const result = verifierSvc.verify(token);
      expect(result).toBeInstanceOf(Error);
    });

    it('returns Error for a malformed token string', () => {
      const svc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      const result = svc.verify('not-a-jwt');
      expect(result).toBeInstanceOf(Error);
    });
  });

  describe('factory properties', () => {
    it('sets signingKey from jwtSchema.secret', () => {
      const svc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      expect(svc.signingKey).toBe(SECRET);
    });

    it('sets decodingKey from jwtSchema.secret when no publicKey provided', () => {
      const svc = createJwt({ secret: SECRET, options: OPTIONS_HS256 });
      expect(svc.decodingKey).toBe(SECRET);
    });

    it('sets signingKey from jwtSchema.privateKey when secret is absent', () => {
      const svc = createJwt({ privateKey: 'pk', publicKey: 'pubk', options: OPTIONS_HS256 });
      expect(svc.signingKey).toBe('pk');
      expect(svc.decodingKey).toBe('pubk');
    });
  });
});
