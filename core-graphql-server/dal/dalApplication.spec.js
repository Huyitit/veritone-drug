const _ = require('lodash');
jest.mock('pg');
const pg = require('pg');
const uuid = require('uuid');
const sinon = require('sinon');
const { supportedEvents } = require('@veritone/core-server-base/events-map');
const mapper = require('./mapper.js');

jest.mock('./util.js');
const dalUtil = require('./util.js');
// Used to validate against the whitelist/blacklist the service actually ships,
// rather than a fixture (VE-25569).
const GraphQLServiceConfig = require('../config/config.js');

const httpCallMock = jest.fn();
const validateRoles = jest.fn();
dalUtil.mockImplementation(() => {
  return {
    httpCall: httpCallMock,
    sanitizeField: (x) => x,
    swapPermissionEnumMap: (x) => [],
    coreAdminTokensResponseMapper: (x) => x,
    splitTrim: (x) => (x || ',').split(','),
    validateRoles: validateRoles
  };
});
const mockUtil = globalThis.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext('default', {
  enableTransactionQuery: true
});
serviceContext.bll.application.deleteApplicationRoles = jest.fn();

let ctxSuperAdmin, ctxJwt, ctxInternalToken, ctxRegularUser;
let dal = require('./dalApplication.js')(
  serviceContext.logger,
  serviceContext.config,
  serviceContext
);
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
function appResourceSetup(resources = [], isTestingLinkedEngines = false) {
  // validate primary resource
  serviceContext.dbConnections['core'].read._push([], false);

  // create package
  serviceContext.dbConnections['core'].write._push(
    [
      {
        packageId: 'packageId',
        packageName: 'new package name',
        organizationId: 7682,
        status: 'draft'
      }
    ],
    false,
    [],
    (sql, params) => {
      expect(params[8]).toEqual('draft');
      return true;
    }
  );

  // get engines
  if (isTestingLinkedEngines) {
    serviceContext.dbConnections['core'].read._push([
      {
        id: 'linkedEngineId'
      }
    ]);

    // deployed build
    serviceContext.dbConnections['core'].read._push([
      {
        id: 'buildId',
        buildStatus: 'deployed'
      }
    ]);

    // get engine schemas
    serviceContext.dbConnections['core'].read._push([
      {
        schemaId: 'schemaId'
      }
    ]);

    serviceContext.dbConnections['core'].read._push([]);
    serviceContext.dbConnections['core'].read._push([]);
    serviceContext.dbConnections['core'].read._push([]);
  } else {
    serviceContext.dbConnections['core'].read._push([]);
  }

  if (!_.isEmpty(resources)) {
    // deployed build
    serviceContext.dbConnections['core'].read._push([
      {
        id: 'buildId',
        buildStatus: 'deployed'
      }
    ]);

    // get engine schemas
    serviceContext.dbConnections['core'].read._push([]);
  }

  // update resources
  if (!_.isEmpty(resources)) {
    _.forEach(resources, (resource, index) => {
      serviceContext.dbConnections['core'].write._push([
        {
          packageId: `packageId${index}`
        }
      ]);
    });
  }

  serviceContext.dbConnections['core'].write._push([
    {
      packageId: 'packageId'
    }
  ]);

  // tx commit
  serviceContext.dbConnections['core'].write._push([], false);

  // get packages
  serviceContext.dbConnections['core'].read._push([
    {
      id: 'packageId',
      organizationId: 7682
    }
  ]);
}

function updateAppResourceSetup() {
  const testPackages = [
    {
      packageId: 'package-1',
      packageVersion: '1.0',
      packageName: '1111 - 111111 - application package 1.0',
      sourceOriginId: null,
      sourcePackageId: null
    },
    {
      packageId: 'package-2',
      packageVersion: '2.0',
      packageName: '1111 - 111111 - application package 2.0',
      sourceOriginId: 'package-1',
      sourcePackageId: 'package-1'
    },
    {
      packageId: 'package-3',
      packageVersion: '3.0',
      packageName: '1111 - 111111 - application package 3.0',
      sourceOriginId: 'package-1',
      sourcePackageId: 'package-2'
    }
  ];

  // get packages
  serviceContext.dbConnections['core'].read._push(testPackages);

  // tx begin
  serviceContext.dbConnections['core'].write._push([], false);

  // get resource by package id
  serviceContext.dbConnections['core'].write._push([
    {
      resourceId: 'schemaId',
      resourceType: 'schema'
    }
  ]);

  // create package
  serviceContext.dbConnections['core'].write._push([
    {
      package_id: 'package-3'
    }
  ]);

  // get engines
  serviceContext.dbConnections['core'].read._push([]);

  // update resources
  serviceContext.dbConnections['core'].write._push([
    {
      packageId: 'package-3'
    }
  ]);
  serviceContext.dbConnections['core'].write._push([
    {
      packageId: 'package-3'
    }
  ]);

  // get packages
  serviceContext.dbConnections['core'].read._push([
    {
      id: 'package-3',
      organizationId: 7682
    }
  ]);

  // tx commit
  serviceContext.dbConnections['core'].write._push([], false);
}

const mockApplicationPackage = (appID) => {
  // bulkUpdateApplicationComponentDb - Empty

  // creating new package from doPackageCreate
  serviceContext.dbConnections['core'].write._push(
    [
      {
        packageId: 'newPackageId'
      }
    ],
    false
  );

  // creating new package from doPackageCreate
  serviceContext.dbConnections['sso'].write._push(
    [
      {
        application_id: appID,
        applicationStatus: 'active'
      }
    ],
    false
  );

  // for org check done in packageUpdateResources()
  serviceContext.dbConnections['core'].write._push(
    [
      {
        organization_id: 7682
      }
    ],
    false
  );
};

