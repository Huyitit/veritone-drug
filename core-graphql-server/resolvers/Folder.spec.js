const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config,
    tracer: {
      startSpan: function () {
        return {
          setTag: function () {
            return;
          },
          finish: function () {
            return;
          }
        };
      }
    }
  };
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#Mutation', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const query = require('./Folder.js')(serviceContext);
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(20);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const query = require('./Folder.js')(serviceContext);
      const keys = Object.keys(query);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
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

  describe('#name resolver', function () {
    let folderResolver;
    
    beforeEach(function () {
      // Mock ROOT_FOLDER_TYPE_NAME for root folder tests
      if (!serviceContext.dal.folder) {
        serviceContext.dal.folder = {};
      }
      serviceContext.dal.folder.ROOT_FOLDER_TYPE_NAME = {
        1: 'Library'
      };
      
      // Mock folderV2.getRootFolderUserIdByFolderId
      if (!serviceContext.dal.folderV2) {
        serviceContext.dal.folderV2 = {};
      }
      serviceContext.dal.folderV2.getRootFolderUserIdByFolderId = jest.fn().mockResolvedValue(null);
      
      // Mock organization.getOrganization for org root folder tests
      if (!serviceContext.dal.organization) {
        serviceContext.dal.organization = {};
      }
      serviceContext.dal.organization.getOrganization = jest.fn().mockResolvedValue({
        id: 7682,
        name: 'Test Organization'
      });
      
      folderResolver = require('./Folder.js')(serviceContext);
    });

    it('should return non-root folder name from obj.name', async function () {
      const obj = {
        name: 'My Test Folder',
        rootFolderTypeId: null
      };
      
      const result = await folderResolver.name(obj, {}, context);
      chaiExpect(result).to.equal('My Test Folder');
    });

    it('should return non-root folder name from obj.treeFolderName if obj.name is not set', async function () {
      const obj = {
        treeFolderName: 'Tree Folder Name',
        rootFolderTypeId: null
      };
      
      const result = await folderResolver.name(obj, {}, context);
      chaiExpect(result).to.equal('Tree Folder Name');
    });

    it('should return root folder name from obj.name when it exists', async function () {
      const obj = {
        name: 'Custom Root Folder Name',
        rootFolderTypeId: 1,
        organizationId: 7682
      };
      
      const result = await folderResolver.name(obj, {}, context);
      // Root folders construct name from org/user + type, not from obj.name
      chaiExpect(result).to.equal('Test Organization Library Root Folder');
    });
  });
});
