const chaiExpect = require('chai').expect;
const {
  isValidConditions,
  ErrOperatorNotSupported,
  ErrRootOperatorNotSupported
} = require('./eventConditions');

describe('eventConditions.js', function () {
  describe('isValidConditions()', function () {
    /** @type {[string, import('./eventConditions').ICondition, any][]} */
    const cases = [
      ['no conditions', '', /^conditions is not an object$/],
      [
        '[and] conditions valid',
        {
          conditions: [{ operator: 'eq', field: 'a', value: 'b' }]
        }
      ],
      [
        '[and] conditions invalid',
        {
          operator: 'and',
          conditions: []
        },
        /operator is missing a sub-conditions array$/
      ],
      [
        '[or] conditions invalid',
        {
          operator: 'or',
          conditions: []
        },
        /operator is missing a sub-conditions array$/
      ],
      [
        'unknown root operator',
        {
          operator: 'eq' // root operator must be [and] or [or]
        },
        ErrRootOperatorNotSupported
      ],
      [
        'unknown operator',
        {
          conditions: [{ operator: 'foo' }]
        },
        ErrOperatorNotSupported
      ],
      [
        'requires field name',
        {
          conditions: [{ operator: 'eq' }]
        },
        /requires field name$/
      ],
      [
        'requires field value',
        {
          conditions: [{ operator: 'eq', field: 'a' }]
        },
        /requires field value$/
      ],
      [
        'nested [and] conditions valid',
        {
          conditions: [
            { operator: 'eq', field: 'a', value: false },
            { operator: 'lt', field: 'b', value: true },
            {
              operator: 'and',
              conditions: [{ operator: 'gt', field: 'foo', value: 0 }]
            }
          ]
        }
      ]
    ];
    for (let c of cases) {
      const [name, condition, result] = c;
      it(name, function () {
        const err = isValidConditions(condition);
        if (result instanceof Error) {
          chaiExpect(err instanceof Error).to.be.true;
          chaiExpect(err.message).to.eq(result.message);
        } else if (result instanceof RegExp) {
          chaiExpect(err instanceof Error).to.be.true;
          chaiExpect(err.message).to.match(result);
        } else {
          chaiExpect(err).to.be.null;
        }
      });
    }
  });
});