function mockDoAppWorkflowPackageUpdate() {
  //getPackages
  serviceContext.dbConnections['core'].write._push(
    [
      {
        id: '321',
        packageId: '321',
        resourceType: 'Application',
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

  // packageUpdateWithoutIncrement
  serviceContext.dbConnections['core'].write._push(
    [
      {
        id: '321',
        packageId: '321',
        packageName: 'test',
        organizationId: 7682,
        status: 'deactivated',
        packageVersion: '1.0.0'
      }
    ],
    false
  );
}

const testHttpCall = (mocked, val) => {
  expect(mocked).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    expect.objectContaining(val),
    expect.any(Function),
    expect.any(String)
  );
};

describe('test dalApplication.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ctxSuperAdmin = structuredClone(mockUtil.makeContext());
    ctxJwt = structuredClone(mockUtil.makeContext({ authType: 'engineJWT' }));
    ctxInternalToken = structuredClone(
      mockUtil.makeContext({ authType: 'api_internal' })
    );
    ctxRegularUser = structuredClone(mockUtil.makeContext());
    ctxRegularUser._authInfo.permissionMasks = [];
  });
  describe('#require', () => {
    it('should have correct function exports', () => {
      expect(typeof dal).toBe('object');
      expect(Object.keys(dal).length).toBe(50);
    });
  });
  describe('#createApplication', () => {
    it('should not require application url', async () => {
      const appID = uuid.v4();
      serviceContext.dbConnections['sso'].read._push([]);
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test'
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.applicationName).toBe('test');
    });
    it('should not require application key', async () => {
      const appID = uuid.v4();
      serviceContext.dbConnections['sso'].read._push([]);
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'appName'
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'appName'
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.applicationName).toBe('appName');
    });
    it('should be ok with url', async () => {
      const appID = uuid.v4();
      serviceContext.dbConnections['sso'].read._push([]);
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com'
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.applicationName).toBe('test');
    });
    it('Should throw error when checkApplicationNameOrKeyConflict return value', async () => {
      const appID = uuid.v4();
      const emitPublicEventSpy = sinon.spy(
        serviceContext.messageUtil,
        'emitPublicEvent'
      );
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com'
        }
      ]);
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          ' The request input did not pass validation checks'
        );
        sinon.assert.calledOnce(emitPublicEventSpy);
        // public event should have been called with the correct event
        sinon.assert.calledWith(
          emitPublicEventSpy,
          sinon.match(supportedEvents.ApplicationCreate),
          sinon.match.any,
          sinon.match.any,
          sinon.match(
            (event) =>
              event.actionInfo && event.actionInfo.actionResult === 'failure'
          )
        );
      }
    });
    it('Should throw error when checkApplicationIdConflict return value', async () => {
      const appID = uuid.v4();
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com'
        }
      ]);
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test again',
              id: appID,
              key: 'test again',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          ' The request input did not pass validation checks'
        );
      }
    });

    it('Should throw error when application ID is not UUID', async () => {
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'Invalid ID format. A UUID is required.'
        );
      }
    });

    it('Should throw error when application URL has http protocol', async () => {
      const appID = uuid.v4();
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test',
              id: appID,
              key: 'test',
              url: 'http://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'Application URL is not valid: http porotocol, localhost and * are not permitted'
        );
      }
    });

    it('Should throw error when application URL has invalid format', async () => {
      const appID = uuid.v4();
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test',
              id: appID,
              key: 'test',
              url: 'whatever'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'Application URL is not valid: http porotocol, localhost and * are not permitted'
        );
      }
    });
    it('Should return entityType when create with entityTags', async () => {
      const appID = uuid.v4();
      serviceContext.dbConnections['sso'].read._push([]); // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com/app',
          owner_organization_id: 7682
        }
      ]);

      serviceContext.dbConnections['core'].write._push([
        {
          entityType: 'app',
          tags: ['tag1', 'tag2']
        }
      ]);

      const context = mockUtil.makeContext();
      _.set(
        context,
        '_authInfo.organization.kvp.features.automaticPackageCreation',
        false
      );

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            id: appID,
            key: 'test',
            url: 'https://local.com/app',
            entityTags: [
              {
                entityType: 'app',
                tags: ['tag1', 'tag2']
              }
            ]
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.applicationName).toBe('test');
      expect(res.entityTags).toBeDefined();
      expect(res.entityTags.length).toBe(1);
      expect(res.entityTags[0].entityType).toBe('app');
      expect(res.entityTags[0].tags).toBeDefined();
      expect(res.entityTags[0].tags.length).toBe(2);
      expect(res.entityTags[0].tags).toContain('tag1');
      expect(res.entityTags[0].tags).toContain('tag2');
    });

    it('Should throw error when application URL is served from localhost', async () => {
      const appID = uuid.v4();
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test',
              id: appID,
              key: 'test',
              url: 'https://localhost.veritone.com'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'Application URL is not valid: http porotocol, localhost and * are not permitted'
        );
      }
    });

    it('Should throw error when application URL is a wildcard', async () => {
      const appID = uuid.v4();
      try {
        await dal.createApplication(
          {
            input: {
              name: 'test',
              id: appID,
              key: 'test',
              url: '*'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'Application URL is not valid: http porotocol, localhost and * are not permitted'
        );
      }
    });

    it('Should accept event subscription configs when creating an application', async () => {
      const appID = uuid.v4();
      const eventSubscriptions = [
        {
          eventName: 'event1',
          eventType: 'type1',
          organizationId: 7682,
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        },
        {
          eventName: 'event2',
          eventType: 'type2',
          organizationId: 7682,
          delivery: {
            name: 'Webhook',
            params: {
              url: 'https://local.com'
            }
          }
        }
      ];
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          headerbar_enabled: false,
          owner_organization_id: 7682
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);

      serviceContext.dal.event.batchSubscribeEvent = jest
        .fn()
        .mockImplementationOnce((ctx, arg) => {
          expect(arg.organizationId).toEqual(7682);
          return Promise.resolve(eventSubscriptions);
        });

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            eventSubscriptions
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
    });

    it('should accept application ID', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].read._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: appID,
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com',
            application_icon_url:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
            application_icon_svg:
              'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[4]).toBe(
            'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png'
          );
          expect(params[5]).toBe(
            'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          );
          return true;
        }
      );
      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            id: appID,
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            iconUrl:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            iconSvg:
              'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
    });

    it('Should create application successfully without oauth2RedirectUrls', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com'
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);

      const spy = jest.spyOn(serviceContext.dal.packages, 'packageCreate');

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app'
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.oauth2RedirectUrls).toBeDefined();
      expect(res.oauth2RedirectUrls.length).toBe(0);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test'
        }),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
    it('Should create application successfully with oauth2RedirectUrls', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          oauth2_redirect_urls:
            'https://test-oauth2.com,https://v2.test-oauth2.com'
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            oauth2RedirectUrls: [
              'https://test-oauth2.com',
              'https://v2.test-oauth2.com'
            ]
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.oauth2RedirectUrls).toBeDefined();
      expect(res.oauth2RedirectUrls.length).toBe(2);
      expect(res.oauth2RedirectUrls[0]).toBe('https://test-oauth2.com');
      expect(res.oauth2RedirectUrls[1]).toBe('https://v2.test-oauth2.com');
    });

    it('Should create application successfully with metadata_version 5', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          metadata_version: 5
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            oauth2RedirectUrls: [''],
            metadata_version: 5
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.metadataVersion).toBe(5);

      // event
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(2);
      expect(messages[0].packageId).toBeDefined();
      expect(messages[0].actionInfo.actionName).toEqual('create');
      expect(messages[0].actionInfo.actionResult).toEqual('success');
      expect(messages[1].applicationId).toBeDefined();
      expect(messages[1].actionInfo.actionName).toEqual('create');
      expect(messages[1].actionInfo.actionResult).toEqual('success');
    });

    it('Should create application successfully with metadata_version 5', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          metadata_version: 5
        }
      ]);
      appResourceSetup();
      mockApplicationPackage(appID);
      try {
        const res = await dal.createApplication(
          {
            input: {
              name: 'test',
              key: 'test',
              url: 'https://local.com/app',
              oauth2RedirectUrls: [''],
              metadata_version: 0
            }
          },
          mockUtil.makeContext()
        );
        expect(res).toBeDefined();
        expect(res.applicationId).toBe(appID);
        expect(res.metadataVersion).toBe(5);
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'metadataVersion 0 is not a valid value'
        );
      }
    });
    it('should create application, with context menu extensions', async () => {
      let res;
      const appID = uuid.v4();
      const context = mockUtil.makeContext();
      const args = {
        input: {
          url: 'https://applicationUrl.com',
          name: 'applicationName',
          description: 'applicationDescription',
          iconUrl: 'https://local.com',
          iconSvg: 'applicationIconSvg',
          organizationId: 7682,
          oauth2RedirectUrls: ['http://oauth2RedirectUrls'],
          permissionsRequired: true,
          contextMenuExtensions: {
            collections: [
              {
                id: 'contextMenuExtensionId',
                label: 'label',
                url: 'https://local.com/${collectionId}',
                type: 'type'
              }
            ]
          }
        }
      };

      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);

      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'applicationName',
          application_key: 'applicationKey',
          application_icon_url: 'https://local.com',
          application_description: 'applicationDescription',
          application_icon_svg: 'applicationIconSvg',
          application_check_permissions: 'applicationCheckPermissions',
          owner_organization_id: 7682,
          application_url: 'https://applicationUrl.com',
          oauth2_redirect_urls: 'http://oauth2RedirectUrls',
          permissions_required: true
        }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId',
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      ]);

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: appID
          }
        ],
        false
      );

      appResourceSetup();
      mockApplicationPackage(appID);

      res = await dal.createApplication(args, context);

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.contextMenuExtensions.length).toBe(1);
      expect(res.contextMenuExtensions[0].id).toBe('contextMenuExtensionId');
    });

    it('should create application, without context menu extensions', async () => {
      let res, err;
      const appID = uuid.v4();
      const context = mockUtil.makeContext();
      const args = {
        input: {
          url: 'https://applicationUrl.com',
          name: 'applicationName',
          description: 'applicationDescription',
          iconUrl: 'https://local.com',
          iconSvg: 'applicationIconSvg',
          organizationId: 7682,
          oauth2RedirectUrls: ['http://oauth2RedirectUrls'],
          permissionsRequired: true,
          eventEndpoint: 'https://applicationUrl.com/eventEndpoint'
        }
      };

      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);

      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'applicationName',
          application_key: 'applicationKey',
          application_icon_url: 'https://local.com',
          application_description: 'applicationDescription',
          application_icon_svg: 'applicationIconSvg',
          application_check_permissions: 'applicationCheckPermissions',
          owner_organization_id: 7682,
          application_url: 'https://applicationUrl.com',
          oauth2_redirect_urls: 'http://oauth2RedirectUrls',
          permissions_required: true,
          event_endpoint: 'https://applicationUrl.com/eventEndpoint'
        }
      ]);

      // validate resource existence
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: appID
          }
        ],
        false
      );

      appResourceSetup();
      mockApplicationPackage();

      res = await dal.createApplication(args, context);

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.eventEndpoint).toBe(
        'https://applicationUrl.com/eventEndpoint'
      );
    });

    it('Should accept isPublic when creating an application', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          public: true
        }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            isPublic: true
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.isPublic).toBe(true);
    });
    it('should create query for upsert headerbar', () => {
      const query = dal.generateAppHeaderbarUpsertQuery({
        application_id: '123',
        headerbar_id: '123',
        organization_guid: 'organizationGuid',
        headerbar_name: 'test',
        background_color: 'blue',
        help_enabled: null,
        notification_enabled: null,
        logo_src: null,
        created_by: '123',
        modified_by: '123'
      });
      const expectedQuery = `insert into "app_headerbar"("application_id","organization_guid","headerbar_id","headerbar_name","background_color","help_enabled","notification_enabled","logo_src","created_by","modified_by") values('123','organizationGuid','123','test','blue',null,null,null,'123','123') ON CONFLICT (application_id, organization_guid) DO UPDATE SET "application_id" = excluded."application_id","organization_guid" = excluded."organization_guid","headerbar_id" = excluded."headerbar_id","headerbar_name" = excluded."headerbar_name","background_color" = excluded."background_color","help_enabled" = excluded."help_enabled","notification_enabled" = excluded."notification_enabled","logo_src" = excluded."logo_src","created_by" = excluded."created_by","modified_by" = excluded."modified_by" RETURNING application_id,organization_guid,headerbar_id,headerbar_name,background_color,help_enabled,notification_enabled,logo_src,created_by,modified_by`;
      expect(query).toBe(expectedQuery);
    });
    it('Should accept headerbarEnabled when creating an application', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          headerbar_enabled: true
        }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            headerbarEnabled: true
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.headerbarEnabled).toBe(true);
    });

    it('Should accept headerbar configs when creating an application', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          headerbar_enabled: true,
          headerbar: {
            name: 'APP_BAR',
            elementId: 'my-app-bar',
            config: {
              title: 'Library',
              backgroundColor: '#000ff',
              help: true,
              zIndex: 1000,
              notification: true,
              displaySupportChat: true,
              logoSrc: 'Absolute path to your logo',
              hidePasswordReset: true
            }
          }
        }
      ]);

      // createApplicationConfigDefinition
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: appID
          }
        ],
        false
      );

      // createApplicationHeaderbar
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          headerbar_name: 'APP_BAR',
          element_id: 'my-app-bar',
          title: 'Library',
          background_color: '#000ff',
          help_enabled: true,
          z_index: 1000,
          notification_enabled: true,
          display_support_chat: true,
          logo_src: 'Absolute path to your logo',
          hide_password_reset: true,
          created_by: 'created by user',
          modified_by: 'modified by user',
          date_created: 'created date time',
          date_modified: 'modified date time'
        }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            headerbarEnabled: true,
            headerbar: {
              name: 'APP_BAR',
              elementId: 'my-app-bar',
              config: {
                title: 'Library',
                backgroundColor: '#000ff',
                help: true,
                zIndex: 1000,
                notification: true,
                displaySupportChat: true,
                logoSrc: 'Absolute path to your logo',
                hidePasswordReset: true
              }
            }
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);

      const expectedHeaderbarResult = {
        name: 'APP_BAR',
        elementId: 'my-app-bar',
        config: {
          title: 'Library',
          backgroundColor: '#000ff',
          help: true,
          zIndex: 1000,
          notification: true,
          displaySupportChat: true,
          logoSrc: 'Absolute path to your logo',
          hidePasswordReset: true
        }
      };

      expect(res.headerbar).toBeDefined();
      expect(JSON.stringify(res.headerbar)).toBe(
        JSON.stringify(expectedHeaderbarResult)
      );
    });

    it('should accept events when creating an application', async () => {
      const appID = uuid.v4();
      const events = [
        {
          eventName: 'testName1',
          eventType: 'testType1',
          public: false,
          description: 'test event1',
          schemaData: 'schema test1'
        },
        {
          eventName: 'testName2',
          eventType: 'testType2',
          public: false,
          description: 'test event2',
          schemaData: 'schema test2'
        }
      ];
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          headerbar_enabled: false,
          events
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);

      //mock for create application events
      serviceContext.dal.event.batchCreateEvents = jest
        .fn()
        .mockResolvedValueOnce(events);

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            headerbarEnabled: false,
            events
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.events).toBeDefined();
      expect(JSON.stringify(res.events)).toBe(JSON.stringify(events));
    });

    it.skip('Should accept applicationConfigDefinition when creating an application', async () => {
      const appID = uuid.v4();
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          applicationConfigDefinition: {
            appId: 'applicationId',
            orgId: 1234,
            configKey: 'test key',
            configType: 'Float',
            configLevel: 'Organization',
            required: true,
            secured: true,
            description: 'test description',
            defaultValue: 'default value'
          }
        }
      ]);

      // createApplicationConfigDefinition
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: appID
          }
        ],
        false
      );
      // createApplicationConfigDefinition
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_type: 'Float',
            config_level: 'Organization',
            is_required: true,
            is_secured: true,
            config_description: 'test description',
            default_value: 'default value',
            created_by: 'created by user',
            modified_by: 'modified by user',
            date_created: 'created date time',
            date_modified: 'modified date time'
          }
        ],
        true,
        'applicationConfigDefinition',
        (sql, values) => {
          function failed(str) {
            return false;
          }
          if (values[0] !== appID)
            return failed(values[0] + ' is not organizationGuid');
          if (values[1] !== 'organizationGuid')
            return failed(values[1] + ' is not organizationGuid');
          if (values[2] !== 'test key')
            return failed(values[2] + ' is not test key');
          if (values[3] !== 'string')
            return failed(values[3] + ' is not string');
          if (values[4] !== 'organization')
            return failed(values[4] + ' is not organization');
          if (values[6] !== 'config description')
            return failed(values[6] + ' is not config description');
          if (values[7] !== 'default value')
            return failed(values[7] + ' is not default value');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push([], false);

      appResourceSetup();
      mockApplicationPackage(appID);
      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            applicationConfigDefinition: [
              {
                appId: appID,
                orgId: 'organizationGuid',
                configKey: 'test key',
                configType: 'String',
                configLevel: 'Organization',
                required: false,
                secured: false,
                description: 'config description',
                defaultValue: 'default value'
              }
            ]
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);

      const expectedApplicationConfigDefinitionResult = [
        {
          applicationId: 'applicationId',
          organizationGuid: 'organizationGuid',
          configKey: 'test key',
          configType: 'Float',
          configLevel: 'Organization',
          isRequired: true,
          isSecured: true,
          configDescription: 'test description',
          defaultValue: 'default value',
          createdBy: 'created by user',
          modifiedBy: 'modified by user',
          dateCreated: 'created date time',
          dateModified: 'modified date time',
          required: true,
          secured: true,
          description: 'test description',
          createdAt: 'created date time',
          modifiedAt: 'modified date time',
          id: 'applicationId#o:organizationGuid#test key'
        }
      ];

      expect(res.applicationConfigDefinition).toBeDefined();
      expect(JSON.stringify(res.applicationConfigDefinition.records[0])).toBe(
        JSON.stringify(expectedApplicationConfigDefinitionResult)
      );
    });

    it.skip('applicationRoles: Should create application roles if it is included in the input', async () => {
      const appID = uuid.v4();
      const appRoles = [
        {
          id: 'id1',
          name: 'name1',
          description: 'description1'
        }
      ];
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          applicationConfigDefinition: {
            appId: 'applicationId',
            orgId: 1234,
            configKey: 'test key',
            configType: 'Float',
            configLevel: 'Organization',
            required: true,
            secured: true,
            description: 'test description',
            defaultValue: 'default value'
          }
        }
      ]);
      // validate resource existence
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: appID }],
        false
      );
      // createApplicationConfigDefinition
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_type: 'Float',
            config_level: 'Organization',
            is_required: true,
            is_secured: true,
            config_description: 'test description',
            default_value: 'default value',
            created_by: 'created by user',
            modified_by: 'modified by user',
            date_created: 'created date time',
            date_modified: 'modified date time'
          }
        ],
        true,
        'applicationConfigDefinition',
        (sql, values) => {
          function failed(str) {
            return false;
          }
          if (values[0] !== appID)
            return failed(values[0] + ' is not organizationGuid');
          if (values[1] !== 'organizationGuid')
            return failed(values[1] + ' is not organizationGuid');
          if (values[2] !== 'test key')
            return failed(values[2] + ' is not test key');
          if (values[3] !== 'string')
            return failed(values[3] + ' is not string');
          if (values[4] !== 'organization')
            return failed(values[4] + ' is not organization');
          if (values[6] !== 'config description')
            return failed(values[6] + ' is not config description');
          if (values[7] !== 'default value')
            return failed(values[7] + ' is not default value');
          return true;
        }
      );
      // serviceContext.dbConnections['sso'].write._push([], false);

      appResourceSetup();
      mockApplicationPackage(appID);

      // mock for create application role
      serviceContext.dal.role.createRoles = jest.fn().mockResolvedValueOnce([
        {
          id: 'id1',
          name: 'name1',
          description: 'description1',
          applicationId: appID
        }
      ]);

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            applicationConfigDefinition: [
              {
                appId: appID,
                orgId: 'organizationGuid',
                configKey: 'test key',
                configType: 'String',
                configLevel: 'Organization',
                required: false,
                secured: false,
                description: 'config description',
                defaultValue: 'default value'
              }
            ],
            applicationRoles: appRoles
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);

      const expectedApplicationConfigDefinitionResult = [
        {
          applicationId: 'applicationId',
          organizationGuid: 'organizationGuid',
          configKey: 'test key',
          configType: 'Float',
          configLevel: 'Organization',
          isRequired: true,
          isSecured: true,
          configDescription: 'test description',
          defaultValue: 'default value',
          createdBy: 'created by user',
          modifiedBy: 'modified by user',
          dateCreated: 'created date time',
          dateModified: 'modified date time',
          required: true,
          secured: true,
          description: 'test description',
          createdAt: 'created date time',
          modifiedAt: 'modified date time',
          id: 'applicationId#o:organizationGuid#test key'
        }
      ];

      expect(res.applicationConfigDefinition).toBeDefined();
      expect(JSON.stringify(res.applicationConfigDefinition.records[0])).toBe(
        JSON.stringify(expectedApplicationConfigDefinitionResult)
      );
      expect(res.applicationRoles).toBeDefined();
      expect(res.applicationRoles.length).toBe(1);
      expect(res.applicationRoles[0].id).toBe('id1');
      expect(res.applicationRoles[0].name).toBe('name1');
      expect(res.applicationRoles[0].description).toBe('description1');
      expect(res.applicationRoles[0].applicationId).toBe(appID);
    });

    it('applicationRoles: Should throw an error if permissions are not valid', async () => {
      const appID = uuid.v4();
      const appRoles = [
        {
          id: 'id1',
          name: 'name1',
          description: 'description1',
          permissions: ['SUPERADMIN', 'ADMIN_ORG_CREATE', 'CMS_ACCESS']
        }
      ];
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);

      appResourceSetup();
      mockApplicationPackage();

      try {
        const res = await dal.createApplication(
          {
            input: {
              name: 'test',
              key: 'test',
              url: 'https://local.com/app',
              applicationConfigDefinition: [
                {
                  appId: appID,
                  orgId: 'organizationGuid',
                  configKey: 'test key',
                  configType: 'String',
                  configLevel: 'Organization',
                  required: false,
                  secured: false,
                  description: 'config description',
                  defaultValue: 'default value'
                }
              ],
              applicationRoles: appRoles
            }
          },
          mockUtil.makeContext()
        );
        expect(res).not.toBeDefined();
      } catch (err) {
        expect(`${err}`).toContain('not_allow');
        expect(`${err}`).toContain(
          'the application roles are invalid. Some permissions are not allowed'
        );
      }
    });

    describe('#_validateApplicationRolePermissions', function () {
      const customConfig = structuredClone(serviceContext.config);
      it('should throw an error when the input is missed', function () {
        const result = dal._validateApplicationRolePermissions();
        expect(result).toBeDefined();
        expect(result.success).toEqual(false);
        expect(`${result.error}`).toContain('invalid_input');
      });

      it('should not throw an error if the input is empty 1 (object)', () => {
        const result = dal._validateApplicationRolePermissions({});
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        expect(result.error).toBeNull();
      });

      it('should not throw an error if the input is empty 2 (array)', () => {
        const result = dal._validateApplicationRolePermissions([]);
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        expect(result.error).toBeNull();
      });

      it('should throw an error if the application roles have invalid permissions (object)', () => {
        const result = dal._validateApplicationRolePermissions({
          id: 'test-app-role-id',
          name: 'test-app-role',
          permissions: ['SUPERADMIN', 'ADMIN_ORG_CREATE', 'CMS_ACCESS']
        });
        expect(result).toBeDefined();
        expect(result.success).toEqual(false);
        expect(result.error).toBeDefined();
        expect(`${result.error}`).toContain('not_allow');
        expect(`${result.error}`).toContain(
          'the application roles are invalid. Some permissions are not allowed'
        );
      });
      it('should not throw an error if the whitelist is empty', function () {
        // whitelist
        _.set(customConfig, 'rbac.permissions.whitelist', []);
        let dal = require('./dalApplication.js')(
          serviceContext.logger,
          customConfig,
          serviceContext
        );
        const result = dal._validateApplicationRolePermissions({
          id: 'test-app-role-id',
          name: 'test-app-role',
          permissions: ['AIWARE_TASK_CREATE', 'AIWARE_TASK_DELETE']
        });
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        expect(_.isNil(result.error)).toEqual(true);
      });
      it('should throw an error if the blacklist is not set in the config, the default value is used', function () {
        // whitelist
        _.set(customConfig, 'rbac.permissions.whitelist', [
          'SUPERADMIN',
          'VERITONE_SUPERADMIN'
        ]);
        // blacklist
        _.set(customConfig, 'rbac.permissions.blacklist', null);
        let dal = require('./dalApplication.js')(
          serviceContext.logger,
          customConfig,
          serviceContext
        );
        const result = dal._validateApplicationRolePermissions({
          id: 'test-app-role-id',
          name: 'test-app-role',
          permissions: ['AIWARE_TASK_CREATE', 'SUPERADMIN']
        });
        expect(result).toBeDefined();
        expect(result.success).toEqual(false);
        expect(result.error).toBeDefined();
        expect(`${result.error}`).toContain('not_allow');
        expect(`${result.error}`).toContain(
          'the application roles are invalid. Some permissions are not allowed'
        );
      });
      it('should throw an error if the permission is in blacklist and whitelist', function () {
        // whitelist
        _.set(customConfig, 'rbac.permissions.whitelist', [
          'AIWARE_TASK_CREATE',
          'AIWARE_TASK_DELETE'
        ]);
        // blacklist
        _.set(customConfig, 'rbac.permissions.blacklist', [
          'SUPERADMIN',
          'AIWARE_TASK_DELETE'
        ]);
        let dal = require('./dalApplication.js')(
          serviceContext.logger,
          customConfig,
          serviceContext
        );
        const result = dal._validateApplicationRolePermissions({
          id: 'test-app-role-id',
          name: 'test-app-role',
          permissions: ['AIWARE_TASK_CREATE', 'AIWARE_TASK_DELETE']
        });
        expect(result).toBeDefined();
        expect(result.success).toEqual(false);
        expect(result.error).toBeDefined();
        expect(`${result.error}`).toContain('not_allow');
        expect(`${result.error}`).toContain(
          'the application roles are invalid. Some permissions are not allowed'
        );
      });
      it('should not throw an error', function () {
        // whitelist
        _.set(customConfig, 'rbac.permissions.whitelist', [
          'AIWARE_TASK_CREATE',
          'AIWARE_TASK_DELETE'
        ]);
        // blacklist
        _.set(customConfig, 'rbac.permissions.blacklist', [
          'SUPERADMIN',
          'VERITONE_SUPERADMIN',
          'AIWARE_ADMIN_INSTANCE_ADMIN'
        ]);
        let dal = require('./dalApplication.js')(
          serviceContext.logger,
          customConfig,
          serviceContext
        );
        const result = dal._validateApplicationRolePermissions({
          id: 'test-app-role-id',
          name: 'test-app-role',
          permissions: ['AIWARE_TASK_CREATE', 'AIWARE_TASK_DELETE']
        });
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        expect(_.isNil(result.error)).toEqual(true);
      });
      // VE-25569: every case above injects a synthetic whitelist, so none of
      // them exercise the list that actually ships — which is how the
      // destination permissions reached production missing from it. This runs
      // the validator against the real config defaults, covering both the
      // list contents and the matching logic.
      it('should not throw an error for the destination permissions under the shipped config defaults', function () {
        const schema = new GraphQLServiceConfig().getServiceConfigSchema();
        const shippedConfig = structuredClone(serviceContext.config);
        _.set(shippedConfig, 'rbac.permissions.whitelist', [
          ...schema.rbac.permissions.whitelist.default
        ]);
        _.set(shippedConfig, 'rbac.permissions.blacklist', [
          ...schema.rbac.permissions.blacklist.default
        ]);
        let dal = require('./dalApplication.js')(
          serviceContext.logger,
          shippedConfig,
          serviceContext
        );
        const result = dal._validateApplicationRolePermissions({
          id: 'test-app-role-id',
          name: 'test-app-role',
          permissions: [
            'AIWARE_DESTINATION_CREATE',
            'AIWARE_DESTINATION_READ',
            'AIWARE_DESTINATION_UPDATE',
            'AIWARE_DESTINATION_DELETE'
          ]
        });
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        expect(_.isNil(result.error)).toEqual(true);
      });
    });
  });

  describe('#updateApplication', () => {
    it('should throw error when application is not found', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push([], false);
        await dal.updateApplication(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('not_found');
        expect(error.data.objectId).toBe('123');
      }
    });
    it('should throw error when user is not admin and not in requested organization ', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        // checkApplicationNameOrKeyConflict
        serviceContext.dbConnections['sso'].read._push([], false);
        const context = structuredClone(mockUtil.makeContext());
        context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
        await dal.updateApplication(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          context
        );
      } catch (error) {
        expect(error.name).toBe('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to update this application'
        );
      }
    });
    it('should throw error when checkApplicationNameOrKeyConflict fails ', async () => {
      try {
        //get data to fill out form
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        //checkApplicationNameOrKeyConflict
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        await dal.updateApplication(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'The request input did not pass validation checks'
        );
      }
    });

    it('should throw error metadata_version has to be higher ', async () => {
      try {
        //get data to fill out form
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com',
              metadata_version: 5
            }
          ],
          false
        );
        //checkApplicationNameOrKeyConflict
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        await dal.updateApplication(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app',
              metadataVersion: 3
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'The app metadata version specified must be greater than'
        );
      }
    });

    it('should throw error metadataVersion 0 is not a valid value ', async () => {
      try {
        //get data to fill out form
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com',
              metadata_version: 5
            }
          ],
          false
        );
        //checkApplicationNameOrKeyConflict
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        await dal.updateApplication(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app',
              metadataVersion: 0
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'metadataVersion 0 is not a valid value'
        );
      }
    });
    it('should throw error when user does not have privileges to edit input fields ', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: '_test',
              application_key: '_test',
              application_url: 'https://local.com_'
            }
          ],
          false
        );
        serviceContext.dbConnections['sso'].write._push([], false);
        await dal.updateApplication(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error.name).toBe('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to update this application with this status'
        );
      }
    });

    it('should accept eventSubscriptions when creating an application', async () => {
      const appID = uuid.v4();
      const eventSubscriptions = [
        {
          eventName: 'event1',
          eventType: 'type1',
          organizationId: 7682,
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        },
        {
          eventName: 'event2',
          eventType: 'type2',
          organizationId: 7682,
          delivery: {
            name: 'Webhook',
            params: {
              url: 'https://local.com'
            }
          }
        }
      ];
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          headerbar_enabled: false,
          eventSubscriptions,
          owner_organization_id: 7682
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);

      //mock for create application events
      serviceContext.dal.event.batchSubscribeEvent = jest
        .fn()
        .mockImplementationOnce((ctx, arg) => {
          expect(arg.organizationId).toEqual(7682);
          return Promise.resolve(eventSubscriptions);
        });

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            headerbarEnabled: false,
            eventSubscriptions
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.eventSubscriptions).toBeDefined();
      expect(JSON.stringify(res.eventSubscriptions)).toBe(
        JSON.stringify(eventSubscriptions)
      );
    });

    it('should accept eventSubscriptions and unsubscribeEvents when creating an application', async () => {
      const appID = uuid.v4();
      const eventSubscriptions = [
        {
          eventName: 'event1',
          eventType: 'type1',
          organizationId: 7682,
          delivery: {
            name: 'Email',
            params: {
              address: 'me@veritone.com'
            }
          }
        },
        {
          eventName: 'event2',
          eventType: 'type2',
          organizationId: 7682,
          delivery: {
            name: 'Webhook',
            params: {
              url: 'https://local.com'
            }
          },
          action: 'subscribe'
        },
        {
          id: '123',
          action: 'unsubscribe'
        },
        {
          id: '3333',
          action: 'unsubscribe'
        }
      ];
      // checkApplicationNameOrKeyConflict
      serviceContext.dbConnections['sso'].write._push([]);
      // createApplication
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: appID,
          application_name: 'test',
          application_key: 'test',
          application_url: 'https://local.com',
          headerbar_enabled: false,
          eventSubscriptions,
          owner_organization_id: 7682
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      appResourceSetup();
      mockApplicationPackage(appID);

      //mock for create application events
      serviceContext.dal.event.batchSubscribeEvent = jest
        .fn()
        .mockImplementationOnce((ctx, arg) => {
          expect(arg.organizationId).toEqual(7682);
          return Promise.resolve(eventSubscriptions);
        });
      serviceContext.dal.event.batchUnsubscribeEvent = jest
        .fn()
        .mockImplementationOnce((ctx, arg) => {
          expect(arg.organizationId).toEqual(7682);
          return Promise.resolve([]);
        });

      const res = await dal.createApplication(
        {
          input: {
            name: 'test',
            key: 'test',
            url: 'https://local.com/app',
            headerbarEnabled: false,
            eventSubscriptions
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.applicationId).toBe(appID);
      expect(res.eventSubscriptions).toBeDefined();
      expect(JSON.stringify(res.eventSubscriptions)).toBe(
        JSON.stringify(eventSubscriptions)
      );
    });
    it('should return response successfully simple', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com',
            application_status: 'approved',
            application_icon_url:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
            application_icon_svg:
              'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);

      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });

      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            url: 'https://local.com',
            iconUrl:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc',
            iconSvg:
              'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          }
        },
        {
          ...ctxSuperAdmin,
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');

      // event
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(expect.any(Object));
      expect(messages[0].actionInfo.actionName).toEqual('update');

      testHttpCall(httpCallMock, {
        applicationIconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
    });
    it('should return response successfully when name is not provided in input params', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            //no name is provided
            id: '123',
            key: 'test',
            url: 'https://local.com'
          }
        },
        {
          ...ctxSuperAdmin,
          name: 'test',
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });
    it('should return response successfully when url is not provided in input params', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            //no url is provided
            name: 'test',
            id: '123',
            key: 'test'
          }
        },
        {
          ...ctxSuperAdmin,
          url: 'https://local.com',
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });
    it('should return response successfully with oauth2RedirectUrls', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            oauth2RedirectUrls: ['']
          }
        },
        {
          ...ctxSuperAdmin,
          url: 'https://local.com',
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });
    it('should return response successfully with checkPermissions', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            checkPermissions: true
          }
        },
        {
          ...mockUtil.makeContext(),
          url: 'https://local.com',
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });

    it('should return response successfully with isPublic', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com',
            public: true
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        public: true,
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            isPublic: true
          }
        },
        {
          ...mockUtil.makeContext(),
          url: 'https://local.com',
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });

    it('should return response successfully with deploymentModel', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            checkPermissions: true,
            deploymentModel: 'test'
          }
        },
        {
          ...mockUtil.makeContext(),
          url: 'https://local.com',
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });
    it('should return response successfully when url is not provided in both input params and returned application', async () => {
      serviceContext.dbConnections['sso'].write._push(
        // no application url is returned
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl:
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test'
          }
        },
        {
          ...ctxSuperAdmin,
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.applicationName).toBe('test');
    });

    it('should update application, with context menu extensions data', async () => {
      let res;
      const args = {
        input: {
          id: 'applicationId',
          name: 'applicationName',
          key: 'applicationKey',
          contextMenuExtensions: {
            collections: [
              {
                id: 'contextMenuExtensionId',
                label: 'label',
                url: 'https://local.com/${collectionId}',
                type: 'type'
              }
            ]
          }
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        // no application url is returned
        [
          {
            application_id: 'applicationId',
            application_name: 'applicationName',
            application_key: 'applicationKey'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);

      serviceContext.dbConnections['sso'].write._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId',
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      ]);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '49bf1b7b-587a-4b78-b289-26709b82e77e',
        applicationName: 'applicationName',
        applicationKey: 'applicationKey',
        iconUrl: 'https://local.com',
        applicationDescription: 'applicationDescription',
        applicationIconSvg: 'applicationIconSvg',
        applicationCheckPermissions: 'applicationCheckPermissions',
        ownerOrganizationId: 7682,
        applicationUrl: 'https://applicationUrl',
        oauth2RedirectUrls: 'http://oauth2RedirectUrls',
        permissionsRequired: true
      });

      updateAppResourceSetup();
      res = await dal.updateApplication(args, {
        ...ctxSuperAdmin,
        config: {
          services: {
            coreAdminUri: ''
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('49bf1b7b-587a-4b78-b289-26709b82e77e');
      expect(res.contextMenuExtensions.length).toBe(1);
      expect(res.contextMenuExtensions[0].id).toBe('contextMenuExtensionId');
    });

    it('should update application, without context menu extensions data', async () => {
      let res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'applicationId',
          name: 'applicationName',
          key: 'applicationKey',
          eventEndpoint: 'https://applicationUrl.com/eventEndpoint'
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        // no application url is returned
        [
          {
            application_id: 'applicationId',
            application_name: 'applicationName',
            application_key: 'applicationKey'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '49bf1b7b-587a-4b78-b289-26709b82e77e',
        applicationName: 'applicationName',
        applicationKey: 'applicationKey',
        iconUrl: 'https://local.com',
        applicationDescription: 'applicationDescription',
        applicationIconSvg: 'applicationIconSvg',
        applicationCheckPermissions: 'applicationCheckPermissions',
        ownerOrganizationId: 7682,
        applicationUrl: 'https://applicationUrl',
        oauth2RedirectUrls: 'http://oauth2RedirectUrls',
        permissionsRequired: true,
        eventEndpoint: 'https://applicationUrl.com/eventEndpoint'
      });

      updateAppResourceSetup();
      res = await dal.updateApplication(args, {
        ...ctxSuperAdmin,
        config: {
          services: {
            coreAdminUri: ''
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('49bf1b7b-587a-4b78-b289-26709b82e77e');
      expect(res.eventEndpoint).toBe(
        'https://applicationUrl.com/eventEndpoint'
      );
    });

    it('should update application, with nodeModules', async () => {
      let res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'applicationId',
          name: 'applicationName',
          key: 'applicationKey',
          nodeModules: [
            {
              moduleName: 'Test Module',
              moduleVersion: '1.0.0',
              moduleRepo: 'github'
            },
            {
              moduleId: 'moduleId',
              moduleRepo: 'npm',
              status: 'deleted'
            }
          ]
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        // no application url is returned
        [
          {
            application_id: 'applicationId',
            application_name: 'applicationName',
            application_key: 'applicationKey',
            node_modules: [
              {
                module_name: 'Test Module',
                module_version: '1.0.0',
                module_repo: 'github'
              }
            ]
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);

      jest.mock('request-promise', () => () => {
        return {
          application_id: '49bf1b7b-587a-4b78-b289-26709b82e77e',
          application_name: 'applicationName',
          application_key: 'applicationKey',
          application_icon_url: 'https://local.com',
          application_description: 'applicationDescription',
          application_icon_svg: 'applicationIconSvg',
          application_check_permissions: 'applicationCheckPermissions',
          owner_organization_id: 7682,
          application_url: 'https://applicationUrl',
          oauth2_redirect_urls: 'http://oauth2RedirectUrls',
          permissions_required: true,
          event_endpoint: 'https://applicationUrl.com/eventEndpoint',
          node_modules: [
            {
              module_name: 'Test Module',
              module_version: '1.0.0',
              module_repo: 'github'
            }
          ]
        };
      });

      httpCallMock.mockResolvedValueOnce({
        applicationId: '49bf1b7b-587a-4b78-b289-26709b82e77e',
        applicationName: 'applicationName',
        applicationKey: 'applicationKey',
        iconUrl: 'https://local.com',
        applicationDescription: 'applicationDescription',
        applicationIconSvg: 'applicationIconSvg',
        applicationCheckPermissions: 'applicationCheckPermissions',
        ownerOrganizationId: 7682,
        applicationUrl: 'https://applicationUrl',
        oauth2RedirectUrls: 'http://oauth2RedirectUrls',
        permissionsRequired: true,
        eventEndpoint: 'https://applicationUrl.com/eventEndpoint',
        nodeModules: [
          {
            moduleName: 'Test Module',
            moduleVersion: '1.0.0',
            moduleRepo: 'github'
          }
        ]
      });

      mockApplicationPackage();
      updateAppResourceSetup();
      res = await dal.updateApplication(args, {
        ...ctxSuperAdmin,
        config: {
          services: {
            coreAdminUri: ''
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('49bf1b7b-587a-4b78-b289-26709b82e77e');
      expect(res.nodeModules).toHaveLength(1);
    });

    it('should update application, with headerbar config', async () => {
      let res;
      const args = {
        input: {
          id: 'applicationId',
          name: 'applicationName',
          key: 'applicationKey',
          headerbar: {
            name: 'APP_BAR',
            elementId: 'my-app-bar',
            config: {
              title: 'Library',
              backgroundColor: '#000ff',
              help: true,
              zIndex: 1000,
              notification: true,
              displaySupportChat: true,
              logoSrc: 'Absolute path to your logo',
              hidePasswordReset: true
            }
          }
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'applicationName',
            application_key: 'applicationKey',
            headerbar: {
              name: 'APP_BAR',
              elementId: 'my-app-bar',
              config: {
                title: 'Library',
                backgroundColor: '#000ff',
                help: true,
                zIndex: 1000,
                notification: true,
                displaySupportChat: true,
                logoSrc: 'Absolute path to your logo',
                hidePasswordReset: true
              }
            }
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].write._push([], false);

      httpCallMock.mockResolvedValueOnce({
        applicationId: '49bf1b7b-587a-4b78-b289-26709b82e77e',
        applicationName: 'applicationName',
        applicationKey: 'applicationKey',
        iconUrl: 'https://local.com',
        applicationDescription: 'applicationDescription',
        applicationIconSvg: 'applicationIconSvg',
        applicationCheckPermissions: 'applicationCheckPermissions',
        ownerOrganizationId: 7682,
        applicationUrl: 'https://applicationUrl',
        oauth2RedirectUrls: 'http://oauth2RedirectUrls',
        permissionsRequired: true,
        headerbar: {
          name: 'APP_BAR',
          elementId: 'my-app-bar',
          config: {
            title: 'Library',
            backgroundColor: '#000ff',
            help: true,
            zIndex: 1000,
            notification: true,
            displaySupportChat: true,
            logoSrc: 'Absolute path to your logo',
            hidePasswordReset: true
          }
        }
      });

      // updateApplicationHeaderbar
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [{ organization_guid: 'organizationGuid' }],
        true,
        [],
        (sql, params) => {
          expect(params[0]).toEqual(7682);
          return true;
        }
      );

      serviceContext.dbConnections['sso'].write._push([
        {
          headerbar_name: 'APP_BAR',
          element_id: 'my-app-bar',
          title: 'Library',
          background_color: '#000ff',
          help_enabled: true,
          z_index: 1000,
          notification_enabled: true,
          display_support_chat: true,
          logo_src: 'Absolute path to your logo',
          hide_password_reset: true,
          created_by: 'created by user',
          modified_by: 'modified by user',
          date_created: 'created date time',
          date_modified: 'modified date time'
        }
      ]);

      updateAppResourceSetup();
      res = await dal.updateApplication(args, {
        ...ctxSuperAdmin,
        config: {
          services: {
            coreAdminUri: ''
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('49bf1b7b-587a-4b78-b289-26709b82e77e');

      const expectedHeaderbarResult = {
        name: 'APP_BAR',
        elementId: 'my-app-bar',
        config: {
          title: 'Library',
          backgroundColor: '#000ff',
          help: true,
          zIndex: 1000,
          notification: true,
          displaySupportChat: true,
          logoSrc: 'Absolute path to your logo',
          hidePasswordReset: true
        }
      };

      expect(res.headerbar).toBeDefined();
      expect(JSON.stringify(res.headerbar)).toBe(
        JSON.stringify(expectedHeaderbarResult)
      );
    });

    it('should update application events', async () => {
      let res;
      const eventsToUpdate = [
        {
          id: 'eventId1',
          description: 'updated description 1'
        },
        {
          id: 'eventId2',
          description: 'updated description 2'
        }
      ];

      const args = {
        input: {
          id: 'applicationId',
          name: 'applicationName',
          key: 'applicationKey',
          events: eventsToUpdate
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'applicationName',
            application_key: 'applicationKey',
            events: eventsToUpdate
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].write._push([], false);

      httpCallMock.mockResolvedValueOnce({
        applicationId: '49bf1b7b-587a-4b78-b289-26709b82e77e',
        applicationName: 'applicationName',
        applicationKey: 'applicationKey',
        iconUrl: 'https://local.com',
        applicationDescription: 'applicationDescription',
        applicationIconSvg: 'applicationIconSvg',
        applicationCheckPermissions: 'applicationCheckPermissions',
        ownerOrganizationId: 7682,
        applicationUrl: 'https://applicationUrl',
        oauth2RedirectUrls: 'http://oauth2RedirectUrls',
        permissionsRequired: true,
        events: eventsToUpdate
      });

      // updateApplicationHeaderbar
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dal.event.batchUpdateEvents = jest
        .fn()
        .mockResolvedValueOnce(eventsToUpdate);

      updateAppResourceSetup();
      res = await dal.updateApplication(args, {
        ...ctxSuperAdmin,
        config: {
          services: {
            coreAdminUri: ''
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('49bf1b7b-587a-4b78-b289-26709b82e77e');
      expect(res.events).toBeDefined();
      expect(JSON.stringify(res.events)).toBe(JSON.stringify(eventsToUpdate));
    });

    it('should create/update application events on update', async () => {
      let res;
      const eventsToCreate = [
        {
          eventName: 'event1',
          eventType: 'webhook',
          description: 'created description 1',
          public: false,
          schemaData: '{schema: "data"}'
        }
      ];
      const eventsToUpdate = [
        {
          id: 'eventId2',
          description: 'updated description 2'
        }
      ];

      const returnEvents = [...eventsToCreate, ...eventsToUpdate];

      const args = {
        input: {
          id: 'applicationId',
          name: 'applicationName',
          key: 'applicationKey',
          events: returnEvents
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'applicationName',
            application_key: 'applicationKey',
            events: returnEvents
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].write._push([], false);

      httpCallMock.mockResolvedValueOnce({
        applicationId: '49bf1b7b-587a-4b78-b289-26709b82e77e',
        applicationName: 'applicationName',
        applicationKey: 'applicationKey',
        iconUrl: 'http://localhost',
        applicationDescription: 'applicationDescription',
        applicationIconSvg: 'applicationIconSvg',
        applicationCheckPermissions: 'applicationCheckPermissions',
        ownerOrganizationId: 7682,
        applicationUrl: 'http://applicationUrl',
        oauth2RedirectUrls: 'http://oauth2RedirectUrls',
        permissionsRequired: true,
        events: returnEvents
      });

      // updateApplicationHeaderbar
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dal.event.batchUpdateEvents = jest
        .fn()
        .mockResolvedValueOnce(eventsToUpdate);

      serviceContext.dal.event.batchCreateEvents = jest
        .fn()
        .mockResolvedValueOnce(eventsToCreate);

      updateAppResourceSetup();
      res = await dal.updateApplication(args, {
        ...ctxSuperAdmin,
        config: {
          services: {
            coreAdminUri: ''
          }
        }
      });

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('49bf1b7b-587a-4b78-b289-26709b82e77e');
      expect(res.events).toBeDefined();
      expect(JSON.stringify(res.events)).toBe(JSON.stringify(returnEvents));
    });

    it('should remove iconUrl if empty string is passed', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com',
            application_status: 'approved',
            application_icon_url:
              'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png',
            application_icon_svg:
              'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);
      httpCallMock.mockResolvedValueOnce({
        applicationId: '123',
        applicationName: 'test',
        applicationKey: 'test',
        applicationUrl: 'https://local.com',
        iconUrl: '',
        applicationIconSvg:
          'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
      });
      updateAppResourceSetup();

      const res = await dal.updateApplication(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            url: 'https://local.com',
            iconUrl: '',
            iconSvg:
              'https://s3.amazonaws.com/not-support-bucket.com/7682/other/icon.svg?signedParams=abc'
          }
        },
        {
          ...ctxSuperAdmin,
          config: {
            services: {
              coreAdminUri: ''
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toBe('123');
      expect(res.iconUrl).toBe('');
    });
  });

  describe('#applicationWorkflow', () => {
    it('should throw error when no application is returned', async () => {
      serviceContext.dbConnections['sso'].write._push([], false);
      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete'
            }
          },
          mockUtil.makeContext()
        )
        .then((data) => {})
        .catch((err) => {
          expect(err.name).toBe('not_found');
          expect(_.toString(err)).toContain(
            'The requested object was not found'
          );
        });
    });
    it('should return response successfully with oauthUrls', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      mockDoAppWorkflowPackageUpdate();

      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete',
              oauth2RedirectUrls: ['']
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
          expect(data.id).toBe('123');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
    it('should return response successfully with deploymentModel', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      mockDoAppWorkflowPackageUpdate();

      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete',
              oauth2RedirectUrls: [''],
              deploymentModel: 'test'
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
          expect(data.id).toBe('123');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
    it('should return response successfully when coreAdminUri already ends with /', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      mockDoAppWorkflowPackageUpdate();

      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete',
              oauth2RedirectUrls: [''],
              deploymentModel: 'test'
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: '/'
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
          expect(data.id).toBe('123');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
    it('should return response successfully with checkPermissions', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      mockDoAppWorkflowPackageUpdate();

      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete',
              oauth2RedirectUrls: [''],
              checkPermissions: true
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
          expect(data.id).toBe('123');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
    it('should return response successfully without action input', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      mockDoAppWorkflowPackageUpdate();

      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              action: undefined,
              url: 'https://local.com',
              oauth2RedirectUrls: [''],
              checkPermissions: true
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
          expect(data.id).toBe('123');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
    it('should return response successfully', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      mockDoAppWorkflowPackageUpdate();

      return dal
        .applicationWorkflow(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete'
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
          expect(data.id).toBe('123');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
  });
  describe('#deleteApplication', () => {
    it('should delete application data successfully when coreAdminUri does not end with /', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });
      return dal
        .deleteApplication(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete'
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
    it('should delete application data successfully when coreAdminUri ends with /', async () => {
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: '123',
        applicationStatus: 'deleted',
        key: 'test',
        url: 'https://local.com/app'
      });
      return dal
        .deleteApplication(
          {
            input: {
              name: 'test',
              id: '123',
              key: 'test',
              url: 'https://local.com',
              action: 'undelete'
            }
          },
          {
            ...mockUtil.makeContext(),
            config: {
              services: {
                coreAdminUri: '/'
              }
            }
          }
        )
        .then((data) => {
          expect(data).toBeDefined();

          // event
          expect(serviceContext.messageUtil._counter()).toBe(1);
          const messages = serviceContext.messageUtil._messages();
          expect(messages[0].actionInfo).toEqual(expect.any(Object));
          expect(messages[0].actionInfo.actionName).toEqual('delete');
        })
        .catch((err) => {
          expect(err).toBeFalsy();
        });
    });
  });
  describe('#updateApplicationComponent', () => {
    it('should throw error when application is not found', async () => {
      serviceContext.dbConnections['sso'].write._push([], false);
      await dal
        .updateApplicationComponent(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        )
        .catch((err) => {
          expect(err.name).toBe('not_found');
          expect(err.data.objectId).toBe('123');
        });
    });
    it('should throw error when user is not admin and not in requested organization ', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        const context = structuredClone(mockUtil.makeContext());
        context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
        await dal.updateApplicationComponent(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app'
            }
          },
          context
        );
      } catch (error) {
        expect(error.name).toBe('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to update this application'
        );
      }
    });
    it('should throw error when componentIds contains invalid id ', async () => {
      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      await dal
        .updateApplicationComponent(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app',
              type: 'dataRegistries',
              componentIds: ['123e4567-e89b-12d3-a456-'] //invalid uuid
            }
          },
          mockUtil.makeContext()
        )
        .catch((err) => {
          expect(err).toBeDefined();
          expect(err.name).toBe('invalid_input');
          expect(_.toString(err)).toContain(
            'Invalid ID format. A UUID is required'
          );
        });
    });
    it('should update application component successfully and return response with engines type', async () => {
      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      //update application component
      serviceContext.dbConnections['core'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      const res = await dal
        .updateApplicationComponent(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              type: 'engines',
              url: 'https://local.com/app',
              componentIds: ['123e4567-e89b-12d3-a456-426655440000'],
              action: 'add'
            }
          },
          mockUtil.makeContext()
        )
        .catch((err) => {
          expect(err).toBeFalsy();
        });
      expect(res).toBeDefined();
      expect(res.id).toBe('123');
    });
    it('should update application component successfully and return response with dataRegistries type ', async () => {
      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      const res = await dal
        .updateApplicationComponent(
          {
            input: {
              name: 'test',
              id: '123',
              applicationStatus: 'deleted',
              key: 'test',
              url: 'https://local.com/app',
              type: 'dataRegistries',
              componentIds: ['123e4567-e89b-12d3-a456-426655440000'],
              action: 'add'
            }
          },
          mockUtil.makeContext()
        )
        .catch((err) => {
          expect(err).toBeFalsy();
        });
      expect(res).toBeDefined();
      expect(res.id).toBe('123');
    });

    it('should throw InvalidInput, if add invalid application type component', async () => {
      const context = mockUtil.makeContext();
      const args = {
        input: { id: 'applicationId', action: 'add', type: 'abc' }
      };

      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      expect(async () =>
        dal.updateApplicationComponent(args, context)
      ).rejects.toThrow('Update Failed: Unknown application component');
    });

    it('should add engine components', async () => {
      let res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'applicationId',
          action: 'add',
          type: 'engines',
          componentIds: ['engineId1', 'engineId2']
        }
      };

      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push([
        { application_id: 'applicationId', engine_id: 'engineId' }
      ]);

      res = await dal.updateApplicationComponent(args, context);

      expect(res).toBeDefined();
      expect(res.id).toBe('applicationId');
    });

    it('should throw InvalidInput, if remove inavlid application type component', async () => {
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'applicationId',
          action: 'remove',
          type: 'abc'
        }
      };

      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      expect(async () =>
        dal.updateApplicationComponent(args, context)
      ).rejects.toThrow('Update Failed: Unknown application component');
    });

    it('should remove engine components', async () => {
      let res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'applicationId',
          action: 'remove',
          type: 'engines',
          componentIds: ['engineId1', 'engineId2']
        }
      };

      //check application exist
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push([], false);

      res = await dal.updateApplicationComponent(args, context);

      expect(res).toBeDefined();
      expect(res.id).toBe('applicationId');
    });
  });
  describe('#getContextMenuExtensions', () => {
    it('should return data successfully ', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_context_menu_id: '1234',
            type: 'test',
            label: 'test',
            url: 'https://local.com'
          }
        ],
        false
      );
      const res = await dal.getContextMenuExtensions(
        {
          input: {
            name: 'test',
            id: '123',
            key: 'test',
            url: 'https://local.com/app'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res[0].id).toBe('1234');
    });

    it('should get context menu extenstions, by id', async () => {
      let res;
      const options = { id: 'contextMenuExtensionId' };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId'
        }
      ]);

      res = await dal.getContextMenuExtensions(options);

      expect(res).toBeDefined();
      expect(res[0].id).toBe('contextMenuExtensionId');
    });

    it('should get context menu extenstions, by applicationId', async () => {
      let res;
      const options = { applicationId: 'applicationId' };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId'
        }
      ]);

      res = await dal.getContextMenuExtensions(options);

      expect(res).toBeDefined();
      expect(res[0].id).toBe('contextMenuExtensionId');
      expect(res[0].applicationId).toBe('applicationId');
    });

    it('should get context menu extenstions, by organizationId', async () => {
      let res;
      const options = { organizationId: 'organizationId' };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId'
        }
      ]);

      res = await dal.getContextMenuExtensions(options);

      expect(res).toBeDefined();
      expect(res[0].id).toBe('contextMenuExtensionId');
      expect(res[0].applicationId).toBe('applicationId');
    });

    it('should get all context menu extenstions, no filter', async () => {
      let res;
      const options = {};

      serviceContext.dbConnections['sso'].read._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId'
        }
      ]);

      res = await dal.getContextMenuExtensions(options);

      expect(res).toBeDefined();
      expect(res[0].id).toBe('contextMenuExtensionId');
      expect(res[0].applicationId).toBe('applicationId');
    });
  });
  describe('#createContextMenuExtension', () => {
    it('should throw error when application is not found', async () => {
      serviceContext.dbConnections['sso'].write._push([], false);
      await dal
        .createContextMenuExtension(
          {
            input: {
              id: '123',
              name: 'test',
              type: 'test',
              label: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        )
        .catch((err) => {
          expect(err.name).toBe('not_found');
          expect(err.data.objectId).toBe('123');
        });
    });
    it('should throw error when user is not admin and not in requested organization ', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              application_id: '123',
              application_name: 'test',
              application_key: 'test',
              application_url: 'https://local.com'
            }
          ],
          false
        );
        const context = structuredClone(mockUtil.makeContext());
        context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
        await dal.createContextMenuExtension(
          {
            input: {
              id: '123',
              name: 'test',
              type: 'test',
              label: 'test',
              url: 'https://local.com/app'
            }
          },
          context
        );
      } catch (error) {
        expect(error.name).toBe('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to create this resource'
        );
      }
    });
    it('should create context menu extension successfully and return response', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_context_menu_id: '1234',
            type: 'test',
            label: 'test',
            url: 'https://local.com'
          }
        ],
        false
      );
      const res = await dal.createContextMenuExtension(
        {
          input: {
            id: '123',
            name: 'test',
            type: 'test',
            label: 'test',
            url: 'https://local.com/app'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('1234');
    });
    it('should create a context menu extension, with id input', async () => {
      let res;
      const args = {
        input: {
          id: 'contextMenuExtensionId',
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].write._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId',
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      ]);

      res = await dal.createContextMenuExtension(args, mockUtil.makeContext());

      expect(res).toBeDefined();
      expect(res.id).toBe('contextMenuExtensionId');
      expect(res.applicationId).toBe('applicationId');
      expect(res.label).toBe('label');
      expect(res.url).toBe('https://local.com');
      expect(res.type).toBe('type');
    });

    it('should create a context menu extension', async () => {
      let res;
      const args = {
        input: {
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].write._push([
        {
          application_context_menu_id: 'eb3a1710-9638-4832-824d-bdfb6eae6d8d',
          application_id: 'applicationId',
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      ]);

      res = await dal.createContextMenuExtension(args, mockUtil.makeContext());

      expect(res).toBeDefined();
      expect(res.id).toBe('eb3a1710-9638-4832-824d-bdfb6eae6d8d');
      expect(res.applicationId).toBe('applicationId');
      expect(res.label).toBe('label');
      expect(res.url).toBe('https://local.com');
      expect(res.type).toBe('type');
    });
  });
  describe('#updateContextMenuExtension', () => {
    it('should throw error when context menu extension is not found', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push([], false);
        await dal.updateContextMenuExtension(
          {
            input: {
              id: '123',
              name: 'test',
              type: 'test',
              label: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toBe('not_found');
        expect(_.toString(error)).toContain(
          'The requested object was not found'
        );
        expect(error.data.objectId).toBe('123');
      }
    });
    it('should update context menu extension successfully and return response', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_context_menu_id: '1234',
            type: 'test',
            label: 'test_update',
            url: 'https://local.com/app/update'
          }
        ],
        false
      );
      const context = structuredClone(mockUtil.makeContext());
      context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
      const res = await dal.updateContextMenuExtension(
        {
          input: {
            id: '123',
            name: 'test',
            type: 'test',
            label: 'test_update',
            url: 'https://local.com/app/update'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('1234');
      expect(res.label).toBe('test_update');
      expect(res.url).toBe('https://local.com/app/update');
    });

    it('should throw error, if missing id', async () => {
      const args = { input: {} };
      const context = mockUtil.makeContext();

      // getContextMenuExtension
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      expect(async () =>
        dal.updateContextMenuExtension(args, context)
      ).rejects.toThrow();
    });

    it('should throw InvalidInput error, if missing required fields', async () => {
      const args = { input: { id: 'dfb74bbf-02ba-4ce2-b874-f0fc2bb226c4' } };
      const context = mockUtil.makeContext();

      // getContextMenuExtension
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      expect(async () =>
        dal.updateContextMenuExtension(args, context)
      ).rejects.toThrow('Missing required fields label or url');
    });

    it('should update context menu extension', async () => {
      let res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: '6a6f84b7-390f-456a-adc3-32c1f1628d01',
          label: 'label',
          url: 'https://local.com'
        }
      };

      // getContextMenuExtension
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      // updateContextMenuExtensionDb
      serviceContext.dbConnections['sso'].write._push([
        {
          application_context_menu_id: '6a6f84b7-390f-456a-adc3-32c1f1628d01',
          application_id: 'applicationId',
          label: 'label',
          url: 'https://local.com',
          type: 'type'
        }
      ]);

      res = await dal.updateContextMenuExtension(args, context);

      expect(res).toBeDefined();
      expect(res.id).toBe('6a6f84b7-390f-456a-adc3-32c1f1628d01');
      expect(res.applicationId).toBe('applicationId');
      expect(res.url).toBe('https://local.com');
      expect(res.type).toBe('type');
    });
  });
  describe('#deleteContextMenuExtension', () => {
    it('should throw error when application id is not exist in input params', async () => {
      try {
        await dal.deleteContextMenuExtension(
          {
            input: {
              name: 'test',
              type: 'test'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(_.toString(error)).toContain('id is required');
      }
    });
    it('should throw error when context menu extension is not found', async () => {
      try {
        serviceContext.dbConnections['sso'].write._push([], false);
        await dal.deleteContextMenuExtension(
          {
            input: {
              id: '123',
              name: 'test',
              type: 'test',
              label: 'test',
              url: 'https://local.com/app'
            }
          },
          mockUtil.makeContext()
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toBe('not_found');
        expect(_.toString(error)).toContain(
          'The requested object was not found'
        );
        expect(error.data.objectId).toBe('123');
      }
    });
    it('should delete context menu extension successfully and return response', async () => {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_context_menu_id: '1234',
            type: 'test',
            label: 'test',
            url: 'https://local.com'
          }
        ],
        false
      );
      const context = structuredClone(mockUtil.makeContext());
      context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
      const res = await dal.deleteContextMenuExtension(
        {
          input: {
            id: '123',
            name: 'test',
            type: 'test',
            label: 'test',
            url: 'https://local.com/app'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('1234');
    });
  });
  describe('#bulkDeleteContextMenuExtensions', () => {
    it('should bulk delete context menu extension successfully and return response', async () => {
      jest.clearAllMocks();
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_context_menu_id: '123',
            type: 'mention',
            label: 'test',
            url: 'https://local.com'
          },
          {
            application_id: '123',
            application_context_menu_id: '456',
            type: 'tdo',
            label: 'test',
            url: 'https://local.com'
          },
          {
            application_id: '123',
            application_context_menu_id: '789',
            type: 'watchlist',
            label: 'test',
            url: 'https://local.com'
          },
          {
            application_id: '123',
            application_context_menu_id: '1011',
            type: 'collection',
            label: 'test',
            url: 'https://local.com'
          }
        ]
        // false
      );
      const res = await dal.bulkDeleteContextMenuExtensions(
        {
          input: {
            ids: ['123', '456', '789', '1011']
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.mentions[0].id).toBe('123');
      expect(res.tdos[0].id).toBe('456');
      expect(res.watchlists[0].id).toBe('789');
      expect(res.collections[0].id).toBe('1011');
    });

    it('should return empty, if the input ids is empty', async () => {
      let res;
      const args = { input: { ids: [] } };

      res = await dal.bulkDeleteContextMenuExtensions(args);

      expect(res).toBeDefined();
      expect(res.mentions.length).toBe(0);
      expect(res.tdos.length).toBe(0);
      expect(res.watchlists.length).toBe(0);
      expect(res.collections.length).toBe(0);
    });
  });

  describe('#getAppIdFromOrgId', () => {
    it('should get app', async () => {
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'a123'
        }
      ]);
      const res = await dal.getAppIdFromOrgId(123);
      expect(res).toBe('a123');
    });
    it('should get app from cache', async () => {
      const res = await dal.getAppIdFromOrgId(123);
      expect(res).toBe('a123');
    });
    it('should get not found', async () => {
      try {
        serviceContext.dbConnections['sso'].read._push([]);
        await dal.getAppIdFromOrgId('223');
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
  });

  describe('#getApplication', () => {
    it('should throw error, if application not found', async () => {
      const options = {};

      serviceContext.dbConnections['sso'].read._push([], false);
      expect(async () => dal.getApplication(options)).rejects.toThrow(
        'The requested object was not found'
      );
    });

    it('should return application', async () => {
      let res;
      const options = {};

      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'applicationId' }],
        false
      );

      res = await dal.getApplication(options);

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('applicationId');
    });

    it('should return application with headerbarEnabled set to false', async () => {
      let res;
      const options = {};

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            headerbar_enabled: false
          }
        ],
        false
      );

      res = await dal.getApplication(options);

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('applicationId');
      expect(res.headerbarEnabled).toBe(false);
    });
  });

  describe('#getApplications', () => {
    describe('#getApplicationsQuery', () => {
      let context;
      let serviceContext;
      let dal;
      beforeEach(() => {
        serviceContext = require('../test/serviceContext.mock.js')();
        // config is loaded via require('./testServer.json'), which Node caches -
        // without cloning, mutating featureFlags below leaks into the outer,
        // file-scoped serviceContext built at the top of this file.
        serviceContext.config = _.cloneDeep(serviceContext.config);
        dal = require('./dalApplication.js')(
          serviceContext.logger,
          serviceContext.config,
          serviceContext
        );
        context = structuredClone(mockUtil.makeContext());
        context.organizationId = 7682;
        serviceContext.config.featureFlags.enablePackageGrantLogic = false;
        serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
        serviceContext.dal.organization.getOrganization = jest.fn();
        serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
        serviceContext.dal.organization.getBusinessUnit = jest.fn();
      });
      it('Old flag: owned = true', async () => {
        const options = {
          organizationId: 7682,
          owned: true,
          offset: 0,
          limit: 30
        };

        const { sql, sqlParams } = await dal.getApplicationsQuery(options);

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();
        expect(sql).not.toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).not.toContain(` OR `);
        expect(sql).not.toContain(`LEFT JOIN application__organization`);
      });

      it('Old flag: owned = false --> should return all accessible applications except the ones owned by the org.', async () => {
        const options = {
          organizationId: 7682,
          owned: false,
          offset: 0,
          limit: 30
        };

        const { sql, sqlParams } = await dal.getApplicationsQuery(options);

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();
        expect(sql).not.toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.public = true OR (ao.organization_id = $1 AND ao.application_state = 'active')`);
        expect(sql).not.toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`a.owner_organization_id <> $`);
        expect(sql).toContain(`LEFT JOIN application__organization`);
      });

      it('Old flag: owned is not set', async () => {
        const options = {
          organizationId: 7682,
          // owned: true,
          offset: 0,
          limit: 30
        };
        serviceContext.dbConnections['media_platform'].read._push([
          { business_unit: 'abc' }
        ]);

        const { sql, sqlParams } = await dal.getApplicationsQuery(options);

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).not.toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });

      it('Old flag: all is true', async () => {
        const options = {
          organizationId: 7682,
          // owned: true,
          all: true,
          offset: 0,
          limit: 30
        };
        serviceContext.dbConnections['media_platform'].read._push([
          { business_unit: 'abc' }
        ]);

        const { sql, sqlParams } = await dal.getApplicationsQuery(options);

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).not.toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });

      it('Enable enablePackageGrantLogic and useAppGrant', async () => {
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // Get Accessible package resources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: '43612d7c-a416-4e2e-83f2-d6269b4858f6',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const options = {
          organizationId: 7682,
          // owned: true,
          // all: true,
          offset: 0,
          limit: 30,
          isSuperAdmin: false
        };

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.business_unit`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });

      it('Enable enablePackageGrantLogic: accessScope is null --> Should get all accessible applications.', async () => {
        // Enable enablePackageGrantLogic and useAppGrant
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // getAccessiblePackageResources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: '43612d7c-a416-4e2e-83f2-d6269b4858f6',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        const options = {
          organizationId: 7682,
          // owned: true,
          // all: true,
          offset: 0,
          limit: 30,
          isSuperAdmin: false
        };

        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.business_unit`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });
      it('Enable enablePackageGrantLogic: [1] accessScope is [public, owned] --> Should get all accessible applications by access Scopes.', async () => {
        // Enable enablePackageGrantLogic and useAppGrant
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // getAccessiblePackageResources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: '43612d7c-a416-4e2e-83f2-d6269b4858f6',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        const options = {
          organizationId: 7682,
          // owned: true,
          // all: true,
          accessScope: ['public', 'owned'],
          offset: 0,
          limit: 30,
          isSuperAdmin: false
        };

        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).not.toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).not.toContain(`LEFT JOIN application__organization`);
        expect(sql).not.toContain(`ao.business_unit`);
        expect(sql).not.toContain(`ao.organization_id =`);
        expect(sql).toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });
      it('Enable enablePackageGrantLogic: [2] accessScope is [granted] --> Should get all accessible applications by access Scopes.', async () => {
        // Enable enablePackageGrantLogic and useAppGrant
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // getAccessiblePackageResources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: '43612d7c-a416-4e2e-83f2-d6269b4858f6',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        const options = {
          organizationId: 7682,
          // owned: true,
          // all: true,
          accessScope: ['granted'],
          offset: 0,
          limit: 30,
          isSuperAdmin: false
        };
        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).toContain(`a.application_id = ANY($`);
        expect(sql).not.toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.business_unit`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).not.toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });

      it('Enable enablePackageGrantLogic: [3] accessScope has `any` access scope [any] --> Should get all accessible applications and ignore other access Scopes.', async () => {
        // Enable enablePackageGrantLogic and useAppGrant
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // getAccessiblePackageResources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: '43612d7c-a416-4e2e-83f2-d6269b4858f6',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        const options = {
          organizationId: 7682,
          // owned: true,
          // all: true,
          accessScope: ['any', 'public'],
          offset: 0,
          limit: 30,
          isSuperAdmin: false
        };

        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).toContain(`a.application_id = ANY($`);
        expect(sql).toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.business_unit`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });

      it('Filter by application ids without accessScope [] --> Should get all app via app_org table', async () => {
        // Enable enablePackageGrantLogic and useAppGrant
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // getAccessiblePackageResources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: '43612d7c-a416-4e2e-83f2-d6269b4858f6',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        const options = {
          organizationId: 7682,
          // owned: true,
          // all: true,
          accessScope: [],
          id: 'test-app-id-1',
          offset: 0,
          limit: 30
        };

        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).not.toContain(`a.owner_organization_id = `);
        expect(sql).toContain(`LEFT JOIN application__organization`);
        expect(sql).toContain(`ao.business_unit`);
        expect(sql).toContain(`ao.organization_id =`);
        expect(sql).not.toContain(`a.public = true`);
        expect(sql).toContain(` OR `);
      });

      it('Should not get public, owned, granted applications if organizationId is not passed in', async () => {
        // Enable enablePackageGrantLogic and useAppGrant
        serviceContext.config.featureFlags.enablePackageGrantLogic = true;
        // Get org to check useAppGrant flag --> Get org
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
          organizationId: 7682,
          kvp: {
            features: {
              useAppGrant: 'enabled'
            }
          }
        });
        // getAccessiblePackageResources
        serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
          [
            {
              resourceId: 'appId-1',
              resourceType: 'application'
            },
            {
              resourceId: 'appId-2',
              resourceType: 'application'
            }
          ]
        );

        const options = {
          // organizationId: 7682,
          // owned: true,
          // all: true,
          accessScope: [],
          id: 'test-app-id-1',
          offset: 0,
          limit: 30
        };

        serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
          business_unit: 'abc'
        });

        const { sql, sqlParams } = await dal.getApplicationsQuery(
          options,
          context
        );

        expect(sql).toBeDefined();
        expect(sqlParams).toBeDefined();

        expect(sql).toContain(`a.application_id = ANY($`);
        expect(sql).not.toContain(`a.owner_organization_id = `);
        expect(sql).not.toContain(`LEFT JOIN application__organization`);
        expect(sql).not.toContain(`ao.business_unit`);
        expect(sql).not.toContain(`ao.organization_id =`);
        expect(sql).not.toContain(`a.public = true`);
        expect(sql).not.toContain(` OR `);
      });
    });

    it('should get list applications, by organizationId and is owner', async () => {
      let res;
      const options = {
        organizationId: 7682,
        owned: true,
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'applicationId', owner_organization_id: 7682 }],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
    });

    it('should get list applications, by organizationId and is not owner', async () => {
      let res;
      const options = {
        organizationId: 7682,
        owned: false,
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'applicationId', owner_organization_id: 12345 }],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(12345);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(12345);
    });

    it('should get list applications, by applicationId', async () => {
      let res;
      const options = {
        id: 'applicationId',
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'applicationId', owner_organization_id: 7682 }],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
    });

    it('should get list applications, by applicationStatus', async () => {
      let res;
      const options = {
        status: 'applicationStatus',
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            owner_organization_id: 7682,
            application_status: 'application_status'
          }
        ],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
      expect(res.records[0].applicationStatus).toBe('application_status');
      expect(res.records[0].status).toBe('application_status');
    });

    it('should get list applications, by request organization and is owner', async () => {
      let res;
      const options = {
        requestorOrgId: 7682,
        owned: true,
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            owner_organization_id: 7682,
            application_status: 'application_status'
          }
        ],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
      expect(res.records[0].applicationStatus).toBe('application_status');
      expect(res.records[0].status).toBe('application_status');
    });

    it('should get list applications, sort by applicationOrder column', async () => {
      let res;
      const options = {
        sortByOrder: true,
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            owner_organization_id: 7682,
            application_status: 'application_status'
          }
        ],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
      expect(res.records[0].applicationStatus).toBe('application_status');
      expect(res.records[0].status).toBe('application_status');
    });

    it('should get list all applications', async () => {
      let res;
      const options = {
        all: true,
        offset: 0
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            owner_organization_id: 7682,
            application_status: 'application_status',
            event_endpoint: 'https://applicationUrl.com/eventEndpoint'
          }
        ],
        false
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBeUndefined();
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
      expect(res.records[0].applicationStatus).toBe('application_status');
      expect(res.records[0].status).toBe('application_status');
      expect(res.records[0].eventEndpoint).toBe(
        'https://applicationUrl.com/eventEndpoint'
      );
    });

    it('get list all applications with filter: public', async () => {
      let res;
      const options = {
        all: true,
        isPublic: true,
        offset: 0
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            owner_organization_id: 7682,
            application_status: 'application_status',
            event_endpoint: 'https://applicationUrl.com/eventEndpoint'
          }
        ],
        false,
        ['a.public']
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBeUndefined();
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
      expect(res.records[0].applicationStatus).toBe('application_status');
      expect(res.records[0].status).toBe('application_status');
      expect(res.records[0].eventEndpoint).toBe(
        'https://applicationUrl.com/eventEndpoint'
      );
    });

    it('get list of all applications with enhanced filters', async () => {
      let res;
      const options = {
        filter: {
          name: 'app name',
          nameMatch: 'exact',
          status: 'active',
          isPublic: true,
          entityTags: [{ key: 'test-tag' }],
          dateTimeFilter: {
            toDateTime: '2022-02-01T13:55:41.000Z',
            fromDateTime: '2022-01-30T13:55:41.000Z',
            field: 'createdDateTime'
          }
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'applicationId'
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test app name',
            application_status: 'active',
            date_created: '2022-01-31T13:55:41.000Z',
            owner_organization_id: 7682,
            event_endpoint: 'https://applicationUrl.com/eventEndpoint'
          }
        ],
        false,
        ['a.public']
      );

      res = await dal.getApplications(options);

      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.limit).toBeUndefined();
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].ownerOrganizationId).toBe(7682);
      expect(res.records[0].id).toBe('applicationId');
      expect(res.records[0].organizationId).toBe(7682);
      expect(res.records[0].applicationStatus).toBe('active');
      expect(res.records[0].status).toBe('active');
      expect(res.records[0].dateCreated).toBe('2022-01-31T13:55:41.000Z');
    });

    it('get error when trying to filter for nonexistent field', async () => {
      const options = {
        filter: {
          fakeField: 'fakeValue'
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'applicationId'
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test app name',
            application_status: 'active',
            date_created: '2022-01-31T13:55:41.000Z',
            owner_organization_id: 7682,
            event_endpoint: 'https://applicationUrl.com/eventEndpoint'
          }
        ],
        false,
        ['a.public']
      );
      expect(async () => dal.getApplications(options)).rejects.toThrow();
    });
  });

  describe('#getContextMenuExtension', () => {
    it('should get a context menu extension, by id', async () => {
      let res;
      const options = { id: 'contextMenuExtensionId' };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_context_menu_id: 'contextMenuExtensionId',
          application_id: 'applicationId'
        }
      ]);

      res = await dal.getContextMenuExtension(options);

      expect(res).toBeDefined();
      expect(res.id).toBe('contextMenuExtensionId');
      expect(res.applicationId).toBe('applicationId');
    });
  });

  describe('#checkApplicationNameOrKeyConflict', () => {
    it('should check application name or key conflict, with applicationId', async () => {
      let res;

      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'applicationId' }
      ]);

      res = await dal.checkApplicationNameOrKeyConflict({
        id: 'applicationId',
        name: 'applicationName',
        key: 'applicationKey'
      });

      expect(res).toBeDefined();
      expect(res.application_id).toBe('applicationId');
    });

    it('should check application name or key conflict, without applicationId', async () => {
      let res;

      serviceContext.dbConnections['sso'].read._push([
        { application_id: 'applicationId' }
      ]);

      res = await dal.checkApplicationNameOrKeyConflict({
        name: 'applicationName',
        key: 'applicationKey'
      });

      expect(res).toBeDefined();
      expect(res.application_id).toBe('applicationId');
    });
  });

  describe('#createApplicationOrganizationSetting', () => {
    it('should throw error - The request input did not pass validation checks. See the data section for detail on validation errors.', async () => {
      let res, err;
      const args = {};
      try {
        res = await dal.createApplicationOrganizationSetting(
          ctxSuperAdmin,
          args
        );
      } catch (error) {
        expect(error.message).toBe(
          'The request input did not pass validation checks. See the data section for detail on validation errors.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create application organization setting success', async () => {
      let res;
      const args = {
        key: 'test.key',
        type: 'String',
        defaultValue: 'test value',
        application: 'c3e9ea36-0c50-4103-b9f5-b3719995be21',
        applicationId: '6cc46652-d5b8-4916-b700-8e2c9782fc77'
      };

      // allowedToUpdateApplicationSetting.allowedToEditApplication.getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'c3e9ea36-0c50-4103-b9f5-b3719995be21' }],
        false
      );
      // serviceContext.dbConnections['sso'].write
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: 'c3e9ea36-0c50-4103-b9f5-b3719995be21',
          organization_guid: '6cc46652-d5b8-4916-b700-8e2c9782fc77',
          key: 'test.key',
          type: 'String',
          value: 'test value'
        }
      ]);

      res = await dal.createApplicationOrganizationSetting(ctxSuperAdmin, args);

      expect(res).toBeDefined();
      expect(res.applicationId).toBe('c3e9ea36-0c50-4103-b9f5-b3719995be21');
      expect(res.organizationGuid).toBe('6cc46652-d5b8-4916-b700-8e2c9782fc77');
      expect(res.key).toBe('test.key');
      expect(res.type).toBe('String');
      expect(res.value).toBe('test value');
    });
  });

  describe('#deleteApplicationOrganizationSetting', () => {
    it('should throw error - application and key are required.', async () => {
      let res, err;
      const args = {};
      try {
        res = await dal.deleteApplicationOrganizationSetting(
          ctxSuperAdmin,
          args
        );
      } catch (error) {
        expect(error.message).toBe('application and key are required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw error - Application setting not found!', async () => {
      let res, err;
      const args = {
        application: '3847c659-568a-47a9-a3a7-26ded6a36e5f',
        key: 'test.key.setting',
        applicationId: '803a7e2a-3d5a-42b2-a262-2dc4758276ad'
      };

      // allowedToUpdateApplicationSetting.allowedToEditApplication.getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '3847c659-568a-47a9-a3a7-26ded6a36e5f' }],
        false
      );
      // serviceContext.dbConnections['sso'].write
      serviceContext.dbConnections['sso'].write._push([]);
      try {
        res = await dal.deleteApplicationOrganizationSetting(
          ctxSuperAdmin,
          args
        );
      } catch (error) {
        expect(error.message).toBe('Application setting not found!');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(res).toBeUndefined();
    });

    it('should delete application organization setting success', async () => {
      let res;
      const args = {
        application: '82f54e01-4891-432c-9830-53e8ce6032ac',
        key: 'test.key.setting.new',
        applicationId: '936321cb-1fe6-4673-9285-fb78152225af'
      };

      // allowedToUpdateApplicationSetting.allowedToEditApplication.getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '82f54e01-4891-432c-9830-53e8ce6032ac' }],
        false
      );
      // serviceContext.dbConnections['sso'].write
      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: '82f54e01-4891-432c-9830-53e8ce6032ac',
          organization_guid: '936321cb-1fe6-4673-9285-fb78152225af',
          key: 'test.key.setting.new',
          value: 'test value 1'
        }
      ]);

      res = await dal.deleteApplicationOrganizationSetting(ctxSuperAdmin, args);

      expect(res).toBeDefined();
      expect(res.id).toBe('82f54e01-4891-432c-9830-53e8ce6032ac');
    });
  });

  describe('#getApplicationOrganizationSettings', () => {
    it('should throw error - application is required!', async () => {
      let res;
      const args = {};
      try {
        res = await dal.getApplicationOrganizationSettings(ctxSuperAdmin, args);
      } catch (error) {
        expect(error.message).toBe('application is required!');
      }

      expect(res).toBeUndefined();
    });

    it('should throw error - Api do not allow current token type!', async () => {
      let res;
      const args = { application: '7134529b-bf2b-4ddd-a9ce-8dc13b8fcba5' };
      try {
        res = await dal.getApplicationOrganizationSettings(ctxJwt, args);
      } catch (error) {
        expect(error.message).toBe('Api do not allow current token type!');
      }

      expect(res).toBeUndefined();
    });

    it('should throw error - organizationGuid is required for internal token', async () => {
      let res;
      const args = { application: '9eb3b8bd-c911-420e-a7fe-b779d7e31862' };
      try {
        res = await dal.getApplicationOrganizationSettings(
          ctxInternalToken,
          args
        );
      } catch (error) {
        expect(error.message).toBe(
          'organizationGuid is required for internal token'
        );
      }

      expect(res).toBeUndefined();
    });

    it('should get application organization setting success - by internal token', async () => {
      const args = {
        application: '41cbf479-e071-4116-8a8e-b9c6feb67c3c',
        organizationGuid: '37641a82-8669-48c6-9017-4a1c8c30f84e'
      };

      // serviceContext.dbConnections['sso'].read
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '41cbf479-e071-4116-8a8e-b9c6feb67c3c',
            organization_guid: '37641a82-8669-48c6-9017-4a1c8c30f84e'
          }
        ],
        false
      );

      const res = await dal.getApplicationOrganizationSettings(
        ctxInternalToken,
        args
      );

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].applicationId).toBe('41cbf479-e071-4116-8a8e-b9c6feb67c3c');
      expect(res[0].organizationGuid).toBe(
        '37641a82-8669-48c6-9017-4a1c8c30f84e'
      );
    });

    it('should get application organization setting success - by super admin token', async () => {
      const args = {
        application: '6b9986a0-583b-4e27-a2bf-b449601af319',
        organizationGuid: '88f3863f-ff3d-4528-ab82-f92587ac38f8'
      };

      // serviceContext.dbConnections['sso'].read
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '6b9986a0-583b-4e27-a2bf-b449601af319',
            organization_guid: '88f3863f-ff3d-4528-ab82-f92587ac38f8'
          }
        ],
        false
      );

      const res = await dal.getApplicationOrganizationSettings(
        ctxSuperAdmin,
        args
      );

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].applicationId).toBe('6b9986a0-583b-4e27-a2bf-b449601af319');
      expect(res[0].organizationGuid).toBe(
        '88f3863f-ff3d-4528-ab82-f92587ac38f8'
      );
    });

    it('should get application organization setting success - by regular user token', async () => {
      const args = {
        application: 'd04f5b07-c60b-4e68-8ec2-153bc23487f6'
      };

      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '4ea8b789-d9f3-440f-b716-fcf1eefdda13' }
      ]);
      // getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'd04f5b07-c60b-4e68-8ec2-153bc23487f6' }],
        false
      );
      // serviceContext.dbConnections['sso'].read
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'd04f5b07-c60b-4e68-8ec2-153bc23487f6',
            organization_guid: '4ea8b789-d9f3-440f-b716-fcf1eefdda13'
          }
        ],
        false
      );

      const res = await dal.getApplicationOrganizationSettings(
        ctxRegularUser,
        args
      );

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].applicationId).toBe('d04f5b07-c60b-4e68-8ec2-153bc23487f6');
      expect(res[0].organizationGuid).toBe(
        '4ea8b789-d9f3-440f-b716-fcf1eefdda13'
      );
    });
  });

  describe('#getApplicationConfig', () => {
    it('should successfully return specified application configs', async () => {
      let res;
      const context = mockUtil.makeContext();
      const options = {
        appId: 'applicationId',
        orgId: 1234,
        includeDefaults: true,
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test1'
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push([]);

      res = await dal.getApplicationConfig(options, context);
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].organizationGuid).toBe('organizationGuid');
      expect(res.records[0].configKey).toBe('test1');
    });
  });

  describe('#getApplicationConfigDefinition', () => {
    it('should successfully return specified application config definitions', async () => {
      let res;
      const context = mockUtil.makeContext();
      const options = {
        appId: 'applicationId',
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'applicationId',
          organization_guid: 'organizationGuid',
          config_key: 'test1'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([]);
      res = await dal.getApplicationConfigDefinition(options, context);
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].applicationId).toBe('applicationId');
      expect(res.records[0].organizationGuid).toBe('organizationGuid');
      expect(res.records[0].configKey).toBe('test1');
    });
    it('should successfully return specified application config definitions with a valid package_id tied', async () => {
      let res;
      const context = mockUtil.makeContext();
      const options = {
        appId: 'applicationId',
        configKey: 'mock_key',
        offset: 0,
        limit: 4
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'applicationId1',
          organization_guid: 'organizationGuid1',
          config_key: 'test1',
          package_id: 'packageId1'
        },
        {
          application_id: 'applicationId1',
          organization_guid: 'organizationGuid1',
          config_key: 'test2',
          package_id: 'packageId2'
        },
        {
          application_id: 'applicationId1',
          organization_guid: 'organizationGuid1',
          config_key: 'test3'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'applicationId1',
          organization_guid: 'organizationGuid1',
          config_key: 'test4'
        },
        {
          application_id: 'applicationId1',
          organization_guid: 'organizationGuid1',
          config_key: 'test5'
        },
        {
          application_id: 'applicationId1',
          organization_guid: 'organizationGuid1',
          config_key: 'test6'
        }
      ]);

      res = await dal.getApplicationConfigDefinition(options, context);
      expect(res).toBeDefined();
      expect(res.count).toBe(4);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(4);
      expect(res.records[0].applicationId).toBe('applicationId1');
      expect(res.records[0].organizationGuid).toBe('organizationGuid1');
      expect(res.records[0].configKey).toBe('test3');
      expect(res.records[1].applicationId).toBe('applicationId1');
      expect(res.records[1].organizationGuid).toBe('organizationGuid1');
      expect(res.records[1].configKey).toBe('test4');
      expect(res.records[2].applicationId).toBe('applicationId1');
      expect(res.records[2].organizationGuid).toBe('organizationGuid1');
      expect(res.records[2].configKey).toBe('test5');
      expect(res.records[3].applicationId).toBe('applicationId1');
      expect(res.records[3].organizationGuid).toBe('organizationGuid1');
      expect(res.records[3].configKey).toBe('test6');
    });
  });

  describe('#_checkPermissionOnAppConfigSetOrDelete', () => {
    let serviceContext = require('../test/serviceContext.mock.js')();
    let dal = require('./dalApplication.js')(
      serviceContext.logger,
      serviceContext.config,
      serviceContext
    );
    let err, context, input;
    it('The input is invalid', async () => {
      let err, context, input;
      // 1. The context is nil
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`The context is required`);

      // 2. The input is nil
      context = mockUtil.makeContext();
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`The input is required`);

      // 3. The input is invalid
      context = mockUtil.makeContext();
      input = {};
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The appId or the orgId or the configs is invalid`
      );

      // 4. The input is invalid 1
      context = mockUtil.makeContext();
      input = {
        appId: '2d79354b-6cfe-4c1e-8c5a-bed6cf8dc03c',
        orgId: null,
        organizationGuid: null,
        configs: []
      };
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The appId or the orgId or the configs is invalid`
      );

      // 5. The input is invalid 2
      context = mockUtil.makeContext();
      input = {
        appId: '2d79354b-6cfe-4c1e-8c5a-bed6cf8dc03c',
        orgId: 123,
        organizationGuid: null,
        configs: []
      };
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The appId or the orgId or the configs is invalid`
      );

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The appId or the orgId or the configs is invalid`
      );

      // 6. If organizationGuid is passed in, orgId is not required
      err = null;
      context = mockUtil.makeContext();
      input = {
        appId: '2d79354b-6cfe-4c1e-8c5a-bed6cf8dc03c',
        // orgId: null,
        organizationGuid: '9881939f-c2da-4bd2-b4d2-11274e0cbdba',
        configs: [
          {
            configKey: 'test-config-key'
          }
        ]
      };

      // _checkPermissionOnAppConfigSetOrDelete >> _formatInputAppConfig >> getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'user'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test instance key',
            config_value: 'test instance value',
            config_level: 'instance'
          }
        ],
        false
      );
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(_.isNil(err)).toEqual(true);
    });
    it('The user is a superadmin', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, 'json.rights', ['superadmin']);

      const input = {
        appId: 'applicationId',
        orgId: 1234,
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          },
          {
            configKey: 'test user key',
            configValue: 'test value'
          },
          {
            configKey: 'test instance key',
            configValue: 'test instance value'
          }
        ]
      };

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test instance key',
            config_value: 'test instance value',
            config_level: 'instance'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'organization'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
    it('The user is an OrgAdmin - Should throw an error if the user is trying to update the instance config level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin

      const input = {
        appId: 'applicationId',
        orgId: 1234,
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          },
          {
            configKey: 'test user key',
            configValue: 'test value'
          },
          {
            configKey: 'test instance key',
            configValue: 'test instance value'
          }
        ]
      };

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test instance key',
            config_value: 'test instance value',
            config_level: 'instance'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'organization'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins can edit/delete application settings at the instance config level.`
      );
    });
    it('The user is an OrgAdmin - Should not throw an error if the user is not trying to update the instance config level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin

      const input = {
        appId: 'applicationId',
        orgId: 1234,
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          },
          {
            configKey: 'test user key',
            configValue: 'test value'
          }
        ]
      };

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'organization'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
    it('The user is a regular user - Should throw an error if the user is trying to update the instance config level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []); // permissionMasks for regular user

      const input = {
        appId: 'applicationId',
        orgId: 1234,
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          },
          {
            configKey: 'test user key',
            configValue: 'test value'
          },
          {
            configKey: 'test instance key',
            configValue: 'test instance value'
          }
        ]
      };

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test instance key',
            config_value: 'test instance value',
            config_level: 'instance'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'organization'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins can edit/delete application settings at the instance config level.`
      );
    });
    it('The user is a regular user - Should not throw an error if the user is not trying to update the instance/ org config level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);

      const input = {
        appId: 'applicationId',
        orgId: 1234,
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          },
          {
            configKey: 'test user key',
            configValue: 'test value'
          }
        ]
      };

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'user'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._checkPermissionOnAppConfigSetOrDelete(context, input);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#_validateInputAppConfigDefinitions', () => {
    let serviceContext = require('../test/serviceContext.mock.js')();
    let dal = require('./dalApplication.js')(
      serviceContext.logger,
      serviceContext.config,
      serviceContext
    );

    it('Throws an error when context is not provided', async () => {
      let err;
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: 'instance',
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      try {
        await dal._validateInputAppConfigDefinitions(null, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`The context is required`);
    });

    it('Throws an error when input is not provided', async () => {
      let err;
      const context = mockUtil.makeContext();
      try {
        await dal._validateInputAppConfigDefinitions(context, undefined);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The input must be an array and cannot be empty`
      );
    });

    it('Throws an error when input is not an array', async () => {
      let err;
      const context = mockUtil.makeContext();
      try {
        await dal._validateInputAppConfigDefinitions(context, { foo: 'bar' });
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The input must be an array and cannot be empty`
      );
    });

    it('Throws an error when input is an empty array', async () => {
      let err;
      const context = mockUtil.makeContext();
      try {
        await dal._validateInputAppConfigDefinitions(context, []);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `The input must be an array and cannot be empty`
      );
    });

    it('Throws an error while attempting to update with missing filter appId', async () => {
      let err;
      const input = [
        {
          filter: {
            appId: null,
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'user'
          }
        }
      ];
      const context = mockUtil.makeContext();
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`The filter appId is required for update`);
    });

    it('Throws an error while attempting to update with missing filter configKey', async () => {
      let err;
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: null
          },
          update: {
            configLevel: 'user'
          }
        }
      ];
      const context = mockUtil.makeContext();
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(`The filter configKey is required for update`);
    });

    it('Throws an error while attempting to create a new definition with missing configLevel', async () => {
      let err;
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: null,
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      const context = mockUtil.makeContext();
      try {
        await dal._validateInputAppConfigDefinitions(context, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `configLevel is required for new application configuration definitions.`
      );
    });

    it('Throws an error if user is not superadmin and tries to create an instance-level config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: 'instance',
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      try {
        await dal._validateInputAppConfigDefinitions(context, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins can create or update application configuration definitions at the instance config level.`
      );
    });

    it('Throws an error if user is not orgadmin or superadmin and tries to create an organization-level config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: 'organization',
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      try {
        await dal._validateInputAppConfigDefinitions(context, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.`
      );
    });

    it('Does not throw an error when a non super-admin or org-admin user creates a user-level app config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: 'user',
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      try {
        await dal._validateInputAppConfigDefinitions(context, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Does not throw an error when an org-admin user creates a org-level app config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: 'organization',
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      try {
        await dal._validateInputAppConfigDefinitions(context, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Does not throw an error when a super-admin user creates an instance-level app config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, 'json.rights', ['superadmin']);
      const input = [
        {
          appId: 'applicationId',
          configKey: 'testConfigKey',
          configType: 'string',
          configLevel: 'instance',
          description: 'Test config',
          required: false,
          secured: false
        }
      ];
      try {
        await dal._validateInputAppConfigDefinitions(context, input);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Throws an error if user is not orgadmin or superadmin and tries to update an organization-level config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'user'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'organization'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.`
      );
    });

    it('Throws an error if user is not orgadmin or superadmin and tries to update an instance-level config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'user'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'instance'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins can create or update application configuration definitions at the instance config level.`
      );
    });

    it('Throws an error if user is not orgadmin or superadmin and tries to update a user-level config definition to org-level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'organization'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.`
      );
    });

    it('Throws an error if user is not superadmin and tries to update an organization-level config definition to instance-level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'instance'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'organization'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        `Only superadmins can create or update application configuration definitions at the instance config level.`
      );
    });

    it('Does not throw an error if non-admin user updates a user-level app config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', []);
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configValue: 'test value'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Does not throw an error if org-admin user updates a user-level app config definition to organization level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'organization'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'user'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Does not throw an error if org-admin user updates an org-level app config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [8188]); // permissionMasks for orgAdmin
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configValue: 'test value'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'organization'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Does not throw an error if super-admin user updates an org-level app config definition to instance level', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, 'json.rights', ['superadmin']);
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configLevel: 'instance'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'organization'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });

    it('Does not throw an error if super-admin user updates an instance-level app config definition', async () => {
      let err;
      const context = mockUtil.makeContext();
      _.set(context, 'json.rights', ['superadmin']);
      const input = [
        {
          filter: {
            appId: 'applicationId',
            configKey: 'testConfigKey'
          },
          update: {
            configValue: 'test value'
          }
        }
      ];

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            config_level: 'instance'
          }
        ],
        false
      );
      try {
        await dal._validateInputAppConfigDefinitions(context, input, true);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });
  });

  describe('#applicationConfigSet', () => {
    let context;
    let serviceContext = require('../test/serviceContext.mock.js')({
      enableTransactionQuery: true
    });
    // config is loaded via require('./testServer.json'), which Node caches -
    // without cloning, mutating featureFlags below leaks into the outer,
    // file-scoped serviceContext built at the top of this file.
    serviceContext.config = _.cloneDeep(serviceContext.config);
    let dal = require('./dalApplication.js')(
      serviceContext.logger,
      serviceContext.config,
      serviceContext
    );
    beforeEach(() => {
      context = mockUtil.makeContext();
      context._authInfo.organization = {
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      };
      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getBusinessUnit = jest.fn();
    });

    it('enablePackageGrantLogic = false: should successfully set configs', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      let res, err;
      const context = mockUtil.makeContext();
      const input = {
        appId: 'applicationId',
        orgId: 1234,
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          },
          {
            configKey: 'test user key',
            configValue: 'test value'
          }
        ]
      };

      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'organization'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );

      // Get applications
      serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
        business_unit: 'abc'
      });
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      // setApplicationConfigsTx
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value'
          }
        ],
        false,
        [],
        (sql, params) => {
          // set user_id to orgGuid
          expect(params[1]).toEqual('ef3383d3-8813-42d0-8ccf-de21266283fa');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value'
          }
        ],
        false,
        [],
        (sql, params) => {
          // set user_id to requesterId
          expect(params[2]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
          expect(params[3]).toEqual('ef3383d3-8813-42d0-8ccf-de21266283fa');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push([], false);

      res = await dal.applicationConfigSet(
        {
          input: input
        },
        context
      );

      expect(res.records[0][0].applicationId).toBe('applicationId');
      expect(res.records[0][0].organizationGuid).toBe('organizationGuid');
      expect(res.records[0][0].configKey).toBe('test key');
      expect(res.records[0][0].value).toBe('test value');
      expect(res.limit).toBe(2);
      expect(res.offset).toBe(0);
    });
    it('enablePackageGrantLogic = true: should successfully set configs', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      let res, err;
      const context = mockUtil.makeContext();
      const input = {
        appId: 'applicationId',
        orgId: 1234,
        configs: [
          {
            configKey: 'test key',
            configValue: 'test value'
          }
        ]
      };

      serviceContext.dal.organization.getOrganization.mockResolvedValue({
        organizationGuid: 'ef3383d3-8813-42d0-8ccf-de21266283fa',
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value'
          }
        ],
        false
      );

      // getAccessiblePackageResources
      serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
        [
          {
            resourceId: 'appId-1',
            resourceType: 'application'
          },
          {
            resourceId: 'appId-2',
            resourceType: 'application'
          }
        ]
      );

      // Get applications
      serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
        business_unit: 'abc'
      });
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      // setApplicationConfigsTx
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push([], false);

      res = await dal.applicationConfigSet(
        {
          input: input
        },
        context
      );

      expect(res.records[0][0].applicationId).toBe('applicationId');
      expect(res.records[0][0].organizationGuid).toBe('organizationGuid');
      expect(res.records[0][0].configKey).toBe('test key');
      expect(res.records[0][0].value).toBe('test value');
      expect(res.limit).toBe(1);
      expect(res.offset).toBe(0);
    });
  });

  describe('#applicationConfigDelete', () => {
    it('should delete config', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const input = {
        appId: 'applicationId',
        orgId: 1234,
        configKey: 'test key'
      };

      // _checkPermissionOnAppConfigSetOrDelete >> _formatInputAppConfig >> getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'user'
          },
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test user key',
            config_value: 'test value',
            config_level: 'user'
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'applicationId',
          organization_guid: 'organizationGuid',
          config_key: 'test key',
          config_value: 'test value'
        }
      ]);

      res = await dal.applicationConfigDelete(
        {
          input: input
        },
        'app_config',
        context
      );

      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.code).toBeUndefined();
      expect(res.msg).toBeUndefined();
    });
  });

  describe('#applicationConfigDefinitionTx', () => {
    it('should create config definition', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const input = [
        {
          appId: 'applicationId',
          orgId: 1234,
          configKey: 'test key',
          configType: 'Float',
          configLevel: 'Organization',
          required: true,
          secured: true,
          description: 'test description',
          defaultValue: '1.5'
        }
      ];

      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: 'applicationId',
          organization_guid: 'organizationGuid',
          config_key: 'test key',
          config_type: 'Float',
          config_level: 'Organization',
          is_required: true,
          is_secured: true,
          config_description: 'test description',
          default_value: '1.5'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);

      res = await dal.applicationConfigDefinitionTx(
        {
          input: input
        },
        context
      );

      expect(res).toBeDefined();
      expect(res.records[0][0].applicationId).toBe(input[0].appId);
      expect(res.records[0][0].organizationGuid).toBe('organizationGuid');
      expect(res.records[0][0].configKey).toBe(input[0].configKey);
      expect(res.records[0][0].configType).toBe(input[0].configType);
      expect(res.records[0][0].configLevel).toBe(input[0].configLevel);
      expect(res.records[0][0].required).toBe(input[0].required);
      expect(res.records[0][0].secured).toBe(input[0].secured);
      expect(res.records[0][0].description).toBe(input[0].description);
      expect(res.records[0][0].defaultValue).toBe(input[0].defaultValue);
      expect(res.limit).toBe(1);
      expect(res.offset).toBe(0);
    });

    it('should update config definition', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: [
          {
            filter: {
              appId: 'applicationId',
              orgId: 1234,
              configKey: 'test key'
            },
            update: {
              configKey: 'updated test key'
            }
          }
        ]
      };

      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          configKey: 'updated test key'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);

      res = await dal.applicationConfigDefinitionTx(args, context, true);

      expect(res).toBeDefined();
      expect(res.records[0][0].configKey).toBe(args.input[0].update.configKey);
      expect(res.limit).toBe(1);
      expect(res.offset).toBe(0);
    });

    it('should validate config defaultValue input on create', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const input = [
        {
          appId: 'applicationId',
          orgId: 1234,
          configKey: 'test key',
          configType: 'Boolean',
          configLevel: 'Organization',
          required: true,
          secured: true,
          description: 'test description',
          defaultValue: 'default value text'
        }
      ];

      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: 'applicationId',
          organization_guid: 'organizationGuid',
          config_key: 'test key',
          config_type: 'Float',
          config_level: 'Organization',
          is_required: true,
          is_secured: true,
          config_description: 'test description',
          default_value: '1.5'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);

      try {
        res = await dal.applicationConfigDefinitionTx(
          {
            input: input
          },
          context
        );
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'defaultValue is not a type of Boolean'
        );
      }
    });

    it('should validate config defaultValue input on update', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: [
          {
            filter: {
              appId: 'applicationId',
              orgId: 1234,
              configKey: 'test key'
            },
            update: {
              configKey: 'updated test key',
              configType: 'Integer',
              defaultValue: 'true'
            }
          }
        ]
      };

      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          configKey: 'updated test key'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);

      try {
        res = await dal.applicationConfigDefinitionTx(args, context, true);
      } catch (error) {
        expect(error.name).toBe('invalid_input');
        expect(_.toString(error)).toContain(
          'defaultValue is not a type of Integer'
        );
      }
    });
  });

  describe('#applicationConfigDefinitionDelete', () => {
    it('should delete config definition', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      _.set(context, 'json.rights', ['superadmin']);
      const args = {
        input: {
          appId: 'applicationId',
          orgId: 1234,
          configKey: 'test key',
          organizationGuid: 'organizationGuid'
        }
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      // getApplicationConfigDefinition
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            organization_guid: 'organizationGuid',
            config_key: 'test key',
            config_value: 'test value',
            config_level: 'organization'
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'applicationId',
          organization_guid: 'organizationGuid',
          config_key: 'test key'
        }
      ]);

      res = await dal.applicationConfigDelete(
        args,
        'app_config_definition',
        context
      );

      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.code).toBeUndefined();
      expect(res.msg).toBeUndefined();
    });
  });
  describe('#applicationHeaderbar', () => {
    it('should get headerbar information', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId'
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          headerbar_name: 'APP_BAR',
          element_id: 'my-app-bar',
          title: 'Library',
          background_color: '#000ff',
          help_enabled: true,
          z_index: 1000,
          notification_enabled: true,
          display_support_chat: true,
          logo_src: 'Absolute path to your logo',
          hide_password_reset: true,
          created_by: 'created by user',
          modified_by: 'modified by user',
          date_created: 'created date time',
          date_modified: 'modified date time'
        }
      ]);

      res = await dal.getApplicationHeaderbar(args, context);

      const expectedResult = {
        name: 'APP_BAR',
        elementId: 'my-app-bar',
        config: {
          title: 'Library',
          backgroundColor: '#000ff',
          help: true,
          zIndex: 1000,
          notification: true,
          displaySupportChat: true,
          logoSrc: 'Absolute path to your logo',
          hidePasswordReset: true
        },
        createdAt: 'created date time',
        modifiedAt: 'modified date time',
        createdBy: 'created by user',
        modifiedBy: 'modified by user'
      };

      expect(res).toBeDefined();
      expect(JSON.stringify(res)).toBe(JSON.stringify(expectedResult));
    });
  });
  describe('#createApplicationHeaderbar', () => {
    it('should create headerbar information', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        input: {
          name: 'APP_BAR',
          elementId: 'my-app-bar',
          config: {
            title: 'Library',
            backgroundColor: '#000ff',
            help: true,
            zIndex: 1000,
            notification: true,
            displaySupportChat: true,
            logoSrc: 'Absolute path to your logo',
            hidePasswordReset: true
          }
        }
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          headerbar_name: 'APP_BAR',
          element_id: 'my-app-bar',
          title: 'Library',
          background_color: '#000ff',
          help_enabled: true,
          z_index: 1000,
          notification_enabled: true,
          display_support_chat: true,
          logo_src: 'Absolute path to your logo',
          hide_password_reset: true,
          created_by: 'created by user',
          modified_by: 'modified by user',
          date_created: 'created date time',
          date_modified: 'modified date time'
        }
      ]);

      res = await dal.createApplicationHeaderbar(args, context);

      const expectedResult = {
        name: 'APP_BAR',
        elementId: 'my-app-bar',
        config: {
          title: 'Library',
          backgroundColor: '#000ff',
          help: true,
          zIndex: 1000,
          notification: true,
          displaySupportChat: true,
          logoSrc: 'Absolute path to your logo',
          hidePasswordReset: true
        },
        createdAt: 'created date time',
        modifiedAt: 'modified date time',
        createdBy: 'created by user',
        modifiedBy: 'modified by user'
      };

      expect(res).toBeDefined();
      expect(JSON.stringify(res)).toBe(JSON.stringify(expectedResult));
    });
  });

  describe('#getApplicationDetails', () => {
    it('should successfully return specified application details', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const options = {
        appId: 'applicationId',
        orgId: 1234
      };
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'applicationId',
          type: 'useCases',
          content: {
            data: 'test23444\t',
            format: 'markdown'
          }
        }
      ]);
      res = await dal.getApplicationDetails(options, context);
      expect(res).toBeDefined();
      expect(res.useCases).toBe('test23444	');
    });
  });
  describe('#updateApplicationDetails', () => {
    it('should update application details', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        input: {
          useCases: 'hello world',
          elementId: 'updated-app-bar'
        }
      };

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: 'applicationId',
            type: 'useCases',
            content: {
              data: 'hello world\t',
              format: 'markdown'
            }
          }
        ],
        true,
        [],
        (sql, args) => {
          expect(sql).toContain('$6');
          expect(args[0]).toEqual('applicationId');
          expect(args[1]).toEqual('useCases');
          expect(args[3]).toEqual('applicationId');
          expect(args[4]).toEqual('elementId');
          return true;
        }
      );

      res = await dal.updateApplicationDetails(args, context);

      expect(res).toBeDefined();
      expect(res[0].useCases).toBe('hello world	');
    });
  });

  describe('#createApplicationDetails', () => {
    it('should create application details', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        input: {
          useCases: 'hello world',
          elementId: 'updated-app-bar'
        }
      };

      serviceContext.dbConnections['sso'].write._push([
        {
          application_id: 'applicationId',
          type: 'useCases',
          content: {
            data: 'hello world\t',
            format: 'markdown'
          }
        }
      ]);

      res = await dal.createApplicationDetails(args, context);

      expect(res).toBeDefined();
      expect(res[0].useCases).toBe('hello world	');
    });
  });
  describe('#updateApplicationHeaderbar', () => {
    it('should update headerbar information', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        input: {
          name: 'UPDATED APP_BAR',
          elementId: 'updated-app-bar'
        }
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: false }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_guid: 'organizationGuid' }
      ]);

      serviceContext.dbConnections['sso'].write._push([
        {
          headerbar_name: 'UPDATED APP_BAR',
          element_id: 'updated-app-bar',
          title: 'Library',
          background_color: '#000ff',
          help_enabled: true,
          z_index: 1000,
          notification_enabled: true,
          display_support_chat: true,
          logo_src: 'Absolute path to your logo',
          hide_password_reset: true,
          created_by: 'created by user',
          modified_by: 'modified by user',
          date_created: 'created date time',
          date_modified: 'modified date time'
        }
      ]);

      res = await dal.updateApplicationHeaderbar(args, context);
      const expectedResult = {
        name: 'UPDATED APP_BAR',
        elementId: 'updated-app-bar',
        config: {
          title: 'Library',
          backgroundColor: '#000ff',
          help: true,
          zIndex: 1000,
          notification: true,
          displaySupportChat: true,
          logoSrc: 'Absolute path to your logo',
          hidePasswordReset: true
        },
        createdAt: 'created date time',
        modifiedAt: 'modified date time',
        createdBy: 'created by user',
        modifiedBy: 'modified by user'
      };

      expect(res).toBeDefined();
      expect(JSON.stringify(res)).toBe(JSON.stringify(expectedResult));
    });
  });
  describe('#fileApplication', () => {
    let context;
    beforeEach(() => {
      jest.clearAllMocks();
      context = mockUtil.makeContext();
      context._authInfo.organization.organizationId = 7682;
      serviceContext.dal.organization.getOrganization = jest.fn();
    });
    it('should return application', async () => {
      const appId = uuid.v4();
      const parentFolderId = uuid.v4();

      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      // getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId }],
        false
      );
      // dalFolder file object
      _.set(serviceContext, 'dal.folder.fileObject', () => {
        return {};
      });
      let res = await dal.fileApplication(
        {
          input: {
            appId,
            parentFolderId
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(appId);
    });
  });
  describe('#unfileApplication', () => {
    let context;
    beforeEach(() => {
      jest.clearAllMocks();
      context = mockUtil.makeContext();
      context._authInfo.organization.organizationId = 7682;
      serviceContext.dal.organization.getOrganization = jest.fn();
    });
    it('should return application', async () => {
      const appId = uuid.v4();
      const parentFolderId = uuid.v4();

      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      // getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: appId }],
        false
      );
      // dalFolder file object
      _.set(serviceContext, 'dal.folder.unfileApplication', () => {
        return {};
      });
      let res = await dal.unfileApplication(
        {
          input: {
            appId,
            parentFolderId
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(appId);
    });
  });
  describe('#validatePackageAppAccess', () => {
    let context;
    beforeEach(() => {
      jest.clearAllMocks();
      context = mockUtil.makeContext();
      context._authInfo.organization.organizationId = 7682;
      serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
      serviceContext.dal.organization.getOrganization = jest.fn();
    });
    it('should do nothing when useAppGrant', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });
      const {
        hasAccess: hasPackageAccess,
        allowedIds: allowedIds
      } = await dal.validatePackageAppAccess(context, ['appId-1'], true);
      expect(hasPackageAccess).toEqual(false);
      expect(allowedIds.length).toEqual(0);
    });
    it('should check app access through package only', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });
      serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
        [
          {
            resourceId: 'c35952d9-4ec5-4539-a953-9618a83fca01',
            resourceType: 'application'
          },
          {
            resourceId: '8053f120-d481-4586-9204-5abde38126e8',
            resourceType: 'application'
          }
        ]
      );
      const {
        hasAccess: hasPackageAccess,
        allowedIds: allowedIds
      } = await dal.validatePackageAppAccess(
        context,
        ['c35952d9-4ec5-4539-a953-9618a83fca01'],
        true
      );
      expect(hasPackageAccess).toEqual(true);
      expect(allowedIds.length).toEqual(2);
    });
    it('should check app access through getApplication and packages', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });
      serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
        [
          {
            resourceId: 'c35952d9-4ec5-4539-a953-9618a83fca01',
            resourceType: 'application'
          },
          {
            resourceId: '8053f120-d481-4586-9204-5abde38126e8',
            resourceType: 'application'
          }
        ]
      );
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // get application for allowed ids
      serviceContext.dbConnections['sso'].read._push(
        [
          { applicationId: '6f8848fb-b18e-4c20-aaba-7a64ea005e95' },
          { applicationId: '71f9d53d-33e8-4f7d-b670-2e2cae73628c' }
        ],
        false
      );
      const {
        hasAccess: hasPackageAccess,
        allowedIds: allowedIds
      } = await dal.validatePackageAppAccess(context, [], false);
      expect(hasPackageAccess).toEqual(true);
      expect(allowedIds.length).toEqual(4);
    });
    it('should handle the bad data in the DB', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });
      serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
        [
          {
            resourceId: 'c35952d9-4ec5-4539-a953-9618a83fca01',
            resourceType: 'application'
          },
          {
            resourceId: 'appId-2',
            resourceType: 'application'
          }
        ]
      );
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // get application for allowed ids
      serviceContext.dbConnections['sso'].read._push(
        [
          { applicationId: '6f8848fb-b18e-4c20-aaba-7a64ea005e95' },
          { applicationId: '71f9d53d-33e8-4f7d-b670-2e2cae73628c' }
        ],
        false
      );
      const {
        hasAccess: hasPackageAccess,
        allowedIds: allowedIds
      } = await dal.validatePackageAppAccess(context, [], false);
      expect(hasPackageAccess).toEqual(true);
      expect(allowedIds.length).toEqual(3);
    });
  });

  describe('#getOrganizationGuid', () => {
    let context;
    beforeEach(() => {
      jest.clearAllMocks();
      context = mockUtil.makeContext();
      context._authInfo.organization.organizationId = 7682;
      serviceContext.dal.organization.getOrganization = jest.fn();
    });
    it('should throw an error if the orgIds do not match and user is not a superadmin', async () => {
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      let err;

      context._authInfo.permissionMasks = [];
      try {
        await dal.getOrganizationGuid(context, 7683);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.toString()).toContain(`not_allowed`);
      expect(err.toString()).toContain(
        `The authenticated user or token does not have privileges`
      );
      expect(err.toString()).toContain(
        `to perform actions on the Application by Organization ID.`
      );
    });

    it('should NOT throw an error if the org id passed in is not a number', async () => {
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        organizationGuid: 'd8781bfa-f888-4073-b122-1f28d9fb6b66',
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      let err;
      let result;

      context._authInfo.permissionMasks = [];
      try {
        result = await dal.getOrganizationGuid(context, '7682');
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result).toEqual('d8781bfa-f888-4073-b122-1f28d9fb6b66');
    });

    it('the org id passed in is a number', async () => {
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        organizationGuid: 'd8781bfa-f888-4073-b122-1f28d9fb6b66',
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      let err;
      let result;

      context._authInfo.permissionMasks = [];
      try {
        result = await dal.getOrganizationGuid(context, 7682);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result).toEqual('d8781bfa-f888-4073-b122-1f28d9fb6b66');
    });

    it('should throw an error if cannot find organization', async () => {
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        organizationGuid: null,
        kvp: {
          features: {
            useAppGrant: 'disabled'
          }
        }
      });

      let err;
      let result;

      context._authInfo.permissionMasks = [];
      try {
        result = await dal.getOrganizationGuid(context, 7682);
      } catch (error) {
        err = error;
      }
      expect(result).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.toString()).toContain(`not_found`);
      expect(err.toString()).toContain(`Organization GUID could not be found.`);
    });
  });

  describe('#allowedToSetApplicationConfig', () => {
    let serviceContext = require('../test/serviceContext.mock.js')();
    // config is loaded via require('./testServer.json'), which Node caches -
    // without cloning, mutating featureFlags below leaks into the outer,
    // file-scoped serviceContext built at the top of this file.
    serviceContext.config = _.cloneDeep(serviceContext.config);
    let dal = require('./dalApplication.js')(
      serviceContext.logger,
      serviceContext.config,
      serviceContext
    );

    let context;
    let applicationId = '42893100-aea9-492a-a3cf-0cc1edb87e20';
    let orgGuid = `d8781bfa-f888-4073-b122-1f28d9fb6b66`;
    beforeEach(() => {
      jest.clearAllMocks();
      context = mockUtil.makeContext();
      context._authInfo.organization = {
        organizationId: 7682,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      };
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getBusinessUnit = jest.fn();
    });
    it('the configs are off: should throw an error not_allow if no application found', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      let err;

      context._authInfo.permissionMasks = [];
      serviceContext.dbConnections['sso'].read._push([], false);

      try {
        await dal.allowedToSetApplicationConfig(
          context,
          applicationId,
          orgGuid
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.toString()).toContain(`not_allowed`);
      expect(err.toString()).toContain(
        `The application was not found or you don't have access to set application config`
      );

      expect(
        serviceContext.dal.packages.getAccessiblePackageResources
      ).toHaveBeenCalledTimes(0);
    });

    it('the configs are off: should NOT throw an error if user have access to the application with write permission', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = false;
      let err;
      let result;

      context._authInfo.permissionMasks = [];
      serviceContext.dal.organization.getBusinessUnit.mockResolvedValueOnce({
        business_unit: 'abc'
      });
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: applicationId,
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      try {
        result = await dal.allowedToSetApplicationConfig(
          context,
          applicationId,
          orgGuid
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result).toEqual(true);
      expect(
        serviceContext.dal.packages.getAccessiblePackageResources
      ).toHaveBeenCalledTimes(0);
    });

    it('the configs are on: should throw an error if user does not have access to the application with write permission', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      // isEnableFeatureInOrganization
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        organizationGuid: null,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });
      serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
        []
      );

      let err;
      let result;

      context._authInfo.permissionMasks = []; // Not a superadmin
      serviceContext.dbConnections['sso'].read._push(
        [
          // {
          //   application_id: applicationId,
          //   application_name: 'test',
          //   application_key: 'test',
          //   application_url: 'https://local.com'
          // }
        ],
        false
      );

      try {
        result = await dal.allowedToSetApplicationConfig(
          context,
          applicationId,
          orgGuid
        );
      } catch (error) {
        err = error;
      }
      expect(result).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.toString()).toContain(`not_allowed`);
      expect(err.toString()).toContain(
        `The application was not found or you don't have access to set application config`
      );
      expect(
        serviceContext.dal.packages.getAccessiblePackageResources
      ).toHaveBeenCalledTimes(1);
    });

    it('the configs are on: should NOT throw an error if user has access to the application with write permission', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;
      // isEnableFeatureInOrganization
      serviceContext.dal.organization.getOrganization.mockResolvedValueOnce({
        organizationId: 7682,
        organizationGuid: null,
        kvp: {
          features: {
            useAppGrant: 'enabled'
          }
        }
      });
      serviceContext.dal.packages.getAccessiblePackageResources.mockResolvedValueOnce(
        [
          {
            resourceId: applicationId,
            resourceType: 'application'
          }
        ]
      );

      let err;
      let result;

      context._authInfo.permissionMasks = []; // Not a superadmin
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: applicationId,
            application_name: 'test',
            application_key: 'test',
            application_url: 'https://local.com'
          }
        ],
        false
      );

      try {
        result = await dal.allowedToSetApplicationConfig(
          context,
          applicationId,
          orgGuid
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result).toEqual(true);
      expect(
        serviceContext.dal.packages.getAccessiblePackageResources
      ).toHaveBeenCalledTimes(1);
      expect(
        serviceContext.dal.organization.getOrganization
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('#updateApplicationRoles', () => {
    it('should throw error when required fields are missing to create a new app role', async () => {
      await expect(async () =>
        dal.updateApplicationRoles({
          roles: [{ name: 'role-name' }]
        })
      ).rejects.toMatchObject({
        name: 'invalid_input'
      });
    });

    it('update active app with empty applicationRoles: skip role upserts and role deletions', async () => {
      const options = {
        roles: [],
        appStatus: 'active'
      };
      const res = await dal.updateApplicationRoles(options, {});
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });

    it('update active app with existing/new applicationRoles: only role upserts and skip role deletions', async () => {
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        orgId: 'org_id',
        appStatus: 'active',
        roles: [
          {
            id: 'roleId',
            name: 'update-role',
            description: 'existing role'
          },
          {
            name: 'new-role',
            description: 'new role',
            permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
            isPrivate: false,
            isAppEventRole: false
          }
        ]
      };

      const roleRows = [
        {
          role_id: 'roleId',
          role_name: 'update-role',
          role_description: 'existing role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId'
        },
        {
          role_id: 'newRoleId',
          role_name: 'new-role',
          role_description: 'new role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId'
        }
      ];

      // validateRoles after getRoles:
      validateRoles.mockReturnValue(
        roleRows
          .filter((r) => r.role_name !== 'new-role')
          .map((r) => mapper.mapRole(r))
      );

      // serviceContext.dal.role.getRoles
      serviceContext.dbConnections['sso'].write._push(
        roleRows.filter((r) => r.role_name !== 'new-role'),
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual('roleId');
          expect(params[1]).toEqual('applicationId');
          expect(params[2]).toEqual(['org_id']);

          return true;
        }
      );

      // updateRolesData
      serviceContext.dbConnections['sso'].write._push(roleRows);
      const res = await dal.updateApplicationRoles(args, context);

      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res.map((r) => r.id)).toEqual(['roleId', 'newRoleId']);
      expect(
        serviceContext.bll.application.deleteApplicationRoles
      ).not.toHaveBeenCalled();
    });

    it('update non-active app with empty applicationRoles: delete all roles of the application', async () => {
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        orgId: 'org_id',
        appStatus: 'pending',
        roles: []
      };

      const roleRows = [
        {
          role_id: 'roleId',
          role_name: 'missing-role',
          role_description: 'existing role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId'
        },
        {
          role_id: 'defaultRoleId',
          role_name: 'default-role',
          role_description: 'default role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId',
          is_default_app_role: true
        }
      ];

      validateRoles.mockReturnValue(roleRows.map((r) => mapper.mapRole(r)));

      // serviceContext.dal.role.getRoles
      serviceContext.dbConnections['sso'].write._push(
        roleRows,
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual('applicationId');
          expect(params[1]).toEqual(['org_id']);

          return true;
        }
      );

      const res = await dal.updateApplicationRoles(args, context);
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
      expect(
        serviceContext.bll.application.deleteApplicationRoles
      ).toHaveBeenCalledWith(
        expect.any(Object),
        ['roleId'],
        expect.objectContaining({
          applicationId: 'applicationId',
          organizationId: 'org_id',
          skipRoleValidation: true,
          skipAppValidation: true
        })
      );
    });

    it('non-active app with existing and new applicationRoles: both role upserts and deletions of missing roles', async () => {
      const context = mockUtil.makeContext();
      const args = {
        appId: 'applicationId',
        orgId: 'org_id',
        appStatus: 'pending',
        roles: [
          {
            id: 'roleId',
            name: 'update-role',
            description: 'existing role'
          },
          {
            name: 'new-role',
            description: 'new role',
            permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
            isPrivate: false,
            isAppEventRole: false
          },
          {
            id: 'defaultRoleId',
            name: 'default-role',
            description: 'default role'
          }
        ]
      };

      const roleRows = [
        {
          role_id: 'roleId',
          role_name: 'update-role',
          role_description: 'existing role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId'
        },
        {
          role_id: 'missingRoleId',
          role_name: 'missing-role',
          role_description: 'existing role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId'
        },
        {
          role_id: 'newRoleId',
          role_name: 'new-role',
          role_description: 'new role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId'
        },
        {
          role_id: 'defaultRoleId',
          role_name: 'default-role',
          role_description: 'default role',
          app_name: 'test',
          permissions: ['DEVELOPER_ACCESS', 'WORKFLOW_CREATE'],
          is_private: false,
          organization_id: 'org_id',
          is_app_event_role: false,
          application_id: 'applicationId',
          is_default_app_role: true
        }
      ];

      // validateRoles after getRoles:
      validateRoles.mockReturnValue(
        roleRows
          .filter((r) => r.role_name !== 'new-role')
          .map((r) => mapper.mapRole(r))
      );

      // serviceContext.dal.role.getRoles
      serviceContext.dbConnections['sso'].write._push(
        roleRows.filter((r) => r.role_name !== 'new-role'),
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual('applicationId');
          expect(params[1]).toEqual(['org_id']);

          return true;
        }
      );

      // updateRolesData
      serviceContext.dbConnections['sso'].write._push(
        roleRows.filter((r) => r.role_name !== 'missing-role'),
        false,
        // update role, update default role, create one
        ['roleId', 'defaultRoleId', 'new-role']
      );

      const res = await dal.updateApplicationRoles(args, context);
      expect(res).toBeDefined();
      expect(res.length).toEqual(3);
      expect(
        serviceContext.bll.application.deleteApplicationRoles
      ).toHaveBeenCalledWith(
        expect.any(Object),
        ['missingRoleId'],
        expect.objectContaining({
          applicationId: 'applicationId',
          organizationId: 'org_id',
          skipRoleValidation: true,
          skipAppValidation: true
        })
      );
    });
  });
});
