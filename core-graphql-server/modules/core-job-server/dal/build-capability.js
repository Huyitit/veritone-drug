'use strict';

const _ = require('lodash'),
  uuid = require('uuid');

module.exports = function init(app, model, pools) {
  const jobTable = 'job_new';

  return {
    addBuildCapabilities
  };

  async function addBuildCapabilities(
    buildId,
    capabilities,
    dbClient,
    callback
  ) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    if (!_.isArray(capabilities) || _.isEmpty(capabilities)) {
      throw new Error('missing capabilities');
    }

    const sqlParams = [buildId];
    const valuesClause = [];

    _.forEach(capabilities, function addParams(capability) {
      valuesClause.push(
        `($${sqlParams.push(uuid.v4())}::uuid, $${sqlParams.push(
          capability.key
        )}, $${sqlParams.push(capability.value)})`
      );
    });

    const sql = `
      WITH input_rows (build_capability_id, build_capability_key, build_capability_value) AS (
        VALUES ${valuesClause.join(',')}
      ), ins AS (
        INSERT INTO ${jobTable}.build_capability (build_capability_id, build_capability_key, build_capability_value)
        SELECT * FROM input_rows
        ON CONFLICT (build_capability_key, build_capability_value) DO NOTHING
        RETURNING build_capability_id
      )
      INSERT INTO ${jobTable}.build__build_capability (build_id, build_capability_id)
      SELECT $1, build_capability_id from ins
      UNION ALL
      SELECT $1, bc.build_capability_id from input_rows
      JOIN ${jobTable}.build_capability bc using (build_capability_key, build_capability_value)
      ON CONFLICT (build_id, build_capability_id) DO NOTHING
      RETURNING *`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, sqlParams)
      .then((dbResult) => {
        const payload = {
          totalResults: dbResult.length
        };
        callback(null, payload);
      })
      .catch((err) => callback(err, null));
  }
};
