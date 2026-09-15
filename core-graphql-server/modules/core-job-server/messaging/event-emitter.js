const _ = require('lodash');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map.js');

module.exports = function setUpEventEmitter(app, messageUtil) {
  const serviceName = app.config.name || app.config.applicationName;
  const eventTypes = {
    engine: 'engine',
    task: 'task',
    job: 'job'
  };
  const eventNames = {
    engineCreate: 'engine_create',
    engineUpdate: 'engine_update',
    engineDisable: 'engine_disable',
    engineEnable: 'engine_enable',
    engineBuildDeploy: 'engine_build_deploy',
    engineBuildDeploySuccess: 'engine_build_deploy_success',
    engineBuildSubmit: 'engine_build_submit',
    engineBuildPause: 'engine_build_pause',
    engineBuildUnpause: 'engine_build_unpause',
    engineBuildApprove: 'engine_build_approve',
    engineBuildDisapprove: 'engine_build_disapprove',
    engineBuildDelete: 'engine_build_delete',
    engineBuildInvalidate: 'engine_build_invalidate',
    engineBuildUpload: 'engine_build_upload',
    engineBuildCreate: 'engine_build_create',
    engineBuildUpdate: 'engine_build_update',
    engineIsPublic: 'engine_is_public',
    engineAddToOrgList: 'engine_add_to_org_list',
    engineRemoveFromOrgList: 'engine_remove_from_org_list',
    taskQueued: 'task_queued',
    taskUpdated: 'task_updated',
    jobCreated: 'job_created',
    jobCompleted: 'job_completed',
    jobFailed: 'job_failed'
  };

  function isSuccess(statusCode) {
    return statusCode && statusCode >= 200 && statusCode < 300;
  }

  return {
    emitEngineBuildEvent,
    emitTaskQueuedEvent,
    emitTaskCustomEvent,
    emitJobCreatedEvent,
    emitJobCompletedEvent,
    emitEngineForOrgEvent,
    eventNames,
    emitEngineBuildPublicEvent
  };

  /**
   * emit events for the engine build
   * @param {*} eventInfo the information for the event (name, type, etc.)
   * @param {*} context the current context
   * @param {*} payload the data for the event
   * @param {*} error the error
   */
  function emitEngineBuildEvent(eventInfo, context, payload, error) {
    const userInfo = payload.userInfo;
    const tokenInfo = payload.tokenInfo;
    const requestInfo = context.requestInfo;
    const actionDetails = payload.actionDetails;
    const engineBuildEvent = {
      event: eventInfo.event,
      type: eventInfo.type,
      serviceName: serviceName,
      requestUrl: context.originalUrl,
      action: payload.action,
      engineId: payload.engineId,
      buildId: payload.buildId,
      success: isSuccess(payload.statusCode),
      statusCode: payload.statusCode,
      dockerImage: payload.dockerImage,
      autoTransitionEngineState: payload.autoTransitionEngineState,
      appId: _.get(context, 'requestContext.appId'),
      requestInfo,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        payload.buildId,
        error,
        eventInfo.action,
        !error ? 'success' : 'failure',
        actionDetails,
        eventInfo.targetType
      )
    };
    // emit engineBuildDeploySuccess
    if (engineBuildEvent.event === eventsMap.EngineBuildDeploySuccess.event) {
      // if autoTransitionEngineState = true, core-eventing will auto update engine state, engine build status
      // that core-graphql does in dalEngine.js#newDeployEngineBuild
      // the default value is FALSE
      engineBuildEvent.autoTransitionEngineState =
        payload.autoTransitionEngineState || false;
    }

    engineBuildEvent.organizationId =
      _.get(userInfo, 'organization.organizationId') ||
      _.get(tokenInfo, 'organization.organizationId');

    if (userInfo) {
      engineBuildEvent.userId = _.get(userInfo, 'userId');
    } else if (tokenInfo) {
      engineBuildEvent.tokenId = _.get(tokenInfo, 'tokenId');
    }

    messageUtil.emitEvent(engineBuildEvent, 'events');

    // emit public events
    emitEngineBuildPublicEvent(context, engineBuildEvent);
  }

  function emitEngineBuildPublicEvent(context, engineBuildEvent) {
    switch (engineBuildEvent.event) {
      case eventsMap.EngineBuildDeploy.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildDeploy,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildApprove.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildApprove,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildDisapprove.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildDisapprove,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildSubmit.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildSubmit,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildCreate.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildCreate,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildUpload.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildUpload,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildInvalidate.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildInvalidate,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildPause.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildPause,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildUnpause.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildUnpause,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildDelete.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildDelete,
          'system',
          context,
          engineBuildEvent
        );
        break;
      case eventsMap.EngineBuildUpdate.event:
        messageUtil.emitPublicEvent(
          supportedEvents.EngineBuildUpdate,
          'system',
          context,
          engineBuildEvent
        );
        break;
      default:
        break;
    }
  }

  //
  function emitTaskQueuedEvent(
    taskId,
    taskExecutorId,
    taskExecutor,
    organizationId,
    context,
    error
  ) {
    const event = {
      event: eventsMap.TaskQueued.event,
      type: eventsMap.TaskQueued.type,
      serviceName: serviceName,

      taskId: taskId,
      taskExecutorId: taskExecutorId,
      taskExecutor: taskExecutor,
      organizationId: organizationId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        taskId,
        error,
        null,
        null,
        !error ? `Task queued successfully` : null
      )
    };

    messageUtil.emitEvent(event, 'events');

    // emit public event
    messageUtil.emitPublicEvent(
      supportedEvents.TaskQueued,
      'system',
      context,
      event
    );
  }

  async function emitTaskCustomEvent(event, topic, callback) {
    event.serviceName = serviceName;

    try {
      await messageUtil.emitEvent(event, topic || 'events');
      if (_.isFunction(callback)) {
        callback(null, event);
        return;
      }
    } catch (err) {
      if (_.isFunction(callback)) {
        callback(err);
        return;
      }
      app.logger.error(err);
      throw err;
    }
  }

  //
  function emitJobCompletedEvent(
    jobId,
    organizationId,
    applicationId,
    context,
    error
  ) {
    const event = {
      event: eventsMap.JobCompleted.event,
      type: eventsMap.JobCompleted.type,
      serviceName: serviceName,
      jobStatus: 'completed',
      jobId: jobId,
      organizationId: organizationId,
      applicationId: applicationId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        jobId,
        error,
        null,
        null,
        !error ? `Job completed successfully` : null
      )
    };
    messageUtil.emitEvent(event, 'events');

    // emit public event
    event.timestampMs = Date.now().valueOf().toString();
    messageUtil.emitPublicEvent(
      supportedEvents.JobCompleted,
      'system',
      context,
      event
    );
  }

  function emitJobCreatedEvent(
    jobId,
    organizationId,
    applicationId,
    context,
    error
  ) {
    const event = {
      event: eventsMap.JobCreated.event,
      type: eventsMap.JobCreated.type,
      serviceName: serviceName,

      jobId: jobId,
      organizationId: organizationId,
      applicationId: applicationId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        jobId,
        error,
        'create',
        !error ? 'success' : 'failure',
        !error ? `Created job ${jobId}` : 'Failed to create a new job'
      )
    };
    messageUtil.emitEvent(event, 'events');
    event.timestampMs = Date.now().valueOf().toString();
  }

  async function emitEngineForOrgEvent(event, payload) {
    const userInfo = payload.userInfo;
    const tokenInfo = payload.tokenInfo;
    const engineForOrgEvent = {
      event: event,
      type: eventTypes.engine,
      serviceName: serviceName,
      action: payload.action,
      organizationId:
        _.get(userInfo, 'organization.organizationId') ||
        _.get(tokenInfo, 'organization.organizationId')
    };

    if (payload.engineId) {
      engineForOrgEvent.engineId = payload.engineId;
    }

    if (payload.engineIds) {
      engineForOrgEvent.engineIds = payload.engineIds;
    }

    if (userInfo) {
      engineForOrgEvent.userId = _.get(userInfo, 'userId');
    } else if (tokenInfo) {
      engineForOrgEvent.tokenId = _.get(tokenInfo, 'tokenId');
    }

    await messageUtil.emitEvent(engineForOrgEvent, 'events');
  }
};
