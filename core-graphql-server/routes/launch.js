const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const fs = require('fs');

module.exports = function setUpRoutes(serviceContext) {
  const { app, config, logger } = serviceContext;
  const apiPath = _.get(config, 'adminApiPath', '/launch');
  // default startDateTime and stopDateTime
  const startDateTime = moment().valueOf();
  const stopDateTime = startDateTime;

  app.middlewareAuth = require('./middlewareAuth')(config);

  app.use(apiPath, [
    app.middleware.authenticationOption('required'),
    app.middleware.loadAuthDataByToken,
    app.middlewareAuth.splitAuthentication(
      [app.middleware.requireRights(['job:create'])],
      [app.middleware.hasAccessTo(app.permissions.cms.job.create)]
    )
  ]);

  app.post(`${apiPath}/engine/:engineId`, async (req, res) => {
    try {
      const engineId = _.get(req, 'params.engineId');
      const parentFolderId = _.get(req, 'body.parentFolderId');
      const notificationUri = _.get(req, 'body.notificationUri');
      const priority = _.get(req, 'body.priority', 0);
      let clusterId = _.get(req, 'body.clusterId');
      const processedFile = req.file || {};
      const tokenInfo = _.get(req, 'context.tokenInfo');
      const userInfo = _.get(req, 'context.userInfo');
      const requestorApplicationId =
        _.get(tokenInfo, 'applicationId') ||
        _.get(userInfo, 'groups[0].applicationId');
      const requestorOrganization =
        _.get(tokenInfo, 'organization') || _.get(userInfo, 'organization');
      const organizationId = parseInt(
        _.get(requestorOrganization, 'organizationId')
      );

      if (!engineId) {
        throw { statusCode: 400, message: 'Missing engineId' };
      }

      if (!processedFile || _.isEmpty(processedFile)) {
        throw { statusCode: 400, message: 'invalid file upload.' };
      }

      // FIXME: use cluster preferences
      if (!clusterId) {
        clusterId = _.get(config, 'aiware.defaultCluster.id');
      }

      //createTDO
      const context = _.assign(req.context, {
        config: config,
        requestContext: req.context,
        requestInfo: {
          correlationId:
            req.headers['veritone-correlation-id'] ||
            req.headers['veritone-request-id'] ||
            uuidv4()
        }
      });
      const argsTDO = {
        input: {
          startDateTime,
          stopDateTime,
          assetType: 'media',
          contentType: processedFile.mimetype,
          file: {
            fileName: processedFile.originalname,
            contentType: processedFile.mimetype,
            size: processedFile.size,
            encoding: processedFile.encoding,
            inputStream: fs.createReadStream(processedFile.path)
          },
          applicationId: requestorApplicationId,
          status: 'recorded',
          parentFolderId
        }
      };

      // Create TDO with asset
      const tdo = await serviceContext.dal.tdo.createTDOWithAsset(
        context,
        argsTDO
      );

      if (!tdo) {
        throw { statusCode: 500, message: 'Fail to create TDO' };
      }

      const argsLaunch = {
        input: {
          targetId: tdo.id,
          engineId,
          fields: [{ fieldName: 'priority', fieldValue: priority }],
          notificationUris: notificationUri ? [notificationUri] : null,
          clusterId
        },
        organizationId,
        applicationId: requestorApplicationId
      };
      const job = await serviceContext.dal.v3Job.launchSingleEngineJob(
        argsLaunch,
        context
      );

      if (!job) {
        throw { statusCode: 500, message: 'Launch single engine job failed' };
      }

      res.send({
        statusCode: 200,
        message: 'Launch single engine job successfully.',
        jobId: job.id
      });
    } catch (err) {
      logger.error(err);
      res
        .status(err.statusCode ? err.statusCode : 500)
        .send({ message: _.get(err, 'message') });
    }
  });

  app.post(`${apiPath}/dag/:dagTemplateId`, async (req, res) => {
    try {
      const startDateTime = moment().subtract(2, 'hour').unix();
      const stopDateTime = moment().subtract(1, 'hour').unix();
      const dagTemplateId = _.get(req, 'params.dagTemplateId');
      const dagTemplateFields = _.get(req, 'body.dagTemplateFields');
      const parentFolderId = _.get(req, 'body.parentFolderId');
      const notificationUri = _.get(req, 'body.notificationUri');
      const priority = _.get(req, 'body.priority', 0);
      let clusterId = _.get(req, 'body.clusterId');
      const processedFile = req.file || {};
      const tokenInfo = _.get(req, 'context.tokenInfo');
      const userInfo = _.get(req, 'context.userInfo');
      const requestorApplicationId =
        _.get(tokenInfo, 'applicationId') ||
        _.get(userInfo, 'groups[0].applicationId');
      const requestorOrganization =
        _.get(tokenInfo, 'organization') || _.get(userInfo, 'organization');
      const organizationId = parseInt(
        _.get(requestorOrganization, 'organizationId')
      );

      if (!dagTemplateId) {
        throw { statusCode: 400, message: 'The dagTemplateId is requied' };
      }

      if (!processedFile || _.isEmpty(processedFile)) {
        throw { statusCode: 400, message: 'invalid file upload.' };
      }

      if (
        !_.isEmpty(dagTemplateFields) &&
        !_.every(
          dagTemplateFields,
          (item) => _.has(item, 'fieldName') && _.has(item, 'fieldValue')
        )
      ) {
        throw {
          statusCode: 400,
          message: 'The dagTemplateFields format is incorrect.'
        };
      }

      // FIXME: use cluster preferences
      if (!clusterId) {
        clusterId = _.get(config, 'aiware.defaultCluster.id');
      }

      //createTDO
      const context = _.assign(req.context, {
        config: config,
        requestContext: req.context,
        requestInfo: {
          correlationId:
            req.headers['veritone-correlation-id'] ||
            req.headers['veritone-request-id'] ||
            uuidv4()
        }
      });
      const argsTDO = {
        input: {
          startDateTime,
          stopDateTime,
          assetType: 'media',
          contentType: processedFile.mimetype,
          file: {
            fileName: processedFile.originalname,
            contentType: processedFile.mimetype,
            size: processedFile.size,
            encoding: processedFile.encoding,
            inputStream: fs.createReadStream(processedFile.path)
          },
          applicationId: requestorApplicationId,
          status: 'recorded',
          parentFolderId
        }
      };

      // Create TDO with asset
      const tdo = await serviceContext.dal.tdo.createTDOWithAsset(
        context,
        argsTDO
      );

      if (!tdo) {
        throw { statusCode: 500, message: 'Fail to create TDO' };
      }

      const argsLaunchDag = {
        input: {
          targetId: tdo.id,
          notificationUris: notificationUri ? [notificationUri] : null,
          clusterId,
          dagTemplateId,
          dagTemplateFields,
          organizationId,
          applicationId: requestorApplicationId
        },
        organizationId,
        applicationId: requestorApplicationId
      };
      const job = await serviceContext.dal.v3Job.launchDAGTemplate(
        context,
        argsLaunchDag
      );

      if (!job) {
        throw { statusCode: 500, message: 'Launch single DAG template failed' };
      }

      res.send({
        statusCode: 200,
        message: 'Launch single DAG template successfully.',
        jobId: job.id
      });
    } catch (err) {
      logger.error(err);
      res
        .status(err.statusCode ? err.statusCode : 500)
        .send({ message: _.get(err, 'message') });
    }
  });
};
