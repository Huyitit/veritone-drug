const mapper = require('./mapper.js');
const _ = require('lodash');
const uuid = require('uuid');
const util = require('util');
const AWS = require('aws-sdk');

const STATUS_ACTIVE = 'active';
const STATUS_DELETED = 'deleted';
const STATUS_PUBLISHED = 'published';

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const storage = _.get(serviceContext, 's3Buckets.dataset.storage');
  const errors = require('../error')(serviceContext.config);
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const elasticclient = require('./../util/elastic.js')(serviceContext).client;
  const sdo = require('./structureddata.js')(serviceContext);
  const s3 = new AWS.S3();
  const path = require('path');
  // const dal = serviceContext.dal;

  async function validateDatasetId(id, organizationId) {
    if (!id) {
      // this is a missing or empty value
      throw new errors.InvalidInput({
        message: 'Invalid ID format. A UUID is required.',
        data: { objectId: id }
      });
    }
    let isIndexExists = await elasticclient.exists({
      index: 'dataset_meta',
      type: '_doc',
      id: id
    });
    if (!isIndexExists) {
      throw new errors.InvalidInput({
        message:
          'An DatasetId provided does not exsists ' +
          'Ensure that DatasetId is Created  and try the query again.'
      });
    }
    if (organizationId) {
      var response = await elasticclient.get({
        index: 'dataset_meta',
        type: '_doc',
        id: id
      });

      if (
        organizationId !=
        _.get(response.body._source, 'schema.organizationId', -1)
      )
        throw new errors.InvalidInput({
          message: 'Id specified does not exists',
          data: { objectId: id }
        });
    }
  }

  function buildDatasetsFilterOperationOR(filter, organizationId) {
    if (!filter) return;
    var _filter = [];
    var filterterm = {
      must: [
        {
          term: {
            'schema.organizationId': `${organizationId}`
          }
        },
        {
          nested: {
            path: 'tags',
            query: {
              bool: {
                ['should']: _filter
              }
            }
          }
        }
      ]
    };

    var term = {};
    if (_.has(filter, 'tags')) {
      for (const tag of filter.tags) {
        term = {
          bool: {
            must: [
              {
                match: {
                  'tags.name': _.get(tag, 'name', '*')
                }
              },
              {
                match: {
                  'tags.value': _.get(tag, 'value', '*')
                }
              }
            ]
          }
        };
        _filter.push(term);
      }
    }
    return filterterm;
  }

  function buildDatasetsFilterOperationAND(filter, organizationId) {
    if (!filter) return;
    var _nested = [];
    _nested.push({
      term: {
        'schema.organizationId': `${organizationId}`
      }
    });

    if (_.has(filter, 'tags')) {
      for (const tag of filter.tags) {
        var _filter = [];
        var filterterm = {
          nested: {
            path: 'tags',
            query: {
              bool: {
                ['must']: _filter
              }
            }
          }
        };
        var term = {
          bool: {
            must: [
              {
                match: {
                  'tags.name': _.get(tag, 'name', '*')
                }
              },
              {
                match: {
                  'tags.value': _.get(tag, 'value', '*')
                }
              }
            ]
          }
        };
        _filter.push(term);
        _nested.push(filterterm);
      }
    }
    var filteredQuery = {
      must: _nested
    };
    return filteredQuery;
  }

  async function updateIndexDataset(index, type, datasetId, body) {
    var bulk = [];
    bulk.push({
      update: {
        _id: datasetId,
        _index: index
      }
    });
    bulk.push({
      doc: body
    });
    var { errors } = await elasticclient.bulk({ type: type, body: bulk });
    return errors;
  }

  async function copyDataSetUrls(storeUris, datasetId, dataset) {
    var urls = [];
    for (const storeUri of storeUris) {
      var dataUrl = _.get(dataset, `data.${storeUri}`, null);
      var savedUrl = resUtil.isRealSignedUrl(dataUrl)
        ? resUtil.stripSignatureSignedUrl(dataUrl)
        : dataUrl;
      var extension = path.extname(savedUrl);
      const filename = util.format(
        '%s_%s%s',
        dataset.id,
        new Date().getTime(),
        extension ? extension : '.dat'
      );
      const bucket = _.get(serviceContext, 's3Buckets.dataset.s3.bucket');
      var params = {
        Bucket: bucket,
        CopySource: encodeURI(savedUrl),
        Key: datasetId + '/' + filename
      };
      await s3
        .copyObject(params)
        .promise()
        .then(() => {
          urls[`${storeUri}`] =
            `https://${bucket}.s3.amazonaws.com/` + datasetId + '/' + filename;
        })
        .catch((e) => logger.error(e));
    }
    return urls;
  }

  async function addDatasetRows(
    context,
    datasetId,
    organizationId,
    schemaId,
    datasets
  ) {
    try {
      for (const dataset of datasets.data) {
        var storeUriContents = dataset.storeUriContents;
        if (storeUriContents) {
          var copiedDataSetDataUrl = await copyDataSetUrls(
            storeUriContents,
            datasetId,
            dataset
          );
          for (var key in copiedDataSetDataUrl) {
            _.set(dataset, `data.${key}`, copiedDataSetDataUrl[key]);
          }
        }
        // no need to store this
        delete dataset.storeUriContents;
      }
      // currently we are adding data one at a time , We need to create bulk API;s
      let structuredDataOject = [];

      const structuredData = await sdo.createStructuredDatasets(
        {
          input: {
            schemaId: schemaId,
            datasetId: datasetId,
            dataset: datasets.data
          },
          organizationId
        },
        context
      );

      if (structuredData) {
        // for StructuredData resolver
        const dataset = _.map(structuredData.dataset, (data) => ({
          dataRegistryId: structuredData.dataRegistryId, // this is same as schemaId
          ...data
        }));
        structuredDataOject = _.concat(
          structuredDataOject,
          _.without(dataset, null, undefined)
        );
      }
      return structuredDataOject;
    } catch (err) {
      logger.error(err);
    }
  }

  async function updateDatasetRows(
    context,
    datasetId,
    organizationId,
    schemaId,
    datasets
  ) {
    // delete and add
    await deleteDatasetRows(context, organizationId, schemaId, datasets);
    return await addDatasetRows(
      context,
      datasetId,
      organizationId,
      schemaId,
      datasets
    );
  }

  async function deleteDatasetRows(
    context,
    organizationId,
    schemaId,
    datasets
  ) {
    var structredObjects = [];
    for (const dataset of datasets.data) {
      var id = await sdo.deleteStructuredData(
        {
          input: {
            id: dataset.id,
            schemaId: schemaId,
            organizationId
          },
          organizationId
        },
        context
      );
      structredObjects.push(id);
    }
    return structredObjects;
  }

  async function getDataset(context, args) {
    const datasetId = args.id;
    await validateDatasetId(datasetId);
    const { organizationId } = mainUtil.getAuthDataForJob(context);
    var response = await elasticclient.get({
      index: 'dataset_meta',
      type: '_doc',
      id: datasetId
    });
    if (
      organizationId ===
      _.get(response.body._source, 'schema.organizationId', -1)
    )
      return mapper.mapDataSet(response.body._source);
    else
      throw new errors.InvalidInput({
        message: 'Id specified does not exists',
        data: { objectId: datasetId }
      });
  }

  async function getDatasets(context, args) {
    const { organizationId } = mainUtil.getAuthDataForJob(context);
    const offset = args.offset ? args.offset : 0;
    const limit = args.limit ? args.limit : 30;
    var _filter = args.filter;
    var operation = _.get(_filter, 'operation', 'AND');
    //search
    let response = await elasticclient.search({
      index: 'dataset_meta',
      type: '_doc',
      body: {
        query: {
          bool:
            operation === 'OR'
              ? buildDatasetsFilterOperationOR(_filter, organizationId)
              : buildDatasetsFilterOperationAND(_filter, organizationId)
        },
        sort: [{ 'schema.createdDateTime': { order: 'desc' } }],
        from: offset,
        size: limit
      }
    });

    if (response) {
      var datasetrecords = _.get(response, 'body.hits.hits', [])
        .filter(function (record) {
          return record._source != null;
        })
        .map((hit) => {
          return hit._source;
        });
      var rowcount = _.get(response, 'body.hits.total.value', 0);
      var datasets = [];
      for (const dataset of datasetrecords) {
        datasets.push(mapper.mapDataSet(dataset));
      }
      return {
        offset: offset,
        limit: limit,
        records: datasets,
        count: rowcount
      };
    }
  }

  async function getDatasetDataQuery(context, args) {
    const { datasetId, filter, orderBy } = args;

    const limit = _.get(args, 'limit', 30);
    const offset = _.get(args, 'offset', 0);
    const entriesFilter = { ...filter };
    const { organizationId } = mainUtil.getAuthDataForJob(context);
    const dataset = await getDataset(context, { id: datasetId });
    const sdoSchemaId = _.get(dataset, 'schema.id');
    let datasetEntries = [];
    const matchedSdos = await sdo.getStructuredDataObjects(context, {
      limit,
      offset,
      orderBy,
      filter: entriesFilter,
      schemaId: sdoSchemaId,
      organizationId
    });

    if (matchedSdos.records || matchedSdos.records.length > 0) {
      const entries = matchedSdos.records.map((entry) => {
        const data = { ...entry.data };
        delete data.datasetId;
        return {
          data,
          datasetId,
          id: entry.id,
          datasetSchemaId: sdoSchemaId
        };
      });
      datasetEntries = datasetEntries.concat(entries);
    }

    return {
      limit,
      offset,
      count: datasetEntries.length,
      records: datasetEntries
    };
  }

  async function createDataset(context, args) {
    const input = args.input;
    if (!input) {
      throw new errors.InvalidInput({
        message:
          'The "input" field is required by createDataset. Set this field ' +
          'with appropriate values and try the mutation again.'
      });
    }
    if (!input.name) {
      throw new errors.InvalidInput({
        message:
          'An name is required for Dataset to create ' +
          'Ensure that name is available and try the mutation again.'
      });
    }
    if (!input.description) {
      throw new errors.InvalidInput({
        message:
          'An Description is required for Dataset to create ' +
          'Ensure that name is available and try the mutation again.'
      });
    }
    const datasetId = uuid.v4();
    // get the schema definition for sdo.
    const sdoSchema = await sdo.getSchema(context, {
      id: input.schemaId
    });
    var datasetInput = {
      datasetId: datasetId,
      schemaId: sdoSchema.id,
      name: input.name,
      description: input.description,
      schema: sdoSchema,
      tags: input.tags
    };
    await elasticclient.index({
      index: 'dataset_meta',
      type: '_doc',
      id: datasetId,
      body: datasetInput
    });

    return datasetInput;
  }

  async function updateDataset(context, args) {
    const input = args.input;
    const datasetId = args.id;

    if (!input) {
      throw new errors.InvalidInput({
        message:
          'The "input" field is required by createTDO. Set this field ' +
          'with appropriate values and try the mutation again.'
      });
    }
    if (!input.name) {
      throw new errors.InvalidInput({
        message:
          'An name is required for Dataset to create ' +
          'Ensure that name is available and try the mutation again.'
      });
    }
    if (!input.description) {
      throw new errors.InvalidInput({
        message:
          'An description is required for Dataset to create ' +
          'Ensure that name is available and try the mutation again.'
      });
    }

    const authData = mainUtil.getAuthDataForJob(context);
    const organizationId = authData.organizationId;
    await validateDatasetId(datasetId, organizationId); // validates the datasetid and checks if datasetId belongs to org
    // get the schema definition for sdo.
    const sdoSchema = await sdo.getSchema(context, {
      id: input.schemaId
    });

    var datasetUpdate = {
      datasetId: datasetId,
      schemaId: sdoSchema.id,
      name: input.name,
      description: input.description,
      schema: sdoSchema,
      tags: input.tags
    };
    // update SDO
    await sdo.updateSchemaMetadata(context, {
      input: {
        id: _.get(sdoSchema, 'dataRegistryMetadataId', null),
        name: _.get(datasetUpdate, 'name', null),
        description: _.get(datasetUpdate, 'description', null),
        source: `veritone-${organizationId}.datasets`
      },
      organizationId
    });
    // update elastic dataset meta
    var hasErrors = await updateIndexDataset(
      'dataset_meta',
      '_doc',
      datasetId,
      datasetUpdate
    );
    if (hasErrors)
      throw new errors.ServiceFailure({
        message: 'Failed to update datasets.'
      });

    return datasetUpdate;
  }

  async function deleteDataset(context, args) {
    const datasetId = args.id;
    const { organizationId } = mainUtil.getAuthDataForJob(context);
    await validateDatasetId(datasetId, organizationId); // validates the datasetid and checks if datasetId belongs to org

    var dataset = await getDataset(context, args);
    try {
      /* need to delete the SDO ( soft delete ) */
      await sdo.updateSchemaState(context, {
        input: {
          id: _.get(dataset, 'schema.id', null),
          status: STATUS_DELETED
        },
        organizationId
      });
    } catch (e) {
      // some case the schema not found such as db copy down ...
      // allow delete dataset which cannot find schema to soft update state to delete
      if (e.name == 'not_found') {
        logger.warn(e);
      } else {
        throw e;
      }
    }

    /* Delete index */
    await elasticclient.delete({
      index: 'dataset_meta',
      id: datasetId,
      type: '_doc'
    });
    return {
      datasetId: datasetId,
      message: `${datasetId.toString()} is deleted`
    };
  }

  async function createDatasetSchema(context, args) {
    const { input } = args;
    const { name, schema } = input;
    const description = _.get(input, 'description', '');
    const authData = mainUtil.getAuthDataForJob(context);
    const organizationId = authData.organizationId;
    const datasetId = uuid.v4();

    try {
      //Create Data Registry
      const sdoDataRegistry = await sdo.createSchemaMetadata(context, {
        input: {
          name,
          description,
          source: `veritone-${organizationId}.datasets`
        },
        organizationId
      });
      //Add Dataset Schema
      const sdoSchema = await sdo.upsertSchemaDraft(context, {
        input: {
          schema,
          dataRegistryId: sdoDataRegistry.id
        },
        organizationId
      });
      // publish the Schema
      await sdo.updateSchemaState(context, {
        input: {
          id: sdoSchema.id,
          status: STATUS_PUBLISHED
        },
        organizationId
      });
      // return
      var datasetInput = {
        datasetId: datasetId,
        schemaId: sdoSchema.id,
        name: input.name,
        description: input.description,
        schema: sdoSchema,
        tags: input.tags ? input.tags : ''
      };
      // add it to elastic
      await elasticclient.indices.putMapping({
        index: 'dataset_meta',
        body: {
          properties: {
            tags: {
              type: 'nested'
            }
          }
        }
      });
      await elasticclient.index({
        index: 'dataset_meta',
        type: '_doc',
        id: datasetId,
        body: datasetInput
      });
      return datasetInput;
    } catch (err) {
      logger.error(err);
    }
  }

  async function datasetOperation(context, args) {
    const datasetId = args.id;
    const { organizationId } = mainUtil.getAuthDataForJob(context);
    await validateDatasetId(datasetId, organizationId); // validates the datasetid and checks if datasetId belongs to org
    var dataset = await getDataset(context, args);
    var schemaId = _.get(dataset, 'schema.id', -1);
    //Get the Operation Type
    var actions = args.actions;
    let _addDataSets = actions.find((dataset) => dataset.action == 'ADD');
    let _updateDataSets = actions.find((dataset) => dataset.action == 'UPDATE');
    let _deleteDataSets = actions.find((dataset) => dataset.action == 'DELETE');
    var _results = [];
    if (!_.isEmpty(_addDataSets))
      _results = await addDatasetRows(
        context,
        datasetId,
        organizationId,
        schemaId,
        _addDataSets
      );
    else if (!_.isEmpty(_updateDataSets))
      _results = await updateDatasetRows(
        context,
        datasetId,
        organizationId,
        schemaId,
        _updateDataSets
      );
    else if (!_.isEmpty(_deleteDataSets))
      // need to test
      _results = await deleteDatasetRows(
        context,
        organizationId,
        schemaId,
        _deleteDataSets
      ); // need to test

    if (!_.isEmpty(_results)) {
      return {
        datasetId: datasetId,
        structuredDataObjects: _results
      };
    } else
      throw new errors.ServiceFailure({
        message: 'Failed to perform action on the dataset.'
      });
  }

  return {
    // CRUD API of Dataset provided schemaID
    createDataset,
    updateDataset,
    deleteDataset,

    // Create API of Dataset provided schema
    createDatasetSchema,

    // dataset Operations
    datasetOperation,

    // Query Opearions
    getDataset,
    getDatasets,
    getDatasetDataQuery
  };
};
