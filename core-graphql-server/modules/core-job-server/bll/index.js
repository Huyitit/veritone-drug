'use strict';

module.exports = function init(app, dal, model, engineRuntime, storage) {
  return {
    job: require('./job')(app, dal, model, engineRuntime),
    s3: require('./s3')(app, storage),
    engine: require('./engine')(app, dal, model),
    task: require('./task')(app, dal, model)
  };
};
