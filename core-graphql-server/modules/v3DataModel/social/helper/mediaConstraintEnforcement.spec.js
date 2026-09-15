'use strict';

const fs = require('fs');
const path = require('path');
const chaiExpect = require('chai').expect;
const enforcement = require('./mediaConstraintEnforcement.js');

// VE-26450 — the parity assertions below are what keep the check and the GraphQL contract from disagreeing;
// without them this module is just a third place to write the same predicate.
describe('mediaConstraintEnforcement.js (VE-26450)', function () {
  function row(properties) {
    return { constraintSchema: { properties } };
  }

  describe('constrainedProperties', function () {
    it('lists what the document constrains', function () {
      chaiExpect(
        enforcement.constrainedProperties(
          row({ durationMs: { minimum: 3000 }, widthPx: { maximum: 1920 } })
        )
      ).to.deep.equal(['durationMs', 'widthPx']);
    });

    it('ignores a property declared with no keywords', function () {
      // An empty object constrains nothing, so reporting it would claim a limit that cannot fail.
      chaiExpect(enforcement.constrainedProperties(row({ durationMs: {} }))).to.deep.equal([]);
    });

    it('is empty for a document declaring nothing, or a missing one', function () {
      chaiExpect(enforcement.constrainedProperties(row({}))).to.deep.equal([]);
      chaiExpect(enforcement.constrainedProperties({ constraintSchema: {} })).to.deep.equal([]);
      chaiExpect(enforcement.constrainedProperties({})).to.deep.equal([]);
      chaiExpect(enforcement.constrainedProperties(null)).to.deep.equal([]);
    });
  });

  describe('enforcedProperties', function () {
    it('keeps only what the server can measure', function () {
      // The seed declares the vendor's documented dimension limits; they are inert until VE-26886.
      chaiExpect(
        enforcement.enforcedProperties(
          row({
            durationMs: { minimum: 3000 },
            widthPx: { minimum: 320 },
            heightPx: { minimum: 320 },
            aspectRatio: { minimum: 0.01 }
          })
        )
      ).to.deep.equal(['durationMs']);
    });

    it('drops a property the server does not recognise at all', function () {
      // CI rejects one in a seed, but an operator INSERT is not covered by CI — it must read as unenforced
      // rather than as a limit nobody checks.
      chaiExpect(
        enforcement.enforcedProperties(row({ bitrateKbps: { maximum: 5000 } }))
      ).to.deep.equal([]);
    });
  });

  describe('isEnforcing', function () {
    it('is true when a measurable property is constrained', function () {
      chaiExpect(enforcement.isEnforcing(row({ durationMs: { minimum: 3000 } }))).to.equal(true);
      chaiExpect(enforcement.isEnforcing(row({ durationMs: { maximum: 900000 } }))).to.equal(true);
    });

    it('is false when nothing measurable is constrained — the YouTube row', function () {
      chaiExpect(enforcement.isEnforcing(row({}))).to.equal(false);
      chaiExpect(enforcement.isEnforcing(row({ widthPx: { minimum: 320 } }))).to.equal(false);
      chaiExpect(enforcement.isEnforcing({})).to.equal(false);
      chaiExpect(enforcement.isEnforcing(null)).to.equal(false);
    });
  });

  describe('enforcedConstraintClasses', function () {
    it('reports DURATION when duration is enforced', function () {
      chaiExpect(
        enforcement.enforcedConstraintClasses(row({ durationMs: { maximum: 900000 } }))
      ).to.deep.equal(['DURATION']);
    });

    it('NEVER reports DIMENSIONS or ASPECT_RATIO while enforcement waits on VE-26886', function () {
      const fullyDeclared = row({
        durationMs: { minimum: 3000, maximum: 900000 },
        widthPx: { minimum: 320 },
        heightPx: { maximum: 3600 },
        aspectRatio: { minimum: 0.01, maximum: 10 }
      });
      chaiExpect(enforcement.enforcedConstraintClasses(fullyDeclared)).to.deep.equal(['DURATION']);
    });

    it('reports each class once even when two of its properties are constrained', function () {
      // widthPx and heightPx share DIMENSIONS; the field is a list of classes, not of properties.
      const classes = Object.entries(enforcement.CONSTRAINT_PROPERTIES)
        .filter(([, meta]) => meta.measurable)
        .map(([, meta]) => meta.class);
      chaiExpect(new Set(classes).size).to.equal(classes.length);
    });

    it('reports NOTHING when the post type is ambiguous, even with limits declared', function () {
      // Several rows for one destination type means the check skips enforcement entirely, because nothing in a
      // publish says which row applies. A client that gated on a row here would block a publish the server
      // allowed — the harmful direction.
      chaiExpect(
        enforcement.enforcedConstraintClasses(
          row({ durationMs: { minimum: 3000, maximum: 900000 } }),
          { ambiguous: true }
        )
      ).to.deep.equal([]);
    });
  });

  // The reason this module exists. If these two ever diverge, either the client gates on something the server
  // does not check (blocking valid publishes) or stops gating on something it does (restoring the late failure).
  describe('parity with the pre-flight check and the SDL', function () {
    const ROWS = [
      row({ durationMs: { minimum: 3000, maximum: 900000 } }),
      row({ durationMs: { minimum: 3000, maximum: 600000 }, widthPx: { minimum: 360 } }),
      row({ durationMs: { maximum: 14400000 } }),
      row({}),
      row({ widthPx: { minimum: 320 }, aspectRatio: { enum: [0.5625, 1.7778] } }),
      {}
    ];

    it('reports DURATION exactly when the check would compare a duration', function () {
      const checkSource = fs.readFileSync(
        path.join(__dirname, '..', 'bll', 'mediaConstraintPolicy.js'),
        'utf8'
      );
      // The check must delegate rather than re-implement.
      chaiExpect(
        checkSource,
        'mediaConstraintPolicy.js must call the shared predicate, not re-derive it'
      ).to.contain('enforcement.enforcedProperties');

      ROWS.forEach(function (candidate) {
        const enforced = enforcement.enforcedConstraintClasses(candidate);
        const willCompare = enforcement.enforcedProperties(candidate).includes('durationMs');
        chaiExpect(
          enforced.includes('DURATION'),
          `disagreement for ${JSON.stringify(candidate)}`
        ).to.equal(willCompare);
      });
    });

    it('measures exactly the properties it reports as enforced', function () {
      // The check builds its facts object from enforcedProperties and looks each one up in MEASURERS. A
      // measurable property with no measurer would throw at publish time.
      const checkSource = fs.readFileSync(
        path.join(__dirname, '..', 'bll', 'mediaConstraintPolicy.js'),
        'utf8'
      );
      const block = checkSource.slice(checkSource.indexOf('const MEASURERS = {'));
      const measurers = block.slice(0, block.indexOf('};'));

      Object.entries(enforcement.CONSTRAINT_PROPERTIES)
        .filter(([, meta]) => meta.measurable)
        .forEach(([name]) => {
          chaiExpect(measurers, `${name} is measurable but has no measurer`).to.contain(`${name}:`);
        });
    });

    it('every class it can return is a member of the SDL MediaConstraintClass enum', function () {
      // A value absent from the enum fails serialization, and because the field is a non-null list inside a
      // non-null list it would null the whole destinationTypes result rather than just that field.
      const sdl = fs.readFileSync(
        path.join(__dirname, '..', '..', 'v3DataModel.graphql'),
        'utf8'
      );
      const block = sdl.slice(sdl.indexOf('enum MediaConstraintClass'));
      const members = block.slice(0, block.indexOf('}'));

      Object.values(enforcement.MEDIA_CONSTRAINT_CLASS).forEach(function (value) {
        chaiExpect(members, `${value} missing from the SDL enum`).to.contain(value);
      });
    });

    it('every property class is a member of that enum too', function () {
      const sdl = fs.readFileSync(
        path.join(__dirname, '..', '..', 'v3DataModel.graphql'),
        'utf8'
      );
      const block = sdl.slice(sdl.indexOf('enum MediaConstraintClass'));
      const members = block.slice(0, block.indexOf('}'));

      Object.values(enforcement.CONSTRAINT_PROPERTIES).forEach(function (meta) {
        chaiExpect(members, `${meta.class} missing from the SDL enum`).to.contain(meta.class);
      });
    });
  });
});
