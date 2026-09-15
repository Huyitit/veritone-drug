const chaiExpect = require('chai').expect; //require('expect.js');
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();
const { v5: uuidv5 } = require('uuid'),
  uuidNamespace = 'a61091ed-1f70-45e1-b3c3-475378e8289d',
  stringify = require('json-stable-stringify');

jest.mock('./util.js');
const rutil = require('./util.js');
const fakeAsset = JSON.stringify({
  sourceEngineId: 'e123',
  series: [
    {
      startTimeMs: 0,
      stopTimeMs: 1000,
      uri: 'http://localhost/1',
      sourceEngineId: 'e123'
    }
  ]
});
const unparsableAsset = 'this is not any <format> {we} can "parse"';
const xmlAsset = `
<?xml version="1.0" encoding="utf-8"?>
<tt xml:lang="en-us" xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
<body region="CaptionArea">
<div>
        <p begin="00:00:00.680" end="00:00:06.260">OK we are trying this for a 2nd time to test the ability to</p>
        <p begin="00:00:06.680" end="00:00:11.200">upload and in P 3 file Hopefully this will work .</p>
</div>
</body>
</tt>
`;

let currentAsset = fakeAsset;
// Records each getVirtualSignedUri call so tests can assert the meta
// (fileName etc.) the resolver passed. VE-26469
const virtualSignedUriCalls = [];
rutil.mockImplementation(() => {
  return {
    getSignedUrl: (uri, bucket, fn) => Promise.resolve(uri),
    getVirtualSignedUri: (uri, bucket, meta) => {
      virtualSignedUriCalls.push({ uri, bucket, meta });
      return Promise.resolve(`virtual:${uri}`);
    },
    download: (uri, context) => Promise.resolve(currentAsset),
    transformAsset: (uri, func) => Promise.resolve('')
  };
});

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

let resolver;

