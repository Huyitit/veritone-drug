const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const mapper = require('../dal/mapper');
const moment = require('moment');

const registrationConfigTableName =
  'public.organization_registration_configuration';
const registrationFilesTableName = 'public.organization_registration_files';
const domainSettingsTableName =
  'public.organization_registration_domain_settings';
const uiSettingsTableName = 'public.organization_registration_ui_settings';

module.exports = function createFunction(serviceContext) {
  const { config, logger } = serviceContext;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);

  const dbRead = serviceContext.dbConnections['sso'].read;
  const dbWrite = serviceContext.dbConnections['sso'].write;

  const FALLBACK_USER_ID = '00000000-0000-0000-0000-000000000000';

  function getUserId(context) {
    return _.get(context, '_authInfo.userId', FALLBACK_USER_ID);
  }

  // Column definitions for the registration configuration table
  const registrationConfigColumns = {
    registration_configuration_id: 'id',
    organization_guid: null,
    name: null,
    slug: null,
    open_registration_status: null,
    admin_approval_required: null,
    created_by: null,
    modified_by: null,
    date_created: null,
    date_modified: null
  };

  const registrationFileColumns = {
    id: null,
    registration_configuration_id: null,
    name: null,
    uri: 'url',
    type: null,
    status: null
  };

  const domainSettingsColumns = {
    registration_configuration_id: null,
    domain_name: null,
    auth_group_id: null,
    application_role_ids: null
  };

  const uiSettingsColumns = {
    registration_configuration_id: null,
    logo: null,
    custom_registration_fields: null,
    registration_button_style: null,
    veritone_branding: null,
    created_by: null,
    modified_by: null
  };

  async function createRegistrationConfiguration(context, input) {
    // Start a transaction
    return await dbWrite.tx('createRegistrationConfig', async (t) => {
      // Step 1: Insert registration configuration
      const registrationResult = await _insertRegistrationConfig(
        context,
        input,
        t
      );
      if (!registrationResult) {
        throw new Error('Failed to create registration configuration.');
      }

      // Step 2: Insert registration files
      if (input.files) {
        registrationResult.files = await _insertRegistrationFiles(
          context,
          input.files,
          registrationResult.id,
          t
        );
      }

      // Step 3: Insert domain settings
      if (input.domainSettings) {
        registrationResult.domainSettings = await _insertDomainSettings(
          context,
          input.domainSettings,
          registrationResult.id,
          t
        );
      }

      // Step 4: Insert UI settings
      if (input.uiSettings) {
        registrationResult.uiSettings = await _insertOrUpdateRegistrationUiSettings(
          context,
          input.uiSettings,
          registrationResult.id,
          t
        );
      }

      // Return the final result after all operations in the transaction succeed
      return registrationResult;
    });
  }

  async function updateRegistrationConfiguration(context, input) {
    return await dbWrite.tx('updateRegistrationConfig', async (t) => {
      // Step 1: Insert registration configuration
      const registrationResult = await _updateRegistrationConfig(
        context,
        input,
        t
      );
      if (!registrationResult) {
        throw new Error('Failed to update registration configuration.');
      }

      // Step 2: Update registration files
      if (input.files) {
        registrationResult.files = await _updateRegistrationFiles(
          context,
          input.files,
          registrationResult.id,
          t
        );
      }

      // // Step 3: Update domain settings
      if (input.domainSettings) {
        registrationResult.domainSettings = await _updateDomainSettings(
          context,
          input.domainSettings,
          registrationResult.id,
          t
        );
      }

      // // Step 4: Update UI settings
      if (input.uiSettings) {
        registrationResult.uiSettings = await _insertOrUpdateRegistrationUiSettings(
          context,
          input.uiSettings,
          registrationResult.id,
          t
        );
      }

      return registrationResult;
    });
  }

  async function deleteRegistrationConfiguration(context, args) {
    return await dbWrite.tx('deleteRegistrationConfig', async (t) => {
      // Remove relational data first to avoid foreign key constraint errors if ever added
      const { id } = args;

      // Step 1: Delete registration files
      const deleteFilesSql = `DELETE FROM ${registrationFilesTableName} WHERE registration_configuration_id = $1`;
      await t.none(deleteFilesSql, [id]);

      // Step 2: Delete domain settings
      const deleteDomainSql = `DELETE FROM ${domainSettingsTableName} WHERE registration_configuration_id = $1`;
      await t.none(deleteDomainSql, [id]);

      // Step 3: Delete UI settings
      const deleteUiSql = `DELETE FROM ${uiSettingsTableName} WHERE registration_configuration_id = $1`;
      await t.none(deleteUiSql, [id]);

      // Step 4: Delete registration configuration
      const deleteSql = `DELETE FROM ${registrationConfigTableName} WHERE registration_configuration_id = $1`;
      await t.none(deleteSql, [id]);

      return {
        id,
        message: `Registration Configuration ${id} has been deleted`
      };
    });
  }

  async function _registrationConfigurationPrefetch(
    context,
    registrationConfigId
  ) {
    const findSql = `SELECT organization_guid FROM ${registrationConfigTableName} orc WHERE registration_configuration_id = $1`;
    const values = [registrationConfigId];

    const dbResult = await dbRead.query(findSql, values);
    if (_.isArray(dbResult) && dbResult.length > 0) {
      return dbResult[0]['organization_guid'];
    }

    return null;
  }

  async function _registrationUiSettingsExists(context, registrationConfigId) {
    const findSql = `SELECT EXISTS(SELECT 1 FROM ${uiSettingsTableName} orc WHERE registration_configuration_id = $1 LIMIT 1) AS "exists"`;
    const values = [registrationConfigId];

    return await dbRead.query(findSql, values).then((dbResult) => {
      if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
        return false;
      }
      return _.get(dbResult, '[0].exists');
    });
  }

  // Helper function to get column data for registration configuration
  function _getRegistrationConfigColumnData(context, inputConfig) {
    const {
      id,
      name,
      slug,
      openRegistrationStatus,
      adminApprovalRequired,
      organizationGuid
    } = inputConfig;

    return {
      registration_configuration_id: id ?? uuidv4(),
      organization_guid: organizationGuid,
      name,
      slug: slug,
      open_registration_status: openRegistrationStatus,
      admin_approval_required: adminApprovalRequired,
      created_by: getUserId(context),
      modified_by: getUserId(context)
    };
  }

  async function _insertRegistrationConfig(context, input, t) {
    const registrationConfigData = _getRegistrationConfigColumnData(
      context,
      input
    );

    const { sql, values } = mainUtil.makeInsertSql(
      registrationConfigTableName,
      registrationConfigData,
      registrationConfigColumns
    );

    try {
      return await t.oneOrNone(sql, values, mapper.camelizeRootKeys);
    } catch (error) {
      if (error.code === '23505' && error.detail.includes('slug')) {
        throw new errors.ResourceConflict({
          message: 'Slug already exists',
          data: {
            slug: registrationConfigData.slug
          }
        });
      }
      // Handle or rethrow other errors as necessary
      throw error;
    }
  }

  async function _insertRegistrationFiles(context, files, registrationId, t) {
    const filePromises = files.map((file) => {
      const fileData = {
        id: uuidv4(),
        registration_configuration_id: registrationId,
        name: file.name,
        uri: file.url,
        type: _.snakeCase(file.type),
        status: 'active',
        created_by: getUserId(context),
        modified_by: getUserId(context)
      };

      const { sql, values } = mainUtil.makeInsertSql(
        registrationFilesTableName,
        fileData,
        registrationFileColumns
      );

      return t.oneOrNone(sql, values, mapper.camelizeRootKeys);
    });

    return await Promise.all(filePromises);
  }

  async function _insertDomainSettings(
    context,
    domainSettings,
    registrationId,
    t
  ) {
    const domainPromises = domainSettings.map((setting) => {
      const domainData = {
        registration_configuration_id: registrationId,
        domain_name: setting.domainName,
        auth_group_id: setting.authGroupId,
        application_role_ids: setting.applicationRoleIds,
        created_by: getUserId(context),
        modified_by: getUserId(context)
      };

      const { sql, values } = mainUtil.makeInsertSql(
        domainSettingsTableName,
        domainData,
        domainSettingsColumns
      );

      return t.oneOrNone(sql, values, mapper.camelizeRootKeys);
    });

    return await Promise.all(domainPromises);
  }

  async function _insertOrUpdateRegistrationUiSettings(
    context,
    uiSettings,
    registrationId,
    t
  ) {
    const uiData = {
      registration_configuration_id: registrationId,
      logo: uiSettings.logo,
      custom_registration_fields: JSON.stringify(
        uiSettings.customRegistrationFields
      ),
      registration_button_style: JSON.stringify(
        uiSettings.registrationButtonStyle
      ),
      veritone_branding: uiSettings.veritoneBranding,
      modified_by: getUserId(context)
    };

    const found = await _registrationUiSettingsExists(context, registrationId);

    if (found) {
      uiData['date_modified'] = moment.utc().toISOString();
      const { sql, values } = mainUtil.makeUpdateSql(
        uiSettingsTableName,
        uiData,
        uiSettingsColumns,
        `registration_configuration_id = $1`
      );

      return await t.oneOrNone(sql, values, mapper.camelizeRootKeys); // Use the transaction 't'
    } else {
      uiData['created_by'] = getUserId(context);

      const { sql, values } = mainUtil.makeInsertSql(
        uiSettingsTableName,
        uiData,
        uiSettingsColumns
      );

      return await t.oneOrNone(sql, values, mapper.camelizeRootKeys); // Use the transaction 't'
    }
  }

  async function _updateRegistrationConfig(context, input, t) {
    const registrationConfigData = _getRegistrationConfigColumnData(
      context,
      input
    );

    delete registrationConfigData.created_by;
    registrationConfigData.date_modified = moment.utc().toISOString();

    const { sql, values } = mainUtil.makeUpdateSql(
      registrationConfigTableName,
      registrationConfigData,
      registrationConfigColumns,
      `registration_configuration_id = $1`
    );

    try {
      return await t.oneOrNone(sql, values, mapper.camelizeRootKeys);
    } catch (error) {
      if (error.code === '23505' && error.detail.includes('slug')) {
        throw new errors.ResourceConflict({
          message: 'Slug already exists',
          data: {
            slug: registrationConfigData.slug
          }
        });
      }
      // Handle or rethrow other errors as necessary
      throw error;
    }
  }

  async function _updateRegistrationFiles(context, files, registrationId, t) {
    const existingFiles = await t.query(
      `SELECT * FROM ${registrationFilesTableName} WHERE registration_configuration_id = $1`,
      [registrationId]
    );

    const filePromises = files.map((file) => {
      const existingFileByStatus = existingFiles.find(
        (f) =>
          f.uri === file.url &&
          f.type === _.snakeCase(file.type) &&
          f.status === (file.status ?? 'active')
      );

      if (existingFileByStatus) {
        return;
      }

      const existingFile = existingFiles.find(
        (f) => f.uri === file.url && f.type === _.snakeCase(file.type)
      );
      const existingActiveFileByType = existingFiles.find(
        (f) =>
          f.uri !== file.url &&
          f.type === _.snakeCase(file.type) &&
          f.status === 'active'
      );

      // If an active file of the same type exists and is not matching the new file, make it inactive
      if (existingActiveFileByType && !existingFile) {
        t.none(
          `UPDATE ${registrationFilesTableName} SET status = 'inactive' WHERE id = $1 `,
          [existingActiveFileByType.id]
        );
      }

      const fileData = {
        id: existingFile?.id,
        registration_configuration_id: registrationId,
        name: file.name,
        uri: file.url,
        type: _.snakeCase(file.type),
        status: file.status ?? 'active',
        created_by: existingFile?.created_by ?? getUserId(context),
        date_modified: moment.utc().toISOString(),
        modified_by: getUserId(context)
      };

      if (!fileData.id) {
        fileData.id = uuidv4();

        const { sql, values } = mainUtil.makeInsertSql(
          registrationFilesTableName,
          fileData,
          registrationFileColumns
        );

        return t.oneOrNone(sql, values, mapper.camelizeRootKeys);
      } else {
        const { sql, values } = mainUtil.makeUpdateSql(
          registrationFilesTableName,
          fileData,
          registrationFileColumns,
          `id = $1`
        );

        return t.oneOrNone(sql, values, mapper.camelizeRootKeys);
      }
    });

    return await Promise.all(filePromises);
  }

  async function _updateDomainSettings(
    context,
    domainSettings,
    registrationId,
    t
  ) {
    await t.none(
      `DELETE FROM ${domainSettingsTableName} WHERE registration_configuration_id = $1`,
      [registrationId]
    );

    const domainPromises = domainSettings.map((setting) => {
      const domainData = {
        registration_configuration_id: registrationId,
        domain_name: setting.domainName,
        auth_group_id: setting.authGroupId,
        application_role_ids: setting.applicationRoleIds,
        created_by: getUserId(context),
        modified_by: getUserId(context)
      };

      const { sql, values } = mainUtil.makeInsertSql(
        domainSettingsTableName,
        domainData,
        domainSettingsColumns
      );

      return t.oneOrNone(sql, values, mapper.camelizeRootKeys);
    });

    return await Promise.all(domainPromises);
  }

  async function getRegistrationConfigurations(args) {
    const where = [];
    const values = [];
    const limit = args.limit || 30;
    const offset = args.offset || 0;

    if (args.organizationGuid) {
      mainUtil.addSqlWhere(
        'organization_guid',
        args.organizationGuid,
        where,
        values
      );
    }

    if (args.id) {
      mainUtil.addSqlWhere(
        'registration_configuration_id',
        args.id,
        where,
        values
      );
    } else if (args.slug) {
      mainUtil.addSqlWhere('slug', args.slug, where, values);
    }

    const selectColumns = mainUtil.makeSelectClause(registrationConfigColumns);

    let sql = `
      SELECT
        ${selectColumns}
      FROM
        ${registrationConfigTableName}
    `;

    if (where.length) {
      sql += '\nWHERE ' + where.join(' AND ') + '\n';
    }

    sql += ' ORDER BY date_created ';

    if (Number.isInteger(offset)) {
      values.push(offset);
      sql += ` OFFSET \$${values.length}`;
    }

    if (Number.isInteger(limit)) {
      values.push(limit);
      sql += ` LIMIT \$${values.length}`;
    }

    try {
      const results = await dbRead.map(sql, values, mapper.camelizeRootKeys);
      return mainUtil.toPage({ limit, offset }, results);
    } catch (e) {
      logger.error('Error getting registration configurations', e);
      throw new errors.InternalServerError({
        message: 'Error getting registration configurations'
      });
    }
  }

  async function getDomainSettings(args) {
    const where = [];
    const values = [];

    if (args.registrationConfigurationId) {
      mainUtil.addSqlWhere(
        'registration_configuration_id',
        args.registrationConfigurationId,
        where,
        values
      );
    }

    const selectColumns = mainUtil.makeSelectClause(domainSettingsColumns);

    let sql = `
      SELECT
        ${selectColumns}
      FROM
        ${domainSettingsTableName}
      WHERE
         ${where.join(' AND ')}
    `;

    try {
      return await dbRead.map(sql, values, mapper.camelizeRootKeys);
    } catch (e) {
      logger.error('Error getting registration domain settings', e);
      throw new errors.InternalServerError({
        message: 'Error getting registration domain settings'
      });
    }
  }

  async function getRegistrationUiSettings(args) {
    const where = [];
    const values = [];

    if (args.registrationConfigurationId) {
      mainUtil.addSqlWhere(
        'registration_configuration_id',
        args.registrationConfigurationId,
        where,
        values
      );
    }

    const selectColumns = mainUtil.makeSelectClause(uiSettingsColumns);

    let sql = `
      SELECT
        ${selectColumns}
      FROM
        ${uiSettingsTableName}
      WHERE
         ${where.join(' AND ')}
    `;

    try {
      return await dbRead.one(sql, values, mapper.camelizeRootKeys);
    } catch (e) {
      logger.error('Error getting registration UI settings', e);
      throw new errors.InternalServerError({
        message: 'Error getting registration UI settings'
      });
    }
  }

  /**
   * Reads the registration files for a configuration.
   *
   * `status` is optional: the public `registrationConfigurationInfo` resolver passes `'active'`,
   * while the admin-facing `registrationConfiguration` resolver omits it and keeps seeing superseded
   * files.
   *
   * Rows come back most recently modified first, so a caller taking the first match of a type
   * resolves deterministically. `date_modified` leads rather than `date_created` because
   * `_updateRegistrationFiles` reuses any row whose uri and type already match: reactivating a
   * superseded document keeps that row's original `date_created`. Both columns default to NOW(), so
   * a batch insert can tie on either and `id` breaks it.
   *
   * Neither timestamp is in the select list — ordering does not need them there, and adding one
   * would change the GraphQL payload shape.
   *
   * @param {Object} args
   * @param {string} [args.registrationConfigurationId]
   * @param {string} [args.status] - 'active' | 'inactive'; omit for all statuses
   */
  async function getRegistrationFiles(args) {
    const where = [];
    const values = [];

    if (args.registrationConfigurationId) {
      mainUtil.addSqlWhere(
        'registration_configuration_id',
        args.registrationConfigurationId,
        where,
        values
      );
    }

    if (args.status) {
      mainUtil.addSqlWhere('status', args.status, where, values);
    }

    const selectColumns = mainUtil.makeSelectClause(registrationFileColumns);

    let sql = `
      SELECT
        ${selectColumns}
      FROM
        ${registrationFilesTableName}
      WHERE
         ${where.join(' AND ')}
      ORDER BY
         date_modified DESC, date_created DESC, id DESC
    `;

    try {
      return await dbRead.map(sql, values, mapper.camelizeRootKeys);
    } catch (e) {
      logger.error('Error getting registration files', e);
      throw new errors.InternalServerError({
        message: 'Error getting registration files'
      });
    }
  }

  return {
    createRegistrationConfiguration,
    updateRegistrationConfiguration,
    deleteRegistrationConfiguration,
    _registrationConfigurationPrefetch,
    getRegistrationConfigurations,
    getDomainSettings,
    getRegistrationUiSettings,
    getRegistrationFiles,
    _insertRegistrationConfig,
    _insertRegistrationFiles,
    _insertDomainSettings,
    _insertOrUpdateRegistrationUiSettings,
    _updateRegistrationConfig,
    _updateRegistrationFiles,
    _updateDomainSettings
  };
};
