const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
const appId = 'a4fa5950-c3b4-47eb-9808-10ed295d2695';

const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;
const resolver = require('./TemporalDataObject.js')(serviceContext);

const context = mockUtil.makeContext();
describe('TemporalDataObject.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    _.set(serviceContext, 'config.maxAssetsLimitEnabled', true);
    _.set(serviceContext, 'config.maxAssetsLimit', 101);
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolver).to.be.a('object');
      const keys = Object.keys(resolver);
      chaiExpect(keys.length).to.equal(24);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });
  });

  describe('#tasks', function () {
    it('should get tasks with default date/time filter', async function () {
      const createdDateTime = moment();
      const targetSec = createdDateTime.unix() - 24 * 60 * 60; // - 1day
      // check function below verifies that correct start boundary was used
      coreDbRead._push([], false, [], (sql, args) => args[1] === targetSec);
      const res = await resolver.tasks(
        {
          id: '123',
          applicationId: appId,
          createdDateTime: createdDateTime.valueOf()
        },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
    it('should not override explicit date/time filter', async function () {
      const filterStart = moment().subtract(1, 'hour');
      const filterEnd = moment();
      const createdDateTime = moment().subtract(30, 'minutes');

      // check function verifies that we don't override an explicit user-provided filter
      coreDbRead._push(
        [],
        false,
        [],
        (sql, args) =>
          args[1] === filterStart.unix() && args[2] === filterEnd.unix()
      );

      const res = await resolver.tasks(
        {
          id: '123',
          applicationId: appId,
          createdDateTime: createdDateTime.valueOf()
        },
        {
          dateTimeFilter: [
            {
              field: 'createdDateTime',
              fromDateTime: filterStart.valueOf()
            },
            {
              field: 'createdDateTime',
              toDateTime: filterEnd.valueOf()
            }
          ]
        },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
  });

  describe('#assets', function () {
    it('should get assets', async function () {
      coreDbRead._push([], false); // TDO details
      coreDbRead._push(
        [],
        true,
        ['recording_asset', 'media-mdp'],
        (sql, args) => args[0] === '123'
      ); // media-init assets
      coreDbRead._push([]); // media-init
      coreDbRead._push(
        [],
        true,
        ['recording_asset', 'LIMIT 10'],
        (sql, args) => args[0] === '123' && args[1] === 123
      ); // main asset query
      const res = await resolver.assets(
        { id: '123', applicationId: appId },
        { applicationId: appId, limit: 10 },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
    it('should override overlarge limit', async function () {
      coreDbRead._push([], false); // TDO details
      coreDbRead._push(
        [],
        true,
        ['recording_asset', 'media-mdp'],
        (sql, args) => args[0] === '123'
      ); // media-init assets
      coreDbRead._push([]); // media-init
      coreDbRead._push(
        [],
        true,
        ['recording_asset', 'LIMIT 101'],
        (sql, args) => args[0] === '123' && args[1] === 123
      ); // main asset query
      const res = await resolver.assets(
        { id: '123', applicationId: appId },
        { applicationId: appId, limit: 400 },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
    it('should not override overlarge limit if disabled', async function () {
      _.set(serviceContext, 'config.maxAssetsLimitEnabled', false);
      _.set(serviceContext, 'config.maxAssetsLimit', 101);

      coreDbRead._push([], false); // TDO details
      coreDbRead._push(
        [],
        true,
        ['recording_asset', 'media-mdp'],
        (sql, args) => args[0] === '123'
      ); // media-init assets
      coreDbRead._push([]); // media-init
      coreDbRead._push(
        [],
        true,
        ['recording_asset', 'LIMIT 400'],
        (sql, args) => args[0] === '123' && args[1] === 123
      ); // main asset query
      const res = await resolver.assets(
        { id: '123', applicationId: appId },
        { applicationId: appId, limit: 400 },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
    });
  });

  describe('#metadata', function () {
    it('should get metadata if nothing in db', async function () {
      coreDbRead._push([], false); // TDO details
      const res = await resolver.metadata(
        { id: '123' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(Object.keys(res).length).to.equal(0);
    });
    it('should get metadata if stuff in db', async function () {
      coreDbRead._push(
        [
          {
            details: {
              'veritone-program': {
                programId: '44753',
                programName: 'tennis-fri-349',
                programLiveImage:
                  'https://inspirent.s3.amazonaws.com/assets/271153502/cd539f7d-0106-4819-b00e-29cf7690c9bd.jpeg'
              },
              'veritone-media-source': {
                mediaSourceId: '47220',
                mediaSourceTypeId: '3'
              },
              'veritone-file': {
                filename: 'tennis-fri-349',
                mimetype: 'video/mp4'
              },
              tags: ['test'],
              name: 'tennis-fri-349'
            }
          }
        ],
        false
      ); // TDO details
      const res = await resolver.metadata(
        { id: '123' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(5);
      chaiExpect(res[0].__typename).to.equal('Program');
      chaiExpect(res[0].name).to.equal('Program');
      chaiExpect(res[0].id).to.equal('44753');
    });
  });
  describe('#details', function () {
    it('should use path', async function () {
      coreDbRead._push(
        [
          {
            details: {
              foo: 'bar'
            }
          }
        ],
        false
      );
      const res = await resolver.details(
        { id: '123' },
        { path: 'foo' },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.equal('bar');
    });
    it('should use path', async function () {
      coreDbRead._push(
        [
          {
            details: {
              foo: 'bar'
            }
          }
        ],
        false
      );
      const res = await resolver.details(
        { id: '123' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.deep.equal({ foo: 'bar' });
    });
  });
  describe('#name', function () {
    it('should get name', async function () {
      coreDbRead._clearResultQueue();
      coreDbRead._push([{ details: { name: 'tdo.txt' } }], false);
      chaiExpect(await resolver.name({ id: '123' }, {}, context)).to.equal(
        'tdo.txt'
      );
    });
    it('should get name from veritoneFile', async function () {
      coreDbRead._clearResultQueue();
      coreDbRead._push(
        [{ details: { veritoneFile: { fileName: 'fn.txt' } } }],
        false
      );
      const r = await resolver.name({ id: '123' }, {}, mockUtil.makeContext());
      chaiExpect(r).to.equal('fn.txt');
    });
    it('should get name from jsondata', async function () {
      coreDbRead._clearResultQueue();
      coreDbRead._push([{ details: {} }], false);
      chaiExpect(
        await resolver.name(
          { id: '123', jsondata: { file: { fileName: 'fn2.txt' } } },
          {},
          mockUtil.makeContext()
        )
      ).to.equal('fn2.txt');
    });
    it('should get name from fileName', async function () {
      coreDbRead._clearResultQueue();
      coreDbRead._push([{ details: {} }], false);
      chaiExpect(
        await resolver.name(
          { id: '123', jsondata: { veritoneFile: { fileName: 'fn2.txt' } } },
          {},
          mockUtil.makeContext()
        )
      ).to.equal('fn2.txt');
    });
    it('should get name from id', async function () {
      coreDbRead._clearResultQueue();
      coreDbRead._push([{ details: {} }], false);
      chaiExpect(
        await resolver.name({ id: '123' }, {}, mockUtil.makeContext())
      ).to.equal('123');
    });
  });
  describe('#thumbnailUrl', function () {
    it('should get thumbnailUrl', async function () {
      coreDbRead._push(
        [
          {
            details: {
              veritoneProgram: { programLiveImage: 'http://localhost/foo' }
            }
          }
        ],
        false
      );
      chaiExpect(
        await resolver.thumbnailUrl({ id: '123' }, {}, mockUtil.makeContext())
      ).to.equal('http://localhost/foo');
    });
  });
  describe('#previewUrl', function () {
    it('should get previewUrl', async function () {
      coreDbRead._push(
        [
          {
            details: {
              veritoneProgram: { previewAssetUrl: 'http://localhost/foo' }
            }
          }
        ],
        false
      );
      chaiExpect(
        await resolver.previewUrl({ id: '123' }, {}, mockUtil.makeContext())
      ).to.equal('http://localhost/foo');
    });
  });
  describe('#sourceImageUrl', function () {
    it('should get sourceImageUrl', async function () {
      coreDbRead._push(
        [
          {
            details: {
              veritoneProgram: { programImage: 'http://localhost/foo' }
            }
          }
        ],
        false
      );
      chaiExpect(
        await resolver.sourceImageUrl({ id: '123' }, {}, mockUtil.makeContext())
      ).to.equal('http://localhost/foo');
    });
  });
  describe('organization', function () {
    it('should get organization', async function () {
      const applicationId = 'a0359273-ecc6-4934-aa6b-092fbed49956';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: '7682',
          organization_name: 'test org '
        }
      ]);
      const org = await resolver.organization(
        { id: '123', applicationId },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(org).to.exist;
      chaiExpect(org.id).to.equal('7682');
    });
    it('should get org ID', async function () {
      const applicationId = 'a0359273-ecc6-4934-aa6b-092fbed49956';
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: '7682',
          organization_name: 'test org '
        }
      ]);
      const org = await resolver.organizationId(
        { id: '123', applicationId },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(org).to.exist;
      chaiExpect(org).to.equal('7682');
    });
  });
  describe('date/time tests', function () {
    it('should convert bad date/time', async function () {
      const strv = '9999-07-22T14:24:15.000Z';
      const momv = moment(strv);
      const intv = momv.valueOf();
      const secv = momv.unix();
      const realv = moment(intv / 1000).valueOf();
      chaiExpect(
        resolver.startDateTime({ id: '1', startDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.stopDateTime({ id: '1', stopDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.createdDateTime({ id: '1', createdDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.modifiedDateTime({ id: '1', modifiedDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.startDateTime({ id: '1', startDateTime: strv })
      ).to.equal(moment(realv).toISOString());
      chaiExpect(
        resolver.stopDateTime({ id: '1', stopDateTime: strv })
      ).to.equal(moment(realv).toISOString());
      chaiExpect(
        resolver.createdDateTime({ id: '1', createdDateTime: strv })
      ).to.equal(moment(realv).toISOString());
      chaiExpect(
        resolver.modifiedDateTime({ id: '1', modifiedDateTime: strv })
      ).to.equal(moment(realv).toISOString());
    });
    it('should throw on unparseable date/time', async function () {
      const strv = '51170-07-22T14:24:15.000Z';
      const momv = moment(strv);
      const intv = momv.valueOf();
      const secv = momv.unix();
      const realv = moment(intv / 1000).valueOf();

      chaiExpect(() =>
        resolver.startDateTime({ id: '1', startDateTime: NaN })
      ).to.throw();
      chaiExpect(() =>
        resolver.startDateTime({ id: '1', startDateTime: intv })
      ).to.throw();
      chaiExpect(() =>
        resolver.stopDateTime({ id: '1', stopDateTime: intv })
      ).to.throw();
      chaiExpect(() =>
        resolver.createdDateTime({ id: '1', createdDateTime: intv })
      ).to.throw();
      chaiExpect(() =>
        resolver.modifiedDateTime({ id: '1', modifiedDateTime: intv })
      ).to.throw();
      chaiExpect(() =>
        resolver.startDateTime({ id: '1', startDateTime: strv })
      ).to.throw();
      chaiExpect(() =>
        resolver.stopDateTime({ id: '1', stopDateTime: strv })
      ).to.throw();
      chaiExpect(() =>
        resolver.createdDateTime({ id: '1', createdDateTime: strv })
      ).to.throw();
      chaiExpect(() =>
        resolver.modifiedDateTime({ id: '1', modifiedDateTime: strv })
      ).to.throw();
    });

    it('should not modify good date/time', async function () {
      const strv = '2020-07-22T14:24:15.000Z';
      const momv = moment(strv);
      const intv = momv.valueOf();
      const secv = momv.unix();
      const realv = intv;
      chaiExpect(
        resolver.startDateTime({ id: '1', startDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.stopDateTime({ id: '1', stopDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.createdDateTime({ id: '1', createdDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.modifiedDateTime({ id: '1', modifiedDateTime: intv })
      ).to.equal(realv);
      chaiExpect(
        resolver.startDateTime({ id: '1', startDateTime: strv })
      ).to.equal(strv);
      chaiExpect(
        resolver.stopDateTime({ id: '1', stopDateTime: strv })
      ).to.equal(strv);
      chaiExpect(
        resolver.createdDateTime({ id: '1', createdDateTime: strv })
      ).to.equal(strv);
      chaiExpect(
        resolver.modifiedDateTime({ id: '1', modifiedDateTime: strv })
      ).to.equal(strv);
    });
  });

  describe('#folders', function () {
    it('tdo not in folder', async function () {
      serviceContext.dal.folder.getParentFoldersForObject = jest
        .fn()
        .mockRejectedValue({ name: 'not_found' });
      const res = await resolver.folders(
        {
          id: '123',
          applicationId: appId,
          orgId: 'org_id'
        },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(0);
    });
    it('tdo in a folder', async function () {
      serviceContext.dal.folder.getParentFoldersForObject = jest
        .fn()
        .mockResolvedValue(['__folder__id__']);
      serviceContext.dal.folder.getFolder.mockResolvedValue('_folder_');
      const res = await resolver.folders(
        {
          id: '123',
          applicationId: appId,
          orgId: 'org_id'
        },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0]).to.equal('__folder__id__');
    });
  });

  describe('#sourceData', function () {
    it('should get sourceData and assign tdo.orgID to the returned data', async function () {
      coreDbRead._push(
        [{ content: { sourceId: '69249', scheduledJobId: '100115' } }],
        false
      );
      const res = await resolver.sourceData(
        { id: '123', orgId: 1 },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.sourceId).to.equal('69249');
      chaiExpect(res.scheduledJobId).to.equal('100115');
      chaiExpect(res.orgId).to.equal(1);
    });
  });
});
