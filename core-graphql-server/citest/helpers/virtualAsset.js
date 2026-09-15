/**
 * Virtual Asset Test Helpers
 * 
 * Utility functions for testing virtual asset functionality including:
 * - JWT token handling
 * - URL rewriting for local/docker environments
 * - HTTP redirect following
 * - Prometheus metrics fetching and parsing
 * - File integrity verification
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

function decodeJwtJson(segment) {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

function looksLikeJwt(segment) {
  const JWT_PATH_SEGMENT = /^[\w-]+\.[\w-]+\.[\w-]+$/;
  if (!JWT_PATH_SEGMENT.test(segment)) return false;
  const [header, payload] = segment.split('.');
  const decodedHeader = decodeJwtJson(header);
  if (!decodedHeader || typeof decodedHeader.alg !== 'string') return false;
  return decodeJwtJson(payload) !== null;
}

/**
 * Decode JWT without verification to inspect claims
 * @param {string} token - JWT token
 * @returns {Object} Decoded JWT payload
 * @throws {Error} If token format is invalid
 */
function decodeJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = decodeJwtJson(parts[1]);
  if (!payload) {
    throw new Error('Invalid JWT payload');
  }
  return payload;
}

/**
 * Extract JWT token from virtual asset URL
 * @param {string} url - Virtual asset URL
 * @returns {string} JWT token
 * @throws {Error} If no valid JWT found in URL
 */
function extractJWTFromVirtualUrl(url) {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  
  for (const part of pathParts) {
    if (looksLikeJwt(part)) {
      try {
        const payload = decodeJWT(part);
        if (payload && payload.id) {
          return part;
        }
      } catch {
        // Not a valid JWT, continue searching
      }
    }
  }
  
  throw new Error('No valid JWT token found in virtual asset URL');
}

/**
 * Derive the local server base URL from the GraphQL endpoint.
 * e.g. "http://localhost:9000/v3/graphql" → "http://localhost:9000"
 * @param {string} gqlUrl - GraphQL endpoint URL
 * @returns {string} Base URL
 */
function serverBaseUrl(gqlUrl) {
  const u = new URL(gqlUrl);
  return `${u.protocol}//${u.host}`;
}

/**
 * Rewrite virtual asset URL to point to local server for testing
 * Handles both local and remote server configurations
 * @param {string} virtualUrl - Virtual asset URL
 * @param {string} gqlUrl - GraphQL endpoint URL
 * @returns {string} Rewritten URL pointing to local server
 */
function rewriteToLocalServer(virtualUrl, gqlUrl) {
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
 * simply change the host to localhost. Instead we route through the nginx
 * proxy at port 8080 which sets `Host: minio:9000` preserving the signature.
 * @param {string} url - URL with potential Docker hostname
 * @returns {string} URL with rewritten hostname
 */
function rewriteDockerHostname(url) {
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
 * Follow HTTP redirects and return response details including redirect chain
 * @param {string} targetUrl - URL to fetch
 * @param {number} maxRedirects - Maximum number of redirects to follow
 * @param {Array} redirectChain - Internal redirect tracking (do not pass)
 * @returns {Promise<Object>} Response with statusCode, headers, body, redirectChain
 */
function fetchFollowRedirects(targetUrl, maxRedirects = 5, redirectChain = []) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const startTime = Date.now();
    const req = transport.get(targetUrl, { timeout: 15000 }, (res) => {
      const elapsed = Date.now() - startTime;

      const step = {
        url: targetUrl,
        statusCode: res.statusCode,
        headers: res.headers,
        elapsedMs: elapsed
      };
      redirectChain.push(step);

      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) {
          return reject(new Error('Too many redirects'));
        }

        const rawLocation = res.headers.location;
        const next = rewriteDockerHostname(
          new URL(rawLocation, targetUrl).toString()
        );
        res.resume();
        return resolve(fetchFollowRedirects(next, maxRedirects - 1, redirectChain));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          redirectChain: redirectChain
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

/**
 * Calculate SHA256 checksum of buffer
 * @param {Buffer} buffer - Data to checksum
 * @returns {string} Hex-encoded SHA256 checksum
 */
function calculateChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Fetch Prometheus metrics from server
 * Returns null if metrics endpoint is not available
 * @param {string} gqlUrl - GraphQL endpoint URL
 * @returns {Promise<string|null>} Metrics text in Prometheus format or null
 */
async function fetchMetrics(gqlUrl) {
  try {
    const baseUrl = serverBaseUrl(gqlUrl);
    const metricsUrl = `${baseUrl}/metrics`;
    
    return new Promise((resolve, reject) => {
      const parsed = new URL(metricsUrl);
      const transport = parsed.protocol === 'https:' ? https : http;
      
      const req = transport.get(metricsUrl, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          return resolve(null);
        }
        
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const metricsText = Buffer.concat(chunks).toString('utf8');
          resolve(metricsText);
        });
      });
      
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  } catch (err) {
    return null;
  }
}

/**
 * Parse metric value from Prometheus text format
 * Returns null if metric not found
 * @param {string} metricsText - Prometheus metrics text
 * @param {string} metricName - Name of metric to find
 * @param {Object} labels - Optional label filters (e.g., {outcome: "presigned"})
 * @returns {number|null} Metric value or null if not found
 */
function parseMetricValue(metricsText, metricName, labels = {}) {
  if (!metricsText) return null;
  
  const lines = metricsText.split('\n');
  const labelStr = Object.keys(labels).length > 0
    ? Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')
    : '';
  
  const pattern = labelStr
    ? new RegExp(`^${metricName}\\{[^}]*${labelStr}[^}]*\\}\\s+([0-9.]+)`)
    : new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([0-9.]+)`);
  
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const match = line.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  
  return null;
}

/**
 * Check if a URL is a virtual asset URL
 * @param {string} url - URL to check
 * @returns {boolean} True if virtual asset URL
 */
function isVirtualAssetUrl(url) {
  if (!url) return false;
  
  // Virtual asset URLs should NOT have AWS presigning parameters
  const hasPresignedParams = url.includes('X-Amz-Signature') || 
                             url.includes('Signature=') ||
                             url.includes('Expires=');
  
  // Virtual asset URLs should have /asset/ path
  const hasAssetPath = url.includes('/asset/');
  
  // Try to extract and decode a JWT token from the URL
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    
    // Look for a JWT-like token in the path using robust validation
    for (const part of pathParts) {
      if (looksLikeJwt(part)) {
        // Virtual asset JWTs must have an 'id' field
        try {
          const payload = decodeJWT(part);
          if (payload && payload.id) {
            return true;
          }
        } catch {
          // Not a valid JWT, continue searching
        }
      }
    }
  } catch {
    // Invalid URL or error parsing
  }
  
  return false;
}

/**
 * Check if a URL has presigned URL parameters
 * @param {string} url - URL to check
 * @returns {boolean} True if URL has presigning parameters
 */
function hasPresignedParams(url) {
  if (!url) return false;
  return url.includes('X-Amz-Signature') || 
         url.includes('Signature=') || 
         url.includes('Expires=');
}

module.exports = {
  // JWT utilities
  decodeJWT,
  decodeJwtJson,
  looksLikeJwt,
  extractJWTFromVirtualUrl,
  
  // URL utilities
  serverBaseUrl,
  rewriteToLocalServer,
  rewriteDockerHostname,
  isVirtualAssetUrl,
  hasPresignedParams,
  
  // HTTP utilities
  fetchFollowRedirects,
  
  // Metrics utilities
  fetchMetrics,
  parseMetricValue,
  
  // File utilities
  calculateChecksum
};
