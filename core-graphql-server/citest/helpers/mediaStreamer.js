const _ = require('lodash');
const fs = require('fs');
const pathModule = require('path');
const { gql } = require('../../node_modules/apollo-server-express/dist/index');
const util = require('../../util.js')();

async function uploadToS3(gqlClient, supertest, path, contentType) {
  const dataDir = pathModule.resolve(__dirname, '..', 'data');
  const filename = pathModule.basename(path);
  const resolvedPath = pathModule.resolve(dataDir, filename);
  if (!resolvedPath.startsWith(dataDir + pathModule.sep)) {
    throw new Error(`File path is outside the citest data directory: ${path}`);
  }
  const query = `
  query {
    getSignedWritableUrl (key: "${_.split(filename, '.')[0]}") {
      url
      getUrl
      unsignedUrl
    }
  }
  `;
  let response = await gqlClient.query(query);
  if (response.error) throw response.error;

  const writable = response.getSignedWritableUrl;
  const putUrl = writable.url;

  const file = fs.createReadStream(resolvedPath);
  const size = fs.statSync(resolvedPath).size;
  const options = {
    json: false,
    headers: {
      'Content-Type': contentType,
      'Content-Length': size
    },
    body: file
  };
  response = await supertest(putUrl)
    .put('')
    .set(options.headers)
    .attach('file', file);

  if (response.error) throw response.error;
  return {
    signed: writable.getUrl,
    unsigned: writable.unsignedUrl
  };
}

async function createStreamManifestTdo(gqlClient, opts) {
  const query = `
  mutation {
    createTDO(input: {
      status: "uploaded"
      isPublic: true
      startDateTime: ${opts.startTimestamp}
      stopDateTime: ${opts.stopTimestamp}
      details: {
        veritoneFile: {
          mimetype: "${opts.mimeType}"
        }
      }
    }) {
      id
      startDateTime
      stopDateTime
      details
      streamManifest {
        initSegment
        segments
      }
    }
  }`;

  const response = await gqlClient.query(query);
  return response.createTDO;
}

async function updateTdo(gqlClient, tdoId) {
  const query = `
  mutation {
    updateTDO(input: {
      id: "${tdoId}"
      status: "recorded"
    }) {
      id
      streamManifest {
        segments
        initSegment
      }
    }
  }
  `;
  return gqlClient.query(query);
}

async function addMediaChunks(
  gqlClient,
  supertest,
  tdoId,
  type,
  contentType,
  chunks
) {
  const files = chunks.map((ch) => ch.file);

  // upload chunks
  const urls = await Promise.all(
    files.map((file) => uploadToS3(gqlClient, supertest, file, contentType))
  );

  const groupId = '0adfa9f1-2d32-4194-99e7-fa3bc93a5bff';
  const duration = chunks[0].segDurationMs;

  await addInitSegment(gqlClient, {
    type: type || 'video',
    tdoId,
    groupId,
    duration,
    url: urls[0].unsigned
  });

  for (let i = 0; i < chunks.length; i++) {
    await addMediaSegment(gqlClient, {
      index: i,
      type: type || 'video',
      tdoId,
      groupId,
      duration,
      start: chunks[i].start,
      stop: chunks[i].stop,
      url: urls[i].unsigned
    });
  }

  await updateTdo(gqlClient, tdoId); // this will finalize the init segment
  return tdoId;
}

async function addInitSegment(gqlClient, opts) {
  const codecs = opts.type === 'audio' ? 'mp3' : 'avc1.64001e,mp4a.40.2';
  const query = `
  mutation {
    addMediaSegment(input: {
      containerId: "${opts.tdoId}"
      details: {
        codecs: "${codecs}",
        segmentGroupId: "${opts.groupId}",
        targetSegmentDurationMs: ${opts.duration}
      }
      url: "${opts.url}"
    }) {
      id
    }
  }`;
  return gqlClient.query(query);
}

async function addMediaSegment(gqlClient, opts) {
  const query = `
  mutation {
    addMediaSegment(input: {
      containerId: "${opts.tdoId}"
      details: {
        segmentDurationMs: ${opts.duration},
        segmentGroupId: "${opts.groupId}",
        segmentIndex: ${opts.index},
        segmentStartTimeMs: ${opts.start}
        segmentStopTimeMs: ${opts.stop}
      }
      url: "${opts.url}"
    }) {
      id
    }
  }`;
  return gqlClient.query(query);
}

async function getAssetsWithRetry(
  gqlClient,
  helpersAuditLog,
  token,
  options = {},
  numRetries = 0
) {
  let correlationID;
  let result = {};
  try {
    const query = `query {
      assets {
        assets {
          records {
            id
          } 
        }        
      }
    }`;
    correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      token,
      correlationID
    );
    result = await gqlClient.query(query, null, headers);
    if (_.isEmpty(result.assets.assets.records)) {
      throw new Error('Cannot get assets since no assets were indexed.');
    }
    return {
      result,
      correlationID
    };
  } catch (error) {
    const maxRetries = _.get(options, 'maxRetries');
    if (!_.isNil(maxRetries) && numRetries <= maxRetries) {
      // wait before retry.
      const waitSeconds = _.get(options, 'waitSecondsOnEachRetry');
      if (!_.isNil(waitSeconds)) {
        // only wait when this option is set.
        await util.sleep(waitSeconds * 1000);
      }

      return await getAssetsWithRetry(
        gqlClient,
        helpersAuditLog,
        token,
        options,
        numRetries + 1
      );
    } else {
      return {
        result,
        correlationID
      };
    }
  }
}

module.exports = {
  uploadToS3,
  createStreamManifestTdo,
  updateTdo,
  addMediaChunks,
  getAssetsWithRetry
};
