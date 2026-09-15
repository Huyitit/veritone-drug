const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const mapper = require('../dal/mapper.js');
  const mainUtil = require('../util.js')();
  const dalUtil = require('../dal/util.js')(
    serviceContext.config,
    serviceContext
  );

  const getValidStateActions = (obj, args, context, info) => {
    const engineStateActions = {
      base: {
        draft: [],
        pending: [],
        ready: [],
        active: [],
        disabled: [],
        deleted: []
      }
    };

    const buildStateActions = {
      base: {
        fetching: [],
        invalid: [],
        uploaded: [],
        pending: [],
        approved: [],
        disapproved: [],
        deployed: [],
        deployFailed: [],
        paused: [],
        deleted: []
      }
    };

    const buildStateActionsInEngineStates = {
      base: engineStateActions.base
    };

    // build state actions
    buildStateActions.default = _.mergeWith(
      {
        fetching: [],
        invalid: ['delete'],
        uploaded: ['deploy-sb', 'delete'],
        available: ['submit', 'delete', 'invalidate'],
        pending: ['approve', 'invalidate'],
        approved: ['deploy', 'delete', 'invalidate'],
        disapproved: ['delete'],
        deploying: [],
        deployed: ['pause'],
        deployFailed: ['deploy', 'delete'],
        paused: ['unpause', 'delete', 'invalidate'],
        deleted: []
      },
      buildStateActions.base,
      customizer
    );

    // note: this is based off of base
    buildStateActions.dockerAdmin = _.mergeWith(
      {
        fetching: ['invalidate', 'upload'],
        uploaded: ['invalidate'],
        available: ['invalidate']
      },
      buildStateActions.base,
      customizer
    );

    buildStateActions.admin = _.mergeWith(
      {
        pending: ['approve', 'disapprove', 'delete'],
        disapproved: ['approve'],
        deploying: ['delete'],
        deployed: ['delete'],
        deleted: [] // TODO: implement undelete action for admin
      },
      buildStateActions.default,
      customizer
    );

    // build state actions in engine states
    buildStateActionsInEngineStates.default = _.mergeWith(
      {
        draft: [],
        pending: [
          'invalidate',
          'upload',
          'approve',
          'disapprove',
          'deploy-sb',
          'submit',
          'delete',
          'undelete'
        ], // admin
        ready: [
          'deploy',
          'unpause',
          'invalidate',
          'upload',
          'approve',
          'disapprove',
          'submit',
          'delete',
          'undelete'
        ], // admin
        active: [
          'deploy',
          'pause',
          'unpause',
          'invalidate',
          'upload',
          'approve',
          'disapprove',
          'submit',
          'delete',
          'undelete'
        ], // admin
        disabled: [
          'invalidate',
          'upload',
          'approve',
          'disapprove',
          'submit',
          'delete',
          'undelete'
        ], // admin
        deleted: []
      },
      buildStateActionsInEngineStates.base,
      customizer
    );

    function customizer(objValue, srcValue) {
      if (_.isArray(objValue)) {
        return objValue.concat(srcValue);
      }
    }
    let scopedBuildStateActions;
    if (util.isDevAdmin(context._authInfo)) {
      scopedBuildStateActions = buildStateActions.admin;
    } else if (util.isDockerAdmin(context._authInfo)) {
      scopedBuildStateActions = buildStateActions.dockerAdmin;
    } else {
      scopedBuildStateActions = buildStateActions.default;
    }

    return serviceContext.dal.engine
      .getEngine(context, { id: obj.engineId }, true)
      .then((engine) => engine.state)
      .then((engineState) => {
        const validBuildStatesInEngineState =
          buildStateActionsInEngineStates.default[engineState];
        return _.intersection(
          scopedBuildStateActions[obj.status],
          validBuildStatesInEngineState
        );
      });
  };

  const getPrimaryAction = (obj, args, context, info) => {
    let result;
    switch (obj.status) {
      case 'available':
        result = 'submit';
        break;
      case 'approved':
        result = 'deploy';
        break;
      case 'deployed':
        result = 'pause';
        break;
      case 'paused':
        result = 'unpause';
        break;
      case 'pending':
        result = 'approve';
        break;
    }

    // make sure the result is a valid state action based on user permissions and engine state
    return getValidStateActions(obj, args, context, info).then((actions) => {
      return _.includes(actions, result) ? result : null;
    });
  };

  const getSecondaryAction = (obj, args, context, info) => {
    return getValidStateActions(obj, args, context, info).then((vsa) => {
      return _.difference(vsa, [getPrimaryAction(obj, args, context, info)]);
    });
  };
  const permBuildRead = 'developer.build.read';

  return {
    report(obj, args, context, info) {
      return serviceContext.dal.engine.getEngineBuildReport(
        obj.engineId,
        obj.id
      );
    },
    engine(obj, args, context, info) {
      // get the engine. allow use of cached engine without extra auth
      // since we already authorized to get the build.
      return serviceContext.dal.engine.getEngine(
        context,
        { id: obj.engineId },
        true
      );
    },
    name(obj, args, context, info) {
      // name is in the schema but not the db. we'll formulate a name
      // here based on engine name and build version.
      return serviceContext.dal.engine
        .getEngine(context, { id: obj.engineId }, true)
        .then((eng) => eng.name + ' Version ' + obj.version);
    },
    preferredInputFormat: (obj, args, context, info) => {
      return serviceContext.dal.engine
        .getEngine(context, { id: obj.engineId }, true)
        .then((eng) => eng.preferredInputFormat);
    },
    supportedInputFormats: (obj, args, context, info) => {
      return serviceContext.dal.engine
        .getEngine(context, { id: obj.engineId }, true)
        .then((eng) => eng.supportedInputFormats);
    },
    outputFormats: (obj) => _.get(obj, 'manifest.outputFormats', null),
    supportedSourceTypes: (obj) =>
      _.get(obj, 'manifest.ingestion.supportedSourceTypes', null) ||
      _.get(obj, 'manifest.supportedSourceTypes', null),
    createdDateTime: (obj) =>
      _.isNumber(obj.createdDateTime)
        ? obj.createdDateTime * 1000
        : obj.createdDateTime,
    modifiedDateTime: (obj) =>
      _.isNumber(obj.modifiedDateTime)
        ? obj.modifiedDateTime * 1000
        : obj.modifiedDateTime,
    primaryAction: getPrimaryAction,
    secondaryActions: getSecondaryAction,
    validStateActions: getValidStateActions,
    status: (obj) => mapper.mapBuildStatus(obj.status),
    // filter out sensitive fields based on rights "developer.build.read"
    dockerImage: (obj, args, context) =>
      mainUtil.hasPerm(permBuildRead, context._authInfo)
        ? obj.dockerImage
        : null,
    manifest: (obj, args, context) =>
      mainUtil.hasPerm(permBuildRead, context._authInfo)
        ? dalUtil.generateBuildManifestFromEngine(
            context,
            obj.manifest,
            null,
            obj.engineId
          )
        : null,
    runtime: (obj, args, context) => {
      const hasPermission = mainUtil.hasPerm(permBuildRead, context._authInfo);
      if (!hasPermission) {
        return null;
      }
      return _.isEmpty(obj.runtime) ? { edge: {} } : obj.runtime;
    },
    releaseNotes: (obj) => obj.releaseNotes
  };
};
