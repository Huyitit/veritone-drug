const {
  sanitizeCspValue,
  formatSanitizationWarnings
} = require('./contentSecurityPolicyUtil');

describe('contentSecurityPolicyUtil.sanitizeCspValue', () => {
  describe('VE-17601 regression', () => {
    it('drops the exact malformed a13s token (host with two ports)', () => {
      const { value, dropped } = sanitizeCspValue(
        "default-src 'self' https://fonts.googleapis.com " +
          'https://fonts.gstatic.com *.us-3.veritone.com:443:8443'
      );
      expect(value).toBe(
        "default-src 'self' https://fonts.googleapis.com " +
          'https://fonts.gstatic.com'
      );
      expect(dropped).toEqual([
        {
          directive: 'default-src',
          source: '*.us-3.veritone.com:443:8443'
        }
      ]);
    });

    it('passes the default config value through untouched', () => {
      const policy =
        "default-src 'self' https://fonts.googleapis.com " +
        'https://fonts.gstatic.com';
      const { value, dropped } = sanitizeCspValue(policy);
      expect(value).toBe(policy);
      expect(dropped).toEqual([]);
    });
  });

  describe('the multi-port shape is dropped', () => {
    it.each([
      ['*.us-3.veritone.com:443:8443'],
      ['*.example.com:443:8443'],
      ['example.com:443:8443'],
      ['example.com:443:8443:9000'],
      ['https://example.com:443:8443'],
      ['wss://socket.example.com:80:443'],
      ['example.com:443:8443/path']
    ])('drops %s', (source) => {
      const { value, dropped } = sanitizeCspValue(
        `default-src 'self' ${source}`
      );
      expect(value).toBe("default-src 'self'");
      expect(dropped).toEqual([{ directive: 'default-src', source }]);
    });

    it("emits 'none' when a directive loses every source", () => {
      const { value, dropped } = sanitizeCspValue('default-src bad.com:1:2');
      expect(value).toBe("default-src 'none'");
      expect(dropped).toEqual([
        { directive: 'default-src', source: 'bad.com:1:2' }
      ]);
    });

    it('drops the shape from any source-list directive', () => {
      const { value, dropped } = sanitizeCspValue(
        "script-src 'self' cdn.example.com:1:2; img-src data: img.example.com:3:4"
      );
      expect(value).toBe("script-src 'self'; img-src data:");
      expect(dropped).toEqual([
        { directive: 'script-src', source: 'cdn.example.com:1:2' },
        { directive: 'img-src', source: 'img.example.com:3:4' }
      ]);
    });

    it('matches source-list directive names case-insensitively', () => {
      const { value, dropped } = sanitizeCspValue(
        "Script-Src 'self' cdn.example.com:1:2"
      );
      expect(value).toBe("Script-Src 'self'");
      expect(dropped).toEqual([
        { directive: 'Script-Src', source: 'cdn.example.com:1:2' }
      ]);
    });
  });

  describe('everything else is preserved verbatim', () => {
    it.each([
      ["'self'"],
      ["'none'"],
      ["'unsafe-inline'"],
      ["'unsafe-eval'"],
      ["'strict-dynamic'"],
      ["'wasm-unsafe-eval'"],
      ["'report-sample'"],
      ["'unsafe-hashes'"],
      ["'report-sha256'"],
      ["'trusted-types-eval'"],
      ["'unsafe-webtransport-hashes'"],
      ["'some-future-keyword'"],
      // nonces and hashes, any case
      ["'nonce-abc123+/=='"],
      ["'NONCE-r4nd0m'"],
      ["'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='"],
      ["'SHA512-YWJjMTIz'"],
      // schemes
      ['data:'],
      ['blob:'],
      ['https:'],
      ['ws:'],
      // hosts, with at most one port
      ['*'],
      ['example.com'],
      ['*.example.com'],
      ['*.us-3.veritone.com'],
      ['*.us-3.veritone.com:8443'],
      ['example.com:*'],
      ['https://example.com'],
      ['https://example.com:8443'],
      ['https://example.com:8443/path/to/dir/'],
      ['wss://socket.example.com'],
      ['127.0.0.1:8080'],
      // IPv6 literals: colons belong to the host, not to ports
      ['[::1]'],
      ['[::1]:8443'],
      ['https://[::1]:8443'],
      ['[2001:db8::1]'],
      ['http://[fe80::1]/path'],
      // hosts the CSP grammar does not model but browsers accept
      ['my_service.internal'],
      ['münchen.de'],
      ['xn--mnchen-3ya.de'],
      // a colon inside the path is not a second port
      ['https://example.com:8443/a:b:c'],
      ['https://example.com/a:b'],
      // malformed in other ways — out of scope, left alone
      ['example.com:port'],
      ["'not-a-keyword'"],
      ['https://example.com/a?b=c'],
      ['ht!tp://example.com']
    ])('keeps %s', (source) => {
      const { value, dropped } = sanitizeCspValue(`default-src ${source}`);
      expect(value).toBe(`default-src ${source}`);
      expect(dropped).toEqual([]);
    });

    it("never drops a nonce, so 'unsafe-inline' cannot be reactivated", () => {
      const policy =
        "script-src 'NONCE-r4nd0m' 'unsafe-inline' https://cdn.example.com";
      const { value, dropped } = sanitizeCspValue(policy);
      expect(value).toBe(policy);
      expect(dropped).toEqual([]);
    });

    it('leaves non-source-list directives alone', () => {
      const policy =
        'upgrade-insecure-requests; sandbox allow-scripts allow-forms; ' +
        'report-uri https://example.com:443:8443/csp-report';
      const { value, dropped } = sanitizeCspValue(policy);
      expect(value).toBe(policy);
      expect(dropped).toEqual([]);
    });

    it('leaves unrecognized directive names alone', () => {
      const policy = "defualt-src 'self' bad.com:1:2";
      const { value, dropped } = sanitizeCspValue(policy);
      expect(value).toBe(policy);
      expect(dropped).toEqual([]);
    });
  });

  describe('comma-delimited policy lists', () => {
    it('preserves every policy in a multi-policy value', () => {
      const policy = "default-src 'self' https://a.com, frame-ancestors 'none'";
      const { value, dropped } = sanitizeCspValue(policy);
      expect(value).toBe(policy);
      expect(dropped).toEqual([]);
    });

    it('does not swallow a source or destroy the following policy', () => {
      const { value } = sanitizeCspValue(
        "default-src 'self' https://a.com, frame-ancestors 'none'"
      );
      expect(value).toContain('https://a.com');
      expect(value).toContain("frame-ancestors 'none'");
      expect(value).not.toBe("default-src 'self' frame-ancestors 'none'");
    });

    it('keeps a comma-separated policy with no space after the comma', () => {
      const { value, dropped } = sanitizeCspValue(
        "default-src 'self',https://a.com"
      );
      expect(value).toBe("default-src 'self', https://a.com");
      expect(dropped).toEqual([]);
    });

    it('sanitizes each policy independently', () => {
      const { value, dropped } = sanitizeCspValue(
        "default-src 'self' bad.com:1:2, script-src 'unsafe-inline' also.com:3:4"
      );
      expect(value).toBe("default-src 'self', script-src 'unsafe-inline'");
      expect(dropped).toEqual([
        { directive: 'default-src', source: 'bad.com:1:2' },
        { directive: 'script-src', source: 'also.com:3:4' }
      ]);
    });

    it('drops empty policies produced by stray commas', () => {
      const { value } = sanitizeCspValue("default-src 'self',,img-src data:");
      expect(value).toBe("default-src 'self', img-src data:");
    });
  });

  describe('input normalization and edge cases', () => {
    it('normalizes redundant whitespace and empty directive segments', () => {
      const { value, dropped } = sanitizeCspValue(
        "  default-src   'self'\t https://a.com ; ; img-src  data:  "
      );
      expect(value).toBe("default-src 'self' https://a.com; img-src data:");
      expect(dropped).toEqual([]);
    });

    it('never emits CR or LF (header-injection safety)', () => {
      const { value } = sanitizeCspValue(
        "default-src 'self'\r\nX-Evil: 1\r\n; img-src data:"
      );
      expect(value).not.toMatch(/[\r\n]/);
    });

    it.each([
      ['vertical tab', '\x0b'],
      ['no-break space', '\u00a0'],
      ['line separator', '\u2028'],
      ['ideographic space', '\u3000'],
      ['zero-width no-break space', '\ufeff']
    ])(
      'keeps a source containing %s whole rather than splitting it in two',
      (_label, separator) => {
        const source = `https://exa${separator}mple.com`;
        const { value, dropped } = sanitizeCspValue(
          `default-src 'self' ${source}`
        );
        expect(value).toBe(`default-src 'self' ${source}`);
        expect(dropped).toEqual([]);
      }
    );

    it.each([[''], ['   '], [null], [undefined], [42]])(
      'returns an empty policy for %p',
      (input) => {
        expect(sanitizeCspValue(input)).toEqual({ value: '', dropped: [] });
      }
    );

    it('handles a very large token without pathological slowdown', () => {
      const huge = `https://${'a'.repeat(500000)}.com:1:2`;
      const started = process.hrtime.bigint();
      const { dropped } = sanitizeCspValue(`default-src 'self' ${huge}`);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      expect(dropped).toHaveLength(1);
      expect(elapsedMs).toBeLessThan(1000);
    });
  });
});

