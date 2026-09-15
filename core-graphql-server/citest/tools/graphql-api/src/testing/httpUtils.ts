/**
 * HTTP utility functions for testing virtual asset and URL redirection flows.
 */

import * as httpModule from 'http';
import * as httpsModule from 'https';

export interface FetchRedirectResponse {
  statusCode: number | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface HeadResponse {
  statusCode: number | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * When the virtual-asset feature is enabled, signedUri is a JWT URL that
 * may point to apiRoot (e.g. https://api.aws-dev.veritone.com/asset/<jwt>).
 * In CI/local-docker the server is actually at localhost, so we rewrite
 * the host portion to the real server.
 *
 * If the virtualUrl hostname already matches the gqlUrl hostname (both are
 * local-docker), we keep the original port because the /asset/ route is
 * served by the GraphQL server directly (port 3000), not via nginx (port 8080).
 */
export function rewriteToLocalServer(virtualUrl: string, gqlUrl: string): string {
  const parsed = new URL(virtualUrl);
  const localParsed = new URL(gqlUrl);

  // Already pointing at the same local host — keep the port as-is
  if (parsed.hostname === localParsed.hostname) {
    return parsed.toString();
  }

  // External host — rewrite to local
  parsed.protocol = localParsed.protocol;
  parsed.host = localParsed.host;
  return parsed.toString();
}

/**
 * Rewrite Docker-internal hostnames so the test runner can reach them.
 *
 * MinIO presigned URLs include the hostname in the signature, so we cannot
 * simply change the host to localhost.  Instead we route through the nginx
 * proxy at port 8080 which sets `Host: minio:9000` preserving the signature.
 *
 * Nginx location block:
 *   /minio → proxy_pass http://minio:9000 (strips /minio prefix)
 */
export function rewriteDockerHostname(url: string): string {
  const parsed = new URL(url);

  if (parsed.hostname === 'minio') {
    // Route through nginx /minio proxy to preserve presigned signature
    const minioPath = parsed.pathname + parsed.search;
    return `http://localhost:8080/minio${minioPath}`;
  }

  const dockerHosts = ['graphql', 'redis', 'azurite'];
  if (dockerHosts.includes(parsed.hostname)) {
    parsed.hostname = 'localhost';
  }
  return parsed.toString();
}

/**
 * Follow redirects (e.g., virtual asset 302 → signed URL) and return the
 * final response body as a Buffer.  Works for both http and https.
 */
export function fetchFollowRedirects(
  targetUrl: string,
  maxRedirects: number = 5
): Promise<FetchRedirectResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? httpsModule : httpModule;

    const req = transport.get(targetUrl, { timeout: 15000 }, (res) => {
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode || 0) &&
        res.headers.location
      ) {
        if (maxRedirects <= 0) {
          return reject(new Error('Too many redirects'));
        }
        // Follow relative or absolute redirect, rewriting Docker hostnames
        const rawLocation = res.headers.location as string;
        const next = rewriteDockerHostname(
          new URL(rawLocation, targetUrl).toString()
        );
        res.resume();
        return resolve(fetchFollowRedirects(next, maxRedirects - 1));
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

export interface SingleRequestOptions {
  method?: string;
  headers?: Record<string, string>;
}

/**
 * Issue a single request with caller-supplied headers and WITHOUT following
 * redirects, so the caller can assert on the first response verbatim.
 *
 * Needed because the virtual-asset route picks its delivery mode from the
 * request itself (see routes/virtualAsset.js isBrowserRequest): a browser-like
 * request gets a 302 to a presigned URL, everything else gets the object
 * proxied back as 200/206. Asserting either branch means controlling the
 * request headers — `Sec-Fetch-Mode: navigate` for the redirect branch, `Range`
 * for partial content — and seeing the un-followed response.
 * Contract documented in PR #4026's QA section (Test 1). Jira: VE-23156, VE-26428
 */
export function requestNoRedirect(
  targetUrl: string,
  options: SingleRequestOptions = {}
): Promise<FetchRedirectResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? httpsModule : httpModule;

    const req = transport.request(
      targetUrl,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 15000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

/**
 * Issue a single HEAD request without following redirects. VE-26428 requires
 * the server to answer HEAD directly (server-side HEAD check against the
 * storage object) — a 302 here would be a regression.
 */
export function headRequest(targetUrl: string): Promise<HeadResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? httpsModule : httpModule;

    const req = transport.request(
      targetUrl,
      { method: 'HEAD', timeout: 15000 },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ statusCode: res.statusCode, headers: res.headers })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}
