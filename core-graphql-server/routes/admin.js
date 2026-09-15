const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');

module.exports = function setUpRoutes(serviceContext) {
  const { app, config, logger, dal } = serviceContext;

  const apiPath = _.get(config, 'adminApiPath', '/admin');

  app.use(apiPath, [
    app.middleware.authenticationOption('required'),
    app.middleware.loadAuthDataByToken
  ]);

  app.get(`${apiPath}/organization/mine`, async (req, res) => {
    try {
      const userId = getUserId(req);
      const myOrgs = await dal.organization.getMyOrganizations(req.context, {
        userId: userId
      });
      res.status(200).send(myOrgs);
    } catch (err) {
      logger.error(err);
      res
        .status(err.statusCode ? err.statusCode : 500)
        .send({ message: _.get(err, 'message') });
    }
  });

  app.put(`${apiPath}/switch-org/:organizationGuid`, async (req, res) => {
    try {
      getUserId(req);
      const userName = req.context.userInfo.userName;
      if (!userName) {
        throw { statusCode: 400, message: 'Missing userName.' };
      }
      const token = req.context.userInfo.token;
      if (!token) {
        throw { statusCode: 400, message: 'Missing token.' };
      }
      const organizationGuid = req.params.organizationGuid;
      if (!organizationGuid) {
        throw { statusCode: 400, message: 'Missing organizationGuid.' };
      }

      const payload = {
        userName: userName,
        token: token,
        organizationGuid: organizationGuid
      };
      const context = {
        config: config,
        requestContext: req.context,
        requestInfo: {
          correlationId:
            req.headers['veritone-correlation-id'] ||
            req.headers['veritone-request-id'] ||
            uuidv4()
        }
      };
      const result = await dal.admin.switchUserToOrganization(payload, context);
      res.status(200).send(result);
    } catch (err) {
      logger.error(err);
      res
        .status(err.statusCode ? err.statusCode : 500)
        .send({ message: _.get(err, 'message') });
    }
  });

  function getUserId(req) {
    const context = req.context;
    const authInfo = context.userInfo;
    const userId = authInfo.userId
      ? authInfo.userId
      : authInfo.data
      ? authInfo.data.userId
      : null;
    if (!userId) {
      throw { statusCode: 400, message: 'Valid user session is required.' };
    }
    return userId;
  }
};
