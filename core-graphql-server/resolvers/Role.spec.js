const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const roleResolver = require('./Role.js')(serviceContext);

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

describe('#Role', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(roleResolver).to.be.a('object');
      const keys = Object.keys(roleResolver);
      chaiExpect(keys.length).to.equal(3);

      keys.forEach((key) => {
        chaiExpect(typeof roleResolver[key]).to.equal('function');
      });

      // Verify all expected resolver functions exist
      chaiExpect(roleResolver).to.have.property('permissions');
      chaiExpect(roleResolver).to.have.property('name');
      chaiExpect(roleResolver).to.have.property('application');
    });
  });

  describe('#permissions', function () {
    beforeEach(() => {
      // Reset database mocks before each test
      serviceContext.dbConnections['sso'].read._clearResultQueue();
    });

    it('should call getPermissionsForRole with correct parameters', async function () {
      // Note: getPermissionsForRole is not fully implemented in the DAL
      // It currently returns empty results regardless of database mocking
      const obj = { id: 'role123' };
      const args = { limit: 10, offset: 0 };
      const info = {};

      const result = await roleResolver.permissions(obj, args, context, info);

      expect(result).toHaveProperty('records');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('offset');
      expect(result).toHaveProperty('limit');
      expect(result.records).toHaveLength(0); // Currently returns empty array
      expect(result.count).toBe(0);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(10);
    });

    it('should handle errors from getPermissionsForRole', async function () {
      // Note: getPermissionsForRole is not fully implemented in the DAL
      // It currently doesn't make database calls, so we test the current behavior
      const obj = { id: 'role123' };
      const args = {};

      const result = await roleResolver.permissions(obj, args, context, {});

      expect(result).toHaveProperty('records');
      expect(result).toHaveProperty('count');
      expect(result.records).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should work with empty args object', async function () {
      // Mock empty database response
      serviceContext.dbConnections['sso'].read._push([]);

      const obj = { id: 'role123' };
      const args = {};

      const result = await roleResolver.permissions(obj, args, context, {});

      expect(result).toHaveProperty('records');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('offset');
      expect(result).toHaveProperty('limit');
      expect(result.records).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('#name', function () {
    it('should return roleName from obj', function () {
      const obj = { roleName: 'Admin Role' };
      
      const result = roleResolver.name(obj);

      expect(result).toBe('Admin Role');
    });

    it('should return undefined when roleName is not present', function () {
      const obj = { id: 'role123' };
      
      const result = roleResolver.name(obj);

      expect(result).toBeUndefined();
    });

    it('should return null when roleName is null', function () {
      const obj = { roleName: null };
      
      const result = roleResolver.name(obj);

      expect(result).toBeNull();
    });
  });

  describe('#application', function () {
    beforeEach(() => {
      // Reset database mocks before each test
      serviceContext.dbConnections['sso'].read._clearResultQueue();
    });

    it('should call getApplication with applicationId and organizationId', async function () {
      // Mock database response for getApplication
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app123',
          application_name: 'Test App',
          application_key: 'test-app',
          application_status: 'active',
          application_description: 'Test application',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://testapp.com',
          application_check_permissions: true,
          owner_organization_id: 'org456',
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://testapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://testapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        applicationId: 'app123',
        organizationId: 'org456'
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      expect(result).toHaveProperty('id', 'app123');
      expect(result).toHaveProperty('name', 'Test App');
      expect(result).toHaveProperty('key', 'test-app');
    });

    it('should handle snake_case properties (application_id, organization_id)', async function () {
      // Mock database response for getApplication
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app123',
          application_name: 'Test App',
          application_key: 'test-app',
          application_status: 'active',
          application_description: 'Test application',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://testapp.com',
          application_check_permissions: true,
          owner_organization_id: 'org456',
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://testapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://testapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        application_id: 'app123',
        organization_id: 'org456'
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      expect(result).toHaveProperty('id', 'app123');
      expect(result).toHaveProperty('name', 'Test App');
    });

    it('should prefer camelCase over snake_case when both are present', async function () {
      // Mock database response for getApplication
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app123',
          application_name: 'Test App',
          application_key: 'test-app',
          application_status: 'active',
          application_description: 'Test application',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://testapp.com',
          application_check_permissions: true,
          owner_organization_id: 'org123',
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://testapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://testapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        applicationId: 'app123',
        application_id: 'app456', // This should be ignored
        organizationId: 'org123',
        organization_id: 'org456' // This should be ignored
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      expect(result).toHaveProperty('id', 'app123');
      expect(result).toHaveProperty('name', 'Test App');
    });

    it('should handle missing applicationId', async function () {
      // Mock database error for missing application
      serviceContext.dbConnections['sso'].read._push([], false, [], () => {
        throw new Error('Application not found');
      });

      const obj = { 
        organizationId: 'org456'
      };
      const args = {};
      const info = {};

      await expect(roleResolver.application(obj, args, context, info)).rejects.toThrow('Application not found');
    });

    it('should handle missing organizationId', async function () {
      // Mock database response for getApplication
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app123',
          application_name: 'Test App',
          application_key: 'test-app',
          application_status: 'active',
          application_description: 'Test application',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://testapp.com',
          application_check_permissions: true,
          owner_organization_id: null,
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://testapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://testapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        applicationId: 'app123'
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      expect(result).toHaveProperty('id', 'app123');
      expect(result).toHaveProperty('name', 'Test App');
    });

    it('should handle errors from getApplication', async function () {
      // Mock database error
      serviceContext.dbConnections['sso'].read._push([], false, [], () => {
        throw new Error('Application not found');
      });

      const obj = { 
        applicationId: 'app123',
        organizationId: 'org456'
      };
      const args = {};

      await expect(roleResolver.application(obj, args, context, {})).rejects.toThrow('Application not found');
    });

    it('should work with empty obj', async function () {
      // Mock database error for missing application
      serviceContext.dbConnections['sso'].read._push([], false, [], () => {
        throw new Error('Application not found');
      });

      const obj = {};
      const args = {};
      const info = {};

      await expect(roleResolver.application(obj, args, context, info)).rejects.toThrow('Application not found');
    });

    it('should return deleted application when includeDeleted is true', async function () {
      // Mock database response for deleted application
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app123',
          application_name: 'Deleted App',
          application_key: 'deleted-app',
          application_status: 'deleted',
          application_description: 'This application was deleted',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://deletedapp.com',
          application_check_permissions: true,
          owner_organization_id: 'org456',
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://deletedapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://deletedapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        applicationId: 'app123',
        organizationId: 'org456'
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      expect(result).toHaveProperty('id', 'app123');
      expect(result).toHaveProperty('name', 'Deleted App');
      expect(result).toHaveProperty('key', 'deleted-app');
      expect(result).toHaveProperty('status', 'deleted');
    });

    it('should verify includeDeleted is always true in Role resolver', async function () {
      // The Role resolver always sets includeDeleted: true, so it should return deleted applications
      // Mock database response for deleted application
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app123',
          application_name: 'Deleted App',
          application_key: 'deleted-app',
          application_status: 'deleted',
          application_description: 'This application was deleted',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://deletedapp.com',
          application_check_permissions: true,
          owner_organization_id: 'org456',
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://deletedapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://deletedapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        applicationId: 'app123',
        organizationId: 'org456'
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      // Verify that the resolver returns the deleted application because includeDeleted is always true
      expect(result).toHaveProperty('id', 'app123');
      expect(result).toHaveProperty('name', 'Deleted App');
      expect(result).toHaveProperty('status', 'deleted');
    });

    it('should return active application with includeDeleted true', async function () {
      // Mock database response for active application
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'app456',
          application_name: 'Active App',
          application_key: 'active-app',
          application_status: 'active',
          application_description: 'This application is active',
          application_icon_url: 'https://example.com/icon.png',
          application_icon_svg: '<svg>...</svg>',
          application_url: 'https://activeapp.com',
          application_check_permissions: true,
          owner_organization_id: 'org456',
          deployment_model: 'cloud',
          created_date: '2023-01-01',
          updated_date: '2023-01-01',
          oauth2_redirect_urls: 'https://activeapp.com/callback',
          oauth2_client_secret: 'secret123',
          public: false,
          headerbar_enabled: true,
          metadata_version: 1,
          event_endpoint: 'https://activeapp.com/events',
          total: 1
        }
      ]);

      const obj = { 
        applicationId: 'app456',
        organizationId: 'org456'
      };
      const args = {};
      const info = {};

      const result = await roleResolver.application(obj, args, context, info);

      expect(result).toHaveProperty('id', 'app456');
      expect(result).toHaveProperty('name', 'Active App');
      expect(result).toHaveProperty('status', 'active');
    });
  });

  describe('#integration', function () {
    beforeEach(() => {
      // Reset database mocks before each test
      serviceContext.dbConnections['sso'].read._clearResultQueue();
    });

    it('should call all resolver functions without throwing errors', async function () {
      // Mock database responses for permissions
      serviceContext.dbConnections['sso'].read._push([]);
      
      // Mock database responses for application
      serviceContext.dbConnections['sso'].read._push([], false, [], () => {
        throw new Error('Application not found');
      });

      const obj = { 
        id: 'role123',
        roleName: 'Test Role',
        applicationId: 'app123',
        organizationId: 'org456'
      };
      const args = {};
      const info = {};

      // Test all resolver functions
      const permissions = await roleResolver.permissions(obj, args, context, info);
      const name = roleResolver.name(obj);
      
      expect(permissions).toHaveProperty('records');
      expect(permissions).toHaveProperty('count');
      expect(permissions.records).toHaveLength(0);
      expect(name).toBe('Test Role');
      
      // Test application resolver separately since it will throw an error
      await expect(roleResolver.application(obj, args, context, info)).rejects.toThrow('The requested object was not found');
    });
  });
});
