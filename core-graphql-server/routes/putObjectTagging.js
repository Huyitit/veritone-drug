const _ = require('lodash');

module.exports = function setUpRoutes(serviceContext) {
  const { app, config, dal } = serviceContext;
  const adminApiPath = _.get(config, 'adminApiPath', '/admin');
  const apiPath = `${adminApiPath}/put-object-tagging`;

  app.use(apiPath, [
    app.middleware.authenticationOption('required'),
    app.middleware.loadToken,
    app.middleware.requireRights(['task_type:internal'])
  ]);

  app.post(apiPath, async (req, res) => {
    const uri = _.get(req, 'body.uri', '');
    const tags = _.get(req, 'body.tags', []);

    if (!_.isString(uri)) {
      return res.send(400, 'Missing URI');
    }

    if (_.isEmpty(tags)) {
      return res.send(400, 'Missing tags');
    }

    try {
      await dal.dalStorage.putObjectTaggingPromise(uri, tags);
      res.send({
        success: true,
        msg: 'The tags are set.'
      });
    } catch (err) {
      res.send({
        success: false,
        msg: _.get(err, 'message')
      });
    }
  });
};
