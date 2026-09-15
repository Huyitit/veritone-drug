// VE-27634 — rows 1-5
//
// shard-test-files.js runs as top-level module code (not exported functions) and
// calls process.exit() directly, so each case mocks glob + citest/jest.config,
// stubs process.exit/console, and re-requires the module fresh via
// jest.resetModules() — same isolation pattern as buildinfo.spec.js in this
// project's root jest config, which also has Babel hoisting disabled (jest.doMock
// is used instead of jest.mock so mock registration isn't hoist-dependent).

const MODULE_PATH = './shard-test-files.js';
const JEST_CONFIG_PATH = '../../citest/jest.config';

function mockGlobFiles(files) {
  jest.doMock('glob', () => ({
    sync: jest.fn().mockReturnValue(files)
  }));
}

function mockJestConfig(testPathIgnorePatterns) {
  jest.doMock(JEST_CONFIG_PATH, () => ({ testPathIgnorePatterns }));
}

function run() {
  require(MODULE_PATH);
}

describe('shard-test-files.js', () => {
  let originalEnv;
  let exitSpy;
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`__PROCESS_EXIT_${code}__`);
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // Row 1
  it('exits 1 with an error when SHARD_INDEX or MAX_SHARDS is not a valid number', () => {
    process.env.SHARD_INDEX = 'nope';
    process.env.MAX_SHARDS = '4';
    mockGlobFiles([]);
    mockJestConfig([]);

    expect(() => run()).toThrow('__PROCESS_EXIT_1__');
    expect(errorSpy).toHaveBeenCalledWith('ERROR: SHARD_INDEX and MAX_SHARDS must be valid numbers.');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // Row 2
  it('excludes test files whose parent directory matches a testPathIgnorePatterns entry', () => {
    process.env.SHARD_INDEX = '1';
    process.env.MAX_SHARDS = '1';
    mockGlobFiles(['/repo/citest/broken/foo.spec.js', '/repo/citest/keep/bar.spec.js']);
    mockJestConfig(['/broken']);

    run();

    const output = logSpy.mock.calls.find(args => String(args[0]).startsWith('__TEST_FILES__'))[0];
    expect(output).toContain('bar.spec.js');
    expect(output).not.toContain('foo.spec.js');
  });

  // Row 3
  it('exits 1 with an error when no test files are found', () => {
    process.env.SHARD_INDEX = '1';
    process.env.MAX_SHARDS = '1';
    mockGlobFiles([]);
    mockJestConfig([]);

    expect(() => run()).toThrow('__PROCESS_EXIT_1__');
    expect(errorSpy).toHaveBeenCalledWith('ERROR: No test files found');
  });

  // Row 4
  it('selects files by (index % MAX_SHARDS === SHARD_INDEX - 1), not an off-by-one', () => {
    process.env.SHARD_INDEX = '2';
    process.env.MAX_SHARDS = '3';
    mockGlobFiles([
      '/repo/citest/a/1.spec.js',
      '/repo/citest/b/2.spec.js',
      '/repo/citest/c/3.spec.js',
      '/repo/citest/d/4.spec.js',
      '/repo/citest/e/5.spec.js',
      '/repo/citest/f/6.spec.js'
    ]);
    mockJestConfig([]);

    run();

    // 0-based indices 1 and 4 satisfy i % 3 === 1 (SHARD_INDEX - 1)
    expect(logSpy).toHaveBeenCalledWith(
      '__TEST_FILES__ /repo/citest/b/2.spec.js /repo/citest/e/5.spec.js'
    );
  });

  // Row 5
  it('exits 1 for an oversized MAX_SHARDS that leaves this shard empty', () => {
    process.env.SHARD_INDEX = '5';
    process.env.MAX_SHARDS = '10';
    mockGlobFiles(['/repo/citest/a/1.spec.js']);
    mockJestConfig([]);

    expect(() => run()).toThrow('__PROCESS_EXIT_1__');
    expect(errorSpy).toHaveBeenCalledWith('ERROR: No tests selected for SHARD_INDEX=5');
  });

  it('emits the exact __TEST_FILES__ stdout contract on the success path', () => {
    process.env.SHARD_INDEX = '1';
    process.env.MAX_SHARDS = '1';
    mockGlobFiles(['/repo/citest/a/1.spec.js', '/repo/citest/b/2.spec.js']);
    mockJestConfig([]);

    run();

    expect(logSpy).toHaveBeenCalledWith(
      '__TEST_FILES__ /repo/citest/a/1.spec.js /repo/citest/b/2.spec.js'
    );
  });
});
