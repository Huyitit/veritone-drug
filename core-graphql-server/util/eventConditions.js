/**
 * @typedef {{field: string; operator: string; value: any}} ISingleCondition
 * @typedef {{operator?: 'and' | 'or'; conditions: ICondition}} ICombinedCondition
 * @typedef {ISingleCondition | ICombinedCondition} ICondition
 */

const singleOperators = new Set(['eq', 'gt', 'lt', 'gte', 'lte']);

const ErrOperatorNotSupported = new Error(
  `operator must be one of [and, or, ${Array.from(
    singleOperators.values()
  ).join(',')}]`
);

const ErrRootOperatorNotSupported = new Error(
  `conditions root operators must be [and] (default) or [or]`
);

/**
 * check a conditions
 * @param {ICondition} conditions
 * @returns {Error | null}
 */
function checkConditions(conditions) {
  if (typeof conditions !== 'object') {
    return new Error('conditions is not an object');
  }
  const { operator = 'and' } = conditions;
  if (operator === 'and' || operator === 'or') {
    const subConditions = conditions.conditions;
    if (!Array.isArray(subConditions) || subConditions.length < 1) {
      return new Error(
        `"${operator}" operator is missing a sub-conditions array`
      );
    }
    for (let c of subConditions) {
      const err = checkConditions(c);
      if (err) {
        return err;
      }
    }
    return null;
  }
  if (!singleOperators.has(operator)) {
    return ErrOperatorNotSupported;
  }
  // should we restrict the list of operators
  const { field, value } = conditions;
  if (typeof field !== 'string' || field.length < 1) {
    return new Error(`operator ${operator} requires field name`);
  }
  if (typeof value === 'undefined') {
    return new Error(`operator ${operator} requires field value`);
  }
  return null;
}

/**
 * isValidConditions validates the conditions
 * New operators may introduce fields
 * We can track them with a version number
 * @param {ICombinedCondition} conditions
 * @returns {Error | null}
 */
function isValidConditions(conditions) {
  if (Array.isArray(conditions)) {
    return new Error('root conditions object cannot be an array');
  }
  if (typeof conditions !== 'object') {
    return new Error('conditions is not an object');
  }
  if (Object.keys(conditions).length === 0) {
    // conditions object is empty, so we assume no conditions
    return null;
  }
  const { operator = 'and' } = conditions;
  if (operator === 'and' || operator === 'or') {
    return checkConditions(conditions);
  }
  return ErrRootOperatorNotSupported;
}

module.exports = {
  isValidConditions,
  ErrOperatorNotSupported,
  ErrRootOperatorNotSupported
};
