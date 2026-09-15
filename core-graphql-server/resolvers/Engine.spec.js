const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

let resolvers = require('./Engine.js')(serviceContext);

beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
  serviceContext.redisCache.markCacheDirty(true);
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#Engine', function () {
  describe('#require', function () {
    it('should load module', function () {});
  });
  describe('#manifest', function () {
    it('should get manifest', async function () {
      const res = await resolvers.manifest({ engineManifest: { foo: 'bar' } });
      chaiExpect(res.foo).to.equal('bar');
    });
  });
  describe('#signedIconPath', function () {
    it('should get value', async function () {
      const res = await resolvers.signedIconPath({
        iconPath: 'https://dev-api.veritone.amazonaws.com/test/123'
      });
      chaiExpect(res).to.exist;
    });
  });
  describe('#signedLogoPath', function () {
    it('should get value', async function () {
      const res = await resolvers.signedLogoPath(
        { logoPath: 'https://dev-api.veritone.amazonaws.com/test/123' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
    });
  });

  describe('#logoPath', function () {
    it('should get value', async function () {
      const res = await resolvers.logoPath(
        { logoPath: 'https://dev-api.veritone.amazonaws.com/test/123' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
    });
  });

  describe('#modifiedDateTime', function () {
    it('should get value - seconds', async function () {
      const now = moment();
      const res = await resolvers.modifiedDateTime({
        modifiedDateTime: now.unix()
      });
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal(now.unix() * 1000);
    });
    it('should get value - normal', async function () {
      const now = moment();
      const res = await resolvers.modifiedDateTime({
        modifiedDateTime: now.valueOf()
      });
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal(now.valueOf());
    });
  });

  describe('#createdDateTime', function () {
    it('should get value - seconds', async function () {
      const now = moment();
      const res = await resolvers.createdDateTime({
        createdDateTime: now.unix()
      });
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal(now.unix() * 1000);
    });
    it('should get value - normal', async function () {
      const now = moment();
      const res = await resolvers.createdDateTime({
        createdDateTime: now.valueOf()
      });
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal(now.valueOf());
    });
  });

  describe('#displayName', function () {
    it('should get value ', async function () {
      const res = await resolvers.displayName(
        { name: 'test' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.equal('test');
    });
  });

  describe('#name', function () {
    it('should get value ', async function () {
      const res = await resolvers.name(
        { name: 'test' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.equal('test');
    });
  });

  describe('#id', function () {
    it('should get value ', async function () {
      const res = await resolvers.id(
        { id: 'test' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.equal('test');
    });
  });

  describe('#createsTDO', function () {
    it('should get value ', async function () {
      const res = await resolvers.createsTDO(
        { id: 'test', createsRecording: false },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.be.false;
    });
  });

  describe('#dependency', function () {
    it('should get value', async function () {
      const res = await resolvers.dependency(
        { id: 'test', dependency: { engine: 'foo', assetType: 'bar' } },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.dependencyType).to.equal('foo');
      chaiExpect(res.assetType).to.equal('bar');
    });
    it('should get no value', async function () {
      const res = await resolvers.dependency(
        { id: 'test' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.be.null;
    });
  });

  describe('#description', function () {
    it('should get value ', async function () {
      const res = await resolvers.description(
        { description: 'test' },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.equal('test');
    });
  });

  describe('#builds', function () {
    it('should load no builds for non-owner user token', async function () {
      const context = getGraphQLContext(null, 'user');

      serviceContext.dbConnections['core'].read._push([]);

      const builds = await resolvers.builds(
        {
          id: '132', // object
          ownerOrganizationId: '123235'
        },
        {
          organizationId: '7682',
          organizationIds: ['7682']
        },
        context
      );
      chaiExpect(builds.count).to.equal(0);
    });

    it('should load all builds for owner user token', async function () {
      const context = getGraphQLContext(null, 'user');
      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '1234',
          engine_id: '132',
          status: 'deployed'
        }
      ]);

      const builds = await resolvers.builds(
        {
          id: '132', // object
          ownerOrganizationId: '7682'
        },
        {
          organizationId: '7682', // args
          organizationIds: ['7682']
        },
        context
      );
      chaiExpect(builds.count).to.equal(1);
    });

    it('should load all builds for org API system token', async function () {
      const context = getGraphQLContext(null, 'api_org');
      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '1234',
          engine_id: '132',
          status: 'deployed'
        }
      ]);
      const builds = await resolvers.builds(
        {
          id: '132', // object
          ownerOrganizationId: '7682'
        },
        {
          organizationId: '7682', // args
          organizationIds: ['7682']
        },
        context
      );
      chaiExpect(builds.count).to.equal(1);
    });
  });

  describe('#oauth', function () {
    it('should get oauth from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { oauth: 'foo' }
        }
      ]);

      const oauth = await resolvers.oauth(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(oauth).to.exist;
      chaiExpect(oauth).to.equal('foo');
    });

    it('should get null from oauth', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const oauth = await resolvers.oauth(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(oauth).to.be.null;
    });
  });

  describe('#isConductor', function () {
    it('should get isConductor from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { isConductor: 'foo' }
        }
      ]);

      const isConductor = await resolvers.isConductor(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(isConductor).to.exist;
      chaiExpect(isConductor).to.equal('foo');
    });

    it('should get null from isConductor', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const isConductor = await resolvers.isConductor(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(isConductor).to.be.null;
    });
  });

  describe('#supportedSourceTypes', function () {
    it('should get isConductor from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { supportedSourceTypes: 'foo' }
        }
      ]);

      const supportedSourceTypes = await resolvers.supportedSourceTypes(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(supportedSourceTypes).to.exist;
      chaiExpect(supportedSourceTypes).to.equal('foo');
    });

    it('should get isConductor from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { ingestion: { supportedSourceTypes: 'foo' } }
        }
      ]);

      const supportedSourceTypes = await resolvers.supportedSourceTypes(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(supportedSourceTypes).to.exist;
      chaiExpect(supportedSourceTypes).to.equal('foo');
    });

    it('should get null from supportedSourceTypes', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const supportedSourceTypes = await resolvers.supportedSourceTypes(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(supportedSourceTypes).to.be.null;
    });
  });

  describe('#outputFormats', function () {
    it('should get isConductor from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { outputFormats: 'foo' }
        }
      ]);

      const outputFormats = await resolvers.outputFormats(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(outputFormats).to.exist;
      chaiExpect(outputFormats).to.equal('foo');
    });

    it('should get null from outputFormats', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const outputFormats = await resolvers.outputFormats(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(outputFormats).to.be.null;
    });
  });

  describe('#hasScanPhase', function () {
    it('should get hasScanPhase from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { ingestion: { scanner: 'foo' } }
        }
      ]);

      const hasScanPhase = await resolvers.hasScanPhase(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(hasScanPhase).to.exist;
      chaiExpect(hasScanPhase).to.equal('foo');
    });

    it('should get null from hasScanPhase', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const hasScanPhase = await resolvers.hasScanPhase(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(hasScanPhase).to.be.null;
    });
  });

  describe('#mode', function () {
    it('should get mode from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { engineMode: 'foo' }
        }
      ]);

      const mode = await resolvers.mode(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(mode).to.exist;
      chaiExpect(mode).to.equal('Foo');
    });

    it('should get null from mode', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const mode = await resolvers.mode(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(mode).to.be.null;
    });
  });

  describe('#supportedScheduleTypes', function () {
    it('should get supportedScheduleTypes from manifest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: { schedule: ['recurring', 'continuous'] }
        }
      ]);

      const supportedScheduleTypes = await resolvers.supportedScheduleTypes(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(supportedScheduleTypes.length).greaterThan(0);
      chaiExpect(supportedScheduleTypes.sort().toString()).to.equal(
        ['Recurring', 'Continuous'].sort().toString()
      );
    });

    it('should get null from supportedScheduleTypes', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([
        {
          build_id: '9299fde2-4e9a-44fe-864e-bd1c8fc91030',
          engine_id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          status: 'deployed',
          manifest: {}
        }
      ]);

      const supportedScheduleTypes = await resolvers.supportedScheduleTypes(
        {
          id: '0473b832-b0ef-4496-947d-91c86e41d92c',
          engineManifest: {}
        },
        null,
        context
      );

      chaiExpect(supportedScheduleTypes).to.be.null;
    });
  });
});

function getGraphQLContext(token, type) {
  const context = mockUtil.getGraphQLContext(token, type);
  const res = {
    _authInfo: context.userInfo || context.tokenInfo
  };

  return res;
}
