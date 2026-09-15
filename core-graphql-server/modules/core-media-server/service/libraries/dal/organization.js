'use strict';

const model = require('../model');

module.exports = function init(conn, paging) {
  if (!conn) {
    throw new Error('conn is required');
  }

  if (!paging) {
    throw new Error('paging is required');
  }

  const dal = Object.create(require('./common')(conn));

  Object.assign(dal, {
    getOrganizations
  });

  return dal;

  /**
   * Fetches a list of organizations
   * @param {Object} [params={}]: an object containing query parameters
   * @return {Promise} a promise that resolves with a result object or rejects with an error message
   */
  function getOrganizations(params = {}) {
    paging.enforceParams(params);

    const where = [];
    const values = [];

    let sql = `SELECT
				kvp ->> 'organizationId' AS organization_id,
				COALESCE(kvp ->> 'organizationName', group_name) AS organization_name,
				COUNT(*) OVER() AS total
			FROM sso_group`;

    if (params.organizationId && params.organizationId.length) {
      values.push(params.organizationId);

      Array.isArray(params.organizationId)
        ? where.push(`kvp ->> 'organizationId' = ANY($1::text[])`)
        : where.push(`kvp ->> 'organizationId' = $1`);
    }

    if (where.length) {
      sql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    sql += `
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    return dal
      .query(conn.read, sql, values)
      .then(function resolveQuery(result) {
        const orgs = result.map(model.Organization.fromDB);
        let totalResults = 0;

        if (result && result.length) {
          totalResults = +result[0].total || 0;
        }

        return paging.toPaginationEnvelope(orgs, params.offset, totalResults);
      });
  }
};
