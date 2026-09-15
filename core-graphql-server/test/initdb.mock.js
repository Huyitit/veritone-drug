const _ = require('lodash');

const mockUtil = require('./mockSql.js')();

module.exports = function createFunction(serviceContext, options = {}) {
  const config = serviceContext.config;
  const dbConfigs = config.db;
  const throwOnNoResultInQueue =
    _.get(options, 'throwOnNoResultInQueue', true) === true;
  const enableTransactionQuery =
    _.get(options, 'enableTransactionQuery', false) === true;
  const dbConnections = {};

  function parse(sqlIn, vars) {
    return mockUtil.parseSQL(sqlIn, vars);
  }

  // set up mock database connection objects
  Object.keys(dbConfigs).forEach((key) => {
    // first get the uri
    const readUri = dbConfigs[key].read;
    const writeUri = dbConfigs[key].write;

    dbConnections[key] = {
      read: readUri ? makeWrapper(readUri) : undefined,
      write: writeUri ? makeWrapper(writeUri) : undefined
    };
  });

  const results = [];

  async function fake(sql, args, mapper, uri) {
    let res = [];
    let doParse = true;
    let rstrings = [];
    let checkFunction = (sql, args) => true;
    const results = mockResultQueue[uri] || [];
    const parseIt = parseQueue[uri] || [];
    const stringQueue = requiredStringsQueue[uri] || [];
    const ctQueue = checkFunctionQueue[uri] || [];
    const isFailQueriesQueue = isFailQueries[uri] || [];
    if (results.length) {
      res = results.shift();
      doParse = parseIt.shift();
      rstrings = stringQueue.shift();
      checkFunction = ctQueue.shift();
      if (_.isNil(checkFunction)) checkFunction = (sql, args) => true;

      if (Object.prototype.toString.call(res).includes('Error')) {
        throw res;
      }

      if (typeof checkFunction !== 'function')
        return Promise.reject(
          new Error(
            'checkFunction is ' +
              typeof checkFunction +
              ', not a function:  ' +
              JSON.stringify(checkFunction)
          )
        );

      if (mapper) {
        if (typeof mapper !== 'function')
          return Promise.reject(
            new Error('mapper is ' + typeof mapper + ', not a function')
          );

        res = res.map(mapper);
      }
    } else {
      if (throwOnNoResultInQueue) {
        return Promise.reject(
          new Error(
            'test code error - no SQL result in queue for ' +
              uri +
              ' ' +
              sql +
              ' \n[' +
              args +
              ']'
          )
        );
      } else {
        return Promise.resolve([]);
      }
    }
    let checkFailQueryRequest = isFailQueriesQueue.shift();
    if (checkFailQueryRequest === true) {
      return Promise.reject(new Error('Error: Query fails'));
    }

    // parse the query
    let ast;
    let processed = _.toString(sql).toLowerCase(); // default to raw query
    if (doParse) {
      try {
        const r = await parse(sql, args);
        ast = r.ast;
        processed = r.processed;
      } catch (err) {
        // error out on parse failure
        return Promise.reject(err);
      }
      //console.log(JSON.stringify(ast,null,2));
      // TODO later we can use the AST to validate
      // additional attributes such as known table
      // names and columns, maybe.
      // variables are somewhat validated in expandVariables.
    }

    // enforce required strings. this feature is used to validate
    // that the generated query had certain attributes.
    for (let i = 0; i < rstrings.length; i++) {
      const str = rstrings[i];
      if (!processed.includes(str.trim().toLowerCase())) {
        return Promise.reject(
          'required string ' +
            str +
            ' was not found in the query [' +
            processed +
            ']'
        );
      }
    }

    if (!checkFunction(sql, args, ast))
      return Promise.reject(
        new Error('check function failed for\n' + sql + '\n' + args)
      );

    return Promise.resolve(res);
  }

  function makeWrapper(uri) {
    const res = {
      connect: async () => {
        return {
          done: () => Promise.resolve(),
          query: async (sql, args) => {
            if (!enableTransactionQuery) return Promise.resolve();
            else return fake(sql, args, undefined, uri);
          },
          map: async (sql, args, mapfun) => fake(sql, args, mapfun, uri),
          one: async (sql, args, mapfun) => fake(sql, args, mapfun, uri),
          none: async (sql, args) => fake(sql, args, undefined, uri),
          oneOrNone: async function (sql, args, mapfun) {
            return fake(sql, args, mapfun, uri)
              .then((res) => Promise.resolve(res.length ? res[0] : null))
              .catch((err) => Promise.reject(err));
          },
        };
      },
      map: async function (sql, args, mapfun) {
        return fake(sql, args, mapfun, uri);
      },
      query: async function (sql, args) {
        return fake(sql, args, undefined, uri);
      },
      any: async function (sql, args) {
        return fake(sql, args, undefined, uri);
      },
      one: async function (sql, args, mapfun) {
        return fake(sql, args, mapfun, uri)
          .then((res) => Promise.resolve(res[0]))
          .catch((err) => Promise.reject(err));
      },
      oneOrNone: async function (sql, args, mapfun) {
        return fake(sql, args, mapfun, uri)
          .then((res) => Promise.resolve(res.length ? res[0] : null))
          .catch((err) => Promise.reject(err));
      },
      many: async function (sql, args) {
        return fake(sql, args, undefined, uri);
      },
      manyOrNone: async function (sql, args) {
        return fake(sql, args, undefined, uri);
      },
      multi: function (sql, args) {
        return fake(sql, args, undefined, uri);
      },
      none: async function (sql, args) {
        return fake(sql, args, undefined, uri);
      },
      each: function (sql, args, mapfun) {
        return fake(sql, args, mapfun, uri);
      },
      batch: function (queries, options) {
        if (!Array.isArray(queries)) {
          return Promise.reject(
            new Error("Method 'batch' requires an array of queries.")
          );
        }
        return Promise.all([...queries]);
      },
      _push: function (
        result,
        parse = true,
        requiredStrings = [],
        checkFunction = null,
        isFailQuery = null
      ) {
        const isError = Object.prototype.toString
          .call(result)
          .includes('Error');
        if (!_.isArray(result) && !isError)
          throw new Error('SQL result must be array');
        if (!mockResultQueue[uri]) mockResultQueue[uri] = [];
        if (!parseQueue[uri]) parseQueue[uri] = [];
        if (!requiredStringsQueue[uri]) requiredStringsQueue[uri] = [];
        if (!checkFunctionQueue[uri]) checkFunctionQueue[uri] = [];
        if (!isFailQueries[uri]) isFailQueries[uri] = [];
        mockResultQueue[uri].push(result);
        parseQueue[uri].push(parse);
        requiredStringsQueue[uri].push(requiredStrings);
        checkFunctionQueue[uri].push(checkFunction);
        isFailQueries[uri].push(isFailQuery);
      },
      _clearResultQueue: () => {
        delete mockResultQueue[uri];
        delete parseQueue[uri];
        delete requiredStringsQueue[uri];
        delete checkFunctionQueue[uri];
        delete isFailQueries[uri];
      },
      _resultQueueSize: () =>
        mockResultQueue[uri] ? mockResultQueue[uri].length : 0
    };

    res.tx = function (name, cb) {
      return cb(res);
    };

    res.task = function (name, cb) {
      return cb(res);
    };
    return res;
  }

  const mockResultQueue = {};
  const parseQueue = {};
  const requiredStringsQueue = {};
  const checkFunctionQueue = {};
  const isFailQueries = {};

  return {
    dbConnections
  };
};
