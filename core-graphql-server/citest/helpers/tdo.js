const _ = require('lodash');
const moment = require('moment');
const helpers = require('./index.js');
const path = require('path');
const fs = require('fs');

async function getAllJobIdsFromTDO(client, tdoId) {
  let allJobIds = [];
  let count = 0;
  let offset = 0;
  const limit = 100;
  try {
    do {
      const result = await fetchJobByTdoId(client, tdoId, limit, offset);
      const jobs = _.get(result, 'jobs.records', []);
      if (jobs.length === 0) {
        break;
      }
      const jobIds = jobs.map((job) => job.id);
      allJobIds.push(...jobIds);
      offset += limit;
      count = jobs.length;
    } while (count === limit);
  } catch (error) {
    console.warn(error);
  }

  return allJobIds;
}

async function fetchJobByTdoId(client, tdoId, limit, offset) {
  const { gqlClient, options } = client;
  const query = `
      query getJobs {
        jobs(targetId: "${tdoId}", status: [pending, queued, running], limit: ${limit}, offset: ${offset}) {
          records {
            id
          }
        }
      }
    `;

  return await gqlClient.query(query, null, options);
}

async function updateJobStatus(client, jobIds, status) {
  const batchSize = 10;
  // Since the update may be failed (v1, v2 jobs), we will update for each job
  for (let i = 0; i < jobIds.length; i += batchSize) {
    const batch = jobIds.slice(i, i + batchSize);
    const promises = batch.map(async (jobId) => {
      const query = `mutation updateJobs {
          updateJobs(input:{
            ids: ["${jobId}"]
            status: ${status}
          }) {
            records {
              id
              status
            }
          }
        }`;

      try {
        const { gqlClient, options } = client;
        await gqlClient.query(query, null, options);
      } catch (error) {
        console.warn(error);
      }
    });
    await Promise.all(promises);
  }
}

async function deleteTDO(client, tdoId, customQuery) {
  let query = customQuery;
  if (_.isNil(query) || _.isEmpty(query)) {
    query = `mutation {
        deleteTDO(id: "${tdoId}") {
          id
        }
      }`;
  }
  try {
    const { gqlClient, options } = client;
    return await gqlClient.query(query, null, options);
  } catch (error) {
    console.warn(error);
  }
}

/**
 * Delete and abort jobs that belong to
 * @param {*} gqlClient the graphql client
 * @param {*} tdoId tdoId
 * @param {*} customQuery the custom query
 * @param {*} requestOptions the request options
 * @param {*} abortJobs abort jobs or not: the default value is true
 * @returns tdo info from graphql
 */
async function processTDODeletion(
  gqlClient,
  tdoId,
  customQuery,
  requestOptions,
  abortJobs = true
) {
  const client = { gqlClient, options: requestOptions };
  if (abortJobs === true) {
    const jobIds = await getAllJobIdsFromTDO(client, tdoId);
    if (jobIds.length > 0) {
      await updateJobStatus(client, jobIds, 'aborted');
    }
  }

  return await deleteTDO(client, tdoId, customQuery);
}

async function createTDO(gqlClient, token, name, startDateTime, stopDateTime) {
  const query = `
  mutation createTDO {
    createTDO(input: {
      name: "${name || `Test TDO ${new Date().getTime()}`}",
      stopDateTime: "${stopDateTime || moment().toISOString()}",
      startDateTime: "${
        startDateTime || moment().subtract(1, 'minute').toISOString()
      }"
    }) {
      id
    }
  }`;
  try {
    const options = helpers.requestOptions(token);
    return await gqlClient.query(query, null, options);
  } catch (error) {
    throw new Error(`Failed to create TDO: ${error.message}`);
  }
}

/**
 * @param {string} url - graphql endpoint
 * @param {string} tdoId - container id.
 * @param {string} fileName - name of the file in the citest/mocks director.
 * @param {string} token - auth token for the request.
 * @returns {Promise<object>} The Supertest response object.
 * @throws {Error} If the file path is invalid or the request fails.
 */
async function createAssetWithMultipartUpload(url, tdoId, fileName, token) {
  const mockDir = path.resolve(__dirname, '../mocks');
  const filePath = path.resolve(mockDir, path.basename(fileName));
  if (!filePath.startsWith(mockDir + path.sep)) {
    throw new Error(`File path is outside of the mocks directory: ${fileName}`);
  }
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }
    const query = `
      mutation {
      	createAsset(input: {
      		containerId: "${tdoId}"
      		contentType: "application/json"
      		description: ""
      		type: "vtn-standard"
      	}) {
      		id
      		jsondata
      		fileData {
      			size
      			originalFileUri
      		}
      		sourceData {
      			name
      			taskId
      		}
      		details
      		uri
      	}
      }`;
    const headers = helpers.requestOptions(token).headers;
    let request = helpers
      .supertest(url)
      .post('')
      .set(headers)
      .field('query', query)
      .attach('file', filePath, { filename: fileName });

    const response = await request;
    return response;
  } catch (error) {
    console.error(
      'Error making multipart request with Supertest:',
      error.message
    );
    throw new Error(`Failed to create Asset: ${error.message}`);
  }
}

