'use strict';

// VP-2581 (BE-18) — in-process mock of the Ayrshare REST API for citest.
//
// WHY: citest hits an already-running core-graphql-server in a SEPARATE process, so jest.mock()/nock (which only
// patch the test process) cannot stop that server from calling the real Ayrshare API. Instead we stand up a tiny
// localhost HTTP server here (started in jest.global.setup.js) and boot the server-under-test with
// AYRSHARE_BASE_URL=http://localhost:<port> so its ayrshareAdapter talks to this mock. This mirrors the existing
// external-dependency pattern in citest (orgInvite -> a real Mailpit server on localhost:8025).
//
// It implements only the 5 profile endpoints the aiware-core adapter calls (modules/v3DataModel/vendor/
// ayrshareAdapter.js). It does NOT implement /api/post — the social post + poll runs in the Go distribute engine,
// never in aiware-core, so distributeAsset makes no Ayrshare call from here.
//
// The mock is intentionally stateless and deterministic (no persistence, no randomness): every createProfile gets a
// unique-but-reproducible profileKey from a monotonic counter, and /api/user always reports a single CONNECTED
// YouTube account. Tests assert on the GraphQL responses the adapter produces, not on this mock's internals (it
// lives in the jest process and is not reachable from the server-under-test's assertions).

const express = require('express');

// Fixed connected-account label the mock reports for a completed OAuth handshake. Exported so the spec can assert
// the value flows through verifyConnection -> Destination.platformAccountLabel.
const MOCK_CONNECTED_LABEL = '@citest-mock-channel';

function buildApp() {
  const app = express();
  app.use(express.json());

  let profileSeq = 0;

  // BE-12: createProfile. The adapter reads res.profileKey (or profile_key) and requires it be truthy.
  app.post('/api/profiles', (req, res) => {
    profileSeq += 1;
    res.json({ status: 'success', profileKey: `citest-mock-profile-${profileSeq}`, title: (req.body || {}).title });
  });

  // BE-12: getConnectUrl (hosted OAuth). The adapter requires res.url.
  app.post('/api/profiles/generateJWT', (req, res) => {
    res.json({
      status: 'success',
      url: 'https://profile.ayrshare.com/citest-mock-connect',
      token: 'citest-mock-jwt',
      expiresAt: null
    });
  });

  // BE-13: verifyConnection. GET /api/user?validate=true with a Profile-Key header. The adapter looks for a
  // connected youtube account in activeSocialAccounts and returns its displayName as the account label.
  app.get('/api/user', (req, res) => {
    res.json({
      activeSocialAccounts: [{ platform: 'youtube', connected: true, displayName: MOCK_CONNECTED_LABEL }],
      displayNames: [{ platform: 'youtube', displayName: MOCK_CONNECTED_LABEL }]
    });
  });

  // BE-13: updateProfileLabel (best-effort title sync on a Destination label edit).
  app.put('/api/profiles', (req, res) => {
    res.json({ status: 'success' });
  });

  // BE-13: detachAccount (best-effort on Destination delete).
  app.delete('/api/profiles', (req, res) => {
    res.json({ status: 'success' });
  });

  // Any other Ayrshare path is not exercised by aiware-core; fail loud so a drift is obvious.
  app.use((req, res) => {
    res.status(501).json({ status: 'error', message: `ayrshareMock: unhandled ${req.method} ${req.path}` });
  });

  return app;
}

// Start the mock listening on `port` (0 = ephemeral). Binds `host` (default 0.0.0.0 so a dockerized
// server-under-test can reach it via host.docker.internal; the host loopback still works too). Resolves to
// { server, port, url }.
function startAyrshareMock(port, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    const server = buildApp().listen(port, host, () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort, url: `http://localhost:${actualPort}` });
    });
    server.on('error', reject);
  });
}

module.exports = { startAyrshareMock, MOCK_CONNECTED_LABEL };
