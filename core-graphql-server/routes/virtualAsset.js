/**
 * Virtual-asset content route.
 *
 * Resolves a virtual-asset JWT (the `signedUri` returned for assets when the
 * `virtualAssetEnabled` feature flag is on) to the underlying object in
 * S3/OCI/MinIO/Azure, then delivers it one of two ways depending on the
 * client — no query flag or caller change required:
 *
 *   Browsers (and anything that follows redirects) → 302
 *     Responds with a short-lived presigned storage URL. The browser follows
 *     the redirect and downloads directly from the object store, so bandwidth
 *     stays offloaded to the provider (the original virtual-asset behavior).
 *
 *   Non-browser clients → proxied 200/206
 *     Streams the object bytes back through this server. Non-browser clients
 *     that do NOT follow redirects would otherwise save Express's
 *     "Found. Redirecting to …" 302 body as the file contents. `Range` /
 *     `If-Range` / `If-None-Match` / `If-Modified-Since` are forwarded
 *     upstream and the upstream status/headers are mirrored, so media seeking
 *     and conditional/partial downloads behave the same as a direct fetch.
 *
 * Classification is heuristic (see isBrowserRequest) and biased toward proxy:
 * we only redirect when the request looks clearly like a browser. A
 * misjudged browser merely loses the bandwidth offload; a misjudged
 * non-browser would instead receive an unusable redirect body — so the safe
 * default is to proxy.
 *
 * A non-browser client that DOES follow redirects (e.g. media-streamer) can
 * pass ?proxyContent=false to force the 302 and skip the proxy hop. See
 * shouldRedirect. Jira: VE-20263, VE-23156
 *
 * A client can instead pass ?redirect=false to receive the presigned storage
 * URL itself — 200 with a JSON body of { "sourceUri": "<url>" } — rather than
 * being 302'd to it. Browsers can drop the Origin header on the redirect-follow
 * fetch, failing the storage bucket's CORS check; fetching the returned URL
 * directly avoids that. Takes precedence over proxyContent and the browser
 * heuristic. See wantsSourceUri/sendSourceUri. Jira: VE-26093, VE-26188
 *
 * HEAD → server-side HEAD check
 *   HEAD requests (on both the stateful and stateless routes) never 302:
 *   the presigned redirect target's signature is method-bound, so the
 *   client's follow-up HEAD against it would fail verification on OCI.
 *   Instead the handler answers server-side from the same GET-signed URL
 *   every other delivery mode uses (the cached one included): proxyContent
 *   turns the HEAD into a GET for the first byte (Range: bytes=0-0) and
 *   maps the 206 back to the 200 + full-object headers a direct HEAD would
 *   have returned — one byte moves upstream, none reach the caller.
 *   ?redirect=false keeps its JSON contract. Jira: VE-26428
 *
 * Virtual-asset URLs may carry a trailing sanitized-filename segment
 * (`/asset/<JWT>/<filename>`) so engines that save files by the URL path's
 * basename (GetChunkedUrl) get a usable name. The segment is cosmetic: both
 * routes accept and ignore it, and JWT-only URLs remain valid. Every response
 * also carries the `Veritone-Virtual-Asset` marker header (named by
 * VE-26428) so media-streamer's HEAD probe can classify URLs without a
 * valid token (probes self-identify via `veritone-virtual-asset-probe` and
 * get an empty 204 — no resolution work, no metrics). Jira: VE-26469
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Reuse sockets across proxied downloads to avoid TLS handshake churn.
const proxyHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const proxyHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// Upstream response headers worth passing straight through to the caller so
// content-type, length, and Range semantics survive the proxy hop.
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'content-encoding',
  'content-language',
  'content-disposition',
  'etag',
  'last-modified'
];

// Idle timeout for an upstream object-store fetch. Data flows continuously
// during a download, so this only trips on a genuinely stalled connection.
const PROXY_IDLE_TIMEOUT_MS = 60000;

// Marker stamped on every response from the virtual-asset endpoints —
// redirect, proxy, sourceUri, or error — so callers can tell it was served
// by the virtual-asset route rather than a raw presigned URL. Set once at
// handler entry, before token verification (classification must not require
// a valid token); nothing downstream (including the proxy's mirrored
// upstream headers) overwrites it. The probe request header (lowercase —
// request-header lookup) short-circuits a HEAD to an empty 204 before
// token verification, Redis, presigning, or metrics, so synthetic probe
// traffic never ticks virtualAssetRedirectTotal or does resolution work.
// Both names live in the lib so media-streamer's probe (the consumer) can't
// drift from this route (the producer).
// Jira: VE-26428 (marker name/stamp), VE-26469 (probe contract).
const {
  VIRTUAL_ASSET_MARKER_HEADER,
  VIRTUAL_ASSET_PROBE_HEADER
} = require('@veritone/core-server-base/virtualAsset');

// Last-resort fallback for the proxied-download ceiling. The canonical default
// (and the edge-controller runtime override) lives in config/config.js under
// server.maxProxyContentSize; this constant only applies if that key is absent
// from resolved config. See that schema entry for the rationale. Jira: VE-20263
const DEFAULT_MAX_PROXY_CONTENT_SIZE = 2 * 1024 * 1024 * 1024; // 2 GiB

// Render a byte count as a compact human-readable size for the limit message.
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

// Decide whether the caller is a real browser (which follows the 302 and
// downloads directly from storage) vs. an arbitrary HTTP client that may not.
// Biased toward proxy: return true only when we're confident it's a browser.
//  - Modern browsers send Fetch-Metadata (`Sec-Fetch-*`) headers on
//    navigations and media/download requests; non-browser clients do not.
//  - Older browsers are caught by the `Mozilla/` User-Agent token, which CLI
//    and SDK clients (curl, axios, python-requests, Go, okhttp, Java) omit.
function isBrowserRequest(req) {
  const headers = req.headers || {};
  if (headers['sec-fetch-mode'] || headers['sec-fetch-dest'] || headers['sec-fetch-site']) {
    return true;
  }
  return /Mozilla\//.test(String(headers['user-agent'] || ''));
}

// Decide whether to 302-redirect (true) or proxy the bytes (false).
//
// The `proxyContent` query param is an explicit override for non-browser
// clients that DO follow redirects (e.g. media-streamer, which resolves 302s
// itself): `proxyContent=false` forces the redirect and skips the proxy hop;
// `proxyContent=true` forces proxying. When the param is absent we fall back to
// the browser heuristic, so the safe proxy-by-default behavior is unchanged.
// Jira: VE-23156
function shouldRedirect(req) {
  const raw = req.query ? req.query.proxyContent : undefined;
  if (raw !== undefined) {
    const value = String(raw).toLowerCase();
    if (value === 'false' || value === '0') return true;
    if (value === 'true' || value === '1') return false;
  }
  return isBrowserRequest(req);
}

// Decide whether the caller asked for the presigned source URL in the response
// body (?redirect=false) instead of a 302 or proxied bytes. Only an explicit
// false/0 activates it (same allowlist style as proxyContent) — true/1 and
// unrecognized values fall through to the normal redirect/proxy decision.
// Checked before that decision, so redirect=false wins over proxyContent
// (either value, either query order — the ticket allows the combination
// without an error) and over the browser heuristic. Jira: VE-26188
function wantsSourceUri(req) {
  const raw = req.query ? req.query.redirect : undefined;
  if (raw === undefined) return false;
  const value = String(raw).toLowerCase();
  return value === 'false' || value === '0';
}

module.exports = function (serviceContext) {
  const router = express.Router();
  const config = serviceContext.config;
  const logger = serviceContext.logger;
  const maxProxyContentSize =
    Number(config?.server?.maxProxyContentSize) > 0
      ? Number(config.server.maxProxyContentSize)
      : DEFAULT_MAX_PROXY_CONTENT_SIZE;
  const resUtil = require('../resolvers/util.js')(serviceContext);

  // Metrics helpers — safe to call when metricsCounters is not available (tests)
  const mc = serviceContext.metricsCounters;
  function incRedirectCounter(outcome) {
    if (mc && mc.virtualAssetRedirectTotal) mc.virtualAssetRedirectTotal.inc({ outcome });
  }
  function observeRedirectLatency(startMs) {
    if (mc && mc.virtualAssetRedirectLatencyMs) mc.virtualAssetRedirectLatencyMs.observe(Date.now() - startMs);
  }

  // Respond 200 with the presigned source URL as a JSON body —
  // { "sourceUri": "<url>" } — instead of 302ing to it (?redirect=false — see
  // wantsSourceUri). The URL is already percent-encoded by the presigner and
  // is carried verbatim in the JSON string. It is a credential-bearing value:
  // no-store keeps it out of caches, nosniff pins the JSON interpretation,
  // and it must never be logged. Jira: VE-26188
  function sendSourceUri(req, res, signedUrl, redirectStart, baseOutcome) {
    incRedirectCounter(`source_uri_${baseOutcome}`);
    observeRedirectLatency(redirectStart);
    // Serialized once so the HEAD Content-Length matches the GET body exactly.
    const body = JSON.stringify({ sourceUri: signedUrl });
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    res.status(200);
    if (req.method === 'HEAD') {
      // Same headers a GET would produce — advertise the body size explicitly
      // since there is no body for Express to measure.
      res.set('Content-Length', String(Buffer.byteLength(body)));
      return res.end();
    }
    return res.send(body);
  }

  // Stream the object's bytes through this server instead of 302-redirecting.
  // Used for non-browser clients that don't follow redirects, which
  // would otherwise save Express's "Found. Redirecting to …" body as the file.
  // Range/conditional headers are forwarded so media seeking and partial
  // downloads behave the same as a direct-to-storage fetch.
  function proxyContent(req, res, signedUrl, redirectStart, baseOutcome) {
    let parsed;
    try {
      parsed = new URL(signedUrl);
    } catch (err) {
      logger.error('Invalid signed URL for virtual asset proxy', err);
      incRedirectCounter('proxy_error');
      observeRedirectLatency(redirectStart);
      return res.status(502).end();
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const agent = isHttps ? proxyHttpsAgent : proxyHttpAgent;

    const upstreamHeaders = {};
    for (const h of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
      if (req.headers[h]) upstreamHeaders[h] = req.headers[h];
    }

    // HEAD is answered from the same GET-signed URL the other delivery modes
    // use. The method is baked into the presigned signature (OCI rejects an
    // upstream HEAD on a GET-signed URL), but Range is not a signed header —
    // so issue a GET for the first byte and translate the 206 below into the
    // 200 + full-object headers a direct HEAD would have returned. A
    // caller-supplied Range is forwarded as-is: the mirrored 206/416 is
    // exactly what their ranged HEAD would produce. Jira: VE-26428
    const isHead = req.method === 'HEAD';
    const injectRange = isHead && !upstreamHeaders.range;
    if (injectRange) upstreamHeaders.range = 'bytes=0-0';

    // A mid-transfer fault can surface on the upstream request, the upstream
    // *response* (premature close, or the idle-timeout destroy below), or the
    // client response. Any unhandled stream 'error' would crash the process —
    // `pipe()` does not forward source errors — so handle all three and
    // collapse them so teardown/metrics run exactly once.
    let settled = false;
    const failProxy = (err, where) => {
      if (settled) return;
      settled = true;
      logger.error(`Virtual asset proxy ${where} error`, err);
      incRedirectCounter('proxy_error');
      observeRedirectLatency(redirectStart);
      // Headers are usually already flushed mid-stream, so a clean 502 isn't
      // possible — tear down the client connection so it sees a truncated
      // download rather than hanging.
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    };

    const upstreamReq = transport.request(
      signedUrl,
      {
        method: isHead ? 'GET' : req.method,
        agent,
        headers: upstreamHeaders,
        timeout: PROXY_IDLE_TIMEOUT_MS
      },
      (upstreamRes) => {
        upstreamRes.on('error', (err) => failProxy(err, 'upstream response'));

        // Translate the injected 1-byte range probe into HEAD semantics:
        // 206 → the 200 a direct HEAD would return, with the total size
        // lifted from Content-Range ("bytes 0-0/<total>"); 416 means the
        // object is zero bytes (range 0-0 is unsatisfiable at length 0).
        // Everything else (403, 404, 304, even a plain 200) mirrors
        // untouched. If the 206 lacks a numeric total, mirror it raw —
        // content-range still carries the size and inventing a
        // content-length would be worse. Jira: VE-26428
        let statusCode = upstreamRes.statusCode || 502;
        const headers = { ...upstreamRes.headers };
        if (injectRange) {
          if (statusCode === 206) {
            const total = /\/(\d+)\s*$/.exec(headers['content-range'] || '');
            if (total) {
              headers['content-length'] = total[1];
              headers['content-range'] = undefined;
              statusCode = 200;
            }
          } else if (statusCode === 416) {
            headers['content-length'] = '0';
            headers['content-range'] = undefined;
            statusCode = 200;
          }
        }

        // Refuse a single oversized proxied download before streaming any
        // bytes. A proxied transfer pins a connection on this pod for its whole
        // duration, so a multi-GB monolithic download can outlive a deploy and
        // truncate. A Range request reports only the slice size here, so
        // resumable/ranged fetches are unaffected — only a full oversized
        // transfer trips this. HEAD carries no body and is exempt, so it still
        // returns Content-Length and a client can discover the size and switch
        // to ranged requests.
        const contentLength = Number(upstreamRes.headers['content-length']);
        if (
          !isHead &&
          Number.isFinite(contentLength) &&
          contentLength > maxProxyContentSize
        ) {
          upstreamRes.resume(); // drain so the keep-alive socket stays reusable
          incRedirectCounter('proxy_too_large');
          observeRedirectLatency(redirectStart);
          res.set('Content-Type', 'text/plain; charset=utf-8');
          return res
            .status(413)
            .send(
              `The maximum download limit for a non-browser client is ${formatBytes(
                maxProxyContentSize
              )}.`
            );
        }

        // Mirror the upstream status so 206 (partial), 304 (not modified),
        // and error statuses reach the caller faithfully.
        for (const h of FORWARD_RESPONSE_HEADERS) {
          if (headers[h] != null) res.set(h, headers[h]);
        }
        res.set('Cache-Control', 'no-store');
        res.status(statusCode);

        incRedirectCounter(`proxy_${baseOutcome}`);
        observeRedirectLatency(redirectStart);

        if (isHead) {
          upstreamRes.resume();
          return res.end();
        }
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on('timeout', () => {
      logger.warn('Virtual asset proxy upstream timeout');
      upstreamReq.destroy();
    });

    upstreamReq.on('error', (err) => failProxy(err, 'upstream request'));

    // The client response erroring (e.g. the caller reset the socket mid-write)
    // would also be an unhandled 'error'; absorb it and stop the upstream fetch.
    res.on('error', (err) => {
      failProxy(err, 'client response');
      upstreamReq.destroy();
    });

    // Abort the upstream fetch if the caller hangs up mid-download.
    res.on('close', () => upstreamReq.destroy());

    upstreamReq.end();
  }

  async function handleAsset(req, res) {
    res.set(VIRTUAL_ASSET_MARKER_HEADER, 'true');
    // Probe short-circuit: HEAD-only (a GET carrying the header must still
    // serve media — a stray probe header on a real download must not turn
    // it into an empty 204), and no-store so no shared cache can hold the
    // bodyless 204 for the URL. VE-26469 review findings.
    if (req.method === 'HEAD' && req.headers?.[VIRTUAL_ASSET_PROBE_HEADER]) {
      res.set('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    const defaultErrorMessage = 'Invalid or expired virtual asset ID';
    const token = req?.params?.virtualAssetId;
    const redirectStart = Date.now();
    const sendError = (status) => {
      incRedirectCounter('error');
      observeRedirectLatency(redirectStart);
      return req.method === 'HEAD'
        ? res.status(status).end()
        : res.status(status).send(defaultErrorMessage);
    };

    let assetReq;
    try {
      if (!token) {
        return sendError(400);
      }

      let payload;
      const jwtSecret = config?.virtualAsset?.jwt?.secret || config.jwt.secret;
      try {
        payload = jwt.verify(token, jwtSecret);
      } catch (err) {
        logger.warn('Failed to verify virtual asset JWT', err, { token });
        const outcome = err.name === 'TokenExpiredError' ? 'expired' : 'invalid';
        incRedirectCounter(outcome);
        observeRedirectLatency(redirectStart);
        return req.method === 'HEAD'
          ? res.status(401).end()
          : res.status(401).send(defaultErrorMessage);
      }

      const vId = payload.id;
      if (!vId) {
        return sendError(400);
      }

      try {
        assetReq = await resUtil.getAssetUriFromVirtualId(vId);
      } catch (err) {
        logger.warn('Failed to get virtual asset URI', err, { vId });
        return sendError(404);
      }

      // Browsers follow the 302 and download directly from storage; everything
      // else is streamed through this server. A non-browser client that handles
      // redirects can opt out of the proxy with ?proxyContent=false (see
      // shouldRedirect), and any client can ask for the URL itself with
      // ?redirect=false (see wantsSourceUri — takes precedence over both).
      const returnSourceUri = wantsSourceUri(req);

      // HEAD (except ?redirect=false, which keeps its JSON contract) is
      // always answered server-side and never 302 — the presigned redirect
      // target's signature is method-bound, so the client's follow-up HEAD
      // against it would fail verification. proxyContent turns the HEAD into
      // a 1-byte ranged GET against the same GET-signed URL every other mode
      // uses (see there), so the cached signed URL below serves HEAD too.
      // Jira: VE-26428
      const isHeadCheck = req.method === 'HEAD' && !returnSourceUri;
      const useRedirect = !isHeadCheck && shouldRedirect(req);

      // If we already generated a signed URL for this virtual asset and it's not expired
      if (assetReq?.signedUrl && assetReq?.expiresAt && assetReq.expiresAt > Date.now()) {
        if (returnSourceUri) {
          return sendSourceUri(req, res, assetReq.signedUrl, redirectStart, 'cache_hit');
        }
        if (isHeadCheck) {
          return proxyContent(req, res, assetReq.signedUrl, redirectStart, 'head_check');
        }
        if (!useRedirect) {
          return proxyContent(req, res, assetReq.signedUrl, redirectStart, 'cache_hit');
        }
        incRedirectCounter('cache_hit');
        observeRedirectLatency(redirectStart);
        res.set('Cache-Control', 'no-store');
        return res.redirect(302, assetReq.signedUrl);
      }

      const signedUri = await resUtil.resolveVirtualAssetUri(vId, assetReq);
      if (!signedUri) {
        return sendError(404);
      }
      if (returnSourceUri) {
        return sendSourceUri(req, res, signedUri, redirectStart, 'presigned');
      }
      if (isHeadCheck) {
        return proxyContent(req, res, signedUri, redirectStart, 'head_check');
      }
      if (!useRedirect) {
        return proxyContent(req, res, signedUri, redirectStart, 'presigned');
      }
      incRedirectCounter('presigned');
      observeRedirectLatency(redirectStart);
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, signedUri);
    } catch (err) {
      logger.error('Error generating virtual asset redirect', err, { token });
      // A ?redirect=false caller wants the signed URL itself. With signing
      // broken there is no URL to return, and the unsigned-fallback proxy
      // below would hand them object bytes where they expect a URL body —
      // fail instead. The fallback stays for the other delivery modes, where
      // bytes are still a correct (if degraded) answer. Jira: VE-26188
      if (wantsSourceUri(req)) {
        return sendError(502);
      }
      if (assetReq?.uri) {
        return proxyContent(req, res, assetReq.uri, redirectStart, 'unsigned_fallback');
      }
      return sendError(500);
    }
  }

  // -----------------------------------------------------------------------
  // Stateless virtual asset: the JWT itself carries the storage pointer, so
  // there is no Redis lookup, no signed-URL caching, no onPrimaryHit DB
  // promotion, and no asset access event. Minted by core-admin / core-search
  // via @veritone/core-server-base/virtualAsset.mintStatelessVirtualAssetUri,
  // letting those services defer OCI/fallback signing to graphql without
  // sharing this server's Redis. @sminkov — VE-24702
  // -----------------------------------------------------------------------
  const presignerModule = require('../util/presigner.s3.buckets.js');
  const staticEndpoint = config.virtualAssetStaticEndpoint || 'asset-static';

  async function handleStaticAsset(req, res) {
    res.set(VIRTUAL_ASSET_MARKER_HEADER, 'true');
    // HEAD-only + no-store — see handleAsset.
    if (req.method === 'HEAD' && req.headers?.[VIRTUAL_ASSET_PROBE_HEADER]) {
      res.set('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    const defaultErrorMessage = 'Invalid or expired virtual asset token';
    const token = req?.params?.token;
    const redirectStart = Date.now();
    const sendError = (status) => {
      incRedirectCounter('error');
      observeRedirectLatency(redirectStart);
      return req.method === 'HEAD'
        ? res.status(status).end()
        : res.status(status).send(defaultErrorMessage);
    };

    try {
      if (!token) {
        return sendError(400);
      }

      const jwtSecret = config?.virtualAsset?.jwt?.secret || config.jwt.secret;
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret);
      } catch (err) {
        logger.warn('Failed to verify stateless virtual asset JWT', err);
        const outcome = err.name === 'TokenExpiredError' ? 'expired' : 'invalid';
        incRedirectCounter(outcome);
        observeRedirectLatency(redirectStart);
        return req.method === 'HEAD'
          ? res.status(401).end()
          : res.status(401).send(defaultErrorMessage);
      }

      const uri = payload.uri;
      if (!uri) {
        return sendError(400);
      }

      // SSRF / open-redirect guard: presignUrl returns non-bucket URIs unchanged,
      // so a validly-signed token whose uri points at an internal/external host
      // would otherwise be fetched server-side (proxy) or 302'd to the client.
      // Only resolve URIs that belong to an owned storage bucket. This is the
      // authoritative gate — minters add a defense-in-depth check, but graphql is
      // the only thing that resolves these tokens. @sminkov — VE-24702
      if (!resUtil.isOurBucket(uri)) {
        logger.warn(
          'Rejecting stateless virtual asset: uri is not an owned storage bucket'
        );
        return sendError(400);
      }

      // Sign for the token's remaining lifetime (bounded). No DB promotion and
      // no access event — this token is tied to neither an asset record nor a user.
      const nowSec = Math.floor(Date.now() / 1000);
      const ttl = payload.exp ? Math.max(1, payload.exp - nowSec) : undefined;

      // HEAD (except ?redirect=false, which keeps its JSON contract) is
      // checked server-side — same rationale as handleAsset: a 302 would
      // hand the client a URL its follow-up HEAD can't use, so proxyContent
      // answers it via a 1-byte ranged GET on the ordinary GET-signed URL.
      // Jira: VE-26428
      const isHeadCheck = req.method === 'HEAD' && !wantsSourceUri(req);

      let signedUri;
      try {
        const presigner = presignerModule.getInstance();
        // VE-27981: the minter stores the asset's filename in the JWT claims —
        // stamp it onto the presigned URL as a content-disposition attachment,
        // matching the stateful /asset route and the legacy signing path.
        signedUri = await presigner.presignUrl(uri, {
          ...(ttl ? { ttl } : {}),
          fileName: payload.fileName
        });
      } catch (err) {
        logger.error('Failed to presign stateless virtual asset', err);
        return sendError(502);
      }
      if (!signedUri) {
        return sendError(404);
      }

      if (wantsSourceUri(req)) {
        return sendSourceUri(req, res, signedUri, redirectStart, 'presigned');
      }
      if (isHeadCheck) {
        return proxyContent(req, res, signedUri, redirectStart, 'head_check');
      }
      if (!shouldRedirect(req)) {
        return proxyContent(req, res, signedUri, redirectStart, 'presigned');
      }
      incRedirectCounter('presigned');
      observeRedirectLatency(redirectStart);
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, signedUri);
    } catch (err) {
      logger.error('Error generating stateless virtual asset redirect', err);
      return sendError(500);
    }
  }

  // The optional trailing :filename segment is cosmetic (engines saving by
  // URL basename get a usable name) and untrusted — the handlers never read
  // it, so it can't reach a filesystem/header/log sink. JWT-only routes stay
  // registered for previously issued URLs. Jira: VE-26469
  // NOTE: server.js answers every OPTIONS with a bare 200 in a global
  // middleware registered before this router mounts, so these handlers are
  // currently unreachable in production. They are kept so the routes are
  // complete (and start serving Allow + the marker) if that middleware is
  // ever narrowed. VE-26469 review finding.
  const handleOptions = (req, res) => {
    res.set(VIRTUAL_ASSET_MARKER_HEADER, 'true');
    res.set('Allow', 'GET, HEAD, OPTIONS');
    return res.status(204).end();
  };

  router.get('/asset/:virtualAssetId', handleAsset);
  router.head('/asset/:virtualAssetId', handleAsset);
  router.get('/asset/:virtualAssetId/:filename', handleAsset);
  router.head('/asset/:virtualAssetId/:filename', handleAsset);

  router.options('/asset/:virtualAssetId', handleOptions);
  router.options('/asset/:virtualAssetId/:filename', handleOptions);

  router.get(`/${staticEndpoint}/:token`, handleStaticAsset);
  router.head(`/${staticEndpoint}/:token`, handleStaticAsset);
  router.get(`/${staticEndpoint}/:token/:filename`, handleStaticAsset);
  router.head(`/${staticEndpoint}/:token/:filename`, handleStaticAsset);

  router.options(`/${staticEndpoint}/:token`, handleOptions);
  router.options(`/${staticEndpoint}/:token/:filename`, handleOptions);

  return router;
};