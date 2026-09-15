const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();

if (jest !== undefined) {
  jest.mock(
    '../modules/core-media-server/service/libraries/bll/entity-identifier-type.js'
  );
  jest.mock(
    '../modules/core-media-server/service/libraries/bll/entity-identifier.js'
  );
  jest.mock('../modules/core-media-server/service/libraries/bll/entity.js');
  jest.mock(
    '../modules/core-media-server/service/libraries/bll/library-collaborator.js'
  );
  jest.mock(
    '../modules/core-media-server/service/libraries/bll/library-engine-model.js'
  );
  jest.mock(
    '../modules/core-media-server/service/libraries/bll/library-type.js'
  );
  jest.mock('../modules/core-media-server/service/libraries/bll/library.js');
  jest.mock('../modules/core-media-server/service/libraries/bll/index.js');
  jest.mock('../modules/core-media-server/util/file-upload.js');
  jest.mock('../dal/library.js');
}
// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const query = require('./Query.js')(serviceContext);

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config
  };
});

describe('#Query', function () {
  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(136);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#cloneRequests', function () {
    it('should call dal.tdo.getCloneRequests with id, applicationId, and args', async function () {
      const args = {
        id: 'clone-123',
        applicationId: 'app-1',
        applicationIds: ['app-1'],
        offset: 0,
        limit: 30
      };
      const expectedResult = {
        records: [],
        offset: 0,
        limit: 30,
        count: 0
      };
      const getCloneRequestsSpy = jest
        .spyOn(serviceContext.dal.tdo, 'getCloneRequests')
        .mockResolvedValue(expectedResult);
      const result = await query.cloneRequests({}, args, context);
      expect(getCloneRequestsSpy).toHaveBeenCalledTimes(1);
      expect(getCloneRequestsSpy).toHaveBeenCalledWith(
        'clone-123',
        'app-1',
        args
      );
      chaiExpect(result).to.deep.equal(expectedResult);
      getCloneRequestsSpy.mockRestore();
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(query);
      for (const key of keys) {
        if (typeof query[key] === 'function') {
          // it's a resolver function. call it.
          try {
            await query[key]({}, { id: '1' }, context);
          } catch (err) {
            // TODO fix mock dependencies and start failing
            // on TypeError
            if (err.name)
              serviceContext.logger.debug('ignoring error ' + err.name);
            else throw err;
          }
        }
      }
    });
  });

  describe('#registrationConfigurationInfo', function () {
    let getRegistrationConfigurationsSpy;

    beforeEach(function () {
      getRegistrationConfigurationsSpy = jest.spyOn(
        serviceContext.dal.organizationRegistration,
        'getRegistrationConfigurations'
      );
    });

    afterEach(function () {
      getRegistrationConfigurationsSpy.mockRestore();
    });

    it('returns null when no config is found (empty records)', async function () {
      getRegistrationConfigurationsSpy.mockResolvedValue({ records: [] });
      const result = await query.registrationConfigurationInfo(
        null,
        { slug: 'hive' },
        context
      );
      chaiExpect(result).to.equal(null);
    });

    it('returns null when records is undefined', async function () {
      getRegistrationConfigurationsSpy.mockResolvedValue({});
      const result = await query.registrationConfigurationInfo(
        null,
        { slug: 'any' },
        context
      );
      chaiExpect(result).to.equal(null);
    });

    it('returns null when records exists but has no first element', async function () {
      getRegistrationConfigurationsSpy.mockResolvedValue({ records: [] });
      const result = await query.registrationConfigurationInfo(
        null,
        { id: 'a0000001-0001-4000-8000-000000000001' },
        context
      );
      chaiExpect(result).to.equal(null);
    });

    it('returns id, name, slug, organizationGuid, openRegistrationStatus, adminApprovalRequired when a config is found', async function () {
      getRegistrationConfigurationsSpy.mockResolvedValue({
        records: [
          {
            id: 'a0000001-0001-4000-8000-000000000001',
            name: 'Test Registration',
            slug: 'test',
            organization_guid: 'org-guid-456',
            openRegistrationStatus: 'open',
            adminApprovalRequired: true,
          },
        ],
      });
      const result = await query.registrationConfigurationInfo(
        null,
        { slug: 'test' },
        context
      );
      chaiExpect(result).to.deep.equal({
        id: 'a0000001-0001-4000-8000-000000000001',
        name: 'Test Registration',
        slug: 'test',
        organizationGuid: 'org-guid-456',
        openRegistrationStatus: 'open',
        adminApprovalRequired: true,
      });
    });

    it('maps snake_case from DAL to camelCase (openRegistrationStatus, adminApprovalRequired)', async function () {
      getRegistrationConfigurationsSpy.mockResolvedValue({
        records: [
          {
            id: 'b0000002-0002-4000-8000-000000000002',
            name: 'Snake Case Config',
            slug: 'snake-config',
            organization_guid: 'org-guid-789',
            open_registration_status: 'restricted',
            admin_approval_required: false,
          },
        ],
      });
      const result = await query.registrationConfigurationInfo(
        null,
        { id: 'b0000002-0002-4000-8000-000000000002' },
        context
      );
      chaiExpect(result).to.deep.equal({
        id: 'b0000002-0002-4000-8000-000000000002',
        name: 'Snake Case Config',
        slug: 'snake-config',
        organizationGuid: 'org-guid-789',
        openRegistrationStatus: 'restricted',
        adminApprovalRequired: false,
      });
    });

    it('returns null for openRegistrationStatus and adminApprovalRequired when DAL omits them', async function () {
      getRegistrationConfigurationsSpy.mockResolvedValue({
        records: [
          {
            id: 'c0000003-0003-4000-8000-000000000003',
            name: 'Minimal Config',
            slug: 'minimal',
          },
        ],
      });
      const result = await query.registrationConfigurationInfo(
        null,
        { slug: 'minimal' },
        context
      );
      chaiExpect(result).to.deep.equal({
        id: 'c0000003-0003-4000-8000-000000000003',
        name: 'Minimal Config',
        slug: 'minimal',
        organizationGuid: null,
        openRegistrationStatus: null,
        adminApprovalRequired: null,
      });
    });

    it('throws when neither id nor slug is provided', async function () {
      await expect(
        query.registrationConfigurationInfo(null, {}, context)
      ).rejects.toThrow(/Missing required id or slug parameter/);
    });
  });
});
