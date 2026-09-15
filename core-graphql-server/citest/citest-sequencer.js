// Custom Jest test sequencer for the citest suite.
//
// Guarantees that spec files sharing a SESSION_TOKEN super admin account are placed
// in the same shard so they run sequentially and cannot race each other over the
// shared GQL server. See T63 (cross-shard session token race between orgInviteAppRole
// and adminInviteExistedUser) for the incident that motivated this.
//
// Usage: jest.config.js → testSequencer: './citest-sequencer.js'
//
// Note: does NOT extend @jest/test-sequencer — that package is not hoisted in the
// pnpm virtual store inside the Docker image. Sharding logic is implemented inline
// to match Jest 29's default contiguous-block distribution.

// Spec files that share a super admin SESSION_TOKEN and must NOT run concurrently.
// Any two specs in this list are pinned to the last shard so they run back-to-back.
const CO_LOCATE = [
  'orgInviteAppRole.spec.ts',
  'adminInviteExistedUser.spec.ts',
];

// Spec files that must run before anything else in their shard.
const PIN_FIRST = ['auditLog.platform.spec.js'];

// Replicates Jest 29's default contiguous-block sharding for an array of tests.
// Tests are divided into shardCount slices of as-equal size as possible; shards
// with a lower index receive the extra test when the count is not evenly divisible.
function defaultShard(tests, shardIndex, shardCount) {
  const total = tests.length;
  const minSize = Math.floor(total / shardCount);
  const remainder = total - minSize * shardCount;

  let start = 0;
  for (let i = 1; i < shardIndex; i++) {
    start += i <= remainder ? minSize + 1 : minSize;
  }
  const size = shardIndex <= remainder ? minSize + 1 : minSize;
  return tests.slice(start, start + size);
}

class CitestSequencer {
  sort(tests) {
    const isFirst = t => PIN_FIRST.some(name => t.path.endsWith(name));
    return [...tests.filter(isFirst), ...tests.filter(t => !isFirst(t))];
  }

  // Jest 29 calls cacheResults() after the run to persist timing data.
  // We don't extend @jest/test-sequencer so we provide a no-op.
  cacheResults() {}

  shard(tests, { shardIndex, shardCount }) {
    const isPinned = t => CO_LOCATE.some(name => t.path.endsWith(name));
    const pinned = tests.filter(isPinned);
    const rest   = tests.filter(t => !isPinned(t));

    const restShard = defaultShard(rest, shardIndex, shardCount);

    // Append pinned specs to the last shard only, so they run sequentially.
    if (shardIndex === shardCount) {
      return [...restShard, ...pinned];
    }
    return restShard;
  }
}

module.exports = CitestSequencer;
