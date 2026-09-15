/**
 * Requires authentication and injects authentication and authorization
 * information into the context.
 */
const _ = require('lodash');
const dateIdUtil = require('@veritone/core-server-base/date-id.js')();

module.exports = function create(directiveContext) {
  const util = require('../../resolvers/util.js')(directiveContext);
  const errors = require('../../error')(directiveContext.appConfig);
  const mainUtil = require('../../util.js')({
    config: directiveContext.appConfig
  });

  const objectAuthMessage =
    'The authenticated user or token is not authorized to perform the requested action. ' +
    'The action attempts to retrieve or update a specific resource object such ' +
    'as a Task or a TemporalDataObject. The supplied token carries with it ' +
    'rights for a specific set of resources. Those rights do NOT include the ' +
    'object ID specified in the field parameters. For detailed information on ' +
    'the resources that this token is allowed access, see the data section below.';

  function getOrganizationDal() {
    const res = _.get(
      directiveContext,
      'serviceContext.dal.organization',
      _.get(directiveContext, 'dal.organization')
    );

    if (!res) throw new Error('config error: no organization dal');

    return res;
  }

  function getTaskDal() {
    const res = _.get(
      directiveContext,
      'serviceContext.dal.task',
      _.get(directiveContext, 'dal.task')
    );
    if (!res) throw new Error('config error:  no task dal');
    return res;
  }

  function getJobDal() {
    const res = _.get(
      directiveContext,
      'serviceContext.dal.job',
      _.get(directiveContext, 'dal.job')
    );
    if (!res) throw new Error('config error:  no job dal');
    return res;
  }

  function getTDODal() {
    const res = _.get(
      directiveContext,
      'serviceContext.dal.tdo',
      _.get(directiveContext, 'dal.tdo')
    );
    if (!res) throw new Error('config error:  no tdo dal');
    return res;
  }

  /**
   * This function handles an org-less token. There are, as of Jan 2018,
   * two types of org-less tokens:  legacy engine tokens and new JWT.
   *
   */
  async function handleOrglessToken(directiveArgs, fieldArgs, context, info) {
    const allowOrgless = directiveArgs.allowOrgless;
    if (!allowOrgless) {
      throw new errors.NotAllowed({
        message:
          'The requested query, field, or mutation does not allow ' +
          'tokens that are not associated with an organization.',
        data: {
          field: info.fieldName,
          type: info.parentType,
          errorTypeCode: 1003
        }
      });
    }
    const isInternalKey = mainUtil.isInternalAPIKey(context.requestContext);

    const allowAnyId = directiveArgs.skipObjectAuthorization;
    const targetType = directiveArgs.objectAuthType;
    // mutations typically have ID parameters nested under "input".
    // so, to reduce the amount of manual configuration in the schema,
    // we'll default to that scheme here. it can still be overridden for
    // mutations that do not follow this scheme.
    // but only do so if the configured param could not be found.
    let fArgs = fieldArgs;

    if (_.isNil(_.get(fArgs, directiveArgs.objectAuthIdParam)) && fArgs.input) {
      fArgs = fieldArgs.input;
    }
    // This block means that the mutation or query requires object-level
    // authorization, but the incoming parameters did not include any
    // parameter that can be recognized as an object ID. this can occur
    // two cases:
    // a) the mutation/query does not take an object IDs (e.g. createJob),
    // but is not configured to skip object authorization. this is a server
    // problem and can be fixed in the GraphQL schema config for the field
    // in question.
    // b) the mutation/query takes an object Id as an optional parameter
    // and the caller did not supply it. this is a user error.
    if (
      !allowAnyId &&
      _.isNil(_.get(fArgs, directiveArgs.objectAuthIdParam)) &&
      !isInternalKey
    ) {
      throw new errors.NotAllowed({
        message: objectAuthMessage,
        data: {
          objectId: 'cannot be determined',
          objectType: targetType,
          field: info.fieldName,
          type: info.parentType,
          errorTypeCode: 1006,
          idField: directiveArgs.objectAuthIdParam
        }
      });
    }

    const targetId = mainUtil.getGraphQLFieldParamValue(
      fArgs,
      directiveArgs.objectAuthIdParam
    );
    const taskIds = mainUtil.getResourceIdsForType(
      'Task',
      context.requestContext
    );

    const jobIds = mainUtil.getResourceIdsForType(
      'Job',
      context.requestContext
    );

    // get app ID from engine JWT, if provided (it should be)
    const applicationId = _.get(
      context,
      '_authInfo.applicationId',
      _.get(
        context,
        '_authInfo.json.applicationId',
        _.get(context, 'requestContext.jwtToken.contentApplicationId')
      )
    );

    // unless the field was enabled to skip object-level authorization, we'll
    // need to validate the requested ID against the ACL.
    // same meaning/cases as above.
    if (!(allowAnyId || isInternalKey)) {
      if (!targetId) {
        // if a target ID must be validated but we weren't able to extract
        // one from the input, reject the request.
        throw new errors.NotAllowed({
          message: objectAuthMessage,
          data: {
            objectId: 'cannot be determined',
            objectType: targetType,
            allowedObjectIds: allowedIds,
            field: info.fieldName,
            type: info.parentType,
            errorTypeCode: 1005,
            idField: directiveArgs.objectAuthIdParam,
            rights: mainUtil.listRights(context._authInfo)
          }
        });
      }

      // get IDs of the target type from the token
      const allowedIds = mainUtil.getResourceIdsForType(
        targetType,
        context.requestContext
      );
      // might need to get TDOs by source task as well.
      // if the source task for the target TDO is in the
      // list of allowed tasks, we add it to the list.
      // an engine that just created a TDO should be allowed
      // to add assets to that TDO, but since the TDO didn't
      // exist when the job started its ID wasn't available for
      // insertion into the token.
      // rule:  if a caller has access to a task, they have access
      //   to a TDO created by that task.
      if (
        targetType === 'TemporalDataObject' &&
        taskIds.length &&
        // don't bother getting source data if we already know that
        // the target TDO ID is allowed in the JWT
        !allowedIds.includes(targetId)
      ) {
        const jobTargetIds = await getJobTDOTargets(jobIds);
        if (jobTargetIds.includes(targetId)) {
          allowedIds.push(targetId);
        } else {
          const taskData = await getTDOSourceTaskData(targetId);
          if (taskData) {
            const taskId = taskData.taskId;
            const jobId = taskData.jobId;
            if (
              (taskId && taskIds.includes(taskId)) ||
              (jobId && jobIds.includes(jobId))
            ) {
              allowedIds.push(targetId);
            }
          }
        }

        // if the TDO was not created with task source data,
        // then it can only be authorized by TDO ID.
      }

      // if allowed IDs does not include the parameter ID, reject now.
      // this check will allow through internal keys but only engine JWTs
      // if they have resource IDs
      if (!(allowedIds.includes(targetId) || isInternalKey)) {
        throw new errors.NotAllowed({
          message: objectAuthMessage,
          data: {
            objectId: targetId,
            objectType: targetType,
            allowedObjectIds: allowedIds,
            field: info.fieldName,
            type: info.parentType,
            errorTypeCode: 1002,
            idField: directiveArgs.objectAuthIdParam,
            rights: mainUtil.listRights(context._authInfo)
          }
        });
      }
    }

    // otherwise we'll let it through. we also need to look up the object
    // org ID and inject it as the organizationId parameter so that the
    // underlying authorization will work.
    // need to get task ID from token allowed IDs.
    // this whole auth method is only meant for engines, which always
    // have a task associated with them.
    // note that this code will reject all legacy engine tokens that do not
    // carry object authorization on them (these tokens wouldn't work with
    // most queries anyway.)
    if (!(taskIds.length || isInternalKey)) {
      throw new errors.NotAllowed({
        message: objectAuthMessage,
        data: {
          objectId: targetId || 'unspecified',
          objectType: targetType,
          field: info.fieldName,
          type: info.parentType,
          errorTypeCode: 1001,
          rights: mainUtil.listRights(context._authInfo)
        }
      });
    }

    if (taskIds.length) {
      // get application and org IDs by task, using value from JWT if present
      const data = await getOrgAndAppByTask(taskIds[0], applicationId);
      fieldArgs.applicationId = data.applicationId;
      fieldArgs.organizationId = data.organizationId;
      if (fieldArgs.input) {
        fieldArgs.input.applicationId = data.applicationId;
        fieldArgs.input.organizationId = data.organizationId;
      }
    }
  }

  // this function gets the owner application and org ID for a given task.
  async function getOrgAndAppByTask(taskId, applicationId) {
    // if JWT didn't include app ID, we need to look it up by task ID
    if (!applicationId) {
      return getTaskDal().getOrgAndAppByTask(taskId);
    }
    // if JWT did include app ID, we just need to map it to an org ID and return.
    const organizationId = await getOrganizationDal().getOrgIdFromAppId(
      applicationId
    );
    return {
      applicationId,
      organizationId
    };
  }

  async function getTDOSourceTaskData(tdoId) {
    return getTDODal().getTDOSourceTaskData(tdoId);
  }

  async function getJobTDOTargets(jobIds) {
    return getJobDal().getJobTDOTargets(jobIds);
  }

  return {
    name: 'auth',
    before: true,

    resolver(directiveArgs, fieldArgs, context, info) {
      const authInfo = util.requireAuthInfo(context);
      const fieldName = info.fieldName;
      const type = info.parentType;

      const isInternal = mainUtil.isInternalAPIKey(authInfo);
      //if (!isInternal) {
      fieldArgs.__ignoreParamsForValidation = [];
      const origOrgId = _.get(
        fieldArgs,
        'organizationId',
        _.get(fieldArgs, 'input.organizationId')
      );
      if (!origOrgId) {
        fieldArgs.__ignoreParamsForValidation.push('organizationId');
      }
      const origAppId = _.get(
        fieldArgs,
        'applicationId',
        _.get(fieldArgs, 'input.applicationId')
      );
      if (!origAppId)
        fieldArgs.__ignoreParamsForValidation.push('applicationId');

      util.authorizeOrgIds(authInfo, fieldArgs);
      util.authorizeAppIds(authInfo, fieldArgs);

      context._authInfo = authInfo;

      // get the object's owner org.
      // from 2/5/2019 -- sometimes the incoming organization object
      // is non-null even for an org-less token and is
      // is structured such that lodash _.isEmpty and _.pickBy do not
      // function as expected. add explicit logic here to make sure
      // that hasOrg, below, is set correctly.
      const userOrg = JSON.parse(
        JSON.stringify(context._authInfo.organization || {})
      );
      const keys = Object.keys(userOrg);
      for (let i = 0; i < keys.length; i++) {
        if (!userOrg[keys[i]]) {
          delete userOrg[keys[i]];
        }
      }
      const hasOrg = Object.keys(userOrg).length > 0;

      if (!hasOrg || isInternal) {
        return handleOrglessToken(directiveArgs, fieldArgs, context, info);
      } else if (!fieldArgs.organizationId) {
        throw new errors.NotAllowed({
          message:
            'The field ' +
            type +
            '.' +
            fieldName +
            ' can only be resolved in ' +
            'the context of an authorized organization. The provided token ' +
            'did not contain this information',
          data: {
            field: fieldName,
            type: type
          }
        });
      }
    },

    validator(directiveArgs, field, schema) {
      if (
        directiveArgs.allowOrgless &&
        !directiveArgs.skipObjectAuthorization
      ) {
        // make sure that the target param is actually a parameter on the field
        const param = directiveArgs.objectAuthIdParam;
        if (param.split('.').length > 2) {
          throw new Error(
            'current nested object auth ID parameters can only have ' +
              ' a max depth of two. For example, id or input.id.'
          );
        }
        const found = mainUtil.graphQLFieldHasParam(schema, field, param);
        // check moved to runtime so that we can allow orgless apitokens
        /*
        if (!found) {
          throw new Error(
            'The field ' +
              field.type +
              '.' +
              field.name +
              ' uses the objectAuth directive with objectAuthIdParam set to ' +
              param +
              ', but the field' +
              ' does not have any parameter by that name. Parameters are []'
          );
        }
        */

        // if skipObjectAuth is not set, then we require a object auth
        /*
        if (!directiveArgs.objectAuthType) {
          throw new Error(
            'The field ' +
              field.type +
              '.' +
              field.name +
              ' is configured to use object-level authorization for org-less tokens,' +
              ' but does not have a objectAuthType value set.'
          );
        }
        allow this config. at runtime we will allow the request through only for internal tokens
        */
      }

      // check for illogical parameter combinations
      if (
        directiveArgs.skipObjectAuthorization &&
        directiveArgs.objectAuthType
      ) {
        throw new Error(
          'The field ' +
            field.type +
            '.' +
            field.name +
            ' is configured ' +
            'to skip object-level authorization, but has an objectAuthType value of ' +
            directiveArgs.objectAuthType +
            '. This is a misconfiguration.'
        );
      }

      // TODO we could do some additional validate on parameter type -- it should
      // be an ID, String, or Int.

      // if no object auth type is set, try to figure it out based on
      // field return type. this will not always work, but reduces that amount
      // of manual configuration we have to do in the schema.
      if (
        !directiveArgs.skipObjectAuthorization &&
        !directiveArgs.objectAuthType
      ) {
        const fieldType = field.type;
        directiveArgs.objectAuthType = _.toString(fieldType).replace('!', '');
      }
    }
  };
};
