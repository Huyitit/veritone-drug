'use strict';

const _ = require('lodash');

module.exports = function init(app, model, pools) {
  const schema = 'job_new';
  const selectEngineCategory = `
    ec.engine_category_id, ec.engine_category_name, ec.engine_category_description, ec.icon_class,
    ec.editable, ec.video_only, ec.order, ec.elastic,
    ec.search, ec.data_field, ec.created_date, ec.updated_date,
    ec.library_identifier_types, ec.dependencies, ec.engine_type_id`;

  return {
    getEngineCategory: getEngineCategory
  };

  async function getEngineCategory(engineCategoryId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    let sql = `
      SELECT
        ${selectEngineCategory}, et.engine_type_name
      FROM
        ${schema}.engine_category ec
      JOIN ${schema}.engine_type et
      ON
        ec.engine_type_id = et.engine_type_id
      WHERE
        ec.engine_category_id = $1`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, [engineCategoryId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const engine = model.EngineCategory.fromDB(dbResult[0]);
        callback(null, engine);
      })
      .catch((err) => callback(err, null));
  }
};
