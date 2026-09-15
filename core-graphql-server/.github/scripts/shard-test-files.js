const glob = require('glob');
const path = require('path');
const { testPathIgnorePatterns } = require('../../citest/jest.config');

const SHARD_INDEX = parseInt(process.env.SHARD_INDEX, 10);
const MAX_SHARDS = parseInt(process.env.MAX_SHARDS, 10);

console.error('DEBUG: SHARD_INDEX:', SHARD_INDEX, 'MAX_SHARDS:', MAX_SHARDS);

if (isNaN(SHARD_INDEX) || isNaN(MAX_SHARDS)) {
  console.error('ERROR: SHARD_INDEX and MAX_SHARDS must be valid numbers.');
  process.exit(1);
}

const testPattern = path.join(__dirname, '../../citest/**/*.spec.js');

const allTests = glob.sync(testPattern, { nodir: true }).filter(
  filePath =>
    !testPathIgnorePatterns.includes('/' + path.dirname(filePath).split('/').reverse()[0])
).sort();

if (allTests.length === 0) {
  console.error('ERROR: No test files found');
  console.error('DEBUG: CWD:', process.cwd());
  console.error('DEBUG: DIRNAME:', __dirname);
  process.exit(1);
}

const selected = allTests.filter((_, i) => i % MAX_SHARDS === SHARD_INDEX - 1);

if (selected.length === 0) {
  console.error(`ERROR: No tests selected for SHARD_INDEX=${SHARD_INDEX}`);
  process.exit(1);
}

console.log(`__TEST_FILES__ ${selected.join(' ')}`);
