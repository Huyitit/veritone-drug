const _ = require('lodash');
const realMsgUtil = require('../messageUtil.js');
let real = null;

module.exports = function createModule(serviceContext) {
  _.set(serviceContext, 'config.messaging.disableV2', true);
  if (!real) {
    real = realMsgUtil(serviceContext);
  }
  let counter = 0;
  let messages = [];

  function _buildActionInfo(targetId, error, actionName, actionResult, actionDetails, targetType) {
    return { actionName, actionResult, actionDetails, targetId: `${targetId || ''}`, targetType, error };
  }

  return {
    okErrors: real.okErrors,
    emitErrorEvent: (event, topic) => {
      messages.push(event);
    },
    emitEvent: (event, topic) => {
      messages.push(event);
    },
    emitPublicEvent: (eventTypeInfo, appId, req, event) => {
      messages.push(event);
    },
    emitReadAuditEvent: (context, media, mediaType, error) => {
      if (!media) return;
      if (!_.get(serviceContext, 'config.featureFlags.readAuditEvents')) return;
      const mediaArr = _.isArray(media) ? media : [media];
      for (const _media of mediaArr) {
        const idString = (_media.id || _media.recording_id || _media.asset_id || _media.tracking_unit_id || 'n/a').toString();
        const name = _media.name || _.get(_media, 'metadata.fileName');
        messages.push({
          serviceName: 'core-graphql-server',
          resourceType: mediaType,
          resourceId: idString,
          resourceName: name,
          actionInfo: _buildActionInfo(
            idString, error, 'read',
            !error ? 'success' : 'failure',
            !error ? `Accessed media ${name || idString}` : `Failed to access ${name || idString} for reason: ${error.message}`
          )
        });
      }
    },
    emitStartupEvent: (startTime) => {
      messages.push({ event: 'service_startup' });
    },
    emitCrashEvent: (event, isCrash) => {
      messages.push({ event: 'service_shutdown', isCrash });
    },
    topics: real.topics,
    eventTypeTopics: real.eventTypeTopics,
    emitTaskQueuedEvent: (
      req,
      taskId,
      taskExecutorId,
      taskExecutor,
      organizationId
    ) => {
      messages.push({
        event: 'task_queued',
        taskId,
        taskExecutorId,
        organizationId
      });
    },
    getCallerInfo: (reqContext) => {
      return {
        userId: null,
        userName: null,
        requestIP: null,
        userAgent: null,
        organizationId: null,
        originatorApplication: null,
        originatorService: 'core-graphql-server',
        impersonatorUserId: null
      };
    },
    getActionInfo: (eventData, eventName) => {
      return {
        actionName: null,
        actionResult: null,
        actionDetails: null,
        targetId: null,
        targetType: null
      };
    },
    _counter: () => messages.length,
    _messages: () => messages,
    _clearCounter: () => (messages = []),
    buildActionInfo: _buildActionInfo
  };
};
