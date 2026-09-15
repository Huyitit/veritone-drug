/* eslint-disable no-case-declarations */
const jsonpointer = require('json-pointer');
const jsonpatch = require('fast-json-patch');

function getSecondLastSubPath(path) {
  const arr = path.split('/');
  return arr[arr.length - 2];
}

function getLastSubPath(path) {
  const arr = path.split('/');
  return arr[arr.length - 1];
}

/**
 * Validates the compatibility between an original schema and a changed schema.
 * it throws an error if the schema is not backward compatible and returns nothing if it is.
 * @param {object} originalSchema - The original schema object.
 * @param {object} changedSchema - The changed schema object.
 * @param {object} [opts={}] - Optional configuration options.
 * @param {boolean} [opts.allowReorder=false] - Whether to allow reordering of items.
 * @param {boolean} [opts.allowNewOneOf=false] - Whether to allow adding new oneOf items.
 * @param {boolean} [opts.allowNewEnumValue=false] - Whether to allow adding new enum values.
 * @param {string[]} [opts.deprecatedItems=[]] - An array of deprecated items.
 * @throws {Error} Throws an error if the schema is not backward compatible.
 */
function validateSchemaCompatibility(originalSchema, changedSchema, opts = {}) {
  const move = 'move';
  const remove = 'remove';
  const replace = 'replace';
  const add = 'add';
  let diff = [];
  const patch = jsonpatch.compare(originalSchema, changedSchema);

  const removed = [];
  const inserted = [];

  patch.forEach((node) => {
    const operation = node.op;
    const path = node.path;
    const required = 'required';
    const props = 'properties';
    const defn = 'definitions';
    const isMinItems = /minItems$/.test(path);

    switch (operation) {
      case move:
      case remove:
        if (getSecondLastSubPath(path) === required || isMinItems) {
          break;
        }

        /**
         * Check if the removed node is deprecated
         */
        const deprecatedItems = opts.deprecatedItems || [];
        const isAnyOfItem = /anyOf\/[\d]+$/.test(path);
        if (isAnyOfItem) {
          const value = jsonpointer.get(originalSchema, path);
          if (
            value.$ref &&
            deprecatedItems.indexOf(getLastSubPath(value.$ref)) !== -1
          ) {
            break;
          }
        } else {
          if (deprecatedItems.indexOf(getLastSubPath(path)) !== -1) {
            break;
          }
        }

        diff.push(node);

        break;

      case replace:
        const oldValue = jsonpointer.get(originalSchema, path);
        if (isMinItems && oldValue > node.value) {
          /** skip */
        } else {
          if (!opts.allowReorder) {
            diff.push(node);
          } else {
            removed.push({ name: oldValue, node });
            inserted.push(node.value);
          }
        }
        break;

      case add:
        const isNewAnyOfItem = /anyOf\/[\d]+$/.test(path);
        const isNewEnumValue = /enum\/[\d]+$/.test(path);
        const pathTwoLastLevels = getSecondLastSubPath(path);

        if (pathTwoLastLevels !== props && pathTwoLastLevels !== defn) {
          if (isNewAnyOfItem && opts.allowReorder) {
            inserted.push(node.value.$ref);
          } else if (
            (isNewAnyOfItem && opts.allowNewOneOf) ||
            (isNewEnumValue && opts.allowNewEnumValue)
          ) {
            // skip this
          } else {
            diff.push(node);
          }
        }

        if (pathTwoLastLevels === required) {
          diff.push(node);
        }

        break;

      default:
    }
  });

  if (opts.allowReorder) {
    // When reordering is allowed, we want to make sure that any item that
    // was replaced is also inserted somewhere else.
    diff = [
      ...diff,
      ...removed
        .filter((node) => inserted.indexOf(node.name) === -1)
        .map((node) => node.node)
    ];
  }

  if (diff.length > 0) {
    throw new Error(
      `The schema is not backward compatible. Difference include breaking change = ${JSON.stringify(
        diff
      )}`
    );
  }
}
module.exports = {
  validateSchemaCompatibility
};
