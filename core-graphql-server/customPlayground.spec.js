// customPlayground.spec.js — Row 3: customPlayground middleware nil-guards and withBanner handler
//
// customPlayground() is a standalone factory with no production deps that need mocking.
// cgql has `"transform": {}` — no Babel, no auto-hoisting. No jest.mock() needed here.

const customPlayground = require('./customPlayground')();

describe('customPlayground.applyMiddleware — nil guards', () => {
  it('returns without error when app is nil', async () => {
    await expect(
      customPlayground.applyMiddleware({
        app: null,
        path: '/graphql',
        playground: { filePath: '/tmp/pg.html', templateFilePath: '/tmp/tpl.html' }
      })
    ).resolves.toBeUndefined();
  });

  it('does not call app.use when path is nil', async () => {
    const app = { use: jest.fn(), logger: { error: jest.fn() } };
    await customPlayground.applyMiddleware({
      app,
      path: null,
      playground: { filePath: '/tmp/pg.html', templateFilePath: '/tmp/tpl.html' }
    });
    expect(app.use).not.toHaveBeenCalled();
  });

  it('does not call app.use when playground.filePath is nil', async () => {
    const app = { use: jest.fn(), logger: { error: jest.fn() } };
    await customPlayground.applyMiddleware({
      app,
      path: '/graphql',
      playground: { filePath: null, templateFilePath: '/tmp/tpl.html' }
    });
    expect(app.use).not.toHaveBeenCalled();
  });

  it('does not call app.use when playground.templateFilePath is nil', async () => {
    const app = { use: jest.fn(), logger: { error: jest.fn() } };
    await customPlayground.applyMiddleware({
      app,
      path: '/graphql',
      playground: { filePath: '/tmp/pg.html', templateFilePath: null }
    });
    expect(app.use).not.toHaveBeenCalled();
  });
});

describe('customPlayground.withBanner — nil/empty guards', () => {
  it('does not throw and does not register a route when app is nil', () => {
    expect(() =>
      customPlayground.withBanner({
        app: null,
        path: '/graphql',
        playground: { endpoint: '/graphql' },
        banner: { messages: [{ text: 'deprecation notice' }] }
      })
    ).not.toThrow();
  });

  it('does not register a route when banner is an empty object', () => {
    const app = { get: jest.fn() };
    customPlayground.withBanner({
      app,
      path: '/graphql',
      playground: { endpoint: '/graphql' },
      banner: {}
    });
    expect(app.get).not.toHaveBeenCalled();
  });

  it('does not register a route when playground is an empty object', () => {
    const app = { get: jest.fn() };
    customPlayground.withBanner({
      app,
      path: '/graphql',
      playground: {},
      banner: { messages: [{ text: 'deprecation notice' }] }
    });
    expect(app.get).not.toHaveBeenCalled();
  });
});

describe('customPlayground.withBanner — request handler', () => {
  it('registers a GET handler for the path when all params are provided', () => {
    const app = { get: jest.fn() };
    customPlayground.withBanner({
      app,
      path: '/graphql',
      playground: { endpoint: '/graphql' },
      banner: { messages: [{ text: 'The playground will be deprecated.' }] }
    });
    expect(app.get).toHaveBeenCalledWith('/graphql', expect.any(Function));
  });

  it('calls next() and does not write for non-HTML (application/json) requests', () => {
    let handler;
    const app = { get: (p, h) => { handler = h; } };
    customPlayground.withBanner({
      app,
      path: '/graphql',
      playground: { endpoint: '/graphql' },
      banner: { messages: [{ text: 'x' }] }
    });
    const req = { originalUrl: '/graphql', headers: { accept: 'application/json' } };
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
    const next = jest.fn();
    handler(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.write).not.toHaveBeenCalled();
  });

  it('serves playground HTML with banner injected before <body> for text/html requests', () => {
    let handler;
    const app = { get: (p, h) => { handler = h; } };
    customPlayground.withBanner({
      app,
      path: '/graphql',
      playground: { endpoint: '/graphql' },
      banner: { messages: [{ text: 'The playground will be deprecated.' }] }
    });
    const req = {
      originalUrl: '/graphql',
      headers: { accept: 'text/html,application/xhtml+xml' }
    };
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
    const next = jest.fn();
    handler(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledTimes(1);
    const html = res.write.mock.calls[0][0];
    expect(html).toContain('The playground will be deprecated.');
    expect(html).toContain('<body>');
  });
});
