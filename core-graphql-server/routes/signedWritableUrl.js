const _ = require('lodash');

module.exports = function setUpRoutes(serviceContext) {
  const { app, config, logger, dal } = serviceContext;

  const apiPath = _.get(
    config,
    'signedWritableUrl',
    '/storage/:key/:chunkNumber?'
  );

  app.put(apiPath, async (req, res) => {
    let chunkNumber = req.params.chunkNumber;
    if (_.isString(chunkNumber)) {
      chunkNumber = _.toNumber(chunkNumber);
      if (!_.isFinite(chunkNumber) || chunkNumber < 0) {
        return res.send(
          400,
          'The chunk number must be a postive, finite number.'
        );
      } else {
        await putChunk(req, res);
      }
    } else {
      const key = req.params.key;
      if (!_.isString(req.params.key)) {
        return res.send(400, 'Missing key');
      }

      if (!_.isString(_.get(req, 'headers.content-type'))) {
        return res.send(400, 'Missing header: Content-Type');
      }

      if (!_.isString(_.get(req, 'headers.content-length'))) {
        return res.send(400, 'Missing header: Content-Length');
      }

      try {
        const url = await dal.dalStorage.putRawBytes(
          key,
          req.headers['content-type'],
          req.headers['content-length'],
          req
        );
        res.send({
          url
        });
      } catch (err) {
        logger.error('Storage endpoint error.', err);
        if (_.get(err, 'name') === 'not_found') {
          res.sendStatus(404);
        } else {
          // update for the deprecate warning of express
          res.status(500).send(_.get(err, 'message'));
        }
      }
    }
  });

  async function putChunk(req, res) {
    const key = req.params.key;
    if (!_.isString(req.params.key)) {
      return res.send(400, 'Missing key');
    }

    let chunkNumber = req.params.chunkNumber;
    if (!_.isString(chunkNumber)) {
      return res.send(400, 'Missing chunkNumber');
    } else {
      chunkNumber = _.toNumber(chunkNumber);
      if (chunkNumber < 0) {
        return res.send(400, 'The chunk number must be greater than zero');
      }
    }

    const contentType = _.get(req, 'headers.content-type');
    if (!_.isString(contentType)) {
      return res.send(400, 'Missing header: Content-Type');
    }

    // Optional, but must be on at least one request to calculate completion
    let totalSize = _.get(req, 'headers.x-veritone-total-size');
    if (_.isString(totalSize)) {
      totalSize = _.toNumber(totalSize);
    }

    // Optional request to return full state in the response
    let returnFullState = _.get(req, 'headers.x-veritone-return-full-state');
    if (returnFullState !== 'true') {
      returnFullState = undefined;
    }

    // Optional md5 checksum
    let useMD5Checksum = _.get(req, 'headers.x-veritone-md5-checksum');
    if (useMD5Checksum !== 'true') {
      useMD5Checksum = undefined;
    }

    let contentLength = _.get(req, 'headers.content-length');
    if (!_.isString(contentLength)) {
      return res.send(400, 'Missing header: Content-Length');
    } else {
      contentLength = _.toNumber(contentLength);
    }

    // chunk size is optional. If available, conduct checksum when input bytes have been totaled
    let checksumChunkSize = _.get(req, 'headers.x-veritone-chunk-size');
    if (checksumChunkSize) {
      checksumChunkSize = _.toNumber(checksumChunkSize);
    }

    try {
      const response = await dal.dalStorage.putRawChunkBytes(
        key,
        contentType,
        contentLength, // size of the current input chunk
        chunkNumber,
        checksumChunkSize,
        useMD5Checksum,
        totalSize, // size of the entire file to be uploaded
        req
      );

      // Always return the current chunk status on the parent
      if (response.chunks) {
        response.chunk = response.chunks[chunkNumber];
      }

      if (!returnFullState) {
        // Depending on the number of chunks for an upload, this set can be large. So, only return on request.
        delete response.chunks;
      }

      res.send(response);
    } catch (err) {
      logger.error('Storage endpoint error.', err);
      if (_.get(err, 'name') === 'not_found') {
        res.sendStatus(404);
      } else {
        res.status(500).send(_.get(err, 'message'));
      }
    }
  }
};
