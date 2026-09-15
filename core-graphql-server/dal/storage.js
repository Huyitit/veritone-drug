const uuid = require('uuid');
const _ = require('lodash');

module.exports = function init(serviceContext) {
  const { logger, config, redisCache } = serviceContext;
  const errors = require('../error')(config);
  const httpUtil = require('../util/httpUtil.js')(serviceContext);

  const type = 'SignedWritableUrl';
  const storageEndpoint = _.get(config, 'storageEndpoint');
  const s3Buckets = _.get(config, 's3.buckets', []);

  async function getBlobInfo(uri, bucket) {
    const storage = _.get(
      serviceContext,
      `s3Buckets.${bucket}.storage`,
      serviceContext.s3Buckets.api.storage
    );
    return new Promise((resolve, reject) => {
      storage.getAssetInfo({ _uri: uri }, (err, url) => {
        if (err) {
          reject(err);
        } else {
          resolve(url);
        }
      });
    });
  }

  async function getBlobUploadStatus(key) {
    const uploadState = await redisCache.get(type, key);

    if (!uploadState) {
      return {
        status: 'not_found',
        message:
          'The upload status was not found. This may indicate that the upload window has expired.'
      };
    }

    const chunks = uploadState.chunks;
    if (!chunks || Object.keys(chunks).length === 0) {
      return {
        status: uploadState.status,
        message: uploadState.message,
        totalBytesReceived: uploadState.computedSize,
        missingChunkNumbers: [],
        failures: []
      };
    }

    const missingChunks = [];
    const failures = [];

    let minChunkNumber = 0;
    let maxChunkNumber = 0;

    if (Object.keys(chunks).length > 0) {
      minChunkNumber = Math.min(
        ...Object.keys(chunks).map((chunkIdx) => parseInt(chunkIdx))
      );
      maxChunkNumber = Math.max(
        ...Object.keys(chunks).map((chunkIdx) => parseInt(chunkIdx))
      );
    }

    let lastChunkNumber = minChunkNumber;
    for (const chunkIdx in chunks) {
      const chunk = chunks[chunkIdx];
      if (chunk.status === 'fail') {
        failures.push({
          chunkNumber: chunk.chunkNumber,
          status: chunk.status,
          message: _.get(chunk, 'error.message')
        });
      }

      const currentChunkNumber = parseInt(chunkIdx);
      for (
        let missingIdx = lastChunkNumber + 1;
        missingIdx < currentChunkNumber;
        missingIdx++
      ) {
        missingChunks.push(missingIdx);
      }

      lastChunkNumber = currentChunkNumber;
    }

    return {
      status: uploadState.status,
      message: uploadState.message,
      totalBytesReceived: uploadState.computedSize,
      missingChunkNumbers: missingChunks,
      failures
    };
  }

  // Creates a token to allow put url
  async function getSignedWritableUrl(path, bucket, expires) {
    const key = uuid.v4();
    const storage = _.get(
      serviceContext,
      `s3Buckets.${bucket}.storage`,
      serviceContext.s3Buckets.api.storage
    );

    // We can use this later to either push to signed url or putBlob
    const signedUrl = await storage.getSignedWritableUrlPromise(
      path,
      bucket,
      expires
    );

    const uploadState = {
      bucket,
      path,
      status: 'pending',
      timestampMs: Date.now(),
      computedSize: 0
    };
    await redisCache.set(type, key, uploadState, null, expires / 60);

    return {
      signedWritableUrl: `${storageEndpoint}/${key}`,
      rawSignedWritableUrl: signedUrl
    };
  }

  function putObjectPromise(storage, path, contentType, contentLength, stream) {
    return new Promise((resolve, reject) => {
      storage.putObject(
        path,
        contentType,
        contentLength,
        stream,
        (err, url) => {
          if (err) {
            reject(err);
          } else {
            resolve(url);
          }
        }
      );
    });
  }

  // Returns url of newly created object
  async function putRawBytes(key, contentType, contentLength, stream) {
    const params = await redisCache.get(type, key);
    if (!params) {
      logger.error(`Storage key not found: ${key}`);
      throw new errors.NotFound();
    }
    const storage = _.get(
      serviceContext,
      `s3Buckets.${params.bucket}.storage`,
      serviceContext.s3Buckets.api.storage
    );

    logger.debug(
      `Put to storage start. key: ${key}; ${JSON.stringify(params)}.`
    );
    const url = await putObjectPromise(
      storage,
      params.path,
      contentType,
      contentLength,
      stream
    );
    logger.debug(`Put to storage end. key: ${key}`);
    redisCache.clear(type, key);
    return url;
  }

  async function putRawChunkBytes(
    key,
    contentType,
    contentLength,
    chunkNumber,
    checkSumChunkSize,
    useMD5Checksum,
    totalSize,
    stream
  ) {
    const lockOptions = {
      retryCount: 5,
      retryDelay: 10000
    };

    // Whenever uploadState is mutated, it must be locked prior to the read and unlocked after cache update
    const redLock = serviceContext.createRedisLock(lockOptions);
    let lock = await redLock.lock(
      key,
      lockOptions.retryCount * lockOptions.retryDelay
    );
    let uploadState;
    let chunk;
    let storage;

    try {
      uploadState = await redisCache.get(type, key);
      if (!uploadState) {
        logger.error(`Storage key not found: ${key}`);
        throw new errors.NotFound();
      }

      if (uploadState.status === 'complete') {
        const message = `The upload operation for ${key} has already completed.`;
        logger.error(message);
        throw new Error(message);
      }

      storage = _.get(
        serviceContext,
        `s3Buckets.${uploadState.bucket}.storage`,
        serviceContext.s3Buckets.api.storage
      );

      if (_.isNumber(totalSize)) {
        uploadState.totalSize = totalSize;
      }

      if (!uploadState.contentType) {
        uploadState.contentType = contentType;
      }
      // chunks is a dictionary keyed by the chunk number
      const chunks = _.get(uploadState, 'chunks', {});

      chunk = chunks[chunkNumber];

      if (!chunk) {
        // Push initial state for this chunk PUT request
        const buffer = Buffer.from(uuid.v4().toString());
        const blockId = buffer.toString('base64');
        chunk = {
          status: 'pending',
          chunkNumber,
          blockId
        };
        chunks[chunkNumber] = chunk;
      }

      // clear any errors on the chunk
      delete chunk.error;

      // Always stamp the latest update
      chunk.timestampMs = Date.now();

      uploadState.chunks = chunks;
      uploadState.chunkNumber = chunkNumber;
      await redisCache.set(type, key, uploadState);
    } finally {
      lock.unlock();
    }

    // Get the chunk data. Wrap in a promise in order to return completed chunk upload state to client.
    const streamingPromise = new Promise((resolve) => {
      let blockBytes = Buffer.alloc(0);

      stream.on('data', (dataChunk) => {
        blockBytes = Buffer.concat(
          [blockBytes, dataChunk],
          blockBytes.length + dataChunk.length
        );
      });

      stream.on('end', async () => {
        // console.log(`Received ${blockBytes.length} bytes`);

        const redLock = serviceContext.createRedisLock(lockOptions);
        let lock = await redLock.lock(
          key,
          lockOptions.retryCount * lockOptions.retryDelay
        );

        // Get the chunk again as the state may have changed by another async op
        uploadState = await redisCache.get(type, key);
        chunk = uploadState.chunks[chunkNumber];

        let checksum = true;

        try {
          // Do the chunk checksum now
          if (blockBytes.length === 0) {
            chunk.status = 'fail';
            chunk.error = {
              message:
                'The chunk did not contain any data. The chunk length must be greater than zero.'
            };
            checksum = false;
          } else if (
            checkSumChunkSize &&
            blockBytes.length !== checkSumChunkSize
          ) {
            chunk.status = 'fail';
            chunk.error = {
              message: `The checksum length [${checkSumChunkSize}] does not match the input bytes length [${blockBytes.length}]`
            };
            checksum = false;
          } else if (contentLength !== blockBytes.length) {
            chunk.status = 'fail';
            chunk.error = {
              message: `The content length [${contentLength}] does not match the final bytes length [${blockBytes.length}]`
            };
            checksum = false;
          }
          if (!checksum) {
            await redisCache.set(type, key, uploadState);
          }
        } finally {
          lock.unlock();
        }

        if (checksum) {
          // Send the block to Azure
          // For retry consistency, any chunk state can enter this execution path
          // ** Ensure that we do not block other concurrent operations here **
          const response = await storage.putBlock(
            uploadState.path,
            chunk.blockId,
            blockBytes,
            useMD5Checksum
          );

          lock = await redLock.lock(
            key,
            lockOptions.retryCount * lockOptions.retryDelay
          );
          try {
            // Get chunk again after async op
            uploadState = await redisCache.get(type, key);
            chunk = uploadState.chunks[chunkNumber];

            if (response.status === 'success') {
              chunk.status = 'complete';
              chunk.size = blockBytes.length;

              // Important that totalSize is pulled from uploadState.
              if (_.isNumber(uploadState.totalSize)) {
                // Check for completion. Any chunk is capable of checking for completion, but only one chunk will
                // determine that final state.
                uploadState = computeUploadCompletion(uploadState);
              }
            } else if (response.status === 'fail') {
              chunk.status = 'fail';
              chunk.error = response.error;
            }
            // push updates to cache
            await redisCache.set(type, key, uploadState);
          } finally {
            lock.unlock();
          }
        }

        resolve(true);
      });

      stream.on('error', async (err) => {
        const redLock = serviceContext.createRedisLock(lockOptions);
        const lock = await redLock.lock(
          key,
          lockOptions.retryCount * lockOptions.retryDelay
        );

        try {
          let uploadState = await redisCache.get(type, key);
          const newUploadState = setChunkInError(chunkNumber, uploadState, err);
          await redisCache.set(type, key, newUploadState);
        } finally {
          lock.unlock();
        }

        resolve(false);
      });
    });

    // Wait for the chunks/block to upload
    const isStreamingSuccess = await streamingPromise;

    lock = await redLock.lock(
      key,
      lockOptions.retryCount * lockOptions.retryDelay
    );
    try {
      // return latest from cache
      uploadState = await redisCache.get(type, key);

      if (isStreamingSuccess) {
        // Are we ready for final blob assembly?
        if (uploadState.status === 'blocks_ready') {
          const chunks = uploadState.chunks;

          // Assemble the final blob and submit
          const blockIds = Object.values(chunks).map((chunk) => chunk.blockId);
          const response = await storage.putBlockList(
            uploadState.path,
            uploadState.contentType,
            blockIds
          );

          if (response.status === 'success') {
            uploadState.status = 'complete';
            // The cache is not cleared in order to allow full queries of the state, even
            // after completion
          } else {
            uploadState.status = 'fail';
            uploadState.error = response.error;
          }
          await redisCache.set(type, key, uploadState);
        }
      }
    } finally {
      lock.unlock();
    }

    return uploadState;
  }

  async function putObjectTaggingPromise(uri, tags, versionId) {
    const { key, bucket } = httpUtil.uriParser(uri);
    const storage = getStorageByBucketName(bucket);

    if (_.isNil(storage) || _.isEmpty(tags)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      storage.putObjectTagging(key, bucket, tags, versionId, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  function getStorageByBucketName(bucketName) {
    const bucket = _.find(s3Buckets, (b) => b.name === bucketName);
    const key = _.get(bucket, 'key');

    return _.get(serviceContext, `s3Buckets.${key}.storage`);
  }

  // Helper function to determine if we are the final chunk
  const computeUploadCompletion = (currentUploadState) => {
    const uploadState = currentUploadState;

    // Regardless of previous state, place the upload state to pending
    uploadState.status = 'pending';
    const chunks = uploadState.chunks;

    // Dynamically compute the total input byte size by tallying each chunk's size
    let computedSize = 0;
    let maxChunkNumber = 0;
    let minChunkNumber = 0;
    const missingChunks = [];

    if (Object.keys(chunks).length > 0) {
      minChunkNumber = Math.min(
        ...Object.keys(chunks).map((chunkIdx) => parseInt(chunkIdx))
      );
      maxChunkNumber = Math.max(
        ...Object.keys(chunks).map((chunkIdx) => parseInt(chunkIdx))
      );
    }

    let lastChunkNumber = minChunkNumber;
    for (const chunkIdx in chunks) {
      const currentChunk = chunks[chunkIdx];
      if (currentChunk.status === 'complete') {
        computedSize += currentChunk.size;
        maxChunkNumber = Math.max(currentChunk.chunkNumber, maxChunkNumber);
      }

      // check for missing chunks
      const currentChunkNumber = parseInt(chunkIdx);
      for (
        let missingIdx = lastChunkNumber + 1;
        missingIdx < currentChunkNumber;
        missingIdx++
      ) {
        missingChunks.push(missingIdx);
      }
      lastChunkNumber = currentChunkNumber;
    }

    uploadState.computedSize = computedSize;
    // It is possible the totalSize is undefined (no header submitted by client...that's ok)
    if (uploadState.totalSize) {
      if (computedSize === uploadState.totalSize) {
        // All blocks have been pushed, set the status to blocks_ready in order to flag final assembly
        uploadState.status = 'blocks_ready';
        uploadState.message = '';
      }
    }

    // Note any missing chunks (which in many cases does not indicate a fail state), but always place the uploadState
    // to pending. It is possible that the client header totalSize matched the computedSize, but chunks sequences are not
    // correct.
    if (missingChunks.length > 0) {
      uploadState.status = 'pending';
      uploadState.message = `Waiting for the following sequence of chunks ${missingChunks.join(
        ','
      )}.`;
    }

    return uploadState;
  };

  const setChunkInError = (chunkNumber, currentUploadState, err) => {
    const chunks = currentUploadState.chunks;
    const chunkIndex = chunkNumber - 1;
    const chunk = chunks[chunkIndex];
    if (chunk) {
      chunk.status = 'fail';
      chunk.message = JSON.stringify(err);
    }

    return currentUploadState;
  };

  async function initiateMultipartUpload(args) {
    const storage = serviceContext.s3Buckets.api.storage;

    const { fileName, contentType, fileSize, numberOfParts } = args;

    if (
      !fileName ||
      !contentType ||
      _.isNil(fileSize) ||
      _.isNil(numberOfParts)
    ) {
      throw new Error(
        'Missing required parameters for initiateMultipartUpload.'
      );
    }

    if (fileSize <= 0) {
      throw new Error('fileSize must be greater than 0.');
    }

    if (numberOfParts <= 0) {
      throw new Error('numberOfParts must be greater than 0.');
    }

    const response = await storage.initiateMultipartUpload(args);
    if (response.uploadId) {
      // For azure, contentType can only be set on final blob assembly, so
      // we will hold that information in state and retrieve it during final
      // blob assembly.
      const multipartUploadInfo = {
        fileName,
        contentType,
        fileSize,
        numberOfParts
      };
      const redisCache = serviceContext.redisCache;
      const expires = 84600; // 24 hours
      const key = `multipart-upload-id-${response.uploadId}`;
      await redisCache.set(type, key, multipartUploadInfo, null, expires);
    }

    return response;
  }

  async function completeMultipartUpload(args) {
    const storage = serviceContext.s3Buckets.api.storage;
    const { contentType, uploadId } = args;
    if (uploadId) {
      // For azure, we need to get contentType from state
      const key = `multipart-upload-id-${uploadId}`;
      const multipartUploadInfo = await redisCache.get(type, key);
      if (_.isNil(multipartUploadInfo)) {
        throw new Error(
          `The multipart upload information was not found for uploadId: ${uploadId}. The upload may have expired or cache has been disabled.`
        );
      }
      if (multipartUploadInfo.isCanceled) {
        throw new Error('The upload has been canceled.');
      }
      if (!args.contentType) {
        args.contentType = multipartUploadInfo.contentType;
      }
    }
    return storage.completeMultipartUpload(args);
  }

  async function cancelMultipartUpload(args) {
    const storage = serviceContext.s3Buckets.api.storage;
    const { uploadId } = args;
    if (uploadId) {
      // For azure, we need to get contentType from state
      const key = `multipart-upload-id-${uploadId}`;
      const multipartUploadInfo = await redisCache.get(type, key);
      multipartUploadInfo.isCanceled = true;
      await redisCache.set(type, key, multipartUploadInfo);
    }
    return storage.cancelMultipartUpload(args);
  }

  return {
    getBlobInfo,
    getBlobUploadStatus,
    getSignedWritableUrl,
    putRawBytes,
    putRawChunkBytes,
    putObjectTaggingPromise,
    getStorageByBucketName,
    initiateMultipartUpload,
    completeMultipartUpload,
    cancelMultipartUpload
  };
};
