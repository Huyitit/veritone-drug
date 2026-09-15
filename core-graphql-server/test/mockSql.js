const _ = require('lodash');
const { parse: parseQuery } = require('libpg-query');

module.exports = function require() {
  function handleOffsetLimit(sqlIn) {
    let sql = sqlIn;
    const offsetIndex = sql.indexOf('offset ');
    const limitIndex = sql.indexOf('limit ');
    if (offsetIndex > 0 && limitIndex > 0 && offsetIndex < limitIndex) {
      // if offset came before limit, switch them.
      // yes there's probably a better way to do this...
      sql = sql.replace(/offset /g, '_timil ');
      sql = sql.replace(/limit /g, '_tesffo ');
      sql = sql.replace(/_timil /g, 'limit ');
      sql = sql.replace(/_tesffo /g, 'offset ');
    }
    return sql;
  }

  // the sql parser lib doesn't handle sql parameters,
  // so we need to expand those ourselves.
  // we'll do some validation here.
  function expandVariables(sql, _args) {
    const args = _args || [];
    let res = sql;

    // first count and validate the number of variables passed against
    // number used in query SQL.
    const pattern = /(\$[0-9]+)/g;
    const numVariableReferences = (res.match(pattern) || []).length;

    // validate that we don't have unused variables, as this can indicate
    // a code bug.
    // note that we can have *more* variable reference than variables if a
    // given variable is used more than once.
    if (numVariableReferences < args.length) {
      throw new Error(
        'too many variables passed. used:  ' +
          numVariableReferences +
          ', got ' +
          args.length +
          ' ' +
          args +
          ' in ' +
          sql
      );
    }

    // now replace values and validate that each was used.
    // go backwards when we replace to avoid replacing $11
    // with $1's value.
    // we normalize everything to lower case, like
    // we did with the query body.
    for (let i = args.length - 1; i >= 0; i--) {
      const key = `$${i + 1}`;
      let value = `'${args[i]}'`;
      if (_.isNumber(args[i])) {
        value = `${args[i]}`;
      } else if (_.isObject(args[i])) {
        value = `'${JSON.stringify(args[i]).toLowerCase()}'::JSONB`;
      } else if (_.isString(args[i])) {
        value = `'${args[i].trim().toLowerCase()}'`;
      }
      if (!res.includes(key)) {
        throw new Error(
          'variable ' + key + ' passed but not used in query [' + sql + ']'
        );
      }
      const regex = '\\' + key;
      res = res.replace(new RegExp(regex, 'g'), value);
    }
    return res;
  }

  function handleWithSQL(sql, vars) {
    const sqlWithRegex = /with \w+ as \(/g;
    let m;
    while ((m = sqlWithRegex.exec(sql)) !== null) {
      const start = sql.indexOf('(', m.index) + 1;
      let counter = 1;
      let i = start;
      for (let counter = 1; i < sql.length && counter > 0; i++) {
        if (sql[i] === '(') {
          counter++;
        }
        if (sql[i] === ')') {
          counter--;
        }
      }
      const subQuery = sql.substring(start, i - 2);
      try {
        parseSQL(subQuery, vars);
      } catch (err) {
        if (_.startsWith(err.message, 'too many variables passed. used:  0')) {
          parseSQL(subQuery, []);
        } else if (_.startsWith(err.message, 'too many variables passed')) {
          // some of the args are used in the with query, skip validation for now
          // since determining which args are used is not trivial
          continue;
        } else {
          throw err;
        }
      }
      sql = sql.slice(0, m.index) + ' ' + sql.slice(i);
      m.lastIndex = 0;
    }
    return sql;
  }

  async function parseSQL(sqlIn, vars) {
    let sql = sqlIn.trim().toLowerCase();

    // expand variable references. includes
    // some validation of references to actual args.
    sql = expandVariables(sql, vars || []);

    if (sqlIn.length) {
      try {
        const ast = await parseQuery(sqlIn);
        return { ast, processed: sql };
      } catch (err) {
        console.error(`${err}: ${sql}`);
        throw err;
      }
    }
  }

  return {
    parseSQL
  };
};
