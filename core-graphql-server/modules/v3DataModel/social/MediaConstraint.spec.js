'use strict';

const chaiExpect = require('chai').expect;
const MediaConstraint = require('./MediaConstraint.js');

// VE-26450 — the SDL tells clients not to gate on anything absent from `enforcedConstraints`, so if this
// over-reports, a client blocks publishes the server never validates.
describe('MediaConstraint field resolvers (VE-26450)', function () {
  function row(properties) {
    return { constraintSchema: { properties } };
  }

  const resolvers = MediaConstraint();

  it('reports DURATION when a duration bound is declared', function () {
    chaiExpect(
      resolvers.enforcedConstraints(row({ durationMs: { minimum: 3000, maximum: 900000 } }))
    ).to.deep.equal(['DURATION']);
    chaiExpect(resolvers.enforcedConstraints(row({ durationMs: { maximum: 900000 } }))).to.deep.equal([
      'DURATION'
    ]);
    chaiExpect(resolvers.enforcedConstraints(row({ durationMs: { minimum: 3000 } }))).to.deep.equal([
      'DURATION'
    ]);
  });

  it('reports nothing when no duration bound is declared', function () {
    // The check returns without comparing anything when both bounds are null — as YouTube's row is.
    chaiExpect(
      resolvers.enforcedConstraints(row({}))
    ).to.deep.equal([]);
    chaiExpect(resolvers.enforcedConstraints({})).to.deep.equal([]);
  });

  it('NEVER reports DIMENSIONS or ASPECT_RATIO while enforcement is deferred behind VE-26886', function () {
    // The published asset is a downscaled preview, so a client checking dimensions would reject publishable ones.
    const fullyDeclared = {
      constraintSchema: {
        properties: {
          durationMs: { minimum: 3000, maximum: 900000 },
          widthPx: { minimum: 320, maximum: 1920 },
          heightPx: { minimum: 320, maximum: 3600 },
          aspectRatio: { minimum: 0.01, maximum: 10 }
        }
      }
    };
    const enforced = resolvers.enforcedConstraints(fullyDeclared);

    chaiExpect(enforced).to.not.include('DIMENSIONS');
    chaiExpect(enforced).to.not.include('ASPECT_RATIO');
    chaiExpect(enforced).to.deep.equal(['DURATION']);
  });

  it('returns a non-null list for a null-ish row, since the SDL types it non-null', function () {
    chaiExpect(resolvers.enforcedConstraints(null)).to.deep.equal([]);
    chaiExpect(resolvers.enforcedConstraints(undefined)).to.deep.equal([]);
  });

  it('reports NOTHING enforced when the destination type declares several post types', function () {
    // The check skips enforcement entirely in that state, so a client gating on any one row would block a
    // publish the server allowed. The flag is set by the DestinationType.mediaConstraints resolver, since a row
    // cannot see its siblings.
    chaiExpect(
      resolvers.enforcedConstraints({
        constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 900000 } } },
        _ambiguousPostType: true
      })
    ).to.deep.equal([]);
  });

  it('delegates to the shared predicate rather than re-deriving it', function () {
    // The field must not be able to disagree with the check, so assert the delegation itself.
    const source = require('fs').readFileSync(require.resolve('./MediaConstraint.js'), 'utf8');
    chaiExpect(source).to.contain('mediaConstraintEnforcement.js');
    chaiExpect(source).to.contain('enforcedConstraintClasses');
    chaiExpect(source, 'must not re-implement the bound check').to.not.contain('constraintSchema');
  });
});
