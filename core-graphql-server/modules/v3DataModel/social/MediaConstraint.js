'use strict';

const _ = require('lodash');
const enforcement = require('./helper/mediaConstraintEnforcement.js');

/**
 * VE-26450 — `enforcedConstraints` tells clients which declared limits the server actually validates, so they do
 * not gate submission on one it does not. The predicate is shared with the pre-flight check rather than
 * reimplemented here; see helper/mediaConstraintEnforcement.js.
 */
module.exports = function createFunction() {
  return {
    enforcedConstraints: (obj) =>
      enforcement.enforcedConstraintClasses(obj, {
        // Set by DestinationType.mediaConstraints when several post-type rows exist: the check skips enforcement
        // entirely in that state, and a row cannot see its siblings.
        ambiguous: _.get(obj, '_ambiguousPostType') === true
      })
  };
};