describe('Asset.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    resolver = require('./Asset.js')(serviceContext);
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#require', function () {
    it('should have correct structure', async function () {
      chaiExpect(typeof resolver).to.equal('object');
      chaiExpect(Object.keys(resolver).length).to.equal(19);
      chaiExpect(typeof resolver.name).to.equal('function');
      chaiExpect(typeof resolver.signedUri).to.equal('function');
      chaiExpect(typeof resolver.description).to.equal('function');
      chaiExpect(typeof resolver.jsonstring).to.equal('function');
      chaiExpect(typeof resolver.signedUri).to.equal('function');
      chaiExpect(typeof resolver.jsondata).to.equal('function');
      chaiExpect(typeof resolver.details).to.equal('function');
      chaiExpect(typeof resolver.id).to.equal('function');
      chaiExpect(typeof resolver.containerId).to.equal('function');
      chaiExpect(typeof resolver.uri).to.equal('function');
      chaiExpect(typeof resolver.assetType).to.equal('function');
      chaiExpect(typeof resolver.type).to.equal('function');
      chaiExpect(typeof resolver.sourceData).to.equal('function');
      chaiExpect(typeof resolver.fileData).to.equal('function');
      chaiExpect(typeof resolver.container).to.equal('function');
      chaiExpect(typeof resolver.transform).to.equal('function');
      chaiExpect(typeof resolver.isUserEdited).to.equal('function');
      chaiExpect(typeof resolver.createdDateTime).to.equal('function');
      chaiExpect(typeof resolver.modifiedDateTime).to.equal('function');
    });
    it('should resolve signedUri', async function () {
      chaiExpect(
        await resolver.signedUri({ uri: 'http://localhost/', metadata: {} })
      ).to.equal('http://localhost/');
      chaiExpect(
        await resolver.signedUri({ _uri: 'http://localhost/', metadata: {} })
      ).to.equal('http://localhost/');
      chaiExpect(await resolver.signedUri({ metadata: {} })).to.be.undefined;
      chaiExpect(
        await resolver.signedUri({
          _uri: 'http://localhost/',
          metadata: { fileName: 'foo.txt' }
        })
      ).to.equal('http://localhost/');
    });
    describe('signedUri (virtualAssetEnabled=true)', function () {
      let vaResolver;
      const asset = {
        id: 'a1',
        containerId: 't1',
        uri: 'http://localhost/x.mp4',
        metadata: { fileName: 'x.mp4' }
      };

      beforeEach(() => {
        serviceContext.config.featureFlags = {
          ...serviceContext.config.featureFlags,
          virtualAssetEnabled: true
        };
        vaResolver = require('./Asset.js')(serviceContext);
      });

      afterEach(() => {
        serviceContext.config.featureFlags.virtualAssetEnabled = false;
      });

      it('wraps in a virtual-asset URL', async function () {
        chaiExpect(await vaResolver.signedUri(asset, undefined, {})).to.equal(
          'virtual:http://localhost/x.mp4'
        );
      });

      // VE-26469: only the asset's OWN recorded filename feeds the mint meta.
      // The parent recording's name is deliberately not a fallback (it would
      // mislabel non-media assets) — assets without a name get
      // asset_id.<ext> from the shared derivation downstream.
      describe('mint meta filename', function () {
        beforeEach(() => {
          virtualSignedUriCalls.length = 0;
        });

        const lastMeta = () =>
          virtualSignedUriCalls[virtualSignedUriCalls.length - 1].meta;

        it("passes the asset's own filename and contentType", async function () {
          await vaResolver.signedUri(
            {
              id: 'a3',
              containerId: 't1',
              uri: 'http://localhost/blob',
              contentType: 'video/mp4',
              metadata: { fileName: 'own-name.mp4' }
            },
            undefined,
            {}
          );
          chaiExpect(lastMeta().fileName).to.equal('own-name.mp4');
          chaiExpect(lastMeta().contentType).to.equal('video/mp4');
        });

        it('passes no filename when the asset has none (asset_id.<ext> fallback downstream)', async function () {
          await vaResolver.signedUri(
            {
              id: 'a4',
              containerId: 't1',
              uri: 'http://localhost/blob',
              contentType: 'application/ttml+xml',
              metadata: {}
            },
            undefined,
            {}
          );
          chaiExpect(lastMeta().fileName).to.equal(undefined);
          chaiExpect(lastMeta().contentType).to.equal('application/ttml+xml');
        });
      });
    });

    it('should resolve name', function () {
      chaiExpect(resolver.name({ metadata: { fileName: 'foo.txt' } })).to.equal(
        'foo.txt'
      );
      chaiExpect(resolver.name({ metadata: {} })).to.be.undefined;
    });
    it('should resolve description', function () {
      chaiExpect(resolver.description({ metadata: {} })).to.be.undefined;
      chaiExpect(
        resolver.description({ metadata: { description: 'foo' } })
      ).to.equal('foo');
    });
    it('should resolve jsonstring', function () {
      chaiExpect(
        resolver.jsonstring({ metadata: { fileName: 'foo.txt' } }, {})
      ).to.equal('{"fileName":"foo.txt"}');
      chaiExpect(
        resolver.jsonstring(
          { metadata: { fileName: 'foo.txt' } },
          { indent: 2 }
        )
      ).to.equal('{\n  "fileName": "foo.txt"\n}');
    });
    it('should resolve jsondata', function () {
      chaiExpect(
        resolver.jsondata({ metadata: { fileName: 'foo.txt' } })
      ).to.deep.equal({ fileName: 'foo.txt' });
      chaiExpect(
        resolver.jsondata({ jsondata: { fileName: 'foo.txt' } })
      ).to.deep.equal({ fileName: 'foo.txt' });
    });
    it('should resolve details', function () {
      chaiExpect(resolver.details({ metadata: {} }, {})).to.be.undefined;
      chaiExpect(
        resolver.details(
          { metadata: { details: { foo1: 'bar', foo2: 'baz' } } },
          {}
        )
      ).to.deep.equal({ foo1: 'bar', foo2: 'baz' });
      chaiExpect(
        resolver.details(
          { metadata: { details: { foo1: 'bar', foo2: 'baz' } } },
          { path: 'foo2' }
        )
      ).to.equal('baz');
    });
    it('should resolve id', function () {
      chaiExpect(resolver.id({ id: '123' })).to.equal('123');
      chaiExpect(resolver.id({ assetId: '123' })).to.equal('123');
      chaiExpect(resolver.id({ id: '123', assetId: '234' })).to.equal('123');
      chaiExpect(resolver.id({})).to.be.undefined;
    });
    it('should resolve containerId', function () {
      chaiExpect(resolver.containerId({ containerId: '123' })).to.equal('123');
      chaiExpect(resolver.containerId({ recordingId: '123' })).to.equal('123');
      chaiExpect(
        resolver.containerId({ containerId: '123', recordingId: '234' })
      ).to.equal('123');
    });
    it('should resolve assetType', function () {
      chaiExpect(resolver.assetType({ assetType: 'media' })).to.equal('media');
      chaiExpect(resolver.assetType({ type: 'media' })).to.equal('media');
      chaiExpect(
        resolver.assetType({ assetType: 'media', type: 'whatever' })
      ).to.equal('media');
      chaiExpect(resolver.assetType({})).to.be.undefined;
    });
    it('should resolve assetSize by metadata', async function () {
      chaiExpect(
        await resolver.assetSize({ metadata: { size: 116 } })
      ).to.equal(116);
    });
    it('should resolve type', function () {
      chaiExpect(resolver.type({ assetType: 'media' })).to.equal('media');
      chaiExpect(resolver.type({ type: 'media' })).to.equal('media');
      chaiExpect(
        resolver.type({ assetType: 'media', type: 'whatever' })
      ).to.equal('media');
      chaiExpect(resolver.type({})).to.be.undefined;
    });
    it('should resolve sourceData', function () {
      chaiExpect(
        resolver.sourceData({ sourceData: { foo: 'bar' } })
      ).to.deep.equal({ foo: 'bar' });
      chaiExpect(
        resolver.sourceData({
          metadata: {
            sourceName: 'source',
            sourceTaskId: 't123',
            sourceId: 's123',
            sourceEngineId: 'e123',
            schemaId: 's123'
          }
        })
      ).to.deep.equal({
        name: 'source',
        taskId: 't123',
        sourceId: 's123',
        engineId: 'e123',
        schemaId: 's123'
      });
      chaiExpect(
        resolver.sourceData({
          metadata: {
            source: 'e123'
          }
        })
      ).to.deep.equal({
        engineId: 'e123',
        name: undefined,
        taskId: undefined,
        sourceId: undefined,
        schemaId: undefined
      });
      chaiExpect(
        resolver.sourceData({
          metadata: {
            source: 'e234',
            sourceEngineId: 'e123'
          }
        })
      ).to.deep.equal({
        engineId: 'e123',
        name: undefined,
        taskId: undefined,
        sourceId: undefined,
        schemaId: undefined
      });
    });
    it('should resolve fileData', function () {
      chaiExpect(resolver.fileData({ metadata: {} })).to.deep.equal({
        md5sum: undefined,
        sha256: undefined,
        size: undefined,
        originalFileUri: undefined,
        mediaDurationMs: undefined
      });
      const res = resolver.fileData({
        metadata: {
          md5: '1234',
          sha256: '6789',
          size: 100,
          originalfileUri: 'http://localhost/',
          mediaDuration: 901.123
        }
      });
      chaiExpect(res).to.deep.equal({
        md5sum: '1234',
        sha256: '6789',
        size: 100,
        originalFileUri: 'http://localhost/',
        mediaDurationMs: 901123
      });
    });

    // Asset does not implement resolver cache and it calls DAL to
    // get the container: https://github.com/veritone/aiware-core/blob/094a5f6160d82590e0c702cdba4c43871f52f5e9/services/api/core-graphql-server/resolvers/Asset.js#L160
    xit('should resolve container from resolver cache', async function () {
      const context = mockUtil.makeContext();
      const appId = _.get(context, '_authInfo.groups[0].applicationId');
      // prepopulate resolver cache.
      const ns = 'a61091ed-1f70-45e1-b3c3-475378e8289d'; // from cache.js
      const key = 'TemporalDataObject-' + uuidv5(stringify({ id: '123' }), ns);
      context._objectCache = {};
      context._objectCache[key] = {
        id: '123',
        applicationId: appId
      };
      chaiExpect(
        await resolver.container(
          { containerId: '123' },
          { applicationId: 'a' },
          context
        )
      ).to.deep.equal({ id: '123', applicationId: appId });
    });
    it('should resolve container from local cache', async function () {
      const context = mockUtil.makeContext();
      const appId = _.get(context, '_authInfo.groups[0].applicationId');

      const key = serviceContext.dal.tdo.tdoCacheKey(
        { id: '123' },
        { applicationId: appId }
      );
      serviceContext.localCache.set('TemporalDataObject', key, {
        id: '123',
        applicationId: appId,
        __requestId: context.requestInfo.requestId
      });
      const res = await resolver.container(
        { containerId: '123', applicationId: appId },
        { applicationId: appId },
        context
      );
      chaiExpect(res).to.deep.equal({
        id: '123',
        applicationId: appId,
        __requestId: context.requestInfo.requestId,
        __fromCache: true
      });
    });
    it('should resolve container from db', async function () {
      const context = mockUtil.makeContext();
      context.requestInfo.requestId = 'new1231234';
      const appId = _.get(context, '_authInfo.groups[0].applicationId');

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: appId
        }
      ]);
      const res = await resolver.container(
        { containerId: '123', applicationId: appId },
        { applicationId: appId },
        context
      );
      const exp = {
        id: '123',
        applicationId: appId,
        isPublic: false
      };
      chaiExpect(_.omitBy(res, _.isNil)).to.deep.equal(exp);
    });

    it('should resolve transform', async function () {
      // TODO unit tests for util.js::transformAsset.
      // tricky do to async callback structure.
      chaiExpect(
        await resolver.transform(
          { uri: 'http://localhost/', contentType: 'application/json' },
          { transformFunction: 'JSON' }
        )
      ).to.exist;
      chaiExpect(
        await resolver.transform(
          { _uri: 'http://localhost/', contentType: 'application/ttml+xml' },
          { transformFunction: 'JSON' }
        )
      ).to.exist;
      chaiExpect(
        await resolver.transform(
          { contentType: 'application/json' },
          { transformFunction: 'JSON' }
        )
      ).to.exist;

      // verify that a warning was issued without error
      // if errorOnInvalidTransformContentType is turned off.
      _.set(serviceContext, 'config.errorOnInvalidTransformContentType', false);
      chaiExpect(
        await resolver.transform(
          { contentType: 'video/mp4' },
          { tranformFunction: 'JSON' }
        )
      ).to.equal('');
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);

      // now turn it on and verify that errors are thrown out
      _.set(serviceContext, 'config.errorOnInvalidTransformContentType', true);
      try {
        // should throw on no contentType
        await resolver.transform({}, { tranformFunction: 'JSON' });
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }

      try {
        // should throw on invalid contentType
        await resolver.transform(
          { contentType: 'video/mp4' },
          { tranformFunction: 'JSON' }
        );
        expect.fail('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('should resolve isUserEdited', function () {
      chaiExpect(resolver.isUserEdited({ userEdited: true })).to.be.true;
      chaiExpect(resolver.isUserEdited({ userEdited: false })).to.be.false;
      chaiExpect(resolver.isUserEdited({})).to.be.undefined;
    });
  });
  /*
  describe('#startDateTime', function() {
    it('should convert bad date/time', async function() {
      const strv = '9999-07-22T14:24:15.000Z';
      const momv = moment(strv);
      const intv = momv.valueOf()
      const secv = momv.unix();
      const realv = moment(intv / 1000).valueOf();
      chaiExpect(resolver.createdDateTime({id: '1', createdDateTime: intv})).to.equal(realv);
      chaiExpect(resolver.modifiedDateTime({id: '1', modifiedDateTime: intv})).to.equal(realv);
      chaiExpect(resolver.createdDateTime({id: '1', createdDateTime: strv})).to.equal(moment(realv).toISOString());
      chaiExpect(resolver.modifiedDateTime({id: '1', modifiedDateTime: strv})).to.equal(moment(realv).toISOString());
    });
    it('should throw on unparseable date/time', async function() {
      const strv = '51170-07-22T14:24:15.000Z';
      const momv = moment(strv);
      const intv = momv.valueOf()
      const secv = momv.unix();
      const realv = moment(intv / 1000).valueOf();

      chaiExpect(() => resolver.stopDateTime({id: '1', stopDateTime: intv})).to.throw();
      chaiExpect(() => resolver.createdDateTime({id: '1', createdDateTime: intv})).to.throw();
      chaiExpect(() => resolver.modifiedDateTime({id: '1', modifiedDateTime: intv})).to.throw();
      chaiExpect(() => resolver.createdDateTime({id: '1', createdDateTime: strv})).to.throw();
      chaiExpect(() => resolver.modifiedDateTime({id: '1', modifiedDateTime: strv})).to.throw();
    });

    it('should not modify good date/time', async function() {
      const strv = '2020-07-22T14:24:15.000Z';
      const momv = moment(strv);
      const intv = momv.valueOf()
      const secv = momv.unix();
      const realv = intv;
      chaiExpect(resolver.createdDateTime({id: '1', createdDateTime: intv})).to.equal(realv);
      chaiExpect(resolver.modifiedDateTime({id: '1', modifiedDateTime: intv})).to.equal(realv);
      chaiExpect(resolver.createdDateTime({id: '1', createdDateTime: strv})).to.equal(strv);
      chaiExpect(resolver.modifiedDateTime({id: '1', modifiedDateTime: strv})).to.equal(strv);
    });
  });
  */
});
