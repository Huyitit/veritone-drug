const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./package.js')(serviceContext, serviceContext.config);
const errors = require('../error')(serviceContext.config);

jest.mock('fs');
const fs = require('fs');
const existsSyncResults = [];
const readFileSyncResults = [];
serviceContext.dal.folder.getOrCreateOrgRootFolder = jest.fn();
serviceContext.dal.folder.getParentFoldersForObject = jest.fn();
serviceContext.dal.folder.fileObject = jest.fn();
serviceContext.dal.folder.getSubfolders = jest.fn();
serviceContext.dal.folder.createFolder = jest.fn();
serviceContext.dal.user.getDefaultOrgAdminUser = jest.fn();
serviceContext.dal.application.getAppIdFromOrgId = jest.fn();
serviceContext.bll.application.getApplicationJWTToken = jest.fn();
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
fs.existsSync.mockImplementation((path) => {
  return existsSyncResults.shift();
});
fs.writeFileSync.mockImplementation((path, options) => {});
fs.readFileSync.mockImplementation((path) => readFileSyncResults.shift());

jest.mock('request-promise');
const httpResponses = [];
require('request-promise').mockImplementation((uri) => {
  const cur = httpResponses.shift();
  if (cur.error) return Promise.reject(cur.error);
  else return Promise.resolve(cur.data);
});

jest.mock('normalize-url');
const normalizeUrl = require('normalize-url');
const fpl = require('@veritone/functional-permissions-lib');
const engine = require('../bll/engine.js');
const application = require('../bll/application.js');
const normalizeUrlErrors = [];
normalizeUrl.mockImplementation((url) => {
  const curError = normalizeUrlErrors.shift();
  if (curError) throw Error(curError);
  return url;
});

