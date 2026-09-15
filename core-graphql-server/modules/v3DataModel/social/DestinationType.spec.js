'use strict';

const cacheGet = jest.fn((context, args, name, fn) => fn());
jest.mock('../../../resolvers/cache.js', () => () => ({ get: cacheGet }));

const DestinationType = require('./DestinationType.js');

function makeResolvers(config = {}) {
  const getSchema = jest.fn().mockReturnValue('the-schema');
  const getEngine = jest.fn().mockReturnValue('the-engine');
  const serviceContext = {
    config,
    dal: {
      structuredData: { getSchema },
      engine: { getEngine }
    }
  };
  return {
    resolvers: DestinationType(serviceContext),
    getSchema,
    getEngine
  };
}

// VE-26450 — mediaConstraints reads through the request-scoped DataLoader, so the spec supplies one the way
// the GraphQL context does. `load` stands in for the batch; batching itself is loaders/mediaConstraint.spec.js.
let loadMediaConstraints;
let context;

beforeEach(() => {
  cacheGet.mockClear();
  loadMediaConstraints = jest
    .fn()
    .mockResolvedValue([{ id: 'mc-1', postType: 'reels' }]);
  context = {
    reqId: 'r1',
    loaders: {
      mediaConstraintsByDestinationTypeId: { load: loadMediaConstraints }
    }
  };
});

describe('v3DataModel DestinationType field resolvers', () => {
  describe('engine', () => {
    it('loads the engine by engineId when present', () => {
      const { resolvers, getEngine } = makeResolvers();
      expect(resolvers.engine({ engineId: 'e1' }, {}, context)).toBe('the-engine');
      expect(getEngine).toHaveBeenCalledWith(context, { id: 'e1' });
    });

    it('returns null when engineId is absent', () => {
      const { resolvers, getEngine } = makeResolvers();
      expect(resolvers.engine({}, {}, context)).toBeNull();
      expect(getEngine).not.toHaveBeenCalled();
    });
  });

  describe('configSchema / publishSchema', () => {
    it('resolves configSchema via the cache with the default customer-success org and skip-access-check', () => {
      const { resolvers, getSchema } = makeResolvers();
      const result = resolvers.configSchema({ configSchemaId: 's1' }, {}, context);

      expect(cacheGet).toHaveBeenCalledWith(
        context,
        { id: 's1', organizationId: 7682, _skipAccessCheck: true },
        'Schema',
        expect.any(Function)
      );
      expect(getSchema).toHaveBeenCalledWith(context, { id: 's1', organizationId: 7682, _skipAccessCheck: true });
      expect(result).toBe('the-schema');
    });

    it('resolves publishSchema from the publishSchemaId', () => {
      const { resolvers } = makeResolvers();
      resolvers.publishSchema({ publishSchemaId: 's2' }, {}, context);
      expect(cacheGet).toHaveBeenCalledWith(
        context,
        { id: 's2', organizationId: 7682, _skipAccessCheck: true },
        'Schema',
        expect.any(Function)
      );
    });

    it('returns null and skips the cache when the schema id is absent', () => {
      const { resolvers } = makeResolvers();
      expect(resolvers.configSchema({}, {}, context)).toBeNull();
      expect(resolvers.publishSchema({}, {}, context)).toBeNull();
      expect(cacheGet).not.toHaveBeenCalled();
    });

    it('honors a configured db.constants.customerSuccessOrgId', () => {
      const { resolvers } = makeResolvers({ db: { constants: { customerSuccessOrgId: 9999 } } });
      resolvers.configSchema({ configSchemaId: 's1' }, {}, context);
      expect(cacheGet).toHaveBeenCalledWith(
        context,
        { id: 's1', organizationId: 9999, _skipAccessCheck: true },
        'Schema',
        expect.any(Function)
      );
    });
  });

  // VE-26450 — mediaConstraints is on the SAME pg connection as the type itself, so unlike
  // configSchema/publishSchema it must NOT go through the cross-connection schema cache path.
  describe('mediaConstraints', () => {
    it('reads constraints for the type through the request-scoped loader', async () => {
      const { resolvers } = makeResolvers();

      const result = await resolvers.mediaConstraints({ id: 'dt-1' }, {}, context);

      expect(loadMediaConstraints).toHaveBeenCalledWith('dt-1');
      expect(result).toEqual([
        { id: 'mc-1', postType: 'reels', _ambiguousPostType: false }
      ]);
      // Not a Schema lookup — a constraint is not a data_registries row.
      expect(cacheGet).not.toHaveBeenCalled();
    });

    // The regression: a per-type DAL read here is one query per row of `destinationTypes { mediaConstraints }`.
    it('issues one load per type rather than reaching for the DAL itself', async () => {
      const { resolvers } = makeResolvers();

      await Promise.all([
        resolvers.mediaConstraints({ id: 'dt-1' }, {}, context),
        resolvers.mediaConstraints({ id: 'dt-2' }, {}, context),
        resolvers.mediaConstraints({ id: 'dt-3' }, {}, context)
      ]);

      // DataLoader coalesces these into a single batch; the resolver's job is only to not bypass it.
      expect(loadMediaConstraints.mock.calls.map((c) => c[0])).toEqual([
        'dt-1',
        'dt-2',
        'dt-3'
      ]);
    });

    it('returns the empty list unchanged, since undeclared means unenforced rather than an error', async () => {
      const { resolvers } = makeResolvers();
      loadMediaConstraints.mockResolvedValue([]);

      await expect(resolvers.mediaConstraints({ id: 'dt-2' }, {}, context)).resolves.toEqual([]);
    });

    it('tags every row as ambiguous when the type declares more than one post type', async () => {
      // enforcedConstraints has to report nothing enforced in that state, and a row cannot see its siblings —
      // so the tag has to be applied here, where the whole set is in hand.
      const { resolvers } = makeResolvers();
      loadMediaConstraints.mockResolvedValue([
        { id: 'a', postType: 'reels' },
        { id: 'b', postType: 'stories' }
      ]);

      const rows = await resolvers.mediaConstraints({ id: 'dt-3' }, {}, context);

      expect(rows.every((r) => r._ambiguousPostType === true)).toBe(true);
    });

    // The loader's rows are shared between every type in the request and frozen by the DAL, so tagging must
    // copy. Mutating in place would both throw and corrupt a sibling resolver's rows.
    it('does not mutate the rows it tags', async () => {
      const { resolvers } = makeResolvers();
      const row = Object.freeze({ id: 'mc-1', postType: 'reels' });
      loadMediaConstraints.mockResolvedValue([row]);

      await resolvers.mediaConstraints({ id: 'dt-1' }, {}, context);

      expect(row).toEqual({ id: 'mc-1', postType: 'reels' });
    });
  });
});
