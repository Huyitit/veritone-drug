const _ = require('lodash');
const { v4: uuidv4, v1: uuid } = require('uuid');
const validator = require('validator');
const semver = require('semver');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const jwt = require('jsonwebtoken');
const fpl = require('@veritone/functional-permissions-lib');

const mapper = require('./mapper.js');
const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map.js');

const PACKAGE_CREATED_EVENT = 'PackageCreated';
const PACKAGE_DELETED_EVENT = 'PackageDeleted';
const PACKAGE_APPROVED_EVENT = 'PackageApproved';
const PACKAGE_REJECTED_EVENT = 'PackageRejected';
const PACKAGE_INSTALLED_EVENT = 'PackageInstalled';
const PACKAGE_GRANT_SET_EVENT = 'PackageGrantSet';
const PACKAGE_GRANT_REMOVED_EVENT = 'PackageGrantRemoved';
const SYSTEM_APPLICATION_ID = 'system';
const SERVICE_NAME = 'core-graphql-server';
const CREATE_PERMISSIONS = [
  'AIWARE_JOB_CREATE',
  'AIWARE_TASK_CREATE',
  'AIWARE_FOLDER_CREATE',
  'AIWARE_TDO_CREATE',
  'AIWARE_FLOW_CREATE',
  'AIWARE_SDO_CREATE',
  'AIWARE_SOURCE_CREATE',
  'AIWARE_SCHEDULED_JOB_CREATE',
  'AIWARE_FOLDER_FILE',
  'AIWARE_SCHEMA_CREATE',
  'AIWARE_SOURCES_CREATE'
];
const READ_PERMISSIONS = [
  'AIWARE_FLOW_READ',
  'AIWARE_FOLDER_READ',
  'AIWARE_JOB_READ',
  'AIWARE_SCHEMA_READ',
  'AIWARE_SCHEMA_SEARCH',
  'AIWARE_SDO_READ',
  'AIWARE_SOURCES_READ',
  'AIWARE_TASK_READ',
  'AIWARE_TDO_READ',
  'AIWARE_TDO_SEARCH'
];
const orderDirectionMap = {
  desc: 'DESC',
  asc: 'ASC'
};

