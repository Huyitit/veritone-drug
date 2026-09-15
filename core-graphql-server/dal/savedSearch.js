const uuid = require('uuid');
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const InvalidInput = errors.InvalidInput;
  const dalUtil = require('./util.js')(config, serviceContext);
  const mapper = require('./mapper.js');
  const mainUtil = require('../util.js')(serviceContext);

  async function dbCreateSavedSearch(savedSearch) {
    const sql = `INSERT INTO saved_search_profile
      (id, user_id, org_id, name, csp, shared_with_org)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    RETURNING
      id, user_id, org_id, name, csp, shared_with_org, created_at, updated_at`;

    const args = [
      savedSearch.id,
      savedSearch.userId,
      savedSearch.orgId,
      savedSearch.name,
      savedSearch.csp,
      savedSearch.sharedWithOrg
    ];

    const newSavedSearch = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(sql, args);

    return mapper.mapSavedSearch(newSavedSearch[0]);
  }
  function checkSavedSearchConflict({ userId, name }) {
    const sql = `SELECT
        a.id
      FROM
        saved_search_profile a
      WHERE
        a.user_id = $1
      AND
        a.name = $2
      AND
        a.deleted_at IS NULL
    `;

    return serviceContext.dbConnections['media_platform'].read
      .query(sql, [userId, name])
      .then(function (rows) {
        return rows[0];
      });
  }

  function dbGetSavedSearch(options) {
    let sql = `SELECT
        a.id,
        a.org_id,
        a.user_id,
        a.name,
        a.csp,
        a.shared_with_org,
        a.created_at,
        a.updated_at
      FROM
        saved_search_profile a`;
    let sqlWhere = [];
    let sqlParams = [];

    sqlWhere.push('a.deleted_at is null');
    sqlParams.push(options.orgId);
    sqlWhere.push(`a.org_id = \$${sqlParams.length}`);

    if (options.includeShared === true) {
      sqlParams.push(options.userId);
      sqlWhere.push(
        `(shared_with_org = true and user_id != \$${sqlParams.length})`
      );
    } else {
      sqlParams.push(options.userId);
      sqlWhere.push(`a.user_id = \$${sqlParams.length}`);
    }

    if (options.filterByName) {
      mainUtil.makeLikeClause(
        'a.name',
        options.filterByName,
        sqlWhere,
        sqlParams,
        'contains',
        true
      );
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    if (options.orderBy) {
      let columnOrderBy = 'a.user_id';

      switch (options.orderBy) {
        case 'name':
          columnOrderBy = 'a.name';
          break;
        case 'createdDateTime':
          columnOrderBy = 'a.created_at';
          break;
        case 'sharedWithOrganization':
          columnOrderBy = 'a.shared_with_org';
          break;
      }

      sql += ` ORDER BY ${columnOrderBy} ${
        options.orderDirection ? options.orderDirection : ''
      }`;
    } else {
      sql += ' ORDER BY a.user_id';
    }

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    return serviceContext.dbConnections['media_platform'].read
      .map(sql, sqlParams, function (row) {
        return mapper.mapSavedSearch(row);
      })
      .then(function (rows) {
        return {
          records: rows,
          limit: options.limit,
          offset: options.offset,
          count: rows.length
        };
      });
  }

  async function createSavedSearch(args, context) {
    const input = args.input;
    const userInfo = _.get(context, 'requestContext.userInfo');

    const savedSearch = {
      id: uuid.v4(),
      userId: userInfo.userId,
      orgId: _.get(userInfo, 'organization.organizationId'),
      name: input.name,
      csp: input.csp,
      sharedWithOrg: input.sharedWithOrganization
    };

    const hasConflict = await checkSavedSearchConflict({
      userId: userInfo.userId,
      name: input.name
    });

    if (hasConflict) {
      throw new InvalidInput({
        message:
          'The request input did not pass validation checks. See the data section for detail on validation errors.',
        data: {
          validationErrors: [
            {
              fieldName: 'savedSearchName',
              fieldValue: input.name,
              message: 'An saved search with this name already exists',
              duplicateId: hasConflict.id
            }
          ]
        }
      });
    }

    return dbCreateSavedSearch(savedSearch);
  }

  function getSavedSearch(context, input) {
    let orgId = _.get(
      context,
      'requestContext.userInfo.organization.organizationId'
    );
    let userId = _.get(context, 'requestContext.userInfo.userId');

    return dbGetSavedSearch({
      ...input,
      orgId,
      userId
    });
  }

  async function dbDeleteSavedSearch(options) {
    const sql = `UPDATE saved_search_profile
    SET deleted_at = current_timestamp
    WHERE id = $1
      and org_id = $2
      and user_id = $3
      and deleted_at is null
    RETURNING id`;

    const args = [options.id, options.orgId, options.userId];

    const deletedSavedSearch = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(sql, args);

    return deletedSavedSearch[0];
  }

  function deleteSavedSearch(args, context) {
    const orgId = _.get(
      context,
      'requestContext.userInfo.organization.organizationId'
    );
    const userId = _.get(context, 'requestContext.userInfo.userId');

    return dbDeleteSavedSearch({
      id: args.id,
      orgId,
      userId
    });
  }

  async function replaceSavedSearch(args, context) {
    const input = args.input;
    const userInfo = _.get(context, 'requestContext.userInfo');
    const orgId = _.get(userInfo, 'organization.organizationId');

    const replaceSavedSearch = {
      id: uuid.v4(),
      userId: userInfo.userId,
      orgId,
      name: input.name,
      csp: input.csp,
      sharedWithOrg: input.sharedWithOrganization
    };

    const deletedSavedSearch = await dbDeleteSavedSearch({
      id: input.id,
      orgId,
      userId: userInfo.userId
    });

    if (deletedSavedSearch) {
      return dbCreateSavedSearch(replaceSavedSearch);
    }
    return null;
  }

  return {
    createSavedSearch,
    getSavedSearch,
    deleteSavedSearch,
    replaceSavedSearch
  };
};
