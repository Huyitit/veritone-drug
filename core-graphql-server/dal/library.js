const mapper = require('./mapper.js');
const uuid = require('uuid');
const _convert = require('../modules/core-media-server/service/libraries/model/util/convert');
const model = require('../modules/core-media-server/service/libraries/model');
const validator = require('validator');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const _ = require('lodash');
const moment = require('moment');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map.js');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const librariesService = serviceContext.librariesService;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')();
  const resUtil = require('../resolvers/util')(serviceContext);

  const schemaName = 'libraries';
  const dbRead = serviceContext.dbConnections['core'].read;
  const dbWrite = serviceContext.dbConnections['core'].write;
  const dbConnections = serviceContext.dbConnections;
  const libDBConnections = dbConnections['core'];
  const messageUtil = serviceContext.messageUtil;

  function checkId(id, optional) {
    if (!optional && !id) {
      // this is a missing or empty value
      throw new errors.InvalidInput({
        message: 'Invalid ID format. A UUID is required.',
        data: { objectId: id }
      });
    }
    if (id && !validator.isUUID(id)) {
      // this is a value they provided, but that cannot map to an ID.
      throw new errors.NotFound({
        message: 'Invalid ID format. A UUID is required.',
        data: { objectId: id }
      });
    }
  }

  function createLibrary(args) {
    const input = args.input;
    var post = {
      libraryId: uuid.v4(),
      name: input.name,
      ownerOrgId: input.organizationId,
      libraryTypeId: input.libraryTypeId,
      coverImageUrl: input.coverImageUrl,
      description: input.description
    };

    const typeArgs = Object.assign(args, { id: input.libraryTypeId });
    return getLibraryType(typeArgs).then(function gotType(type) {
      return librariesService.createLibrary(post).then(function (data) {
        return mapper.mapLibrary(data);
      });
    });
  }

  function deleteLibrary(input) {
    checkId(input.id);
    var post = {
      libraryId: input.id
    };
    return authLibrary(input.id, input.organizationIds).then(function () {
      return librariesService.deleteLibrary(input.id).then(function (data) {
        return { id: input.id, message: input.id + ' deleted' };
      });
    });
  }

  async function updateLibrary(args) {
    const input = args.input;
    checkId(input.id);
    const lib = await authLibrary(input.id, input.organizationIds);
    // here, make sure we preserve empty string on the url input as this
    // will clear the URL.
    const url = _.isNil(input.coverImageUrl)
      ? lib.coverImageUrl
      : input.coverImageUrl;
    const post = {
      libraryId: input.id,
      name: input.name || lib.name,
      version: input.version || lib.version,
      ownerOrgId: lib.ownerOrgId,
      libraryTypeId: input.libraryTypeId || lib.libraryTypeId,
      coverImageUrl: url,
      description: input.description || lib.description
    };
    const data = await librariesService.updateLibrary(lib, post);
    return mapper.mapLibrary(data);
  }

  async function publishLibrary(input, ctx) {
    checkId(input.id);
    await authLibrary(input.id, input.organizationIds);
    const data = await librariesService.publishLibraryVersion(input.id);
    //TODO: missing emit library publish event?

    // Create trigger(mailbox) for library notification
    const clientInfo = resUtil.getClientInfo(ctx);
    if (clientInfo.type === 'user' && !_.isNil(clientInfo.id)) {
      // Create a mailbox to subscribe the event LibraryTrainingComplete
      await serviceContext.bll.mailbox.notificationMailboxCreate(ctx, {
        input: {
          name: 'Library training mailbox',
          eventFilter: {
            eventNames: ['LibraryTrainingComplete'],
            eventType: 'library',
            applicationId: 'system',
            conditions: {
              conditions: [
                {
                  field: 'libraryId',
                  value: data.libraryId,
                  operator: 'eq'
                },
                {
                  field: 'libraryVersion',
                  value: data.version,
                  operator: 'eq'
                }
              ]
            }
          },
          notificationTemplate:
            'Library {{libraryId}} version {{libraryVersion}} training for engine {{engineId}} is {{trainStatus}} by job {{trainJobId}}',
          details: { userId: clientInfo.id } // add userId to payload for pushing notification to user default mailbox in coreEventing
        }
      });
    }

    return mapper.mapLibrary(data);
  }

  function createLibraryType(args) {
    const input = args.input;
    var identifierTypes = input.entityIdentifierTypeIds.map(function (item) {
      return {
        entityIdentifierTypeId: item,
        minItems: 0,
        maxItems: 1000
      };
    });
    var post = {
      libraryTypeId: input.id,
      label: input.label,
      iconClass: input.iconClass,
      entityIdentifierTypes: identifierTypes,
      entityType: input.entityType
    };
    return librariesService.createLibraryType(post).then(function (data) {
      return mapper.mapLibraryType(data);
    });
  }

  function createEntityIdentifierType(args) {
    const input = args.input;
    var post = {
      label: input.label,
      ownerOrganizationId: input.organizationId,
      entityIdentifierTypeId: input.id,
      labelPlural: input.labelPlural,
      dataType: input.dataType
    };

    return librariesService
      .createEntityIdentifierType(post)
      .then(function (data) {
        return mapper.mapEntityIdentifierType(data);
      });
  }

  async function createEntity(args) {
    const input = args.input;
    checkId(input.libraryId);
    if (input.jsondata && input.jsonstring) {
      throw new errors.InvalidInput({
        message:
          'Supply either jsondata or jsonstring to createEntity, not both.'
      });
    }
    let metadata = input.jsondata;
    if (input.jsonstring) {
      try {
        metadata = JSON.parse(input.jsonstring);
      } catch (err) {
        throw new errors.InvalidInput({
          message: 'The supplied jsonstring did not contain valid JSON.',
          data: {
            value: input.jsonstring,
            message: err
          }
        });
      }
    }
    const post = {
      libraryId: input.libraryId,
      name: input.name,
      description: input.description,
      entityId: uuid.v4(),
      profileImageUrl: input.profileImageUrl,
      isPublished: input.isPublished,
      metadata: metadata
    };
    const library = await librariesService.getLibrary(input.libraryId);

    if (!library) {
      throw new errors.NotFound({
        data: {
          objectId: input.libraryId,
          objectType: 'Library'
        }
      });
    }

    try {
      const data = await librariesService.createEntity(library, post);
      return mapper.mapEntity(data);
    } catch (err) {
      if (JSON.stringify(err.stack).includes('rejectURL')) {
        throw new errors.InvalidInput({
          message:
            'The supplied profile image URL, ' +
            input.profileImageUrl +
            ', could not be resolved',
          data: {
            profileImageUrl: input.profileImageUrl
          }
        });
      } else if (
        err.name === 'ResourceConflictError' ||
        err.code === 23505 ||
        err.code === '23505'
      ) {
        // try to find the entity with duplicate name
        let entityId;
        try {
          const ent = await getEntities({
            libraryId: input.libraryId,
            organizationId: input.organizationId,
            name: input.name,
            limit: 1
          });
          entityId = _.get(ent, 'records[0].id');
        } catch (err) {
          logger.error(err);
        }
        throw new errors.ResourceConflict({
          message: '',
          data: {
            objectType: 'Entity',
            name: input.name,
            objectId: entityId
          }
        });
      } else {
        throw err;
      }
    }
  }

  async function updateEntity(args) {
    const input = args.input;

    // deleteEntities deletes all matching entities so, to be paranoid,
    // we'll double-check that ID is set.
    checkId(input.id);

    const entity = await authEntity(input.id, input.organizationIds);
    const libraryId = entity.libraryId || entity.library.libraryId;

    const library = await librariesService.getLibrary(libraryId);
    const entityArg = {
      entityId: input.id,
      organizationId: library.ownerOrgId,
      library: library
    };

    // here, make sure we preserve empty string on the url input as this
    // will clear the URL.
    const url = _.isNil(input.profileImageUrl)
      ? entity.profileImageUrl
      : input.profileImageUrl;

    const post = {
      entityId: input.id,
      libraryId: libraryId,
      name: input.name || entity.name,
      description: input.description || entity.description,
      profileImageUrl: url,
      isPublished: input.isPublished || entity.isPublished,
      metadata: input.jsondata || entity.jsondata,
      library: library
    };
    try {
      const data = await librariesService.updateEntity(entityArg, post);

      return mapper.mapEntity(data);
    } catch (err) {
      // add special handling for a validation error
      if (err instanceof BadRequestError || err.name === 'BadRequestError') {
        const errs = [];
        Object.keys(err.errors).forEach((key) => {
          errs.push({
            fieldName: key,
            fieldValue: post[key],
            fieldMessage: err.errors[key].message
          });
        });
        const data = { errors };
        throw new errors.InvalidInput({
          message:
            'The updated entity data caused a validation error. See ' +
            'the data section below for details.',
          data: {
            objectId: input.id,
            objectType: 'Entity',
            errors: errs,
            currentData: entity
          }
        });
      } else if (err.name === 'InvalidAccessKeyId') {
        // add special error handling for this AWS misconfiguration
        throw new errors.ServiceUnavailable({
          message:
            'The entity profile image could not be stored due to a ' +
            'temporary configuration error on this server. To continue, ' +
            'contact Veritone support and include this entire error payload.',
          data: {
            objectId: input.id,
            objectType: 'Entity',
            errorCode: 1123
          }
        });
      } else {
        throw err;
      }
    }
  }

  function deleteEntity(args) {
    // deleteEntities deletes all matching entities so, to be paranoid,
    // we'll double-check that ID is set.
    checkId(args.id);
    var post = { entityId: args.id };
    return authEntity(args.id, args.organizationIds).then(function () {
      return librariesService.deleteEntities(post).then(function (data) {
        return { id: args.id, message: 'Entity ' + args.id + ' deleted.' };
      });
    });
  }

  async function createEntityIdentifier(args) {
    const input = args.input;
    // input: entityId, organizationIds
    if (!input.url && !input.file) {
      throw new errors.InvalidInput({
        message:
          'At least one of url or file must be provided to createEntityIdentifier.'
      });
    }
    checkId(input.entityId);
    const entityId = input.entityId;
    const entity = await authEntity(entityId, input.organizationIds);

    const entityArg = {
      entityId: entityId,
      library: {
        libraryId: entity.library.libraryId,
        libraryType: entity.library.libraryType,
        ownerOrgId: entity.library.ownerOrgId
      }
    };
    let metadata = input.jsondata;
    if (input.jsonstring) {
      try {
        metadata = JSON.parse(input.jsonstring);
      } catch (err) {
        throw new errors.InvalidInput({
          message: 'The supplied jsonstring did not contain valid JSON.',
          data: {
            value: input.jsonstring,
            message: err
          }
        });
      }
    }
    if (!metadata) metadata = {};

    if (!metadata.contentType) {
      metadata.contentType = input.contentType;
    }

    const post = {
      entityIdentifierId: uuid.v4(),
      entityId: entityId,
      entityIdentifierTypeId: input.identifierTypeId,
      priority: input.isPriority,
      dataUrl: input.url,
      metadata: metadata,
      storeReference: input.storeReference
    };

    // file upload stream. might be null.
    // libraries service handles it cleanly.
    let fileInfo = null;
    if (input.file) {
      fileInfo = {
        content: input.file.inputStream,
        contentType: input.contentType
      };
    }
    const res = await librariesService.createEntityIdentifier(
      entityArg,
      post,
      fileInfo
    );

    // if input.profileUpdateMode was passed we might
    // need to update the entity profile image
    if (
      input.profileUpdateMode === 'always' ||
      (input.profileUpdateMode === 'ifNotSet' && !entity.profileImageUrl)
    ) {
      // the libraries service code downloads the file
      // from the supplied URL into our own storage and then
      // returns the signed URL to our object.
      // so to get a permanent, unsigned URL we just strip
      // of the signature (query part).
      // TODO we might want to change this model at some point to copy
      // the image into a new object so that it is not deleted from the
      // entity profile if the entity identifier is deleted.
      const entData = {
        profile_image_url: mainUtil.stripUrlQuery(res.dataUrl)
      };
      const entUpdate = await rawUpdateEntity(entityId, entData);
    }

    return mapper.mapEntityIdentifier(res);
  }

  async function rawUpdateEntity(id, data) {
    // do a raw update of entity db, bypassing BLL layer
    const v = [id];
    const { sql, values } = mainUtil.makeUpdateSql(
      'libraries.entity', // table
      data, // updated column data
      { entity_id: 'id' }, // select data
      ' entity_id = $1 ', // where clause
      1 // value index
    );
    values.unshift(id);
    return serviceContext.dbConnections['core'].write.query(sql, values);
  }

  async function updateEntityIdentifier(args) {
    // input: entityId, organizationIds
    const input = args.input;
    const entityIdentifierId = input.id;
    checkId(input.id);
    // prettier-ignore
    const entityIdentifier = await authEntityIdentifier(entityIdentifierId, input.organizationIds);
    const entityId = entityIdentifier.entity.entityId;
    if (!_.isNil(input.url)) {
      if (input.url.trim().length === 0) {
        throw new errors.InvalidInput({
          message:
            'The URL for an entity identifier cannot be set to an empty value.',
          data: {
            objectId: input.id,
            objectType: 'EntityIdentifier'
          }
        });
      }
    }
    const dataUrl = !_.isNil(input.url)
      ? _convert.toURLObject(input.url)
      : entityIdentifier.url;

    const entityIdentifierArg = {
      entityIdentifierId: entityIdentifierId,
      entityId: entityId,
      entityIdentifierTypeId:
        entityIdentifier.entityIdentifierType.entityIdentifierTypeId,
      dataUrl: dataUrl,
      library: entityIdentifier.library
    };
    const metadata = input.jsondata || entityIdentifier.jsondata;

    if (input.contentType) {
      metadata.contentType = input.contentType;
    }

    const post = {
      entityIdentifierId: entityIdentifierId,
      priority: input.isPriority || entityIdentifier.isPriority,
      entityIdentifierTypeId:
        entityIdentifier.entityIdentifierType.entityIdentifierTypeId,
      metadata: metadata,
      entityId: entityId,
      dataUrl: dataUrl
    };

    // file upload stream. might be null.
    // libraries service handles it cleanly.
    const file = input.file;

    // TODO this code does not download the incoming image.
    // should it?
    const res = await librariesService.updateEntityIdentifier(
      entityIdentifierArg,
      post,
      file
    );
    return mapper.mapEntityIdentifier(res);
  }

  function deleteEntityIdentifier(args) {
    // deleteEntities deletes all matching entities so, to be paranoid,
    // we'll double-check that ID is set.
    checkId(args.id);
    var post = { entityIdentifierId: args.id };
    return authEntityIdentifier(args.id, args.organizationIds).then(
      function () {
        return librariesService
          .deleteEntityIdentifiers(post)
          .then(function (data) {
            return {
              id: args.id,
              message: 'Entity identifier' + args.id + ' deleted.'
            };
          });
      }
    );
  }

  async function getEntities(args) {
    checkId(args.libraryId, true);
    checkId(args.entityId, true);
    checkId(args.id, true);
    if (args.libraryIds) args.libraryIds.forEach((id) => checkId(id, true));
    if (args.entityIds) args.entityIds.forEach((id) => checkId(id, true));
    if (args.ids) args.ids.forEach((id) => checkId(id, true));
    if (!(args.libraryId || args.id || args.ids || args.libraryIds)) {
      throw new errors.InvalidInput({
        message: 'one of libraryId or id is required'
      });
    }

    const fieldMapping = {
      id: 'entity_id',
      name: 'name',
      createdDateTime: 'created_date_time',
      modifiedDateTime: 'modified_date_time'
    };

    // allow both id and ids.
    // if a single ID was passed in, pass it directly as string to
    // library DAL implementation.
    // if ids was passed, pass it as array.
    // if both were passed, combine them.
    let idArg = null;
    if (args.id || args.ids) {
      if (args.ids) {
        idArg = args.ids;
        if (args.id) idArg.push(args.id);
      } else {
        idArg = args.id;
      }
    }

    let libraryIdArg;
    if (args.libraryIds) {
      libraryIdArg = args.libraryIds;
    }
    if (args.libraryId) {
      if (libraryIdArg) libraryIdArg.push(args.library);
      else libraryIdArg = [args.libraryId];
    }

    let params = {
        limit: args.limit,
        offset: args.offset,
        entityId: idArg,
        libraryId: libraryIdArg,
        name: args.name,
        identifierType: args.identifierTypeId,
        orderBy: fieldMapping[args.orderBy],
        orgId: args.organizationId,
        orderDesc: args.orderDirection === 'desc'
      },
      includes = {};

    // make sure that isPublished filter parameter is set correctly
    if (Object.prototype.hasOwnProperty.call(args, 'isPublished')) {
      //TODO this doesn't always work? if (args.hasOwnProperty('isPublished')) {
      params.isPublished = args.isPublished;
    }

    if (args.includeSummary) {
      includes.summary = true;
    }

    const data = await librariesService.getEntities(params, includes);
    const records = data.results.map(mapper.mapEntity);
    return mainUtil.toPage(args, records);
  }

  function getEntityIdentifiers(args) {
    return librariesService.getEntityIdentifiers(args).then(function (data) {
      var records = data.results.map(mapper.mapEntityIdentifier);

      return {
        records: records,
        count: data.results.length,
        limit: args.limit,
        offset: args.offset
      };
    });
  }

  async function getLibraries(args) {
    const _args = JSON.parse(JSON.stringify(args));
    checkId(args.id, true);
    _args.libraryId = args.id;
    if (args.includeOwnedOnly) {
      _args.ownerOrgId = args.organizationIds;
    } else {
      _args.collaborator = args.organizationId;
      _args.orgId = args.organizationId;
    }

    // If use specific a library type id, we first need
    // to find all matching library types. Then we can add library
    // type IDs to the getLibraries() filter.
    if (_args.type || _args.entityIdentifierTypeIds) {
      const params = _.pickBy(
        {
          id: _args.type,
          identifierType: _args.entityIdentifierTypeIds
        },
        _.identity
      );

      const libraryTypes = await getLibraryTypes(params);
      if (!libraryTypes.count) {
        return mainUtil.emptyPage(_args);
      } else {
        _args.libraryType = libraryTypes.records.map(function map(item) {
          return item.libraryTypeId;
        });
        return getLibrariesImpl(_args);
      }
    } else {
      // for other filters just make a straight query
      return getLibrariesImpl(_args);
    }
  }

  function getLibrariesImpl(args) {
    const fieldMapping = {
        id: 'library_id',
        name: 'name',
        createdDateTime: 'created_date_time',
        modifiedDateTIme: 'modified_date_time',
        version: 'version',
        lastTrainedDateTime: 'last_trained_date_time'
      },
      includes = {};

    let params = Object.assign({}, args, {
      orderBy: fieldMapping[args.orderBy],
      orderDesc: args.orderDirection === 'desc'
    });

    if (args.includeSummary) {
      includes.summary = true;
    }
    return librariesService
      .getLibraries(params, includes)
      .then(function (data) {
        return {
          records: data.results.map(function (row) {
            return mapper.mapLibrary(row);
          }),
          count: data.results.length, // not totalResults
          offset: args.offset,
          limit: args.limit
        };
      });
  }

  function authLibrary(libraryId, organizationIds) {
    return getLibraries({
      id: libraryId,
      organizationIds: organizationIds
    }).then(function (result) {
      if (!result.count) {
        throw new errors.NotFound({
          data: {
            objectId: libraryId,
            objectType: 'Library'
          }
        });
      }
      if (result.count > 1) {
        throw Error(result.count + ' libraries with id ' + libraryId); // server bug check
      }
      return result.records[0];
    });
  }

  /**
   * Used to authorize write access to an entity.
   * Read access is more flexible; it takes into account collaborators.
   */
  async function authEntity(entityId, organizationIds) {
    // if we couldn't get org ID from context then fail here.
    const orgId = organizationIds;
    // this will fail if entity doesn't exist or user doesn't have read access
    const entities = await getEntities({ id: entityId, organizationId: orgId });
    if (!entities.records.length) {
      throw new errors.NotFound({
        data: {
          objectId: entityId,
          objectType: 'Entity'
        }
      });
    }
    const entity = entities.records[0];
    const library = entity.library;
    // this means that the entity is in a library that is shared with
    // the user's org, but not writable.
    if (!organizationIds.includes(library.ownerOrgId)) {
      throw new errors.NotAllowed({
        message:
          'The requested entity is readable to you but is owned ' +
          'by another organization and cannot be modified.',
        data: {
          objectId: entityId,
          objectType: 'Entity',
          libraryId: library.id,
          libraryName: library.name,
          libraryOwnerOrganizationId: library.ownerOrgId
        }
      });
    }
    return mapper.mapEntity(entity);
  }

  function authEntityIdentifier(entityIdentifierId, organizationIds) {
    return getEntityIdentifiers({
      entityIdentifierId: entityIdentifierId
    }).then(function (entityIdentifiers) {
      if (!entityIdentifiers.records.length) {
        throw new errors.NotFound({
          data: {
            objectId: entityIdentifierId,
            objectType: 'Entity'
          }
        });
      }

      // first get the entity
      var entityIdentifier = entityIdentifiers.records[0];
      var libraryId = entityIdentifier.entity.libraryId;
      // now need to get the library
      // we've added user's org IDs as params so this call will return empty
      // list if user is not authorized to library.
      return getLibraries({
        id: libraryId,
        organizationIds: organizationIds
      }).then(function (libs) {
        if (!libs || !libs.records || !libs.records.length) {
          throw new errors.NotFound({
            data: {
              objectId: entityIdentifierId,
              objectType: 'EntityIdentifier'
            }
          });
        }
        const res = mapper.mapEntityIdentifier(entityIdentifier);
        res.library = libs.records[0];
        return res;
      });
    });
  }

  async function authLibraryEngineModel(libraryEngineModelId, organizationIds) {
    const libraryEngineModel = await getLibraryEngineModel({
      id: libraryEngineModelId,
      organizationIds: organizationIds
    });
    return mapper.mapLibraryEngineModel(libraryEngineModel);
  }

  async function getLibraryEngineModel(args) {
    if (!args.id) {
      throw new Error('id parameter is required'); // server bug
    }
    const result = await getLibraryEngineModels(args);
    if (!result.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'LibraryEngineModel'
        }
      });
    }
    return result.records[0];
  }

  /**
   * Fetches a list of library engine models
   * @param context
   * @param args
   */
  async function getLibraryEngineModels(args) {
    let sql = `SELECT
				lem.*,
				l.library_id as l__library_id,
				l.version as l__version,
				l.name as l__name,
				l.cover_image_url as l__cover_image_url,
				l.description as l__description,
				l.owner_org_id as l__owner_org_id,
				lt.library_type_id as lt__library_type_id,
				lt.label as lt__label,
				lt.entity_type_name AS lt__entity_type_name,
				lt.entity_type_name_plural AS lt__entity_type_name_plural,
				lt.entity_type_schema AS lt__entity_type_schema,
				ltsq.entity_identifier_types AS lt__entity_identifier_types
			FROM ${schemaName}.library_engine_model lem
			INNER JOIN ${schemaName}.library l
				ON lem.library_id = l.library_id
				AND l.deleted_date_time IS NULL
			INNER JOIN ${schemaName}.library_type lt
				ON l.library_type_id = lt.library_type_id
			INNER JOIN (SELECT
			s.library_type_id,
			jsonb_agg(s.entity_identifier_type_id) AS entity_identifier_type_ids,
			jsonb_agg(s.entity_identifier_type_link) AS entity_identifier_types
		FROM (
			SELECT
				library_type_id,
				entity_identifier_type_id,
				json_build_object('entity_identifier_type_id', entity_identifier_type_id, 'min_items', min_items, 'max_items', max_items) AS entity_identifier_type_link
			FROM ${schemaName}.library_type__entity_identifier_type
		) s
		GROUP BY s.library_type_id) ltsq
				ON l.library_type_id = ltsq.library_type_id`;

    const values = [];
    const where = ['lem.deleted_date_time IS NULL'];

    if (args.currentVersion) {
      sql += `
				AND lem.library_version = l.version`;
    }

    mainUtil.addSqlWhere('lem.library_engine_model_id', args.id, where, values);
    mainUtil.addSqlWhere('lem.library_id', args.libraryId, where, values);
    mainUtil.addSqlWhere('lem.engine_id', args.engineId, where, values);
    mainUtil.addSqlWhere('lem.train_status', args.trainStatus, where, values);
    if (_.has(args, 'libraryVersion') && !args.currentVersion) {
      mainUtil.addSqlWhere(
        'lem.engine_id',
        _.toString(args.libraryVersion),
        where,
        values
      );
    }

    // if lastModified param is enabled, only return the most recent record
    if (args.lastModified) {
      sql += `
				INNER JOIN (
					SELECT library_id, MAX(created_date_time) as last_created_date_time
					FROM ${schemaName}.library_engine_model`;

      if (where.length) {
        sql +=
          `
					WHERE ` + where.join(' AND ').replace(/lem\./g, '');
      }

      sql += `
					GROUP BY library_id
				) sq
					ON sq.library_id = lem.library_id
					AND sq.last_created_date_time = lem.created_date_time`;
    } else if (where.length) {
      sql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    sql += `
			ORDER BY lem.created_date_time DESC
			LIMIT \$${values.push(args.limit)}
			OFFSET \$${values.push(args.offset)}`;

    const results = await dbRead.map(sql, values, hydrateLibraryEngineModel);
    return mainUtil.toPage(args, results);
  }

  async function createLibraryEngineModel(context, args) {
    const input = args.input;
    checkId(input.libraryId);
    const libraryEngineModelId = uuid.v4();
    const libraryId = input.libraryId;
    const engineId = input.engineId;
    await authLibrary(input.libraryId);

    const engArgs = {
      id: input.engineId,
      organizationId: input.organizationId
    };

    // verify that the engine exists and is usable by the client's org
    await serviceContext.dal.engine.getEngine(context, engArgs);
    const dataUrl = input.dataUrl;
    const metadata = input.metadata;
    let savedUrl = dataUrl;
    let updatedMetadata = metadata;
    if (dataUrl) {
      if (!resUtil.isOurBucket(dataUrl)) {
        // download file if passed in different url
        const resHeaders = {};
        let file = await resUtil.download(dataUrl, context, resHeaders);
        const contentType =
          resHeaders['content-type'] || resHeaders['Content-Type'];
        updatedMetadata = {
          ...metadata,
          contentType
        };
        const dataFileInfo = {
          libraryId,
          engineId,
          libraryEngineModelId,
          dataUrl,
          metadata,
          organizationId: input.organizationId,
          accuracy: input.accuracy,
          contentType,
          configurationId: input.configurationId
        };
        const updatedModel = await librariesService.saveLibraryEngineModelDataFile(
          dataFileInfo,
          {
            content: file,
            contentLength:
              resHeaders['content-length'] || resHeaders['Content-Length'],
            contentType
          }
        );
        savedUrl = updatedModel.dataUrl;
      } else {
        // if the dataUrl was signed, strip off the signature before updating it in the database
        savedUrl = resUtil.isRealSignedUrl(dataUrl)
          ? resUtil.stripSignatureSignedUrl(dataUrl)
          : dataUrl;
      }
    }

    const sql = `
    INSERT INTO ${schemaName}.library_engine_model (
      library_engine_model_id,
      library_id,
      library_version,
      engine_id,
      train_job_id,
      train_status,
      data_url,
      metadata,
      created_date_time,
      modified_date_time,
      accuracy,
      configuration_id
    )
    (
      SELECT
        $1, $2, version, $3, $4, $5, $6, $7, $8, $9, $11, $12
      FROM ${schemaName}.library
      WHERE library_id = $10 AND deleted_date_time IS NULL
    )
    RETURNING *`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      libraryEngineModelId,
      input.libraryId,
      input.engineId,
      input.trainJobId,
      input.trainStatus,
      savedUrl ? savedUrl.toString() : null,
      JSON.stringify(updatedMetadata),
      currEpochTime,
      currEpochTime,
      input.libraryId,
      input.accuracy,
      input.configurationId
    ];

    const result = await dbWrite.map(sql, values, mapper.mapLibraryEngineModel);

    if (!result) return result;
    return result[0];
  }

  async function updateLibraryEngineModel(context, args) {
    const input = args.input;
    const isComplete = input.trainStatus === 'complete';
    let libraryName = null;
    try {
      // deleteEntities deletes all matching entities so, to be paranoid,
      // we'll double-check that ID is set.
      checkId(input.id);
      const libraryEngineModel = await authLibraryEngineModel(
        input.id,
        input.organizationIds
      );
      libraryEngineModel.organizationId =
        input.organizationId ||
        _.get(
          libraryEngineModel,
          'lOwnerOrgId',
          _.get(libraryEngineModel, 'library.ownerOrgId')
        );
      const trainJobId = input.trainJobId || libraryEngineModel.trainJobId;
      const trainStatus = input.trainStatus || libraryEngineModel.trainStatus;
      const metadata = input.jsondata || libraryEngineModel.metadata || {};
      if (input.contentType) metadata.contentType = input.contentType;
      let dataUrl = input.dataUrl || libraryEngineModel.dataUrl;
      const accuracy = input.accuracy || libraryEngineModel.accuracy;
      const configurationId =
        input.configurationId || libraryEngineModel.configurationId;

      if (
        input.file ||
        (input.dataUrl && input.dataUrl !== libraryEngineModel.dataUrl)
      ) {
        let file = {};
        if (input.file) {
          file = {
            content: input.file.inputStream,
            contentType: input.contentType || input.file.contentType
          };
        } else {
          if (!resUtil.isOurBucket(dataUrl)) {
            // download file if passed in different url
            const responseHeaders = {};
            const newContent = await resUtil.download(
              dataUrl,
              context,
              responseHeaders
            );
            file = {
              content: newContent,
              contentType:
                input.contentType ||
                responseHeaders['Content-Type'] ||
                responseHeaders['content-type']
            };
          }

          // if the dataUrl was signed, strip off the signature before updating it in the database
          dataUrl = resUtil.isRealSignedUrl(dataUrl)
            ? resUtil.stripSignatureSignedUrl(dataUrl)
            : dataUrl;
        }
        metadata.contentType =
          input.contentType ||
          file.contentType ||
          _.get(libraryEngineModel, 'metadata.contentType');

        if (!_.isEmpty(file)) {
          try {
            const updatedModel = await librariesService.saveLibraryEngineModelDataFile(
              libraryEngineModel,
              file
            );
            // dataUrl is reset by saveLibraryEngineModelDataFile.
            dataUrl = updatedModel.dataUrl;
          } catch (err) {
            if (
              err instanceof BadRequestError ||
              err.name === 'BadRequestError'
            ) {
              let badType = file.contentType || '';
              badType += '(' + libraryEngineModel.contentType + ')';
              throw new errors.InvalidInput({
                message:
                  'The file upload request was malformed or had an ' +
                  'invalid content type. The provided content type was ' +
                  '"' +
                  badType +
                  '". Retry the request, supplying a valid MIME type ' +
                  'in the UpdateLibraryEngineModel.contentType field ' +
                  'or on the file upload parameter.'
              });
            } else {
              throw err;
            }
          }
        }
      }

      const values = [
        trainJobId,
        trainStatus,
        dataUrl,
        metadata,
        moment().unix(),
        accuracy,
        configurationId,
        input.id
      ];

      const sql = `UPDATE ${schemaName}.library_engine_model
      SET
        train_job_id = $1,
        train_status = $2,
        data_url = $3,
        metadata = $4,
        modified_date_time = $5,
        accuracy = $6,
        configuration_id = $7
      WHERE library_engine_model_id = $8
      RETURNING *;`;

      const result = await dbWrite.oneOrNone(
        sql,
        values,
        hydrateLibraryEngineModel
      );
     
      if (isComplete && result.libraryId) {
        try {
          const library = await getLibrary({ id: result.libraryId });
          libraryName = library.name;
        } catch (err) {
          logger.warn('Could not retrieve library name for audit event', { 
            libraryId: result.libraryId, 
            error: err 
          });
        }
      }
      isComplete &&
        emitLibraryTrainingCompleteEvent(
          result.libraryId,
          result.libraryEngineModelId,
          result.libraryVersion,
          result.engineId,
          result.trainJobId,
          result.trainStatus,
          libraryEngineModel.organizationId,
          context,
          libraryName,
          null
        );

      return result;
    } catch (err) {
      if (isComplete) {
        try {
          // Get libraryEngineModel to extract libraryId
          const libraryEngineModel = await getLibraryEngineModel({ 
            id: input.id,
          });
          
          if (libraryEngineModel && libraryEngineModel.libraryId) {
            const library = await getLibrary({ id: libraryEngineModel.libraryId });
            libraryName = library.name;
          }
        } catch (nameErr) {
          logger.warn('Could not retrieve library info for error audit event', nameErr);
        }
        emitLibraryTrainingCompleteEvent(
          input.id, // libraryId
          null, // libraryEngineModelId
          null, // libraryVersion
          null, // engineId
          null, // trainJobId
          null, // trainStatus
          input.organizationid, // organizationId
          context,
          libraryName,
          err
        );
      }
      throw err;
    }
  }

  function emitLibraryTrainingCompleteEvent(
    libraryId,
    libraryEngineModelId,
    libraryVersion,
    engineId,
    trainJobId,
    trainStatus,
    orgId,
    context,
    libraryName,
    error
  ) {
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.LibraryTrainingComplete.event,
      type: eventsMap.LibraryTrainingComplete.type,
      libraryEngineModelId,
      libraryId,
      libraryVersion: libraryVersion ? parseInt(libraryVersion) : null,
      organizationId: orgId ? parseInt(orgId) : null,
      engineId,
      trainJobId,
      trainStatus,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        libraryId,
        error,
        null,
        !error ? 'success' : 'failure',
        !error ? `Trained library ${libraryName}` : `Failed to train library ${libraryName}`
      )
    };
    !error && messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
    messageUtil.emitPublicEvent(
      supportedEvents.LibraryTrainingComplete,
      'system',
      context,
      event
    );
  }

  function deleteLibraryEngineModel(args) {
    checkId(args.id);
    const post = { libraryEngineModelId: args.id };
    // prettier-ignore
    return authLibraryEngineModel(args.id, args.organizationIds).then(
      function() {
      return librariesService
        .deleteLibraryEngineModels(post)
        .then(function(data) {
          return {
            id: args.id,
            message: 'library engine model ' + args.id + ' deleted.'
          };
        });
    });
  }

  async function createLibraryCollaborator(context, args) {
    const input = args.input;
    checkId(input.libraryId);
    await authLibrary(input.libraryId);

    const sql = `INSERT INTO ${schemaName}.library_collaborator
    (library_id, collaborator_org_id, permissions, status, created_date_time, modified_date_time)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      input.libraryId,
      input.organizationId,
      JSON.stringify(input.permissions),
      input.status,
      currEpochTime,
      currEpochTime
    ];

    const result = await dbWrite.map(
      sql,
      values,
      function mapLibraryCollaborator(row) {
        var res = mapper.camelizeRootKeys(row);
        res.organizationId = res.collaboratorOrgId;
        return res;
      }
    );

    if (!result) return result;
    return result[0];
  }

  async function updateLibraryCollaborator(context, args) {
    const input = args.input;
    checkId(input.libraryId);

    const libraryCollaborator = await getLibraryCollaborator({
      libraryId: input.libraryId,
      collaboratorOrgId: input.organizationId
    });

    if (input.status) {
      libraryCollaborator.status = input.status;
    }

    if (input.permissions) {
      libraryCollaborator.permissions = input.permissions;
    }

    const sql = `UPDATE ${schemaName}.library_collaborator
    SET
      permissions = $1,
      status = $2,
      modified_date_time = $3
    WHERE library_id = $4
      AND collaborator_org_id = $5
    RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      JSON.stringify(libraryCollaborator.permissions),
      libraryCollaborator.status,
      currEpochTime,
      libraryCollaborator.libraryId,
      libraryCollaborator.organizationId
    ];

    const result = await dbWrite.map(
      sql,
      values,
      function mapLibraryCollaborator(row) {
        var res = mapper.camelizeRootKeys(row);
        res.organizationId = res.collaboratorOrgId;
        return res;
      }
    );
    if (!result) return result;
    return result[0];
  }

  function getLibraryCollaborators(args) {
    return librariesService.getLibraryCollaborators(args).then(function (data) {
      if (_.isNil(data)) {
        throw new Error('unable to get the library collaborators.');
      }
      const results = _.get(data, 'results', []);
      return {
        records: results.map(mapper.mapLibraryCollaborator),
        count: results.length, // not totalResults
        offset: args.offset,
        limit: args.limit
      };
    });
  }

  function getLibraryCollaborator(args) {
    return getLibraryCollaborators(args).then(function (items) {
      if (items && items.count > 0 && !_.isEmpty(items.records)) {
        return items.records[0];
      }
      throw new errors.NotFound({
        data: {
          objectId: `${args.libraryId} - ${args.collaboratorOrgId}`,
          objectType: 'LibraryCollaborator'
        }
      });
    });
  }

  function deleteLibraryCollaborator(args) {
    checkId(args.libraryId);
    const libraryCollaborator = {
      libraryId: args.libraryId,
      collaboratorOrgId: args.organizationId
    };
    return getLibraryCollaborator(libraryCollaborator).then(function (item) {
      return librariesService
        .deleteLibraryCollaborators(Object.assign(libraryCollaborator, item)) // avoid missing collaboratorOrgId
        .then(function (data) {
          return {
            id: `${args.libraryId} - ${args.organizationId}`,
            message: `library collaborator model libraryId: ${args.libraryId}, organizationId: ${args.organizationId} deleted.`
          };
        });
    });
  }

  function getLibrary(args) {
    return getLibraries(args).then(function (libs) {
      if (libs.count) {
        return libs.records[0];
      }
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'Library'
        }
      });
    });
  }

  function getEntity(args) {
    return getEntities(args).then(function (libs) {
      if (libs.count) {
        return libs.records[0];
      }
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'Entity'
        }
      });
    });
  }

  async function getEntityIdentifierTypes(args) {
    const id = _.get(args, 'id');
    let ids = _.get(args, 'ids');
    const limit = _.get(args, 'limit', 30);
    const offset = _.get(args, 'offset', 0);

    const vars = [limit, offset];
    let condition;
    if (id) {
      ids = [id];
    }
    if (ids && ids.length) {
      condition = ids.reduce((accumulator, id, index) => {
        accumulator = `${accumulator}${
          index > 0 ? ' OR ' : ''
        }entity_identifier_type_id = $${index + 3}`;
        vars.push(id);
        return accumulator;
      }, 'WHERE ');
    }

    const sql = `
      SELECT
        entity_identifier_type_id as id,
        label,
        label_plural,
        icon_class,
        description,
        data_type
      FROM ${schemaName}.entity_identifier_type
      ${condition || ''}
      LIMIT $1
      OFFSET $2
    `;

    const records = await libDBConnections.read.map(
      sql,
      vars,
      mapper.camelizeRootKeys
    );

    return {
      limit,
      offset,
      records,
      count: records.length
    };
  }

  async function getEntityIdentifierType(args) {
    const types = await getEntityIdentifierTypes(args);
    if (!types.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'EntityIdentifierType'
        }
      });
    }

    return types.records[0];
  }

  async function getEntityIdentifierItems(args) {
    const libraryTypeId = _.get(args, 'libraryTypeId');
    const entityIdentifierTypeId = _.get(args, 'entityIdentifierTypeId');
    const limit = _.get(args, 'limit', 30);
    const offset = _.get(args, 'offset', 0);

    let condition = '';
    if (libraryTypeId || entityIdentifierTypeId) {
      if (entityIdentifierTypeId) {
        condition = condition + 'entity_identifier_type_id = $1';
        if (libraryTypeId) {
          condition = condition + ' AND ';
        }
      }

      if (libraryTypeId) {
        condition = condition + 'library_type_id = $2';
      }
    }

    const sql = `
      SELECT library_type_id, entity_identifier_type_id, min_items, max_items
      FROM ${schemaName}.library_type__entity_identifier_type
      ${condition.length > 0 ? 'WHERE ' + condition : ''}
      LIMIT $3
      OFFSET $4
    `;

    const records = await libDBConnections.read.map(
      sql,
      [entityIdentifierTypeId, libraryTypeId, limit, offset],
      mapper.camelizeRootKeys
    );

    return {
      limit,
      offset,
      records,
      count: records.length
    };
  }

  function getLibraryTypes(args) {
    args.libraryType = args.id;
    return librariesService.getLibraryTypes(args).then(function (data) {
      return {
        records: data.results.map(function (row) {
          return mapper.mapLibraryType(row);
        }),
        count: data.totalResults,
        offset: args.offset,
        limit: args.limit
      };
    });
  }

  function getLibraryType(args) {
    if (!args.id) throw new Error('id arg is required'); // server bug

    return getLibraryTypes(args).then(function gotLibs(libs) {
      if (!libs.count) {
        throw new errors.NotFound({
          data: {
            objectId: args.id,
            objectType: 'LibraryType'
          }
        });
      }
      return libs.records[0];
    });
  }

  /**
   * Add Tdos to a Dataset Library
   * @param {Object} args - tdo ids, library id and basic user info for validation
   * @param {Object} args.input - add tdo info
   * @param {string} args.input.libraryId - dataset library to add Tdos to
   * @param {string[]} args.input.tdoIds - a list of Tdos to add to the selected dataset library above
   * @param {string[]} args.organizationIds - a list of organizations the current user belong to
   */
  async function addDataset(args) {
    const { input, organizationIds } = args;
    const { libraryId, tdoIds } = input;

    checkId(libraryId);
    authLibrary(libraryId, organizationIds);

    const tdosString = tdoIds.reduce((accumulator, value, index) => {
      return `${accumulator}${index > 0 ? ', ' : ''}($1, $${index + 2})`;
    }, '');

    const sql = `
    INSERT INTO ${schemaName}.library__recording (library_id, recording_id)
    VALUES  ${tdosString}
    ON CONFLICT DO NOTHING
    RETURNING recording_id`;

    const addedRecordings = await libDBConnections.write.query(sql, [
      libraryId,
      ...tdoIds
    ]);

    return {
      libraryId: libraryId,
      tdoIds: addedRecordings.map((value) => {
        return value.recording_id;
      })
    };
  }

  /**
   * Remove Tdos from a Dataset Library
   * @param {Object} args - tdo ids, library id and basic user info for validation
   * @param {Object} args.input - delete info
   * @param {string} args.input.libraryId - dataset library to remove Tdos from
   * @param {string[]} args.input.tdoIds - a list of Tdos to remove to the selected dataset library above
   * @param {string[]} args.organizationIds - a list of organizations the current user belong to
   */
  async function deleteDataset(args) {
    const { input, organizationIds } = args;
    const { libraryId, tdoIds } = input;

    checkId(libraryId);
    authLibrary(libraryId, organizationIds);

    const tdosString = tdoIds.reduce((accumulator, value, index) => {
      return `${accumulator}${index > 0 ? ', ' : ''}$${index + 2}`;
    }, '');

    const sql = `
      DELETE FROM ${schemaName}.library__recording
      WHERE library_id = $1
        AND recording_id IN (${tdosString})
      RETURNING recording_id`;

    const deleteStatus = await libDBConnections.write.query(sql, [
      libraryId,
      ...tdoIds
    ]);
    const deletedIds = deleteStatus.map((value) => {
      return value.recording_id;
    });

    return {
      tdoIds: deletedIds,
      libraryId: libraryId,
      message: `[${deletedIds.toString()}] are removed from ${libraryId}`
    };
  }

  async function getDataset(args) {
    const { libraryId } = args;

    checkId(libraryId);

    const sql = `
      SELECT recording_id
      FROM ${schemaName}.library__recording
      WHERE library_id = $1
    `;

    const savedTdoIds = await libDBConnections.read.query(sql, [libraryId]);
    return {
      libraryId: libraryId,
      tdoIds: savedTdoIds.map((value) => {
        return value.recording_id;
      })
    };
  }

  /**
   * Validate user permission on update or delete a libary configuration
   * @param {string} id - id of the configuration to modify
   * @param {string[]} organizationIds - list of organization ids the current user belong to
   */
  async function authConfiguration(id, organizationIds) {
    const sql = `
      SELECT config.library_id
      FROM ${schemaName}.model_configurations config
      WHERE config.configuration_id = $1
    `;
    const matchedLibraries = await libDBConnections.read.query(sql, [id]);

    if (matchedLibraries.length > 1) {
      throw Error(
        `${matchedLibraries.length} libraries with configuration id ${id}`
      ); // server bug check
    }

    const libraryId = _.get(matchedLibraries, [0, 'library_id'], undefined);
    if (!libraryId) {
      throw new errors.NotFound({
        message: 'Cannot find matched library configuration',
        data: {
          id: id,
          objectType: 'LibraryConfiguration'
        }
      });
    }

    return authLibrary(libraryId, organizationIds);
  }

  /**
   * Retrieve library configuration
   * @param {Object} args - keys to retrieve the configuration
   * @param {string} args.id - configuration id
   */
  async function getLibraryConfiguration(args) {
    const configId = args.id;
    checkId(configId);

    const sql = `
      SELECT dataset.*, model.*
      FROM ${schemaName}.model_configurations model
      LEFT JOIN ${schemaName}.dataset_configurations dataset
      ON model.configuration_id = dataset.configuration_id
      WHERE model.configuration_id = $1
    `;

    const savedConfigs = await libDBConnections.read.query(sql, [configId]);
    if (savedConfigs.length > 0) {
      const config = savedConfigs[0];
      const formattedConfig = formatReturnConfiguration(config);
      return formattedConfig;
    }

    throw new errors.NotFound({
      message: 'Cannot find library configuration',
      data: {
        objectType: 'LibraryConfiguration',
        objectId: args.id
      }
    });
  }

  /**
   * Retrieve library configurations
   * @param {Object} args - keys to retrieve the configuration
   * @param {string} args.libraryId - library id
   * @param {string} args.limit - limit num return values
   * @param {string} args.offset - offset
   */
  async function getLibraryConfigurations(args) {
    const libraryId = args.libraryId;
    const limit = _.get(args, 'limit', 0);
    const offset = _.get(args, 'offset', 0);
    checkId(libraryId);

    let sql = `
      SELECT dataset.*, model.*
      FROM ${schemaName}.model_configurations model
      LEFT JOIN ${schemaName}.dataset_configurations dataset
      ON model.configuration_id = dataset.configuration_id
      WHERE model.library_id = $1
      ORDER BY model.created_date_time DESC
      OFFSET $2
    `;

    if (limit && limit > 0) {
      sql = sql + `LIMIT $3`;
    }

    const configurations = await libDBConnections.read.query(sql, [
      libraryId,
      offset,
      limit
    ]);

    const records = configurations.map((config) => {
      return formatReturnConfiguration(config);
    });

    return {
      limit: limit,
      offset: offset,
      count: configurations.length,
      records: records
    };
  }

  function formatReturnConfiguration(config) {
    let formattedData = {
      id: config.configuration_id,
      libraryId: config.library_id,
      engineCategoryId: config.engine_category_id,
      targetEngineIds: config.target_engine_ids
    };

    if (config.ranked_source_engine_ids) {
      formattedData.rankedSourceEngineIds = config.ranked_source_engine_ids;
    }

    if (config.min_confidence !== null && config.max_confidence !== null) {
      formattedData.confidence = {
        min: config.min_confidence,
        max: config.max_confidence,
        allowNull: config.allow_null_confidence
      };
    }

    return formattedData;
  }

  /**
   * Create basic library configuration
   * @param {Object} args - configuration options & current user's info
   * @param {string[]} args.organizationIds - a list of organization ids the current user belong to
   * @param {Object} args.input - library configuration options
   * @param {string} args.input.libraryId - id of the library this config applies to
   * @param {string} args.input.engineCategoryId - id of the engine category this config applies to
   * @param {string[]} args.input.targetEngineIds - a list of selected engines for training
   * @param {boolean} returnSavedConfig - a flag to retrieve & return the saved config when saving is done
   */
  async function createModelConfiguration(args, returnSavedConfig = true) {
    const { input, organizationIds } = args;
    const { libraryId, engineCategoryId, targetEngineIds } = input;

    const id = input.id || uuid.v4();

    checkId(id);
    checkId(libraryId);
    await authLibrary(libraryId, organizationIds);

    //Create model configurations
    const sql = `
      INSERT INTO ${schemaName}.model_configurations (
        configuration_id,
        library_id,
        engine_category_id,
        target_engine_ids
      )
      VALUES ($1, $2, $3, $4)
    `;

    await libDBConnections.write.query(sql, [
      id,
      libraryId,
      engineCategoryId,
      targetEngineIds || []
    ]);

    if (returnSavedConfig) {
      return await getLibraryConfiguration({ id: id });
    } else {
      return { id: id };
    }
  }

  /**
   * Update basic library configuration
   * @param {Object} args - configuration options & current user's info
   * @param {string[]} args.organizationIds - a list of organization ids the current user belong to
   * @param {Object} args.input - library configuration options
   * @param {string} args.input.id - id of the configuration to update
   * @param {string[]} args.input.targetEngineIds - a list of selected engines for training
   * @param {boolean} returnSavedConfig - a flag to retrieve & return the saved config when saving is done
   */
  async function updateModelConfiguration(args, returnUpdatedConfig = true) {
    const { input, organizationIds } = args;
    const { id, targetEngineIds } = input;

    checkId(id);
    await authConfiguration(id, organizationIds);

    const { sql, values } = mainUtil.makeUpdateSql(
      `${schemaName}.model_configurations`, // table name
      {
        target_engine_ids: targetEngineIds
      }, // updated column data
      { configuration_id: 'id' }, // select data
      ' configuration_id = $2 ' // where clause
    );
    values.push(id);

    await libDBConnections.write.query(sql, values);

    if (returnUpdatedConfig) {
      return await getLibraryConfiguration({ id: id });
    } else {
      return { id: id };
    }
  }

  /**
   * Delete library configuration
   * @param {Object} args - user basic info & key to the deleting configuration
   * @param {string} args.id - id of the deleting configuration
   * @param {string[]} args.organizationIds - a list of organizations the current user belong to
   */
  async function deleteModelConfiguration(args) {
    const { id, organizationIds } = args;

    checkId(id);
    await authConfiguration(id, organizationIds);

    const sql = `
      DELETE FROM ${schemaName}.model_configurations config
      WHERE config.configuration_id = $1
    `;
    await libDBConnections.write.query(sql, [id]);
    return {
      id: id,
      message: `${id} is deleted`
    };
  }

  /**
   * Create dataset library configuration.
   * This function also create basic library configuration through createModelConfiguration
   * @param {Object} args - configuration options & user's info
   * @param {string[]} args.organizationIds - a list of organization the current user belong to
   * @param {Object} args.input - configuration options
   * @param {string} args.input.libraryId - id of the library this config applies to
   * @param {string} args.input.engineCategoryId - id of the engine category this config appliess to
   * @param {string[]} args.input.targetEngineIds - a list of selected engines for training
   * @param {Object} args.input.confidence - confidence filter for the selected tdos
   * @param {number} args.input.confidence.min - minimum confidence filter. All selected tdos having confidence lower than this will be ignored
   * @param {number} args.input.confidence.max - maximum confidence filter. All selected tdos having confidence higher than this will be ignored
   * @param {boolean} args.input.confidence.allowNull - a flag to accept tdos with confidence = null
   * @param {string[]} args.input.rankedSourceEngineIds - a list of ranked engines where tdos is extracted from
   */
  async function createDatasetConfiguration(args) {
    const savedModelConfigs = await createModelConfiguration(args, false);

    const id = savedModelConfigs.id;
    checkId(id);

    const { input, organizationIds } = args;
    const { rankedSourceEngineIds, confidence, libraryId } = input;
    const { min, max, allowNull } = confidence;
    checkId(libraryId);
    await authLibrary(libraryId, organizationIds);

    //Create new dataset configurations
    const sql = `
      INSERT INTO ${schemaName}.dataset_configurations (
        configuration_id,
        ranked_source_engine_ids,
        min_confidence,
        max_confidence,
        allow_null_confidence
      )
      VALUES ($1, $2, $3, $4, $5)
    `;
    await libDBConnections.write.query(sql, [
      id,
      rankedSourceEngineIds || [],
      min || 0,
      max || 100,
      allowNull
    ]);

    return await getLibraryConfiguration({ id: id });
  }

  /**
   * Update dataset library configuration.
   * This function also update basic library configuration through updateModelConfiguration
   * @param {Object} args - configuration options & user's info
   * @param {string[]} args.organizationIds - a list of organization the current user belong to
   * @param {Object} args.input - configuration options
   * @param {string} args.input.id - id of the configuration to update
   * @param {string[]} args.input.targetEngineIds - a list of selected engines for training
   * @param {Object} args.input.confidence - confidence filter for the selected tdos
   * @param {number} args.input.confidence.min - minimum confidence filter. All selected tdos having confidence lower than this will be ignored
   * @param {number} args.input.confidence.max - maximum confidence filter. All selected tdos having confidence higher than this will be ignored
   * @param {boolean} args.input.confidence.allowNull - a flag to accept tdos with confidence = null
   * @param {string[]} args.input.rankedSourceEngineIds - a list of ranked engines where tdos is extracted from
   */
  async function updateDatasetConfiguration(args) {
    const updatedModelConfigs = await updateModelConfiguration(args, false);
    const id = updatedModelConfigs.id;

    const { input, organizationIds } = args;
    checkId(id);
    await authConfiguration(id, organizationIds);

    const { rankedSourceEngineIds, confidence } = input;
    const { min, max, allowNull } = confidence;
    const { sql, values } = mainUtil.makeUpdateSql(
      `${schemaName}.dataset_configurations`, // table name
      {
        min_confidence: min,
        max_confidence: max,
        allow_null_confidence: allowNull,
        ranked_source_engine_ids: rankedSourceEngineIds
      }, // updated column data
      { configuration_id: 'id' }, // select data
      ' configuration_id = $5 ' // where clause
    );
    values.push(id);

    await libDBConnections.write.query(sql, values);

    return await getLibraryConfiguration({ id: id });
  }

  function hydrateLibraryEngineModel(row) {
    let libraryEngineModel = row;

    if (row.l__library_id) {
      libraryEngineModel.library = model.Library.fromDB(
        _.mapKeys(row, function mapLibrary(value, key) {
          const matches = key.match(/^l__(.*)$/);
          return matches ? matches[1] : null;
        })
      );

      libraryEngineModel.library.libraryType = model.LibraryType.fromDB(
        _.mapKeys(row, function mapLibraryType(value, key) {
          const matches = key.match(/^lt__(.*)$/);
          return matches ? matches[1] : null;
        })
      );
    }

    libraryEngineModel = mapper.mapLibraryEngineModel(libraryEngineModel);

    if (libraryEngineModel.modifiedDateTime)
      libraryEngineModel.modifiedDateTime =
        libraryEngineModel.modifiedDateTime * 1000;
    if (libraryEngineModel.createdDateTime)
      libraryEngineModel.createdDateTime =
        libraryEngineModel.createdDateTime * 1000;

    return libraryEngineModel;
  }

  return {
    createLibrary: createLibrary,
    createLibraryType: createLibraryType,
    getLibraryTypes: getLibraryTypes,
    getLibraryType: getLibraryType,
    deleteLibrary: deleteLibrary,
    updateLibrary: updateLibrary,
    publishLibrary: publishLibrary,
    createEntityIdentifierType: createEntityIdentifierType,
    createEntity: createEntity,
    updateEntity: updateEntity,
    deleteEntity: deleteEntity,
    createEntityIdentifier: createEntityIdentifier,
    deleteEntityIdentifier: deleteEntityIdentifier,
    updateEntityIdentifier: updateEntityIdentifier,
    getEntities: getEntities,
    getEntityIdentifiers: getEntityIdentifiers,
    getLibraries: getLibraries,
    createLibraryEngineModel: createLibraryEngineModel,
    updateLibraryEngineModel: updateLibraryEngineModel,
    deleteLibraryEngineModel: deleteLibraryEngineModel,
    createLibraryCollaborator: createLibraryCollaborator,
    updateLibraryCollaborator: updateLibraryCollaborator,
    deleteLibraryCollaborator: deleteLibraryCollaborator,
    getLibraryEngineModels,
    getLibraryEngineModel,
    getLibrary: getLibrary,
    getEntity: getEntity,
    getEntityIdentifierTypes,
    getEntityIdentifierType,
    getEntityIdentifierItems,
    getDataset: getDataset,
    addDataset: addDataset,
    deleteDataset: deleteDataset,
    getLibraryConfiguration: getLibraryConfiguration,
    getLibraryConfigurations: getLibraryConfigurations,
    createModelConfiguration: createModelConfiguration,
    updateModelConfiguration: updateModelConfiguration,
    createDatasetConfiguration: createDatasetConfiguration,
    updateDatasetConfiguration: updateDatasetConfiguration,
    deleteLibraryConfiguration: deleteModelConfiguration,

    //Just for unit test
    checkId,
    authConfiguration,
    deleteModelConfiguration,
    authEntityIdentifier,
    hydrateLibraryEngineModel
  };
};
