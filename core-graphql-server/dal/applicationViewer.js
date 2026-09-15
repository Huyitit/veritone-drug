const _ = require('lodash');
const mapper = require('./mapper.js');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

module.exports = function createFunction(serviceContext, _config) {
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(_config);

  const applicationViewersReturning = {
    viewer_id: 'id',
    owner_organization_id: null,
    name: null,
    description: null,
    icon: null,
    mimetype: null,
    viewer_type: null,
    date_created: 'created_date_time',
    date_modified: 'modified_date_time',
    created_by: null,
    modified_by: null,
    is_public: null
  };

  const applicationViewerBuildsReturning = {
    viewer_build_id: 'id',
    viewer_id: null,
    source_url: null,
    access_url: null,
    version: null,
    status: null
  };

  async function getApplicationViewers(context, options) {
    const { sql, args } = await _getApplicationViewersQuery(context, options);
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapApplicationViewer
    );

    return mainUtil.toPage(options, rows);
  }

  async function _getApplicationViewersQuery(context, options) {
    const { ids, orderBy, limit, offset, isPublic, allOrgs } = options;
    let sql = `
    SELECT
      v.viewer_id,
      v.owner_organization_id,
      v.name,
      v.description,
      v.icon,
      v.mimetype,
      v.viewer_type,
      v.date_created,
      v.date_modified,
      v.created_by,
      v.modified_by,
      v.is_public
    FROM
      job_new.viewer v
  `;
    const args = [];
    const where = [];

    if (ids && Array.isArray(ids) && ids.length > 0) {
      args.push(ids);
      where.push(`v.viewer_id = ANY($${args.length}::uuid[])`);
    }

    if (isPublic) {
      where.push(`v.is_public = true`);
    } else {
      if (!allOrgs) {
        // viewers owned by the caller's organization
        const callerOrgId = resUtil.getOrgFromAuthContext(context);
        args.push(callerOrgId);
        where.push(`v.owner_organization_id = $${args.length}`);
      }

      // if isPublic is false, filter non-public only
      if (isPublic === false) {
        where.push(`v.is_public = false`);
      }
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }

    if (orderBy && orderBy.field) {
      const columnMapping = {
        name: 'v.name',
        id: 'v.viewer_id',
        createdDateTime: 'v.date_created',
        modifiedDateTime: 'v.date_modified'
      };
      const { field, direction } = orderBy;

      if (columnMapping[field]) {
        sql += ` ORDER BY ${columnMapping[field]} ${
          direction === 'asc' ? 'ASC' : 'DESC'
        }`;
      }
    }

    if (Number.isInteger(limit)) {
      args.push(limit);
      sql += ` LIMIT $${args.length}`;
    }

    if (Number.isInteger(offset)) {
      args.push(offset);
      sql += ` OFFSET $${args.length}`;
    }

    return { sql, args };
  }

  async function getApplicationViewerBuilds(context, options) {
    const { sql, args } = await _getApplicationViewerBuildsQuery(
      context,
      options
    );
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapApplicationViewerBuild
    );

    return mainUtil.toPage(options, rows);
  }

  async function _getApplicationViewerBuildsQuery(context, options) {
    const params = ['status', 'viewerBuildId'];
    const paramsMap = {
      status: {
        sql: ` vb.status = $`
      },
      viewerBuildId: {
        sql: `vb.viewer_build_id = $`
      }
    };

    let sql = `
      SELECT
        vb.viewer_build_id,
        vb.viewer_id,
        vb.source_url,
        vb.access_url,
        vb.version,
        vb.status
      FROM
        job_new.viewer_build vb
    `;
    const args = [];
    const where = [];

    _.forEach(params, (item) => {
      if (!options[item]) {
        return;
      }
      args.push(options[item]);
      where.push(`${paramsMap[item].sql}${args.length}`);
    });

    if (
      options.viewerIds &&
      Array.isArray(options.viewerIds) &&
      options.viewerIds.length > 0
    ) {
      args.push(options.viewerIds);
      where.push(`vb.viewer_id = ANY($${args.length}::uuid[])`);
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }

    const orderBy = options.orderBy || null;

    if (orderBy && orderBy.field === 'version') {
      sql += ` ORDER BY vb.version ${
        orderBy.direction === 'asc' ? 'ASC' : 'DESC'
      }`;
    }

    if (Number.isInteger(options.limit)) {
      args.push(options.limit);
      sql += ` LIMIT \$${args.length}`;
    }

    if (Number.isInteger(options.offset)) {
      args.push(options.offset);
      sql += ` OFFSET \$${args.length}`;
    }
    return { sql, args };
  }

  async function createApplicationViewer(args, context) {
    const { id: viewerId } = args.input;

    if (viewerId) {
      const viewer = await getApplicationViewers(context, {
        ids: [viewerId]
      });

      if (!_.isEmpty(viewer.records)) {
        throw new errors.NotFound({
          message: 'Viewer already exists with this ID',
          data: {
            viewerId
          }
        });
      }
    }

    const { sql, values } = _createApplicationViewerQuery(
      { viewerId, ...args.input },
      context
    );

    let newViewer = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    newViewer = _.get(newViewer, '0');

    return newViewer;
  }

  function _createApplicationViewerQuery(input, context) {
    const {
      viewerId,
      name,
      description,
      icon,
      mimetype,
      viewerType,
      organizationId,
      isPublic
    } = input;

    const columnData = {
      viewer_id: viewerId ?? uuidv4(),
      owner_organization_id: organizationId,
      name,
      description,
      icon,
      mimetype,
      viewer_type: viewerType,
      is_public: isPublic,
      created_by: _.get(
        context,
        '_authInfo.userId',
        '00000000-0000-0000-0000-000000000000'
      ),
      modified_by: _.get(
        context,
        '_authInfo.userId',
        '00000000-0000-0000-0000-000000000000'
      )
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.viewer',
      columnData,
      applicationViewersReturning
    );

    return { sql, values };
  }

  async function createApplicationViewerBuild(args, context) {
    const { viewerId } = args.input;
    const viewer = await getApplicationViewers(context, {
      ids: [viewerId]
    });

    if (_.isEmpty(viewer.records)) {
      throw new errors.NotFound({
        message: 'Viewer not found',
        data: {
          viewerId
        }
      });
    }

    if (
      _.get(viewer, 'records[0].ownerOrganizationId') !==
      _.get(args, 'input.organizationId')
    ) {
      throw new errors.NotAllowed({
        message: 'You do not have permission to create a build for this viewer',
        data: {
          viewerId
        }
      });
    }

    const previousVersions = await getApplicationViewerBuilds(context, {
      viewerIds: [viewerId],
      orderBy: { field: 'version', direction: 'desc' },
      limit: 1
    });

    let newVersion = 1;

    if (!_.isEmpty(previousVersions.records)) {
      newVersion = previousVersions.records[0].version + 1;
    }

    const { sql, values } = _createApplicationViewerBuildQuery(
      { ...args.input, version: newVersion },
      context
    );

    let newViewerBuild = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    newViewerBuild = _.get(newViewerBuild, '0');

    return newViewerBuild;
  }

  function _createApplicationViewerBuildQuery(input, context) {
    const { viewerId, sourceUrl, accessUrl, status, version, isPublic } = input;

    const columnData = {
      viewer_build_id: uuidv4(),
      viewer_id: viewerId,
      source_url: sourceUrl,
      access_url: accessUrl,
      version,
      status: status || 'draft'
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.viewer_build',
      columnData,
      applicationViewerBuildsReturning
    );

    return { sql, values };
  }

  async function updateApplicationViewer(args, context) {
    const { viewerId } = args;
    const viewers = await getApplicationViewers(context, {
      ids: [viewerId],
      allOrgs: true
    });

    if (_.isEmpty(viewers.records)) {
      throw new errors.NotFound({
        message: 'Viewer not found',
        data: {
          viewerId
        }
      });
    }

    const ownerOrgId = _.get(viewers, 'records[0].ownerOrganizationId');
    const orgAccess = await serviceContext.dal.admin.allowedToUpdateOrganization(
      context,
      ownerOrgId
    );

    if (!orgAccess) {
      throw new errors.NotAllowed({
        message: 'You do not have permission to update this viewer',
        data: {
          viewerId,
          ownerOrgId
        }
      });
    }

    let viewerBuild;
    try {
      viewerBuild = await getApplicationViewerBuilds(context, { viewerId });
      viewerBuild = _.get(viewerBuild, 'records[0]');
    } catch (e) {
      throw new errors.NotFound({
        message:
          'Error was thrown while attempting to retreive the list of Application Viewer Builds',
        data: {
          viewerId
        }
      });
    }

    if (!viewerBuild) {
      throw new errors.NotFound({
        message: 'Application Viewer Build not found',
        data: {
          viewerId
        }
      });
    }

    const updatedValues = _.merge(viewers.records[0], args.input);

    let sql;
    let values;
    try {
      const {
        sql: _sql,
        values: _values
      } = await _updateApplicationViewerQuery(updatedValues, context);
      sql = _sql;
      values = _values;
    } catch (e) {
      throw new errors.NotFound({
        message:
          'Error was thrown while attempting to generate SQL Query for updating Application Viewer',
        data: {
          viewerId
        }
      });
    }

    let updatedViewer;
    try {
      updatedViewer = await serviceContext.dbConnections['core'].write.map(
        sql,
        values,
        mapper.camelizeRootKeys
      );
    } catch (e) {
      throw new errors.NotFound({
        message:
          'Error was thrown while attempting to update Application Viewer table',
        data: {
          viewerId
        }
      });
    }

    updatedViewer = _.get(updatedViewer, '0');

    // Create a new viewer build with an incremented version number
    const viewerBuildInput = {
      viewerBuildId: viewerBuild.viewerBuildId,
      viewerId,
      version: viewerBuild.version + 1,
      sourceUrl: viewerBuild.sourceUrl,
      accessUrl: viewerBuild.accessUrl,
      status: viewerBuild.status,
      organizationId: _.get(viewers, 'records[0].ownerOrganizationId')
    };

    try {
      const _updatedViewerBuild = await createApplicationViewerBuild(
        { input: viewerBuildInput },
        context
      );
    } catch (e) {
      throw new errors.NotFound({
        message:
          'Error was thrown while attempting to create a new Application Viewer Build',
        data: {
          viewerId
        }
      });
    }

    return updatedViewer;
  }

  async function _updateApplicationViewerQuery(input, context) {
    const { name, description, icon, viewerId, isPublic } = input;

    const columnData = {
      name,
      description,
      icon,
      is_public: isPublic,
      date_modified: moment.utc().toISOString(),
      modified_by:
        _.get(context, '_authInfo.userId') ||
        '00000000-0000-0000-0000-000000000000'
    };

    const selectData = {
      viewer_id: 'id',
      name: null,
      description: null,
      icon: null,
      owner_organization_id: null,
      mimetype: null,
      viewer_type: null,
      date_modified: null,
      date_created: null,
      modified_by: null,
      created_by: null,
      is_public: null
    };

    const { sql, values } = mainUtil.makeUpdateSql(
      'job_new.viewer',
      columnData,
      selectData,
      `viewer_id = '${viewerId}'`
    );

    return { sql, values };
  }

  async function deleteApplicationViewer(args, context) {
    const { viewerId } = args;
    const viewers = await getApplicationViewers(context, {
      ids: [viewerId],
      allOrgs: true
    });

    if (_.isEmpty(viewers.records)) {
      throw new errors.NotFound({
        message: 'Viewer not found',
        data: {
          viewerId
        }
      });
    }

    const ownerOrgId = _.get(viewers, 'records[0].ownerOrganizationId');
    const orgAccess = await serviceContext.dal.admin.allowedToUpdateOrganization(
      context,
      ownerOrgId
    );

    if (!orgAccess) {
      throw new errors.NotAllowed({
        message: 'You do not have permission to delete this viewer',
        data: {
          viewerId,
          ownerOrgId
        }
      });
    }

    const viewer = _.get(viewers, 'records[0]');

    const deleteSql = `
WITH deleted_viewer_build AS (
    DELETE FROM job_new.viewer_build
    WHERE viewer_id = $1
    RETURNING viewer_id
)
DELETE FROM job_new.viewer
WHERE viewer_id = $1
RETURNING viewer_id AS id`;

    const queryArgs = [viewerId];

    let deleted;
    try {
      deleted = await serviceContext.dbConnections['core'].write.query(
        deleteSql,
        queryArgs
      );
    } catch (e) {
      throw new errors.ServiceFailure({
        message: 'Error was thrown while attempting to delete Viewer Build',
        data: {
          viewerId
        }
      });
    }

    if (deleted.length !== 1) {
      throw new errors.ServiceFailure({
        message: 'Error viewer was not deleted',
        data: {
          viewerId
        }
      });
    }

    return viewer;
  }

  async function deleteApplicationViewerBuild(args, context) {
    const { viewerBuildId } = args;
    let viewerBuild = await getApplicationViewerBuilds(context, {
      viewerBuildId
    });

    if (_.isEmpty(viewerBuild.records)) {
      throw new errors.NotFound({
        message: 'Viewer build not found',
        data: {
          viewerBuildId
        }
      });
    }

    viewerBuild = _.get(viewerBuild, 'records[0]');

    const sql = `DELETE FROM
     job_new.viewer_build
      WHERE viewer_build_id = $1 
      RETURNING viewer_build_id as id;
    `;

    const queryArgs = [viewerBuildId];

    const _deleted = await serviceContext.dbConnections['core'].write.query(
      sql,
      queryArgs
    );

    return viewerBuild;
  }
  return {
    getApplicationViewers,
    _getApplicationViewersQuery,
    getApplicationViewerBuilds,
    _getApplicationViewerBuildsQuery,
    createApplicationViewer,
    _createApplicationViewerQuery,
    createApplicationViewerBuild,
    _createApplicationViewerBuildQuery,
    updateApplicationViewer,
    _updateApplicationViewerQuery,
    deleteApplicationViewer,
    deleteApplicationViewerBuild
  };
};
