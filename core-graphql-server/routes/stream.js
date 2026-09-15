const _ = require('lodash');
const he = require('he');

module.exports = function setUp(serviceContext) {
  const { app, config, logger, dal, util } = serviceContext;
  const resolversUtil = require('../resolvers/util.js')(serviceContext);

  const mediaStreamerURI = _.get(config, 'services.media-streamer.uri');

  const apiPath = '/stream/:tdoId/:manifest?';

  app.use(apiPath, [
    app.middleware.authenticationOption('required'),
    app.middleware.loadAuthDataByToken
  ]);

  app.get(apiPath, async (req, res) => {
    if (!_.isString(req.params.tdoId)) {
      return res.send(400, 'Missing tdoId');
    }

    const tdoId = req.params.tdoId;
    const manifest = req.params.manifest || 'dash.mpd';

    try {
      let manifestContent = await getManifestContent(req.context, tdoId);

      if (!manifestContent) {
        res.writeHead(302, {
          Location: `${mediaStreamerURI}stream/${tdoId}/${manifest}`
        });
      } else {
        res.contentType('application/dash+xml');
        res.send(200, await replaceURLs(manifestContent));
      }
    } catch (err) {
      logger.error(err);
      res.writeHead(302, {
        Location: `${mediaStreamerURI}stream/${tdoId}/${manifest}`
      });
    }
    res.end();
  });

  async function replaceURLs(manifestContent) {
    if (!manifestContent) {
      return null;
    }

    // matches strings 'Initialization sourceURL=".."' and 'SegmentURL media=".."'
    let regExp = /(SegmentURL.*media|Initialization.*sourceURL)="(.*)"/g;

    return await util.stringReplaceAsync(
      manifestContent,
      regExp,
      async (match, xmlPropertyName, unsignedURL) => {
        let signedURL = await resolversUtil.getSignedUrl(unsignedURL);
        return `${xmlPropertyName}="${he.encode(signedURL)}"`;
      }
    );
  }

  async function getManifestContent(context, tdoId) {
    // fetching TDO to enforce security
    let authInfo = context.userInfo || context.tokenInfo;
    let tdoArgs = {
      id: tdoId
    };

    // enriching arguments with AppIds ond OrgIds
    resolversUtil.authorizeAppIds(authInfo, tdoArgs);
    resolversUtil.authorizeOrgIds(authInfo, tdoArgs);

    await dal.tdo.getTDO(context, tdoArgs);

    let assetArgs = {
      containerId: tdoId,
      assetType: 'mpeg-dash-manifest'
    };

    let assets = await dal.asset.getAssets(serviceContext, assetArgs);

    if (!assets || !assets.records || assets.records.length === 0) {
      return null;
    }

    let asset = assets.records[0];
    let signedURL = await resolversUtil.getSignedUrl(asset.uri);

    return await resolversUtil.download(signedURL, { requestInfo: {} });
  }
};