module.exports = function createFunction(serviceContext, config) {
  const { logger } = serviceContext.app;
  const errors = require('../error')(config);
  const returnableErrors = [
    errors.InvalidInput,
    errors.NotFound,
    errors.ResourceConflict,
    errors.NotAllowed
  ];
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const messageUtil = serviceContext.messageUtil;

  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );

  const processingOptionsDefaults = {
    isVersionUpgrade: false,
    preprocessResources: false,
    skipPackageAccessValidation: false,
    isNewPackage: false
  };

  const returningPackage = {
    package_id: null,
    organization_id: null,
    package_name: null,
    package_version: null,
    package_description: null,
    package_icon: null,
    package_created_date: null,
    install_date: null,
    distribution_date: null,
    distribution_type: null,
    status: null,
    auto_generated: null,
    deleted: null,
    source_origin_id: null,
    source_package_id: null,
    aiware_version: null,
    created_by: null,
    date_created: null,
    modified_by: null,
    date_modified: null
  };

  const grantType = {
    GRANT: 'GRANT',
    VIEW: 'VIEW',
    DENY: 'DENY'
  };

  const packageGrantAction = {
    ADD: 'ADD',
    REMOVE: 'REMOVE'
  };

  const publicPackageGrant = {
    distributionType: 'public',
    status: 'published'
  };

  const resourceTypeEnum = {
    application: 'application',
    engine: 'engine',
    engineBuild: 'engine_build',
    automateFlowRevision: 'automateFlowRevision',
    schema: 'schema',
    package: 'package',
    tdo: 'tdo',
    automateNode: 'automate_node',
    automateTemplate: 'automate_template',
    automatePalette: 'automate_palette',
    nodeRedPalette: 'node_red_palette',
    applicationConfigDefinition: 'applicationConfigDefinition',
    library: 'library',
  };

  const LIBRARY_GRANT_PERMISSIONS = ['view'];

  function getQueryOrgId(inputOrgId, context) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const ownerOrgId = resUtil.getOrgFromAuthContext(context);
    const tokenType = resUtil.getTokenType(context);
    const isInternalToken = tokenType === 'internal';
    const rootOrgId = _.get(serviceContext, 'config.flyway.rootOrgId');

    if (isInternalToken) {
      return inputOrgId || rootOrgId;
    }
    if (
      inputOrgId &&
      _.toString(inputOrgId) !== _.toString(ownerOrgId) &&
      !isSuperAdmin
    ) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to perform this operation by Organization ID.'
      });
    }

    return inputOrgId || ownerOrgId;
  }

  async function getPackageOrgId(packageId) {
    const sql = `
      SELECT
        organization_id
      FROM
        aiware.package
      WHERE
        package_id = $1
    `;

    const result = await serviceContext.dbConnections['core'].read.map(
      sql,
      [packageId],
      mapper.camelizeRootKeys
    );

    if (_.isEmpty(result)) {
      throw new errors.NotFound({
        message: `No Package was found with ID ${packageId}`
      });
    }

    return result[0].organizationId;
  }

  async function checkPackageReadAuthorization(
    packageId,
    context,
    isNewPackage = false,
    errorFieldName = 'packageId'
  ) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (isSuperAdmin || isNewPackage) return;

    // the getPackages function already checks for whether the calling org has access to the package or not,
    // so if this returns the package, then the calling org has access
    let packagesResult = await getPackages(context, { id: packageId });

    if (_.isEmpty(packagesResult.records)) {
      throw new errors.NotFound({
        message:
          `Validation for package read authorization failed. The Package either does not exist or the authenticated ` +
          `user or token does not have the necessary privileges to view it.`,
        data: {
          validationErrors: [
            {
              fieldName: errorFieldName,
              fieldValue: packageId
            }
          ]
        }
      });
    }
    return true;
  }

  async function checkPackageWriteAuthorization(
    packageId,
    context,
    organizationId = undefined,
    isNewPackage = false
  ) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = resUtil.getTokenType(context);
    const isInternalToken = tokenType === 'internal';

    if (isSuperAdmin || isInternalToken) return true;

    let packageOrgId;

    if (isNewPackage) {
      packageOrgId = organizationId;
    } else {
      packageOrgId = await getPackageOrgId(packageId);
    }

    const authorizedOrgIds = _.get(
      context,
      '_authInfo.authorizedOrganizationIds',
      [_.get(context, '_authInfo.organization.organizationId')]
    );

    return _.includes(authorizedOrgIds, packageOrgId);
  }

  async function _checkPackageGrantAuthorization(context, packageId) {
    // 1. Is superadmin
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const tokenType = resUtil.getTokenType(context);
    const isInternalToken = tokenType === 'internal';

    if (isSuperAdmin || isInternalToken) {
      return true;
    }

    // 2. Is org admin
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    if (!isOrgAdmin) {
      return false;
    }

    // 3. Check package accessibility - owner or org with a grant
    try {
      const check = await checkPackageReadAuthorization(packageId, context);
      return check;
    } catch (err) {
      if (err.name !== 'not_found') {
        serviceContext.logger.error(err);
      }
      return false;
    }
  }

  async function getResourcesToAdd(
    packageId,
    inputResources,
    context,
    existingResources = undefined
  ) {
    if (_.isNil(existingResources)) {
      const existingResourcesResult = await getPackageResources(context, {
        packageId
      });
      existingResources = existingResourcesResult.records;
    }

    const resourcesToAdd = _.map(existingResources, (record) => ({
      ...record,
      action: 'ADD'
    }));

    if (_.isEmpty(inputResources)) return resourcesToAdd;

    for (const inputResource of inputResources) {
      const existingIndex = _.findIndex(resourcesToAdd, [
        'resourceId',
        inputResource.resourceId
      ]);

      // the input resource does not already exist, so we can safely add it to the massaged resources
      // unless it has an action of 'REMOVE' or 'EXCLUDE' in which case we can omit it
      if (existingIndex < 0) {
        if (
          _.toUpper(inputResource.action) === 'REMOVE' ||
          _.toUpper(inputResource.action) === 'EXCLUDE'
        ) {
          continue;
        }
        resourcesToAdd.push(inputResource);
        continue;
      }

      // otherwise, it already exists. if it has an action of 'REMOVE',
      // then remove the resource from the list
      if (
        _.toUpper(inputResource.action) === 'REMOVE' ||
        _.toUpper(inputResource.action) === 'EXCLUDE'
      ) {
        resourcesToAdd.splice(existingIndex, 1);
      }

      if ('resourceAlias' in inputResource) {
        resourcesToAdd[existingIndex].resourceAlias =
          inputResource.resourceAlias;
      }
    }

    return resourcesToAdd;
  }

  function isInitialVersion(version) {
    if (_.isNil(version)) {
      throw new errors.InternalServerError({
        message:
          'The version for the new package to create was unexpectedly null.'
      });
    }
    const versionArr = version.split('.');
    // check that the first element is 1 and that the rest of the elements are 0
    return (
      Number(versionArr[0]) === 1 &&
      _.every(versionArr.slice(1), (v) => Number(v) === 0)
    );
  }

  async function getLatestVersions(
    packages,
    context,
    skipPackageAccessValidation = false,
    excludeDeleted = false
  ) {
    // condense packages down to a single package from each lineage
    const uniquePackages = _.uniqBy(packages, 'sourceOriginId');

    const latestPackages = [];

    for (const pkg of uniquePackages) {
      // grab the entire package lineage, so we can get the "true" highest version number that might not be associated with the package
      const packageLineage = await getPackages(
        context,
        {
          sourceOriginId: pkg.sourceOriginId || pkg.packageId,
          includeDeleted: !excludeDeleted
        },
        skipPackageAccessValidation
      );

      // if the packageLineage is empty, that means that the only package in the lineage is this one,
      // so we add it to the latest packages, otherwise we add the latest version in the lineage
      if (_.isEmpty(packageLineage.records)) {
        latestPackages.push(pkg);
      } else {
        const packageVersions = packageLineage.records.map(
          (pkg) => semver.coerce(pkg.packageVersion).version
        );

        const sortedVersions = packageVersions.sort(semver.rcompare);

        const latestPackage = _.find(
          packageLineage.records,
          (pkg) =>
            semver.coerce(pkg.packageVersion).version === sortedVersions[0]
        );

        latestPackages.push(latestPackage);
      }
    }

    return latestPackages;
  }

  async function doPackageUpgrades(input, context, processingOptions, existingDbWrite = null) {
    // set object parameter defaults
    processingOptions = {
      isVersionUpgrade: false,
      preprocessResources: false,
      skipPackageAccessValidation: false,
      ...processingOptions
    };
    try {
      const upgradedPackages = [];

      const getPackagesResult = await getPackages(
        context,
        {
          resourceId: input.primaryResourceId
        },
        processingOptions.skipPackageAccessValidation
      );

      const associatedPackages = getPackagesResult.records;

      // this situation should only arise if an application was created before packages were introduced
      if (_.isEmpty(associatedPackages)) {
        return doPackageCreate(
          {
            ...input,
            version: '1.0.0'
          },
          context,
          existingDbWrite,
          processingOptions.preprocessResources
        );
      }

      const autoGeneratedPackages = _.filter(
        associatedPackages,
        (pkg) => pkg.autoGenerated
      );

      const latestVersionPackages = await getLatestVersions(
        autoGeneratedPackages,
        context
      );

      const dbWrite =
        _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
          ? serviceContext.dbConnections['core'].write.tx
          : existingDbWrite.task;

      return await dbWrite(
        'doPackageUpgrades',
        async (t) => {
          let timestampOffset = 0;
          for (const pkg of latestVersionPackages) {
            const isAppDraftPackage =
              processingOptions.primaryResourceType === 'application' &&
              pkg.status === 'draft';
            const resourcesToAdd = await getResourcesToAdd(
              pkg.packageId,
              input.resources,
              context
            );

            const newVersion = _.toNumber(pkg.version.split('.')[0]) + 1;

            // get the type of the resource associated with the primary resource id,
            // so we can include it in the name of the upgraded package
            const primaryResource = _.find(resourcesToAdd, {
              resourceId:
                _.get(pkg, 'primaryResourceId') || input.primaryResourceId
            });
            const isPrimaryResourceIdSame =
              pkg.primaryResourceId === input.primaryResourceId;
            const updatedInput = {
              ...input,
              name: isPrimaryResourceIdSame ? input.name : pkg.name,
              version: isAppDraftPackage ? pkg.version : `${newVersion}.0`,
              organizationId: pkg.organizationId,
              primaryResourceId: primaryResource.resourceId,
              resources: isAppDraftPackage ? input.resources : resourcesToAdd,
              sourcePackageId: pkg.packageId,
              sourceOriginId: pkg.sourceOriginId || pkg.packageId,
              autoGenerated: true,
              status: isAppDraftPackage ? 'draft' : input.status || pkg.status,
              distributionType: isPrimaryResourceIdSame
                ? input.distributionType || pkg.distributionType
                : pkg.distributionType
            };

            timestampOffset++;

            if (isAppDraftPackage) {
              upgradedPackages.push(
                await packageUpdateWithoutIncrement(
                  {
                    ...updatedInput,
                    currentPackageName: pkg.name,
                    packageId: pkg.packageId
                  },
                  context,
                  t,
                  processingOptions.preprocessResources
                )
              );
            } else {
              upgradedPackages.push(
                await doPackageCreate(
                  updatedInput,
                  context,
                  t,
                  processingOptions
                )
              );
            }
          }

          return upgradedPackages;
        }
      );
    } catch (err) {
      if (!context.auditEventEmitted) {
        context.auditEventEmitted = true;
        _emitPackageCreatedAuditLogEvent(context, input, err);
      }
      throw err;
    }
  }

  function validateUUIDs(uuids, validationErrors) {
    _.forEach(_.keys(uuids), (key) => {
      if (!_.isNil(uuids[key]) && !validator.isUUID(uuids[key])) {
        validationErrors.push({
          message: `An invalid UUID was provided.`,
          fieldName: key,
          fieldValue: uuids[key]
        });
      }
    });
  }

  async function validatePackageCreateInput(
    input,
    context,
    existingTask = null
  ) {
    let validationErrors = [];

    validateUUIDs(
      {
        id: input.id,
        sourceOriginId: input.sourceOriginId,
        sourcePackageId: input.sourcePackageId
      },
      validationErrors
    );

    if (!_.isNil(input.primaryResourceId)) {
      const inputPrimaryResourceId = _.find(input.resources, [
        'resourceId',
        input.primaryResourceId
      ]);

      if (_.isNil(inputPrimaryResourceId)) {
        validationErrors.push({
          fieldName: 'primaryResourceId',
          fieldValue: input.primaryResourceId,
          message: `A Primary Resource ID was provided that does not exist in the list of resources for this package. Please check your input and try again.`
        });
      }
    }

    // if version is specified and is not 1, then sourceOriginId and sourcePackageId must be specified
    if (!isInitialVersion(input.version)) {
      if (_.isNil(input.sourceOriginId)) {
        validationErrors.push({
          fieldName: 'sourceOriginId',
          fieldValue: input.sourceOriginId,
          message: `The sourceOriginId field must be specified if the version is not 1, 1.0, or 1.0.0.`
        });
      }
    } else {
      if (!_.isNil(input.sourcePackageId)) {
        validationErrors.push({
          fieldName: 'sourcePackageId',
          fieldValue: input.sourcePackageId,
          message: `The first package in a lineage must not have a sourcePackageId.`
        });
      }
    }

    const inactiveResourceErrors = await checkStatusOfResources(
      context,
      input.status,
      input.resources,
      existingTask
    );

    validationErrors.push(...inactiveResourceErrors);

    if (!_.isEmpty(validationErrors)) {
      throw new errors.InvalidInput({
        message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
        data: {
          validationErrors
        }
      });
    }
  }

  async function packageCreate(
    input,
    context,
    processingOptions,
    existingTask = null
  ) {
    // set object parameter defaults
    processingOptions = {
      ...processingOptionsDefaults,
      ...processingOptions
    };
    context.auditEventEmitted = false;
    try {
      if (processingOptions.isVersionUpgrade) {
        // package is auto generated
        return doPackageUpgrades(input, context, processingOptions, existingTask);
      } else {
        if (!processingOptions.skipPackageAccessValidation) {
          // package is not auto generated
          await validatePackageCreateInput(input, context, existingTask);
        }
        // allowing user to pass in a createdAt date (for use in hub)
        if (!_.isNil(input.createdAt)) {
          const inputCreatedAt = new Date(Number(input.createdAt));
          // checking if the date is valid
          if (!_.isNaN(inputCreatedAt.getTime())) {
            input.createdAt = inputCreatedAt;
          }
        }
        if (_.isNil(input.distributionType)) {
          input.distributionType = 'private';
        }

        return doPackageCreate(input, context, existingTask, {
          ...processingOptions,
          isNewPackage: true
        });
      }
    } catch (err) {
      if (!context.auditEventEmitted) {
        _emitPackageCreatedAuditLogEvent(context, input, err);
      }
      throw err;
    }
  }

  async function doPackageCreate(
    input,
    context,
    existingDbWrite,
    processingOptions
  ) {
    // set object parameter defaults
    processingOptions = {
      ...processingOptionsDefaults,
      ...processingOptions,
      isNewPackage: true
    };

    try {
      const {
        id: packageId,
        name,
        description,
        icon,
        distributionType,
        version,
        resources,
        sourceOriginId,
        sourcePackageId,
        aiwareVersion,
        primaryResourceId: inputPrimaryResourceId,
        deleted,
        deprecated,
        packageCreatedDate,
        status,
        installDate,
        autoGenerated
      } = {
        ...input,
        icon: resUtil.stripOwnedStorageUrlSignature(input.icon)
      };
      let primaryResourceId = inputPrimaryResourceId;

      const dbWrite =
        _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
          ? serviceContext.dbConnections['core'].write.tx
          : existingDbWrite.task;

      const id = _.isNil(packageId) ? uuidv4() : packageId;

      // if sourceOriginId is not supplied, it is assumed to be the first in a package's lineage
      const sqlSourceOriginId =
        _.isEmpty(sourceOriginId) && isInitialVersion(version)
          ? id
          : sourceOriginId;

      await validatePrimaryResourceForLineage(
        primaryResourceId,
        sqlSourceOriginId
      );

      const columns = [];
      const sqlValues = [];
      const args = [];

      const organizationId = getQueryOrgId(input.organizationId, context);
      input.organizationId = organizationId; // for failure cases
      const userId = await getUserId(context, organizationId);

      args.push(id);
      columns.push('package_id');
      sqlValues.push('$' + args.length);

      args.push(organizationId);
      columns.push('organization_id');
      sqlValues.push('$' + args.length);

      args.push(name);
      columns.push('package_name');
      sqlValues.push('$' + args.length);

      const semVersion = semver.coerce(version);

      args.push(semVersion.version);
      columns.push('package_version');
      sqlValues.push('$' + args.length);

      args.push(userId);
      columns.push('created_by');
      sqlValues.push('$' + args.length);
      columns.push('modified_by');
      sqlValues.push('$' + args.length);

      args.push(sqlSourceOriginId);
      columns.push('source_origin_id');
      sqlValues.push('$' + args.length);

      args.push(sourcePackageId);
      columns.push('source_package_id');
      sqlValues.push('$' + args.length);

      args.push(aiwareVersion);
      columns.push('aiware_version');
      sqlValues.push('$' + args.length);

      if (!_.isNil(deleted)) {
        args.push(deleted);
        columns.push('deleted');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(deprecated)) {
        args.push(deprecated);
        columns.push('deprecated');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(status)) {
        args.push(status);
        columns.push('status');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(description)) {
        args.push(description);
        columns.push('package_description');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(icon)) {
        args.push(icon);
        columns.push('package_icon');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(distributionType)) {
        args.push(distributionType);
        columns.push('distribution_type');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(packageCreatedDate)) {
        args.push(new Date(packageCreatedDate));
        columns.push('package_created_date');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(installDate)) {
        args.push(new Date(installDate));
        columns.push('install_date');
        sqlValues.push('$' + args.length);
      }

      if (!_.isNil(autoGenerated)) {
        args.push(autoGenerated);
        columns.push('auto_generated');
        sqlValues.push('$' + args.length);
      }

      if (isDistributed(status, distributionType)) {
        args.push(new Date());
        columns.push('distribution_date');
        sqlValues.push('$' + args.length);
      }

      const sql = `
        INSERT INTO aiware.package (${columns.join(', ')})
        VALUES (${sqlValues.join(', ')})
        RETURNING *
      `;

      return await dbWrite('doPackageCreate', async (t) => {
        const result = await t.map(sql, args, mapper.mapPackage);

        if (_.isEmpty(result)) {
          throw new errors.NotFound({
            message: `No Package found for ID: ${id}`
          });
        }

        if (!_.isEmpty(resources)) {
          await packageUpdateResources(
            {
              packageId: result[0].id,
              packageResources: resources,
              organizationId: result[0].organizationId
            },
            context,
            t,
            processingOptions
          );
        }

        let primaryResourceResult;
        if (!_.isEmpty(primaryResourceId)) {
          // if the primary resource is a TDO resource, it will be replaced by a new TDO resource
          // that has been cloned. So, it should be replaced with this cloned resource.
          const clonePrimaryResource = _.find(
            resources,
            (r) => _.get(r, 'originalResourceId') === primaryResourceId
          );

          if (clonePrimaryResource && clonePrimaryResource.resourceId) {
            primaryResourceId = clonePrimaryResource.resourceId;
          }

          primaryResourceResult = await upsertPackagePrimaryResource(
            result[0].id,
            primaryResourceId,
            userId,
            t
          );
        }

        const pkg = {
          ...result[0],
          primaryResourceId: _.get(primaryResourceResult, 'resourceId', null)
        };

        if (!context.auditEventEmitted) {
          context.auditEventEmitted = true;
          await _emitPackageCreatedAuditLogEvent(context, pkg);
          await _emitPackageEventByStatus(context, pkg);
        }
        return pkg;
      });
    } catch (err) {
      if (!context.auditEventEmitted) {
        context.auditEventEmitted = true;
        _emitPackageCreatedAuditLogEvent(context, input, err);
      }
      if (
        _.get(err, 'data.internalData') &&
        _.includes(err.data.internalData.message, 'duplicate key')
      ) {
        throw new errors.ResourceConflict({
          message: 'Package with this name and org id already exists'
        });
      } else {
        serviceContext.logger.error(err);
        throw new errors.InternalServerError(err);
      }
    }
  }

  function verifyEditingAllowedFields(packageInput, currentPackage) {
    const restrictedFields = [
      'id',
      'version',
      'sourceOriginId',
      'sourcePackageId',
      'aiwareVersion',
      'installDate',
      'distributionDate',
      'autoGenerated',
      'primaryResourceId',
      'createdAt',
      'createdBy',
      'modifiedAt',
      'modifiedBy'
    ];

    for (const field of restrictedFields) {
      if (
        !_.isNil(packageInput[field]) &&
        !_.isEqual(packageInput[field], currentPackage[field])
      ) {
        throw new errors.NotAllowed({
          message: `Directly editing the ${field} field of an automatically generated package is prohibited. `
        });
      }
    }
  }

  async function verifyAllowedToEditPackage(
    packageInput,
    context,
    fieldName = 'id'
  ) {
    // check to see if the package being edited is an auto generated package
    const getPackagesResult = await getPackages(context, {
      id: packageInput.id
    });

    if (_.isEmpty(getPackagesResult.records)) {
      throw new errors.InvalidInput({
        message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
        data: {
          validationErrors: [
            {
              fieldName,
              fieldValue: packageInput.id,
              message: 'The provided ID was not found in the database.'
            }
          ]
        }
      });
    }

    const packageToEdit = getPackagesResult.records[0];

    if (packageToEdit.autoGenerated) {
      verifyEditingAllowedFields(packageInput, packageToEdit);
    }

    return packageToEdit;
  }

  async function getLatestPackageInLineage(sourceOriginId) {
    const sql = `
      SELECT
        p.package_id,
        ppr.resource_id as primary_resource_id,
        package_name,
        package_version,
        package_description,
        package_icon,
        package_created_date,
        install_date,
        distribution_date,
        distribution_type,
        status,
        auto_generated,
        deleted,
        deprecated,
        p.source_origin_id,
        source_package_id,
        aiware_version,
        organization_id,
        p.created_by,
        p.date_created,
        p.modified_by,
        p.date_modified
      FROM
        aiware.package p
        LEFT JOIN aiware.package__primary_resource ppr on ppr.package_id  = p.package_id
      WHERE
        p.source_origin_id = $1
    `;

    const result = await serviceContext.dbConnections['core'].read.map(
      sql,
      [sourceOriginId],
      mapper.mapPackage
    );

    if (_.isEmpty(result)) {
      throw new errors.NotFound({
        message: `No Package found for source origin ID: ${sourceOriginId}`
      });
    }

    const sortedPackages = result.sort((pkgA, pkgB) =>
      semver.rcompare(
        semver.coerce(pkgA.packageVersion).version,
        semver.coerce(pkgB.packageVersion).version
      )
    );

    const latestPackage = sortedPackages[0];

    let latestNonDeletedPackage;

    for (const pkg of sortedPackages) {
      if (!pkg.deleted) {
        latestNonDeletedPackage = pkg;
        break;
      }
    }

    return { latestPackage, latestNonDeletedPackage };
  }

  const isNewVersionHigher = (newVersion, currentVersion) => {
    return semver.gt(semver.coerce(newVersion), semver.coerce(currentVersion));
  };

  function isPackageChanging(packageInput, dbPackage) {
    const inputKeysToSkip = [
      'resources',
      'organizationIds',
      'applicationId',
      'applicationIds'
    ];

    let isPackageInputDifferent = false;
    let isStatusOnlyValueChanging = false;
    let isStatusChanging = _.isNil(packageInput.status)
      ? false
      : packageInput.status != dbPackage.status;

    // loop over all the fields in the packageInput and check if they are different from the dbPackage
    for (const [key, value] of Object.entries(
      _.omit(packageInput, inputKeysToSkip)
    )) {
      if (key === 'installDate') {
        if (
          !_.isNil(value) &&
          !_.isEqual(new Date(value), new Date(dbPackage[key]))
        ) {
          isPackageInputDifferent = true;
          isStatusOnlyValueChanging = false;
          break;
        }
      } else if (!_.isEqual(value, dbPackage[key])) {
        isPackageInputDifferent = true;
        if (key === 'status') {
          isStatusOnlyValueChanging = true;
        } else {
          isStatusOnlyValueChanging = false;
          break;
        }
      }
    }

    return {
      isPackageInputDifferent,
      isStatusOnlyValueChanging,
      isStatusChanging
    };
  }

  function areResourcesChanging(inputResources, dbResources) {
    if (_.isEmpty(inputResources)) return false;
    const dbResourcesMap = _.keyBy(dbResources, 'resourceId');

    for (const inputResource of inputResources) {
      const dbResource = dbResourcesMap[inputResource.resourceId];

      if (
        (inputResource.action.toUpperCase() === 'ADD' && _.isNil(dbResource)) ||
        (inputResource.action.toUpperCase() === 'REMOVE' &&
          !_.isNil(dbResource)) ||
        (inputResource.action.toUpperCase() === 'ADD' &&
          inputResource.resourceAlias !== dbResource.resourceAlias)
      ) {
        return true;
      }
    }

    return false;
  }

  const eventActionMap = {
    pending: eventsMap.PackageCreated,
    deleted: eventsMap.PackageDeleted,
    approved: eventsMap.PackageApproved,
    rejected: eventsMap.PackageRejected,
    published: eventsMap.PackageInstalled
  };

  async function packageUpdate(
    input,
    context,
    isPackageUpdateResources = false
  ) {
    context.auditEventEmitted = false;
    let inactiveOrNonExistingResourcesChecked = false;
    const { status, id, packageId, name } = input;
    let currentPackageName, currentPackageStatus;
    try {
      const packageId = input.id || input.packageId;
      const inputResources = input.resources || input.packageResources;
      if (_.isNil(packageId)) {
        throw new errors.InvalidInput({
          message: 'Package Id is a required input'
        });
      }
      const isUserOrgAuthorized = await checkPackageWriteAuthorization(
        packageId,
        context
      );

      if (!isUserOrgAuthorized) {
        throw new errors.NotAllowed({
          message: 'Not Authorized to make changes to that package.'
        });
      }

      const currentPackage = await verifyAllowedToEditPackage(
        { ...input, id: packageId },
        context
      );
      if (_.isNil(currentPackage.packageId)) {
        throw new errors.NotFound({
          message: 'Package with the provided ID was not found.'
        });
      }

      currentPackageName = currentPackage.name;
      currentPackageStatus = currentPackage.status;
      const {
        latestPackage,
        latestNonDeletedPackage
      } = await getLatestPackageInLineage(currentPackage.sourceOriginId);

      // make sure there's an actual change before upgrading
      let isPackageInputDifferent = false;
      let isStatusOnlyValueChanging = false;
      let isStatusChanging = false;
      if (!isPackageUpdateResources) {
        ({
          isPackageInputDifferent,
          isStatusOnlyValueChanging,
          isStatusChanging
        } = isPackageChanging(input, currentPackage));
      }

      if (currentPackage.packageId !== latestNonDeletedPackage.packageId) {
        // AWT-11477 we will now allow users to update status of any package
        // regardless of whether it is the latest or not
        if (_.isNil(input.status)) {
          throw new errors.NotAllowed({
            message:
              'This package is not the latest in the lineage.  Please edit the latest package in the lineage.'
          });
        }

        if (
          !isStatusOnlyValueChanging ||
          (isStatusOnlyValueChanging && !_.isEmpty(input.resources))
        ) {
          throw new errors.InvalidInput({
            message:
              'Only the status field can be updated on a package that is not the latest version. Please only provide id and status input.'
          });
        }
        return packageUpdateWithoutIncrement(
          {
            packageId,
            status: input.status,
            currentPackageStatus: currentPackage.status,
            currentPackageName
          },
          context,
          null,
          false
        );
      }

      // Ensure cycles are prevented
      const errArray = await checkCircularPackageReference(context, input);
      if (errArray.length > 0) {
        const now = new Date();
        throw new errors.nestedResourcesCycleDetected({
          message: `A cycle has been detected in a nested package of ${input.id}.`,
          time_thrown: now.toISOString(),
          data: {
            validationErrors: errArray
          }
        });
      }

      const { records: latestPackageResources } = await getPackageResources(
        context,
        {
          packageId: latestNonDeletedPackage.packageId
        }
      );

      const changingStatus = input.status || currentPackage.status;
      if (
        !skipPackageResourceValidation(context) &&
        changingStatus !== 'draft'
      ) {
        // If the status is change, validate that the resources are all active/published.
        let allResources = [];
        if (inputResources) {
          // only check input resources that are being added
          allResources = _.filter(inputResources, (resource) => {
            if (resource.action && resource.action === 'ADD') {
              return resource;
            }
          });
        }

        if (isStatusChanging) {
          allResources.push(...latestPackageResources);
        }

        if (allResources.length > 0) {
          // In the case of an engine build, we must find the owning engine id and validate that.
          const nonEngineBuildResources = [];
          const engineBuildResources = [];
          for (const resource of allResources) {
            if (_.snakeCase(resource.resourceType) === resourceTypeEnum.engineBuild) {
              engineBuildResources.push(resource);
            } else {
              nonEngineBuildResources.push(resource);
            }
          }

          allResources = nonEngineBuildResources;
          if (engineBuildResources.length > 0) {
            const engineBuildIds = engineBuildResources.map(
              (resource) => resource.resourceId
            );
            const engineBuilds = await serviceContext.dal.engine.getBuilds(
              { ids: engineBuildIds },
              context
            );
            for (const engineBuild of engineBuilds) {
              allResources.push({
                resourceType: resourceTypeEnum.engine,
                resourceId: engineBuild.engineId
              });
            }
          }
          inactiveOrNonExistingResourcesChecked = true;
          const checkInactive = (input.status && input.status === 'published') || currentPackage.status === 'published';
          const inactiveResourceErrors = await getInactiveOrNonExistingResources(
            allResources,
            context,
            checkInactive
          );

          if (!_.isEmpty(inactiveResourceErrors)) {
            throw new errors.InvalidInput({
              message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
              data: {
                inactiveResourceErrors
              }
            });
          }
        }
      }
      const areResourcesDifferent = areResourcesChanging(
        inputResources,
        latestPackageResources
      );

      if (areResourcesDifferent) {
        isStatusOnlyValueChanging = false;
      }

      if (!isPackageInputDifferent && !areResourcesDifferent) {
        throw new errors.InvalidInput({
          message:
            'No package changes detected. Please include package or resource changes to update the package.'
        });
      }

      if (
        !_.isNil(input.version) &&
        !isNewVersionHigher(input.version, latestPackage.version)
      ) {
        throw new errors.InvalidInput({
          message:
            'The version provided is not higher than the current version. Please provide a higher version number.'
        });
      }

      // Do package upgrades
      const resourcesToAdd = await getResourcesToAdd(
        currentPackage.packageId,
        inputResources,
        context,
        latestPackageResources
      );
      const inactiveResourceErrors = inactiveOrNonExistingResourcesChecked
        ? []
        : await checkStatusOfResources(context, input.status, resourcesToAdd);
      if (!_.isEmpty(inactiveResourceErrors)) {
        throw new errors.InvalidInput({
          message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
          data: {
            validationErrors: inactiveResourceErrors
          }
        });
      }
      const newVersion = !_.isNil(semver.coerce(input.version))
        ? semver.coerce(input.version).version
        : semver.inc(semver.coerce(latestPackage.version), 'major');

      const primaryResource = _.find(resourcesToAdd, {
        resourceId:
          input.primaryResourceId || _.get(currentPackage, 'primaryResourceId')
      });
      if (!_.isNil(input.primaryResourceId)) {
        if (_.isNil(primaryResource)) {
          throw new errors.InvalidInput({
            message:
              'The primary resource ID provided does not match any of the resources in the package. Check that you are not removing the primary resource in this update.'
          });
        }
      } else if (
        !_.isNil(currentPackage.primaryResourceId) &&
        _.isNil(primaryResource)
      ) {
        throw new errors.InvalidInput({
          message:
            'The primary resource is being removed from the package. Please provide a new valid primary resource ID if you wish to remove the resource.'
        });
      }

      const updatedInput = {
        ...input,
        name: input.name || currentPackage.name,
        version: newVersion,
        organizationId: currentPackage.organizationId,
        primaryResourceId: _.isNil(primaryResource)
          ? null
          : primaryResource.resourceId,
        resources: resourcesToAdd,
        sourcePackageId: currentPackage.packageId,
        sourceOriginId: currentPackage.sourceOriginId,
        autoGenerated: currentPackage.autoGenerated,
        status: changingStatus,
        distributionType:
          input.distributionType || currentPackage.distributionType
      };

      const packageToCreate = _.omit(updatedInput, ['id', 'packageId']);
      const isAppDraftPackage = await primaryIsDraftApp(
        input,
        currentPackage,
        primaryResource,
        context
      );
      const shouldIncrement =
        !isAppDraftPackage &&
        !isStatusOnlyValueChanging &&
        currentPackage.status !== 'draft';
      if (shouldIncrement) {
        const result = await doPackageCreate(packageToCreate, context, null);

        return result;
      } else {
        const updateWithoutIncrementResult = await packageUpdateWithoutIncrement(
          {
            ...input,
            resources: inputResources,
            packageId: currentPackage.packageId,
            currentPackageStatus: currentPackage.status,
            currentPackageName
          },
          context,
          null,
          true
        );

        if (
          !_.isNil(updatedInput.primaryResourceId) &&
          updatedInput.primaryResourceId !== currentPackage.primaryResourceId
        ) {
          const organizationId = getQueryOrgId(input.organizationId, context);
          const userId = await getUserId(context, organizationId);
          await upsertPackagePrimaryResource(
            packageId,
            updatedInput.primaryResourceId,
            userId
          );
        }
        return {
          ...updateWithoutIncrementResult,
          primaryResourceId: updatedInput.primaryResourceId
        };
      }
    } catch (err) {
      const pkgId = id || packageId;
      const pkgStatus = status || currentPackageStatus;
      !context.auditEventEmitted &&
        pkgStatus &&
        eventActionMap[pkgStatus] &&
        emitPublicPackageEvent(context, eventActionMap[pkgStatus], {
          status: pkgStatus,
          packageId: pkgId,
          packageName: currentPackageName, // use the original name in case the name was changed
          error: err
        });
      throw err;
    }
  }

  function skipPackageResourceValidation(context) {
    return _.get(
      context.config,
      `featureFlags.skipPackageResourceValidation`,
      false
    );
  }

  async function checkStatusOfResources(
    context,
    inputStatus,
    packageResources,
    existingTask = null
  ) {
    if (
      !_.isEmpty(packageResources) &&
      !skipPackageResourceValidation(context)
    ) {
      // check inactive resources only for published packages
      // for the rest - check if resources exist, throw if not
      const checkInactive = inputStatus && inputStatus === 'published';
      return await getInactiveOrNonExistingResources(
        packageResources,
        context,
        checkInactive,
        existingTask
      );
    }
    return [];
  }

  async function primaryIsDraftApp(
    packageInput,
    currentPackage,
    primaryResource,
    context
  ) {
    if (
      _.get(primaryResource, 'resourceType') === 'application' &&
      currentPackage.status === 'draft'
    ) {
      const application = await serviceContext.dal.application.getApplication(
        { id: primaryResource.resourceId },
        context
      );
      if (!_.isNil(application) && application.status === 'draft') {
        return true;
      }
    }

    return false;
  }

  async function packageDelete(options, context) {
    const { id } = options;
    let deletePackageResult;

    try {
      if (_.isNil(id)) {
        throw new errors.InvalidInput({
          message: 'Package Id is a required input'
        });
      }
      const isUserOrgAuthorized = await checkPackageWriteAuthorization(
        id,
        context
      );

      if (!isUserOrgAuthorized) {
        throw new errors.NotAllowed({
          message: 'Not Authorized to make changes to that package.'
        });
      }

      const packageDeleteSql = `
        UPDATE aiware.package
        SET deleted = true
        WHERE package_id = $1
        RETURNING *
      `;

      const resourceDeleteSql = `
        DELETE FROM aiware.package__resource
        WHERE package_id = $1
        RETURNING *
      `;

      const tx = serviceContext.dbConnections['core'].write;
      await tx.any(resourceDeleteSql, [id]);

      deletePackageResult = await tx.map(
        packageDeleteSql,
        [id],
        mapper.mapPackage
      );

      if (_.isEmpty(deletePackageResult)) {
        throw new errors.InternalServerError({
          message:
            'Package deletion was not successful, check package id and try again'
        });
      } else {
        await emitPublicPackageEvent(context, eventsMap.PackageDeleted, {
          packageId: deletePackageResult[0].id,
          packageName: deletePackageResult[0].name,
          organizationId: deletePackageResult[0].organizationId
        });

        return { success: true };
      }
    } catch (error) {
      serviceContext.logger.error(error);
      const packageInfo =
        _.isArray(deletePackageResult) && deletePackageResult.length > 0
          ? deletePackageResult[0]
          : undefined;
      await emitPublicPackageEvent(context, eventsMap.PackageDeleted, {
        packageId: id,
        packageName: packageInfo?.name,
        organizationId: packageInfo?.organizationId,
        error
      });
      const isReturnableError = returnableErrors.some(
        (errType) => error instanceof errType
      );

      if (isReturnableError) {
        throw error;
      }
      throw new errors.InternalServerError(error);
    }
  }

  async function getEngineBuildResources(context, engineId, action, existingTask = null) {
    if (_.isNil(action)) {
      throw new Error('Missing resource action');
    }

    const getEngineBuildsResult = await serviceContext.dal.engine.getEngineBuilds(
      {
        engineId
      },
      context,
      existingTask
    );

    if (!_.isEmpty(getEngineBuildsResult.records)) {
      const buildResources = _.map(getEngineBuildsResult.records, (build) => {
        return {
          resourceType: 'engineBuild',
          resourceId: build.id,
          action: build.status === 'deployed' ? action : 'EXCLUDE'
        };
      });

      return buildResources;
    }

    return null;
  }

  async function getLinkedResources(
    packageResources,
    context,
    packageId,
    resourceTypes = null,
    existingTask = null
  ) {
    const resources = [...packageResources];

    await Promise.all(
      packageResources.map(async (resource) => {
        const resourceType = _.camelCase(resource.resourceType);
        if (Array.isArray(resourceTypes)) {
          if (_.indexOf(resourceTypes, resourceType) === -1) {
            return resource;
          }
        }
        switch (resourceType) {
          case 'application':
            await processApplicationResources(context, resource, resources);
            break;
          case 'engine':
            await processEngineResources(context, resource, resources, existingTask);
            break;
          case 'tdo':
          case 'automateNode':
          case 'automatePalette':
            await processTDOResource(context, resource, resources, packageId);
            break;
          case 'applicationConfigDefinition':
            await processApplicationConfigDefinitionResources(
              context,
              resource,
              resources
            );
            break;
        }
      })
    );

    const resourcesToAdd = _.filter(
      resources,
      (resource) => resource.action === 'ADD'
    );

    return _.uniqBy(resourcesToAdd, 'resourceId');
  }

  async function processApplicationConfigDefinitionResources(
    context,
    resource,
    resources
  ) {
    const { resourceId, action } = resource;
    const appConfigDefinition = await serviceContext.dal.application.getApplicationConfigDefinition(
      {
        id: resourceId
      },
      context
    );
    if (!_.isEmpty(appConfigDefinition.records)) {
      for (const configDefinition of appConfigDefinition.records) {
        resources.push({
          resourceType: 'applicationConfigDefinition',
          resourceId: configDefinition.id,
          action
        });
      }
    }

    return resources;
  }

  async function processApplicationResources(context, resource, resources) {
    const { resourceId, action } = resource;
    const engines = await serviceContext.dal.engine.getEngines(context, {
      appPackageId: resource.resourceId
    });
    if (!_.isEmpty(engines.records)) {
      for (const engine of engines.records) {
        resources.push({
          resourceType: 'engine',
          resourceId: engine.id,
          action
        });

        const engineBuildResources = await getEngineBuildResources(
          context,
          engine.id,
          action
        );
        if (!_.isEmpty(engineBuildResources)) {
          resources.unshift(...engineBuildResources);
        }

        const schemaResources = await getSchemaResourcesByEngine(
          engine.id,
          action
        );
        resources.push(...schemaResources);
      }
    }

    // Get node red palettes and add to resources
    const nodeRedPalettes = await serviceContext.dal.application.getNodeRedPalettesByApplication(
      resourceId
    );

    const activeNodeRedPalettes = _.filter(
      nodeRedPalettes,
      (palette) => palette.status === 'active'
    );

    if (!_.isEmpty(activeNodeRedPalettes)) {
      for (const nodeRedPalette of activeNodeRedPalettes) {
        resources.push({
          resourceType: 'nodeRedPalette',
          resourceId: nodeRedPalette.moduleId,
          action
        });
      }
    }
    return resources;
  }

  async function processEngineResources(context, resource, resources, existingTask = null) {
    const { resourceId, action } = resource;
    const engineBuildResources = await getEngineBuildResources(
      context,
      resourceId,
      action,
      existingTask
    );
    if (!_.isEmpty(engineBuildResources)) {
      resources.unshift(...engineBuildResources);
    }
    const schemaResources = await getSchemaResourcesByEngine(
      resourceId,
      action
    );
    resources.push(...schemaResources);
  }

  async function processTDOResource(context, resource, resources, packageId) {
    const requesterOrgId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    // 1. clone tdo
    const tdo = await serviceContext.dal.tdo.getTDO(context, {
      id: resource.resourceId,
      organizationId: requesterOrgId
    });
    const isClone = !_.isNil(_.get(tdo, ['jsondata', 'veritone-clone', 'original']));
    let clonedTdo = isClone
      ? tdo
      : await serviceContext.dal.tdo.processClone(
          context,
          tdo,
          {
            sourceApplicationId: tdo.applicationId,
            destinationApplicationId: tdo.applicationId,
            request: {
              cloneBlobs: false,
              includeAssets: true,
              includeJobs: false,
              cloneAssets: []
            }
          },
          { destinationOrgId: tdo.orgId }
        );

    // 2. set veritone-permissions.packageId on the cloned tdo
    const packageIdSet = new Set([packageId]);
    const permissions = _.get(clonedTdo, 'jsondata.veritonePermissions', {});
    const permissionPackageId = _.get(permissions, 'packageId');
    if (isClone && permissionPackageId) {
      const permissionPackageIds = _.isArray(permissionPackageId)
        ? permissionPackageId
        : [permissionPackageId];
      for (const pkgId of permissionPackageIds) {
        packageIdSet.add(pkgId);
      }
    }
    permissions.packageId = Array.from(packageIdSet);
    _.set(clonedTdo, 'jsondata.veritonePermissions', permissions);
    clonedTdo = await serviceContext.dal.tdo.updateTDOAuthorized(
      context,
      {
        input: {
          id: clonedTdo.id,
          details: {
            veritonePermissions: permissions
          }
        },
        organizationId: tdo.orgId
      },
      clonedTdo
    );

    if (!isClone) {
      // 3. replace the original tdo resource with the clone
      for (const r of resources) {
        if (r.resourceId === resource.resourceId) {
          // mutate input resources to save the original resource ID before replacing.
          r.originalResourceId = r.resourceId;
          r.resourceId = clonedTdo.id;
          break;
        }
      }

      // 4. file the cloned tdo in the appropriate resourceType folder.
      await fileTDOResouceInResourceFolder(
        context,
        resource.resourceType,
        clonedTdo
      );
    }

    return clonedTdo;
  }

  async function getSchemaResourcesByEngine(engineId, action) {
    const schemas = await serviceContext.dal.engine.getEngineSchemas(engineId);

    return _.map(schemas, (schema) => ({
      resourceType: 'schema',
      resourceId: schema.schemaId,
      action
    }));
  }

  async function packageUpdateResources(
    input,
    context,
    existingDbWrite,
    processingOptions
  ) {
    // set object parameter defaults
    processingOptions = {
      ...processingOptionsDefaults,
      ...processingOptions
    };

    const { packageId, packageResources, organizationId } = input;
    if (_.isNil(packageId)) {
      throw new errors.InvalidInput({
        message: 'Package Id is a required input'
      });
    }

    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? serviceContext.dbConnections['core'].write.tx
        : existingDbWrite.task;

    await dbWrite('packageUpdateResources', async (t) => {
      const isUserOrgAuthorized = await checkPackageWriteAuthorization(
        packageId,
        context,
        organizationId,
        processingOptions.isNewPackage
      );

      if (!isUserOrgAuthorized) {
        throw new errors.NotAllowed({
          message: 'Not Authorized to make changes to that package.'
        });
      }

      // Ensure cycles are prevented
      const errArray = await checkCircularPackageReference(context, input);
      if (errArray.length > 0) {
        const now = new Date();
        throw new errors.nestedResourcesCycleDetected({
          message: `A cycle has been detected in a nested package of ${packageId}.`,
          time_thrown: now.toISOString(),
          data: {
            validationErrors: errArray
          }
        });
      }

      const rows = [];

      let linkedResourceTypes = null;
      if (!processingOptions.preprocessResources) {
        // some resources always need to be pre-processed
        linkedResourceTypes = ['application', 'engine', 'applicationConfigDefinition', 'tdo', 'automateNode', 'automatePalette'];
      }
      // get all resources linked to application and/or engine
      const packageResourcesToSubmit = await getLinkedResources(
        packageResources,
        context,
        packageId,
        linkedResourceTypes,
        t.task
      );
      const resourcesToRemove = _.filter(
        packageResources,
        (resource) => resource.action === 'REMOVE'
      );

      if (!_.isEmpty(resourcesToRemove) && !processingOptions.isNewPackage) {
        packageResourcesToSubmit.push(...resourcesToRemove);
      }

      const { primaryResourceId } = input;
      const newPrimaryResourceId = packageResourcesToSubmit.find((p) => {
        return p.resourceId === primaryResourceId && p.action === 'ADD';
      });
      const allowRemovalOfPrimary = !!newPrimaryResourceId;

      for (const packageResource of packageResourcesToSubmit) {
        const result = await packageUpdateResourcesDb({
          packageId,
          packageResource,
          organizationId,
          context,
          dbWrite: t,
          allowRemovalOfPrimary
        });
        if (!_.isEmpty(result.error) && packageResource.action !== 'REMOVE') {
          throw result.error;
        }
        if (result.row) {
          rows.push(result.row);
        }
      }
    }).catch((err) => {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    });
  }

  // Get resource alias by package resource info
  async function _getResourceAlias(context, packageResource) {
    if (_.isNil(packageResource)) {
      throw new errors.InvalidInput({
        message: `the package resource info is required`
      });
    }

    const { resourceId, resourceType, action } = packageResource;
    let resourceAlias = _.get(packageResource, 'resourceAlias');
    // only generate resource alias when adding a resource.
    if (_.isNil(resourceAlias) && action === 'ADD') {
      // 1. If resource alias is not passed in and resource ID is a UUID
      // By default: Should we use resource id for the alias field instead of generate a new UUID?
      if (validator.isUUID(`${resourceId}`)) {
        resourceAlias = resourceId;
      } else {
        // Generate a new value
        resourceAlias = uuidv4();
      }

      // 2. Continue checking resource info by type to get an alias
      if (!_.isNil(resourceId) && !_.isNil(resourceType)) {
        // Check to see the resource has an alias or not.
        const _ra = await getResourceAliasByType(
          context,
          resourceId,
          resourceType
        );
        if (!_.isNil(_ra)) {
          return _ra;
        }
      }
    }

    return resourceAlias;
  }

  // Get resource alias if resource type supports
  async function getResourceAliasByType(context, resourceId, resourceType) {
    let resourceAlias = null;
    let resource;
    if (_.isNil(resourceId) || _.isNil(resourceType)) {
      throw new errors.InvalidInput({
        message: `the resourceId and resourceType are required`
      });
    }

    switch (resourceType) {
      case resourceTypeEnum.engine: {
        try {
          resource = await serviceContext.dal.engine.getEngine(context, {
            id: resourceId
          });
        } catch (err) {
          throw new errors.NotFound({
            message: `the engine was not found by id: '${resourceId}'`
          });
        }
        if (!_.isNil(resource)) {
          resourceAlias = _.get(resource, 'aliasId');
        }
      }
    }

    return resourceAlias;
  }

  async function packageUpdateResourcesDb({
    packageId,
    packageResource,
    organizationId,
    context,
    dbWrite,
    allowRemovalOfPrimary
  }) {
    const { resourceType, resourceId, action } = packageResource;
    const resourceAlias = await _getResourceAlias(context, packageResource);

    if (!_.isObject(dbWrite) || _.isEmpty(dbWrite)) {
      throw new Error(
        'missing existing transaction when attempting to update resources'
      );
    }

    if (_.isNil(action)) {
      throw new Error('Missing resource action');
    }

    if (action === 'REMOVE' && !allowRemovalOfPrimary) {
      // Check that we are not trying to remove primary resource from package
      const resPackages = await serviceContext.dal.packages.getPackages(
        context,
        {
          id: packageId
        }
      );
      if (
        !_.isEmpty(resPackages.records) &&
        resPackages.records[0].primaryResourceId === resourceId
      ) {
        throw new errors.InvalidInput({
          message:
            "Cannot remove a package's primary resource. Please check your input or change the package's primary resource and try again."
        });
      }
    }

    const columns = [];
    const sqlValues = [];
    const sqlWhere = [];
    const args = [];

    args.push(packageId);
    columns.push('package_id');
    sqlValues.push('$' + args.length);
    sqlWhere.push('package_id = $' + args.length);

    args.push(_.snakeCase(resourceType));
    columns.push('resource_type');
    sqlValues.push('$' + args.length);
    sqlWhere.push('resource_type = $' + args.length);

    args.push(resourceId);
    sqlValues.push('$' + args.length);
    columns.push('resource_id');
    sqlWhere.push('resource_id = $' + args.length);

    // optional, when removing a resource, use the specific resource alias rather than the generated one,
    // and when adding a resource, use either the specific resource alias or the generated one.
    if (resourceAlias) {
      args.push(resourceAlias);
      sqlValues.push('$' + args.length);
      columns.push('resource_alias');
      sqlWhere.push('resource_alias = $' + args.length);
    }
    const userId = await getUserId(context, organizationId);
    args.push(userId);
    columns.push('created_by');
    sqlValues.push('$' + args.length);
    columns.push('modified_by');
    sqlValues.push('$' + args.length);

    const sqlInsert = `
      INSERT INTO aiware.package__resource (${columns.join(', ')})
      VALUES (${sqlValues.join(', ')})
      ON CONFLICT ON CONSTRAINT unq_package_resource_id
      DO UPDATE SET resource_alias = EXCLUDED.resource_alias
      RETURNING *
    `;

    const sqlDelete = `
      DELETE FROM aiware.package__resource
      WHERE ${sqlWhere.join(' AND ')}
      RETURNING *
    `;

    return await dbWrite
      .one(
        action === 'REMOVE' ? sqlDelete : sqlInsert,
        args,
        mapper.mapPackageResources
      )
      .then(
        (row) => {
          if (!_.isObject(row)) {
            throw new Error('resources were not updated');
          }

          return { error: null, row };
        },
        (error) => {
          return { error, row: null };
        }
      )
      .catch((error) => {
        return { error, row: null };
      });
  }

  /**
   * validates the input for PackageUpdateGrants
   * @param {*} input: the params for PackageUpdateGrants
   * @returns { packageId, packageGrants }
   */
  function _validateInputPackageUpdateGrants(input) {
    const { packageId, packageGrants } = input || {};
    const msgErr =
      'The request input did not pass validation checks. See the data section for detail on validation errors.';
    if (_.isNil(packageId)) {
      throw new errors.InvalidInput({
        message: msgErr,
        data: {
          validationErrors: [
            {
              fieldName: 'packageId',
              fieldValue: packageId,
              message: 'packageId is required'
            }
          ]
        }
      });
    }

    if (
      _.isNil(packageGrants) ||
      !_.isArray(packageGrants) ||
      _.isEmpty(packageGrants)
    ) {
      throw new errors.InvalidInput({
        message: msgErr,
        data: {
          validationErrors: [
            {
              fieldName: 'packageGrants',
              fieldValue: packageGrants,
              message: 'packageGrants is invalid'
            }
          ]
        }
      });
    }

    const grantTypes = [grantType.GRANT, grantType.VIEW, grantType.DENY];
    const packageGrantActions = [
      packageGrantAction.ADD,
      packageGrantAction.REMOVE
    ];

    for (const packageGrant of packageGrants) {
      if (
        _.isNil(packageGrant.organizationId) ||
        _.isNil(packageGrant.grantType) ||
        _.isNil(packageGrant.action)
      ) {
        throw new errors.InvalidInput({
          message: msgErr,
          data: {
            validationErrors: [
              {
                fieldName: 'packageGrant',
                fieldValue: packageGrant,
                message:
                  'packageGrants is invalid: missing organizationId or grantType or action'
              }
            ]
          }
        });
      }

      if (!packageGrantActions.includes(packageGrant.action)) {
        throw new errors.InvalidInput({
          message: msgErr,
          data: {
            validationErrors: [
              {
                fieldName: 'packageGrant.action',
                fieldValue: packageGrant.action,
                message: 'The package grant action is invalid.'
              }
            ]
          }
        });
      }

      if (!grantTypes.includes(packageGrant.grantType)) {
        throw new errors.InvalidInput({
          message: msgErr,
          data: {
            validationErrors: [
              {
                fieldName: 'packageGrant.grantType',
                fieldValue: packageGrant.grantType,
                message: 'The package grant type is invalid.'
              }
            ]
          }
        });
      }
    }

    return { packageId, packageGrants };
  }

  async function _validatePackageGrantsAccess(context, input) {
    const { packageIds, packageGrants } = input;
    const authorizedOrgIds = _.get(
      context,
      '_authInfo.authorizedOrganizationIds',
      [_.get(context, '_authInfo.organization.organizationId')]
    ).map((x) => _.toString(x));
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    for (const packageId of packageIds) {
      if (_.isNil(packageId)) {
        throw new errors.InvalidInput({
          message: 'Package Id is a required input'
        });
      }

      const isUserOrgAuthorized = await _checkPackageGrantAuthorization(
        context,
        packageId
      );

      if (!isUserOrgAuthorized) {
        throw new errors.NotAllowed({
          message: 'Not Authorized to grant package access.'
        });
      }

      const packageOrgId = await getPackageOrgId(packageId);
      const tokenType = resUtil.getTokenType(context);
      const isInternalToken = tokenType === 'internal';
      for (const packageGrant of packageGrants) {
        if (
          !isSuperAdmin &&
          !isInternalToken &&
          packageGrant.grantType !== grantType.VIEW &&
          !_.includes(authorizedOrgIds, _.toString(packageGrant.organizationId))
        ) {
          throw new errors.NotAllowed({
            message: `Not Authorized to grant package access for the specified organization.`,
            data: {
              validationErrors: [
                {
                  fieldName: 'packageGrant.organizationId',
                  fieldValue: packageGrant.organizationId,
                  message: 'The package grant type and/or target is invalid.'
                }
              ]
            }
          });
        }
      }
    }
  }

  /**
   * Add/ update package grants
   * @param {*} input: { packageId, packageGrants }
   * @param {*} context
   * @param {*} existingDbWrite
   * @returns Package info
   */
  async function packageUpdateGrants(input, context, existingDbWrite) {
    const { packageId, packageGrants } = _validateInputPackageUpdateGrants(
      input
    );
    try {
      // Gather all packageIds
      const packageIds = [packageId];
      const nestedPackages = await getNestedResources(context, {
        packageId,
        resourceType: resourceTypeEnum.package
      });
      for (const nestedPackage of nestedPackages.records) {
        // for nested resources (including packages), packageId is the
        // parenting package. So, in this case, resourceId refers
        // to the current packageId of the package resource
        if (_.indexOf(packageIds, nestedPackage.resourceId) < 0) {
          packageIds.push(nestedPackage.resourceId);
        }
      }

      // check packageGrant access
      await _validatePackageGrantsAccess(context, {
        packageIds,
        packageGrants
      });
      const promises = [];

      // get package resources before granting
      const allResourcesDb = await getPackageResources(context, {
        packageIds,
        resourceType: [
          resourceTypeEnum.engine,
          resourceTypeEnum.application,
          resourceTypeEnum.library
        ]
      });
      const allResources = _.get(allResourcesDb, 'records', []);
      const engineResources = allResources.filter(
        (o) => o.resourceType === resourceTypeEnum.engine
      );
      const applicationResources = allResources.filter(
        (o) => o.resourceType === resourceTypeEnum.application
      );
      const libraryResources = allResources.filter(
        (o) => o.resourceType === resourceTypeEnum.library
      );

      // TODO: AWT-11710 extract engine/application whitelisting out the the loop below
      // ideally in a subroutine
      const dbWrite =
        _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
          ? serviceContext.dbConnections['core'].write.tx
          : existingDbWrite.task;

      return await dbWrite('packageUpdateGrants', async (t) => {
        const resourcesToAddOrRemoveFromOrg = [];
        for (const packageGrant of packageGrants) {
          // 1. Update package grants in DB: Returns a list of package Ids have an update on the grant for the org
          const {
            packageIds: changedPackageIds
          } = await _packageUpdateGrantDbMulti(
            context,
            packageIds,
            packageGrant,
            t
          );
          if (_.isEmpty(changedPackageIds)) {
            continue;
          }

          // Get resources by packageIds that have the change in the grant
          const { resourceIds: engineIds } = _formatResources(
            engineResources,
            changedPackageIds
          );
          const {
            resourceIds: applicationIds,
            resourceIdsGroupByPackage: appIdsGroupByPackage
          } = _formatResources(applicationResources, changedPackageIds);
          const { resourceIds: libraryIds } = _formatResources(
            libraryResources,
            changedPackageIds
          );

          // 2. Get a list of resources to add/ remove
          const _resourcesToAddOrRemove = await _checkResourcesToAddOrRemoveFromOrg(
            context,
            {
              packageId,
              packageIds: changedPackageIds,
              packageGrant,
              engineIds: engineIds,
              applicationIds: applicationIds,
              libraryIds: libraryIds,
              appIdsGroupByPackage,
              promisesRef: promises,
              t
            }
          );
          if (!_.isNil(_resourcesToAddOrRemove)) {
            resourcesToAddOrRemoveFromOrg.push(_resourcesToAddOrRemove);
          }
        }

        // 3. Add/ remove access to resources
        await _packageUpdateGrantsResources(
          context,
          resourcesToAddOrRemoveFromOrg,
          promises,
          t
        );

        // 4. Events for package update grant & Events when adding/ removing resources
        if (promises.length > 0) {
          await mainUtil.runPromiseAll(promises);
        }

        // 5. Get package
        const packageResult = await getPackages(
          context,
          {
            id: packageId
          },
          false,
          t.task
        );
        return packageResult.records[0];
      }).catch((err) => {
        throw new errors.InternalServerError(err);
      });
    } catch (err) {
      // emit audit log events about failed operation
      for (const pG of packageGrants) {

        let eventTypeInfo;
        switch (pG.action.toUpperCase()) {
          case packageGrantAction.REMOVE:
            eventTypeInfo = eventsMap.PackageGrantRemoved;
            break;
          case packageGrantAction.ADD:
            eventTypeInfo = eventsMap.PackageGrantSet;
            break;
          default:
            eventTypeInfo = null;
        }
        if (eventTypeInfo) {
          await emitPublicPackageGrantEvent(context, eventTypeInfo, {
            packageId: packageId,
            grantType: pG.grantType,
            organizationId: pG.organizationId,
            error: err
          });
        }
      }
      throw err;
    }
  }

  async function _getSolelyOwnedResources(
    context,
    organizationId,
    ids,
    excludedPackageId,
    dbWrite,
    resourceTypes = []
  ) {
    ids = ids || [];
    if (!ids.length) {
      return ids;
    }

    const packageIds = _.isArray(excludedPackageId)
      ? excludedPackageId
      : [excludedPackageId];
    // Check package resource usage by organization Id in other packages (not in the input package)
    const allowedResources = await getAccessiblePackageResources(
      context,
      {
        organizationId,
        resourceIds: ids,
        excludedPackageIds: packageIds,
        excludeViewOnly: true,
        resourceTypes: resourceTypes
      },
      _.get(dbWrite, 'task')
    );
    const allowedIds = _.map(allowedResources, 'resourceId');
    if (_.isEmpty(allowedIds)) {
      return ids;
    }

    // Find ids that we can remove access to them. Get ids are not in allowedIds
    return _.difference(ids, allowedIds);
  }

  /**
   * Check and return resources need to be added/removed from an org base on
   * update package grant for the org
   * @param {*} context
   * @param {*} args {
   *  - packageId: the package id in packageUpdateGrant
      - packageIds: [], // included the parent package and nested packages
      - packageGrant: object included the org id, grantType, action
      - engineIds
      - applicationIds
      - appIdsGroupByPackage
      - promisesRef = null,
      - existingDbWrite = null
    * }
    * @returns an object: {
      orgId,
      engine: {
        add: [],
        remove: []
      },
      application: {
        add: [],
        remove: []
      }
    }
  */
  async function _checkResourcesToAddOrRemoveFromOrg(context, args) {
    const {
      packageId,
      packageIds,
      packageGrant,
      engineIds = [],
      applicationIds = [],
      libraryIds = [],
      appIdsGroupByPackage = [],
      promisesRef = [],
      existingDbWrite = null
    } = args || {};

    if (_.isNil(packageId)) {
      throw new Error('missing package id');
    }
    if (_.isNil(packageGrant)) {
      throw new Error('missing packageGrant');
    }
    if (
      _.isNil(packageGrant.organizationId) ||
      _.isNil(packageGrant.grantType) ||
      _.isNil(packageGrant.action)
    ) {
      throw new Error('packageGrant is invalid');
    }
    // No packages need to check
    if (!_.isArray(packageIds) || _.isEmpty(packageIds)) {
      return null;
    }
    const result = {
      orgId: packageGrant.organizationId,
      engine: {
        add: [],
        remove: []
      },
      application: {
        add: [],
        remove: []
      },
      library: {
        add: [],
        remove: []
      }
    };

    const isGrant = packageGrant.grantType.toUpperCase() === grantType.GRANT;
    const isViewOrDeny =
      packageGrant.grantType.toUpperCase() === grantType.VIEW ||
      packageGrant.grantType.toUpperCase() === grantType.DENY;
    let event;

    if (isGrant) {
      switch (packageGrant.action.toUpperCase()) {
        // packageGrantAction.REMOVE
        case packageGrantAction.REMOVE: {
          // check and remove engines, applications from whitelist
          const resourcesToRemove = await _getResourcesForPackageGrantRemove(
            context,
            packageIds,
            { engineIds, applicationIds, libraryIds },
            packageGrant.organizationId,
            existingDbWrite
          );
          result.engine.remove = resourcesToRemove.engineIds;
          result.application.remove = resourcesToRemove.applicationIds;
          result.library.remove = resourcesToRemove.libraryIds;
          event = {
            eventName: PACKAGE_GRANT_REMOVED_EVENT,
            eventObj: eventsMap.PackageGrantRemoved,
            grantType: grantType.GRANT
          };
          break;
        }
        // packageGrantAction.ADD
        case packageGrantAction.ADD: {
          result.engine.add = engineIds;
          result.application.add = applicationIds;
          result.library.add = libraryIds;

          event = {
            eventName: PACKAGE_GRANT_SET_EVENT,
            eventObj: eventsMap.PackageGrantSet,
            grantType: grantType.GRANT
          };

          break;
        }
      }

      if (!_.isEmpty(appIdsGroupByPackage[packageId] || [])) {
        // refresh routing cache when an organization is granted access to application resources.
        promisesRef.push(() =>
          serviceContext.dal.event.emitInternalCacheUpdate(context)
        );
      }
    }

    // Grant type is VIEW or DENY
    if (isViewOrDeny) {
      // check and remove engines, applications from whitelist
      const resourcesToRemove = await _getResourcesForPackageGrantRemove(
        context,
        packageIds,
        { engineIds, applicationIds, libraryIds },
        packageGrant.organizationId,
        existingDbWrite
      );
      result.engine.remove = resourcesToRemove.engineIds;
      result.application.remove = resourcesToRemove.applicationIds;
      result.library.remove = resourcesToRemove.libraryIds;

      event = {
        eventName: PACKAGE_GRANT_REMOVED_EVENT,
        eventObj: eventsMap.PackageGrantRemoved,
        grantType: grantType.GRANT
      };
    }

    if (event) {
      const emitPublicPackageGrantEventRef = () =>
        emitPublicPackageGrantEvent(context, event.eventObj, {
          packageId: packageId,
          grantType: event.grantType,
          organizationId: packageGrant.organizationId,
          applicationIds: appIdsGroupByPackage[packageId] || []
        });

      promisesRef.push(emitPublicPackageGrantEventRef);
    }

    return result;
  }

  /**
   *
   * @param {*} context
   * @param {*} packageId: this can be a value or an array
   * @param { object } resources: { engineIds, applicationIds }
   * @param {*} organizationId
   * @param {*} existingDbWrite
   * @returns engineIds and applicationIds need to be remove access from the org { engineIds: [], applicationIds: [] }
   */
  async function _getResourcesForPackageGrantRemove(
    context,
    packageId,
    resources,
    organizationId,
    existingDbWrite = null
  ) {
    const { engineIds, applicationIds, libraryIds } = resources;
    const packageIds = _.isArray(packageId) ? packageId : [packageId];
    const result = {
      engineIds: [],
      applicationIds: [],
      libraryIds: []
    };

    if (!_.isEmpty(engineIds)) {
      // Get all package resource by organization Id, resource type, resource Ids
      // The result is resources that are not in other packages but in the input packages
      let engineIdsToRemove = await _getSolelyOwnedResources(
        context,
        organizationId,
        engineIds,
        packageIds,
        existingDbWrite,
        [resourceTypeEnum.engine]
      );
      if (!_.isEmpty(engineIdsToRemove)) {
        // Check engines and ignore if they are owned by the org
        const _lstAllEnginesByOwnerOrg = await serviceContext.dal.engine.getEngines(
          context,
          {
            ids: engineIdsToRemove,
            organizationId,
            limit: engineIdsToRemove.length,
            owned: true
          }
        );
        const engineIdsByOwnerOrg = _.get(
          _lstAllEnginesByOwnerOrg,
          'records',
          []
        ).map((o) => o.id);
        if (!_.isEmpty(engineIdsByOwnerOrg)) {
          engineIdsToRemove = engineIdsToRemove.filter(
            (engId) => !engineIdsByOwnerOrg.includes(engId)
          );
        }
        // Save engineIds need to remove access from the org
        result.engineIds = engineIdsToRemove || [];
      }
    }

    if (!_.isEmpty(applicationIds)) {
      let appIdsToRemove = await _getSolelyOwnedResources(
        context,
        organizationId,
        applicationIds,
        packageIds,
        existingDbWrite,
        [resourceTypeEnum.application]
      );

      if (!_.isEmpty(appIdsToRemove)) {
        // filter out apps owned by the org
        const ownedApplications = await serviceContext.dal.application.getApplications(
          {
            applicationIds,
            organizationId,
            owned: true
          },
          context
        );
        const appIdsByOwnerOrg = _.get(ownedApplications, 'records', []).map(
          (o) => o.id
        );
        if (!_.isEmpty(appIdsByOwnerOrg)) {
          appIdsToRemove = appIdsToRemove.filter(
            (id) => !appIdsByOwnerOrg.includes(id)
          );
        }

        // Save appIds need to remove access from the org
        result.applicationIds = appIdsToRemove || [];
      }
    }

    if (!_.isEmpty(libraryIds)) {
      const libraryIdsToRemove = await _getSolelyOwnedResources(
        context,
        organizationId,
        libraryIds,
        packageIds,
        existingDbWrite,
        [resourceTypeEnum.library]
      );
      result.libraryIds = libraryIdsToRemove || [];
    }

    return result;
  }

  /**
   * Add or remove access to resources from organizations via packageUpdateGrants
   * @param {*} context
   * @param {*} resources [{"orgId":"number","engine":{"add":[],"remove":[]},"application":{"add":[],"remove":[]}}]
   * @param {*} existingDbWrite
   */
  async function _packageUpdateGrantsResources(
    context,
    resources,
    eventPromises = null,
    existingDbWrite = null
  ) {
    // [{"orgId":"number","engine":{"add":[],"remove":[]},"application":{"add":[],"remove":[]}}]
    resources = resources || [];
    eventPromises = eventPromises || [];
    const resourcesPromises = [];

    // Collect data to update/ revert
    // Because adding or removing application via core-admin API, not DB directly
    const applicationResources = {
      add: [],
      remove: []
    };

    // Library access is granted/revoked via library_collaborator.
    const libraryResources = {
      add: [],
      remove: []
    };

    // 1. No resources to add/ remove
    if (_.isEmpty(resources)) {
      return;
    }

    // 2. Check resources to add/ remove from org
    for (const rsData of resources) {
      if (_.isNil(rsData.orgId)) {
        throw new Error('orgId is required');
      }

      // Applications
      const application = _.get(rsData, 'application', {});
      if (_.isArray(application.add) && !_.isEmpty(application.add)) {
        applicationResources.add.push({
          orgId: rsData.orgId,
          ids: application.add
        });
      }
      if (_.isArray(application.remove) && !_.isEmpty(application.remove)) {
        applicationResources.remove.push({
          orgId: rsData.orgId,
          ids: application.remove
        });
      }

      // Libraries
      const library = _.get(rsData, 'library', {});
      if (_.isArray(library.add) && !_.isEmpty(library.add)) {
        libraryResources.add.push({
          orgId: rsData.orgId,
          ids: library.add
        });
      }
      if (_.isArray(library.remove) && !_.isEmpty(library.remove)) {
        libraryResources.remove.push({
          orgId: rsData.orgId,
          ids: library.remove
        });
      }

      // Engines
      const engine = _.get(rsData, 'engine', {});
      // add
      if (_.isArray(engine.add) && !_.isEmpty(engine.add)) {
        resourcesPromises.push(() =>
          serviceContext.dal.organization.addToEngineWhitelist(
            context,
            {
              toAdd: {
                organizationId: rsData.orgId,
                engineIds: engine.add
              }
            },
            eventPromises,
            existingDbWrite
          )
        );
      }
      // remove
      if (_.isArray(engine.remove) && !_.isEmpty(engine.remove)) {
        resourcesPromises.push(() =>
          serviceContext.dal.organization.deleteFromEngineWhitelist(context, {
            toDelete: {
              organizationId: rsData.orgId,
              engineIds: engine.remove
            },
            eventPromises,
            existingDbWrite
          })
        );
      }
    }

    // 3. Add/ remove applications/ engines and handle the error
    // 3.1. Call API to add/ remove applications from organization
    if (
      !_.isEmpty(applicationResources.add) ||
      !_.isEmpty(applicationResources.remove)
    ) {
      // 3.1.1. Add/ remove apps
      await addOrRemoveApplications(context, {
        add: applicationResources.add,
        remove: applicationResources.remove,
        autoRevert: true,
        shouldThrowError: true
      });
    }

    try {
      // 3.2. Add/ remove engines
      if (resourcesPromises.length > 0) {
        await mainUtil.runPromiseAll(resourcesPromises);
      }

      // 3.3. Add/ remove library collaborators.
      if (
        !_.isEmpty(libraryResources.add) ||
        !_.isEmpty(libraryResources.remove)
      ) {
        await addOrRemoveLibraryCollaborators(context, {
          add: libraryResources.add,
          remove: libraryResources.remove,
          autoRevert: true,
          shouldThrowError: true
        });
      }
    } catch (err) {
      serviceContext.logger.error(err);
      // Revert the changes for application via core-admin API
      await addOrRemoveApplications(context, {
        add: applicationResources.remove,
        remove: applicationResources.add,
        autoRevert: false,
        shouldThrowError: false
      });

      // Throw error
      throw new errors.InternalServerError(err);
    }
  }

  /**
   * Call core-admin API to add/ remove applications from organization
   * @param {*} context
   * @param {*} resources: { add: [{ orgId, ids}], remove: [{ orgId, ids}] }
   * @param {*} autoRevert: Auto revert if we have any failures
   * @param {*} shouldThrowError: Throw error if have any exception
   * @returns
   */
  async function addOrRemoveApplications(
    context,
    resources,
    autoRevert = true,
    shouldThrowError = true
  ) {
    serviceContext.logger.info(
      `(addOrRemoveApplications) autoRevert: ${autoRevert}, shouldThrowError: ${shouldThrowError}`
    );
    // [{"orgId":"number","engine":{"add":[],"remove":[]},"application":{"add":[],"remove":[]}}]
    resources = resources || {};
    const { add: appsToAdd = [], remove: appsToRemove = [] } = resources;
    const applicationsTracking = {
      add: [],
      remove: []
    };
    try {
      // 1. Call API to add/ remove applications from organization
      if (!_.isEmpty(appsToAdd) || !_.isEmpty(appsToRemove)) {
        // 1.1. Add apps
        for (const appData of appsToAdd) {
          try {
            await serviceContext.coreAdmin.addApplicationsForOrganization(
              {
                orgId: appData.orgId,
                applicationIds: appData.ids
              },
              context
            );

            // create app OLP objects in the org
            for (const appId of appData.ids) {
              const app = await serviceContext.dal.application.getApplication({
                id: appId,
                adminView: true
              });
              await serviceContext.bll.application._createPermissionSetsAndACEs(
                context,
                appData.orgId,
                app
              );
            }

            // Add to Done list
            applicationsTracking.add.push(appData);
          } catch (errApp) {
            serviceContext.logger.error(`(addApplications)`, errApp);
            if (shouldThrowError) {
              throw errApp;
            }
          }
        }

        // 1.2. Remove apps
        for (const appData of appsToRemove) {
          try {
            await serviceContext.coreAdmin.removeApplicationsForOrganization(
              appData.ids,
              appData.orgId,
              context
            );

            // Add to Done list
            applicationsTracking.remove.push(appData);
          } catch (errApp) {
            serviceContext.logger.error(`(removeApplications)`, errApp);
            if (shouldThrowError) {
              throw errApp;
            }
          }
        }
      }
    } catch (err) {
      serviceContext.logger.error(err);

      // Revert the change
      await addOrRemoveApplications(
        context,
        {
          add: applicationsTracking.remove,
          remove: applicationsTracking.add
        },
        false,
        false
      );
      // Throw error or not
      if (shouldThrowError) {
        throw new errors.InternalServerError(err);
      }
    }
  }

  function _isLibraryCollaboratorAlreadyExists(err) {
    return (
      _.get(err, 'code') === '23505' ||
      _.get(err, 'name') === 'resource_conflict' ||
      err instanceof errors.ResourceConflict
    );
  }

  function _isLibraryCollaboratorNotFound(err) {
    return _.get(err, 'name') === 'not_found' || err instanceof errors.NotFound;
  }

  /**
   * Grant/revoke a receiving org's access to Libraries by creating/deleting
   * library_collaborator rows — the whitelist-grant analog of engine whitelisting.
   * @param {*} context
   * @param {*} resources { add: [{ orgId, ids }], remove: [{ orgId, ids }] }
   * @param {boolean} autoRevert revert applied changes if a later change fails
   * @param {boolean} shouldThrowError rethrow on failure
   */
  async function addOrRemoveLibraryCollaborators(
    context,
    resources,
    autoRevert = true,
    shouldThrowError = true
  ) {
    serviceContext.logger.info(
      `(addOrRemoveLibraryCollaborators) autoRevert: ${autoRevert}, shouldThrowError: ${shouldThrowError}`
    );
    resources = resources || {};
    const { add: librariesToAdd = [], remove: librariesToRemove = [] } = resources;
    const tracking = {
      add: [],
      remove: []
    };
    try {
      for (const libData of librariesToAdd) {
        const addedIds = [];
        for (const libraryId of libData.ids) {
          try {
            await serviceContext.dal.library.createLibraryCollaborator(context, {
              input: {
                libraryId,
                organizationId: libData.orgId,
                permissions: LIBRARY_GRANT_PERMISSIONS,
                status: 'active'
              }
            });
            addedIds.push(libraryId);
          } catch (errLib) {
            if (_isLibraryCollaboratorAlreadyExists(errLib)) {
              continue;
            }
            throw errLib;
          }
        }
        if (!_.isEmpty(addedIds)) {
          tracking.add.push({ orgId: libData.orgId, ids: addedIds });
        }
      }

      for (const libData of librariesToRemove) {
        const removedIds = [];
        for (const libraryId of libData.ids) {
          try {
            await serviceContext.dal.library.deleteLibraryCollaborator({
              libraryId,
              organizationId: libData.orgId
            });
            removedIds.push(libraryId);
          } catch (errLib) {
            if (_isLibraryCollaboratorNotFound(errLib)) {
              continue;
            }
            throw errLib;
          }
        }
        if (!_.isEmpty(removedIds)) {
          tracking.remove.push({ orgId: libData.orgId, ids: removedIds });
        }
      }
    } catch (err) {
      serviceContext.logger.error(`(addOrRemoveLibraryCollaborators)`, err);
      if (autoRevert) {
        // Revert applied changes: undo grants and re-grant revocations.
        await addOrRemoveLibraryCollaborators(
          context,
          {
            add: tracking.remove,
            remove: tracking.add
          },
          false,
          false
        );
      }
      if (shouldThrowError) {
        throw new errors.InternalServerError(err);
      }
    }
  }

  async function getUserId(context, organizationId) {
    const tokenInfo = _.get(context, 'requestContext.tokenInfo', {});
    const userInfo = _.get(context, 'requestContext.userInfo', {});
    let userId =
      _.get(context, '_authInfo.userId') ||
      userInfo.userId ||
      tokenInfo.userId ||
      tokenInfo.applicationId ||
      mainUtil.getOrganizationGuid(context);

    if (!_.isString(userId) || !validator.isUUID(userId)) {
      userId = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
    }
    if (_.isNil(userId)) {
      return '00000000-0000-0000-0000-000000000000';
    }
    return userId;
  }

  /**
   * Updates packageGrants in a transaction
   * @param {*} packageIds: a list of package ids
   * @param {*} packageGrant includes organizationId, grantType, action
   * @param {*} context
   * @param {*} existingDbWrite transaction
   * @returns
   */
  async function _packageUpdateGrantDbMulti(
    context,
    packageIds,
    packageGrant,
    existingDbWrite = null
  ) {
    let result = [];
    if (_.isNil(packageIds) || _.isNil(packageGrant)) {
      throw new Error('packageIds and packageGrant are required');
    }

    const _packageIds = _.isArray(packageIds) ? packageIds : [packageIds];
    if (_.isEmpty(_packageIds)) {
      throw new Error('packageIds should not be empty');
    }
    if (
      _.isNil(packageGrant.organizationId) ||
      _.isNil(packageGrant.grantType) ||
      _.isNil(packageGrant.action)
    ) {
      throw new Error('packageGrant is invalid');
    }

    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? serviceContext.dbConnections['core'].write.tx
        : existingDbWrite.task;
    const changedPackageIds = [];
    const isGrant = packageGrant.grantType.toUpperCase() === grantType.GRANT;
    const isViewOrDeny =
      packageGrant.grantType.toUpperCase() === grantType.VIEW ||
      packageGrant.grantType.toUpperCase() === grantType.DENY;
    let sql = '',
      sqlArgs = [];

    // Get package grants by organization id
    const _packageGrantsByOrg = await getPackageGrantsByOrgId(
      context,
      packageGrant.organizationId,
      {
        packageIds: _packageIds
      },
      dbWrite
    );
    const packageGrantsByOrg = _.get(_packageGrantsByOrg, 'records', []);
    for (const id of _packageIds) {
      // 1. Check current data
      let grantChanged = false;
      const currPackageGrant = packageGrantsByOrg.find(
        (o) => o.packageId === id
      );
      // Check to see any changes on the package grant
      if (!_.isNil(currPackageGrant)) {
        // 1. The grant exits: change grant type or going to REMOVE grant
        if (
          currPackageGrant.grantType !== packageGrant.grantType ||
          packageGrant.action === packageGrantAction.REMOVE
        ) {
          grantChanged = true;
          // VIEW OR DENY type: only remove access to resources if the package has been granted
          if (
            isGrant ||
            (isViewOrDeny && currPackageGrant.grantType === grantType.GRANT)
          ) {
            changedPackageIds.push(id);
          }
        }
      } else {
        // 2. The grant does not exit and going to add new grant
        if (packageGrant.action === packageGrantAction.ADD) {
          grantChanged = true;
          if (isGrant) {
            changedPackageIds.push(id);
          }
        }
      }

      if (grantChanged) {
        // Build update/ delete query
        const _result = await _getPackageUpdateGrantDbQuery(
          context,
          id,
          packageGrant,
          sqlArgs
        );
        if (!_.isEmpty(_result.sql)) {
          sql += _result.sql;
        }
      }
    }

    // Add or update package grants
    if (sqlArgs.length > 0 && sql !== '') {
      const _result = await packageUpdateGrantsDb(
        sql,
        sqlArgs,
        existingDbWrite
      );
      if (!_.isNil(_result) && !_.isEmpty(_result.error)) {
        throw _result.error;
      }
      result = _result.rows;
    }

    return { result, packageIds: changedPackageIds };
  }

  async function packageUpdateGrantDb(
    packageId,
    packageGrant,
    context,
    existingDbWrite = null
  ) {
    const { organizationId, grantType, action } = packageGrant;

    if (_.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)) {
      throw new Error('missing transaction in context');
    }

    const dbWrite = existingDbWrite.task;

    const { sql, sqlArgs } = _getPackageUpdateGrantDbQuery(
      context,
      packageId,
      packageGrant
    );

    return await dbWrite('packageUpdateGrantDb', async (t) => {
      return await t.one(sql, sqlArgs, mapper.mapPackageGrant);
    })
      .then(
        (row) => {
          if (!_.isObject(row)) {
            throw new errors.InternalServerError({
              message: 'packageUpdateGrant failed to update the database',
              data: {
                packageId,
                organizationId,
                grantType
              }
            });
          }

          return { error: null, row };
        },
        (error) => {
          return { error: _.get(error, 'data.internalData', error), row: null };
        }
      )
      .catch((error) => {
        return { error, row: null };
      });
  }

  async function packageUpdateGrantsDb(
    sql = '',
    sqlArgs = [],
    existingDbWrite = null
  ) {
    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? serviceContext.dbConnections['core'].write.tx
        : existingDbWrite.task;

    if (_.isNil(dbWrite)) {
      throw new Error('missing transaction in context');
    }

    return await dbWrite('packageUpdateGrantsDb', async (t) => {
      return await t.map(sql, sqlArgs, mapper.mapPackageGrant);
    })
      .then(
        (rows) => {
          if (!(_.isObject(rows) || _.isArray(rows))) {
            throw new errors.InternalServerError({
              message: 'packageUpdateGrants failed to update the database'
            });
          }

          return { error: null, rows };
        },
        (error) => {
          return {
            error: _.get(error, 'data.internalData', error),
            rows: null
          };
        }
      )
      .catch((error) => {
        return { error, rows: null };
      });
  }

  async function _getPackageUpdateGrantDbQuery(
    context,
    packageId,
    packageGrant,
    sqlArgs = []
  ) {
    const { organizationId, grantType, action } = packageGrant;

    const sqlSet = [];
    const columns = [];
    const sqlValues = [];
    const sqlWhere = [];
    sqlArgs = sqlArgs || [];

    sqlArgs.push(packageId);
    columns.push('package_id');
    sqlValues.push('$' + sqlArgs.length);
    sqlWhere.push('package_id = $' + sqlArgs.length);

    sqlArgs.push(organizationId);
    columns.push('organization_id');
    sqlValues.push('$' + sqlArgs.length);
    sqlWhere.push('organization_id = $' + sqlArgs.length);

    sqlArgs.push(grantType);
    sqlValues.push('$' + sqlArgs.length);
    columns.push('grant_type');
    sqlSet.push('grant_type = $' + sqlArgs.length);
    sqlWhere.push('grant_type = $' + sqlArgs.length);

    const userId = await getUserId(context, organizationId);

    sqlArgs.push(userId);
    columns.push('created_by');
    sqlValues.push('$' + sqlArgs.length);
    columns.push('modified_by');
    sqlValues.push('$' + sqlArgs.length);

    const sqlInsert = `
      INSERT INTO aiware.package__organization (${columns.join(', ')})
      VALUES (${sqlValues.join(', ')})
      ON CONFLICT ON CONSTRAINT pk_package__organization
      DO UPDATE SET ${sqlSet.join(', ')}
      RETURNING *;
    `;

    const sqlDelete = `
      DELETE FROM aiware.package__organization
      WHERE ${sqlWhere.join(' AND ')}
      RETURNING *;
    `;

    const sql = action === packageGrantAction.REMOVE ? sqlDelete : sqlInsert;

    return { sql, sqlArgs };
  }

  async function packageUpdateWithoutIncrement(
    packageInput,
    context,
    existingDbWrite,
    preprocessResources
  ) {
    const {
      packageId,
      name,
      status,
      distributionDate,
      distributionType,
      packageIcon,
      deleted,
      aiwareVersion,
      description,
      resources,
      currentPackageStatus,
      currentPackageName,
      primaryResourceId
    } = packageInput;

    let resourcesToUpdate = null;

    if (!_.isEmpty(resources)) {
      const currentPackageResources = await getPackageResources(context, {
        packageId
      });

      resourcesToUpdate = _.filter(resources, (resource) => {
        const existingResource = _.find(currentPackageResources.records, {
          resourceId: resource.resourceId,
          resourceAlias: resource.resourceAlias
        });

        return _.isNil(existingResource) || resource.action !== 'ADD';
      });
    }

    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? serviceContext.dbConnections['core'].write.tx
        : existingDbWrite.task;

    if (!_.isObject(dbWrite)) {
      throw new Error('missing transaction in context');
    }

    const updateInput = {
      package_id: packageId
    };

    if (!_.isNil(name)) {
      updateInput.package_name = name;
    }

    if (!_.isNil(status)) {
      updateInput.status = status;
    }

    if (!_.isNil(distributionDate)) {
      updateInput.distribution_date = distributionDate;
    }

    if (!_.isNil(packageIcon)) {
      updateInput.package_icon = packageIcon;
    }

    if (!_.isNil(deleted)) {
      updateInput.deleted = deleted;
    }

    if (!_.isNil(aiwareVersion)) {
      updateInput.aiware_version = aiwareVersion;
    }

    if (!_.isNil(distributionType)) {
      updateInput.distribution_type = distributionType;
    }

    if (!_.isNil(description)) {
      updateInput.package_description = description;
    }

    const { sql, values } = mainUtil.makeUpdateSql(
      'aiware.package',
      updateInput,
      returningPackage,
      'package_id = $1'
    );
    const res = await dbWrite('packageUpdateWithoutIncrement', async (t) => {
      const result = await t.map(sql, values, mapper.mapPackage);
      if (_.isEmpty(result)) {
        throw new errors.InternalServerError({
          message: 'Package update was not successful'
        });
      }
      if (!_.isEmpty(resourcesToUpdate)) {
        await packageUpdateResources(
          {
            primaryResourceId,
            packageId: result[0].id,
            packageResources: resourcesToUpdate,
            organizationId: result[0].organizationId
          },
          context,
          t,
          { preprocessResources }
        );
      }
      const pkg = result[0];
      if (!context.auditEventEmitted) {
        context.auditEventEmitted = true;
        // use the original name of the package in case the name was changed
        await _emitPackageEventByStatus(context, { ...pkg, name: currentPackageName || name }, currentPackageStatus);
      }
      return pkg;
    }).catch((err) => {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    });
    return res;
  }

  function getGrantAccessConditionsSql(
    grantOrgIdArgN,
    packageTableAlias = 'p'
  ) {
    return `
    (
      ${packageTableAlias}.distribution_type = 'public'::job_new.distribution_type OR
      EXISTS (
        SELECT 1
        FROM aiware.package__organization po
        WHERE po.package_id = ${packageTableAlias}.package_id
        AND po.organization_id = \$${grantOrgIdArgN}
        AND (po.grant_type = 'GRANT'::aiware.aiw_package_grant_enum OR po.grant_type = 'VIEW'::aiware.aiw_package_grant_enum)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM aiware.package__organization po
      WHERE po.package_id = ${packageTableAlias}.package_id
      AND po.organization_id = \$${grantOrgIdArgN}
      AND po.grant_type = 'DENY'::aiware.aiw_package_grant_enum
    )
  `;
  }

  function getPackageAccessValidationSql(
    packageOrgIdArgN,
    grantOrgIdArgN,
    packageTableAlias = 'p'
  ) {
    if (packageOrgIdArgN) {
      return `
      (
        ${packageTableAlias}.organization_id = \$${packageOrgIdArgN} OR
        ${getGrantAccessConditionsSql(grantOrgIdArgN, packageTableAlias)}
      )
    `;
    }
    return getGrantAccessConditionsSql(grantOrgIdArgN, packageTableAlias);
  }

  async function getPackages(
    context,
    options,
    skipPackageAccessValidation = false,
    existingTask = null
  ) {
    const { sql, args } = await _getPackagesQuery(
      context,
      options,
      skipPackageAccessValidation
    );

    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['core'].read.tx
      : existingTask;

    const rows = await dbRead('getPackages', async (t) => {
      return await t.map(sql, args, mapper.mapPackage);
    }).catch((err) => {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    });

    return mainUtil.toPage(options, rows);
  }

  async function _getPackagesQuery(
    context,
    options,
    skipPackageAccessValidation = false
  ) {
    const { packageFilter = {} } = options;
    const caseSensitive = _.get(packageFilter, 'caseSensitive', false);
    const orgId = _.get(
      context,
      'requestContext.userInfo.organization.organizationId'
    );
    const permissions = ['DEVELOPER_ENGINE_READ', 'AIWARE_PACKAGE_READ'];

    const userHasPermissionsResult = await rbacAuthBll.hasPermissions(
      context,
      {
        resourceType: 'Organization',
        // convert orgId to string to ensure consistent comparison with string-based IDs (e.g., returned from id_text),
        ids: [_.toString(orgId)],
        permissions,
        requireAll: false
      },
      true
    );
    const hasDeveloperPermission = _.get(
      userHasPermissionsResult,
      '[0].hasPermission',
      false
    );
    const params = [
      'owned',
      'nameRegexp',
      'id',
      'resourceId',
      'sourceOriginId',
      'sourcePackageId',
      'primaryResourceId',
      'distributionType',
      'status',
      'resourceAlias'
    ];
    const paramsMap = {
      nameRegexp: {
        sql: ` p.package_name ${caseSensitive ? '~' : '~*'} $`
      },
      id: {
        sql: ` p.package_id = $`
      },
      resourceId: {
        sql: ` pr.resource_id = $`
      },
      sourceOriginId: {
        sql: ` p.source_origin_id = $`
      },
      sourcePackageId: {
        sql: ` p.source_package_id = $`
      },
      primaryResourceId: {
        sql: ` prim.resource_id = $`
      },
      distributionType: {
        sql: ` p.distribution_type = $`
      },
      status: {
        sql: ` p.status = $`
      },
      resourceAlias: {
        sql: ` pr.resource_alias = $`
      }
    };
    const callerOrgId = resUtil.getOrgFromAuthContext(context);
    const filterOrgIdIsCallerOrgId =
      _.toString(packageFilter.organizationId) === _.toString(callerOrgId);

    const ctx = { ...context };
    const isSuperAdmin = resUtil.isSuperAdmin(ctx._authInfo);
    const args = [];
    const where = [];

    // Push context org ID as first arg for the contextual grantType LEFT JOIN
    const contextOrgId = (isSuperAdmin && options.orgId) ? options.orgId : callerOrgId;
    args.push(contextOrgId);
    const contextOrgIdArgN = args.length;

    const distinctClause = packageFilter.isLatest
      ? `ON (p.source_origin_id)
        string_to_array(REGEXP_REPLACE(p.package_version,'\\\\.?[^\d\.]+', '', 'gm'),'.')::int[] AS version_array,`
      : '';
    let sql = `
      SELECT
        DISTINCT ${distinctClause}
        p.package_id,
        p.organization_id,
        p.package_name,
        p.package_description,
        p.package_icon,
        p.package_version,
        prim.resource_id as primary_resource_id,
        p.source_package_id,
        p.distribution_type,
        p.source_origin_id,
        p.aiware_version,
        p.deleted,
        p.deprecated,
        p.date_created,
        p.date_modified,
        p.created_by,
        p.modified_by,
        p.package_created_date,
        p.status,
        p.install_date,
        p.distribution_date,
        p.auto_generated,
        CASE
          WHEN p.organization_id = $${contextOrgIdArgN} THEN COALESCE(pog.grant_type, 'GRANT'::aiware.aiw_package_grant_enum)
          ELSE pog.grant_type
        END as context_grant_type
      FROM
        aiware.package p
      LEFT JOIN aiware.package__primary_resource prim ON prim.package_id = p.package_id
      LEFT JOIN aiware.package__organization pog
        ON pog.package_id = p.package_id
        AND pog.organization_id = $${contextOrgIdArgN}
    `;

    if (options.resourceId || options.resourceAlias) {
      sql += `
        LEFT JOIN aiware.package__resource pr ON pr.package_id = p.package_id
      `;
    } else if (packageFilter.primaryResourceType) {
      sql += `
        LEFT JOIN aiware.package__resource pr ON prim.resource_id = pr.resource_id
      `;
    }

    if (!options.includeDeleted) {
      where.push(`COALESCE(p.deleted, FALSE) = FALSE`);
    }

    if (!isSuperAdmin && options.orgId) {
      throw new errors.NotAllowed({
        message:
          `The authenticated user or token does not have privileges to perform this operation. ` +
          `Only a Super Admin or the owner of the Package associated with the ID in the input ` +
          `is authorized to filter by an Organization ID different from theirs.`,
        data: {
          validationErrors: [
            {
              fieldName: 'id',
              fieldValue: options.id
            },
            {
              fieldName: 'orgId',
              fieldValue: options.orgId
            }
          ]
        }
      });
    }

    if (isSuperAdmin && options.orgId) {
      /*
       * Package Access Validation
       *
       * If the caller is a super-admin and passed in an orgId, this adds a subquery to
       * the where clause to return all packages that the specified org has access to,
       * meeting at least one of the following criteria:
       *
       * 1. The package is owned by the specified org
       * 2. The package's distribution type is set to Public AND the package
       *    has not been denied access to the specified org
       * 3. The package has been granted access to the specified org
       */

      let packageOrgIdArgN;
      let grantOrgIdArgN;

      if (_.toString(options.orgId) !== _.toString(callerOrgId)) {
        const inputOrg = await serviceContext.dal.organization.getOrganization(
          context,
          {
            id: options.orgId
          }
        );

        if (_.isNil(inputOrg.id)) {
          throw new errors.InvalidInput({
            message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
            data: {
              validationErrors: [
                {
                  fieldName: 'orgId',
                  fieldValue: options.orgId,
                  message:
                    'The provided Organization ID does not exist. Please check your input and try again.'
                }
              ]
            }
          });
        }

        args.push(options.orgId);
        packageOrgIdArgN = args.length;
        grantOrgIdArgN = args.length;

        where.push(
          getPackageAccessValidationSql(packageOrgIdArgN, grantOrgIdArgN)
        );
      }
    }

    if (!isSuperAdmin && !skipPackageAccessValidation) {
      /*
       * Package Access Validation
       *
       * If the caller is not a super-admin, this adds a subquery to the where
       * clause to only return packages that the caller has access to,
       * meeting at least one of the following criteria:
       *
       * 1. The package is owned by the calling org
       * 2. The package's distribution type is set to Public AND the package
       *    has not been denied access to the caller's org
       * 3. The package has been granted access to the caller's org
       *
       * If the caller is a super-admin and passed in a value for orgId, it will return all
       * packages that belong to the specified org
       * and all packages that the specified org has access to.
       */

      let packageOrgIdArgN;
      let grantOrgIdArgN;
      let callerOrgIdArgN;
      let checkForCallerOrgAccess =
        packageFilter.organizationId && !filterOrgIdIsCallerOrgId;

      if (!options.orgId && !packageFilter.organizationId) {
        args.push(callerOrgId);
        packageOrgIdArgN = args.length;
        grantOrgIdArgN = args.length;
      } else if (packageFilter.organizationId) {
        args.push(packageFilter.organizationId);
        packageOrgIdArgN = args.length;
        grantOrgIdArgN = args.length;

        if (checkForCallerOrgAccess) {
          args.push(callerOrgId);
          callerOrgIdArgN = args.length;
        }
      }
      if (hasDeveloperPermission) {
        where.push(
          getPackageAccessValidationSql(packageOrgIdArgN, grantOrgIdArgN)
        );
      } else {
        where.push(getPackageAccessValidationSql(null, grantOrgIdArgN));
      }

      if (checkForCallerOrgAccess) {
        if (hasDeveloperPermission) {
          where.push(
            getPackageAccessValidationSql(callerOrgIdArgN, callerOrgIdArgN)
          );
        } else {
          where.push(getPackageAccessValidationSql(null, callerOrgIdArgN));
        }
      }
    }

    _.forEach(params, (item) => {
      if (!options[item]) {
        return;
      }
      if (item === 'owned') {
        if (!options.owned) {
          return;
        }

        args.push(options.orgId || callerOrgId);
        where.push(`p.organization_id = $${args.length}`);
        return;
      }
      args.push(options[item]);
      where.push(`${paramsMap[item].sql}${args.length}`);
    });

    if (packageFilter) {
      if (packageFilter.organizationId) {
        args.push(packageFilter.organizationId);
        where.push(`p.organization_id = $${args.length}`);
      }
      if (!_.isEmpty(packageFilter.name) && _.isNil(options.nameRegexp)) {
        // only use this field if `nameRegexp` is not provided
        mainUtil.makeLikeClause(
          'p.package_name',
          packageFilter.name,
          where,
          args,
          packageFilter.nameMatch || 'startsWith',
          packageFilter.caseSensitive
        );
      }
      const filterGrants = packageFilter.grantTypes || (packageFilter.grantType ? [packageFilter.grantType] : []);      // grantTypes array filter (skip if scalar grantType is already applied)
      if (_.isArray(filterGrants) && !_.isEmpty(filterGrants)) {
        const includeOwned = packageFilter.includeOwned === true;
        args.push(filterGrants);
        const grantTypesArgN = args.length;

        if (includeOwned) {
          where.push(
            `(pog.grant_type = ANY($${grantTypesArgN}::aiware.aiw_package_grant_enum[]) OR p.organization_id = $${contextOrgIdArgN})`
          );
        } else {
          where.push(
            `pog.grant_type = ANY($${grantTypesArgN}::aiware.aiw_package_grant_enum[])`
          );
        }
      }
    }

    if (packageFilter && _.has(packageFilter, 'primaryResourceType')) {
      if (_.isNil(packageFilter.primaryResourceType)) {
        where.push(`prim.package_id IS NULL`);
      } else {
        args.push(_.snakeCase(packageFilter.primaryResourceType));
        where.push(`pr.resource_type = $${args.length}`);
      }
    }

    // ids
    if (
      _.isNil(options.id) &&
      _.isArray(options.ids) &&
      !_.isEmpty(options.ids)
    ) {
      args.push(options.ids);
      where.push(`p.package_id = ANY($${args.length}::uuid[])`);
    }

    // distributionTypes
    if (
      _.isNil(options.distributionType) &&
      _.isArray(options.distributionTypes) &&
      !_.isEmpty(options.distributionTypes)
    ) {
      args.push(options.distributionTypes);
      where.push(
        `p.distribution_type = ANY($${args.length}::job_new.distribution_type[])`
      );
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }

    const mapperPackageOrderBy = {
      name: 'p.package_name',
      createdDateTime: 'p.date_created',
      modifiedDateTime: 'p.date_modified',
      distributionType: 'p.distribution_type',
      status: 'p.status'
    };

    let orderBy = ' ORDER BY p.package_name ASC';

    if (options.orderBy) {
      let sqlOrderBy = [];
      for (const value of options.orderBy) {
        const field = mapperPackageOrderBy[value.field] || `p.${value.field}`;
        const dirParam = value.direction || 'asc';
        const direction = orderDirectionMap[dirParam];
        if (field) {
          sqlOrderBy.push(`${field} ${direction}`);
        }
      }

      if (sqlOrderBy.length) {
        orderBy = ' ORDER BY ' + sqlOrderBy.join(' , ');
      }
    }

    if (packageFilter.isLatest) {
      const outerOrderBy = orderBy.replace(/p\./g, '');
      sql = `SELECT * FROM (${sql} ORDER BY p.source_origin_id, version_array DESC) AS latest_packages` + outerOrderBy;
    } else {
      sql += orderBy;
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

  /**
   * This gets resources in packages
   * @param {*} context
   * @param {*} options: {
      packageId,
      packageIds,
      resourceId,
      resourceType, // resourceType can be an array or a value
      resourceAlias,
      limit,
      offset
    }
   * @returns
   */
  async function getPackageResources(context, options) {
    const args = [];
    const where = [];
    const packageIds = _.get(options, 'packageIds', []);

    if (!_.isNil(options.packageId)) {
      packageIds.push(options.packageId);
    }

    if (_.isEmpty(packageIds) && _.isNil(options.resourceId)) {
      throw new errors.InvalidInput({
        message:
          'No resourceId or packageId was provided. Please check your input and try again.'
      });
    }

    if (!_.isEmpty(packageIds)) {
      args.push(packageIds);
      where.push(`pr.package_id = ANY(\$${args.length}::uuid[])`);
    }

    // resourceType can be an array or a value
    let resourceTypes = _.isNil(options.resourceType)
      ? []
      : _.isArray(options.resourceType)
      ? options.resourceType
      : [options.resourceType];

    if (!_.isEmpty(resourceTypes)) {
      resourceTypes = resourceTypes.map((t) => {
        return _.snakeCase(t);
      });
      mainUtil.addSqlWhere('pr.resource_type', resourceTypes, where, args);
    }

    if (!_.isNil(options.resourceId)) {
      mainUtil.addSqlWhere('pr.resource_id', options.resourceId, where, args);
    }

    mainUtil.addSqlWhere(
      'pr.resource_alias',
      options.resourceAlias,
      where,
      args
    );

    let sql = `
      SELECT
        id,
        package_id,
        resource_type,
        resource_id,
        resource_alias,
        date_created,
        date_modified,
        created_by,
        modified_by
      FROM
        aiware.package__resource pr
      WHERE
        ${where.join(' AND ')}
    `;

    if (Number.isInteger(options.limit)) {
      args.push(options.limit);
      sql += ` LIMIT \$${args.length}`;
    }
    if (Number.isInteger(options.offset)) {
      args.push(options.offset);
      sql += ` OFFSET \$${args.length}`;
    }

    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapPackageResources
    );
    return mainUtil.toPage(options, rows);
  }

  async function checkCircularPackageReference(context, input) {
    let rows = [];
    const resources = input.resources || input.packageResources || [];
    let packageResources = resources.filter(
      (resource) =>
        resource.resourceType === 'package' && resource.action === 'ADD'
    );
    let packageIds = packageResources.map(
      (packageResource) => packageResource.resourceId
    );

    if (packageIds.length > 0) {
      const where = [];
      const id = input.id || input.packageId;
      const args = [id];

      mainUtil.addSqlWhere('pr.package_id', packageIds, where, args);

      let sql = `
        WITH root_package (root_id, root_name) AS (
            SELECT
                pk.package_id,
                pk.package_name || ' (' || pk.package_version || ')'
            FROM
                aiware.package pk
            WHERE
                pk.package_id = $1
        ),

        packages_as_resources AS (
            WITH RECURSIVE nested_packages(package_id, visited_packages, visited_package_names, has_cycle) AS (
                SELECT
                    pr.resource_id,
                    ARRAY[(SELECT root_id FROM root_package), pr.package_id] AS visited_packages,
                    -- this array is only to present human-readable package names to referencePaths
                    ARRAY[(SELECT root_name FROM root_package), p.package_name || ' (' || p.package_version || ')'] AS visited_package_names,
                    pr.resource_id = ANY(ARRAY[(SELECT root_id FROM root_package)::text])
                FROM
                    aiware.package__resource pr
                    -- this join is only to resolve human-readable package names in the visited_package_names
                    INNER JOIN aiware.package p ON p.package_id = pr.package_id
                WHERE
                    -- root level items will always be packages
                    ${where[0]}

            UNION ALL

                SELECT
                    pr.resource_id,
                    np.visited_packages || pr.package_id,
                    np.visited_package_names || (p.package_name || ' (' || p.package_version || ')'),
                    pr.resource_id = ANY(np.visited_packages::text[]) OR np.has_cycle
                FROM
                    aiware.package__resource pr
                INNER JOIN
                    nested_packages np ON pr.package_id::text = np.package_id
                    -- this join is only to resolve human-readable package names in the visited_package_names
                INNER JOIN aiware.package p ON p.package_id = pr.package_id
                WHERE
                    pr.resource_type = 'package' AND np.has_cycle = false
            )
            SELECT *
            FROM
                nested_packages
            WHERE
                nested_packages.has_cycle = true
        )
        SELECT
            package_id,
            visited_packages,
            visited_package_names,
            has_cycle
        FROM
            packages_as_resources
      `;

      rows = await serviceContext.dbConnections['core'].read.map(
        sql,
        args,
        mapper.mapNestedPackage
      );

      return rows.map((row) => {
        return {
          fieldName: 'packageId',
          fieldValue: {
            nestedPackage: id,
            referencePathsWithIds: row.visitedPackages,
            referencePaths: row.visitedPackageNames
          }
        };
      });
    }
    return rows;
  }

  // This method takes a packageId as input and returns the flattened
  // array of resource objects of any nested packages (if any).
  async function getNestedResources(context, options) {
    if (_.isNil(options.packageId)) {
      throw new errors.InvalidInput({
        message:
          'The packageId is required. Please check your input and try again.'
      });
    }

    const resourceColumns = {
      id: null,
      package_id: null,
      resource_type: null,
      date_created: null,
      date_modified: null,
      created_by: null,
      modified_by: null,
      resource_alias: null
    };

    const selectColumns = mainUtil.makeSelectClause(resourceColumns, 'pr');

    const where = [];
    const args = [options.packageId];

    // Filter on resource type (if any)
    mainUtil.addSqlWhere(
      'pr.resource_type',
      !_.isNil(options.resourceType)
        ? _.snakeCase(options.resourceType)
        : undefined,
      where,
      args
    );

    // Ensure cycles are prevented.
    mainUtil.addSqlWhere('nr.has_cycle', false, where, args);

    // This is a recursive query where the first select statement establishes
    // the root items. The second, unioned, query is the true recursive query.
    // Initially, results from the first query are fed into the second via the
    // parameters in the RECURSIVE declaration. Subsequently, results from the
    // second query continually feed into itself via the parameters until no
    // further results are returned. The third, and final, query returns the results.
    let sql = `
      WITH RECURSIVE nested_resources(resource_id, visited_resources, visited_package_names, has_cycle) AS (
        SELECT
          pr.resource_id,
          ARRAY[pr.resource_id] AS visited_resources,
          -- this array is only to present human-readable package names to referencePaths
          ARRAY[p.package_name || ' (' || p.package_version || ')'] AS visited_package_names,
          false,
          ${selectColumns}
        FROM
          aiware.package__resource pr
        -- this join is only to resolve human-readable package names in the visited_package_names
        INNER JOIN aiware.package p ON p.package_id = pr.package_id
        WHERE
          -- root level items will always be packages
          pr.package_id = $1

        UNION ALL

        SELECT
          pr.resource_id,
          nr.visited_resources || pr.resource_id,
          nr.visited_package_names || (p.package_name || ' (' || p.package_version || ')'),
          pr.resource_id = ANY(nr.visited_resources) OR nr.has_cycle,
          ${selectColumns}
        FROM
          aiware.package__resource pr
        INNER JOIN
          nested_resources nr ON pr.package_id::text = nr.resource_id
        -- this join is only to resolve human-readable package names in the visited_package_names
        INNER JOIN aiware.package p ON p.package_id = pr.package_id
        WHERE
          -- conditionally filter by resource_type
          ${where.join(' AND ')}
          -- Since package drives recursion, always include that type.
          OR pr.resource_type = 'package'
      )
      SELECT
        *
      FROM
        nested_resources
      ORDER BY date_modified DESC
    `;

    if (Number.isInteger(options.limit)) {
      args.push(options.limit);
      sql += ` LIMIT \$${args.length}`;
    }

    if (Number.isInteger(options.offset)) {
      args.push(options.offset);
      sql += ` OFFSET \$${args.length}`;
    }

    let rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapNestedResources
    );

    // Check for cycles
    _.map(rows, (row) => {
      if (row.hasCycle) {
        // If a cycle is detected, we can proceed, but log it as an error
        const now = new Date();
        const cycleError = {
          message: `A cycle has been detected in a nested package of ${options.packageId}.`,
          name: 'nested_resources_cycle_detected',
          data: {
            errorId: uuidv4(),
            time_thrown: now.toISOString(),
            internalData: {
              nestedPackage: row.id,
              referencePathsWithIds: row.visitedResources,
              referencePaths: row.visitedPackageNames
            }
          }
        };
        serviceContext.messageUtil.emitErrorEvent(cycleError);
      }
    });

    const resources = [];
    rows = _.filter(rows, (resource) => {
      // The root items of the recursive query will always start with
      // packages. As a result, there will always be at least one package
      // type returned (if any results are returned). When filtering by
      // a non package resource type, the package type items will need
      // to be filtered out.
      const isValidType =
        !options.resourceType ||
        resource.resourceType === _.snakeCase(options.resourceType);

      if (isValidType) {
        // It is possible that two or more packages contain a reference
        // to the same resource(s). Therefore, we must dedupe the array.
        // While deduping the array, create the paths array for each item.
        const existingResource = _.find(resources, {
          resourceId: resource.resourceId
        });
        if (existingResource) {
          existingResource.referencePaths.push(
            resource.visitedPackageNames.join('/')
          );
        } else {
          resource.referencePaths = [resource.visitedPackageNames.join('/')];
          resources.push(resource);
          return true;
        }
      }

      return false;
    });

    return mainUtil.toPage(options, rows);
  }

  async function getPackageOwnerOrganizationId(
    context,
    id,
    includeDeleted,
    existingTask
  ) {
    const getPackagesResult = await getPackages(
      context,
      {
        id,
        includeDeleted
      },
      false,
      existingTask
    );

    if (_.isEmpty(getPackagesResult.records)) {
      throw new errors.InvalidInput({
        message: `The request input did not pass validation checks. See the data section for detail on validation errors.`,
        data: {
          validationErrors: [
            {
              fieldName: 'id',
              fieldValue: id,
              message:
                'The provided Package ID either does not exist, or the authenticated user or token does not have ' +
                'permission to access the package. Please check your input and try again.'
            }
          ]
        }
      });
    }

    return getPackagesResult.records[0].organizationId;
  }

  async function getPackageGrants(context, options, existingTask = null) {
    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['core'].read.tx
      : existingTask;

    if (_.isNil(options.id) && _.isNil(options.orgId)) {
      throw new errors.InvalidInput({
        message:
          `The request input did not pass validation checks. The 'orgId' or 'id' filter must be specified. ` +
          `Please check your input and try again.`
      });
    }

    const args = [];
    const where = [];

    let leftJoinPackageTableAdded = false;

    let distinctClause = '';

    const { grantType, isLatest, status, nameRegex, distributionType } =
      options.packageFilter || {};

    if (isLatest) {
      leftJoinPackageTableAdded = true;
      distinctClause = `DISTINCT ON (p.source_origin_id)
      string_to_array(REGEXP_REPLACE(p.package_version,'\\\\.?[^\d\.]+', '', 'gm'),'.')::int[] AS version_array,`;
    }

    if (grantType) {
      args.push(grantType);
      where.push(
        `po.grant_type = $${args.length}::aiware.aiw_package_grant_enum`
      );
    }

    if (status) {
      leftJoinPackageTableAdded = true;
      args.push(status);
      where.push(`p.status = $${args.length}::aiware.package_status_enum`);
    }

    if (nameRegex) {
      try {
        new RegExp(nameRegex);
      } catch (err) {
        throw new errors.InvalidInput({
          message: `Invalid regular expression`,
          data: {
            value: nameRegex,
            errMessage: err.message
          }
        });
      }
      leftJoinPackageTableAdded = true;
      args.push(nameRegex);
      where.push(`p.package_name ~ $${args.length}`);
    }

    if (distributionType) {
      leftJoinPackageTableAdded = true;
      args.push(distributionType);
      where.push(
        `p.distribution_type = $${args.length}::job_new.distribution_type`
      );
    }

    if (!options.includeDeleted) {
      leftJoinPackageTableAdded = true;
      where.push(`COALESCE(p.deleted, FALSE) = FALSE`);
    }

    let sql = `
      SELECT
        ${distinctClause}
        po.package_id,
        po.organization_id,
        po.grant_type,
        po.date_created,
        po.date_modified,
        po.created_by,
        po.modified_by,
        ${!!options.includeDeleted} as include_deleted
      FROM
        aiware.package__organization po
    `;

    if (leftJoinPackageTableAdded) {
      sql += `
        LEFT JOIN aiware.package p ON p.package_id = po.package_id
      `;
    }

    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const callerOrgId = resUtil.getOrgFromAuthContext(context);

    let queryGrantOrgId;
    let callerOwnsPackage;

    if (options.id) {
      const packageOwnerOrgId = await getPackageOwnerOrganizationId(
        context,
        options.id,
        options.includeDeleted,
        existingTask
      );

      args.push(options.id);
      where.push(`po.package_id = $${args.length}`);

      callerOwnsPackage = callerOrgId === packageOwnerOrgId;
      if (!callerOwnsPackage && !isSuperAdmin) {
        queryGrantOrgId = callerOrgId;
      }

      if (options.orgId) {
        if (
          isSuperAdmin ||
          callerOwnsPackage ||
          _.toString(options.orgId) === _.toString(callerOrgId)
        ) {
          queryGrantOrgId = options.orgId;
        } else {
          throw new errors.NotAllowed({
            message:
              `The authenticated user or token does not have privileges to perform this operation. ` +
              `Only a Super Admin or the owner of the Package associated with the ID in the input ` +
              `is authorized to filter by an Organization ID different from theirs.`,
            data: {
              validationErrors: [
                {
                  fieldName: 'id',
                  fieldValue: options.id
                },
                {
                  fieldName: 'orgId',
                  fieldValue: options.orgId
                }
              ]
            }
          });
        }
      }
    } else if (options.orgId) {
      if (
        !isSuperAdmin &&
        _.toString(options.orgId) !== _.toString(callerOrgId)
      ) {
        // If the caller is only filtering by org id, and it is different from
        // their org id, join with the packages table (if we haven't already) and
        // return only packages that are owned by their org

        if (!leftJoinPackageTableAdded) {
          sql += `
            LEFT JOIN aiware.package p ON p.package_id = po.package_id
          `;
        }
        args.push(callerOrgId);
        where.push(`p.organization_id = $${args.length}`);
      }

      queryGrantOrgId = options.orgId;
    } else if (!isSuperAdmin) {
      queryGrantOrgId = callerOrgId;
    }

    if (queryGrantOrgId) {
      args.push(queryGrantOrgId);
      where.push(`po.organization_id = $${args.length}`);
    }

    // If the caller is not a super-admin, they are not filtering
    // by a package that they own, and are filtering by their own org ID,
    // any packages to their org with a grant type of 'DENY' will be excluded
    if (
      !isSuperAdmin &&
      !callerOwnsPackage &&
      _.toString(options.orgId) === _.toString(callerOrgId)
    ) {
      where.push(`po.grant_type != 'DENY'::aiware.aiw_package_grant_enum`);
    }

    sql += ` WHERE ${where.join(' AND ')}`;

    if (isLatest) {
      sql += ` ORDER BY p.source_origin_id, version_array DESC`;
    }

    if (Number.isInteger(options.limit)) {
      args.push(options.limit);
      sql += ` LIMIT \$${args.length}`;
    }
    if (Number.isInteger(options.offset)) {
      args.push(options.offset);
      sql += ` OFFSET \$${args.length}`;
    }
    const rows = await dbRead('getPackageGrants', async (t) => {
      return await t.map(sql, args, mapper.mapPackageGrant);
    }).catch((err) => {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    });
    return mainUtil.toPage(options, rows);
  }

  /**
   * Get packageGrants by organization id
   * @param {*} context
   * @param {*} orgId oganization id to filter
   * @param {*} filterOptions More options to filter { grantTypes, packageIds, limit, offset }
   * @param {*} existingTask existing task transaction
   * @returns { records: [], limit, offset}
   */
  async function getPackageGrantsByOrgId(
    context,
    orgId,
    filterOptions,
    existingTask = null
  ) {
    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['core'].read.tx
      : existingTask;

    if (_.isNil(orgId)) {
      throw new errors.InvalidInput({
        message: `Missing orgId`
      });
    }
    filterOptions = filterOptions || {};
    const args = [];
    const where = [];

    const { grantTypes: _grantTypes, packageIds: _packageIds } = filterOptions;
    let grantTypes = [],
      packageIds = [];
    if (_grantTypes) {
      grantTypes = _.isArray(_grantTypes) ? _grantTypes : [_grantTypes];
    }
    if (_packageIds) {
      packageIds = _.isArray(_packageIds) ? _packageIds : [_packageIds];
    }

    // Organization
    args.push(orgId);
    where.push(`po.organization_id = $${args.length}`);

    // grantTypes
    if (!_.isEmpty(grantTypes)) {
      args.push(grantTypes);
      where.push(
        `po.grant_type = ANY($${args.length}::aiware.aiw_package_grant_enum[])`
      );
    }

    // packageIds
    if (!_.isEmpty(packageIds)) {
      args.push(packageIds);
      where.push(`po.package_id = ANY($${args.length}::uuid[])`);
    }

    let sql = `
      SELECT
        po.package_id,
        po.organization_id,
        po.grant_type,
        po.date_created,
        po.date_modified,
        po.created_by,
        po.modified_by
      FROM
        aiware.package__organization po
    `;

    sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY po.created_by DESC`;

    if (Number.isInteger(filterOptions.limit)) {
      args.push(filterOptions.limit);
      sql += ` LIMIT \$${args.length}`;
    }
    if (Number.isInteger(filterOptions.offset)) {
      args.push(filterOptions.offset);
      sql += ` OFFSET \$${args.length}`;
    }
    const rows = await dbRead('getPackageGrantsByOrgId', async (t) => {
      return await t.map(sql, args, mapper.mapPackageGrant);
    }).catch((err) => {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    });
    return mainUtil.toPage(filterOptions, rows);
  }

  async function checkPackageAccess(packageId, orgId) {
    const packageIds = _.isArray(packageId) ? packageId : [packageId];
    const accessSql = getPackageAccessValidationSql(1, 2, 'p');
    const sql = `SELECT package_id FROM aiware.package p WHERE ${accessSql} AND p.package_id = ANY($3::uuid[]) LIMIT ${packageIds.length}`;
    const row = await serviceContext.dbConnections['core'].read.manyOrNone(
      sql,
      [orgId, orgId, packageIds]
    );
    return !_.isEmpty(row);
  }

  async function upsertPackagePrimaryResource(
    packageId,
    resourceId,
    userId,
    existingDbWrite
  ) {
    const columns = ['package_id', 'resource_id', 'created_by', 'modified_by'];
    const sqlInsertValues = [packageId, resourceId, userId, userId];
    const sqlUpdateValues = [resourceId, userId];
    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? serviceContext.dbConnections['core'].write.tx
        : existingDbWrite.task;

    const sql = `
      INSERT INTO aiware.package__primary_resource (${columns.join(', ')})
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ON CONSTRAINT package_primary_resource_pk
      DO UPDATE SET resource_id = $5, modified_by = $6
      RETURNING ${columns.join(', ')};
    `;
    return await dbWrite('upsertPackagePrimaryResource', async (t) => {
      return await t.oneOrNone(
        sql,
        [...sqlInsertValues, ...sqlUpdateValues],
        mapper.camelizeRootKeys
      );
    }).catch((err) => {
      throw new errors.InternalServerError(err);
    });
  }

  const isDistributed = (packageStatus, distributionType) => {
    // list of all distribution types that are considered "distributed" to hub
    const distributedTypes = [
      'org_locked',
      'sharable',
      'public',
      'marketplace'
    ];

    return (
      packageStatus === 'published' &&
      _.includes(distributedTypes, distributionType)
    );
  };

  async function getPackageResourceUsage(
    context,
    _organizationId,
    resourceIds,
    packageNotInIds,
    excludeOwnPackages,
    excludeViewOnly = true,
    resourceType,
    existingTask = null
  ) {
    const args = [];
    const where = [];

    // require organizationId
    if (!_organizationId) {
      throw new errors.InvalidInput({
        message: `The organizationId is required to get package resource usage.`
      });
    }

    const organizationId = parseInt(_organizationId);
    if (isNaN(organizationId)) {
      throw new errors.InvalidInput({
        message: `The organizationId must be a number.`
      });
    }
    args.push(organizationId);
    args.push(publicPackageGrant.distributionType);
    args.push(publicPackageGrant.status);

    if (!_.isEmpty(resourceIds)) {
      const into = [];
      for (const resourceId of resourceIds) {
        args.push(resourceId);
        into.push('$' + args.length);
      }

      where.push(`pr.resource_id IN (${into.join(', ')})`);
    }

    if (!_.isEmpty(packageNotInIds)) {
      const into = [];
      for (const packageId of packageNotInIds) {
        args.push(packageId);
        into.push('$' + args.length);
      }

      where.push(`pr.package_id NOT IN (${into.join(', ')})`);
    }

    let packageAccessWhere = ['(p.distribution_type = $2 AND p.status = $3)'];
    if (!excludeOwnPackages) {
      packageAccessWhere.push('p.organization_id = $1');
    }

    args.push('GRANT');
    const grantTypeArgs = ['$' + args.length];
    if (!excludeViewOnly) {
      args.push('VIEW');
      grantTypeArgs.push('$' + args.length);
    }

    if (resourceType) {
      args.push(resourceType);
      where.push(`pr.resource_type = $${args.length}`);
    }

    let sql = `
      WITH package_access AS (
        SELECT 
          p.package_id 
        FROM 
          aiware.package p
        WHERE 
          ${packageAccessWhere.join(' OR ')}
        UNION 
        SELECT 
          po.package_id 
        FROM 
          aiware.package__organization po 
        WHERE 
          po.organization_id = $1 AND 
          po.grant_type IN (${grantTypeArgs.join(', ')})
      )
      SELECT
        pr.resource_id,
        COUNT(pr.resource_id)::int as package_count
      FROM
        aiware.package__resource pr
        JOIN package_access pa ON pr.package_id = pa.package_id
        ${where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}`}
      GROUP BY pr.resource_id
    `;

    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['core'].read.tx
      : existingTask;

    const rows = await dbRead('getPackageResourceUsage', async (t) => {
      return await t.map(sql, args, mapper.camelizeRootKeys);
    });
    return mainUtil.toPage(args, rows);
  }

  const backFillAppPackageNames = async (pkg, context) => {
    const regex = /^\w+ - \d+ - \d+ - application package \d+\.\d+$/;
    const isMatch = regex.test(pkg.name);

    if (!isMatch) return pkg.name;

    const applicationsResult = await serviceContext.dal.application.getApplications(
      { id: pkg.primaryResourceId, includeDeleted: true, limit: 1 },
      context
    );

    const application = applicationsResult.records[0];

    if (_.isEmpty(application)) return pkg.name;

    const { sql, values } = mainUtil.makeUpdateSql(
      'aiware.package',
      {
        package_name: application.name
      },
      {
        package_id: null,
        package_name: null
      },
      `source_origin_id = '${pkg.sourceOriginId}'`
    );

    const rows = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    if (!_.isEmpty(rows)) {
      return rows[0].packageName;
    }

    return pkg.name;
  };

  async function updatePublicEngineList(engine, context) {
    const engineId = _.get(engine, 'id');
    // Only check env feature flag, because when turned on, public engines need
    // to be in both old and new query
    const enablePackageGrantLogic = _.get(
      context.config,
      'featureFlags.enablePackageGrantLogic'
    );
    const rootOrgId = _.get(context, 'config.flyway.rootOrgId');
    if (!enablePackageGrantLogic) {
      return null;
    }

    let enginePackage;
    try {
      const publicEnginePackage = await serviceContext.dal.packages.getPackages(
        context,
        {
          nameRegexp: 'publicEngine',
          status: 'published',
          packageFilter: {
            // Originally, the orgId field was being set to rootOrgId, but was throwing errors for
            // non-superadmin users, so packageFilter was used instead as of AWT-11582.
            // Removal was considered, but it's not clear why the root orgID needs to be filtered,
            // so it was kept in. Should consider revisiting.
            organizationId: rootOrgId
          }
        },
        true
      );
      enginePackage = _.get(publicEnginePackage, 'records[0]');
    } catch (err) {
      logger.error('public engine package was not found', err);
    }

    // start the process if public engine package exists
    if (enginePackage) {
      // check current engine status and resource existence
      if (
        !Object.hasOwn(engine, 'isPublic') ||
        !Object.hasOwn(engine, 'engineState')
      ) {
        const getEngines = await serviceContext.dal.engine.getEngines(context, {
          ids: [engineId]
        });
        engine = getEngines.records[0];
      }

      const packageResources = await getPackageResources(context, {
        packageId: enginePackage.id,
        resourceId: engineId
      });
      const resource = _.get(packageResources, 'records[0]');

      // update package according to current engine status and package resource
      const updatePackageInput = {
        packageId: enginePackage.id,
        packageResources: []
      };
      if (engine.state === 'active' && engine.isPublic === true && !resource) {
        updatePackageInput.packageResources.push({
          resourceId: engine.engineId,
          resourceType: 'engine',
          action: 'ADD'
        });
      }
      if (
        (engine.state !== 'active' || engine.isPublic === false) &&
        resource
      ) {
        updatePackageInput.packageResources.push({
          resourceId: engine.engineId,
          resourceType: 'engine',
          action: 'REMOVE'
        });
      }
      // update package if resource changed
      if (updatePackageInput.packageResources.length > 0) {
        return packageUpdateResources(updatePackageInput, context);
      }
    }

    return null;
  }

  /**
   * @param {*} packageResources
   * @param {*} context
   * @returns an array of errors for any resources that are inactive
   */
  async function getInactiveOrNonExistingResources(
    packageResources,
    context,
    checkInactive,
    existingTask = null
  ) {
    const resourceErrors = [];
    const resourceTypesToProcess = [
      resourceTypeEnum.application,
      resourceTypeEnum.engine,
      resourceTypeEnum.package,
      resourceTypeEnum.schema,
      resourceTypeEnum.automateFlowRevision,
      resourceTypeEnum.engineBuild,
      resourceTypeEnum.tdo,
      resourceTypeEnum.automateNode,
      resourceTypeEnum.automatePalette,
      resourceTypeEnum.nodeRedPalette,
      resourceTypeEnum.applicationConfigDefinition,
      resourceTypeEnum.library,
    ];

    const getResourceIds = (filterByResourceType, resources) => {
      return resources
        .filter(({ resourceType }) => resourceType === filterByResourceType)
        .map(({ resourceId }) => resourceId);
    };

    const resourcesExist = (getStatusResult, type, ids) => {
      const { records } = getStatusResult || [];
      const difference = _.difference(
        ids,
        records.map((r) => r.id || r.flowRevisionId) // flowRevisionId for automateFlowRevision
      );

      for (const id of difference) {
        resourceErrors.push({
          resourceId: id,
          resourceType: type,
          message: `Resource does not exist. Packages can be created or updated only with existing resources`
        });
      }
    };

    const getResourceObjects = async (
      resourceType,
      resourceIds,
      existingTask = null
    ) => {
      if (_.isEmpty(resourceIds)) return [];

      let getStatusResult;
      switch (resourceType) {
        case resourceTypeEnum.application:
          getStatusResult = await serviceContext.dal.application.getApplications(
            { ids: resourceIds },
            context,
            existingTask
          );
          resourcesExist(
            getStatusResult,
            resourceTypeEnum.application,
            resourceIds
          );
          break;
        case resourceTypeEnum.engine:
          getStatusResult = await serviceContext.dal.engine.getEngines(
            context,
            { ids: resourceIds }
          );
          resourcesExist(getStatusResult, resourceTypeEnum.engine, resourceIds);
          break;
        case resourceTypeEnum.engineBuild:
          getStatusResult = await serviceContext.dal.engine.getEngineBuilds(
            { ids: resourceIds },
            context,
            existingTask,
          );
          resourcesExist(getStatusResult, resourceTypeEnum.engineBuild, resourceIds);
          break;
        case resourceTypeEnum.tdo:
          getStatusResult = await serviceContext.dal.tdo.getTDOs(
            context,
            { id: resourceIds }
          );
          resourcesExist(getStatusResult, resourceTypeEnum.tdo, resourceIds);
          break;
        case resourceTypeEnum.automateNode:
          getStatusResult = await serviceContext.dal.tdo.getTDOs(
            context,
            { id: resourceIds }
          );
          resourcesExist(getStatusResult, resourceTypeEnum.automateNode, resourceIds);
          break;
        case resourceTypeEnum.automatePalette:
          getStatusResult = await serviceContext.dal.tdo.getTDOs(
            context,
            { id: resourceIds }
          );
          resourcesExist(getStatusResult, resourceTypeEnum.automatePalette, resourceIds);
          break;
        case resourceTypeEnum.automateFlowRevision:
          getStatusResult = await serviceContext.dal.flowRevision.getFlowRevisionsByIds(
            context,
            { ids: resourceIds }
          );
          resourcesExist(getStatusResult, resourceTypeEnum.automateFlowRevision, resourceIds);
          break;
        case resourceTypeEnum.package:
          getStatusResult = await getPackages(
            context,
            { ids: resourceIds },
            true
          );
          resourcesExist(
            getStatusResult,
            resourceTypeEnum.package,
            resourceIds
          );
          break;
        case resourceTypeEnum.schema:
          getStatusResult = await serviceContext.dal.structuredData.getSchemas(
            context,
            {
              ids: resourceIds
            }
          );
          resourcesExist(getStatusResult, resourceTypeEnum.schema, resourceIds);
          break;
        case resourceTypeEnum.nodeRedPalette:
          getStatusResult = await serviceContext.dal.application.getNodeRedPalettesByModuleIds(
            resourceIds
          );
          resourcesExist(getStatusResult, resourceTypeEnum.nodeRedPalette, resourceIds);
          break;
        case resourceTypeEnum.applicationConfigDefinition:
          {
            getStatusResult = await Promise.all(resourceIds.map((resourceId) =>
              serviceContext.dal.application.getApplicationConfigDefinition(
                {
                  id: resourceId
                },
                context
              )
            ));
            const allRecords = getStatusResult.flatMap(result => result.records || []);
            getStatusResult = { records: allRecords };
            resourcesExist(getStatusResult, resourceTypeEnum.applicationConfigDefinition, resourceIds);
            break;
          }
        case resourceTypeEnum.library: {
          const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
          const isInternalToken = resUtil.getTokenType(context) === 'internal';
          const requestOrgId = resUtil.getOrgFromAuthContext(context);
          const ownerScope =
            isSuperAdmin || isInternalToken
              ? {}
              : { organizationIds: requestOrgId, includeOwnedOnly: true };
          const libraryResults = await Promise.all(
            resourceIds.map((resourceId) =>
              serviceContext.dal.library.getLibraries({
                id: resourceId,
                ...ownerScope
              })
            )
          );
          getStatusResult = {
            records: libraryResults.flatMap((r) => _.get(r, 'records', []))
          };
          resourcesExist(getStatusResult, resourceTypeEnum.library, resourceIds);
          break;
        }
        default:
          return [];
      }

      if (_.isArray(getStatusResult.records)) {
        return getStatusResult.records;
      }

      return [];
    };

    const findInactiveResources = (resourceType, resources) => {
      const inactiveResourceErrors = [];

      _.forEach(resources, (resource) => {
        let status;
        switch (resourceType) {
          case resourceTypeEnum.application:
          case resourceTypeEnum.package:
          case resourceTypeEnum.schema:
          case resourceTypeEnum.engineBuild:
            status = resource.status;
            break;
          case resourceTypeEnum.tdo:
          case resourceTypeEnum.automateNode:
          case resourceTypeEnum.automatePalette:
          case resourceTypeEnum.nodeRedPalette:
            status = resource.isPublic ? 'active' : 'inactive';
            break;
          case resourceTypeEnum.engine:
            status = resource.state;
            break;
          case resourceTypeEnum.automateFlowRevision:
            status = resource.is_deployed ? 'active' : 'inactive';
            break;
          case resourceTypeEnum.library:
            // Libraries have no publish/active lifecycle like engines or apps; an
            // existing library is always usable, so it never blocks package publish.
            status = 'active';
            break;
          default:
            throw new errors.InternalServerError({
              message: `An unexpected resource type was encountered while checking for inactive resources.`
            });
        }

        if (status !== 'active' && status !== 'published') {
          inactiveResourceErrors.push({
            resourceId: resource.id,
            resourceName: resource.name,
            resourceType,
            message:
              'Resource is inactive. This package cannot be published until all its resources are active/published.'
          });
        }
      });

      return inactiveResourceErrors;
    };

    for (const resourceType of resourceTypesToProcess) {
      const resourceIds = getResourceIds(resourceType, packageResources);
      const resources = await getResourceObjects(
        resourceType,
        resourceIds,
        existingTask
      );
      checkInactive &&
        resourceErrors.push(...findInactiveResources(resourceType, resources));
    }
    return resourceErrors;
  }

  async function validatePrimaryResourceForLineage(
    primaryResourceId,
    sourceOriginId
  ) {
    const args = [];
    const where = [];

    if (_.isNil(sourceOriginId)) {
      throw new errors.InternalServerError({
        message: `Unable to validate primary resource for package lineage without sourceOriginId.`
      });
    }

    if (_.isNil(primaryResourceId)) {
      return;
    }

    mainUtil.addSqlWhere('pr.resource_id', primaryResourceId, where, args);

    const sql = `
      SELECT
          p.source_origin_id
      FROM
          aiware.package p
      INNER JOIN
          aiware.package__primary_resource pr on p.package_id = pr.package_id
      WHERE
          pr.resource_id = $1
      LIMIT 1
    `;

    const results = await serviceContext.dbConnections['core'].read.map(
      sql,
      [primaryResourceId],
      mapper.mapPackage
    );

    if (_.isEmpty(results)) {
      return;
    }

    if (_.isNil(results[0].sourceOriginId)) {
      throw new errors.InternalServerError({
        message: `An invalid package missing a sourceOriginId value was returned when validating primary resource.`,
        data: {
          fieldName: 'primaryResourceId',
          fieldValue: primaryResourceId
        }
      });
    }

    if (results[0].sourceOriginId !== sourceOriginId) {
      throw new errors.InvalidInput({
        message: `A package's Primary Resource ID must not already exist in another package lineage. Please check your input and try again.`,
        data: {
          fieldName: 'primaryResourceId',
          fieldValue: primaryResourceId
        }
      });
    }
  }

  /**
   * File TDO resource in the appropriate resourceType folder
   * @param {Object} context The request context
   * @param {string} resourceType Type of resource
   * @param {Object} tdo The TDO
   */
  async function fileTDOResouceInResourceFolder(context, resourceType, tdo) {
    if (_.isNil(tdo) || _.isNil(tdo.orgId)) {
      return;
    }

    const folder = await _getOrCreateResourceFolder(
      context,
      resourceType,
      tdo.orgId
    );
    const folderId = _.get(folder, 'id');

    if (_.isNil(folderId)) {
      return;
    }

    const parentFolders = await serviceContext.dal.folder
      .getParentFoldersForObject(context, {
        objectId: tdo.id,
        organizationId: tdo.orgId,
        objectType: 'tdo'
      })
      .catch((err) => {
        // The tdo is not filed in any folder
        if (err.name === 'not_found') {
          return [];
        }
        throw err;
      });
    const parentFolderIds = _.map(parentFolders, 'id');

    // file TDO in the appropriate resourceType folder.
    if (!parentFolderIds.includes(folderId)) {
      await serviceContext.dal.folder.fileObject(
        context,
        tdo.orgId,
        folderId,
        tdo.id,
        serviceContext.dal.folder.TREE_OBJECT_TYPE.TDO,
        0,
        true
      );
    }
  }

  async function _getOrCreateResourceFolder(
    context,
    resourceType,
    organizationId
  ) {
    const inputResourceType = _.camelCase(resourceType);
    const resourceTypeMap = new Map([
      ['automateNode', 'nodes'],
      ['automatePalette', 'palettes']
    ]);

    if (!resourceTypeMap.has(inputResourceType) || _.isNil(organizationId)) {
      return;
    }

    // get resource root folder
    const rootFolder = await serviceContext.dal.folder.getOrCreateOrgRootFolder(
      context,
      {
        organizationId,
        rootFolderType: 'resource'
      }
    );
    const rootFolderId = _.get(rootFolder, 'id');
    const folderName = resourceTypeMap.get(inputResourceType);
    const folders = await serviceContext.dal.folder.getSubfolders(context, {
      organizationId,
      id: _.get(rootFolder, 'treeObjectId'),
      folderId: rootFolderId,
      names: [folderName]
    });
    let folder = _.head(folders);

    // if it doesn't exist, create an appropriate resourceType folder
    // in the resource root folder.
    if (_.isNil(folder)) {
      folder = serviceContext.dal.folder.createFolder(context, {
        organizationId,
        input: {
          name: folderName,
          description: `${inputResourceType} subfolder`,
          parentId: rootFolderId,
          rootFolderType: 'resource',
          typeId:
            _.get(rootFolder, 'rootFolderTypeId') || _.get(rootFolder, 'typeId') // for v2Folder
        }
      });
    }

    return folder;
  }

  const emitPublicPackageEvent = async (context, eventTypeInfo, args) => {
    const { packageId, packageName, organizationId, error } = args;
    try {
      // operation can fail because of missing packageId, we should still emit the event
      if (_.isNil(eventTypeInfo) /* || _.isNil(packageId) */) {
        throw new errors.InvalidInput({
          message: 'Missing required arguments.',
          data: args
        });
      }
      const event = {
        serviceName: SERVICE_NAME,
        organizationId,
        packageId,
        packageName
      };

      const { action, name } = eventTypeInfo;
      let description = '';

      switch (name) {
      case PACKAGE_CREATED_EVENT:
        description = !error ? `Created package ${packageName}` : 'Failed to create package';
        break;
      case PACKAGE_DELETED_EVENT:
        description = !error ? `Deleted package ${packageName}` : `Failed to delete package ${packageName}`;
        break;
      case PACKAGE_APPROVED_EVENT:
        description = !error ? `Approved package ${packageName}` : `Failed to approve package ${packageName}`;
        break;
      case PACKAGE_REJECTED_EVENT:
        description = !error ? `Rejected package ${packageName}` : `Failed to reject package ${packageName}`;
        break;
      case PACKAGE_INSTALLED_EVENT:
        description = !error ? `Installed package ${packageName}` : `Failed to install package ${packageName}`;
        break;
      default:
        description = !error ? `Updated package ${packageName}` : `Failed to update package ${packageName}`;
        break;
    }
      event.actionInfo = messageUtil.buildActionInfo(
        packageId,
        error,
        action,
        !error ? 'success' : 'failure',
        description
      );

      // emit public event
      await serviceContext.messageUtil.emitPublicEvent(
        supportedEvents[eventTypeInfo.name],
        SYSTEM_APPLICATION_ID,
        context,
        event
      );
    } catch (err) {
      logger.error(
        `[emitPublicPackageEvent] Error on emitting public event - ${eventTypeInfo.name}:`,
        err
      );
    }
  };

  const emitPublicPackageGrantEvent = async (context, eventTypeInfo, args) => {
    const { packageId, organizationId, grantType, error } = args;
    let packageName = args.packageName;
    let organizationName = args.organizationName;
    let applicationIds = args.applicationIds;

    if (
      _.isNil(eventTypeInfo) ||
      _.isNil(packageId) ||
      _.isNil(organizationId) ||
      _.isNil(grantType)
    ) {
      throw new errors.InvalidInput({
        message: 'Missing required arguments.',
        data: args
      });
    }
    if (_.isNil(organizationName)) {
      try {
        const org = await serviceContext.dal.organization.getOrganization(
          context,
          {
            id: organizationId
          }
        );
        organizationName = _.get(org, 'organizationName');
      } catch (err) {
        logger.error(
          `[emitPublicPackageGrantEvent] Error on getting organization name for organizationId: ${organizationId}`,
          err
        );
      }
    }

    if (_.isNil(packageName)) {
      try {
        const pkg = await getPackages(context, { id: packageId });
        packageName = _.get(pkg, 'records[0].name');
      } catch (err) {
        logger.error(
          `[emitPublicPackageGrantEvent] Error on getting package name for packageId: ${packageId}`,
          err
        );
      }
    }
    const event = {
      serviceName: SERVICE_NAME,
      packageId: packageId,
      packageName: packageName,
      organizationId: organizationId,
      organizationName: organizationName,
      grantType: grantType
    };

    // Update descriptions to match requirements
    let description = '';
    if (eventTypeInfo.name === PACKAGE_GRANT_SET_EVENT) {
      description = !error
        ? `Granted package ${packageName || packageId} to org ${organizationName} (${organizationId})`
        : `Failed to grant package ${packageName || packageId} to org ${organizationName} (${organizationId})`;
    } else if (eventTypeInfo.name === PACKAGE_GRANT_REMOVED_EVENT) {
      description = !error
        ? `Removed granted package ${packageName || packageId} from org ${organizationName} (${organizationId})`
        : `Failed to remove granted package ${packageName || packageId} from org ${organizationName} (${organizationId})`;
    }
    event.actionInfo = messageUtil.buildActionInfo(
      packageId,
      error,
      eventTypeInfo.action,
      !error ? 'success' : 'failure',
      description
    );

    // emit public event
    event.timestampMs = Date.now().valueOf();

    try {
      if (!error) {
        if (_.isNil(applicationIds)) {
          const applicationResources = await getPackageResources(context, {
            packageId,
            resourceType: 'application'
          });
          applicationIds = _.map(
            _.get(applicationResources, 'records', []),
            'resourceId'
          );
        }

        let token;
        // generate a JWT token using the eventing handling roles of an application resource
        // if package contains a single app and the app has an application eventing handling role.
        if (_.isArray(applicationIds) && applicationIds.length === 1) {
          try {
            const tokenInfo =
              await serviceContext.bll.application.getApplicationJWTToken(
                context,
                {
                  input: {
                    appId: applicationIds[0],
                    orgId: organizationId
                  }
                }
              );
            token = _.get(tokenInfo, 'token');
          } catch (err) {
            logger.error(
              `[emitPublicPackageGrantEvent] Error on generating a JWT token using the eventing handling roles of an application resource.  - ${eventTypeInfo.name}:`,
              err
            );
          }
        }

        // if there are none or more than 1 app in the package, generate a jwt token with minimal rights
        if (_.isNil(token)) {
          const organizationGuid =
            await serviceContext.dal.application.getAppIdFromOrgId(
              organizationId
            );
          token = await _createJWTTokenByDefaultPermissions(context, {
            permissions: [...CREATE_PERMISSIONS, ...READ_PERMISSIONS],
            organizationGuid,
            organizationId: organizationId
          });
        }
        event.token = token;
      }
      await serviceContext.messageUtil.emitPublicEvent(
        supportedEvents[eventTypeInfo.name],
        SYSTEM_APPLICATION_ID,
        context,
        event
      );
    } catch (err) {
      logger.error(
        `[emitPublicPackageGrantEvent] Error on emitting public event - ${eventTypeInfo.name}:`,
        err
      );
      throw err;
    }
  };

  const _emitPackageEventByStatus = async (context, pkg, oldStatus) => {
    let eventMap = new Map();

    if (_.isNil(pkg.status)) {
      return;
    }

    if (!_.isNil(oldStatus) && oldStatus === pkg.status) {
      return;
    }

    switch (pkg.status) {
      case 'approved':
        if (_.isNil(oldStatus) || oldStatus === 'pending') {
          eventMap.set(PACKAGE_APPROVED_EVENT, {
            eventObj: eventsMap.PackageApproved
          });
        }
        break;
      case 'rejected':
        if (_.isNil(oldStatus) || oldStatus === 'pending') {
          eventMap.set(PACKAGE_REJECTED_EVENT, {
            eventObj: eventsMap.PackageRejected
          });
        }
        break;
      case 'published':
        eventMap.set(PACKAGE_INSTALLED_EVENT, {
          eventObj: eventsMap.PackageInstalled
        });
        break;
      default:
        break;
    }

    if (eventMap.size > 0) {
      for (const [key, value] of eventMap) {
        const eventArgs = value.eventArgs || {
          packageId: pkg.id,
          packageName: pkg.name,
          organizationId: pkg.organizationId
        };
        await emitPublicPackageEvent(context, value.eventObj, eventArgs);

        // publish event to grant public packages
        if (pkg.status === 'published' && pkg.distributionType === 'public') {
          await _emitGrantPublicPackagesEvent(context, pkg.id);
        }
      }
    }
  };

  async function _emitPackageCreatedAuditLogEvent(context, pkg, error) {
    const eventArgs = {
      packageId: _.get(pkg, 'id', ''),
      packageName: _.get(pkg, 'name'),
      organizationId: _.get(pkg, 'organizationId'),
      error
    };
    await emitPublicPackageEvent(context, eventsMap.PackageCreated, eventArgs);
    return;
  }

  // return all resource ids for specific types that are accessible from the caller context
  // based on onwership/grants
  async function getAccessiblePackageResourcesByType(
    context,
    resourceTypes,
    organizationId,
    ids
  ) {
    if (_.isEmpty(resourceTypes)) {
      throw new errors.InternalServerError({
        message: `Explicit resourceTypes required.`
      });
    }

    const results = await getAccessiblePackageResources(context, {
      organizationId,
      resourceTypes,
      resourceIds: ids
    });

    const resourcesByType = {};
    for (const rType of resourceTypes) {
      resourcesByType[rType] = [];
    }
    for (const r of results) {
      if (!resourcesByType[r.resourceType]) {
        logger.warn('mismatched resource type', {
          query: resourceTypes,
          result: r.resourceType
        });
        continue;
      }
      resourcesByType[r.resourceType].push(r.resourceId);
    }
    return resourcesByType;
  }

  async function _emitGrantPublicPackagesEvent(context, packageId) {
    try {
      const orgId =
        _.get(context, '_authInfo.organization.organizationId') ||
        _.get(context, 'organizationId');
      const useAppGrant = await mainUtil.isEnableFeatureInOrganization(
        context,
        null,
        orgId,
        ['enablePackageGrantLogic', 'useAppGrant']
      );

      if (!useAppGrant) {
        return;
      }
      const payload = {
        type: 'system',
        event: 'grant_public_packages',
        packageId
      };

      await messageUtil.emitEvent(payload, messageUtil.topics('EVENTS'));
    } catch (err) {
      serviceContext.logger.error(err);
    }
  }

  async function _createJWTTokenByDefaultPermissions(context, args) {
    if (
      _.isEmpty(args.permissions) ||
      _.isNil(args.organizationGuid) ||
      _.isNil(args.organizationId)
    ) {
      throw new errors.InvalidInput({
        message:
          'permissions, organizationId and organizationGuid are required.'
      });
    }

    try {
      const defaultOrgAdmin = await serviceContext.dal.user.getDefaultOrgAdminUser(
        { organizationId: args.organizationId },
        context
      );
      const defaultRights = fpl.rbacUtil.permissionMaskToKeys(
        fpl.rbacUtil.getPermissionMask(
          fpl.rbacUtil.mapPermissionKeyByEnums(args.permissions)
        )
      );

      return jwt.sign(
        {
          contentApplicationId: args.organizationGuid,
          contentOrganizationId: args.organizationId,
          userId: defaultOrgAdmin.id,
          scope: [
            {
              actions: defaultRights
            }
          ]
        },
        _.get(config, 'jwt.secret'),
        {
          expiresIn: _.get(config, 'jwt.ttl', '1d'),
          jwtid: uuid(),
          subject: 'engine-run'
        }
      );
    } catch (err) {
      serviceContext.logger.error(
        `[_createJWTTokenByDefaultPermissions] Error on generating a JWT token with default permissions: `,
        err
      );
    }
  }

  function _formatResources(resources, packageIds = null) {
    resources = resources || [];
    let filterResources = resources;
    if (_.isArray(packageIds)) {
      filterResources = resources.filter((o) =>
        packageIds.includes(o.packageId)
      );
    }

    const resourceIds = new Set();
    const resourcesGroupByPackage = _.groupBy(filterResources, (r) => {
      resourceIds.add(r.resourceId);
      return r.packageId;
    });
    const resourceIdsGroupByPackage = _.reduce(
      resourcesGroupByPackage,
      (preVal, curVal, key) => {
        const ids = _.map(curVal, 'resourceId');
        preVal[key] = ids;
        return preVal;
      },
      {}
    );

    return {
      resourceIds: Array.from(resourceIds),
      resourcesGroupByPackage,
      resourceIdsGroupByPackage
    };
  }

  /**
   *
   * @param {*} context
   * @param { object } options: {
      resourceIds = [],
      resourceTypes = [],
      organizationId,
      excludedPackageIds = [],
      excludeViewOnly = true
    }
   * @param {*} existingTask
   * @returns
   */
  async function getAccessiblePackageResources(
    context,
    options,
    existingTask = null
  ) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    let orgId = resUtil.getOrgFromAuthContext(context);
    const {
      resourceIds = [],
      resourceTypes = [],
      organizationId,
      excludedPackageIds = [],
      excludeViewOnly = true
    } = options || {};

    if (isSuperAdmin && organizationId) {
      orgId = organizationId;
    }

    const args = [];
    const whereClause = [];

    if (!_.isEmpty(resourceIds)) {
      args.push(resourceIds);
      whereClause.push(`pr.resource_id = ANY($${args.length})`);
    }

    if (!_.isEmpty(resourceTypes)) {
      args.push(resourceTypes);
      whereClause.push(
        `pr.resource_type = ANY($${args.length}::aiware.aiw_package_resource_enum[])`
      );
    }

    if (!_.isEmpty(excludedPackageIds)) {
      args.push(excludedPackageIds);
      whereClause.push(`NOT pr.package_id = ANY($${args.length}::uuid[])`);
    }

    let sql;
    const filter = whereClause.join(' AND ');
    if (!orgId) {
      sql = /*sql*/ `
        SELECT 
            DISTINCT(resource_id), pr.resource_type
        FROM 
            aiware.package__resource pr
        WHERE 
            ${filter};
      `;
    } else {
      // filter packages accessible to org via ownership or grant
      const grantTypeArgs = ['GRANT'];
      if (!excludeViewOnly) {
        grantTypeArgs.push('VIEW');
      }
      args.push(orgId);
      args.push(grantTypeArgs);

      // do not abbreviate/shorten the query (ex via 2 left joins)
      // without comparing the performance characteristics
      sql = /*sql*/ `
        SELECT 
            DISTINCT(resource_id), pr.resource_type 
        FROM 
            aiware.package__resource pr
        JOIN 
            aiware.package__organization po ON po.package_id = pr.package_id
        WHERE 
            po.organization_id = $${args.length - 1}
            AND po.grant_type = ANY($${
              args.length
            }::aiware.aiw_package_grant_enum[])
            AND (${filter})
        UNION
        SELECT 
            DISTINCT(resource_id), pr.resource_type
        FROM 
            aiware.package__resource pr 
        JOIN 
            aiware.package p ON p.package_id = pr.package_id
        WHERE 
            p.organization_id = $${args.length - 1}
            AND (${filter});`;
    }

    const dbRead = _.isNil(existingTask)
      ? serviceContext.dbConnections['core'].read.tx
      : existingTask;

    return await dbRead('getAccessiblePackageResources', async (t) => {
      return await t.map(sql, args, mapper.camelizeRootKeys);
    });
  }

  return {
    getPackages,
    getPackageResources,
    getPackageGrants,
    checkPackageAccess,
    packageCreate,
    packageUpdate,
    packageDelete,
    packageUpdateResources,
    packageUpdateGrants,
    _validateInputPackageUpdateGrants,
    _packageUpdateGrantDbMulti,
    _checkResourcesToAddOrRemoveFromOrg,
    _packageUpdateGrantsResources,
    verifyAllowedToEditPackage,
    getPackageResourceUsage,
    validateUUIDs,
    backFillAppPackageNames,
    getLatestPackageInLineage,
    packageUpdateWithoutIncrement,
    updatePublicEngineList,
    getNestedResources,
    getResourceAliasByType,
    fileTDOResouceInResourceFolder,
    checkStatusOfResources,
    upsertPackagePrimaryResource,
    _emitPackageEventByStatus, // export for testing only,
    getAccessiblePackageResourcesByType,
    getAccessiblePackageResources,
    // exports for testing only
    _getResourceAlias,
    _checkPackageGrantAuthorization,
    _getPackagesQuery,
    _emitGrantPublicPackagesEvent,
    _createJWTTokenByDefaultPermissions,
    resourceTypeEnum,
    isPackageChanging,
    _getSolelyOwnedResources,
    eventActionMap,
    doPackageUpgrades, // export for testing only
    validatePackageCreateInput, // export for testing only
    getInactiveOrNonExistingResources, // export for testing only
    addOrRemoveLibraryCollaborators // export for testing only
  };
};
