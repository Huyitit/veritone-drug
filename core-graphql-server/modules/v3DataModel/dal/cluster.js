const mapper = require('../../../dal/mapper.js');
const bytes = require('bytes');
const _ = require('lodash');
const uuid = require('uuid');
const pgp = require('pg-promise')({ capSQL: true });
const moment = require('moment');
const { v5: uuidv5 } = require('uuid');
const { promisify } = require('util');
const { supportedEvents } = require('@veritone/core-server-base/events-map');
const validator = require('validator');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../../../resolvers/util.js')(serviceContext);
  const mainUtil = require('../../../util.js')();
  const messageUtil =
    serviceContext.messageUtil ||
    require('../../../messageUtil.js')(serviceContext);
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const coreJobDal = serviceContext.coreJob.cjdal;
  const dalEngine = serviceContext.dal.engine;

  const util = require('../../../util.js')();
  const errors = require('../../../error')(config);

  const dbRead = dbConnections['core'].read;
  const dbWrite = dbConnections['core'].write;

  const aiwareClusterMemoryLimit =
    config.aiware.clusterMemoryLimit || 34359738368; // 32 gb limit
  const aiwareClusterStorageLimit =
    config.aiware.clusterStorageLimit || 1073741824000; // 1000 gb limit
  const aiwareClusterHistoryLimit = config.aiware.clusterHistoryLimit || 10; // keep at most 10 history rows
  const lruCacheMaxAgeInMs = config.lruCacheMaxAgeInMs || 600000; // default: 10 minutes
  const lruCacheMaxItems = config.lruCacheMaxItems || 100;
  const uuidNamespace = '361ed019-b212-4f42-be28-cdc518eb5ab8';
  const LRU = require('lru-cache');
  const lruCache = new LRU({
    max: lruCacheMaxItems,
    ttl: lruCacheMaxAgeInMs
  });
  const defaultEdgeVersion = 3;
  const clusterSelect = `
   c.cluster_id AS id,
   c.organization_id,
   c.display_name AS name,
   c.allowed_engines,
   c.secret_key,
   c.access_key,
   c.container_tag,
   c.queue_credentials,
   c.docker_hub_credentials,
   c.paused,
   c.memory_size as memory_size_bytes,
   c.cached_veritone_api_key,
   c.cached_date as cached_date_time,
   c.deleted_date as deleted_date_time,
   c.created_date as created_date_time,
   c.updated_date as modified_date_time,
   c.storage_size as storage_size_bytes,
   c.cluster_type as type,
   c.default_cluster as default,
   COALESCE(c.bypass_allowed_engines,false) bypass_allowed_engines,
   c.is_public,
   c.tags,
   c.status,
   c.cluster_config,
   c.cluster_state,
   c.state_last_updated_date_time,
   c.cluster_history,
   c.target_status,
   c.is_group,
   c.in_group as cluster_group_id,
   c.controller_url,
   c.core_id,
   c.edge_version
  `;

  const clusterReturning = {
    cluster_id: 'id',
    organization_id: null,
    display_name: 'name',
    allowed_engines: null,
    cluster_type: 'type',
    edge_version: null,
    secret_key: null,
    access_key: null,
    default_cluster: 'default',
    container_tag: null,
    queue_credentials: null,
    docker_hub_credentials: null,
    paused: null,
    memory_size: 'memory_size_bytes',
    storage_size: 'storage_size_bytes',
    deleted_date: 'deleted_date_time',
    created_date: 'created_date_time',
    updated_date: 'modified_date_time',
    is_public: null,
    bypass_allowed_engines: null,
    tags: null,
    cluster_config: null,
    cluster_state: null,
    state_last_updated_date_time: null,
    cluster_history: null,
    status: null,
    target_status: null,
    is_group: null,
    in_group: 'cluster_group_id',
    controller_url: null,
    core_id: null
  };
  const clusterByPreferenceCacheKey = 'dalCluster_getClusterByPreference';
  const clusterByPreferenceTimestampKey =
    'dalCluster_getClusterByPreferenceTimestamp';
  const clusterByPreferenceTtlMin = _.get(
    serviceContext,
    'config.clusterByPreference.ttlMin',
    5
  );
  const NO_CLUSTERS_STR = 'no_results';

  function getActionDetails(action, err, id) {
    const details = {
      ClusterCreate: !err ? `Created cluster ${id}` : `Failed to create cluster`,
      ClusterUpdate: !err ? `Updated cluster ${id}` : `Failed to update cluster ${id}`,
      ClusterDelete: !err ? `Deleted cluster ${id}` : `Failed to delete cluster ${id}`,
    };
    return details[action];
  };

  async function getCluster(context, args) {
    // server/code bug check
    if (!args.id) throw Error('cluster ID required');
    args.superAdminViewDetail = resUtil.isSuperAdmin(context._authInfo);
    const res = await getClusterList(context, args);
    if (!res.count) {
      throw new errors.NotFound({
        message: 'The cluster was not found',
        data: {
          objectType: 'Cluster',
          objectId: args.id
        }
      });
    }
    return res.records[0];
  }

  async function getClusterList(context, args) {
    const whereAnd = [];
    const whereOr = [];
    const values = [];
    let clusterGroupIds = [];

    if (args.organizationId && !args.superAdminViewDetail) {
      util.addSqlWhere(
        'c.organization_id',
        args.organizationId,
        whereOr,
        values
      );
      // if the caller was able to pass in a different org ID, then they
      // are superadmin and we will assume they want only clusters for the
      // specified org. otherwise, we'll return all orgs they have access to.
      const callingOrg = resUtil.getOrgFromAuthContext(context) || '';
      if (args.organizationId.toString() === callingOrg.toString()) {
        util.addSqlWhere('c.is_public', true, whereOr, values);
        whereOr.push(`c.cluster_id IN (
          SELECT cluster_id
          FROM aiware.organization__cluster
          WHERE organization_id = $${values.push(args.organizationId)})`);
      }
    }
    util.addSqlWhere('c.cluster_id', args.id, whereAnd, values);
    util.addSqlWhere('c.cluster_type', args.type, whereAnd, values);
    util.addSqlWhere('c.is_group', _.get(args, 'isGroup'), whereAnd, values);
    util.addSqlWhere('c.status', args.status, whereAnd, values);

    if (args.clusterGroupId) {
      clusterGroupIds.push(args.clusterGroupId);
    }

    if (args.clusterGroupIds) {
      clusterGroupIds = clusterGroupIds.concat(args.clusterGroupIds);
    }

    if (_.isArray(clusterGroupIds) && clusterGroupIds.length > 0) {
      util.addSqlWhere('c.in_group', clusterGroupIds, whereAnd, values);
    }

    if (_.isArray(args.allowedEngines) && args.allowedEngines.length > 0) {
      let engines = (
        await dalEngine.getEngines(context, {
          ids: args.allowedEngines
        })
      ).records;

      // Getting distinct edge versions:
      let distinctEdgeVersions = [
        ...new Set(engines.map((e) => e.edgeVersion))
      ];

      if (distinctEdgeVersions.length > 1) {
        throw new errors.InvalidInput({
          message: 'Allowed engines belong to different Edge versions',
          data: {
            internalData: {
              edgeVersions: distinctEdgeVersions
            }
          }
        });
      }

      // making sure that in case a cluster has allowed_engines='all', it has the same edge version as requested engines
      if (
        distinctEdgeVersions.length !== 0 &&
        distinctEdgeVersions[0] != null
      ) {
        values.push(args.allowedEngines);
        values.push(distinctEdgeVersions[0]);
        whereAnd.push(
          `(c.allowed_engines != '{all}' AND c.allowed_engines @> \$${
            values.length - 1
          } 
          OR c.allowed_engines = '{all}' AND c.edge_version=\$${values.length})`
        );
      } else {
        values.push(args.allowedEngines);
        whereAnd.push(`c.allowed_engines @> \$${values.length}`);
      }
    }

    if (args.edgeVersion) {
      util.addSqlWhere('c.edge_version', args.edgeVersion, whereAnd, values);
    }

    if (!args.includeDeleted) {
      whereAnd.push('c.deleted_date is null');
    }
    const whereOrClause = whereOr.join(' OR ');
    if (whereOr.length) whereAnd.push(`(${whereOrClause})`);

    const whereOrTags = [];
    let unnestTagsField = '';
    if (args.tags) {
      _.forEach(args.tags, (tag) => {
        // add clause for tag match, if tag was passed. case-insensitive.
        util.makeLikeClause(
          'tag',
          tag,
          whereOrTags,
          values,
          args.tagMatch,
          false
        );
      });
    }
    if (whereOrTags.length) {
      whereAnd.push(`(${whereOrTags.join(' OR ')})`);
      unnestTagsField = ', unnest(c.tags) tag';
    }

    util.addDateTimeFilters('c', args, whereAnd, null, 1000, {
      createdDateTime: 'created_date',
      modifiedDateTime: 'updated_date',
      stateLastUpdatedDateTime: 'state_last_updated_date_time'
    });

    util.makeLikeClause(
      'c.display_name',
      args.name,
      whereAnd,
      values,
      'contains',
      false
    );

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';

    const orderClause = [];
    const orderByMap = {
      name: 'c.display_name',
      createdDateTime: 'c.created_date',
      modifiedDateTime: 'c.updated_date',
      stateLastUpdatedDateTime: 'c.state_last_updated_date_time'
    };
    if (_.get(args, 'orderBy.length', 0) > 0) {
      args.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];
        if (!col)
          throw new errors.InternalServerError({
            message:
              'An internal server configuration error in cluster order by processing has occurred.',
            data: {
              internalData: {
                orderByField: orderBy.field,
                knownFields: Object.keys(orderByMap)
              }
            }
          });
        orderClause.push(`${col} ${orderBy.direction}`);
      });
    } else {
      orderClause.push('c.default_cluster desc');
    }

    const sql = `
SELECT DISTINCT
  ${clusterSelect}
FROM
  aiware.cluster c ${unnestTagsField}
${whereClause}
ORDER BY
  ${orderClause.join(', ')}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
    `;

    const rows = await dbRead.map(sql, values, mapper.camelizeRootKeys);

    return util.toPage(args, rows);
  }

  function parseBytesField(value, fieldName) {
    let res;

    if (value) {
      try {
        res = bytes.parse(value);
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'An invalid value was provided for ' +
            fieldName +
            '. Valid examples include ' +
            '2gb, 128mb, 1024000000, etc.',
          data: {
            field: fieldName,
            value: value
          }
        });
      }
      // sanity check. bytes will parse 1g, 1m, etc. as 1.
      // correct units are gb, mb, etc. this is an easy mistake.
      // if the resulting bytes is < 1mb then chances are this was an error.
      if (res < 1000000) {
        throw new errors.InvalidInput({
          message:
            'An invalid value was provided for ' +
            fieldName +
            '. Valid examples include ' +
            '2gb, 128mb, 1024000000, etc.',
          data: {
            field: fieldName,
            value: value
          }
        });
      }
    }

    return res;
  }

  async function createCluster(context, args) {
    try {
      const _isLimit = await isLimit(context);
      if (_isLimit) {
        throw new errors.NotAllowed({
          message: 'Number of clusters in your orgrizantion is maximum!'
        });
      }
      const {
        name,
        allowedEngines,
        type,
        edgeVersion,
        defaultCluster,
        containerTag,
        queueCredentials,
        memorySize,
        storageSize,
        dockerCredentials,
        isPublic,
        bypassAllowedEngines,
        collaborators,
        subscriptions,
        tags,
        status,
        clusterConfig,
        mediaStorage,
        mediaStoragePath,
        restartTimeUTC,
        serviceToken,
        organizationId,
        isGroup,
        clusterGroupId,
        coreId
      } = args.input;
      const requestorOrgId = args.organizationId;
      const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
      let memorySizeBytes = parseBytesField(memorySize, 'memorySize');
      let storageSizeBytes = parseBytesField(storageSize, 'storageSize');

      const cluster = {
        type: type,
        edgeVersion: edgeVersion ? edgeVersion : defaultEdgeVersion,
        organizationId: isSuperAdmin
          ? organizationId || requestorOrgId
          : requestorOrgId,
        name,
        allowedEngines: allowedEngines || {},
        defaultCluster: !!defaultCluster,
        containerTag,
        queueCredentials: queueCredentials || {},
        memorySize: memorySizeBytes,
        storageSize: storageSizeBytes,
        dockerCredentials,
        // TODO update core-job model to allow isPublic update
        isPublic,
        bypassAllowedEngines,
        tags,
        status: status || 'pending',
        coreId,
        clusterConfig: _.pickBy(
          {
            mediaStorage: _.get(clusterConfig, 'mediaStorage', mediaStorage),
            mediaStoragePath: _.get(
              clusterConfig,
              'mediaStoragePath',
              mediaStoragePath
            ),
            serviceToken: _.get(clusterConfig, 'serviceToken', serviceToken),
            restartTimeUTC: _.get(
              clusterConfig,
              'restartTimeUTC',
              _.get(restartTimeUTC, 'timeUTC')
            )
          },
          _.identity
        ),
        isGroup: isGroup || false
      };

      // Validate allowed engines:
      await checkAllowedEngines(
        context,
        cluster.allowedEngines,
        cluster.edgeVersion
      );

      // Validate the cluster group id is valid
      if (clusterGroupId) {
        try {
          // a group cannot be in another group
          if (isGroup == true && clusterGroupId) {
            throw new errors.InvalidInput({
              message: 'A cluster group cannot be in another group',
              data: {
                objectType: 'Cluster Group',
                objectId: clusterGroupId
              }
            });
          }

          await getCluster(context, {
            organizationId: cluster.organizationId,
            id: clusterGroupId,
            isGroup: true
          });

          cluster.clusterGroupId = clusterGroupId;
        } catch (err) {
          if (err && _.includes(err.stack, 'not_found')) {
            throw new errors.NotFound({
              message: 'The cluster group was not found',
              data: {
                objectType: 'Cluster Group',
                objectId: clusterGroupId
              }
            });
          }
          throw err;
        }
      }

      cluster.secretKey = generateClusterSecretKey();
      cluster.accessKey = generateClusterAccessKey();
      checkMemoryStorageSize({
        memorySize: cluster.memorySize,
        storageSize: cluster.storageSize
      });

      const res = await createClusterDb(cluster);

      if (!_.isEmpty(collaborators)) {
        await createClusterCollaborators(res, collaborators);
      }
      if (!_.isEmpty(subscriptions)) {
        await createClusterSubscription(args, res, subscriptions);
      }

      // emit event
      _emitPublicEvent(context, supportedEvents.ClusterCreate, res);

      return res;
    } catch (err) {
      _emitPublicEvent(
        context,
        supportedEvents.ClusterCreate,
        { status: 'failure' },
        err
      );
      throw err;
    }
  }
  async function isLimit(context) {
    const {
      organizationId,
      maxAiwareClusters
    } = context.requestContext.userInfo.organization;
    const maxClusterLimit = maxAiwareClusters;
    const clusters = await getClusterList(context, { organizationId });
    const clusterCount = clusters.records.length;

    return maxClusterLimit && maxClusterLimit <= clusterCount;
  }

  function createClusterDb(cluster) {
    const id = uuid.v4();
    const columnData = {
      cluster_id: cluster.type ? `${_.toLower(cluster.type)}-${id}` : id,
      organization_id: cluster.organizationId,
      display_name: cluster.name,
      allowed_engines: _.isEmpty(cluster.allowedEngines)
        ? {}
        : cluster.allowedEngines,
      cluster_type: cluster.type,
      edge_version: cluster.edgeVersion,
      secret_key: cluster.secretKey,
      access_key: cluster.accessKey,
      default_cluster: !!cluster.defaultCluster,
      container_tag: cluster.containerTag,
      queue_credentials: cluster.queueCredentials || {},
      memory_size: cluster.memorySize,
      storage_size: cluster.storageSize,
      docker_hub_credentials: !_.isEmpty(cluster.dockerCredentials)
        ? JSON.parse(cluster.dockerCredentials)
        : {},
      is_public: _.isNil(cluster.isPublic) ? false : cluster.isPublic,
      bypass_allowed_engines: cluster.bypassAllowedEngines,
      tags: _.isEmpty(cluster.tags) ? {} : cluster.tags,
      status: cluster.status,
      cluster_config: cluster.clusterConfig,
      is_group: cluster.isGroup || false,
      in_group: cluster.clusterGroupId,
      core_id: cluster.coreId
    };
    const { sql, values } = util.makeInsertSql(
      'aiware.cluster',
      columnData,
      clusterReturning
    );
    return dbWrite.one(sql, values, mapper.camelizeRootKeys);
  }

  function checkMemoryStorageSize(options) {
    if (
      options.memorySize &&
      (options.memorySize <= 0 || options.memorySize > aiwareClusterMemoryLimit)
    ) {
      throw new errors.InvalidInput({
        data: {
          message: `cluster memory negative or exceeds limit of ${aiwareClusterMemoryLimit}`
        }
      });
    }

    if (
      options.storageSize &&
      (options.storageSize <= 0 ||
        options.storageSize > aiwareClusterStorageLimit)
    ) {
      throw new errors.InvalidInput({
        data: {
          message: `cluster storage negative or exceeds limit of ${aiwareClusterStorageLimit}`
        }
      });
    }
  }

  async function getCollaboratingOrgIds(context, args) {
    const sql = `SELECT organization_id FROM aiware.organization__cluster WHERE cluster_id = $1`;
    const res = await dbRead.map(sql, [args.id], (row) => row.organization_id);
    return res;
  }

  async function getCollaborators(context, args) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const whereAnd = [];
    const values = [];

    util.addSqlWhere('oc.cluster_id', args.id, whereAnd, values);
    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const sql = `
      SELECT  oc.cluster_id,
              oc.organization_id
      FROM aiware.organization__cluster oc
      ${whereClause}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || defaultLimit};`;

    const res = await dbWrite.map(sql, values, (row) => {
      const r = mapper.camelizeRootKeys(row);
      r.permission = getClusterPermission(r, args.organizationId);
      return r;
    });
    return util.toPage(args, res);
  }

  async function updateCluster(context, args) {
    let cluster;
    try {
      let {
        id,
        name,
        allowedEngines,
        dockerCredentials,
        edgeVersion,
        containerTag,
        memorySize,
        storageSize,
        bypassAllowedEngines,
        collaborators,
        tags,
        status,
        clusterConfig,
        managementNodeID,
        mediaStoragePath,
        restartTimeUTC,
        subscriptions,
        serviceToken,
        controllerUrl,
        coreId,
        setAsDefaultForOrganization,
        setAsEnvironmentDefaultCluster,
        setAsDefaultForBUs
      } = args.input;

      const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
      const isInternalAPIKey = context._authInfo
        ? mainUtil.isInternalAPIKey(context._authInfo)
        : false;
      const memorySizeBytes = parseBytesField(memorySize, 'memorySize');
      const storageSizeBytes = parseBytesField(storageSize, 'storageSize');
      cluster = await getCluster(context, { id });

      const clusterPermission = await getClusterPermission(
        cluster,
        args.organizationId
      );

      if (clusterPermission !== 'owner' && !isSuperAdmin && !isInternalAPIKey) {
        throw new errors.NotAllowed({
          message:
            'The specified cluster is viewable by you but is owned by ' +
            'another organization and cannot be updated.',
          data: {
            objectId: id,
            objectType: 'Cluster'
          }
        });
      }

      // extra permission required here because we only allow
      // internal token with the cluster_manager permission
      // to update and modify the cluster.
      // To avoid calling from unrelated services
      if (isInternalAPIKey) {
        mainUtil.requirePerm('cluster:manager', context);
      }

      // only validate if we updated at least allowedEngines or edgeVersion
      if (!!allowedEngines || !!edgeVersion) {
        // Validate allowed engines:
        await checkAllowedEngines(
          context,
          allowedEngines || cluster.allowedEngines,
          edgeVersion || cluster.edgeVersion
        );
      }

      let dbClusterConfig = cluster.clusterConfig;
      let body = {
        id,
        name,
        allowedEngines,
        containerTag,
        memorySize: memorySizeBytes,
        storageSize: storageSizeBytes,
        dockerCredentials,
        edgeVersion,
        bypassAllowedEngines,
        tags,
        status,
        coreId,
        clusterConfig: Object.assign(
          dbClusterConfig || {},
          _.pickBy(
            {
              managementNodeId: _.get(
                clusterConfig,
                'managementNodeId',
                managementNodeID
              ),
              mediaStoragePath: _.get(
                clusterConfig,
                'mediaStoragePath',
                mediaStoragePath
              ),
              serviceToken: _.get(clusterConfig, 'serviceToken', serviceToken),
              restartTimeUTC: _.get(
                clusterConfig,
                'restartTimeUTC',
                _.get(restartTimeUTC, 'timeUTC')
              )
            },
            _.identity
          ),
          clusterConfig
        ),
        controllerUrl
      };
      checkMemoryStorageSize({
        memorySize: body.memorySize,
        storageSize: body.storageSize
      });

      const updatedCluster = await updateClusterDb(body);
      if (!_.isEmpty(collaborators)) {
        await createClusterCollaborators(cluster, collaborators);
      }

      if (subscriptions) {
        await updateClusterSubscription(args, cluster, subscriptions);
      }

      if (
        setAsDefaultForOrganization ||
        setAsEnvironmentDefaultCluster ||
        setAsDefaultForBUs
      ) {
        await serviceContext.bll.cluster.updateClusterPreferences(
          context,
          args
        );
      }

      // emit event
      _emitPublicEvent(context, supportedEvents.ClusterUpdate, updatedCluster);

      return updatedCluster;
    } catch (err) {
      if (!cluster) {
        cluster = {
          id: args.input.id
        };
      }
      _emitPublicEvent(
        context,
        supportedEvents.ClusterUpdate,
        { ...cluster, status: 'failure' },
        err
      );
      throw err;
    }
  }

  function updateClusterDb(cluster) {
    const columnData = {
      display_name: cluster.name,
      allowed_engines: cluster.allowedEngines,
      secret_key: cluster.secretKey,
      access_key: cluster.accessKey,
      edge_version: cluster.edgeVersion,
      container_tag: cluster.containerTag,
      queue_credentials: cluster.queueCredentials,
      docker_hub_credentials: cluster.dockerCredentials,
      paused: cluster.paused || cluster.status === 'paused',
      memory_size: cluster.memorySize,
      storage_size: cluster.storageSize,
      bypass_allowed_engines: cluster.bypassAllowedEngines,
      updated_date: parseInt(new Date() / 1000, 10),
      is_public: cluster.isPublic,
      tags: _.isArray(cluster.tags)
        ? cluster.tags.length
          ? cluster.tags
          : {}
        : cluster.tags,
      status: cluster.status,
      cluster_config: cluster.clusterConfig,
      controller_url: cluster.controllerUrl,
      core_id: cluster.coreId
    };
    const { sql, values } = util.makeUpdateSql(
      'aiware.cluster',
      columnData,
      clusterReturning,
      `cluster_id = '${cluster.id}'`
    );
    return dbWrite.one(sql, values, mapper.camelizeRootKeys);
  }

  async function deleteCluster(context, args) {
    const clusterId = args.id;

    try {
      const newClusterId = clusterId.length > 36 ? clusterId.slice(-36) : clusterId;

      if (!validator.isUUID(newClusterId)) {
        throw new errors.InvalidInput({
          message: 'The cluster ID is not valid',
          data: {
            objectType: 'Cluster',
            objectId: clusterId
          }
        });
      }

      const deleteClusterPromise = promisify(coreJobDal.cluster.deleteCluster);

      return deleteClusterPromise(clusterId, null)
        .then((res) => {
          if (res) {
            res.id = res.clusterId;
            res.name = res.displayName;
            delete res.clusterId;
            delete res.displayName;
          }
          // emit event
          _emitPublicEvent(context, supportedEvents.ClusterDelete, res);
          return res;
        })
        .catch((err) => {
          _emitPublicEvent(
            context,
            supportedEvents.ClusterDelete,
            { status: 'failure' }, // should not include id here, as it may not exist
            err
          );
          throw new errors.ServiceFailure();
        });
    } catch (err) {
      _emitPublicEvent(
        context,
        supportedEvents.ClusterDelete,
        { id: clusterId, status: 'failure' },
        err
      );
      throw err;
    }
  }

  function getClusterPermission(cluster, orgId) {
    // TODO add acl checking but for now we only have owner or viewer
    if (_.toString(cluster.organizationId) === _.toString(orgId)) {
      return 'owner';
    }
    return 'viewer';
  }

  async function pauseCluster(context, args) {
    const getClusterNodePromiser = promisify(coreJobDal.node.getNodes);
    const updatePauseStatusForNodesPromiser = promisify(
      coreJobDal.node.updatePauseStatusForNodes
    );
    const pauseClusterPromiser = promisify(coreJobDal.cluster.pauseCluster);
    const { id } = args.input;

    try {
      const resClusterNodes = await getClusterNodePromiser(
        { clusterId: id },
        null
      );
      if (resClusterNodes) {
        const clusterNodes = resClusterNodes.results;
        if (clusterNodes) {
          const nodeIds = clusterNodes.map((node) => node.nodeId);
          logger.debug('pause cluster node', nodeIds);
          await updatePauseStatusForNodesPromiser(nodeIds, true, null);
        } else {
          logger.debug('no cluster node to pause');
        }
      }

      const results = await pauseClusterPromiser(id, null);
      if (results) {
        results.id = results.clusterId;
        results.name = results.displayName;
        delete results.clusterId;
        delete results.displayName;
      }

      return getCluster(context, { id });
    } catch (err) {
      logger.error(err);
      throw new errors.ServiceFailure();
    }
  }

  async function unpauseCluster(context, args) {
    const getClusterNodePromiser = promisify(coreJobDal.node.getNodes);
    const updatePauseStatusForNodesPromiser = promisify(
      coreJobDal.node.updatePauseStatusForNodes
    );
    const unpauseClusterPromiser = promisify(coreJobDal.cluster.unpauseCluster);
    const { id } = args.input;

    try {
      const resClusterNodes = await getClusterNodePromiser(
        { clusterId: id },
        null
      );
      if (resClusterNodes) {
        const clusterNodes = resClusterNodes.results;
        if (clusterNodes) {
          const nodeIds = clusterNodes.map((node) => node.nodeId);
          logger.debug('pause cluster node', nodeIds);
          await updatePauseStatusForNodesPromiser(nodeIds, false, null);
        } else {
          logger.debug('no cluster node to pause');
        }
      }

      const results = await unpauseClusterPromiser(id, null);
      if (results) {
        results.id = results.clusterId;
        results.name = results.displayName;
        delete results.clusterId;
        delete results.displayName;
      }

      return getCluster(context, { id });
    } catch (err) {
      logger.error(err);
      throw new errors.ServiceFailure();
    }
  }

  async function createClusterCollaborators(cluster, collaborators) {
    if (!(collaborators && collaborators.length)) {
      return [];
    }
    const values = [cluster.id];
    const newCollabs = collaborators
      .filter((collab) => collab.permission === 'viewer')
      .map((collab) => `($1, $${values.push(collab.organizationId)})`);

    const removeCollabs = collaborators
      .filter((collab) => collab.permission === 'none')
      .map((collab) => collab.organizationId);

    let sql = '';
    if (!_.isEmpty(newCollabs)) {
      sql += `
      INSERT INTO aiware.organization__cluster(cluster_id, organization_id) VALUES
        ${newCollabs.join(', ')}
        ON CONFLICT ON CONSTRAINT organization__cluster_pkey DO NOTHING
        RETURNING organization_id, cluster_id;`;
    }

    if (!_.isEmpty(removeCollabs)) {
      sql += `DELETE FROM aiware.organization__cluster
      WHERE cluster_id = $1 AND
       organization_id = ANY($${values.push(removeCollabs)}::integer[]);`;
    }

    return dbWrite.map(sql, values, mapper.camelizeRootKeys);
  }

  async function createClusterSubscription(args, cluster, subscriptions) {
    if (!(subscriptions && subscriptions.length)) {
      return [];
    }
    let rawSubscriptions = [];
    for (let value of subscriptions) {
      const user = await serviceContext.dal.admin.getUser({
        id: value.userId
      });

      if (!user) {
        throw new errors.NotFound({
          message: 'User not found by userId',
          data: {
            objectId: value.userId
          }
        });
      }
      rawSubscriptions.push({
        email_address: user.name,
        user_id: user.id,
        is_active: !!value.isActive,
        object_type_id: 2,
        subscription_data: {
          clusterId: cluster.id
        },
        organization_id: args.organizationId,
        frequency_id: 1
      });
    }
    let columnSet = new pgp.helpers.ColumnSet(
      [
        'email_address',
        'user_id',
        'is_active',
        'object_type_id',
        'subscription_data',
        'organization_id',
        'frequency_id'
      ],
      { table: 'subscription' }
    );
    let query = pgp.helpers.insert(rawSubscriptions, columnSet);
    return await dbConnections.subscription.write.map(
      query + ' RETURNING *, subscription_id as id',
      null,
      mapper.camelizeRootKeys
    );
  }
  async function updateClusterSubscription(args, cluster, subscriptions) {
    let query = `
      DELETE FROM
        subscription
      WHERE
        subscription_data->>'clusterId'::TEXT = '${cluster.id}'
    `;
    const res = await dbConnections['subscription'].write.map(
      query,
      null,
      mapper.camelizeRootKeys
    );
    if (res) {
      return createClusterSubscription(args, cluster, subscriptions);
    }

    return res;
  }

  async function getClusterSubscriptions(context, args) {
    let whereClause = ['s.object_type_id = 2 '];
    let values = [];
    if (args.clusterId) {
      util.addSqlWhere(
        `s.subscription_data->>'clusterId'`,
        args.clusterId,
        whereClause,
        values
      );
    }
    let sql = `SELECT
      s.subscription_id as id,
      s.email_address,
      s.user_id,
      s.is_active,
      s.object_type_id,
      s.subscription_data,
      s.date_created as created_date_time,
      s.date_modified as modified_date_time
     FROM subscription s WHERE ${whereClause.join(' AND ')}`;
    let result = await dbConnections.subscription.read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    return util.toPage(args, result);
  }

  async function getClusterTags(context, args) {
    const cacheKey = `dalCluster_getClusterTags_${args.match}_${args.organizationId}`;
    const cachedClusterTags = lruCache.get(cacheKey);

    if (cachedClusterTags) {
      logger.debug('Get getClusterTags from key: ', cacheKey);
      logger.debug('Get getClusterTags value: ', cachedClusterTags);
      return cachedClusterTags;
    }
    const where = [];
    const values = [];

    util.addSqlWhere('c.organization_id', args.organizationId, where, values);
    // add clause for matchType, if match was passed. case-insensitive.
    util.makeLikeClause(
      'tag',
      args.match,
      where,
      values,
      args.matchType,
      false
    );

    const sql = `
      SELECT 	distinct tag
      FROM 	  aiware.cluster c, unnest(c.tags) tag
      WHERE 	${where.join(' AND ')};
    `;

    const rows = await dbRead.query(sql, values);
    const tags = _.map(rows, (row) => row.tag);
    lruCache.set(cacheKey, tags);
    return tags;
  }

  async function updateClusterState(context, args) {
    try {
      const input = args.input;
      const cluster = await getCluster(context, { id: input.id });
      let clusterHistory = [];
      const targetStatus = input.targetStatus || cluster.targetStatus;
      //update clusterNode
      if (input.nodes) {
        for (let node of input.nodes) {
          const subArgs = {
            input: {
              id: node.nodeId,
              metrics: node.metrics
            }
          };
          await serviceContext.dal.clusterNode.updateClusterNode(
            context,
            subArgs
          );
        }
      }
      if (_.isArray(cluster.clusterHistory)) {
        clusterHistory = cluster.clusterHistory;

        if (clusterHistory.length >= aiwareClusterHistoryLimit) {
          const startRemoveIndex = aiwareClusterHistoryLimit - 1;
          clusterHistory.splice(
            startRemoveIndex,
            clusterHistory.length - startRemoveIndex
          );
        }
      }

      clusterHistory.unshift({
        timestamp: moment.utc().toISOString(),
        targetStatus,
        message: getClusterHistoryMessage({
          targetStatus
        })
      });

      const columnData = {
        cluster_state: input.state,
        target_status: input.targetStatus,
        cluster_history: JSON.stringify(clusterHistory),
        state_last_updated_date_time: parseInt(new Date() / 1000, 10)
      };
      const { sql, values } = util.makeUpdateSql(
        'aiware.cluster',
        columnData,
        clusterReturning,
        `cluster_id = '${input.id}'`
      );
      const result = await dbWrite.one(sql, values, mapper.camelizeRootKeys);
      _emitPublicEvent(context, supportedEvents.ClusterUpdate, result);
      return result;
    } catch (err) {
      _emitPublicEvent(
        context,
        supportedEvents.ClusterUpdate,
        { status: 'failure' },
        err
      );
      throw err;
    }
  }

  function getClusterHistoryMessage(options) {
    const targetStatus = options.targetStatus;

    switch (targetStatus) {
      case 'pending':
        return 'cluster is pending';
      case 'active':
        return 'cluster is active';
      case 'deploying':
        return 'cluster is deploying';
      case 'online':
        return 'cluster was online';
      case 'paused':
        return 'cluster was paused';
      case 'terminated':
        return 'cluster was terminated';
      default:
        return '';
    }
  }

  async function getClusterByPreference(context, args) {
    const cacheKey = uuidv5(JSON.stringify(args), uuidNamespace);
    let clusterPreferenceTimestamp = await serviceContext.redisCache.get(
      clusterByPreferenceTimestampKey,
      cacheKey
    );
    const isCacheDirty = await serviceContext.redisCache.isCacheDirty(
      clusterByPreferenceCacheKey,
      clusterPreferenceTimestamp
    );

    if (isCacheDirty) {
      await serviceContext.redisCache.clear(
        clusterByPreferenceCacheKey,
        cacheKey
      );
      // clear the timestamp too
      await serviceContext.redisCache.clear(
        clusterByPreferenceTimestampKey,
        cacheKey
      );
    }

    let cachedPreference = await serviceContext.redisCache.get(
      clusterByPreferenceCacheKey,
      cacheKey
    );

    // Check the cache is not a string as "no results"
    if (cachedPreference) {
      serviceContext.logger.debug(
        'cache HIT on cluster preference for: ',
        args
      );
      if (cachedPreference === NO_CLUSTERS_STR) {
        cachedPreference = null;
      }
      return cachedPreference;
    }

    const where = [];
    const values = [];

    for (const preferenceType in args) {
      if (Object.prototype.hasOwnProperty.call(args, preferenceType)) {
        const preferenceKey = args[preferenceType];
        const subClause = [];
        util.addSqlWhere('preference_key', preferenceKey, subClause, values);
        util.addSqlWhere(
          'preference_type',
          _.snakeCase(preferenceType),
          subClause,
          values
        );
        where.push('(' + subClause.join(' AND ') + ')');
      }
    }
    // Skipping default for now to let core-job determine default for iron jobs
    // util.addSqlWhere('preference_type', 'default', where, values);

    const sql = `
      SELECT cluster_id
      FROM 	  aiware.cluster__preference
      WHERE 	${where.join(' OR ')}
      ORDER BY preference_type DESC
      LIMIT 1;
    `;

    let clusterId = null;
    const rows = await dbRead.query(sql, values);

    if (rows.length > 0) {
      clusterId = mapper.camelizeRootKeys(rows[0]).clusterId;
    }

    // In case no results set clusterId is "null" to redis.
    // Otherwise, would set the clusterId that have value.
    await serviceContext.redisCache.asyncSet(
      clusterByPreferenceCacheKey,
      cacheKey,
      _.isNil(clusterId) ? NO_CLUSTERS_STR : clusterId,
      null,
      clusterByPreferenceTtlMin
    );
    // Set the cluster preference cache timestamp to check dirty later
    clusterPreferenceTimestamp = Date.now();
    await serviceContext.redisCache.asyncSet(
      clusterByPreferenceTimestampKey,
      cacheKey,
      clusterPreferenceTimestamp,
      null,
      clusterByPreferenceTtlMin
    );

    return clusterId;
  }

  async function checkAllowedEngines(
    context,
    allowedEngines,
    clusterEdgeVersion
  ) {
    if (!_.isArray(allowedEngines) || allowedEngines.length === 0) {
      return;
    }

    if (allowedEngines[0] === 'all') {
      return;
    }

    let engines = (
      await dalEngine.getEngines(context, {
        ids: allowedEngines
      })
    ).records;

    if (engines.length === 0) {
      return;
    }

    // Getting distinct edge versions:
    let distinctEdgeVersions = [...new Set(engines.map((e) => e.edgeVersion))];

    if (distinctEdgeVersions.length > 1) {
      throw new errors.InvalidInput({
        message: 'Allowed engines belong to different Edge versions',
        data: {
          internalData: {
            edgeVersions: distinctEdgeVersions
          }
        }
      });
    }

    if (distinctEdgeVersions[0] !== clusterEdgeVersion) {
      throw new errors.InvalidInput({
        message:
          'Cluster cannot support allowed engines because of the Edge version mismatch',
        data: {
          internalData: {
            clusterEdgeVersion: clusterEdgeVersion,
            enginesEdgeVersion: distinctEdgeVersions[0]
          }
        }
      });
    }
  }

  async function setClusterByPreference(context, args) {
    const { clusterId, preferenceType, preferenceKey } = args;

    if (!clusterId) {
      throw new errors.InvalidInput({ message: 'clusterId is required' });
    }

    // Verify that cluster is exists
    await getCluster(context, {
      id: clusterId,
      organizationId:
        preferenceType === 'organization' ? preferenceKey : args.organizationId
    });

    if (!preferenceType) {
      throw new errors.InvalidInput({ message: 'preferenceType is required' });
    }

    if (!preferenceKey) {
      throw new errors.InvalidInput({ message: 'preferenceKey is required' });
    }

    const sql = `INSERT INTO aiware.cluster__preference 
      VALUES ($1, $2, $3)
      on conflict (preference_key, preference_type) do
      update
      set	cluster_id = $3
      returning	preference_key, preference_type, cluster_id;`;
    const res = await serviceContext.dbConnections['core'].write.one(
      sql,
      [preferenceKey, preferenceType, clusterId],
      mapper.camelizeRootKeys
    );

    // mark cache dirty for cluster preference
    await serviceContext.redisCache.markCacheDirty(clusterByPreferenceCacheKey);

    return res;
  }

  async function deleteClusterPreference(context, args) {
    const { clusterId, preferenceType, preferenceKey } = args;

    if (!clusterId) {
      throw new errors.InvalidInput({ message: 'clusterId is required' });
    }

    // Verify that cluster is exists
    await getCluster(context, {
      id: clusterId,
      organizationId:
        preferenceType === 'organization' ? preferenceKey : args.organizationId
    });

    if (!preferenceType) {
      throw new errors.InvalidInput({ message: 'preferenceType is required' });
    }

    if (!preferenceKey) {
      throw new errors.InvalidInput({ message: 'preferenceKey is required' });
    }

    const sql = `DELETE FROM aiware.cluster__preference
      WHERE preference_key = $1
        AND preference_type = $2
        AND cluster_id = $3`;

    const res = await serviceContext.dbConnections['core'].write.query(sql, [
      preferenceKey,
      preferenceType,
      clusterId
    ]);

    // mark cache dirty for cluster preference
    await serviceContext.redisCache.markCacheDirty(clusterByPreferenceCacheKey);

    return res;
  }

  async function _emitPublicEvent(context, eventName, data, error) {
    data = data || {};
    const actionNameMap = {
      ClusterCreate: 'create',
      ClusterUpdate: 'update',
      ClusterDelete: 'delete'
    };
    // emit event
    const event = {
      clusterId: data.id || data.cluster_id,
      name: data.name || data.display_name,
      display_name: data.name || data.display_name,
      status: data.status,
      organizationId: data.organizationId || data.organization_id,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        data.id || data.cluster_id,
        error,
        actionNameMap[eventName],
        !error ? 'success' : 'failure',
        getActionDetails(eventName, error, data.id || data.cluster_id)
      )
    };
    try {
      await messageUtil.emitPublicEvent(eventName, 'system', context, event);
    } catch (ex) {
      logger.error(`failed to publish event: ${eventName}`, ex);
    }
  }

  return {
    getCluster,
    getClusterList,
    createCluster,
    updateCluster,
    deleteCluster,
    pauseCluster,
    unpauseCluster,
    getCollaborators,
    getCollaboratingOrgIds,
    getClusterTags,
    createClusterSubscription,
    updateClusterSubscription,
    getClusterSubscriptions,
    updateClusterState,
    getClusterByPreference,
    setClusterByPreference,
    createClusterCollaborators,
    deleteClusterPreference
  };
};

function generateTenByteKey() {
  return `${Math.floor(Math.random() * 1099511627776)
    .toString(16)
    .toUpperCase()}`;
}

// generates a 20 byte hex key
function generateClusterAccessKey() {
  return `${generateTenByteKey()}${generateTenByteKey()}`;
}

// generates a 40 byte hex key
function generateClusterSecretKey() {
  return `${generateTenByteKey()}${generateTenByteKey()}${generateTenByteKey()}${generateTenByteKey()}`;
}
