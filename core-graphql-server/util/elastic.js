const { Client: elasticSearch } = require('es7');
const _ = require('lodash');
const {
  createInstrumentedAgent
} = require('@veritone/core-server-base/esPoolAgent');

module.exports = function createFunction(serviceContext) {
  // Some callers put the config only instead of the serviceContext
  const config = _.get(serviceContext, 'config', serviceContext);
  const errors = require('../error')(config);

  const host = _.get(
    config,
    'elastic.connection.host',
    'http://localhost:9200'
  );
  const username = _.get(config, 'elastic.connection.username', '');
  const password = _.get(config, 'elastic.connection.password', '');
  const accept = _.get(config, 'elastic.headers.accept', '');
  const contentType = _.get(config, 'elastic.headers.contentType', '');
  const defaultHeaders = {};
  if (accept != '') {
    _.set(defaultHeaders, 'Accept', accept);
  }
  if (contentType != '') {
    _.set(defaultHeaders, 'Content-Type', contentType);
  }
  
  function buildConnectionOptions(targetHost) {
    return {
      requestTimeout: _.get(
        config,
        'elastic.connection.requestTimeout',
        30000
      ),
      maxRetries: _.get(config, 'elastic.connection.maxRetries', 0),
      agent: () =>
        createInstrumentedAgent({
          host: targetHost,
          service: 'core-graphql-server',
          agentOptions: {
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: _.get(config, 'elastic.connection.maxSockets', 25),
            maxFreeSockets: _.get(
              config,
              'elastic.connection.maxFreeSockets',
              10
            )
          }
        })
    };
  }

  const client = new elasticSearch({
    node: host,
    headers: authenticate(defaultHeaders),
    ...buildConnectionOptions(host)
  });

  // Function to add basic authentication header
  function authenticate(headers) {
    if ((!username && password) || (username && !password)) {
      throw new errors.elasticSearchConnectionFails({
        message: 'missing username or password'
      });
    }
    if (username && password) {
      headers['Authorization'] =
        'Basic ' + Buffer.from(username + ':' + password).toString('base64');
    }
    return headers;
  }

  function newConnection(host, headers) {
    headers = headers || defaultHeaders;
    headers = authenticate(headers);

    return new elasticSearch({
      node: host,
      headers: headers,
      ...buildConnectionOptions(host)
    });
  }

  return {
    client,
    newConnection
  };
};
