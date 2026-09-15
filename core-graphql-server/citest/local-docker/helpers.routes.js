const _ = require('lodash');

const SENSITIVE_TAG = '[Sensitive]';
const SEPARATOR = '.children.';

function expectConfigMarkedAsSensitive(rootConfig, sensitiveFieldPaths) {
  if (!_.isEmpty(sensitiveFieldPaths)) {
    for (const fieldPath of sensitiveFieldPaths) {
      const val = _.get(rootConfig, fieldPath);
      if (_.isNil(val)) {
        // if cannot get the value by path, try calling getPathsFromArray.
        const paths = getPathsFromArray(fieldPath, rootConfig);

        // verify for array config
        if (!_.isEmpty(paths)) {
          for (const path of paths) {
            const valOfItem = _.get(rootConfig, path);
            if (!_.isNil(valOfItem)) {
              expect(valOfItem).toEqual(SENSITIVE_TAG);
            }
          }
        }
        continue;
      } else {
        // verify for (nested) object
        expect(val).toEqual(SENSITIVE_TAG);
      }
    }
  }
}

function getPathsFromArray(fieldPath, rootConfig) {
  if (!_.includes(fieldPath, SEPARATOR)) {
    return [];
  }

  let subpaths = [];
  const splittedPaths = fieldPath.split(SEPARATOR).filter(Boolean);
  // only get parent levels, remove field name at the last item.
  const [firstLevel, hasSecondLevel] = _.take(
    splittedPaths,
    splittedPaths.length - 1
  );

  // use children of the first level to generate subpaths.
  if (firstLevel) {
    subpaths.push(...getPathsFromChildren(firstLevel, fieldPath, rootConfig));
  }

  // if the second level exists, recursively traverse the generated subpaths.
  if (hasSecondLevel && !_.isEmpty(subpaths)) {
    const paths = [];
    for (const path of subpaths) {
      paths.push(...getPathsFromArray(path, rootConfig));
    }

    subpaths = paths;
  }

  return subpaths;
}

function getPathsFromChildren(parentKey, fieldPath, rootConfig) {
  const children = _.get(rootConfig, parentKey);
  const newPaths = [];

  if (!_.isEmpty(children)) {
    const regex = new RegExp(`(?<=${parentKey})${SEPARATOR}`);
    _.forEach(children, (v, i) => {
      const path = fieldPath.replace(regex, SEPARATOR.replace('children', i));
      newPaths.push(path);
    });
  }

  return newPaths;
}

module.exports = {
  expectConfigMarkedAsSensitive
};
