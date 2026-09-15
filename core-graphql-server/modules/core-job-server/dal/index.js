'use strict';

const _ = require('lodash');

module.exports = function init(app, model, pools) {
  if (!_.isObject(app)) {
    throw new Error('missing app object');
  }
  if (!_.isObject(model)) {
    throw new Error('missing model');
  }
  if (!_.isObject(pools)) {
    throw new Error('missing pools object');
  }

  return {
    cluster: require('./cluster')(app, model, pools),
    node: require('./node')(app, model, pools),
    engine: require('./engine')(app, model, pools),
    engineCategory: require('./engine-category')(app, model, pools),
    build: require('./build')(app, model, pools),
    task: require('./task')(app, model, pools),
    job: require('./job')(app, model, pools),
    // util: require('core-server-base/dal/util.pool')(pools.core), // check usage.
    buildCapability: require('./build-capability')(app, model, pools)
  };
};
