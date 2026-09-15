'use strict';

const _ = require('lodash');

const SOURCE_LIST_DIRECTIVES = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'media-src',
  'object-src',
  'frame-src',
  'child-src',
  'worker-src',
  'manifest-src',
  'prefetch-src',
  'fenced-frame-src',
  'base-uri',
  'form-action',
  'frame-ancestors'
]);

const CSP_WHITESPACE = /[\t\n\f\r ]+/;
const SCHEME_PREFIX = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const MAX_LOGGED_TOKEN_LENGTH = 200;
const MAX_LOGGED_ENTRIES = 20;

function hasMultiplePortSegments(token) {
  const authority = token.replace(SCHEME_PREFIX, '').split('/')[0];
  if (authority.startsWith('[')) {
    return false;
  }
  return (authority.match(/:/g) || []).length >= 2;
}

function sanitizePolicy(policy, dropped) {
  const directives = [];
  for (const segment of policy.split(';')) {
    const tokens = segment.split(CSP_WHITESPACE).filter(Boolean);
    if (tokens.length === 0) {
      continue;
    }
    const [name, ...sources] = tokens;
    if (!SOURCE_LIST_DIRECTIVES.has(name.toLowerCase())) {
      directives.push(tokens.join(' '));
      continue;
    }
    const kept = sources.filter((source) => {
      if (!hasMultiplePortSegments(source)) {
        return true;
      }
      dropped.push({ directive: name, source });
      return false;
    });
    directives.push(
      kept.length > 0 ? [name, ...kept].join(' ') : `${name} 'none'`
    );
  }
  return directives.join('; ');
}

function sanitizeCspValue(value) {
  const dropped = [];
  if (typeof value !== 'string' || value.trim() === '') {
    return { value: '', dropped };
  }

  const policies = value
    .split(',')
    .map((policy) => sanitizePolicy(policy, dropped))
    .filter((policy) => policy !== '');

  return { value: policies.join(', '), dropped };
}

function escapeForLog(text) {
  return String(text).replace(
    /[\x00-\x1f\x7f]/g,
    (char) =>
      `\\x${char.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`
  );
}

function truncateForLog(text) {
  const escaped = escapeForLog(text);
  return escaped.length > MAX_LOGGED_TOKEN_LENGTH
    ? `${escaped.slice(0, MAX_LOGGED_TOKEN_LENGTH)}…(truncated)`
    : escaped;
}

function formatSanitizationWarnings(result) {
  const dropped = _.get(result, 'dropped', []);
  const lines = dropped
    .slice(0, MAX_LOGGED_ENTRIES)
    .map(
      ({ directive, source }) =>
        `CSP: dropped invalid source "${truncateForLog(source)}" from ` +
        `directive "${truncateForLog(directive)}" in ` +
        'server.headers.csp.value'
    );
  if (dropped.length > MAX_LOGGED_ENTRIES) {
    lines.push(
      `CSP: and ${dropped.length - MAX_LOGGED_ENTRIES} more invalid ` +
        'source(s) dropped from server.headers.csp.value'
    );
  }
  return lines;
}

module.exports = { sanitizeCspValue, formatSanitizationWarnings };