describe('package.js', function () {
  const testEngine = {
    id: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
    name: 'test engine',
    aliasId: 'd99e45a8-4270-406f-89ce-2d04e63ccd09'
  };
  beforeEach(() => {
    jest.clearAllMocks();
    serviceContext.dal.engine.getEngine = jest.fn();
    serviceContext.dal.engine.getEngine.mockReturnValue(testEngine);
  });

  afterAll(() => {
    jest.resetModules();
  });

  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(typeof dal.getPackages).toEqual('function');
      expect(typeof dal.getPackageResources).toEqual('function');
      expect(typeof dal.getPackageGrants).toEqual('function');
      expect(typeof dal.packageCreate).toEqual('function');
      expect(typeof dal.packageUpdate).toEqual('function');
      expect(typeof dal.packageUpdateResources).toEqual('function');
      expect(typeof dal.packageUpdateGrants).toEqual('function');
      expect(typeof dal.getPackageResourceUsage).toEqual('function');
      expect(typeof dal.fileTDOResouceInResourceFolder).toEqual('function');
      expect(typeof dal.getAccessiblePackageResources).toEqual('function');
      expect(typeof dal._validateInputPackageUpdateGrants).toEqual('function');
      expect(typeof dal._packageUpdateGrantDbMulti).toEqual('function');
      expect(typeof dal._checkResourcesToAddOrRemoveFromOrg).toEqual(
        'function'
      );
      expect(typeof dal._packageUpdateGrantsResources).toEqual('function');
    });
  });

  describe('#getPackages', function () {
    it('should get packages', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine'
          }
        ],
        false
      );

      const res = await dal.getPackages(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          nameRegexp: 'test',
          id: '321',
          owned: true
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return packages with contextual grantType field', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            package_id: '123',
            package_name: 'Test Package',
            package_version: '1.0.0',
            context_grant_type: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackages(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          id: '123'
        }
      );
      expect(res.records[0].id).toEqual('123');
      expect(res.records[0].grantType).toEqual('GRANT');
    });

    it('should return null grantType for public packages without explicit grant', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            package_id: '456',
            package_name: 'Public Package',
            package_version: '1.0.0',
            distribution_type: 'public',
            context_grant_type: null
          }
        ],
        false
      );

      const res = await dal.getPackages(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          id: '456'
        }
      );
      expect(res.records[0].id).toEqual('456');
      expect(res.records[0].grantType).toBeNull();
    });

    it('should get packages with nameRegexp', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine',
            packageName: 'engine'
          }
        ],
        false
      );

      const res = await dal.getPackages(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          nameRegexp: 'engine',
          id: '321',
          owned: true
        }
      );
      expect(res.records[0].id).toEqual('321');
      expect(res.records[0].packageName).toEqual('engine');
    });
    it('should packages with offset and limit', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine'
          }
        ],
        false
      );

      const res = await dal.getPackages(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          nameRegexp: 'test',
          id: '321',
          limit: 10,
          offset: 10,
          owned: true
        }
      );
      expect(res.records[0].id).toEqual('321');
    });
    it('should get deleted packages', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine',
            deleted: true
          }
        ],
        false
      );

      const res = await dal.getPackages(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          nameRegexp: 'test',
          id: '321',
          owned: true,
          includeDeleted: true
        }
      );
      expect(res.records[0].id).toEqual('321');
      expect(res.records[0].deleted).toBeTruthy();
    });
    it('should get packages with packageFilter arguments', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const options = {
        packageFilter: {
          organizationId: 7682,
          primaryResourceType: 'application',
          isLatest: true
        }
      };
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'application',
            primaryResourceId: '567'
          }
        ],
        false, // Disable SQL validation for this request as `DISTINCT ON` is not supported syntax in our SQL validator.
        'packageFilter',
        (sql, args) => {
          function failed(str) {
            return false;
          }
          if (args[1] !== 7682) return failed(args[1] + ' is not 7682');
          if (args[2] !== 'application')
            return failed(args[2] + ' is not application');
          return true;
        }
      );
      try {
        res = await dal.getPackages(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].resourceType).toEqual('application');
    });

    describe('#_getPackagesQuery', function () {
      it('filter packages by resourceAlias', async function () {
        const context = mockUtil.makeContext();
        const options = {
          resourceAlias: 'test_resources_alias'
        };
        const { sql, args } = await dal._getPackagesQuery(context, options);
        expect(sql).toBeDefined();
        expect(args).toBeDefined();
        expect(sql).toContain(
          `LEFT JOIN aiware.package__resource pr ON pr.package_id = p.package_id`
        );
        expect(sql).toContain(`pr.resource_alias = $`);
        expect(args.length).toEqual(2);
        expect(args[1]).toEqual(options.resourceAlias);
      });

      it('filter packages by id, distribution type', async function () {
        const context = mockUtil.makeContext();
        const options = {
          id: 'test-id',
          distributionType: 'public'
        };
        const { sql, args } = await dal._getPackagesQuery(context, options);
        expect(sql).toBeDefined();
        expect(args).toBeDefined();
        expect(sql).toContain(`p.package_id = $2`);
        expect(sql).toContain(`p.distribution_type = $3`);
        expect(args.length).toEqual(3);
        expect(args[1]).toEqual(options.id);
        expect(args[2]).toEqual(options.distributionType);
      });

      it('filter packages by id, distribution type, ids, distribution types. Should ignore ids, distribution types in the input', async function () {
        const context = mockUtil.makeContext();
        const options = {
          id: 'test-id',
          distributionType: 'public',
          ids: ['test-id1', 'test-id2'],
          distributionTypes: ['public', 'private']
        };
        const { sql, args } = await dal._getPackagesQuery(context, options);
        expect(sql).toBeDefined();
        expect(args).toBeDefined();
        expect(sql).toContain(`p.package_id = $2`);
        expect(sql).toContain(`p.distribution_type = $3`);
        expect(args.length).toEqual(3);
        expect(args[1]).toEqual(options.id);
        expect(args[2]).toEqual(options.distributionType);
      });

      it('filter packages by ids, distribution types', async function () {
        const context = mockUtil.makeContext();
        const options = {
          ids: ['test-id1', 'test-id1'],
          distributionTypes: ['public', 'private']
        };
        const { sql, args } = await dal._getPackagesQuery(context, options);
        expect(sql).toBeDefined();
        expect(args).toBeDefined();
        expect(sql).toContain(`p.package_id = ANY($2::uuid[])`);
        expect(sql).toContain(
          `p.distribution_type = ANY($3::job_new.distribution_type[])`
        );
        expect(args.length).toEqual(3);
        expect(args[1]).toEqual(options.ids);
        expect(args[2]).toEqual(options.distributionTypes);
      });

      it('should order packages by name as ascending', async function () {
        const context = mockUtil.makeContext();
        const options = {
          ids: ['test-id1'],
          orderBy: [{ field: 'name', direction: 'asc' }]
        };
        const { sql, args } = await dal._getPackagesQuery(context, options);
        expect(sql).toBeDefined();
        expect(args).toBeDefined();
        expect(sql).toContain(`ORDER BY p.package_name ASC`);
        expect(args.length).toEqual(2);
        expect(args[1]).toEqual(options.ids);
      });

      it('filter packages with no primary resource type (primaryResourceType = null)', async function () {
        const context = mockUtil.makeContext();
        const options = {};
        const packageFilter = { primaryResourceType: null };

        const { sql, args } = await dal._getPackagesQuery(context, {
          ...options,
          packageFilter
        });

        expect(sql).toBeDefined();
        expect(args.length).toEqual(1);
        expect(sql).toContain(`prim.package_id IS NULL`);
      });

      it('filter packages by specific primaryResourceType', async function () {
        const context = mockUtil.makeContext();
        const options = {};
        const packageFilter = { primaryResourceType: 'application' };

        const { sql, args } = await dal._getPackagesQuery(context, {
          ...options,
          packageFilter
        });

        expect(sql).toBeDefined();
        expect(args.length).toEqual(2);
        expect(sql).toContain(`pr.resource_type = $2`);
      });
      it('should check user permissions and set hasDeveloperPermission to true when user has DEVELOPER_ENGINE_READ or AIWARE_PACKAGE_READ', async function () {
        const context = mockUtil.makeContext();
        const options = { id: 'test-id' };

        // Mock the rbacAuthBll.hasPermissions to return true for developer permission
        serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValue([
          { hasPermission: true }
        ]);

        const { sql, args } = await dal._getPackagesQuery(context, options);

        expect(serviceContext.bll.rbacAuth.hasPermissions).toHaveBeenCalledWith(
          context,
          {
            resourceType: 'Organization',
            ids: [expect.any(String)],
            permissions: ['DEVELOPER_ENGINE_READ', 'AIWARE_PACKAGE_READ'],
            requireAll: false
          },
          true
        );

        expect(sql).toBeDefined();
        expect(args).toBeDefined();
      });

      it('should convert orgId to string for permission check', async function () {
        const context = {
          ...mockUtil.makeContext(),
          requestContext: {
            userInfo: {
              organization: {
                organizationId: 12345 // numeric orgId
              }
            }
          }
        };
        const options = { id: 'test-id' };

        serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValue([
          { hasPermission: true }
        ]);

        await dal._getPackagesQuery(context, options);

        expect(serviceContext.bll.rbacAuth.hasPermissions).toHaveBeenCalledWith(
          context,
          {
            resourceType: 'Organization',
            ids: ['12345'], // should be converted to string
            permissions: ['DEVELOPER_ENGINE_READ', 'AIWARE_PACKAGE_READ'],
            requireAll: false
          },
          true
        );
      });

      it('should filter packages by grantTypes array', async function () {
        const context = mockUtil.makeContext();
        const packageFilter = { grantTypes: ['VIEW', 'GRANT'] };

        const { sql, args } = await dal._getPackagesQuery(context, { packageFilter });

        expect(sql).toContain('pog.grant_type = ANY($');
        expect(sql).toContain('::aiware.aiw_package_grant_enum[])');
        expect(args).toContain(packageFilter.grantTypes);
      });

      it('should filter packages by grantTypes array with includeOwned', async function () {
        const context = mockUtil.makeContext();
        const packageFilter = { grantTypes: ['VIEW', 'GRANT'], includeOwned: true };

        const { sql, args } = await dal._getPackagesQuery(context, { packageFilter });

        expect(sql).toContain('pog.grant_type = ANY($');
        expect(sql).toContain('OR p.organization_id = $');
        expect(args).toContain(packageFilter.grantTypes);
      });

      it('should use superadmin orgId for contextual grantType when provided', async function () {
        serviceContext.dal.organization.getOrganization = jest.fn().mockResolvedValue({ id: '9999' });
        const context = {
          ...mockUtil.makeContext(),
          _authInfo: {
            permissionMasks: [2],
            organization: { organizationId: '7682' }
          }
        };
        const options = { orgId: '9999' };

        const { sql, args } = await dal._getPackagesQuery(context, options, true);

        // First arg should be the superadmin's target orgId for the pog LEFT JOIN
        expect(args[0]).toEqual('9999');
        expect(sql).toContain('pog.organization_id = $1');
      });
    });
  });
  describe('#getPackageResources', function () {
    it('it should return error when neither a packageId or resourceId is provided', async function () {
      try {
        const res = await dal.getPackageResources(
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          },
          {}
        );
      } catch (error) {
        expect(error.message).toEqual(
          'No resourceId or packageId was provided. Please check your input and try again.'
        );
      }
    });

    it('should return package resource by packageId and resourceType', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '123',
            packageId: '321',
            resourceType: 'engine'
          }
        ],
        false
      );

      const res = await dal.getPackageResources(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        },
        {
          packageId: '321',
          resourceType: 'engine'
        }
      );
      expect(res.records[0].packageId).toEqual('321');
    });

    it('should return package resource by packageId and resourceAlias', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '123',
            packageId: '321',
            resourceAlias: 'tdo_resource'
          }
        ],
        false
      );

      const res = await dal.getPackageResources(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        },
        {
          packageId: '321',
          resourceAlias: 'tdo_resource'
        }
      );
      expect(res.records[0].packageId).toEqual('321');
      expect(res.records[0].resourceAlias).toEqual('tdo_resource');
    });

    it('should return package resource by packageId and resourceType with offset and limit', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '123',
            packageId: '321',
            resourceType: 'engine',
            organizationId: 7682
          }
        ],
        false
      );

      const res = await dal.getPackageResources(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        },
        {
          packageId: 'mock_id',
          resourceType: 'engine',
          offset: 10,
          limit: 10
        }
      );
      expect(res.records[0].packageId).toEqual('321');
    });
  });

  describe('#getPackageGrants', function () {
    it('should return all grants by package ID for super-admin that owns the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            },
            permissionMasks: [2]
          }
        },
        {
          id: '321'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package ID for super-admin that does not own the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 8000
            },
            permissionMasks: [2]
          }
        },
        {
          id: '321'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package ID for non-super-admin that owns the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          id: '321'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package ID for non-super-admin that does not own the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          id: '321'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package ID and org ID for super-admin that owns the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 7682,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            },
            permissionMasks: [2]
          }
        },
        {
          id: '321',
          orgId: '7682'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package ID for super-admin that does not own the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 8000
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            },
            permissionMasks: [2]
          }
        },
        {
          id: '321',
          orgId: '5000'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package ID for non-super-admin that owns the package', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          id: '321',
          orgId: '5000'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should throw an error for non-super-admin that does not own the package and tries to filter by both packageId and organizationId', async function () {
      let res, err;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 8000
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      try {
        res = await dal.getPackageGrants(
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              organization: {
                organizationId: 7682
              }
            }
          },
          {
            id: '321',
            orgId: '5000'
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
    });

    it('should return grants to specified org id if user is super-admin', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            },
            permissionMasks: [2]
          }
        },
        {
          orgId: '5000'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return grants to specified org id if user is non-super-admin', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          orgId: '5000'
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return grants to specified org id where grant type is GRANT and user is non-super-admin', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          orgId: '5000',
          packageFilter: {
            grantType: 'GRANT'
          }
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return grants to specified org id where package is latest in version lineage and user is non-super-admin', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          orgId: '5000',
          packageFilter: {
            isLatest: true
          }
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return grants to specified org id where package status is published and user is non-super-admin', async function () {
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            organizationId: 5000,
            resourceType: 'Engine',
            grantType: 'GRANT'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            }
          }
        },
        {
          orgId: '5000',
          packageFilter: {
            status: 'published'
          }
        }
      );
      expect(res.records[0].id).toEqual('321');
    });

    it('should return all grants by package partial name match', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682,
            packageId: '123',
            packageName: 'Redact'
          }
        ],
        false
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            organization: {
              organizationId: 7682
            },
            permissionMasks: [2]
          }
        },
        {
          orgId: '7682',
          packageFilter: {
            nameRegex: 'Red'
          }
        }
      );
      expect(res.records[0].packageName).toEqual('Redact');
    });
    it('should grants to specified org id where distributionType filter is specified', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682,
            packageId: '123',
            grant_type: 'GRANT'
          }
        ],
        false,
        ['LEFT JOIN', 'aiware.package'],
        (sql, param) => {
          expect(param[0]).toEqual('public');
          expect(param[1]).toEqual('7682');

          return true;
        }
      );

      const res = await dal.getPackageGrants(
        {
          ...mockUtil.makeContext()
        },
        {
          orgId: '7682',
          packageFilter: {
            distributionType: 'public'
          }
        }
      );
      expect(res.records[0].grantType).toEqual('GRANT');
    });
  });

  describe('#validateUUIDs', function () {
    it('should not return an error if all provided UUIDs are valid', function () {
      let err;
      const validationErrors = [];
      const uuids = {
        id: '473b8c9a-d7c2-4c9a-a750-e1a7d7d05c35',
        sourceOriginId: '572abfb5-7ef3-4fad-a1c4-65b38766f93e',
        sourcePackageId: '60836da5-4bfe-4abd-97a4-97daaf0dbb1b'
      };
      try {
        dal.validateUUIDs(uuids, validationErrors);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(validationErrors.length).toEqual(0);
    });

    it('should return an error for each provided invalid UUID', function () {
      let err;
      const validationErrors = [];
      const uuids = {
        id: '473b8c9a',
        sourceOriginId: '572abfb5',
        sourcePackageId: '60836da5'
      };
      try {
        dal.validateUUIDs(uuids, validationErrors);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(validationErrors.length).toEqual(3);
    });

    it('should not return errors for undefined values', function () {
      let err;
      const validationErrors = [];
      const uuids = {
        id: '473b8c9a-d7c2-4c9a-a750-e1a7d7d05c35',
        sourceOriginId: '572abfb5-7ef3-4fad-a1c4-65b38766f93e',
        sourcePackageId: undefined
      };
      try {
        dal.validateUUIDs(uuids, validationErrors);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(validationErrors.length).toEqual(0);
    });
  });

  describe('#checkStatusOfResources', function () {
    it('should throw an error if nested application resource is not published', async function () {
      let inactiveResources;
      let err;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '1111',
            application_name: 'Test Application',
            application_status: 'draft'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            engine_id: '2222',
            engine_name: 'Test Engine',
            engine_state: 'active'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            package_id: '3333',
            package_name: 'Test Package',
            status: 'published'
          }
        ],
        false
      );

      try {
        inactiveResources = await dal.checkStatusOfResources(
          context,
          'published',
          [
            { resourceId: '1111', resourceType: 'application', action: 'ADD' },
            { resourceId: '2222', resourceType: 'engine', action: 'ADD' },
            { resourceId: '3333', resourceType: 'package', action: 'ADD' }
          ]
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(inactiveResources[0]).toEqual({
        resourceId: '1111',
        resourceName: 'Test Application',
        resourceType: 'application',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
    });

    it('should throw an error if nested engine resource is not published', async function () {
      let inactiveResources;
      let err;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '1111',
            application_name: 'Test Application',
            application_status: 'active'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            engine_id: '2222',
            engine_name: 'Test Engine',
            engine_state: 'approved'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            package_id: '3333',
            package_name: 'Test Package',
            status: 'published'
          }
        ],
        false
      );

      try {
        inactiveResources = await dal.checkStatusOfResources(
          context,
          'published',
          [
            { resourceId: '1111', resourceType: 'application', action: 'ADD' },
            { resourceId: '2222', resourceType: 'engine', action: 'ADD' },
            { resourceId: '3333', resourceType: 'package', action: 'ADD' }
          ]
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(inactiveResources[0]).toEqual({
        resourceId: '2222',
        resourceName: 'Test Engine',
        resourceType: 'engine',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
    });

    it('should skip resource checks when skipPackageResourceValidation is set', async function () {
      let inactiveResources;
      let err;
      const context = mockUtil.makeContext(null, { authType: 'user' });
      _.set(context, 'config.featureFlags.skipPackageResourceValidation', true);
      try {
        inactiveResources = await dal.checkStatusOfResources(
          context,
          'published',
          [
            { resourceId: '1111', resourceType: 'application', action: 'ADD' },
            { resourceId: '2222', resourceType: 'engine', action: 'ADD' },
            { resourceId: '3333', resourceType: 'package', action: 'ADD' }
          ]
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(inactiveResources).toEqual([]);
    });

    it('should throw an error if nested package resource is not published', async function () {
      let inactiveResources;
      let err;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '1111',
            application_name: 'Test Application',
            application_status: 'active'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            engine_id: '2222',
            engine_name: 'Test Engine',
            engine_state: 'active'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            package_id: '3333',
            package_name: 'Test Package',
            status: 'draft'
          }
        ],
        false
      );

      try {
        inactiveResources = await dal.checkStatusOfResources(
          context,
          'published',
          [
            { resourceId: '1111', resourceType: 'application', action: 'ADD' },
            { resourceId: '2222', resourceType: 'engine', action: 'ADD' },
            { resourceId: '3333', resourceType: 'package', action: 'ADD' }
          ]
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(inactiveResources[0]).toEqual({
        resourceId: '3333',
        resourceName: 'Test Package',
        resourceType: 'package',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
    });

    it('should throw an error with list of inactive resources, if multiple resources are not published', async function () {
      let inactiveResources;
      let err;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '1111-1',
            application_name: 'Test Application 1',
            application_status: 'active'
          },
          {
            application_id: '1111-2',
            application_name: 'Test Application 2',
            application_status: 'draft'
          },
          {
            application_id: '1111-3',
            application_name: 'Test Application 3',
            application_status: 'approved'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            engine_id: '2222-1',
            engine_name: 'Test Engine 1',
            engine_state: 'approved'
          },
          {
            engine_id: '2222-2',
            engine_name: 'Test Engine 2',
            engine_state: 'active'
          },
          {
            engine_id: '2222-3',
            engine_name: 'Test Engine 3',
            engine_state: 'draft'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            package_id: '3333-1',
            package_name: 'Test Package 1',
            status: 'draft'
          },
          {
            package_id: '3333-2',
            package_name: 'Test Package 2',
            status: 'approved'
          },
          {
            package_id: '3333-3',
            package_name: 'Test Package 3',
            status: 'published'
          }
        ],
        false
      );

      try {
        inactiveResources = await dal.checkStatusOfResources(
          context,
          'published',
          [
            {
              resourceId: '1111-1',
              resourceType: 'application',
              action: 'ADD'
            },
            {
              resourceId: '1111-2',
              resourceType: 'application',
              action: 'ADD'
            },
            {
              resourceId: '1111-3',
              resourceType: 'application',
              action: 'ADD'
            },
            { resourceId: '2222-1', resourceType: 'engine', action: 'ADD' },
            { resourceId: '2222-2', resourceType: 'engine', action: 'ADD' },
            { resourceId: '2222-3', resourceType: 'engine', action: 'ADD' },
            { resourceId: '3333-1', resourceType: 'package', action: 'ADD' },
            { resourceId: '3333-2', resourceType: 'package', action: 'ADD' },
            { resourceId: '3333-3', resourceType: 'package', action: 'ADD' }
          ]
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();

      expect(inactiveResources[0]).toEqual({
        resourceId: '1111-2',
        resourceName: 'Test Application 2',
        resourceType: 'application',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
      expect(inactiveResources[1]).toEqual({
        resourceId: '1111-3',
        resourceName: 'Test Application 3',
        resourceType: 'application',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });

      expect(inactiveResources[2]).toEqual({
        resourceId: '2222-1',
        resourceName: 'Test Engine 1',
        resourceType: 'engine',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
      expect(inactiveResources[3]).toEqual({
        resourceId: '2222-3',
        resourceName: 'Test Engine 3',
        resourceType: 'engine',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });

      expect(inactiveResources[4]).toEqual({
        resourceId: '3333-1',
        resourceName: 'Test Package 1',
        resourceType: 'package',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
      expect(inactiveResources[5]).toEqual({
        resourceId: '3333-2',
        resourceName: 'Test Package 2',
        resourceType: 'package',
        message:
          'Resource is inactive. This package cannot be published until all its resources are active/published.'
      });
    });

    it('should not throw any errors if all resources are published', async function () {
      let inactiveResources;
      let err;
      const context = mockUtil.makeContext(null, { authType: 'user' });

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '1111-1',
            application_name: 'Test Application 1',
            application_status: 'active'
          },
          {
            application_id: '1111-2',
            application_name: 'Test Application 2',
            application_status: 'active'
          },
          {
            application_id: '1111-3',
            application_name: 'Test Application 3',
            application_status: 'active'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            engine_id: '2222-1',
            engine_name: 'Test Engine 1',
            engine_state: 'active'
          },
          {
            engine_id: '2222-2',
            engine_name: 'Test Engine 2',
            engine_state: 'active'
          },
          {
            engine_id: '2222-3',
            engine_name: 'Test Engine 3',
            engine_state: 'active'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            package_id: '3333-1',
            package_name: 'Test Package 1',
            status: 'published'
          },
          {
            package_id: '3333-2',
            package_name: 'Test Package 2',
            status: 'published'
          },
          {
            package_id: '3333-3',
            package_name: 'Test Package 3',
            status: 'published'
          }
        ],
        false
      );

      try {
        inactiveResources = await dal.checkStatusOfResources(
          context,
          'published',
          [
            {
              resourceId: '1111-1',
              resourceType: 'application',
              action: 'ADD'
            },
            {
              resourceId: '1111-2',
              resourceType: 'application',
              action: 'ADD'
            },
            {
              resourceId: '1111-3',
              resourceType: 'application',
              action: 'ADD'
            },
            { resourceId: '2222-1', resourceType: 'engine', action: 'ADD' },
            { resourceId: '2222-2', resourceType: 'engine', action: 'ADD' },
            { resourceId: '2222-3', resourceType: 'engine', action: 'ADD' },
            { resourceId: '3333-1', resourceType: 'package', action: 'ADD' },
            { resourceId: '3333-2', resourceType: 'package', action: 'ADD' },
            { resourceId: '3333-3', resourceType: 'package', action: 'ADD' }
          ]
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(inactiveResources.length).toEqual(0);
    });
  });

  describe('#getLatestPackageInLineage', function () {
    it('should return latestPackage and latestNonDeletedPackage as different values when latest is deleted', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          {
            package_version: '1.0.0',
            deleted: false,
            primary_resource_id: '123'
          },
          {
            package_version: '2.0.0',
            deleted: false,
            primary_resource_id: '123'
          },
          {
            package_version: '3.0.0',
            deleted: true,
            primary_resource_id: '123'
          }
        ],
        false
      );

      try {
        res = await dal.getLatestPackageInLineage('sourceOriginId');
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.latestPackage.version).toEqual('3.0.0');
      expect(res.latestNonDeletedPackage.version).toEqual('2.0.0');
      expect(res.latestPackage.primaryResourceId).toEqual('123');
      expect(res.latestNonDeletedPackage.primaryResourceId).toEqual('123');
    });

    it('should return latestPackage and latestNonDeletedPackage as identical values when latest is not deleted', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          { package_version: '1.0.0', deleted: false },
          { package_version: '2.0.0', deleted: true },
          { package_version: '3.0.0', deleted: false }
        ],
        false
      );

      try {
        res = await dal.getLatestPackageInLineage('sourceOriginId');
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.latestPackage.version).toEqual('3.0.0');
      expect(res.latestNonDeletedPackage.version).toEqual('3.0.0');
    });

    it('should return proper latestPackage and latestNonDeletedPackage values when more than 1 package at end of lineage is deleted', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          { package_version: '1.0.0', deleted: false },
          { package_version: '2.0.0', deleted: true },
          { package_version: '3.0.0', deleted: true }
        ],
        false
      );

      try {
        res = await dal.getLatestPackageInLineage('sourceOriginId');
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.latestPackage.version).toEqual('3.0.0');
      expect(res.latestNonDeletedPackage.version).toEqual('1.0.0');
    });
  });

  describe('#packageCreate', function () {
    it('should create package', async function () {
      let res, err;
      const engineId = uuid.v4();
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const engineBuildId = uuid.v4();
      const schemaId = uuid.v4();
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: engineId
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageIcon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            packageVersion: '1.0',
            sourceOriginId,
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );
      // engine resources (engine build)
      serviceContext.dbConnections['core'].write._push(
        [{ id: engineBuildId, status: 'deployed' }],
        false
      );
      // engine resources (engine schema)
      serviceContext.dbConnections['core'].write._push(
        [{ schemaId: schemaId }],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual(packageId);
      expect(res.name).toEqual('New Test Package');
      expect(res.sourceOriginId).toEqual(sourceOriginId);
      expect(res.aiwareVersion).toEqual('1');
      expect(res.deleted).toEqual(false);
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should create published package with empty resources', async function () {
      let res, err;

      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageIcon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            packageVersion: '1.0',
            sourceOriginId: '321',
            aiwareVersion: '1',
            deleted: false,
            status: 'published',
            organizationId: 7682
          }
        ],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            status: 'published'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('321');
      expect(res.name).toEqual('New Test Package');
      expect(res.sourceOriginId).toEqual('321');
      expect(res.aiwareVersion).toEqual('1');
      expect(res.deleted).toEqual(false);
      expect(res.status).toEqual('published');
      expectEmitBothPackageCreatedAndOtherEvents(['create', 'create']);
    });

    it('should throw an error when attempting to create a v2 package without including sourceOriginId', async function () {
      let res, err;
      const engineId = uuid.v4();
      serviceContext.dbConnections['core'].read._push(
        [{ id: engineId }],
        false
      );
      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            autoGenerated: true,
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '2.0',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.data.validationErrors).toEqual([
        {
          fieldName: 'sourceOriginId',
          message:
            'The sourceOriginId field must be specified if the version is not 1, 1.0, or 1.0.0.'
        }
      ]);
    });

    it('should throw an error when attempting to create a package with a primary resource that already exists in another lineage', async function () {
      let res, err;
      const sourceOriginId = uuid.v4();
      const engineId = uuid.v4();
      // validate resources
      serviceContext.dbConnections['core'].read._push(
        [{ id: engineId }],
        false
      );
      // validate primary resource
      serviceContext.dbConnections['core'].read._push(
        [{ sourceOriginId }],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            autoGenerated: true,
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            primaryResourceId: engineId,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(err.message).toEqual(
        "A package's Primary Resource ID must not already exist in another package lineage. Please check your input and try again."
      );
      expect(err.data).toEqual({
        fieldName: 'primaryResourceId',
        fieldValue: engineId
      });
    });

    it('should create package with primary resource that does not already exist in another lineage', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const sourcePackageId = uuid.v4();
      const engineId = uuid.v4();
      const engineBuildId = uuid.v4();
      const schemaId = uuid.v4();
      // validatePackageCreateInput
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: engineId
          }
        ],
        false
      );

      // validatePrimaryResourceForLineage
      serviceContext.dbConnections['core'].read._push([], false);

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: packageId,
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageVersion: '1.2',
            sourceOriginId: sourceOriginId,
            sourcePackageId: sourcePackageId,
            packageCreatedDate: '2020-01-01T00:00:00.000Z',
            aiwareVersion: '1',
            deleted: false,
            primaryResourceId: engineId,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );

      // engine resources (engine build)
      serviceContext.dbConnections['core'].write._push(
        [{ id: engineBuildId, status: 'deployed' }],
        false
      );
      // engine resources (engine schema)
      serviceContext.dbConnections['core'].write._push(
        [{ schemaId: schemaId }],
        false
      );

      // create package resource - packageUpdateResourcesDb
      // engine build
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            version: '1.2',
            sourceOriginId: sourceOriginId,
            sourcePackageId: sourcePackageId,
            packageCreatedDate: '2020-01-01T00:00:00.000Z',
            aiwareVersion: '1',
            deleted: false,
            autoGenerated: false,
            primaryResourceId: engineId,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual(packageId);
      expect(res.name).toEqual('New Test Package');
      expect(res.primaryResourceId).toEqual(engineId);
      expect(res.sourceOriginId).toEqual(sourceOriginId);
      expect(res.sourcePackageId).toEqual(sourcePackageId);
      expect(res.packageCreatedDate).toEqual('2020-01-01T00:00:00.000Z');
      expect(res.aiwareVersion).toEqual('1');
      expect(res.deleted).toEqual(false);
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should create package with primary resource that already exists in its own lineage', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const sourcePackageId = uuid.v4();
      const engineId = uuid.v4();
      const engineBuildId = uuid.v4();
      const schemaId = uuid.v4();
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: engineId
          }
        ],
        false
      );

      // validate primary resource
      serviceContext.dbConnections['core'].read._push(
        [{ sourceOriginId }],
        false
      );

      // newly created package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageVersion: '1.2',
            sourceOriginId,
            sourcePackageId,
            packageCreatedDate: '2020-01-01T00:00:00.000Z',
            aiwareVersion: '1',
            deleted: false,
            primaryResourceId: engineId,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );

      // create resource
      serviceContext.dbConnections['core'].write._push([], false);

      // create package resource - packageUpdateResourcesDb
      // engine build
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            version: '1.2',
            sourceOriginId,
            sourcePackageId,
            packageCreatedDate: '2020-01-01T00:00:00.000Z',
            aiwareVersion: '1',
            deleted: false,
            autoGenerated: false,
            primaryResourceId: engineId,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual(packageId);
      expect(res.name).toEqual('New Test Package');
      expect(res.primaryResourceId).toEqual(engineId);
      expect(res.sourceOriginId).toEqual(sourceOriginId);
      expect(res.sourcePackageId).toEqual(sourcePackageId);
      expect(res.packageCreatedDate).toEqual('2020-01-01T00:00:00.000Z');
      expect(res.aiwareVersion).toEqual('1');
      expect(res.deleted).toEqual(false);
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should create package with input created date and source package id', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const sourcePackageId = uuid.v4();
      const engineId = uuid.v4();
      const engineBuildId = uuid.v4();
      const schemaId = uuid.v4();
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: engineId
          }
        ],
        false
      );
      // newly created package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageVersion: '1.2',
            sourceOriginId,
            sourcePackageId,
            packageCreatedDate: '2020-01-01T00:00:00.000Z',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );
      // engine resources (engine build)
      serviceContext.dbConnections['core'].write._push(
        [{ id: engineBuildId, status: 'deployed' }],
        false
      );
      // engine resources (engine schema)
      serviceContext.dbConnections['core'].write._push(
        [{ schemaId: schemaId }],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            version: '1.2',
            sourceOriginId,
            sourcePackageId,
            packageCreatedDate: '2020-01-01T00:00:00.000Z',
            aiwareVersion: '1',
            deleted: false,
            autoGenerated: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual(packageId);
      expect(res.name).toEqual('New Test Package');
      expect(res.sourceOriginId).toEqual(sourceOriginId);
      expect(res.sourcePackageId).toEqual(sourcePackageId);
      expect(res.packageCreatedDate).toEqual('2020-01-01T00:00:00.000Z');
      expect(res.aiwareVersion).toEqual('1');
      expect(res.deleted).toEqual(false);
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should create package with custom install date and status', async function () {
      let res, err;
      const engineBuildId = uuid.v4();
      const schemaId = uuid.v4();
      serviceContext.dbConnections['core'].write._push(
        [
          {
            name: 'Test Engine Resource',
            id: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
            state: 'active'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageVersion: '1.0',
            aiwareVersion: '1',
            deleted: false,
            installDate: '2020-01-01T00:00:00.000Z',
            distributionDate: '2020-01-01T00:00:00.000Z',
            status: 'published',
            resources: [
              {
                resourceType: 'engine',
                resourceId: '773df824-bd92-425f-b3fb-c8cbf9d3d72b'
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );
      // engine resources (engine build)
      serviceContext.dbConnections['core'].write._push(
        [{ id: engineBuildId, status: 'deployed' }],
        false
      );
      // engine resources (engine schema)
      serviceContext.dbConnections['core'].write._push(
        [{ schemaId: schemaId }],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            installDate: '2020-01-01T00:00:00.000Z',
            status: 'published',
            resources: [
              {
                resourceType: 'engine',
                resourceId: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('321');
      expect(res.installDate).toEqual('2020-01-01T00:00:00.000Z');
      expect(res.distributionDate).toEqual('2020-01-01T00:00:00.000Z');
      expect(res.status).toEqual('published');
      expectEmitBothPackageCreatedAndOtherEvents(['create', 'create']);
    });

    it('should create package with provided id', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const engineId = uuid.v4();
      const engineBuildId = uuid.v4();
      const schemaId = uuid.v4();
      serviceContext.dbConnections['core'].write._push([
        {
          id: engineId
        }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package 2',
            packageDescription: 'This is just a test',
            packageVersion: '1.0',
            sourceOriginId,
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );
      // engine resources (engine build)
      serviceContext.dbConnections['core'].write._push(
        [{ id: engineBuildId, status: 'deployed' }],
        false
      );
      // engine resources (engine schema)
      serviceContext.dbConnections['core'].write._push(
        [{ schemaId: schemaId }],
        false
      );

      try {
        res = await dal.packageCreate(
          {
            id: packageId,
            name: 'New Test Package 2',
            description: 'This is just a test',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId,
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual(packageId);
      expect(res.name).toEqual('New Test Package 2');
      expect(res.sourceOriginId).toEqual(sourceOriginId);
      expect(res.aiwareVersion).toEqual('1');
      expect(res.deleted).toEqual(false);
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should error if attempting to create package with invalid primary resource id', async function () {
      let err;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageIcon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            packageVersion: '1.0',
            sourceOriginId: 'b23d4401-5a6e-47fd-a6a6-053345075821',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: '773df824-bd92-425f-b3fb-c8cbf9d3d72b'
              }
            ]
          }
        ],
        false
      );

      try {
        await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            sourceOriginId: 'b23d4401-5a6e-47fd-a6a6-053345075821',
            aiwareVersion: '1',
            deleted: false,
            primaryResourceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            resources: [
              {
                resourceType: 'engine',
                resourceId: '773df824-bd92-425f-b3fb-c8cbf9d3d72b'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.data.validationErrors[0].message).toEqual(
        'A Primary Resource ID was provided that does not exist in the list of resources for this package. Please check your input and try again.'
      );
    });

    it('should error with empty db results', async function () {
      let res, err;

      serviceContext.dbConnections['core'].write._push([], false);

      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data).toEqual(
        expect.objectContaining({
          validationErrors: [
            {
              resourceId: expect.any(String),
              resourceType: 'engine',
              message:
                'Resource does not exist. Packages can be created or updated only with existing resources'
            }
          ]
        })
      );
      // commenting this out because validation fails outside of the doCreatePackage where event is emitted
      // re-enable this after VE-11130 is completed
      // expectOnlyEmitPackageCreatedEvent('failure');
    });

    it('should emit an event when packageCreate -> doPackageUpgrades fails', async function () {
      let res, err;
      dal.doPackageUpgrades = jest
        .fn()
        .mockRejectedValueOnce(new Error('test error'));
      try {
        res = await dal.packageCreate(
          {
            // this doesn't matter as we enforce failure
          },
          {
            ...mockUtil.makeContext()
          },
          {
            isVersionUpgrade: true
          }
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: "Failed to create package"
        })
      );
    });

    it('should emit an event when packageCreate -> validatePackageCreateInput fails', async function () {
      let res, err;
      dal.validatePackageCreateInput = jest
        .fn()
        .mockRejectedValueOnce(new Error('test error'));
      try {
        res = await dal.packageCreate(
          {
            // this doesn't matter as we enforce failure
          },
          {
            ...mockUtil.makeContext()
          },
          {
            isVersionUpgrade: false
          }
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: "Failed to create package"
        })
      );
    });

    it('should emit only one event when doPackageCreate fails bubbling error up', async function () {
      let res, err;
      dal.upsertPackagePrimaryResource = jest
        .fn()
        .mockRejectedValueOnce(new Error('test error'));

      const engineId = uuid.v4();
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: engineId
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            packageDescription: 'This is just a test',
            packageIcon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            packageVersion: '1.0',
            sourceOriginId,
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: engineId
              }
            ],
            organizationId: 7682
          }
        ],
        false
      );
      try {
        res = await dal.packageCreate(
          {
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'engine',
                resourceId: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          },
          {
            isVersionUpgrade: false
          }
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: "Failed to create package"
        })
      );
    });
  });

  describe('#package resource preprocess', function () {
    afterEach(function () {
      jest.resetAllMocks();
    });
    it('should clone TDO resource', async function () {
      const packageId = uuid.v4();
      const tdo1 = uuid.v4();
      const tdo2 = uuid.v4();
      const getTDO = jest
        .spyOn(serviceContext.dal.tdo, 'getTDO')
        .mockResolvedValueOnce({
          id: tdo1,
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });
      const getTDOs = jest
        .spyOn(serviceContext.dal.tdo, 'getTDOs')
        .mockResolvedValueOnce({
          records: [
            {
              id: tdo1,
              orgId: 'org_123',
              applicationId: 'app_id_123'
            },
            {
              id: tdo2,
              orgId: 'org_123',
              applicationId: 'app_id_123'
            }
          ]
        });
      const processClone = jest
        .spyOn(serviceContext.dal.tdo, 'processClone')
        .mockResolvedValueOnce({
          id: tdo2,
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });
      const updateTDOAuthorized = jest
        .spyOn(serviceContext.dal.tdo, 'updateTDOAuthorized')
        .mockResolvedValueOnce({
          id: tdo2,
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });

      serviceContext.dbConnections['core'].write._push([
        {
          packageId,
          packageName: 'New Test Package 2',
          packageDescription: 'This is just a test',
          packageVersion: '1.0',
          sourceOriginId: 'b23d4401-5a6e-47fd-a6a6-053345075821',
          aiwareVersion: '1',
          deleted: false,
          resources: [
            {
              resourceType: 'TDO',
              resourceId: tdo2,
            }
          ],
          organizationId: 7682
        }
      ]);

      const res = await dal.packageCreate(
        {
          id: packageId,
          name: 'New Test Package 2',
          description: 'This is just a test',
          version: '1.0',
          aiwareVersion: '1',
          deleted: false,
          resources: [
            {
              resourceType: 'tdo',
              resourceId: tdo1,
              action: 'ADD'
            }
          ]
        },
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        }
      );
      expect(res).toBeDefined();
      expect(getTDO).toHaveBeenCalled();
      expect(getTDOs).toHaveBeenCalled();
      expect(processClone).toHaveBeenCalledTimes(1);
      expect(updateTDOAuthorized).toHaveBeenCalledWith(
        expect.any(Object),
        {
          input: {
            id: tdo2,
            details: {
              veritonePermissions: {
                packageId: [packageId]
              }
            }
          },
          organizationId: 'org_123'
        },
        {
          applicationId: 'app_id_123',
          id: tdo2,
          jsondata: {
            veritonePermissions: {
              packageId: [packageId]
            }
          },
          orgId: 'org_123'
        }
      );
    });
    it('should clone AutomateNode resource', async function () {
      const getTDO = jest
        .spyOn(serviceContext.dal.tdo, 'getTDO')
        .mockResolvedValueOnce({
          id: 'tdo_123',
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });
      const processClone = jest
        .spyOn(serviceContext.dal.tdo, 'processClone')
        .mockResolvedValueOnce({
          id: 'tdo_789',
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });
      const updateTDOAuthorized = jest
        .spyOn(serviceContext.dal.tdo, 'updateTDOAuthorized')
        .mockResolvedValueOnce({
          id: 'tdo_789',
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });

      // validate primary resource
      serviceContext.dbConnections['core'].read._push([], false);

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push([
        {
          packageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          packageName: 'New Test Package 2',
          packageDescription: 'This is just a test',
          packageVersion: '1.0',
          sourceOriginId: 'b23d4401-5a6e-47fd-a6a6-053345075821',
          aiwareVersion: '1',
          deleted: false,
          resources: [
            {
              resourceType: 'TDO',
              resourceId: 'tdo_789'
            }
          ],
          organizationId: 7682
        }
      ]);

      // create resource
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['aiware.package__resource'],
        (sql, params) => {
          expect(params[2]).toEqual('tdo_789');
          return true;
        }
      );

      // create primary resource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: 'tdo_789' }],
        false,
        ['aiware.package__primary_resource'],
        (sql, params) => {
          expect(params[1]).toEqual('tdo_789');
          return true;
        }
      );

      serviceContext.dal.folder.getOrCreateOrgRootFolder.mockResolvedValueOnce({
        id: 'automateNode_r_f_id'
      });
      serviceContext.dal.folder.getParentFoldersForObject.mockResolvedValueOnce(
        [
          {
            id: 'automateNode_r_f_id'
          }
        ]
      );

      const res = await dal.packageCreate(
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'New Test Package 2',
          description: 'This is just a test',
          version: '1.0',
          aiwareVersion: '1',
          primaryResourceId: 'tdo_123',
          deleted: false,
          resources: [
            {
              resourceType: 'automateNode',
              resourceId: 'tdo_123',
              action: 'ADD'
            }
          ]
        },
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        }
      );
      expect(res).toBeDefined();
      expect(getTDO).toHaveBeenCalled();
      expect(processClone).toHaveBeenCalledTimes(1);
      expect(updateTDOAuthorized).toHaveBeenCalledWith(
        expect.any(Object),
        {
          input: {
            id: 'tdo_789',
            details: {
              veritonePermissions: {
                packageId: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
              }
            }
          },
          organizationId: 'org_123'
        },
        {
          applicationId: 'app_id_123',
          id: 'tdo_789',
          jsondata: {
            veritonePermissions: {
              packageId: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
            }
          },
          orgId: 'org_123'
        }
      );
    });
    it('should clone AutomatePalette resource', async function () {
      const getTDO = jest
        .spyOn(serviceContext.dal.tdo, 'getTDO')
        .mockResolvedValueOnce({
          id: 'tdo_123',
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });
      const processClone = jest
        .spyOn(serviceContext.dal.tdo, 'processClone')
        .mockResolvedValueOnce({
          id: 'tdo_789',
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });
      const updateTDOAuthorized = jest
        .spyOn(serviceContext.dal.tdo, 'updateTDOAuthorized')
        .mockResolvedValueOnce({
          id: 'tdo_789',
          orgId: 'org_123',
          applicationId: 'app_id_123'
        });

      // validate primary resource
      serviceContext.dbConnections['core'].read._push([], false);

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push([
        {
          packageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          packageName: 'New Test Package 2',
          packageDescription: 'This is just a test',
          packageVersion: '1.0',
          sourceOriginId: 'b23d4401-5a6e-47fd-a6a6-053345075821',
          aiwareVersion: '1',
          deleted: false,
          resources: [
            {
              resourceType: 'TDO',
              resourceId: 'tdo_789'
            }
          ],
          organizationId: 7682
        }
      ]);

      // create resource
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['aiware.package__resource'],
        (sql, params) => {
          expect(params[2]).toEqual('tdo_789');
          return true;
        }
      );

      // create primary resource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: 'tdo_789' }],
        false,
        ['aiware.package__primary_resource'],
        (sql, params) => {
          expect(params[1]).toEqual('tdo_789');
          return true;
        }
      );

      const res = await dal.packageCreate(
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'New Test Package 2',
          description: 'This is just a test',
          version: '1.0',
          aiwareVersion: '1',
          primaryResourceId: 'tdo_123',
          deleted: false,
          resources: [
            {
              resourceType: 'automatePalette',
              resourceId: 'tdo_123',
              action: 'ADD'
            }
          ]
        },
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        }
      );
      expect(res).toBeDefined();
      expect(getTDO).toHaveBeenCalled();
      expect(processClone).toHaveBeenCalledTimes(1);
      expect(updateTDOAuthorized).toHaveBeenCalledWith(
        expect.any(Object),
        {
          input: {
            id: 'tdo_789',
            details: {
              veritonePermissions: {
                packageId: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
              }
            }
          },
          organizationId: 'org_123'
        },
        {
          applicationId: 'app_id_123',
          id: 'tdo_789',
          jsondata: {
            veritonePermissions: {
              packageId: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
            }
          },
          orgId: 'org_123'
        }
      );
    });
  });

  describe('#packageUpdate', function () {
    it('should throw error if no package id provided', async () => {
      let res, err;

      // for org check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );
      // tx begin
      serviceContext.dbConnections['core'].write._push([], false);

      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package - UPDATED'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            name: 'New Test Package - UPDATED',
            status: 'pending'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      // we should log a failed attempt to update a package
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create', // pending status is set to emit 'packageCreated' event
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
    });

    it('should throw error if trying to remove primary resource', async () => {
      let res, err;

      // for get package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Packagee',
            primaryResourceId: '123',
            sourceOriginId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      // for latest in lineage check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      // tx begin
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123',
            resourceType: 'engine'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package - UPDATED'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            name: 'New Test Package - UPDATED',
            id: '321',
            primaryResourceId: '123',
            resources: [
              {
                resourceId: '123',
                resourceType: 'engine',
                action: 'REMOVE'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      // no events are emitted when status is missing
      expect(messages.length).toEqual(0);
      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toEqual(
        'The primary resource ID provided does not match any of the resources in the package. Check that you are not removing the primary resource in this update.'
      );
    });

    it('should not throw error if not trying to remove primary resource', async () => {
      let res, err;

      // for get package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '00000000-0000-0000-0000-000000000001',
            packageName: 'New Test Packagee',
            primaryResourceId: '123',
            sourceOriginId: '00000000-0000-0000-0000-000000000000',
            packageVersion: '1.0',
            autoGenerated: false
          }
        ],
        false
      );

      // for latest in lineage check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '00000000-0000-0000-0000-000000000001',
            packageVersion: '1.0'
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // validate resources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );

      // validatePrimaryResourceForLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            sourceOriginId: '00000000-0000-0000-0000-000000000000'
          }
        ],
        false
      );

      // create package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageName: 'New Test Package - UPDATED',
            packageId: '432'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([{ id: '567' }], false); // getEngineBuildResources
      serviceContext.dbConnections['core'].write._push([], false); // getSchemaResources
      serviceContext.dbConnections['core'].write._push([], false); // getSchemaResources
      serviceContext.dbConnections['core'].write._push([{}], false); // updatePackagePrimaryKey

      serviceContext.dbConnections['core'].write._push([{}], false); // packageResourceUpdateDb
      serviceContext.dbConnections['core'].write._push(
        [{ primaryResourceId: '123' }],
        false
      ); // primaryResourceId check
      serviceContext.dbConnections['core'].write._push([{}], false); // packageResourceUpdateDb
      serviceContext.dbConnections['core'].write._push(
        [{ primaryResourceId: '123' }],
        false
      ); // primaryResourceId check

      serviceContext.dbConnections['core'].write._push([{}], false);
      serviceContext.dbConnections['core'].write._push(
        [{ primaryResourceId: '123' }],
        false
      ); // primaryResourceId check
      serviceContext.dbConnections['core'].write._push([], false);
      serviceContext.dbConnections['core'].write._push([], false);
      serviceContext.dbConnections['core'].write._push([], false);

      try {
        res = await dal.packageUpdate(
          {
            name: 'New Test Package - UPDATED',
            id: '00000000-0000-0000-0000-000000000001',
            primaryResourceId: '123',
            status: 'draft',
            resources: [
              {
                resourceId: '456',
                resourceType: 'engine',
                action: 'REMOVE'
              },
              {
                resourceId: '123',
                resourceType: 'engine',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
    });

    it('should throw error if trying to update fields besides status of previous package', async () => {
      let res, err;

      // for get package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Packagee',
            primaryResourceId: '123',
            sourceOriginId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      // for latest in lineage check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '654',
            packageVersion: '2.0'
          },
          {
            packageId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      // tx begin
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123',
            resourceType: 'engine'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package - UPDATED'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            name: 'New Test Package - UPDATED',
            id: '321',
            primaryResourceId: '123',
            resources: [
              {
                resourceId: '123',
                resourceType: 'engine',
                action: 'REMOVE'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toEqual(
        'This package is not the latest in the lineage.  Please edit the latest package in the lineage.'
      );
    });

    it('should throw error if trying to update status and other fields of previous package', async () => {
      let res, err;

      // for get package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Packagee',
            primaryResourceId: '123',
            sourceOriginId: '321',
            packageVersion: '1.0',
            status: 'published'
          }
        ],
        false
      );
      // for latest in lineage check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '654',
            packageVersion: '2.0'
          },
          {
            packageId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      // tx begin
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123',
            resourceType: 'engine'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            status: 'deactivated'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: '321',
            status: 'deactivated',
            name: 'new name'
          },
          {
            ...mockUtil.makeContext(),
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain(
        'Only the status field can be updated on a package that is not the latest version. Please only provide id and status input.'
      );
    });

    it('should update (not upgrade) previous package if only updating status', async () => {
      let res, err;

      // for get package
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Packagee',
            primaryResourceId: '123',
            sourceOriginId: '321',
            packageVersion: '1.0',
            status: 'published'
          }
        ],
        false
      );
      // for latest in lineage check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '654',
            packageVersion: '2.0'
          },
          {
            packageId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            status: 'deactivated'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: '321',
            status: 'deactivated'
          },
          {
            ...mockUtil.makeContext(),
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('321');
      expect(res.status).toEqual('deactivated');
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(0);
    });

    it('should update package', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const newPackageId = uuid.v4();
      const engineBuildId = uuid.v4();
      const engineId = uuid.v4();
      const schemaId = uuid.v4();
      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '1.0',
            autoGenerated: false,
            distributionType: 'public'
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            sourceOriginId,
            packageVersion: '1.0'
          }
        ],
        false
      );

      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: engineId,
            resourceType: 'engine'
          }
        ],
        false
      );

      // validate primary resource
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: engineId
          }
        ],
        false
      );

      // validatePrimaryResourceForLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            sourceOriginId
          }
        ],
        false
      );

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            packageName: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '2.0',
            autoGenerated: false,
            organizationId: 7682,
            distributionType: 'public'
          }
        ],
        false
      );

      // create package resource - packageUpdateResourcesDb
      // engine build
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      //packageUpdateResources -> checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: engineId
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: packageId,
            name: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            organizationId: 7682
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(newPackageId);
      expect(res.name).toEqual('New Test Package - UPDATED');
      expect(res.distributionType).toEqual('public');
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should update (not upgrade) package when type is application and package in draft status', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            primaryResourceId: '567',
            sourceOriginId,
            packageVersion: '1.0.0',
            autoGenerated: false,
            status: 'draft'
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageVersion: '1.0.0'
          }
        ],
        false
      );

      // getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '890',
            resourceType: 'application'
          }
        ],
        false
      );
      // validate package resources
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '890',
            applicationStatus: 'draft'
          }
        ],
        false
      );

      // shouldPackageIncrement -> getApplication
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '890',
            applicationStatus: 'draft'
          }
        ],
        false
      );

      // packageUpdateWithoutIncrement
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: packageId,
            packageId,
            packageName: 'New Test Package - UPDATED',
            organizationId: 7682,
            status: 'draft',
            packageVersion: '1.0.0'
          }
        ],
        false
      );

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // getEngines in processApplicationResources
      serviceContext.dbConnections['core'].write._push([], false);

      // getNodeRedPalettesByApplication in processApplicationResources
      serviceContext.dbConnections['core'].write._push([], false);

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: packageId,
            name: 'New Test Package - UPDATED',
            primaryResourceId: '890',
            organizationId: 7682,
            status: 'draft'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(packageId);
      expect(res.status).toEqual('draft');
      expect(res.version).toEqual('1.0.0');
      expect(res.name).toEqual('New Test Package - UPDATED');
      expect(res.primaryResourceId).toEqual('890');
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(0);
    });

    it('should update (not upgrade) package when only status is being changed', async function () {
      let res, err;

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package',
            sourceOriginId: '321',
            packageVersion: '1.0.0',
            autoGenerated: false,
            status: 'draft'
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageVersion: '1.0.0'
          }
        ],
        false
      );

      // getPackageResources
      serviceContext.dbConnections['core'].write._push([], false);

      // packageUpdateWithoutIncrement
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            packageName: 'New Test Package',
            organizationId: 7682,
            status: 'published',
            packageVersion: '1.0.0'
          }
        ],
        false
      );

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // getEngines in processApplicationResources
      serviceContext.dbConnections['core'].write._push([], false);

      // getNodeRedPalettesByApplication in processApplicationResources
      serviceContext.dbConnections['core'].write._push([], false);

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      const spy = jest.spyOn(
        serviceContext.dal.packages,
        'packageUpdateWithoutIncrement'
      );
      try {
        res = await dal.packageUpdate(
          {
            id: '321',
            status: 'published'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      // audit log should be emitted
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo.actionResult).toEqual('success');
      expect(messages[0].actionInfo.actionName).toEqual('create');
      // expect the original name in case the name was changed
      expect(messages[0].actionInfo.actionDetails).toMatch(/Installed package New Test Package/);
      expect(res.id).toEqual('321');
      expect(res.status).toEqual('published');
      expect(res.version).toEqual('1.0.0');
      expect(res.name).toEqual('New Test Package');
    });

    it('should update (not upgrade) package when package is in draft status', async function () {
      let res, err;

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'Test Package',
            sourceOriginId: '321',
            packageVersion: '1.0.0',
            autoGenerated: false,
            status: 'draft'
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageVersion: '1.0.0'
          }
        ],
        false
      );

      // getPackageResources
      serviceContext.dbConnections['core'].write._push([], false);

      // packageUpdateWithoutIncrement
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '321',
            packageId: '321',
            packageName: 'Updated Package Name',
            status: 'draft',
            organizationId: 7682,
            packageVersion: '1.0.0'
          }
        ],
        false
      );

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // getEngines in processApplicationResources
      serviceContext.dbConnections['core'].write._push([], false);

      // getNodeRedPalettesByApplication in processApplicationResources
      serviceContext.dbConnections['core'].write._push([], false);

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      const spy = jest.spyOn(
        serviceContext.dal.packages,
        'packageUpdateWithoutIncrement'
      );
      try {
        res = await dal.packageUpdate(
          {
            id: '321',
            name: 'Updated Package Name'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('321');
      expect(res.status).toEqual('draft');
      expect(res.version).toEqual('1.0.0');
      expect(res.name).toEqual('Updated Package Name');
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(0);
    });

    it('should throw error when trying to update uneditable fields of an auto generated package', async function () {
      let res, err;

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package',
            primaryResourceId: '567',
            sourceOriginId: '321',
            packageVersion: '1.0',
            autoGenerated: true
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );

      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '567',
            resourceType: 'engine'
          }
        ],
        false
      );

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '432',
            packageName: 'New Test Package - UPDATED',
            primaryResourceId: '567',
            sourceOriginId: '321',
            packageVersion: '2.0',
            autoGenerated: true,
            organizationId: 7682
          }
        ],
        false
      );

      //packageUpdateResources -> checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '432',
            resourceId: '567'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: '321',
            name: 'New Test Package - UPDATED',
            primaryResourceId: '567',
            organizationId: 7682,
            version: '2.1',
            status: 'published' // for audit log expectation
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      // audit log should be emitted
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo.actionResult).toEqual('failure');
      expect(messages[0].actionInfo.actionName).toEqual('create');
      // expect packageName is undefined due to error is thrown before getting package name
      expect(messages[0].actionInfo.actionDetails).toMatch(/Failed to install package undefined/);
    });

    it('should allow updating some fields of an auto generated package', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const newPackageId = uuid.v4();
      const engineBuildId = uuid.v4();
      const engineId = uuid.v4();
      const schemaId = uuid.v4();
      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '1.0',
            autoGenerated: true,
            status: 'published'
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageVersion: '1.0'
          }
        ],
        false
      );

      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: engineId,
            resourceType: 'engine'
          }
        ],
        false
      );

      // validate primary resource
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: engineId
          }
        ],
        false
      );

      // validatePrimaryResourceForLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            sourceOriginId
          }
        ],
        false
      );

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            packageName: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '2.0',
            autoGenerated: true,
            organizationId: 7682,
            status: 'draft'
          }
        ],
        false
      );

      // create package resource - packageUpdateResourcesDb
      // engine build
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      //packageUpdateResources -> checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: engineId
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: packageId,
            name: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            organizationId: 7682,
            status: 'draft'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(newPackageId);
      expect(res.name).toEqual('New Test Package - UPDATED');
      expect(res.status).toEqual('draft');
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should update package with input resources', async function () {
      let res, err;
      const packageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const newPackageId = uuid.v4();
      const engineBuildId = uuid.v4();
      const engineId = uuid.v4();
      const schemaId = uuid.v4();
      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '1.0',
            autoGenerated: false
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageVersion: '1.0'
          }
        ],
        false
      );

      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: engineId,
            resourceType: 'engine'
          }
        ],
        false
      );

      // validate existence of resources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: engineId
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '890',
            application_status: 'active'
          }
        ],
        false
      );

      // validatePrimaryResourceForLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            sourceOriginId
          }
        ],
        false
      );

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            packageName: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '2.0',
            autoGenerated: false,
            organizationId: 7682
          }
        ],
        false
      );

      // engine resources (engine schema)
      serviceContext.dbConnections['core'].read._push(
        [{ engineId }],
        false,
      );

      // create package resource - packageUpdateResourcesDb
      // engine build
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      //packageUpdateResources -> checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: engineId
          }
        ],
        false
      );

      //packageUpdateResources -> checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: '890'
          }
        ],
        false
      );

      // upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: '890'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: packageId,
            name: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            organizationId: 7682,
            status: 'draft',
            resources: [
              {
                resourceId: '890',
                resourceType: 'application',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(newPackageId);
      expect(res.name).toEqual('New Test Package - UPDATED');
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should update package with multiple input resources(add/remove) and primary resource', async function () {
      const packageId = uuid.v4();
      const newPackageId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const engineBuildId = uuid.v4();
      const engineId = uuid.v4();
      const schemaId = uuid.v4();
      let res, err;

      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package',
            primaryResourceId: engineId,
            sourceOriginId,
            packageVersion: '1.0',
            autoGenerated: false
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageVersion: '1.0'
          }
        ],
        false
      );

      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: engineId,
            resourceType: 'engine'
          }
        ],
        false
      );

      // validate existence of resources
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '123',
            application_status: 'active'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: engineId
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '123',
            application_status: 'active'
          }
        ],
        false
      );
      // validatePrimaryResourceForLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            sourceOriginId
          }
        ],
        false
      );

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            packageName: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            packageVersion: '2.0',
            autoGenerated: false,
            organizationId: 7682
          }
        ],
        false
      );

      // engine resources (engine application)
      serviceContext.dbConnections['core'].read._push(
        [{ engineId: schemaId }],
        false,
      );

      // engine resources (engine build)
      serviceContext.dbConnections['core'].read._push(
        [{ id: engineBuildId }],
        false,
      );

      // engine resources (engine build)
      serviceContext.dbConnections['core'].read._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine resources (engine schema)
      serviceContext.dbConnections['core'].read._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine resources (engine schema)
       serviceContext.dbConnections['core'].read._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine resources (node red pallete)
       serviceContext.dbConnections['core'].read._push(
        [{ resourceId: '123', packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // create package resource - packageUpdateResourcesDb
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // application
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: '123', packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: engineId
          }
        ],
        false
      );

      // packageUpdateResources -> checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: newPackageId,
            resourceId: '890'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: newPackageId,
            name: 'New Test Package - UPDATED',
            primaryResourceId: engineId,
            organizationId: 7682,
            status: 'draft',
            resources: [
              {
                resourceId: '890',
                resourceType: 'application',
                action: 'REMOVE'
              },
              {
                resourceId: '123',
                resourceType: 'application',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(newPackageId);
      expect(res.name).toEqual('New Test Package - UPDATED');
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should throw an error when attempting to update a package that was automatically generated', async function () {
      let res, err;

      // for org check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            autoGenerated: true
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: '321',
            name: 'New Test Package - UPDATED',
            primaryResourceId: '123',
            organizationId: 7682
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
    });

    it('should update package with install_date, status and distribution_date', async function () {
      let res, err;
      const packageId = uuid.v4();
      const primaryResourceId = uuid.v4();
      const sourceOriginId = uuid.v4();
      const engineBuildId = uuid.v4();
      const engineId = uuid.v4();
      const schemaId = uuid.v4();
      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Packagee',
            primaryResourceId,
            sourceOriginId,
            packageVersion: '1.0',
            autoGenerated: false
          }
        ],
        false
      );

      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageVersion: '1.0'
          }
        ],
        false
      );

      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: primaryResourceId,
            resourceType: 'engine'
          }
        ],
        false
      );

      // validate resources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: primaryResourceId
          }
        ],
        false
      );

      // validate primary resource
      serviceContext.dbConnections['core'].read._push(
        [
          {
            sourceOriginId
          }
        ],
        false
      );

      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            packageName: 'New Test Package - UPDATED',
            primaryResourceId,
            sourceOriginId,
            packageVersion: '2.0',
            autoGenerated: false,
            organizationId: 7682,
            status: 'pending',
            installDate: '2020-01-01T00:00:00.000Z',
            distributionDate: '2020-01-01T00:00:00.000Z'
          }
        ],
        false
      );

      // create package resource - packageUpdateResourcesDb
      // engine build
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineBuildId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false
      );
      // engine
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );
      // engine schema
       serviceContext.dbConnections['core'].write._push(
        [{ resourceId: schemaId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      // create primary resource - upsertPackagePrimaryResource
      serviceContext.dbConnections['core'].write._push(
        [{ resourceId: engineId, packageId, createdBy: 'system', modifiedBy: 'system' }],
        false,
      );

      //packageUpdateResources -> checkPAckageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId,
            resourceId: primaryResourceId
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdate(
          {
            id: packageId,
            name: 'New Test Package - UPDATED',
            primaryResourceId,
            organizationId: 7682,
            installDate: '2020-01-01T00:00:00.000Z',
            status: 'draft'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.status).toEqual('pending');
      expect(res.installDate).toEqual('2020-01-01T00:00:00.000Z');
      expect(res.distributionDate).toEqual('2020-01-01T00:00:00.000Z');
      expectOnlyEmitPackageCreatedEvent();
    });

    it('should throw an error when trying to publish a package with an inactive resource', async function () {
      let err;
      // checkPackageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );
      // verifyAllowedToEditPackage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package',
            primaryResourceId: '123',
            sourceOriginId: '321',
            packageVersion: '1.0',
            autoGenerated: false
          }
        ],
        false
      );
      // getLatestPackageInLineage
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageVersion: '1.0'
          }
        ],
        false
      );
      // latestPackageResources = getPackageResources
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '123',
            resourceType: 'engine'
          }
        ],
        false
      );
      // validate primary resource
      serviceContext.dbConnections['core'].read._push([], false);
      // doPackageCreate
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '432',
            packageName: 'New Test Package - UPDATED',
            primaryResourceId: '123',
            sourceOriginId: '321',
            packageVersion: '2.0',
            autoGenerated: false,
            organizationId: 7682,
            status: 'published',
            resources: [
              {
                resourceId: '890',
                resourceType: 'application',
                action: 'ADD'
              }
            ]
          }
        ],
        false
      );
      // packageUpdateResources -> checkPAckageWriteAuthorization
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );
      // packageUpdateResources -> packageUpdateResourcesDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '432',
            resourceId: '123'
          }
        ],
        false
      );

      try {
        await dal.packageUpdate(
          {
            id: '321',
            name: 'New Test Package - UPDATED',
            primaryResourceId: '123',
            organizationId: 7682,
            status: 'published',
            resources: [
              {
                resourceId: '890',
                resourceType: 'application',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682],
              organization: {
                organizationId: 7682
              }
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      // audit log should be emitted
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(1);
      expect(messages[0].actionInfo.actionResult).toEqual('failure');
      expect(messages[0].actionInfo.actionName).toEqual('create');
      // expect original name in case the name was changed
      expect(messages[0].actionInfo.actionDetails).toMatch(/Failed to install package New Test Package/);
    });

    describe('engine_build validation', function () {
      let originalGetBuilds, originalGetEngines;

      beforeEach(() => {
        originalGetBuilds = serviceContext.dal.engine.getBuilds;
        originalGetEngines = serviceContext.dal.engine.getEngines;
      });

      afterEach(() => {
        serviceContext.dal.engine.getBuilds = originalGetBuilds;
        serviceContext.dal.engine.getEngines = originalGetEngines;
      });

      it('should validate every engine_build resource against its owning engine when publishing', async function () {
        let err;
        const packageId = uuid.v4();
        const buildIds = [uuid.v4(), uuid.v4(), uuid.v4(), uuid.v4()];
        const engineIdByBuildId = _.fromPairs(
          buildIds.map((buildId) => [buildId, uuid.v4()])
        );
        // every owning engine is active except the one behind the last build
        const inactiveEngineId = engineIdByBuildId[buildIds[3]];

        // checkPackageWriteAuthorization
        serviceContext.dbConnections['core'].write._push(
          [{ organizationId: 7682 }],
          false
        );
        // verifyAllowedToEditPackage
        serviceContext.dbConnections['core'].write._push(
          [
            {
              packageId,
              packageName: 'Redact Engines',
              sourceOriginId: packageId,
              packageVersion: '1.0.0',
              autoGenerated: false,
              status: 'approved'
            }
          ],
          false
        );
        // getLatestPackageInLineage
        serviceContext.dbConnections['core'].write._push(
          [{ packageId, packageVersion: '1.0.0' }],
          false
        );
        // latestPackageResources = getPackageResources
        serviceContext.dbConnections['core'].write._push(
          buildIds.map((buildId) => ({
            resourceId: buildId,
            resourceType: 'engine_build'
          })),
          false
        );

        serviceContext.dal.engine.getBuilds = jest.fn(({ ids }) =>
          Promise.resolve(
            ids.map((id) => ({ id, engineId: engineIdByBuildId[id] }))
          )
        );
        serviceContext.dal.engine.getEngines = jest.fn((context, { ids }) =>
          Promise.resolve({
            count: ids.length,
            records: ids.map((id) => ({
              id,
              name: `engine-${id}`,
              state: id === inactiveEngineId ? 'pending' : 'active'
            }))
          })
        );

        try {
          await dal.packageUpdate(
            {
              id: packageId,
              status: 'published'
            },
            {
              ...mockUtil.makeContext(),
              _authInfo: {
                authorizedOrganizationIds: [7682],
                organization: { organizationId: 7682 }
              }
            }
          );
        } catch (error) {
          err = error;
        }

        // Every engine_build should be resolved to its owning engine before validation,
        // via a single batched getBuilds() lookup rather than one getBuild call per
        // build (getBuilds' own missing-id NotFound behavior is covered by
        // dalEngine.spec.js #getBuilds). Validation should use the owning engine's
        // state rather than the engine_build status.
        expect(serviceContext.dal.engine.getBuilds).toHaveBeenCalledTimes(1);
        expect(serviceContext.dal.engine.getBuilds).toHaveBeenCalledWith(
          { ids: expect.arrayContaining(buildIds) },
          expect.anything()
        );

        expect(err).toBeDefined();
        const inactiveResourceErrors = err.data.inactiveResourceErrors;
        expect(inactiveResourceErrors).toHaveLength(1);
        expect(inactiveResourceErrors[0]).toEqual(
          expect.objectContaining({
            resourceId: inactiveEngineId,
            resourceType: 'engine'
          })
        );
      });

      it('should propagate NotFound when getBuilds cannot resolve an engine_build resource', async function () {
        let err;
        const packageId = uuid.v4();
        const buildIds = [uuid.v4(), uuid.v4()];
        const missingBuildId = buildIds[1];

        // checkPackageWriteAuthorization
        serviceContext.dbConnections['core'].write._push(
          [{ organizationId: 7682 }],
          false
        );
        // verifyAllowedToEditPackage
        serviceContext.dbConnections['core'].write._push(
          [
            {
              packageId,
              packageName: 'Redact Engines',
              sourceOriginId: packageId,
              packageVersion: '1.0.0',
              autoGenerated: false,
              status: 'approved'
            }
          ],
          false
        );
        // getLatestPackageInLineage
        serviceContext.dbConnections['core'].write._push(
          [{ packageId, packageVersion: '1.0.0' }],
          false
        );
        // latestPackageResources = getPackageResources
        serviceContext.dbConnections['core'].write._push(
          buildIds.map((buildId) => ({
            resourceId: buildId,
            resourceType: 'engine_build'
          })),
          false
        );

        // getBuilds' own missing-id NotFound behavior is unit-tested directly in
        // dalEngine.spec.js #getBuilds; here we only confirm packageUpdate propagates it.
        serviceContext.dal.engine.getBuilds = jest.fn(() =>
          Promise.reject(
            new errors.NotFound({
              data: { objectId: missingBuildId, objectType: 'Build' }
            })
          )
        );

        try {
          await dal.packageUpdate(
            {
              id: packageId,
              status: 'published'
            },
            {
              ...mockUtil.makeContext(),
              _authInfo: {
                authorizedOrganizationIds: [7682],
                organization: { organizationId: 7682 }
              }
            }
          );
        } catch (error) {
          err = error;
        }

        expect(err).toBeDefined();
        expect(err.data).toEqual(
          expect.objectContaining({ objectId: missingBuildId, objectType: 'Build' })
        );
      });
    });
  });

  describe('#packageDelete', function () {
    it('should throw error if no package id provided', async () => {
      let res, err;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'New Test Package - UPDATED'
          }
        ],
        false
      );

      try {
        res = await dal.packageDelete(
          {
            name: 'New Test Package - UPDATED'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toEqual('Package Id is a required input');
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionResult: 'failure',
          actionName: 'delete',
          actionDetails: 'Failed to delete package undefined',
          targetId: ''
        })
      );
    });

    it('should delete package', async function () {
      let res, err;

      // for org check
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([
        {
          packageId: '321',
          packageName: 'package_name'
        }
      ]);

      try {
        res = await dal.packageDelete(
          {
            id: '321'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.success).toEqual(true);
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].packageId).toEqual('321');
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionResult: 'success',
          actionName: 'delete',
          actionDetails: 'Deleted package package_name',
          targetId: '321'
        })
      );
    });

    it('should throw error if package id provided is invalid', async () => {
      let res, err;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'Package to test',
            organizationId: 7682
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.packageDelete(
          {
            id: '321'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.toString()).toEqual(
        'internal_error: Package deletion was not successful, check package id and try again'
      );
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const event = serviceContext.messageUtil._messages()[0];
      expect(event.actionInfo.actionName).toEqual('delete');
      expect(event.actionInfo.actionResult).toEqual('failure');
      expect(event.actionInfo.actionDetails).toEqual('Failed to delete package undefined');
      expect(event.actionInfo.targetId).toEqual('321');
      expect(event.packageId).toEqual('321');
    });

    it('should throw error if package id provided not exists', async () => {
      let res, err;
      serviceContext.dbConnections['core'].write._push([]);
      try {
        res = await dal.packageDelete(
          {
            id: '321'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toEqual('No Package was found with ID 321');
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const event = serviceContext.messageUtil._messages()[0];
      expect(event.actionInfo.actionName).toEqual('delete');
      expect(event.actionInfo.actionResult).toEqual('failure');
      expect(event.actionInfo.actionDetails).toEqual('Failed to delete package undefined');
      expect(event.actionInfo.targetId).toEqual('321');
      expect(event.packageId).toEqual('321');
    });

    it('should throw error if user is not authorized to make changes to that package', async () => {
      let res, err;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageName: 'Package to test',
            organizationId: 999
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.packageDelete(
          {
            id: '321'
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toEqual(
        'Not Authorized to make changes to that package.'
      );
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const event = serviceContext.messageUtil._messages()[0];
      expect(event.actionInfo.actionName).toEqual('delete');
      expect(event.actionInfo.actionResult).toEqual('failure');
      expect(event.actionInfo.actionDetails).toEqual('Failed to delete package undefined');
      expect(event.actionInfo.targetId).toEqual('321');
      expect(event.packageId).toEqual('321');
    });
  });

  describe('#packageUpdateResources', function () {
    it('should throw error if no package id provided', async () => {
      let res, err;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '321',
            packageResources: [
              {
                resourceType: 'engine',
                resourceId: 'resourceID',
                action: 'ADD'
              }
            ]
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdateResources(
          {
            packageResources: [
              {
                resourceType: 'engine',
                resourceId: 'resourceID',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('#_validatePackageGrantsAccess', function () {
    describe('#_checkPackageGrantAuthorization', function () {
      let _context, packageId;
      beforeEach(() => {
        _context = mockUtil.makeContext();
      });

      it('should return TRUE if there is a superadmin', async () => {
        _context = {
          ..._context,
          _authInfo: {
            authorizedOrganizationIds: [7682],
            organization: {
              organizationId: 7682
            },
            tokenId: '513e96ec-ceb3-4349-b56d-4ea9c035a37c',
            applicationId: 'dde169f4-553a-4261-b18e-9acc85f4f900',
            json: {
              rights: ['superadmin']
            }
          }
        };

        const result = await dal._checkPackageGrantAuthorization(
          _context,
          packageId
        );

        expect(result).toBeDefined();
        expect(result).toEqual(true);
      });

      it('should return FALSE if there is an org admin and does not have access to the org', async () => {
        _context = {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [2222],
            organization: {
              organizationId: 1111
            },
            tokenId: '513e96ec-ceb3-4349-b56d-4ea9c035a37c',
            applicationId: 'dde169f4-553a-4261-b18e-9acc85f4f900',
            json: {
              rights: ['admin.org.admin']
            }
          }
        };

        // getPackageOrgId: get orgId by packageId
        serviceContext.dbConnections['core'].read._push(
          [
            {
              organizationId: 7682
            }
          ],
          false
        );

        const result = await dal._checkPackageGrantAuthorization(
          _context,
          packageId
        );

        expect(result).toBeDefined();
        expect(result).toEqual(false);
      });

      it('should return TRUE if there is an org admin and have access to the org', async () => {
        _context = {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [1111, 7682],
            organization: {
              organizationId: 7682
            },
            permissionMasks: [8188] // permissions for Admin role
          }
        };

        // getPackageOrgId: get orgId by packageId
        serviceContext.dbConnections['core'].read._push(
          [
            {
              organizationId: 7682
            }
          ],
          false
        );

        const result = await dal._checkPackageGrantAuthorization(
          _context,
          packageId
        );

        expect(result).toBeDefined();
        expect(result).toEqual(true);
      });
    });
  });

  describe('#_validateInputPackageUpdateGrants', function () {
    it('should throw error if no package id provided', async () => {
      let res, err;
      try {
        res = await dal._validateInputPackageUpdateGrants();
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        `packageId is required`
      );
    });

    it('should throw error if packageGrants is not passed in', async () => {
      let res, err;
      try {
        res = await dal._validateInputPackageUpdateGrants({
          packageId: 'eddd2397-de01-4e17-bfd6-860869fd67ee'
        });
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        `packageGrants is invalid`
      );
    });

    it('should throw error if packageGrants is not an array', async () => {
      let res, err;
      try {
        res = await dal._validateInputPackageUpdateGrants({
          packageId: 'eddd2397-de01-4e17-bfd6-860869fd67ee',
          packageGrants: 'invalid-value'
        });
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        `packageGrants is invalid`
      );
    });

    it('should throw error if package grant action is invalid', async () => {
      let res, err;
      try {
        res = await dal._validateInputPackageUpdateGrants({
          packageId: 'eddd2397-de01-4e17-bfd6-860869fd67ee',
          packageGrants: [
            {
              organizationId: 45676,
              grantType: 'GRANT-INVALID',
              action: 'ADD-INVALID'
            }
          ]
        });
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        `The package grant action is invalid.`
      );
    });

    it('should throw error if package grant type is invalid', async () => {
      let res, err;
      try {
        res = await dal._validateInputPackageUpdateGrants({
          packageId: 'eddd2397-de01-4e17-bfd6-860869fd67ee',
          packageGrants: [
            {
              organizationId: 45676,
              grantType: 'GRANT-INVALID',
              action: 'ADD'
            }
          ]
        });
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        `The package grant type is invalid.`
      );
    });

    it('the input is valid', async () => {
      let res, err;
      try {
        res = await dal._validateInputPackageUpdateGrants({
          packageId: 'eddd2397-de01-4e17-bfd6-860869fd67ee',
          packageGrants: [
            {
              organizationId: 45676,
              grantType: 'GRANT',
              action: 'ADD'
            },
            {
              organizationId: 45677,
              grantType: 'GRANT',
              action: 'REMOVE'
            }
          ]
        });
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('eddd2397-de01-4e17-bfd6-860869fd67ee');
      expect(res.packageGrants).toEqual([
        {
          organizationId: 45676,
          grantType: 'GRANT',
          action: 'ADD'
        },
        {
          organizationId: 45677,
          grantType: 'GRANT',
          action: 'REMOVE'
        }
      ]);
    });
  });

  describe('#packageUpdateGrants', function () {
    let context;
    let existingDbWrite = {
      task: null
    };
    beforeEach(() => {
      serviceContext.dal.organization.addToEngineWhitelist = jest.fn();
      serviceContext.dal.organization.deleteFromEngineWhitelist = jest.fn();
      serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();
      serviceContext.dal.organization.addToEngineWhitelist.mockReturnValue({});
      serviceContext.dal.organization.deleteFromEngineWhitelist.mockReturnValue(
        {}
      );
      serviceContext.coreAdmin.addApplicationsForOrganization.mockResolvedValue(
        {}
      );

      context = {
        ...mockUtil.makeContext(),
        _authInfo: {
          authorizedOrganizationIds: [7682],
          organization: {
            organizationId: 7682
          },
          permissionMasks: [8188] // permissions for Admin role
        }
      };
      existingDbWrite = {
        task: null
      };
    });

    it('should throw error if no package id provided', async () => {
      let res, err;

      try {
        res = await dal.packageUpdateGrants(
          {
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              authorizedOrganizationIds: [7682]
            }
          }
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        `packageId is required`
      );
    });

    it('should throw an error if grant action is not passed in', async () => {
      let res, err;

      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT'
                // action: 'ADD'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.data.validationErrors[0].message).toEqual(
        'packageGrants is invalid: missing organizationId or grantType or action'
      );
    });

    it('should throw an error if the package is inaccessible', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for get packages
      serviceContext.dbConnections['core'].read._push([], false);
      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(err.message).toEqual('Not Authorized to grant package access.');
    });

    it('should throw an error if caller org is different and the grant type is not VIEW', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for get packages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682'
          }
        ],
        false
      );
      // for get package org
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: '7682'
          }
        ],
        false
      );
      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 17682,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionResult: 'failure',
          actionName: 'update'
        })
      );
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(err.message).toEqual(
        'Not Authorized to grant package access for the specified organization.'
      );
    });

    it('should add package grant and all its engines to whiteList for an organizationId when grandType and actions', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // for getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources - engine resources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '46167',
            packageId: '321',
            resourceType: 'engine',
            resourceId: 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46168',
            packageId: '321',
            resourceType: 'engine',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46169',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resourceType: 'engine',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          }
        ],
        false
      );
      // Resource: Applications
      // getPackageResources - application resources: No applications
      // serviceContext.dbConnections['core'].read._push([], false);
      // _packageUpdateGrantsResources --> addApplicationsForOrganization
      // serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();

      // _packageUpdateGrantDbMulti
      existingDbWrite.task = jest.fn();
      existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getPackageGrantsByOrgId') {
          return Promise.resolve([
            // If no data found --> add the grant.
            // If not, ignore the grant because it already exists
            // {
            //   packageId: '1',
            //   organizationId: '7682',
            //   grantType: 'GRANT'
            // }
          ]);
        } else if (name === 'getPackages') {
          // getPackageGrants >> getPackageOwnerOrganizationId
          return Promise.resolve([
            {
              packageId: '00000001-12b3-4702-9d8b-d002477f499e',
              organizationId: '7682',
              packageName: 'Test1 package name'
            }
          ]);
        }

        // packageUpdateGrants: returns package info
        return Promise.resolve({
          packageId: '00000001-12b3-4702-9d8b-d002477f499e',
          organizationId: '7682',
          packageName: 'Test1 package name'
        });
      });

      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          },
          context,
          existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
    });

    it('should add package grant and remove engines from whiteList for an organizationId when grandType=VIEW and actions=ADD', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // for getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources - engine resources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '46167',
            packageId: '321',
            resourceType: 'engine',
            resourceId: 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46168',
            packageId: '321',
            resourceType: 'engine',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46169',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resourceType: 'engine',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          }
        ],
        false
      );
      // Resource: Applications
      // getPackageResources - application resources: No applications
      // serviceContext.dbConnections['core'].read._push([], false);
      // _packageUpdateGrantsResources --> addApplicationsForOrganization
      // serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();

      // _packageUpdateGrantDbMulti
      existingDbWrite.task = jest.fn();
      existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getPackageGrantsByOrgId') {
          return Promise.resolve([
            // If no data found --> add the grant.
            // If not, ignore the grant because it already exists
            // {
            //   packageId: '1',
            //   organizationId: '7682',
            //   grantType: 'GRANT'
            // }
          ]);
        }

        if (name === 'getPackages') {
          // getPackageGrants >> getPackageOwnerOrganizationId
          return Promise.resolve([
            {
              packageId: '00000001-12b3-4702-9d8b-d002477f499e',
              organizationId: '7682',
              packageName: 'Test1 package name'
            }
          ]);
        }

        // packageUpdateGrants: returns package info
        if (name === 'packageUpdateGrants') {
          return Promise.resolve({
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          });
        }
      });

      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          },
          context,
          existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
    });

    it('No transaction: should add package grant and remove engines from whiteList for an organizationId when grandType=VIEW and actions=ADD', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // for getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources - engine resources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '46167',
            packageId: '1',
            resourceType: 'engine',
            resourceId: 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46168',
            packageId: '321',
            resourceType: 'engine',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46169',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resourceType: 'engine',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          }
        ],
        false
      );
      // getPackageResources - application resources - No application resources
      // serviceContext.dbConnections['core'].read._push([], false);

      // 1. Update package grants in DB: check grant type and update new data to DB
      // getPackageGrantsByOrgId
      //    for packageId: 00000001-12b3-4702-9d8b-d002477f499e
      //    for 1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682,
            grantType: 'GRANT'
          },
          {
            packageId: '1',
            organizationId: 7682,
            grantType: 'GRANT'
          }
        ],
        false
      );

      // packageUpdateGrantDb
      // for packageId: '00000001-12b3-4702-9d8b-d002477f499e' and packageId: 1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          },
          {
            packageId: '1',
            organizationId: 7682
          }
        ],
        false
      );

      // 2. _checkResourcesToAddOrRemoveFromOrg
      // _getResourcesForPackageGrantRemove
      //   --> getAccessiblePackageResources
      //     --> _getSolelyOwnedResources
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dal.engine.getEngines = jest.fn();
      serviceContext.dal.engine.getEngines.mockImplementationOnce(() => {
        return Promise.resolve({ records: [] });
      });

      // 3. _packageUpdateGrantsResources
      //    --> dal.organization.deleteFromEngineWhitelist
      serviceContext.dal.organization.deleteFromEngineWhitelist.mockImplementation(
        (context, args) => {
          expect(args.toDelete.engineIds).toEqual(
            expect.arrayContaining([
              'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb',
              'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
            ])
          );
          return Promise.resolve();
        }
      );

      // 4. emit Events
      //  --> emitPublicPackageGrantEvent
      // emitPublicPackageGrantEvent for input packageId - getOrganization
      //      --> organizationName
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return Promise.resolve({
          organizationId: 7682,
          organizationName: 'Test Org'
        });
      });
      //      --> package name: getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );

      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValueOnce(
        'org-guid'
      );
      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValueOnce({
        id: 'user-id'
      });

      // 5. Final: getPackages to return
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );
      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
      expect(
        serviceContext.dal.organization.deleteFromEngineWhitelist
      ).toHaveBeenCalled();
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionResult: 'success',
          actionName: 'update'
        })
      );
      expect(messages[0].token).toBeDefined();
    });

    it('should add package grant and all its applications to organizationId when grandType and actions', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // for getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources - engine, application resources:
      // in this case - No engines
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '46167',
            packageId: '1',
            resourceType: 'application',
            resourceId: 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46168',
            packageId: '321',
            resourceType: 'application',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46169',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resourceType: 'application',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          }
        ],
        false
      );

      // 1. Update package grants in DB: check grant type and update new data to DB
      // getPackageGrantsByOrgId
      //    for packageId: 00000001-12b3-4702-9d8b-d002477f499e
      //    for 1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682,
            grantType: 'VIEW'
          },
          {
            packageId: '1',
            organizationId: 7682,
            grantType: 'VIEW'
          }
        ],
        false
      );

      // packageUpdateGrantDb
      // for packageId: '00000001-12b3-4702-9d8b-d002477f499e' and packageId: 1
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          },
          {
            packageId: '1',
            organizationId: 7682
          }
        ],
        false
      );

      // // 2. _checkResourcesToAddOrRemoveFromOrg: No need when grant type GRANT and ADD action
      // // _getResourcesForPackageGrantRemove
      // //   --> getAccessiblePackageResources
      // //     --> _getSolelyOwnedResources
      // serviceContext.dbConnections['core'].read._push([], false);
      // serviceContext.dal.engine.getEngines = jest.fn();
      // serviceContext.dal.engine.getEngines.mockImplementationOnce(() => {
      //   return Promise.resolve({ records: [] });
      // });

      // 3. _packageUpdateGrantsResources
      //    --> addOrRemoveApplications
      //      --> coreAdmin.addApplicationsForOrganization
      //          --> getApplication + _createPermissionSetsAndACEs
      serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();
      serviceContext.coreAdmin.addApplicationsForOrganization.mockImplementation(
        () => Promise.resolve()
      );
      serviceContext.dal.application.getApplication = jest
        .fn()
        .mockResolvedValue({});
      serviceContext.bll.application._createPermissionSetsAndACEs = jest
        .fn()
        .mockResolvedValue({});

      // 4. emit Events
      //  --> emitPublicPackageGrantEvent
      // emitPublicPackageGrantEvent for input packageId - getOrganization
      //      --> organizationName
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return Promise.resolve({
          organizationId: 7682,
          organizationName: 'Test Org'
        });
      });

      //      --> package name: getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );

      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValueOnce(
        'org-guid'
      );
      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValueOnce({
        id: 'user-id'
      });

      // 5. Final: getPackages to return
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );
      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
      expect(serviceContext.messageUtil._counter()).toBe(2);
      expect(
        serviceContext.coreAdmin.addApplicationsForOrganization
      ).toHaveBeenCalledTimes(1);
    });

    it('should remove package grant', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // for getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources - engine, application resources:
      // in this case - No engines
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '46167',
            packageId: '1',
            resourceType: 'application',
            resourceId: 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46169',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resourceType: 'application',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          }
        ],
        false
      );

      // 1. Update package grants in DB: check grant type and update new data to DB
      // getPackageGrantsByOrgId
      //    for packageId: 00000001-12b3-4702-9d8b-d002477f499e
      //    for 1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682,
            grantType: 'GRANT'
          },
          {
            packageId: '1',
            organizationId: 7682,
            grantType: 'GRANT'
          }
        ],
        false
      );

      // packageUpdateGrantDb
      // for packageId: '00000001-12b3-4702-9d8b-d002477f499e' and packageId: 1
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          },
          {
            packageId: '1',
            organizationId: 7682
          }
        ],
        false
      );

      // 2. _checkResourcesToAddOrRemoveFromOrg: Applications - Engines
      // _getResourcesForPackageGrantRemove
      //   --> getAccessiblePackageResources
      //     --> _getSolelyOwnedResources
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dal.application.getApplications = jest.fn();
      serviceContext.dal.application.getApplications.mockImplementationOnce(
        () => {
          return Promise.resolve({ records: [] });
        }
      );

      // 3. _packageUpdateGrantsResources
      //    --> addOrRemoveApplications --> serviceContext.coreAdmin.removeApplicationsForOrganization
      serviceContext.coreAdmin.removeApplicationsForOrganization = jest.fn();
      serviceContext.coreAdmin.removeApplicationsForOrganization.mockImplementation(
        () => Promise.resolve()
      );

      // 4. emit Events
      //  --> emitPublicPackageGrantEvent
      // emitPublicPackageGrantEvent for input packageId - getOrganization
      //      --> organizationName
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return Promise.resolve({
          organizationId: 7682,
          organizationName: 'Test Org'
        });
      });

      //      --> package name: getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );

      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValueOnce(
        'org-guid'
      );
      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValueOnce({
        id: 'user-id'
      });

      // 5. Final: getPackages to return
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );
      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT',
                action: 'REMOVE'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].type).toEqual('events_internal');
      expect(messages[0].event).toEqual('trigger_cache_update');
      expect(messages[1].actionInfo).toEqual(expect.any(Object));
      const msgEvents = messages.map((o) => o.event);
      expect(msgEvents.sort()).toEqual(['trigger_cache_update'].sort());
    });

    it('should skip the grant operation, if the package has already been granted', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      // for getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources - engine, application resources:
      // in this case - No engines
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '46167',
            packageId: '1',
            resourceType: 'application',
            resourceId: 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb'
          },
          {
            id: '46169',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resourceType: 'application',
            resourceId: 'dddddddd-f9cf-4f81-8491-abdc0f8a84bb'
          }
        ],
        false
      );

      // 1. Update package grants in DB: check grant type and update new data to DB
      // getPackageGrantsByOrgId
      //    for packageId: 00000001-12b3-4702-9d8b-d002477f499e
      //    for 1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682,
            grantType: 'GRANT'
          },
          {
            packageId: '1',
            organizationId: 7682,
            grantType: 'GRANT'
          }
        ],
        false
      );

      // 1. _packageUpdateGrantDbMulti
      // Ignores steps: 2, 3, 4
      // 2. _checkResourcesToAddOrRemoveFromOrg
      // 3. _packageUpdateGrantsResources
      // 4. emit Events

      // 5. Final: getPackages to return
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );
      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
      expect(serviceContext.messageUtil._counter()).toBe(0);
    });

    xit('should skip removing the grant for a package, if another package that has been granted also includes it', async () => {
      let res, err;

      // getNestedResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            resource_type: 'package',
            date_created: new Date().toISOString(),
            date_modified: new Date().toISOString(),
            created_by: 'system',
            modified_by: 'system',
            resource_alias: 'alias1',
            visitedPackageNames: ['Parent']
          }
        ],
        false
      );

      // for org check
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for org check for nested package
      serviceContext.dbConnections['core'].read._push(
        [
          {
            organizationId: 7682
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // getPackageResources
      serviceContext.dbConnections['core'].read._push([], false);
      // getPackageResources - application resources
      serviceContext.dbConnections['core'].read._push([], false);

      // for packageId: 00000001-12b3-4702-9d8b-d002477f499e
      // verify package access has parent grant - getAccessiblePackageResources
      serviceContext.dbConnections['core'].read._push([], false);

      // packageUpdateGrantDb
      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: 7682
          }
        ],
        false
      );

      // for nested packageId: 1
      // verify package access has parent grant - getAccessiblePackageResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '1',
            packageCount: '2'
          }
        ],
        false
      );

      // emitPublicPackageGrantEvent - getOrganization
      serviceContext.dbConnections['media_platform'].read._push([{}]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682, organization_name: 'Test Org' }
      ]);

      // emitPublicPackageGrantEvent - getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );
      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValueOnce({
        id: 'user-id'
      });
      // emitPublicPackageGrantEvent - _createJWTTokenByDefaultPermissions
      serviceContext.dal.application.getAppIdFromOrgId.mockReturnValueOnce(
        'org-guid'
      );

      // getPackages
      serviceContext.dbConnections['core'].read._push(
        [
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            organizationId: '7682',
            packageName: 'Test1 package name'
          }
        ],
        false
      );

      try {
        res = await dal.packageUpdateGrants(
          {
            packageId: '00000001-12b3-4702-9d8b-d002477f499e',
            packageGrants: [
              {
                organizationId: 7682,
                grantType: 'GRANT',
                action: 'REMOVE'
              }
            ]
          },
          context
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.packageId).toEqual('00000001-12b3-4702-9d8b-d002477f499e');
      expect(res.organizationId).toEqual('7682');
      expect(res.packageName).toEqual('Test1 package name');
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].event).toEqual('PackageGrantRemoved');
      expect(messages[0].token).toBeDefined();
    });
  });

  describe('#getPackageResourceUsage', function () {
    let args;
    beforeEach(() => {
      args = {
        context: null,
        resourceIds: [],
        packageNotInIds: [],
        organizationId: null
      };
    });

    it('invalid_input: missing organizationId', async () => {
      args.organizationId = null;
      let err;

      try {
        await dal.getPackageResourceUsage(
          args.context,
          args.organizationId,
          args.resourceIds,
          args.packageNotInIds
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.message).toEqual(
        'The organizationId is required to get package resource usage.'
      );
    });

    it('invalid_input: invalid organizationId', async () => {
      args.organizationId = 'invalid_orgId';
      let err;

      try {
        await dal.getPackageResourceUsage(
          args.context,
          args.organizationId,
          args.resourceIds,
          args.packageNotInIds
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(err.message).toEqual('The organizationId must be a number.');
    });

    it('should query data from DB', async () => {
      args.organizationId = 7682;
      args.engineIds = [
        '271413a3-1b1f-458b-9f69-e79d6ac22c91',
        '6db02faa-3605-4fd7-8bdc-8a60332ab194'
      ];
      args.packageNotInIds = ['39486599-2979-4dbf-b9a2-ed22df1343e4'];
      let err;

      // Get engine usage
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            packageCount: 0
          },
          {
            resourceId: '6db02faa-3605-4fd7-8bdc-8a60332ab194',
            packageCount: 0
          }
        ],
        false
      );

      try {
        await dal.getPackageResourceUsage(
          args.context,
          args.organizationId,
          args.resourceIds,
          args.packageNotInIds
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#_packageUpdateGrantDbMulti', function () {
    let args = {
      context: null,
      packageIds: [],
      packageGrant: {
        organizationId: null,
        grantType: null,
        action: null
      },
      existingDbWrite: {
        task: null
      }
    };
    beforeEach(() => {
      args = {
        context: mockUtil.makeContext(),
        packageIds: [],
        packageGrant: null,
        existingDbWrite: {
          task: null
        }
      };
    });

    it('missing input', async () => {
      let err;

      try {
        await dal._packageUpdateGrantDbMulti();
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`packageIds and packageGrant are required`);
    });

    it('invalid input: packageIds is empty', async () => {
      let err;
      args.packageIds = [];
      args.packageGrant = {};
      try {
        await dal._packageUpdateGrantDbMulti(
          args.context,
          args.packageIds,
          args.packageGrant,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`packageIds should not be empty`);
    });

    it('invalid input: packageGrant is invalid', async () => {
      let err;
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {};
      try {
        await dal._packageUpdateGrantDbMulti(
          args.context,
          args.packageIds,
          args.packageGrant,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`packageGrant is invalid`);
    });
    it('Should do packageUpdateGrants for a package', async () => {
      let err;
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'ADD'
      };
      // packageUpdateGrantDb
      args.existingDbWrite.task = jest.fn();
      args.existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getPackageGrantsByOrgId') {
          return Promise.resolve([
            // If no data found --> add the grant.
            // If not, ignore the grant because it already exists
            // {
            //   packageId: '1',
            //   organizationId: '7682',
            //   grantType: 'GRANT'
            // }
          ]);
        }

        if (name === 'getPackages') {
          // getPackageGrants >> getPackageOwnerOrganizationId
          return Promise.resolve([
            {
              packageId: '1',
              organizationId: '7682',
              packageName: 'Test1 package name'
            }
          ]);
        }

        if (name === 'packageUpdateGrantsDb') {
          // addOrUpdateGrandPromises >> packageUpdateGrantsDb
          return Promise.resolve([]);
        }

        return null;
      });

      try {
        await dal._packageUpdateGrantDbMulti(
          args.context,
          args.packageIds,
          args.packageGrant,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(args.existingDbWrite.task).toHaveBeenCalledTimes(2);
    });

    it('Should do packageUpdateGrants for some packages', async () => {
      let err;
      args.packageIds = [
        'e786d76a-0d8b-4db2-a3ac-a1febea45496',
        '629c57ad-0638-4f2e-8d56-bd4835257d65'
      ];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'ADD'
      };
      // packageUpdateGrantDb
      args.existingDbWrite.task = jest.fn();
      args.existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getPackageGrantsByOrgId') {
          return Promise.resolve([
            // If no data found --> add the grant.
            // If not, ignore the grant because it already exists
            // {
            //   packageId: '1',
            //   organizationId: '7682',
            //   grantType: 'GRANT'
            // }
          ]);
        }

        if (name === 'getPackages') {
          // getPackageGrants >> getPackageOwnerOrganizationId
          return Promise.resolve([
            {
              packageId: '1',
              organizationId: '7682',
              packageName: 'Test1 package name'
            }
          ]);
        }

        if (name === 'packageUpdateGrantsDb') {
          // addOrUpdateGrandPromises >> packageUpdateGrantsDb
          return Promise.resolve([]);
        }

        return null;
      });

      try {
        await dal._packageUpdateGrantDbMulti(
          args.context,
          args.packageIds,
          args.packageGrant,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(args.existingDbWrite.task).toHaveBeenCalledTimes(2);
    });

    it('Package Ids are changed due to invalid data or no change in the grant type/ action', async () => {
      let err;
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'REMOVE'
      };
      // packageUpdateGrantDb
      args.existingDbWrite.task = jest.fn();
      args.existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getPackageGrantsByOrgId') {
          return Promise.resolve([
            // If no data found --> add the grant.
            // If not, ignore the grant because it already exists
            // {
            //   packageId: '1',
            //   organizationId: '7682',
            //   grantType: 'GRANT'
            // }
          ]);
        } else if (name === 'getPackages') {
          // getPackageGrants >> getPackageOwnerOrganizationId
          return Promise.resolve([
            {
              packageId: '1',
              organizationId: '7682',
              packageName: 'Test1 package name'
            }
          ]);
        }

        return [];
      });

      let result;
      try {
        result = await dal._packageUpdateGrantDbMulti(
          args.context,
          args.packageIds,
          args.packageGrant,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(args.existingDbWrite.task).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.packageIds).toBeDefined();
      expect(result.packageIds.length).toEqual(0);
    });

    it('Package Ids are not changed due to the new package grant', async () => {
      let err;
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'ADD'
      };
      // packageUpdateGrantDb
      args.existingDbWrite.task = jest.fn();
      args.existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getPackageGrantsByOrgId') {
          return Promise.resolve([
            // If no data found --> add the grant.
            // If not, ignore the grant because it already exists
            // {
            //   packageId: '1',
            //   organizationId: '7682',
            //   grantType: 'GRANT'
            // }
          ]);
        }

        if (name === 'getPackages') {
          // getPackageGrants >> getPackageOwnerOrganizationId
          return Promise.resolve([
            {
              packageId: '1',
              organizationId: '7682',
              packageName: 'Test1 package name'
            }
          ]);
        }

        if (name === 'packageUpdateGrantsDb') {
          // addOrUpdateGrandPromises >> packageUpdateGrantsDb
          return Promise.resolve([]);
        }

        return null;
      });

      let result;
      try {
        result = await dal._packageUpdateGrantDbMulti(
          args.context,
          args.packageIds,
          args.packageGrant,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(args.existingDbWrite.task).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result.packageIds).toBeDefined();
      expect(result.packageIds.length).toEqual(1);
    });
  });

  describe('#_checkResourcesToAddOrRemoveFromOrg', function () {
    let args = {
      context: null,
      packageId: null,
      packageIds: [],
      packageGrant: {
        organizationId: null,
        grantType: null,
        action: null
      },
      engineIds: [],
      applicationIds: [],
      appIdsGroupByPackage: [],
      promisesRef: [],
      existingDbWrite: {
        task: null
      }
    };
    beforeEach(() => {
      args = {
        context: mockUtil.makeContext(),
        packageId: null,
        packageIds: [],
        packageGrant: {
          organizationId: null,
          grantType: null,
          action: null
        },
        engineIds: [],
        applicationIds: [],
        appIdsGroupByPackage: [],
        promisesRef: [],
        existingDbWrite: {
          task: null
        }
      };
    });

    it('missing input: package Id', async () => {
      let err;

      try {
        await dal._checkResourcesToAddOrRemoveFromOrg();
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`missing package id`);
    });

    it('invalid input: packageGrant is not passed in', async () => {
      let err;
      args.packageId = '0d9a598c-62b2-45a7-b4eb-3721277f6024';
      args.packageGrant = null;
      try {
        await dal._checkResourcesToAddOrRemoveFromOrg(args.context, args);
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`missing packageGrant`);
    });

    it('invalid input: packageGrant is invalid', async () => {
      let err;
      args.packageId = 'e786d76a-0d8b-4db2-a3ac-a1febea45496';
      args.packageGrant = {};
      try {
        await dal._checkResourcesToAddOrRemoveFromOrg(args.context, args);
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`packageGrant is invalid`);
    });

    it('packageIds is not passed in: Should return null and do nothing', async () => {
      let err, result;
      args.packageId = 'e786d76a-0d8b-4db2-a3ac-a1febea45496';
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'ADD'
      };
      args.packageIds = [];
      try {
        result = await dal._checkResourcesToAddOrRemoveFromOrg(
          args.context,
          args
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(result).toBeNull();
    });

    it('Grant type = GRANT, action: ADD', async () => {
      let err, result;
      args.packageId = 'e786d76a-0d8b-4db2-a3ac-a1febea45496';
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'ADD'
      };
      args.engineIds = [
        '5d125f72-93a3-41aa-8199-9e82404c6627',
        '8f59f5c3-c14c-4d6c-9c92-c095a9545898'
      ];
      args.applicationIds = ['1a973c69-81c7-4e25-8d94-ceea4e4da7e3'];
      args.appIdsGroupByPackage = {
        'e786d76a-0d8b-4db2-a3ac-a1febea45496': [
          '1a973c69-81c7-4e25-8d94-ceea4e4da7e3'
        ]
      };

      try {
        result = await dal._checkResourcesToAddOrRemoveFromOrg(
          args.context,
          args
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(result).toEqual({
        orgId: 123,
        engine: {
          add: [
            '5d125f72-93a3-41aa-8199-9e82404c6627',
            '8f59f5c3-c14c-4d6c-9c92-c095a9545898'
          ],
          remove: []
        },
        application: {
          add: ['1a973c69-81c7-4e25-8d94-ceea4e4da7e3'],
          remove: []
        },
        library: {
          add: [],
          remove: []
        }
      });
      expect(args.promisesRef.length).toEqual(2);
    });

    it('Grant type = GRANT, action: REMOVE', async () => {
      let err, result;
      args.packageId = 'e786d76a-0d8b-4db2-a3ac-a1febea45496';
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'REMOVE'
      };
      args.engineIds = [
        '5d125f72-93a3-41aa-8199-9e82404c6627',
        '8f59f5c3-c14c-4d6c-9c92-c095a9545898'
      ];

      // _getSolelyOwnedResources --> getAccessiblePackageResources
      args.existingDbWrite.task = jest.fn();
      serviceContext.dal.engine.getEngines = jest.fn();
      serviceContext.dal.engine.getEngines.mockResolvedValue({
        records: []
      });
      args.existingDbWrite.task.mockImplementation((name, cb) => {
        if (name === 'getAccessiblePackageResources') {
          return Promise.resolve([
            {
              resourceId: '5d125f72-93a3-41aa-8199-9e82404c6627',
              resourceType: 'engine'
            }
          ]);
        }
      });

      try {
        result = await dal._checkResourcesToAddOrRemoveFromOrg(
          args.context,
          args
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(result).toEqual({
        orgId: 123,
        engine: {
          add: [],
          remove: ['8f59f5c3-c14c-4d6c-9c92-c095a9545898']
        },
        application: {
          add: [],
          remove: []
        },
        library: {
          add: [],
          remove: []
        }
      });
      expect(args.promisesRef.length).toEqual(1);
      expect(args.existingDbWrite.task).toHaveBeenCalledTimes(1);
      expect(serviceContext.dal.engine.getEngines).toHaveBeenCalledTimes(1);
    });

    it('Grant type = GRANT, action: ADD — libraries flow into library.add', async () => {
      let err, result;
      args.packageId = 'e786d76a-0d8b-4db2-a3ac-a1febea45496';
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'ADD'
      };
      args.libraryIds = [
        'aa11f72e-93a3-41aa-8199-9e82404c6627',
        'bb22f5c3-c14c-4d6c-9c92-c095a9545898'
      ];

      try {
        result = await dal._checkResourcesToAddOrRemoveFromOrg(
          args.context,
          args
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(result.library).toEqual({
        add: [
          'aa11f72e-93a3-41aa-8199-9e82404c6627',
          'bb22f5c3-c14c-4d6c-9c92-c095a9545898'
        ],
        remove: []
      });
    });

    it('Grant type = GRANT, action: REMOVE — solely-owned libraries flow into library.remove', async () => {
      let err, result;
      args.packageId = 'e786d76a-0d8b-4db2-a3ac-a1febea45496';
      args.packageIds = ['e786d76a-0d8b-4db2-a3ac-a1febea45496'];
      args.packageGrant = {
        organizationId: 123,
        grantType: 'GRANT',
        action: 'REMOVE'
      };
      args.libraryIds = [
        'aa11f72e-93a3-41aa-8199-9e82404c6627',
        'bb22f5c3-c14c-4d6c-9c92-c095a9545898'
      ];

      args.existingDbWrite.task = jest.fn();
      serviceContext.dal.engine.getEngines = jest
        .fn()
        .mockResolvedValue({ records: [] });
      // library 'aa11...' is still granted by another package (solely-owned excludes it),
      // so only 'bb22...' should be revoked.
      args.existingDbWrite.task.mockImplementation((name) => {
        if (name === 'getAccessiblePackageResources') {
          return Promise.resolve([
            {
              resourceId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
              resourceType: 'library'
            }
          ]);
        }
      });

      try {
        result = await dal._checkResourcesToAddOrRemoveFromOrg(
          args.context,
          args
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(result.library).toEqual({
        add: [],
        remove: ['bb22f5c3-c14c-4d6c-9c92-c095a9545898']
      });
    });
  });

  describe('#_packageUpdateGrantsResources', function () {
    let args = {
      context: null,
      resources: null,
      eventPromises: null,
      existingDbWrite: {
        task: null
      }
    };
    beforeEach(() => {
      args = {
        context: mockUtil.makeContext(),
        resources: null,
        existingDbWrite: {
          task: null
        }
      };

      serviceContext.dal.organization.deleteFromEngineWhitelist = jest.fn();
      serviceContext.dal.organization.addToEngineWhitelist = jest.fn();
    });

    it('missing input', async () => {
      let err;

      try {
        await dal._packageUpdateGrantsResources();
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
    });

    it('invalid input: orgId is required', async () => {
      let err;
      args.resources = [
        {
          orgId: null,
          engine: {},
          application: {}
        }
      ];
      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`orgId is required`);
    });

    it('calling addToEngineWhitelist, no app changes', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {
            add: [
              '1a973c69-81c7-4e25-8d94-ceea4e4da7e3',
              '5757eee0-42a5-4711-b12d-f78c57b613d9'
            ]
          },
          application: {}
        }
      ];
      serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();
      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.coreAdmin.addApplicationsForOrganization
      ).toHaveBeenCalledTimes(0);
    });

    it('calling addToEngineWhitelist and addApplicationsForOrganization', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {
            add: [
              '1a973c69-81c7-4e25-8d94-ceea4e4da7e3',
              '5757eee0-42a5-4711-b12d-f78c57b613d9'
            ]
          },
          application: {
            add: [
              '326c0213-d0ce-4bc2-bdaa-98e07f02d804',
              'd5d8fdfa-de89-44e6-a365-cd4d9749c45e'
            ]
          }
        }
      ];
      serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();
      serviceContext.coreAdmin.addApplicationsForOrganization.mockResolvedValue(
        {}
      );
      serviceContext.dal.application.getApplication = jest
        .fn()
        .mockResolvedValue({});
      serviceContext.bll.application._createPermissionSetsAndACEs = jest
        .fn()
        .mockResolvedValue({});

      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.coreAdmin.addApplicationsForOrganization
      ).toHaveBeenCalledTimes(1);
      expect(
        serviceContext.dal.application.getApplication
      ).toHaveBeenCalledTimes(2);
      expect(
        serviceContext.bll.application._createPermissionSetsAndACEs
      ).toHaveBeenCalledTimes(2);
    });

    it('calling addApplicationsForOrganization and revert by removeApplicationsForOrganization', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {},
          application: {
            add: [
              '326c0213-d0ce-4bc2-bdaa-98e07f02d804',
              'd5d8fdfa-de89-44e6-a365-cd4d9749c45e'
            ]
          }
        },
        {
          orgId: 456,
          engine: {},
          application: {
            add: [
              '326c0213-d0ce-4bc2-bdaa-98e07f02d804',
              'd5d8fdfa-de89-44e6-a365-cd4d9749c45e'
            ]
          }
        }
      ];
      serviceContext.coreAdmin.addApplicationsForOrganization = jest.fn();
      serviceContext.coreAdmin.addApplicationsForOrganization.mockImplementation(
        ({ ids, orgId }) => {
          if (orgId === 456) {
            throw new Error('failed to add applications to organization');
          }
          return {};
        }
      );
      serviceContext.coreAdmin.removeApplicationsForOrganization = jest.fn();
      serviceContext.coreAdmin.removeApplicationsForOrganization.mockResolvedValue(
        {}
      );
      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(
        serviceContext.coreAdmin.addApplicationsForOrganization
      ).toHaveBeenCalledTimes(2);
      expect(
        serviceContext.coreAdmin.removeApplicationsForOrganization
      ).toHaveBeenCalledTimes(1);
    });

    it('grant: creates a library_collaborator for the receiving org', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {},
          application: {},
          library: {
            add: ['aa11f72e-93a3-41aa-8199-9e82404c6627']
          }
        }
      ];
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockResolvedValue({});
      serviceContext.dal.library.deleteLibraryCollaborator = jest.fn();

      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.library.createLibraryCollaborator
      ).toHaveBeenCalledTimes(1);
      expect(
        serviceContext.dal.library.createLibraryCollaborator
      ).toHaveBeenCalledWith(args.context, {
        input: {
          libraryId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
          organizationId: 123,
          permissions: ['view'],
          status: 'active'
        }
      });
      expect(
        serviceContext.dal.library.deleteLibraryCollaborator
      ).not.toHaveBeenCalled();
    });

    it('revoke: deletes the library_collaborator for the org', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {},
          application: {},
          library: {
            remove: ['aa11f72e-93a3-41aa-8199-9e82404c6627']
          }
        }
      ];
      serviceContext.dal.library.createLibraryCollaborator = jest.fn();
      serviceContext.dal.library.deleteLibraryCollaborator = jest
        .fn()
        .mockResolvedValue({});

      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.library.deleteLibraryCollaborator
      ).toHaveBeenCalledWith({
        libraryId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
        organizationId: 123
      });
      expect(
        serviceContext.dal.library.createLibraryCollaborator
      ).not.toHaveBeenCalled();
    });

    it('grant is idempotent: an already-existing collaborator (unique violation) does not throw', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {},
          application: {},
          library: {
            add: ['aa11f72e-93a3-41aa-8199-9e82404c6627']
          }
        }
      ];
      const conflict = new Error('duplicate key value violates unique constraint');
      conflict.code = '23505';
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockRejectedValue(conflict);
      serviceContext.dal.library.deleteLibraryCollaborator = jest.fn();

      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.library.createLibraryCollaborator
      ).toHaveBeenCalledTimes(1);
    });

    it('revert: a failed library grant reverts previously-created collaborators and throws', async () => {
      let err;
      args.resources = [
        {
          orgId: 123,
          engine: {},
          application: {},
          library: {
            add: ['aa11f72e-93a3-41aa-8199-9e82404c6627']
          }
        },
        {
          orgId: 456,
          engine: {},
          application: {},
          library: {
            add: ['bb22f5c3-c14c-4d6c-9c92-c095a9545898']
          }
        }
      ];
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockImplementation((context, { input }) => {
          if (input.organizationId === 456) {
            throw new Error('failed to create library collaborator');
          }
          return Promise.resolve({});
        });
      serviceContext.dal.library.deleteLibraryCollaborator = jest
        .fn()
        .mockResolvedValue({});

      try {
        await dal._packageUpdateGrantsResources(
          args.context,
          args.resources,
          args.eventPromises,
          args.existingDbWrite
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      // org 123 was granted, then reverted when org 456 failed
      expect(
        serviceContext.dal.library.deleteLibraryCollaborator
      ).toHaveBeenCalledWith({
        libraryId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
        organizationId: 123
      });
    });
  });

  describe('#addOrRemoveLibraryCollaborators', function () {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
    });

    it('revoke is idempotent: a missing collaborator (NotFound) does not throw', async () => {
      let err;
      serviceContext.dal.library.deleteLibraryCollaborator = jest
        .fn()
        .mockRejectedValue(
          new errors.NotFound({
            data: { objectId: 'x', objectType: 'LibraryCollaborator' }
          })
        );
      serviceContext.dal.library.createLibraryCollaborator = jest.fn();

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          remove: [{ orgId: 123, ids: ['aa11f72e-93a3-41aa-8199-9e82404c6627'] }]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.library.deleteLibraryCollaborator
      ).toHaveBeenCalledTimes(1);
    });

    it('revoke is idempotent for a wrapped NotFound (name=not_found, foreign class)', async () => {
      // Reproduces revoking twice: the library DAL throws a not_found from its own
      // ../error factory instance — same name, different class — so the check must
      // key on name, not instanceof.
      let err;
      const wrapped = new Error('The requested object was not found');
      wrapped.name = 'not_found';
      serviceContext.dal.library.deleteLibraryCollaborator = jest
        .fn()
        .mockRejectedValue(wrapped);
      serviceContext.dal.library.createLibraryCollaborator = jest.fn();

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          remove: [{ orgId: 123, ids: ['aa11f72e-93a3-41aa-8199-9e82404c6627'] }]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });

    it('grant: creates a collaborator per library per org', async () => {
      let err;
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockResolvedValue({});
      serviceContext.dal.library.deleteLibraryCollaborator = jest.fn();

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          add: [
            {
              orgId: 123,
              ids: [
                'aa11f72e-93a3-41aa-8199-9e82404c6627',
                'bb22f5c3-c14c-4d6c-9c92-c095a9545898'
              ]
            }
          ]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.library.createLibraryCollaborator
      ).toHaveBeenCalledTimes(2);
    });

    it('grant: an errors.ResourceConflict on create is a no-op (idempotent)', async () => {
      let err;
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockRejectedValue(
          new errors.ResourceConflict({ message: 'already exists' })
        );
      serviceContext.dal.library.deleteLibraryCollaborator = jest.fn();

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          add: [{ orgId: 123, ids: ['aa11f72e-93a3-41aa-8199-9e82404c6627'] }]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });

    it('grant: a wrapped conflict (name=resource_conflict, no code, foreign class) is a no-op', async () => {
      // Reproduces re-granting twice: the create rejects with an apollo-errors
      // conflict whose only stable signal is name==='resource_conflict' — it is
      // NOT code 23505 and NOT an instance of this module's errors.ResourceConflict.
      let err;
      const wrapped = new Error(
        'The object could not be created because a duplicate already exists.'
      );
      wrapped.name = 'resource_conflict';
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockRejectedValue(wrapped);
      serviceContext.dal.library.deleteLibraryCollaborator = jest.fn();

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          add: [{ orgId: 123, ids: ['aa11f72e-93a3-41aa-8199-9e82404c6627'] }]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.library.deleteLibraryCollaborator
      ).not.toHaveBeenCalled();
    });

    it('revoke: a non-NotFound error rethrows wrapped as InternalServerError', async () => {
      let err;
      serviceContext.dal.library.deleteLibraryCollaborator = jest
        .fn()
        .mockRejectedValue(new Error('db is down'));
      serviceContext.dal.library.createLibraryCollaborator = jest.fn();

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          remove: [{ orgId: 123, ids: ['aa11f72e-93a3-41aa-8199-9e82404c6627'] }]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(errors.InternalServerError);
    });

    it('grant failure self-reverts applied grants and throws InternalServerError', async () => {
      let err;
      serviceContext.dal.library.createLibraryCollaborator = jest
        .fn()
        .mockImplementation((ctx, { input }) => {
          if (input.organizationId === 456) {
            throw new Error('boom');
          }
          return Promise.resolve({});
        });
      serviceContext.dal.library.deleteLibraryCollaborator = jest
        .fn()
        .mockResolvedValue({});

      try {
        await dal.addOrRemoveLibraryCollaborators(context, {
          add: [
            { orgId: 123, ids: ['aa11f72e-93a3-41aa-8199-9e82404c6627'] },
            { orgId: 456, ids: ['bb22f5c3-c14c-4d6c-9c92-c095a9545898'] }
          ]
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(errors.InternalServerError);
      // org 123's applied grant is reverted
      expect(
        serviceContext.dal.library.deleteLibraryCollaborator
      ).toHaveBeenCalledWith({
        libraryId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
        organizationId: 123
      });
    });
  });

  describe('#getInactiveOrNonExistingResources — library', function () {
    it('ownership gate: a non-superadmin lookup is scoped to owned libraries', async () => {
      serviceContext.dal.library.getLibraries = jest
        .fn()
        .mockResolvedValue({ records: [] });

      await dal.getInactiveOrNonExistingResources(
        [
          {
            resourceType: 'library',
            resourceId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
            action: 'ADD'
          }
        ],
        mockUtil.makeContext({ authRole: 'regularUser' }),
        false
      );

      // The lookup must be constrained to libraries owned by the requesting org,
      // so a foreign library cannot pass validation and be bundled/leaked.
      expect(serviceContext.dal.library.getLibraries).toHaveBeenCalledWith(
        expect.objectContaining({ includeOwnedOnly: true })
      );
      // getLibraries validates a single id (checkId → isUUID); passing an array
      // throws at runtime. Assert we look up a scalar id, not the array.
      const passedId = serviceContext.dal.library.getLibraries.mock.calls[0][0]
        .id;
      expect(Array.isArray(passedId)).toBe(false);
      expect(typeof passedId).toBe('string');
    });

    it('looks up each library id individually (one getLibraries call per id)', async () => {
      serviceContext.dal.library.getLibraries = jest
        .fn()
        .mockResolvedValue({ records: [] });

      await dal.getInactiveOrNonExistingResources(
        [
          {
            resourceType: 'library',
            resourceId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
            action: 'ADD'
          },
          {
            resourceType: 'library',
            resourceId: 'bb22f5c3-c14c-4d6c-9c92-c095a9545898',
            action: 'ADD'
          }
        ],
        mockUtil.makeContext(),
        false
      );

      expect(serviceContext.dal.library.getLibraries).toHaveBeenCalledTimes(2);
      serviceContext.dal.library.getLibraries.mock.calls.forEach(([arg]) => {
        expect(typeof arg.id).toBe('string');
      });
    });
  });

  describe('#getInactiveOrNonExistingResources — library existence', function () {
    it('reports an error when a library resource does not exist', async () => {
      serviceContext.dal.library.getLibraries = jest
        .fn()
        .mockResolvedValue({ records: [] });

      const resourceErrors = await dal.getInactiveOrNonExistingResources(
        [
          {
            resourceType: 'library',
            resourceId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
            action: 'ADD'
          }
        ],
        mockUtil.makeContext(),
        false
      );

      expect(resourceErrors).toEqual([
        expect.objectContaining({
          resourceId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
          resourceType: 'library'
        })
      ]);
    });

    it('accepts an existing library and never marks it inactive', async () => {
      serviceContext.dal.library.getLibraries = jest.fn().mockResolvedValue({
        records: [{ id: 'aa11f72e-93a3-41aa-8199-9e82404c6627', name: 'Lib' }]
      });

      const resourceErrors = await dal.getInactiveOrNonExistingResources(
        [
          {
            resourceType: 'library',
            resourceId: 'aa11f72e-93a3-41aa-8199-9e82404c6627',
            action: 'ADD'
          }
        ],
        mockUtil.makeContext(),
        true // checkInactive — libraries have no inactive state, so still no errors
      );

      expect(resourceErrors).toEqual([]);
    });
  });

  describe('#validation against circular package references', function () {
    it('avoid cycle in a nested package for packageUpdate', async function () {
      let err, resp;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            organizationId: '321',
            packageId: '300fa55a-d68b-494b-83df-49ce2d008e6'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            packageVersion: '1.0',
            packageId: '300fa55a-d68b-494b-83df-49ce2d008e6'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '300fa55a-d68b-494b-83df-49ce2d008e6d',
            visitedPackages: [
              '401fa55a-d68b-494b-83df-49ce2d008e6d',
              '8888a55a-d68b-494b-83df-49ce2d008e6d',
              '300fa55a-d68b-494b-83df-49ce2d008e6d'
            ],
            visitedPackageNames: [
              'package father 401 (1.0.0)',
              'package father 888 related to root package (1.0.0)',
              'root package id (1.0.0)'
            ],
            hasCycle: true
          }
        ],
        false
      );

      try {
        resp = await dal.packageUpdate(
          {
            id: '300fa55a-d68b-494b-83df-49ce2d008e6d',
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            resources: [
              {
                resourceType: 'package',
                resourceId: '401fa55a-d68b-494b-83df-49ce2d008e6d',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              tokenId: 123,
              applicationId: 7682,
              json: {
                rights: ['superadmin']
              }
            }
          }
        );
      } catch (e) {
        err = e;
      }

      expect(resp).toBeUndefined();
      expect(err.message).toEqual(
        `A cycle has been detected in a nested package of 300fa55a-d68b-494b-83df-49ce2d008e6d.`
      );
      expect(err.name).toEqual('nested_resources_cycle_detected');
      expect(err.data.validationErrors[0].fieldName).toEqual('packageId');
      expect(err.data.validationErrors[0].fieldValue.nestedPackage).toEqual(
        '300fa55a-d68b-494b-83df-49ce2d008e6d'
      );
      expect(
        err.data.validationErrors[0].fieldValue.referencePathsWithIds.length
      ).toEqual(3);
      expect(
        err.data.validationErrors[0].fieldValue.referencePaths.length
      ).toEqual(3);
    });
    it('avoid cycle in a nested package for packageUpdateResources', async function () {
      let err, resp;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: '300fa55a-d68b-494b-83df-49ce2d008e6d',
            visitedPackages: [
              '401fa55a-d68b-494b-83df-49ce2d008e6d',
              '8888a55a-d68b-494b-83df-49ce2d008e6d',
              '300fa55a-d68b-494b-83df-49ce2d008e6d'
            ],
            visitedPackageNames: [
              'package father 401 (1.0.0)',
              'package father 888 related to root package (1.0.0)',
              'root package id (1.0.0)'
            ],
            hasCycle: true
          }
        ],
        false
      );

      try {
        resp = await dal.packageUpdateResources(
          {
            packageId: '300fa55a-d68b-494b-83df-49ce2d008e6d',
            name: 'New Test Package',
            description: 'This is just a test',
            icon:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            version: '1.0',
            aiwareVersion: '1',
            deleted: false,
            packageResources: [
              {
                resourceType: 'package',
                resourceId: '401fa55a-d68b-494b-83df-49ce2d008e6d',
                action: 'ADD'
              }
            ]
          },
          {
            ...mockUtil.makeContext(),
            _authInfo: {
              tokenId: 123,
              applicationId: 7682,
              json: {
                rights: ['superadmin']
              }
            }
          }
        );
      } catch (e) {
        err = e;
      }

      expect(resp).toBeUndefined();
      expect(err.message).toEqual(
        `A cycle has been detected in a nested package of 300fa55a-d68b-494b-83df-49ce2d008e6d.`
      );
      expect(err.name).toEqual('internal_error');
      expect(err.data.validationErrors[0].fieldName).toEqual('packageId');
      expect(err.data.validationErrors[0].fieldValue.nestedPackage).toEqual(
        '300fa55a-d68b-494b-83df-49ce2d008e6d'
      );
      expect(
        err.data.validationErrors[0].fieldValue.referencePathsWithIds.length
      ).toEqual(3);
      expect(
        err.data.validationErrors[0].fieldValue.referencePaths.length
      ).toEqual(3);
    });
  });

  describe('#getResourceAliasByType', function () {
    let conext;
    beforeEach(() => {
      conext = mockUtil.makeContext();
    });

    it('should throw an error if the input is invalid/ missed', async function () {
      const packageResource = {
        resourceId: 123,
        resourceType: null // missing type
      };
      try {
        const alias = await dal.getResourceAliasByType(
          conext,
          packageResource.resourceId,
          packageResource.resourceType
        );
        expect(alias).toBeNull();
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(`${error}`).toContain(
          'the resourceId and resourceType are required'
        );
      }
    });

    it('resource alias should be null if the resource type does not support an alias', async function () {
      const packageResource = {
        resourceId: 123,
        resourceType: 'tdo'
      };

      const alias = await dal.getResourceAliasByType(
        conext,
        packageResource.resourceId,
        packageResource.resourceType
      );
      expect(alias).toBeNull();
    });

    it('should get resource alias if the resource type supports an alias', async function () {
      const testEngine = {
        id: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
        name: 'test engine',
        aliasId: 'd99e45a8-4270-406f-89ce-2d04e63ccd09'
      };
      serviceContext.dal.engine.getEngine = jest.fn();
      serviceContext.dal.engine.getEngine.mockReturnValue(testEngine);

      const packageResource = {
        resourceId: testEngine.id,
        resourceType: 'engine'
      };

      const alias = await dal.getResourceAliasByType(
        conext,
        packageResource.resourceId,
        packageResource.resourceType
      );
      expect(alias).not.toBeNull();
      expect(alias).toEqual(testEngine.aliasId);
    });
  });

  describe('#_getResourceAlias', function () {
    let conext;
    beforeEach(() => {
      conext = mockUtil.makeContext();
    });
    it('should throw an error if the input is invalid/ missed', async function () {
      const packageResource = null;
      try {
        const alias = await dal._getResourceAlias(conext, packageResource);
        expect(alias).toBeNull();
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
        expect(`${error}`).toContain('the package resource info is required');
      }
    });

    it('generate resource alias if it is not passed in', async function () {
      const packageResource = {
        resourceId: 123,
        action: 'ADD'
      };
      const alias = await dal._getResourceAlias(conext, packageResource);
      expect(alias).toBeDefined();
      expect(alias.length).toEqual(36);
      expect(alias).not.toEqual(packageResource.resourceId);
    });

    it('should get resource alias if it is passed in', async function () {
      const packageResource = {
        resourceId: 123,
        resourceAlias: '789d3605-1542-4aa3-ab1e-6d318b18dabf',
        action: 'ADD'
      };

      const alias = await dal._getResourceAlias(conext, packageResource);
      expect(alias).toBeDefined();
      expect(alias).toEqual(packageResource.resourceAlias);
    });

    it('(alias is not passed in): should get resource id as an alias if it is a UUID', async function () {
      const packageResource = {
        resourceId: '789d3605-1542-4aa3-ab1e-6d318b18dabf',
        action: 'ADD'
      };

      const alias = await dal._getResourceAlias(conext, packageResource);
      expect(alias).toBeDefined();
      expect(alias).toEqual(packageResource.resourceId);
    });

    it('(alias is not passed in): should get resource id (uuid) as an alias if resource type DOES NOT support an alias', async function () {
      const packageResource = {
        resourceId: '6b59e925-7cda-43d1-9c1c-9e1ace4cb37d',
        resourceType: 'application',
        action: 'ADD'
      };

      const alias = await dal._getResourceAlias(conext, packageResource);
      expect(alias).toBeDefined();
      expect(alias).toEqual(packageResource.resourceId);
    });

    it('(alias is not passed in): should generate a new uuid (resource id is not a uuid) as an alias if resource type DOES NOT support an alias', async function () {
      const packageResource = {
        resourceId: 123,
        resourceType: 'tdo',
        action: 'ADD'
      };

      const alias = await dal._getResourceAlias(conext, packageResource);
      expect(alias).toBeDefined();
      expect(alias.length).toEqual(36);
    });

    it('(alias is not passed in): should get resource alias from resource info if resource type supports an alias', async function () {
      const packageResource = {
        resourceId: '789d3605-1542-4aa3-ab1e-6d318b18dabf',
        resourceType: 'engine',
        action: 'ADD'
      };

      const testEngine = {
        id: '773df824-bd92-425f-b3fb-c8cbf9d3d72b',
        name: 'test engine',
        aliasId: 'd99e45a8-4270-406f-89ce-2d04e63ccd09'
      };
      serviceContext.dal.engine.getEngine = jest.fn();
      serviceContext.dal.engine.getEngine.mockReturnValue(testEngine);

      const alias = await dal._getResourceAlias(conext, packageResource);
      expect(alias).toBeDefined();
      expect(alias).toEqual(testEngine.aliasId);
    });
  });

  describe('#fileTDOResouceInResourceFolder', function () {
    it('no need to do everything if automatePalette does not belong to an organization', async () => {
      let err;

      try {
        await dal.fileTDOResouceInResourceFolder(
          mockUtil.makeContext(),
          'automatePalette',
          {}
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.folder.getOrCreateOrgRootFolder
      ).not.toHaveBeenCalled();
    });

    it('no need to do everything if a resource type is not supported', async () => {
      let err;
      const tdo = {
        id: 'tdo_id',
        orgId: 1
      };

      try {
        await dal.fileTDOResouceInResourceFolder(
          mockUtil.makeContext(),
          'other-resource-type',
          tdo
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.folder.getOrCreateOrgRootFolder
      ).not.toHaveBeenCalled();
    });

    it('no file automatePalette if it has been filed in the organization root folder', async () => {
      let err;
      const tdo = {
        id: 'tdo_id',
        orgId: 1
      };
      serviceContext.dal.folder.getOrCreateOrgRootFolder.mockResolvedValueOnce({
        id: 'automatePalette_r_f_id'
      });
      serviceContext.dal.folder.getSubfolders.mockResolvedValueOnce([]);
      serviceContext.dal.folder.createFolder.mockResolvedValueOnce({
        id: 'automatePalette_sub_f_id'
      });
      serviceContext.dal.folder.getParentFoldersForObject.mockResolvedValueOnce(
        [
          {
            id: 'automatePalette_sub_f_id'
          }
        ]
      );

      try {
        await dal.fileTDOResouceInResourceFolder(
          mockUtil.makeContext(),
          'automatePalette',
          tdo
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.folder.getOrCreateOrgRootFolder
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          organizationId: 1,
          rootFolderType: 'resource'
        })
      );
      expect(
        serviceContext.dal.folder.getParentFoldersForObject
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          objectId: 'tdo_id',
          organizationId: 1
        })
      );
      expect(serviceContext.dal.folder.fileObject).not.toHaveBeenCalled();
    });

    it('should file automatePalette in the automatePalette folder', async () => {
      let err;
      const tdo = {
        id: 'tdo_id',
        orgId: 1
      };
      serviceContext.dal.folder.getOrCreateOrgRootFolder.mockResolvedValueOnce({
        id: 'resource_r_f_id',
        treeObjectId: 'tree_obj_resource_r_f_id'
      });
      serviceContext.dal.folder.getSubfolders.mockResolvedValueOnce([]);
      serviceContext.dal.folder.createFolder.mockResolvedValueOnce({
        id: 'automatePalette_sub_f_id'
      });
      serviceContext.dal.folder.getParentFoldersForObject.mockResolvedValueOnce(
        []
      );

      try {
        await dal.fileTDOResouceInResourceFolder(
          mockUtil.makeContext(),
          'automatePalette',
          tdo
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.folder.getOrCreateOrgRootFolder
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          organizationId: 1,
          rootFolderType: 'resource'
        })
      );
      expect(serviceContext.dal.folder.getSubfolders).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          organizationId: 1,
          id: 'tree_obj_resource_r_f_id',
          folderId: 'resource_r_f_id',
          names: ['palettes']
        })
      );
      expect(
        serviceContext.dal.folder.getParentFoldersForObject
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          objectId: 'tdo_id',
          organizationId: 1
        })
      );
      expect(serviceContext.dal.folder.fileObject).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        'automatePalette_sub_f_id',
        'tdo_id',
        expect.any(Number),
        0,
        true
      );
    });
    it('should file automateNode in the automateNode root folder', async () => {
      let err;
      const tdo = {
        id: 'tdo_id',
        orgId: 1
      };
      serviceContext.dal.folder.getOrCreateOrgRootFolder.mockResolvedValueOnce({
        id: 'resource_r_f_id',
        treeObjectId: 'tree_obj_resource_r_f_id'
      });
      serviceContext.dal.folder.getSubfolders.mockResolvedValueOnce([]);
      serviceContext.dal.folder.createFolder.mockResolvedValueOnce({
        id: 'automateNode_sub_f_id'
      });
      serviceContext.dal.folder.getParentFoldersForObject.mockResolvedValueOnce(
        []
      );

      try {
        await dal.fileTDOResouceInResourceFolder(
          mockUtil.makeContext(),
          'automateNode',
          tdo
        );
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.folder.getOrCreateOrgRootFolder
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          organizationId: 1,
          rootFolderType: 'resource'
        })
      );
      expect(
        serviceContext.dal.folder.getParentFoldersForObject
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          objectId: 'tdo_id',
          organizationId: 1
        })
      );
      expect(serviceContext.dal.folder.fileObject).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        'automateNode_sub_f_id',
        'tdo_id',
        expect.any(Number),
        0,
        true
      );
    });
  });

  describe('#_emitPackageEventByStatus', function () {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
    });
    it('should not do anything if missing package status', async function () {
      await dal._emitPackageEventByStatus(context, {});
      expect(serviceContext.messageUtil._counter()).toBe(0);
    });
    it('should not do anything if package status is not changed', async function () {
      await dal._emitPackageEventByStatus(
        context,
        { status: 'pending' },
        'pending'
      );
      expect(serviceContext.messageUtil._counter()).toBe(0);
    });
    it('should not do anything if package status is changed without the right package lifecycle state', async function () {
      await dal._emitPackageEventByStatus(
        context,
        { status: 'draft' },
        'approved'
      );
      expect(serviceContext.messageUtil._counter()).toBe(0);
    });
    // error from the event emission overrides the error from the dal, which is misleading
    xit('should throw error if missing event arguments', async function () {
      let err;

      try {
        await dal._emitPackageEventByStatus(context, {
          status: 'approved'
        });
      } catch (error) {
        err = error ? error : undefined;
      }

      expect(err).toBeDefined();
      expect(serviceContext.messageUtil._counter()).toBe(0);
    });
    it('should emit PackageApproved event when creating an approved package', async function () {
      await dal._emitPackageEventByStatus(context, {
        id: 'package_id',
        name: 'package_name',
        status: 'approved'
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success',
          actionDetails: 'Approved package package_name'
        })
      );
    });
    it("should emit PackageApproved event when changing a pending package's status to approved", async function () {
      await dal._emitPackageEventByStatus(
        context,
        {
          id: 'package_id',
          name: 'package_name',
          status: 'approved'
        },
        'pending'
      );
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success',
          actionDetails: 'Approved package package_name'
        })
      );
    });
    it('should emit PackageRejected event when creating a rejected package', async function () {
      await dal._emitPackageEventByStatus(context, {
        id: 'package_id',
        name: 'package_name',
        status: 'rejected'
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success',
          actionDetails: 'Rejected package package_name'
        })
      );
    });
    it("should emit PackageRejected event when changing a pending package's status to rejected", async function () {
      await dal._emitPackageEventByStatus(
        context,
        {
          id: 'package_id',
          name: 'package_name',
          status: 'rejected'
        },
        'pending'
      );
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success',
          actionDetails: 'Rejected package package_name'
        })
      );
    });
    it('should emit PackageInstalled event when creating/updating a published package', async function () {
      await dal._emitPackageEventByStatus(context, {
        id: 'package_id',
        name: 'package_name',
        status: 'published'
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success',
          actionDetails: 'Installed package package_name'
        })
      );
    });
    it('>> #_emitGrantPublicPackagesEvent: Should emit an event for grant public package if package is public and status = published', async function () {
      // setup for flag useAppGrant
      _.set(context, 'organizationId', 7682);
      _.set(
        serviceContext,
        'config.featureFlags.enablePackageGrantLogic',
        true
      );
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });

      await dal._emitPackageEventByStatus(context, {
        id: 'package_id_001',
        name: 'package_name',
        status: 'published',
        distributionType: 'public'
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(2);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success',
          actionDetails: 'Installed package package_name'
        })
      );
      expect(messages[1].type).toEqual('system');
      expect(messages[1].event).toEqual('grant_public_packages');
    });
  });

  describe('#_emitGrantPublicPackagesEvent', function () {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
      serviceContext.dal.organization.getOrganization = jest.fn();
      _.set(
        serviceContext,
        'config.featureFlags.enablePackageGrantLogic',
        true
      );
    });

    it('should do nothing when useAppGrant = false', async function () {
      _.set(
        serviceContext,
        'config.featureFlags.enablePackageGrantLogic',
        false
      );
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });
      await dal._emitGrantPublicPackagesEvent(context, 'package-id');

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(0);
    });

    it('should emit an event when useAppGrant = true', async function () {
      _.set(context, 'organizationId', 7682);
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });
      await dal._emitGrantPublicPackagesEvent(context, 'package-id');

      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toEqual('system');
      expect(messages[0].event).toEqual('grant_public_packages');
    });
  });
  describe('#_createJWTTokenByDefaultPermissions', function () {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
    });
    it('should throw error if missing event arguments', async function () {
      let res, err;
      try {
        res = await dal._createJWTTokenByDefaultPermissions(context, {});
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should generate JWT Toke by using the provided permissions', async function () {
      let err, res;
      serviceContext.dal.user.getDefaultOrgAdminUser.mockReturnValueOnce({
        id: 'user-id'
      });
      try {
        res = await dal._createJWTTokenByDefaultPermissions(context, {
          organizationGuid: 'org-guid',
          organizationId: 'org-id',
          permissions: ['AIWARE_FOLDER_CREATE', 'AIWARE_FOLDER_READ']
        });
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(jwt.decode(res)).toEqual({
        contentApplicationId: 'org-guid',
        contentOrganizationId: 'org-id',
        userId: 'user-id',
        scope: [
          {
            actions: expect.any(Array)
          }
        ],
        iat: expect.any(Number),
        exp: expect.any(Number),
        sub: 'engine-run',
        jti: expect.any(String)
      });
    });
  });

  describe('#isPackageChanging', function () {
    let context;
    let input, dbRecord;
    beforeEach(() => {
      context = mockUtil.makeContext();
    });
    it('input status is not passed in', async function () {
      let res, err;
      input = {
        packageId: `42893100-aea9-492a-a3cf-0cc1edb87e20`
      };
      dbRecord = {
        packageId: `42893100-aea9-492a-a3cf-0cc1edb87e20`,
        status: 'draft'
      };
      try {
        res = await dal.isPackageChanging(input, dbRecord);
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.isStatusChanging).toEqual(false);
    });

    it('input status is passed in but same the current status', async function () {
      let res, err;
      input = {
        packageId: `42893100-aea9-492a-a3cf-0cc1edb87e20`,
        status: 'draft'
      };
      dbRecord = {
        packageId: `42893100-aea9-492a-a3cf-0cc1edb87e20`,
        status: 'draft'
      };
      try {
        res = await dal.isPackageChanging(input, dbRecord);
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.isStatusChanging).toEqual(false);
    });

    it('input status is passed in with a difference status', async function () {
      let res, err;
      input = {
        packageId: `42893100-aea9-492a-a3cf-0cc1edb87e20`,
        status: 'approved'
      };
      dbRecord = {
        packageId: `42893100-aea9-492a-a3cf-0cc1edb87e20`,
        status: 'draft'
      };
      try {
        res = await dal.isPackageChanging(input, dbRecord);
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.isStatusChanging).toEqual(true);
    });
  });

  describe('#_getSolelyOwnedResources', function () {
    let context;
    let input = {
      organizationId: 7682,
      ids: [],
      packageId: ''
    };

    beforeEach(() => {
      context = mockUtil.makeContext();
      input = {
        organizationId: 7682,
        ids: [],
        packageId: '628c671b-d0c3-499e-a15f-f8d50a3e9251'
      };
    });
    it('The input is empty: Should return an empty array', async function () {
      let res, err;
      try {
        res = await dal._getSolelyOwnedResources(context);
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });
    it('getAccessiblePackageResources does not return any data: Should return data like Ids in the input', async function () {
      let res, err;
      input.ids.push(
        '60714c4c-e527-4b97-a456-0afd921531bb',
        'ca21fa25-bcbc-4897-9121-69586be8ceb4'
      );
      // getAccessiblePackageResources
      serviceContext.dbConnections['core'].read._push([], false);
      try {
        res = await dal._getSolelyOwnedResources(
          context,
          input.organizationId,
          input.ids,
          input.packageId
        );
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(input.ids.length);
      expect(res).toEqual(input.ids);
    });

    it('Should get data correctly', async function () {
      let res, err;
      input.ids.push(
        '60714c4c-e527-4b97-a456-0afd921531bb', // 1
        'ca21fa25-bcbc-4897-9121-69586be8ceb4', // 2
        'da24917b-710d-457b-9759-6fb2d27a93c3', // 3: In the current package
        '46035ef9-af3a-4e5b-a511-4380c0e802d4', // 4: In other packages and the current package
        'e006dcfc-10fd-4d7d-a9f1-e5987e2d4936', // 5: In other packages and the current package
        '41b6fcff-eaa4-4529-b4f2-e862c86b93f0', // 6
        '5b767d5d-1030-4428-8158-6d7737b08d30', // 7
        '0a306942-d544-4fbf-8af0-a51c7442442b' // 8
      );
      // getAccessiblePackageResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '60714c4c-e527-4b97-a456-0afd921531bb' // 1
          },
          {
            resourceId: 'da24917b-710d-457b-9759-6fb2d27a93c3' // 3
          },
          {
            resourceId: '46035ef9-af3a-4e5b-a511-4380c0e802d4' // 4
          },
          {
            resourceId: 'e006dcfc-10fd-4d7d-a9f1-e5987e2d4936' // 5
          },
          {
            resourceId: '41b6fcff-eaa4-4529-b4f2-e862c86b93f0' // 6
          },
          {
            resourceId: '0a306942-d544-4fbf-8af0-a51c7442442b' // 8
          },
          {
            resourceId: '9b858db4-1254-40fa-ad87-7f4fde74dbf6' // Another
          },
          {
            resourceId: 'bafb1015-9c8c-4e93-ac49-31cdcfa21b14' // Another
          }
        ],
        false
      );
      const resourceIdsExpect = [
        'ca21fa25-bcbc-4897-9121-69586be8ceb4',
        '5b767d5d-1030-4428-8158-6d7737b08d30'
      ];
      try {
        res = await dal._getSolelyOwnedResources(
          context,
          input.organizationId,
          input.ids,
          input.packageId
        );
      } catch (error) {
        err = error ? error : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(resourceIdsExpect.length);
      expect(res).toEqual(resourceIdsExpect);
    });
  });

  describe('#getAccessiblePackageResources', function () {
    it('should return allowed resources to specified org id if user is super-admin', async () => {
      // Get engine usage
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            resourceType: 'engine'
          },
          {
            resourceId: '6db02faa-3605-4fd7-8bdc-8a60332ab194',
            resourceType: 'engine'
          }
        ],
        false,
        [
          'aiware.package',
          'aiware.package__organization',
          'DISTINCT(resource_id)'
        ],
        (sql, params) => {
          expect(sql).toMatch(/p\.organization_id\s=.*/);
          expect(sql).toMatch(/po\.grant_type\s=\sANY/);
          expect(sql).toMatch(/pr\.resource_id\s=\sANY/);
          expect(sql).toMatch(/pr\.resource_type\s=\sANY/);
          expect(params[0]).toEqual(
            expect.arrayContaining([
              '271413a3-1b1f-458b-9f69-e79d6ac22c91',
              '6db02faa-3605-4fd7-8bdc-8a60332ab194'
            ])
          );
          expect(params[1]).toEqual(expect.arrayContaining(['engine']));
          expect(params[2]).toEqual(100);
          expect(params[3]).toEqual(expect.arrayContaining(['GRANT']));

          return true;
        }
      );

      const res = await dal.getAccessiblePackageResources(
        mockUtil.makeContext(),
        {
          organizationId: 100,
          resourceTypes: ['engine'],
          resourceIds: [
            '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            '6db02faa-3605-4fd7-8bdc-8a60332ab194'
          ]
        }
      );
      expect(res.length).toBeGreaterThan(0);
    });
    it('should return allowed resources to specified org id if user is super-admin', async () => {
      // Get engine usage
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            resourceType: 'engine'
          },
          {
            resourceId: '6db02faa-3605-4fd7-8bdc-8a60332ab194',
            resourceType: 'engine'
          }
        ],
        false,
        [
          'aiware.package',
          'aiware.package__organization',
          'DISTINCT(resource_id)'
        ],
        (sql, params) => {
          expect(sql).toMatch(/po\.grant_type\s=\sANY/);
          expect(sql).toMatch(/pr\.resource_id\s=\sANY/);
          expect(sql).toMatch(/pr\.resource_type\s=\sANY/);
          expect(params[0]).toEqual(
            expect.arrayContaining([
              '271413a3-1b1f-458b-9f69-e79d6ac22c91',
              '6db02faa-3605-4fd7-8bdc-8a60332ab194'
            ])
          );
          expect(params[1]).toEqual(expect.arrayContaining(['engine']));
          expect(params[2]).toEqual(7682);
          expect(params[3]).toEqual(expect.arrayContaining(['GRANT']));

          return true;
        }
      );

      const res = await dal.getAccessiblePackageResources(
        mockUtil.makeContext({ authRole: 'orgAdmin' }),
        {
          organizationId: 100,
          resourceTypes: ['engine'],
          resourceIds: [
            '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            '6db02faa-3605-4fd7-8bdc-8a60332ab194'
          ]
        }
      );
      expect(res.length).toBeGreaterThan(0);
    });
    it('should get allowed resources with some optional options', async () => {
      // Get engine usage
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            resourceType: 'engine'
          },
          {
            resourceId: '6db02faa-3605-4fd7-8bdc-8a60332ab194',
            resourceType: 'engine'
          }
        ],
        false,
        [
          'aiware.package',
          'aiware.package__organization',
          'DISTINCT(resource_id)'
        ],
        (sql, params) => {
          expect(sql).toMatch(/po\.grant_type\s=\sANY/);
          expect(sql).toMatch(/pr\.resource_id\s=\sANY/);
          expect(sql).toMatch(/pr\.resource_type\s=\sANY/);
          expect(sql).toMatch(/NOT\spr\.package_id\s=\sANY/);
          expect(params[0]).toEqual(
            expect.arrayContaining([
              '271413a3-1b1f-458b-9f69-e79d6ac22c91',
              '6db02faa-3605-4fd7-8bdc-8a60332ab194'
            ])
          );
          expect(params[1]).toEqual(expect.arrayContaining(['engine']));
          expect(params[2]).toEqual(
            expect.arrayContaining(['26d568ff-42c4-472a-bc86-b9b1235063c4'])
          );
          expect(params[3]).toEqual(100);
          expect(params[4]).toEqual(expect.arrayContaining(['GRANT', 'VIEW']));

          return true;
        }
      );

      const res = await dal.getAccessiblePackageResources(
        mockUtil.makeContext(),
        {
          organizationId: 100,
          resourceTypes: ['engine'],
          resourceIds: [
            '271413a3-1b1f-458b-9f69-e79d6ac22c91',
            '6db02faa-3605-4fd7-8bdc-8a60332ab194'
          ],
          excludedPackageIds: ['26d568ff-42c4-472a-bc86-b9b1235063c4'],
          excludeViewOnly: false
        }
      );
      expect(res.length).toBeGreaterThan(0);
    });
  });

  describe('package audit log events', () => {
    const packageStatuses = [
      'pending',
      'deleted',
      'approved',
      'rejected',
      'published'
    ];
    for (const status of packageStatuses) {
      it(`should emit audit log (public) event when failing to update status of a package - ${status}`, async function () {
        let res, err;

        // checkPackageWriteAuthorization
        serviceContext.dbConnections['core'].write._push(
          [
            {
              organizationId: 1
            }
          ],
          false
        );

        try {
          res = await dal.packageUpdate(
            {
              id: '321',
              status,
              name: 'New Test Package'
            },
            {
              ...mockUtil.makeContext(),
              _authInfo: {
                permissionMasks: [],
                authorizedOrganizationIds: [7682],
                organization: {
                  organizationId: 7682
                }
              }
            }
          );
        } catch (error) {
          // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
          err = error;
        }
        expect(err).toBeDefined();
        const messages = serviceContext.messageUtil._messages();
        // audit log should be emitted
        expect(messages.length).toEqual(1);
        expect(messages[0].actionInfo.actionResult).toEqual('failure');
        expect(messages[0].actionInfo.actionName).toEqual(
          dal.eventActionMap[status].action
        );
      });
    }
  });
});

function expectOnlyEmitPackageCreatedEvent(actionResult = 'success') {
  const messages = serviceContext.messageUtil._messages();
  expect(messages.length).toBe(1);
  // public event for creating package
  expect(messages[0].actionInfo).toEqual(
    expect.objectContaining({
      actionName: 'create',
      actionResult
    })
  );
}
function expectEmitBothPackageCreatedAndOtherEvents(
  actionNames = [],
  actionResults = []
) {
  const messages = serviceContext.messageUtil._messages();
  expect(messages.length).toBe(actionNames.length);

  for (let index = 0; index < actionNames.length; index++) {
    expect(messages[index]).toBeDefined();
    expect(messages[index].actionInfo).toEqual(
      expect.objectContaining({
        actionName: _.get(actionNames, `[${index}]`),
        actionResult: _.get(actionResults, `[${index}]`, 'success')
      })
    );
  }
}
