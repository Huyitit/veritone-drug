const _ = require('lodash');
const fs = require('fs');

module.exports = function initService(serviceContext) {
  async function updateDefaultCluster() {
    const edgeClusterId = _.get(serviceContext, 'config.edgeClusterID');
    if (!edgeClusterId || edgeClusterId.length === 0) {
      // Not running on edge - nothing to update
      return;
    }

    let cluster;
    try {
      cluster = await serviceContext.dal.cluster.getCluster(
        {},
        {
          id: edgeClusterId
        }
      );
    } catch (err) {
      if (err.name !== 'not_found') {
        return;
      }
      cluster = null;
    }
    if (cluster) {
      // cluster is already created
      return;
    }

    // currently we can't create a cluster with supplied id
    const defaultClusterId = await serviceContext.dal.cluster.getClusterByPreference(
      {},
      {
        default: 'default'
      }
    );
    if (defaultClusterId !== 'rt-deadbeef-0000-0001-0001-ba5eba111111') {
      // Hacky, but we need safeguards. Some other process has already changed
      // the default cluster, it's safer to not change that.
      return;
    }

    const controllerUrl = process.env.AIWARE_CONTROLLER_URI;

    await serviceContext.dbConnections['core'].write.query(
      `UPDATE aiware.cluster 
        SET cluster_id=$1, 
            allowed_engines='{"all"}',
            edge_version=3,
            bypass_allowed_engines=true,
            cluster_type='RT',
            controller_url=$3
      WHERE cluster_id=$2;`,
      [edgeClusterId, defaultClusterId, controllerUrl]
    );

    // invalidate cache to force fetch from the db.
    await serviceContext.redisCache.markCacheDirty(
      'dalCluster_getClusterByPreference'
    );
  }

  async function installSchemas() {
    // FIXME: for now don't do anything if not running on aiware anywhere
    if (!_.get(serviceContext, 'config.edgeClusterID')) {
      return;
    }

    let appConfig;
    try {
      appConfig = JSON.parse(
        fs.readFileSync('./config/init/applicationInstallInit.json', 'utf8')
      );
    } catch (err) {
      serviceContext.logger.error(
        'Failed to process application schemas',
        err.toString()
      );
    }
    const schemas = [];
    for (const app of appConfig.applications) {
      schemas.push(...app.schemas);
    }

    const sdoDal = serviceContext.dal.structuredData;
    // filter out existing schemas
    const existingIds = await sdoDal.getDataRegistries(serviceContext, {
      ids: schemas.map((x) => x.id),
      _skipAccessCheck: true
    });
    const existingSchemaLookup = new Set(
      _.get(existingIds, 'records', []).map((x) => x.id)
    );
    for (const s of schemas) {
      if (existingSchemaLookup.has(s.id) || !s.organizationId) {
        continue;
      }
      const orgId = parseInt(s.organizationId, 10);

      // 1. Create registry
      const dataRegistry = await sdoDal.createSchemaMetadata(
        {},
        {
          organizationId: orgId,
          input: s
        }
      );
      if (!dataRegistry) {
        serviceContext.logger.error('Failed to crate data registry', s.id);
        continue;
      }
      // 2. Add schema revision
      const revision = await sdoDal.upsertSchemaDraft(serviceContext, {
        organizationId: orgId,
        input: {
          dataRegistryId: s.id,
          schema: s.definition
        }
      });
      if (!revision) {
        serviceContext.logger.error(
          'Failed upsert new data registry schema',
          s.id
        );
        continue;
      }
      // 3. Set to published
      await sdoDal.updateSchemaState(serviceContext, {
        organizationId: orgId,
        input: {
          id: revision.id,
          status: 'published'
        }
      });
    }
  }

  async function performInitialProvisioningInLock() {
    return Promise.all([updateDefaultCluster(), installSchemas()]);
  }

  async function performInitialProvisioning() {
    const redLock = serviceContext.createRedisLock({
      retryCount: 1,
      retryDelay: 1000
    });
    try {
      const lock = await redLock.lock(
        'core-grapqhl-server::ServiceInitLock',
        300000
      );
      try {
        await performInitialProvisioningInLock();
      } catch (err) {
        serviceContext.logger.error(
          `Failure in the cluster provisioning: `,
          err
        );
      } finally {
        lock.unlock().catch((err) => {
          serviceContext.logger.error(err);
        });
      }
    } catch (lockErr) {
      // failed to obtain lock
      serviceContext.logger.trace(lockErr);
    }
  }

  return () => {
    performInitialProvisioning();
  };
};