describe('contentSecurityPolicyUtil.formatSanitizationWarnings', () => {
  it('returns no lines when nothing was dropped', () => {
    expect(
      formatSanitizationWarnings(sanitizeCspValue("default-src 'self'"))
    ).toEqual([]);
  });

  it('names the dropped source and its directive', () => {
    const lines = formatSanitizationWarnings(
      sanitizeCspValue("default-src 'self' *.us-3.veritone.com:443:8443")
    );
    expect(lines).toEqual([
      'CSP: dropped invalid source "*.us-3.veritone.com:443:8443" from ' +
        'directive "default-src" in server.headers.csp.value'
    ]);
  });

  it('truncates an oversized token instead of logging it whole', () => {
    const lines = formatSanitizationWarnings({
      dropped: [{ directive: 'default-src', source: 'a'.repeat(100000) }]
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeLessThan(400);
    expect(lines[0]).toContain('(truncated)');
  });

  it('caps the number of lines and reports the remainder', () => {
    const dropped = Array.from({ length: 10000 }, (_unused, i) => ({
      directive: 'default-src',
      source: `bad${i}.com:1:2`
    }));
    const lines = formatSanitizationWarnings({ dropped });
    expect(lines).toHaveLength(21);
    expect(lines[20]).toContain('and 9980 more invalid source(s) dropped');
  });

  it('escapes control characters so a token cannot spoof a log viewer', () => {
    const lines = formatSanitizationWarnings({
      dropped: [{ directive: 'default-src', source: '\x1b[31mred\x1b[0m' }]
    });
    expect(lines[0]).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(lines[0]).toContain('\\x1B[31mred');
  });
});
