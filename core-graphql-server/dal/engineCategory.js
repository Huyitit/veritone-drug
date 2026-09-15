const _ = require('lodash');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { v5: uuidv5 } = require('uuid');
const uuidNamespace = 'b61091ee-1e70-45e1-b2c3-475177e8289d';
const stringify = require('json-stable-stringify');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const engineCategoryListCache = serviceContext.engineCategoryListCache;
  const errors = require('../error')(config);
  const NotFound = errors.NotFound;
  const InvalidInput = errors.InvalidInput;
  const util = require('./util.js')(config, serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const mapper = require('./mapper.js');
  const jobTable = 'job_new';
  const logger = serviceContext.logger;

  async function getEngineCategory(context, options, ignoreNotFound) {
    if (!options.id) {
      throw new Error('id param is required'); // server bug
    }
    const cats = await getEngineCategories(context, options);
    // We need to not throw errors when it's a sub-query of engines
    // with search category engine such as mention-generate
    if (!cats.count) {
      if (!ignoreNotFound) {
        throw new errors.NotFound({
          data: {
            objectId: options.id,
            objectType: 'EngineCategory'
          }
        });
      } else {
        return null; // yuck
      }
    }
    return cats.records[0];
  }

  async function getEngineCategories(context, options) {
    const key =
      'getEngineCategories-' + uuidv5(stringify(options), uuidNamespace);
    let res = engineCategoryListCache.get(key);
    if (!res) {
      res = await getEngineCategoriesDb(context, options);
      engineCategoryListCache.set(key, res);
      logger.debug(
        'cache MISS on engine categories for ' +
          options.organizationId +
          ' ' +
          options.offset
      );
    } else {
      logger.debug(
        'cache HIT on engines for ' +
          options.organizationId +
          ' ' +
          options.offset
      );
    }

    return res;
  }

  async function getEngineCategoriesDb(context, options) {
    if (!options) options = {};
    const id = options.id;
    const name = options.name;
    const type = options.type;
    const requesterOrg = _.get(context._authInfo, 'organization');
    const requesterOrgId = _.get(requesterOrg, 'organizationId');
    const orgId = options.organizationId || requesterOrgId;
    const useEngineGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      requesterOrg,
      requesterOrgId,
      ['enablePackageGrantLogic', 'useEngineGrant']
    );
    const where = [];
    const engineWhere = [];
    const args = [];
    let idSet = new Set();

    if (!_.isEmpty(options.ids)) {
      idSet = new Set(options.ids);
    }

    if (id) {
      idSet.add(id);
    }

    // filter multiple engineCategoryIds
    if (idSet.size) {
      args.push(Array.from(idSet));
      where.push(`ec.engine_category_id = ANY($${args.length}::text[])`);
      engineWhere.push(`e1.engine_category_id = ANY($${args.length}::text[])`);
    }
    let cteSql = '';

    if (useEngineGrant) {
      // get package grants
      const packageGrants = await serviceContext.dal.packages.getPackageGrants(
        context,
        {
          orgId
        }
      );
      const packageIds = _.map(
        _.filter(packageGrants.records, { grantType: 'GRANT' }),
        'packageId'
      );
      const sqlPackageGrantOR = [
        `e1.owner_organization_id = $${args.push(orgId)}`
      ];

      if (!_.isEmpty(packageIds)) {
        sqlPackageGrantOR.push(
          `pr.package_id = ANY($${args.push(packageIds)}::uuid[])`
        );
      }

      engineWhere.push(`(${sqlPackageGrantOR.join(' OR ')})`);

      cteSql = `
        WITH allowedEngines AS (
          SELECT 
            e1.engine_id,
            e1.engine_category_id,
            e1.engine_alias_id,
            e1.order
          FROM job_new.engine e1 
          INNER JOIN aiware.package__resource pr ON e1.engine_id = pr.resource_id 
          WHERE pr.resource_type = 'engine'::aiware.aiw_package_resource_enum 
            ${engineWhere.length ? `AND ${engineWhere.join(' AND ')}` : ''}
        )
      `;
    }

    let sql = `
      ${cteSql}
			SELECT
				ec.engine_category_id AS id,
        ec.engine_category_name AS name,
        ec.engine_category_description AS description,
        ec.icon_class,
        ec.editable,
        ec.video_only,
        ec.order,
        ec.elastic,
        ec.search,
        ec.dependencies,
        ec.data_field,
        ec.color,
        ec.created_date AS created_date_time,
        ec.updated_date AS modified_date_time,
        ec.library_identifier_types,
        ec.export_formats,
        array_agg(e.engine_id ORDER BY e.order ASC) AS engine_ids,
        array_agg(e.engine_alias_id ORDER BY e.order ASC) AS engine_alias_ids,
        ec.library_identifier_types,
        et.engine_type_name AS type_name,
        et.engine_type_description AS type_description,
        et.engine_type_id as type_id,
        ecls.engine_class_id as class_id,
        ecls.engine_class_name as class_name,
        ecls.engine_class_description as class_description,
        ecls.icon_class as engine_class_icon
			FROM
        ${jobTable}.engine_category ec
        ${
          cteSql
            ? ` INNER JOIN allowedEngines AS e `
            : ` LEFT OUTER JOIN ${jobTable}.engine e `
        }
          ON e.engine_category_id = ec.engine_category_id
        LEFT OUTER JOIN ${jobTable}.engine_type et
          ON ec.engine_type_id = et.engine_type_id
        LEFT OUTER JOIN ${jobTable}.engine_class ecls
          ON ec.engine_class_id = ecls.engine_class_id
      `;

    if (options.cognitiveOnly) {
      where.push("ec.engine_category_name NOT IN('Search', 'Ingestion')");
    }

    if (name) {
      args.push('%' + mainUtil.sqlEscapeForLIKE(name) + '%');
      where.push(`ec.engine_category_name ILIKE $${args.length}`);
    }
    if (type) {
      args.push(type.toLowerCase());
      where.push(`LOWER(et.engine_type_name) = $${args.length}`);
    }

    // this search option is only used by core-graphql-server
    // internally and is not currently exposed in the API
    if (options.categoryKey) {
      args.push(options.categoryKey);
      where.push(`ec.data_field = \$${args.length}`);
    }

    if (options.validationContract) {
      where.push(
        `ec.validation_contract ILIKE '${options.validationContract}'`
      );
    }

    // use engine category blacklist when useEngineGrant is disabled
    if (!useEngineGrant && options.organizationId) {
      args.push(options.organizationId);
      where.push(
        `ec.engine_category_id NOT IN (select engine_category_id from ${jobTable}.organization__engine_category_blacklist WHERE organization_id = \$${args.length})`
      );
    }
    if (where.length) sql += '\nWHERE ' + where.join(' AND ') + '\n';
    sql +=
      ' GROUP BY et.engine_type_id, ecls.engine_class_id, ec.engine_category_id ';
    sql += ' ORDER BY ec.order ';

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit || 30}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset || 0} `;
    }

    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapEngineCategory
    );
    return mainUtil.toPage(options, rows);
  }

  return {
    getEngineCategory,
    getEngineCategories,
    getEngineCategoriesDb
  };
};
