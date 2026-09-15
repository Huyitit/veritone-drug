'use strict';

const chaiExpect = require('chai').expect;

// VE-26450 — callers read "no rows" as "nothing declared, allow the publish", so any bug returning zero rows
// silently disables enforcement. That makes the argument handling, not the SQL, the risky part.
describe('destinationMediaConstraint.js (VE-26450)', function () {
  const TYPE_ID = 'b0cc0c8e-409b-44d5-9d0f-389144aa53e0';
  let serviceContext;
  let dal;
  let captured;

  beforeEach(function () {
    captured = [];
    serviceContext = {
      config: {},
      dbConnections: {
        core: {
          read: {
            map: jest.fn((sql, values, mapFn) => {
              captured.push({ sql, values });
              return Promise.resolve(
                [
                  {
                    id: 'mc-1',
                    destination_type_id: TYPE_ID,
                    post_type: 'reels',
                    constraint_schema: {
                      properties: { durationMs: { minimum: 3000, maximum: 900000 } }
                    },
                    recommended_media: { widthPx: 1080, heightPx: 1920, aspectRatio: 0.5625 }
                  }
                ].map(mapFn)
              );
            })
          }
        }
      }
    };
    dal = require('./destinationMediaConstraint.js')(serviceContext);
  });

  it('parameterizes the destination type filter rather than interpolating it', async function () {
    await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

    const { sql, values } = captured[0];
    chaiExpect(sql).to.contain('$1');
    chaiExpect(sql).to.not.contain(TYPE_ID);
    chaiExpect(values).to.include(TYPE_ID);
    chaiExpect(sql).to.contain('deleted_at IS NULL');
  });

  it('does NOT filter by post_type unless asked', async function () {
    await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

    // A hardcoded post type would match nothing for platforms that have no such type.
    chaiExpect(captured[0].sql).to.not.contain('post_type =');
  });

  it('hands the advisory targets through as plain numbers', async function () {
    // JSONB numbers arrive as numbers, so nothing needs coercing on the way out. A string here would surface in
    // the UI as guidance the client cannot compare against its own measurement.
    const rows = await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

    chaiExpect(rows[0].recommendedMedia).to.deep.equal({
      widthPx: 1080,
      heightPx: 1920,
      aspectRatio: 0.5625
    });
    chaiExpect(rows[0].postType).to.equal('reels');
  });

  it('hands the constraint schema through as an object, not a string', async function () {
    // ajv compiles an object; a string would throw and the check would fall through to the vendor, disabling
    // enforcement with only a warn log to show for it.
    const rows = await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

    chaiExpect(rows[0].constraintSchema).to.deep.equal({
      properties: { durationMs: { minimum: 3000, maximum: 900000 } }
    });
  });

  it('leaves the declared bounds as numbers rather than coercing them', async function () {
    // The bounds live inside JSONB, which pg parses as real JSON. A bound arriving as a string would make ajv
    // skip the keyword silently, so the seed's types are asserted in CI rather than repaired here.
    const rows = await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

    chaiExpect(rows[0].constraintSchema.properties.durationMs.minimum).to.equal(3000);
    chaiExpect(rows[0].constraintSchema.properties.durationMs.maximum).to.equal(900000);
  });

  it('selects the schema column, not the retired per-limit columns', async function () {
    await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

    chaiExpect(captured[0].sql).to.contain('constraint_schema');
    chaiExpect(captured[0].sql).to.contain('recommended_media');
    chaiExpect(captured[0].sql).to.not.contain('hard_duration');
    chaiExpect(captured[0].sql).to.not.contain('recommended_width_px');
  });

  it('returns [] for an explicitly empty id list — never every platform', async function () {
    const rows = await dal.getMediaConstraints({}, { destinationTypeIds: [] });

    chaiExpect(rows).to.deep.equal([]);
    // An unfiltered query would return every platform's rows.
    chaiExpect(captured.length, 'must not query at all').to.equal(0);
  });

  it('throws rather than silently matching nothing when an id is nullish', async function () {
    // A nullish id yields `IN (NULL)` -> zero rows -> "nothing declared" -> publish allowed silently.
    await expect(
      dal.getMediaConstraints({}, { destinationTypeIds: [null] })
    ).rejects.toThrow();
    await expect(
      dal.getMediaConstraints({}, { destinationTypeIds: [undefined] })
    ).rejects.toThrow();
    chaiExpect(captured.length).to.equal(0);
  });

  it('throws when destinationTypeIds is missing or not an array', async function () {
    await expect(dal.getMediaConstraints({}, {})).rejects.toThrow();
    await expect(
      dal.getMediaConstraints({}, { destinationTypeIds: TYPE_ID })
    ).rejects.toThrow();
  });

  // The rows are Flyway-seeded reference data read on the publish path, so re-reading them per publish is a
  // query bought for nothing. What has to stay true is that a row edit still lands without a restart.
  describe('caching', function () {
    const OTHER_TYPE_ID = '2f1a5f6c-1f0e-4a2e-9a67-1b0a2f3c4d5e';

    it('queries once for a destination type, then serves later reads from cache', async function () {
      await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });
      const first = await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });
      const second = await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

      chaiExpect(captured.length, 'one query for three reads').to.equal(1);
      chaiExpect(first[0].id).to.equal('mc-1');
      chaiExpect(second[0].id).to.equal('mc-1');
    });

    // The common case on the publish path: most destination types declare nothing. Caching only the hits would
    // leave exactly those types querying on every publish.
    it('caches a type that declares nothing, rather than re-querying for it', async function () {
      serviceContext.dbConnections.core.read.map.mockImplementation((sql, values) => {
        captured.push({ sql, values });
        return Promise.resolve([]);
      });

      await dal.getMediaConstraints({}, { destinationTypeIds: [OTHER_TYPE_ID] });
      const rows = await dal.getMediaConstraints({}, { destinationTypeIds: [OTHER_TYPE_ID] });

      chaiExpect(rows).to.deep.equal([]);
      chaiExpect(captured.length).to.equal(1);
    });

    it('queries only the ids it has not cached', async function () {
      await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });
      await dal.getMediaConstraints(
        {},
        { destinationTypeIds: [TYPE_ID, OTHER_TYPE_ID] }
      );

      chaiExpect(captured.length).to.equal(2);
      chaiExpect(captured[1].values, 'the cached id must not be re-queried').to.deep.equal([
        OTHER_TYPE_ID
      ]);
    });

    it('re-reads once the TTL has passed, so a row edit lands without a restart', async function () {
      serviceContext.config = { social: { mediaConstraintCacheTtlMs: 20 } };
      dal = require('./destinationMediaConstraint.js')(serviceContext);

      await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });
      chaiExpect(captured.length).to.equal(1);

      await new Promise((resolve) => setTimeout(resolve, 40));
      await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

      chaiExpect(captured.length).to.equal(2);
    });

    // Cached rows are handed to every caller, so a caller that wrote to one would corrupt every later publish.
    it('freezes the rows it caches, including the schema handed to ajv', async function () {
      const rows = await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

      chaiExpect(Object.isFrozen(rows[0])).to.equal(true);
      chaiExpect(Object.isFrozen(rows[0].constraintSchema)).to.equal(true);
      chaiExpect(
        Object.isFrozen(rows[0].constraintSchema.properties.durationMs)
      ).to.equal(true);
    });

    // A post-type-filtered subset cached under the type's key would be served to the unfiltered callers that
    // actually run enforcement, silently narrowing what is checked.
    it('does not cache or serve a post-type-filtered read', async function () {
      await dal.getMediaConstraints(
        {},
        { destinationTypeIds: [TYPE_ID], postType: 'reels' }
      );
      await dal.getMediaConstraints(
        {},
        { destinationTypeIds: [TYPE_ID], postType: 'reels' }
      );
      await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID] });

      chaiExpect(captured.length).to.equal(3);
      chaiExpect(captured[2].values).to.deep.equal([TYPE_ID]);
    });
  });

  it('parameterizes and bounds postType when supplied', async function () {
    await dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID], postType: 'reels' });
    chaiExpect(captured[0].values).to.include('reels');
    chaiExpect(captured[0].sql).to.not.contain("'reels'");

    await expect(
      dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID], postType: 'x'.repeat(65) })
    ).rejects.toThrow();
    await expect(
      dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID], postType: '' })
    ).rejects.toThrow();
    await expect(
      dal.getMediaConstraints({}, { destinationTypeIds: [TYPE_ID], postType: 42 })
    ).rejects.toThrow();
  });
});