async function emitRecordingCognitionCompleted(gqlClient, recordingId, token) {
  const query = `
    mutation emitSystemEvent {
      emitSystemEvent(
        input: {
          topic: "RecordingsTopic"
          payload: {
            event: "recording_cognition_completed"
            recordingId: "${recordingId}"
            payload: {
              recordingId: "${recordingId}"
              skipMentionGeneration: true
            }
          }
        }
      ) {
        id
      }
    }`;
  const options = helpers.requestOptions(token);
  try {
    return await gqlClient.query(query, null, options);
  } catch (error) {
    throw new Error(
      `Failed to emit recording cognition completed: ${error.message}`
    );
  }
}

async function helpCreateTDO(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation createTDO ($input: CreateTDO) {
    createTDO(input: $input) {
      id
      name
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);

  return _.get(result, 'createTDO');
}

async function helpCreateTDOWithAsset(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation createTDOWithAsset ($input: CreateTDOWithAsset!) {
    createTDOWithAsset(input: $input) {
      id
      name
      details
      modifiedDateTime
      primaryAsset(assetType: "media") {
        contentType
        signedUri
      }
      folders{
        folderPath{
          name
          id
        }
      }
      sourceData {
        source {
          id
          sourceTypeId
        }
      }
      thumbnailUrl
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);

  return _.get(result, 'createTDOWithAsset');
}

async function helpGetTDO(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  const query = `query temp {
      temporalDataObject (id: "${id}") {
        id
        name
      }
    }`;

  const result = await gqlClient.query(query, null, options);
  return _.get(result, 'temporalDataObject');
}

async function helpGetTDOs(client, input) {
  const { gqlClient, options } = client;

  const query = `query temp (
    $organizationId: ID
    $applicationId: ID
    $id: ID
    $ids: [ID]
    $offset: Int = 0
    $limit: Int = 30
    $sourceId: ID
    $programId: ID
    $scheduledJobId: ID
    $sampleMedia: Boolean = false
    $includePublic: Boolean = false
    $orderBy: TemporalDataObjectOrderBy = startDateTime
    $orderDirection: OrderDirection = desc
    $dateTimeFilter: [TemporalDataObjectDateTimeFilter!]
    $mentionId: ID
  ) {
      temporalDataObjects (
        organizationId: $organizationId
        applicationId: $applicationId
        id: $id
        ids: $ids
        offset: $offset
        limit: $limit
        sourceId: $sourceId
        programId: $programId
        scheduledJobId: $scheduledJobId
        sampleMedia: $sampleMedia
        includePublic: $includePublic
        orderBy: $orderBy
        orderDirection: $orderDirection
        dateTimeFilter: $dateTimeFilter
        mentionId: $mentionId
      ) {
        records {
          id
          name
        }
      }
    }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'temporalDataObjects');
}

async function helpDeleteTDO(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation deleteTDO ($id: ID!) {
        deleteTDO (id: $id) {
          id
        }
      }`,
    { id: input.id },
    options
  );

  return _.get(result, 'deleteTDO');
}

async function helpUpdateTDO(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation ($input: UpdateTDO) {
        updateTDO (input: $input) {
          id
          name
          streamManifest {
            segments
            initSegment
          }
        }
      }`,
    { input },
    options
  );

  return _.get(result, 'updateTDO');
}

async function helpFileTDO(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation ($input: FileTemporalDataObject!) {
    fileTemporalDataObject (input: $input) {
      id
      name
      details
      modifiedDateTime
      folders{
        folderPath{
          name
          id
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);

  return _.get(result, 'fileTemporalDataObject');
}

async function helpMoveTDO(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation ($input: MoveTemporalDataObject!) {
        moveTemporalDataObject (input: $input) {
          id
          folders {
            folderPath {
              id
            }
          }
        }
      }`,
    { input },
    options
  );

  return _.get(result, 'moveTemporalDataObject');
}

async function helpUnFileTDO(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation ($input: UnfileTemporalDataObject!) {
        unfileTemporalDataObject (input: $input) {
          id
          name
          details
        }
      }`,
    { input },
    options
  );

  return _.get(result, 'unfileTemporalDataObject');
}

module.exports = {
  processTDODeletion,
  createTDO,
  createAssetWithMultipartUpload,
  emitRecordingCognitionCompleted,
  helpCreateTDO,
  helpCreateTDOWithAsset,
  helpGetTDO,
  helpGetTDOs,
  helpDeleteTDO,
  helpUpdateTDO,
  helpFileTDO,
  helpMoveTDO,
  helpUnFileTDO
};
