const helpers = require('../../helpers');
const appHelpers = require('../../helpers/application');
const orgHelpers = require('../../helpers/organization');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const DEFAULT_APP_EVENT_ROLE_NAME = 'Default App Access';
const chakram = require('chakram');
const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

const nameOrg = `${citestMarker}-application-basics`;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);
let superAdminOption;
let useRBACFeature = false;

//Core operations of base applications
describe('citest_application: Application Basics', () => {
  let apiOptions;
  let applicationId;
  let applicationId7;
  let eventApplicationId;
  let roleIds, orgId, userId;
  let applicationOrgId, applicationOrgGUID;
  let automaticPackageCreation;
  let appPackageId;
  let adminOptions;
  let roleId;
  const uniqueId = Date.now().valueOf();
  const serviceToken =
    'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50';
  apiOptions = helpers.requestOptions(serviceToken);
  const appRolesToOrganization = [
    {
      id: uuid.v4(),
      name: `${citestMarker}-app-role-${uuid.v4()}`,
      description: `${citestMarker}-app-role`,
      isPrivate: false,
      isAppEventRole: false,
      permissions: ['CMS_ACCESS']
    }
  ];
  const appConfigDefinition = [
    {
      configKey: `${citestMarker} Citest App 8 - application to organization - ${uniqueId} -org-key`,
      configType: 'String',
      configLevel: 'Organization',
      required: false,
      secured: false,
      description: 'Tests org-level config definition.'
    },
    {
      configKey: `${citestMarker} Citest App 8 - application to organization - ${uniqueId} -user-key`,
      configType: 'String',
      configLevel: 'User',
      required: false,
      secured: false,
      description: 'Tests user-level config definition.'
    }
  ];
  const application = [
    {
      name: `${citestMarker} App 1 - ${uniqueId}`,
      key: `citest_app_1_${uniqueId}`,
      description: `${citestMarker} App 1`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false
    },
    {
      name: `${citestMarker} App 2 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_2_${uniqueId}`,
      description: `${citestMarker} App 2 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: true
    },
    {
      name: `${citestMarker} TestAppEvent - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_test_app_event_${uniqueId}`,
      description: `${citestMarker} TestAppEvent - ${uniqueId}`,
      url: 'https://dev-local.aiware.run',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    },
    {
      id: uuid.v4(),
      name: `${citestMarker} App 3 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_3_${uniqueId}`,
      description: `${citestMarker} App 3 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false
    },
    {
      id: uuid.v4(),
      name: `${citestMarker} App 4 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_4_${uniqueId}`,
      description: `${citestMarker} App 4 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    },
    {
      id: uuid.v4(),
      name: `${citestMarker} Citest App 8 - app to org - ${uniqueId}`,
      key: `${citestMarker} citest_app_8_${uniqueId}`,
      description: `${citestMarker} Citest App 8 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active',
      applicationRoles: appRolesToOrganization,
      appConfigDefinition: appConfigDefinition
    },
    {
      id: uuid.v4(),
      name: `${citestMarker} App 9 - add to org - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_9_${uniqueId}`,
      description: `${citestMarker} App 9 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active',
      appConfigDefinition: appConfigDefinition
    }
  ];

  const appReturnFields = [
    'id',
    'name',
    'key',
    'description',
    'url',
    'oauth2RedirectUrls'
  ];
  const cmeReturnFields = ['id', 'label', 'url', 'type'];
  const componentIds = {
    engines: [
      '00f5fcf8-1ad5-4a24-9f56-877d398d5050',
      '002818f8-2ebd-44ba-9c46-d8e15eb21710'
    ],
    dataRegistries: ['489a54a0-f594-4f99-b497-7c97652b14bd']
  };

  beforeAll(async () => {
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdminOption = helpers.requestOptions(result.token);

    const applicationOrganization = await getOrCreateOrganization(nameOrg);
    userId = await getOrCreateUser(applicationOrganization, uniqueId);

    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;

    adminOptions = await impersonate(userId, applicationOrgGUID, result.token);
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(
      applicationOrganization,
      'jsondata.features.automaticPackageCreation'
    );
    //adminOption is the current userOption

    useRBACFeature = await isFullRBACFeature(adminOptions);
  });

  async function isFullRBACFeature(userOption) {
    const introspectionQuery = await gqlClient.query(
      `
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`,
      {},
      userOption
    );

    const result = await gqlClient.query(
      `
        query {
          me {
            id
            name
            organization {
              name
              id
              guid
              jsondata
            }
          }
      }`,
      {},
      userOption
    );

    const hasRBACAuthModule = _.has(introspectionQuery, '__type.name');
    const olpOrgEnabled =
      _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
      'enabled';
    return hasRBACAuthModule && olpOrgEnabled;
  }

  describe('Applications LifeCycle Approved', () => {
    let basicApplicationId;
    let basicApplication = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };

    it('Create multiple applications', async () => {
      let application1 = {
        name: `${citestMarker} Citest Application Basics 1- ${uniqueId}`,
        description: basicApplication.description,
        url: basicApplication.url,
        oauth2RedirectUrls: basicApplication.oauth2RedirectUrls,
        checkPermissions: false,
        iconUrl: basicApplication.iconUrl
      };

      let application2 = {
        name: `${citestMarker} Citest Application Basics 2- ${uniqueId}`,
        description: basicApplication.description,
        url: basicApplication.url,
        oauth2RedirectUrls: basicApplication.oauth2RedirectUrls,
        checkPermissions: false,
        iconUrl: basicApplication.iconUrl
      };

      const appRes1 = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        application1
      );
      let createdApplication1 = _.get(appRes1, 'createApplication');
      let basicApplicationId1 = _.get(createdApplication1, 'id');
      expect(basicApplicationId1).toBeDefined();
      expect(createdApplication1.oauth2RedirectUrls.length).toEqual(1);
      expect(createdApplication1.name).toEqual(application1.name);

      const appRes2 = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        application2
      );
      let createdApplication2 = _.get(appRes2, 'createApplication');
      let basicApplicationId2 = _.get(createdApplication2, 'id');
      expect(basicApplicationId2).toBeDefined();
      expect(createdApplication2.oauth2RedirectUrls.length).toEqual(1);
      expect(createdApplication2.name).toEqual(application2.name);

      // Cleanup: delete created applications
      await appHelpers.helpDeleteApp(
        { gqlClient, options: adminOptions },
        basicApplicationId1
      );
      await appHelpers.helpDeleteApp(
        { gqlClient, options: adminOptions },
        basicApplicationId2
      );
    });

    it('Create an application', async () => {
      const appInput = {
        name: basicApplication.name,
        key: basicApplication.key,
        description: basicApplication.description,
        url: basicApplication.url,
        oauth2RedirectUrls: basicApplication.oauth2RedirectUrls,
        checkPermissions: basicApplication.checkPermissions,
        iconUrl: basicApplication.iconUrl
      };

      const basicAppResult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        appInput
      );
      let createdApplication = _.get(basicAppResult, 'createApplication');
      basicApplicationId = _.get(createdApplication, 'id');
      expect(basicApplicationId).toBeDefined();
      expect(createdApplication.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Query and Check created application', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: basicApplicationId
        }
      );
      expect(result.application).toBeDefined();
      expect(result.application.id).toEqual(basicApplicationId);
      expect(result.application.name).toEqual(basicApplication.name);
      expect(result.application.description).toEqual(
        basicApplication.description
      );
      expect(result.application.url).toEqual(basicApplication.url);
      expect(result.application.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Update application', async () => {
      const payload = {
        id: basicApplicationId,
        name: basicApplication.name + '_updated',
        description: basicApplication.description,
        iconUrl: basicApplication.iconUrl,
        url: basicApplication.url
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: adminOptions },
        {
          input: payload
        }
      );
      expect(result.updateApplication.id).toEqual(basicApplicationId);
      expect(result.updateApplication.iconUrl).toEqual(payload.iconUrl);
      expect(result.updateApplication.signedIconUrl).toEqual(payload.iconUrl);
      basicApplication.name = payload.name;
    });

    it('Query and Check created application after update', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: basicApplicationId
        }
      );
      expect(result.application).toBeDefined();
      expect(result.application.id).toEqual(basicApplicationId);
      expect(result.application.name).toEqual(basicApplication.name);
      expect(result.application.description).toEqual(
        basicApplication.description
      );
      expect(result.application.url).toEqual(basicApplication.url);
      expect(result.application.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Workflow application through cycle submit -> approve -> deploy', async () => {
      const actionAndStatusList = [
        ['submit', 'pending'],
        ['approve', 'approved'],
        ['deploy', 'active'],
        ['disable', 'disabled']
      ];
      for (let action of actionAndStatusList) {
        const result = await appHelpers.helpApplicationWorkflow(
          { gqlClient, options: adminOptions },
          {
            id: basicApplicationId,
            action: action[0]
          }
        );

        expect(result.applicationWorkflow.id).toEqual(basicApplicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });

    it('Delete application', async () => {
      const result = await appHelpers.helpDeleteApplication(
        { gqlClient, options: adminOptions },
        {
          id: basicApplicationId
        }
      );
      expect(_.get(result, 'deleteApplication.id')).toEqual(basicApplicationId);
    });
  });

  describe('Applications Lifecycle Rejected then Approved', () => {
    let rejectApplicationId;
    let rejectApplication = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };

    it('Create an application', async () => {
      let appInput = {
        name: rejectApplication.name,
        description: rejectApplication.description,
        url: rejectApplication.url,
        oauth2RedirectUrls: rejectApplication.oauth2RedirectUrls,
        checkPermissions: rejectApplication.checkPermissions,
        iconUrl: rejectApplication.iconUrl
      };

      const basicAppResult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        appInput
      );
      let createdApplication = _.get(basicAppResult, 'createApplication');
      rejectApplicationId = _.get(createdApplication, 'id');
      expect(rejectApplicationId).toBeDefined();
      expect(createdApplication.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Query and Check created application', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: rejectApplicationId
        }
      );

      expect(result.application).toBeDefined();
      expect(result.application.id).toEqual(rejectApplicationId);
      expect(result.application.name).toEqual(rejectApplication.name);
      expect(result.application.description).toEqual(
        rejectApplication.description
      );
      expect(result.application.url).toEqual(rejectApplication.url);
      expect(result.application.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Update application', async () => {
      const payload = {
        id: rejectApplicationId,
        name: rejectApplication.name + '_updated',
        description: rejectApplication.description,
        iconUrl: rejectApplication.iconUrl,
        url: rejectApplication.url
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: adminOptions },
        {
          input: payload
        }
      );
      expect(result.updateApplication.id).toEqual(rejectApplicationId);
      expect(result.updateApplication.iconUrl).toEqual(payload.iconUrl);
      expect(result.updateApplication.signedIconUrl).toEqual(payload.iconUrl);
      rejectApplication.name = payload.name;
    });

    it('Query and Check created application after update', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: rejectApplicationId
        }
      );

      expect(result.application).toBeDefined();
      expect(result.application.id).toEqual(rejectApplicationId);
      expect(result.application.name).toEqual(rejectApplication.name);
      expect(result.application.description).toEqual(
        rejectApplication.description
      );
      expect(result.application.url).toEqual(rejectApplication.url);
      expect(result.application.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Workflow application through cycle submit -> reject -> submit -> approve -> deploy -> disabled -> enabled', async () => {
      const actionAndStatusList = [
        ['submit', 'pending'],
        ['reject', 'rejected'],
        ['submit', 'pending'],
        ['approve', 'approved'],
        ['deploy', 'active'],
        ['disable', 'disabled'],
        ['enable', 'approved']
      ];
      for (let action of actionAndStatusList) {
        const result = await appHelpers.helpApplicationWorkflow(
          { gqlClient, options: adminOptions },
          {
            id: rejectApplicationId,
            action: action[0]
          }
        );
        expect(result.applicationWorkflow.id).toEqual(rejectApplicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });
    it('Delete application', async () => {
      const result = await appHelpers.helpDeleteApplication(
        { gqlClient, options: adminOptions },
        {
          id: rejectApplicationId
        }
      );
      expect(_.get(result, 'deleteApplication.id')).toEqual(
        rejectApplicationId
      );
    });
  }); //Testing

  describe('Application Errors', () => {
    let baseApplication = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };
    let baseApplicationId;

    it('Create base application', async () => {
      const appInput = {
        name: baseApplication.name,
        description: baseApplication.description,
        url: baseApplication.url,
        oauth2RedirectUrls: baseApplication.oauth2RedirectUrls,
        checkPermissions: baseApplication.checkPermissions,
        iconUrl: baseApplication.iconUrl
      };

      const basicAppResult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        appInput
      );
      let createdApplication = _.get(basicAppResult, 'createApplication');
      baseApplicationId = _.get(createdApplication, 'id');
      expect(baseApplicationId).toBeDefined();
    });

    it('Create application with duplicate name', async () => {
      const appInput = {
        name: baseApplication.name,
        description: baseApplication.description,
        url: baseApplication.url,
        oauth2RedirectUrls: baseApplication.oauth2RedirectUrls,
        checkPermissions: baseApplication.checkPermissions,
        iconUrl: baseApplication.iconUrl
      };

      try {
        await appHelpers.helpCreateApp(
          { gqlClient, options: adminOptions },
          appInput
        );
      } catch (ex) {
        expect(ex.message).toContain(
          'An application with this name already exists'
        );
      }
    });

    it.skip('Create application with duplicate id', async () => {
      const appInput = {
        id: baseApplicationId,
        name: baseApplication.name + ' + duplicate',
        description: baseApplication.description,
        url: baseApplication.url,
        oauth2RedirectUrls: baseApplication.oauth2RedirectUrls,
        checkPermissions: baseApplication.checkPermissions,
        iconUrl: baseApplication.iconUrl
      };

      try {
        await appHelpers.helpCreateApp(
          { gqlClient, options: adminOptions },
          appInput
        );
      } catch (ex) {
        expect(ex.message).toContain(
          'An application with this id already exists'
        );
      }
    });

    it('Application workflow invalid action', async () => {
      try {
        await appHelpers.helpApplicationWorkflow(
          { gqlClient, options: adminOptions },
          {
            id: baseApplicationId,
            action: 'invalid_action'
          }
        );
      } catch (ex) {
        expect(ex.message).toContain('invalid_action');
      }
    });

    it('Cleanup base application', async () => {
      try {
        const result = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: baseApplicationId
          }
        );
        expect(_.get(result, 'deleteApplication.id')).toEqual(
          baseApplicationId
        );
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  xit('get dailyTaskMetrics', async () => {
    let id = '8b3eac1c-5150-448e-8d99-fb7b860e7e41';
    const result = await appHelpers.helpGetApplication(
      { gqlClient, options: adminOptions },
      {
        id: id
      }
    );
    expect(
      _.get(result, 'application.dailyTaskMetrics.records.length')
    ).toBeDefined();
  });

  describe('Applications with enableAppEventFeature flag', () => {
    itif(
      global.enableAppEventFeature,
      'get roleIds of current user (for adding to application JWT token)',
      async () => {
        const query = `
      query {
        me {
          id
          organizationId
          roles {
            id
          }
        }
      }
    `;
        const result = await gqlClient.query(query, null, adminOptions);
        const roles = _.get(result, 'me.roles');

        orgId = _.get(result, 'me.organizationId');
        userId = _.get(result, 'me.id');
        expect(roles).toBeDefined();
        expect(orgId).toBeDefined();
        expect(userId).toBeDefined();
        expect(_.isArray(roles)).toEqual(true);
        expect(_.isEmpty(roles)).toEqual(false);
        roleIds = _.map(roles, (role) => role.id);
      }
    );

    itif(
      global.enableAppEventFeature,
      'get JWT token for application',
      async () => {
        const result = await appHelpers.helpGetApplicationJWT(
          { gqlClient, options: adminOptions },
          {
            appId: applicationId,
            orgId: orgId,
            roleIds: roleIds
          }
        );
        const getApplicationJWT = _.get(result, 'getApplicationJWT');

        expect(getApplicationJWT).toBeDefined();
        expect(getApplicationJWT.applicationId).toEqual(applicationId);
        expect(getApplicationJWT.organizationId).toEqual(orgId);
        expect(getApplicationJWT.token).toBeDefined();
        expect(jwt.decode(getApplicationJWT.token)).toEqual({
          contentApplicationId: expect.any(String),
          contentOrganizationId: parseInt(orgId),
          tokenApplicationId: applicationId,
          userId: userId,
          scope: [
            {
              actions: expect.any(Array),
              resources: { applicationId: applicationId }
            }
          ],
          iat: expect.any(Number),
          exp: expect.any(Number),
          sub: 'engine-run',
          jti: expect.any(String)
        });
      }
    );

    itif(
      global.enableAppEventFeature,
      'add application for organization',
      async () => {
        const result = await orgHelpers.updateOrganization(
          { gqlClient, options: adminOptions },
          {
            id: orgId,
            applicationAccess: [
              {
                applicationId: eventApplicationId,
                enable: true
              }
            ]
          }
        );

        expect(result.id).toEqual(orgId);
        expect(result.name).toBeDefined();
        expect(result.applications.records.length).toBeGreaterThan(0);
      }
    );

    itif(
      global.enableAppEventFeature,
      'add an endpoint to the application',
      async () => {
        const testEventEndpoint = 'https://dev-local.aiware.run/event-endpoint';

        const result = await appHelpers.helpUpdateApplicationEventEndpoint(
          { gqlClient, options: adminOptions },
          {
            id: eventApplicationId,
            eventEndpoint: testEventEndpoint
          }
        );

        const app = _.get(result, 'updateApplicationEventEndpoint');
        expect(app.id).toEqual(eventApplicationId);
        expect(app.eventEndpoint).toEqual(testEventEndpoint);
        application[2].eventEndpoint = testEventEndpoint;
      }
    );

    itif(
      global.enableAppEventFeature,
      'check application event endpoint is set',
      async () => {
        const result = await appHelpers.helpGetApplication(
          { gqlClient, options: adminOptions },
          {
            id: eventApplicationId
          }
        );

        const app = _.get(result, 'application');
        expect(app.id).toEqual(eventApplicationId);
        expect(app.eventEndpoint).toEqual(application[2].eventEndpoint);
      }
    );

    itif(
      global.enableAppEventFeature,
      'remove event endpoint from application',
      async () => {
        const result = await appHelpers.helpRemoveApplicationEventEndpoint(
          { gqlClient, options: adminOptions },
          {
            id: eventApplicationId
          }
        );

        const deleteResult = _.get(result, 'removeApplicationEventEndpoint');
        expect(deleteResult.id).toEqual(eventApplicationId);
        expect(deleteResult.message).toBeDefined();
      }
    );

    itif(
      global.enableRBACFeature && useRBACFeature,
      'add application to an organization - create default appRole AG and appRole PS',
      async () => {
        const app = application[7];
        let applicationIdToOrg;
        let roleId;
        try {
          // create application
          let appInput = {
            id: app.id,
            name: app.name,
            description: app.description,
            url: app.url,
            checkPermissions: app.checkPermissions,
            applicationRoles: app.applicationRoles,
            applicationConfigDefinition: app.appConfigDefinition
          };
          const resultApp = await appHelpers.helpCreateApp(
            { gqlClient, options: adminOptions },
            appInput
          );
          expect(resultApp).toBeDefined();
          expect(resultApp.createApplication).toBeDefined();
          expect(resultApp.createApplication.id).toEqual(app.id);
          expect(resultApp.createApplication.name).toEqual(app.name);
          expect(resultApp.createApplication.applicationRoles).toBeDefined();
          expect(resultApp.createApplication.applicationRoles.length).toEqual(
            1
          );
          expect(
            resultApp.createApplication.applicationRoles[0].id
          ).toBeDefined();
          expect(
            resultApp.createApplication.applicationRoles[0].permissions
          ).toBeDefined();
          expect(
            resultApp.createApplication.applicationRoles[0].permissions.length
          ).toEqual(1);
          expect(
            resultApp.createApplication.applicationRoles[0].permissions[0]
          ).toEqual(`CMS_ACCESS`);
          expect(
            resultApp.createApplication.applicationRoles[0].isPrivate
          ).toEqual(false);
          expect(
            resultApp.createApplication.applicationRoles[0]
              .isApplicationEventRole
          ).toEqual(false);
          applicationIdToOrg = app.id;
          roleId = resultApp.createApplication.applicationRoles[0].id;
        } catch (ex) {
          validateInvalidApplicationRoles(ex);
        }

        if (applicationIdToOrg && roleId) {
          // add app to org
          let inputAppAddToOrg = {
            orgId: applicationOrgId,
            appId: applicationIdToOrg,
            configs: [
              {
                configKey: app.appConfigDefinition[0].configKey,
                configValue: 'test'
              }
            ]
          };
          const resultAddToOrg = await appHelpers.helpApplicationAddToOrg(
            { gqlClient, options: adminOptions },
            inputAppAddToOrg
          );
          const addApplicationToOrganization = _.get(
            resultAddToOrg,
            'applicationAddToOrg'
          );
          expect(addApplicationToOrganization.id).toEqual(applicationIdToOrg);

          // Wait for application add to organization to propagate
          await helpers.sleep(1000);

          // getApplicationConfig
          let appConfigInput = {
            orgId: applicationOrgId,
            appId: applicationIdToOrg,
            configKeyRegexp: app.appConfigDefinition[0].configKey
          };
          const resultGetAppConfig = await appHelpers.helpGetApplicationConfig(
            { gqlClient, options: adminOptions },
            appConfigInput
          );

          const userIdInAppConfig = _.get(
            resultGetAppConfig,
            'applicationConfig.records[0].userId'
          );
          // userId field of a config at org level must be null.
          expect(userIdInAppConfig).toEqual(null);

          // check authGroups
          const queryAuthGroups = `
            query {
              authGroups(
                appRoleID: "${roleId}"
                ownerOrganization: "${applicationOrgGUID}",
              ) {
                records {
                  id
                  appRole {
                    id
                  }
                }
              }
            }
          `;
          const resultAuthGroups = await gqlClient.query(
            queryAuthGroups,
            null,
            adminOptions
          );
          const resAuthGroups = _.get(resultAuthGroups, 'authGroups.records');
          expect(_.get(resAuthGroups, '[0].id')).toBeDefined();
          expect(_.get(resAuthGroups, '[0].appRole.id')).toEqual(roleId);

          // FIXME: uncomment the permissionSets check after the VE-2954 is merged on Stage/Prod
          // // check permissionSets
          // const queryPermissionSet = `
          //   query permission {
          //     authPermissionSets(
          //       roleID: "${roleId}"
          //       ownerOrganization: ${applicationOrgId}
          //     ) {
          //       records {
          //         id
          //         name
          //         applicationRole {
          //           id
          //         }
          //       }
          //     }
          //   }
          // `;

          // const resultPermissionSet = await gqlClient.query(queryPermissionSet);
          // const permissionSets = _.get(
          //   resultPermissionSet,
          //   'authPermissionSets.records'
          // );
          // // This does not happen in cluster environment and might be a pre-existing authGroup/permission set
          // // that allowed this test to pass
          // expect(_.get(permissionSets, '[0].id')).toBeDefined();
          // expect(_.get(permissionSets, '[0].applicationRole.id')).toEqual(roleId);

          // delete test application
          const res = await appHelpers.helpDeleteApplication(
            { gqlClient, options: adminOptions },
            {
              id: applicationIdToOrg
            }
          );
          expect(_.get(res, 'deleteApplication.id')).toEqual(
            applicationIdToOrg
          );
        }
      }
    );

    // feature flag enableAppEventFeature must be enabled in both core-admin and core-graphql
    // when adding an app to the org, the appRole auth group is created async via eventing.
    itif(
      global.enableAppEventFeature,
      'add application to an organization with defaultAppAccess role creation',
      async () => {
        // create application
        const app = application[8];
        let appInput = {
          id: app.id,
          name: app.name,
          key: app.key,
          description: app.description,
          url: app.url,
          checkPermissions: app.checkPermissions,
          applicationConfigDefinition: app.appConfigDefinition
        };

        const resultApp = await appHelpers.helpCreateApp(
          { gqlClient, options: adminOptions },
          appInput
        );
        expect(resultApp).toBeDefined();
        expect(resultApp.createApplication).toBeDefined();
        expect(resultApp.createApplication.id).toEqual(app.id);
        expect(resultApp.createApplication.name).toEqual(app.name);
        // createApplication without applicationRoles
        expect(resultApp.createApplication.applicationRoles.length).toEqual(0);
        const applicationIdToOrg = app.id;

        // add app to org
        let inputAppAddToOrg = {
          orgId: applicationOrgId,
          appId: applicationIdToOrg,
          configs: [
            {
              configKey: app.appConfigDefinition[0].configKey,
              configValue: 'test'
            }
          ]
        };
        const resultAddToOrg = await appHelpers.helpApplicationAddToOrg(
          { gqlClient, options: adminOptions },
          inputAppAddToOrg
        );
        const addApplicationToOrganization = _.get(
          resultAddToOrg,
          'applicationAddToOrg'
        );
        expect(addApplicationToOrganization.id).toEqual(applicationIdToOrg);
        // A defaultAppAccess role will be created when adding app to org
        expect(
          resultAddToOrg.applicationAddToOrg.applicationRoles
        ).toBeDefined();
        expect(
          resultAddToOrg.applicationAddToOrg.applicationRoles.length
        ).toEqual(1);
        expect(
          resultAddToOrg.applicationAddToOrg.applicationRoles[0].name
        ).toEqual(DEFAULT_APP_EVENT_ROLE_NAME);
        expect(
          resultAddToOrg.applicationAddToOrg.applicationRoles[0].permissions
        ).toBeDefined();
        expect(
          resultAddToOrg.applicationAddToOrg.applicationRoles[0].permissions
            .length
        ).toBeGreaterThan(0);
        expect(
          resultAddToOrg.applicationAddToOrg.applicationRoles[0]
            .isApplicationEventRole
        ).toEqual(true);

        // Wait for application add to organization to propagate
        await helpers.sleep(1000);

        // getApplicationConfig
        let appConfigInput = {
          orgId: applicationOrgId,
          appId: applicationIdToOrg,
          configKeyRegexp: app.appConfigDefinition[0].configKey
        };
        const resultGetAppConfig = await appHelpers.helpGetApplicationConfig(
          { gqlClient, options: adminOptions },
          appConfigInput
        );
        const userIdInAppConfig = _.get(
          resultGetAppConfig,
          'applicationConfig.records[0].userId'
        );
        // userId field of a config at org level must be null.
        expect(userIdInAppConfig).toEqual(null);

        // delete test application
        const res = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: applicationIdToOrg
          }
        );
        expect(_.get(res, 'deleteApplication.id')).toEqual(applicationIdToOrg);
      }
    );
  });

  afterAll(async () => {
    try {
      // Delete user created in beforeAll
      if (userId) {
        const deleteUserQuery = `mutation {
          deleteUser(id: "${userId}") {
            id
          }
        }`;
        await gqlClient.query(deleteUserQuery);
      }
    } catch (error) {
      // User deletion may fail if already deleted or if user doesn't exist
      console.error('Error deleting user in afterAll:', error.message);
    }

    try {
      // Mark organization as deleted
      if (applicationOrgId) {
        const deleteOrgQuery = `mutation {
          updateOrganization(input: {
            id: "${applicationOrgId}"
            status: "deleted"
          }) {
            id
            status
          }
        }`;
        await gqlClient.query(deleteOrgQuery);
      }
    } catch (error) {
      // Organization deletion may fail if already deleted
      console.error('Error deleting organization in afterAll:', error.message);
    }
  });
});

/*
  These tests ensure that the application queries and mutations
  that Hub uses work as expected with their api tokens.
 */
(gqlClient.isEnableResourceTest() ? describe : xdescribe)(
  'Application - Hub',
  () => {
    let simpleApplicationId;
    let cmeApplicationId;
    let appRolesApplicationId;
    let headerbarApplicationId;
    let appConfigApplicationId;
    let adminOptions;
    const uniqueId = Date.now().valueOf();
    const application = {
      simple: {
        name: `${citestMarker} Hub Test Application - ${uniqueId}`,
        description: `${citestMarker} Hub Test Application`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        iconUrl: 'http://abc.com/link-icon.png',
        status: 'active'
      },
      cme: {
        name: `${citestMarker} Hub Test ContextMenuExtensions - ${uniqueId}`,
        description: `${citestMarker} Hub Test ContextMenuExtensions`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active'
      },
      appRoles: {
        name: `${citestMarker} Hub Test ApplicationRoles - ${uniqueId}`,
        description: `${citestMarker} Hub Test ApplicationRoles`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: true,
        status: 'active'
      },
      headerbar: {
        id: uuid.v4(),
        name: `${citestMarker} Hub Test Headerbar - ${uniqueId}`,
        description: `${citestMarker} Hub Test Headerbar`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active'
      },
      appConfig: {
        id: uuid.v4(),
        name: `${citestMarker} Hub Test ApplicationConfigDefinition - ${uniqueId}`,
        description: `${citestMarker} Hub Test ApplicationConfigDefinition`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active'
      }
    };
    _.forEach(_.keys(application), (property) => {
      application[property].key = _.snakeCase(application[property].name);
    });
    const appReturnFields = [
      'id',
      'name',
      'key',
      'description',
      'url',
      'oauth2RedirectUrls',
      'status'
    ];
    const cmeReturnFields = ['id', 'label', 'url', 'type'];
    const cmeAppReturnFields = `contextMenuExtensions {
       mentions {
         ${cmeReturnFields.join(' ')}
       }
       tdos {
         ${cmeReturnFields.join(' ')}
       }
       watchlists {
         ${cmeReturnFields.join(' ')}
       }
       collections {
         ${cmeReturnFields.join(' ')}
       }
     }`;
    const cmeTypes = ['mentions', 'tdos', 'watchlists', 'collections'];
    let automaticPackageCreation;

    let hubUserId;
    let hubOrgId;

    beforeAll(async () => {
      const result = await gqlClient.connect();
      expect(result.apiToken).toBeDefined();
      expect(result.token).toBeDefined();

      const applicationOrganization = await getOrCreateOrganization(nameOrg);
      const userId = await getOrCreateUser(applicationOrganization, uniqueId);
      const applicationOrgGUID = applicationOrganization.guid;

      // Store for cleanup in afterAll
      hubUserId = userId;
      hubOrgId = applicationOrganization.id;

      adminOptions = await impersonate(
        userId,
        applicationOrgGUID,
        result.token
      );

      // this feature is undefined in ai13s but the following code checks for "disabled" value
      automaticPackageCreation = _.get(
        applicationOrganization,
        'jsondata.features.automaticPackageCreation'
      );
    });

    /*
    Mutations - Create
  */

    it('should create a simple application using Hub token with automatic package creation disabled', async () => {
      const query = `
      mutation {
        createApplication(input: {
          name: "${application.simple.name}",
          description: "${application.simple.description}",
          url: "${application.simple.url}",
          oauth2RedirectUrls: "${application.simple.oauth2RedirectUrls}",
          checkPermissions: ${application.simple.checkPermissions},
          status: ${application.simple.status}
          disableAutoPackageCreation: true
        }) {
          ${appReturnFields.join(' ')}
        }
      }`;
      const result = await gqlClient.queryByAIDataOrgToken(query);
      expect(result).toBeDefined();

      simpleApplicationId = result.createApplication.id;
      expect(simpleApplicationId).toBeDefined();

      expect(result.createApplication.oauth2RedirectUrls.length).toEqual(1);

      expect(
        _.omit(result.createApplication, ['id', 'oauth2RedirectUrls'])
      ).toEqual(
        _.omit(application.simple, [
          'id',
          'checkPermissions',
          'oauth2RedirectUrls',
          'iconUrl'
        ])
      );
    });

    it('should not have created an application package when creating an application', async () => {
      const query = `
        query {
          packages(primaryResourceId: "${simpleApplicationId}") {
            records {
              id
              primaryResource {
                resourceId
                resourceType
              }
            }
          }
        }
      `;

      const result = await gqlClient.queryByInternalOrglessToken(query, null);

      expect(result.packages).toBeDefined();
      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toEqual(0);
    });

    // createApplication.contextMenuExtensions
    it('should create an application with context menu extensions using Hub token', async () => {
      const payload = {
        mentions: [
          {
            id: uuid.v4(),
            label: 'Foo Mention',
            url: 'http://www.example.com/${mentionId}',
            type: 'mention'
          }
        ],
        tdos: [
          {
            id: uuid.v4(),
            label: 'Foo TDO',
            url: 'http://www.example.com/${tdoId}',
            type: 'tdo'
          }
        ],
        watchlists: [
          {
            id: uuid.v4(),
            label: 'Foo Watchlist',
            url: 'http://www.example.com/${watchlistId}',
            type: 'watchlist'
          }
        ],
        collections: [
          {
            id: uuid.v4(),
            label: 'Foo Collection',
            url: 'http://www.example.com/${collectionId}',
            type: 'collection'
          }
        ]
      };

      const query = `
      mutation CreateApplicationWithCME($cmeInput: AppCreateContextMenuExtensions) {
        createApplication(input: {
          name: "${application.cme.name}",
          description: "${application.cme.description}",
          url: "${application.cme.url}",
          oauth2RedirectUrls: "${application.cme.oauth2RedirectUrls}",
          checkPermissions: ${application.cme.checkPermissions},
          status: ${application.cme.status},
          contextMenuExtensions: $cmeInput
        }) {
          ${appReturnFields.join(' ')}
          ${cmeAppReturnFields}
        }
      }`;

      const result = await gqlClient.queryByAIDataOrgToken(query, {
        cmeInput: payload
      });

      expect(result).toBeDefined();

      cmeApplicationId = result.createApplication.id;
      expect(cmeApplicationId).toBeDefined();

      expect(result.createApplication.oauth2RedirectUrls.length).toEqual(1);

      expect(
        _.omit(result.createApplication, [
          'id',
          'oauth2RedirectUrls',
          'contextMenuExtensions'
        ])
      ).toEqual(
        _.omit(application.cme, [
          'id',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );

      _.forEach(cmeTypes, (field) => {
        expect(
          result.createApplication.contextMenuExtensions[field][0]
        ).toEqual(expect.objectContaining(payload[field][0]));
      });

      application.cme.contextMenuExtensions =
        result.createApplication.contextMenuExtensions;
    });

    // createApplication.applicationRoles
    it('should create an application with application roles using Hub token', async () => {
      const payload = [
        {
          id: uuid.v4(),
          name: `${citestMarker}-app-role-${uuid.v4()}`,
          description: `${citestMarker}-app-role`,
          isPrivate: false,
          isAppEventRole: false,
          permissions: ['DEVELOPER_ACCESS', 'DEVELOPER_BUILD_APPROVE']
        }
      ];

      const query = `
      mutation CreateApplicationWithRoles($appRolesInput: [CreateApplicationRole!]) {
        createApplication(input: {
          name: "${application.appRoles.name}",
          description: "${application.appRoles.description}",
          url: "${application.appRoles.url}",
          oauth2RedirectUrls: "${application.appRoles.oauth2RedirectUrls}",
          checkPermissions: ${application.appRoles.checkPermissions},
          status: ${application.appRoles.status}
          applicationRoles: $appRolesInput
        }) {
          ${appReturnFields.join(' ')},
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
          }
        }
      }`;

      try {
        const result = await gqlClient.queryByAIDataOrgToken(query, {
          appRolesInput: payload
        });
        expect(result).toBeDefined();

        appRolesApplicationId = result.createApplication.id;
        expect(appRolesApplicationId).toBeDefined();

        expect(result.createApplication.name).toEqual(
          application.appRoles.name
        );
        expect(result.createApplication.applicationRoles).toBeDefined();
        expect(result.createApplication.applicationRoles.length).toEqual(1);
        expect(
          result.createApplication.applicationRoles[0].permissions
        ).toBeDefined();
        expect(
          result.createApplication.applicationRoles[0].permissions.length
        ).toEqual(2);
        expect(
          result.createApplication.applicationRoles[0].permissions
        ).toEqual(payload[0].permissions);

        application.appRoles.applicationRoles =
          result.createApplication.applicationRoles;
      } catch (ex) {
        validateInvalidApplicationRoles(ex);
      }
    });

    // createApplication.headerbar
    it('should create an application with a headerbar using Hub token', async () => {
      const payload = {
        name: `${application.headerbar.name}-headerbar`,
        config: {
          backgroundColor: '#0000FF',
          help: true,
          notification: false,
          logoSrc: 'www.example.com'
        }
      };

      const query = `
      mutation CreateApplicationWithHeaderbar($headerbarInput: ApplicationHeaderbarInput) {
        createApplication(input: {
          name: "${application.headerbar.name}",
          description: "${application.headerbar.description}",
          url: "${application.headerbar.url}",
          oauth2RedirectUrls: "${application.headerbar.oauth2RedirectUrls}",
          checkPermissions: ${application.headerbar.checkPermissions},
          status: ${application.headerbar.status}
          headerbar: $headerbarInput
        }) {
          ${appReturnFields.join(' ')},
          applicationHeaderbar {
            name
            config {
              backgroundColor
              help
              notification
              logoSrc
            }
          }
        }
      }`;

      const result = await gqlClient.queryByAIDataOrgToken(query, {
        headerbarInput: payload
      });
      expect(result).toBeDefined();

      headerbarApplicationId = result.createApplication.id;
      expect(headerbarApplicationId).toBeDefined();

      expect(result.createApplication.name).toEqual(application.headerbar.name);
      expect(result.createApplication.applicationHeaderbar).toBeDefined();
      expect(result.createApplication.applicationHeaderbar).toEqual(payload);

      application.headerbar.applicationHeaderbar =
        result.createApplication.applicationHeaderbar;
    });

    // createApplication.applicationConfigDefinition
    it('should create an application with config definitions using Hub token', async () => {
      const payload = [
        {
          configKey: `${application.appConfig.name}-org-key`,
          configType: 'String',
          configLevel: 'Organization',
          required: false,
          secured: false,
          description: 'Tests org-level config definition for Hub.'
        },
        {
          configKey: `${application.appConfig.name}-user-key`,
          configType: 'String',
          configLevel: 'User',
          required: false,
          secured: false,
          description: 'Tests user-level config definition for Hub.'
        }
      ];

      const query = `
      mutation CreateApplicationWithConfigDef($appConfigDefInput: [ApplicationConfigDefinitionInput]) {
        createApplication(input: {
          name: "${application.appConfig.name}",
          description: "${application.appConfig.description}",
          url: "${application.appConfig.url}",
          oauth2RedirectUrls: "${application.appConfig.oauth2RedirectUrls}",
          checkPermissions: ${application.appConfig.checkPermissions},
          status: ${application.appConfig.status}
          applicationConfigDefinition: $appConfigDefInput
        }) {
          ${appReturnFields.join(' ')},
          applicationConfigDefinition {
            count
            records {
              applicationId
              configKey
              configType
              configLevel
              required
              secured
              description
            }
          }
        }
      }`;

      const result = await gqlClient.queryByAIDataOrgToken(query, {
        appConfigDefInput: payload
      });
      expect(result).toBeDefined();

      appConfigApplicationId = result.createApplication.id;
      expect(appConfigApplicationId).toBeDefined();

      expect(result.createApplication.name).toEqual(application.appConfig.name);
      expect(
        result.createApplication.applicationConfigDefinition
      ).toBeDefined();
      expect(
        result.createApplication.applicationConfigDefinition.count
      ).toEqual(2);
      expect(
        result.createApplication.applicationConfigDefinition.records
      ).toBeDefined();

      expect(
        result.createApplication.applicationConfigDefinition.records[0]
      ).toEqual(expect.objectContaining(payload[0]));
      expect(
        result.createApplication.applicationConfigDefinition.records[0]
          .applicationId
      ).toEqual(appConfigApplicationId);

      expect(
        result.createApplication.applicationConfigDefinition.records[1]
      ).toEqual(expect.objectContaining(payload[1]));
      expect(
        result.createApplication.applicationConfigDefinition.records[1]
          .applicationId
      ).toEqual(appConfigApplicationId);

      application.appConfig.applicationConfigDefinitions =
        result.createApplication.applicationConfigDefinition.records;
    });

    /*
    Mutations - Update
  */

    // updateApplication
    it('should update an application using Hub token', async () => {
      const payload = {
        id: simpleApplicationId,
        status: 'active',
        name: application.simple.name + '_updated',
        description: application.simple.description,
        iconUrl: application.simple.iconUrl,
        url: application.simple.url
      };

      const query = `
        mutation UpdateApplication($input: UpdateApplication) {
          updateApplication(input: $input) {
            id
            name
            iconUrl
            signedIconUrl
          }
        }
      `;
      const result = await gqlClient.queryByAIDataOrgToken(query, {
        input: payload
      });
      expect(result.updateApplication.id).toEqual(simpleApplicationId);
      expect(result.updateApplication.iconUrl).toEqual(payload.iconUrl);
      expect(result.updateApplication.signedIconUrl).toEqual(payload.iconUrl);
      application.simple.name = payload.name;
    });

    // updateApplication.contextMenuExtensions
    it('should update context menu extensions through updateApplication using Hub token', async () => {
      const payload = {
        id: cmeApplicationId,
        contextMenuExtensions: {
          mentions: [
            {
              id: _.get(
                application.cme.contextMenuExtensions,
                'mentions[0].id'
              ),
              label: 'FooBar Mention',
              url: 'http://www.example.com/${mentionId}'
            }
          ],
          tdos: [
            {
              id: _.get(application.cme.contextMenuExtensions, 'tdos[0].id'),
              label: 'FooBar TDO',
              url: 'http://www.example.com/${tdoId}'
            }
          ],
          watchlists: [
            {
              id: _.get(
                application.cme.contextMenuExtensions,
                'watchlists[0].id'
              ),
              label: 'FooBar Watchlist',
              url: 'http://www.example.com/${watchlistId}'
            }
          ],
          collections: [
            {
              id: _.get(
                application.cme.contextMenuExtensions,
                'collections[0].id'
              ),
              label: 'FooBar Collection',
              url: 'http://www.example.com/${collectionId}'
            }
          ]
        }
      };

      const query = `
        mutation UpdateApplication($input: UpdateApplication) {
          updateApplication(input: $input) {
            id
            ${cmeAppReturnFields}
          }
        }
      `;

      const result = await gqlClient.queryByAIDataOrgToken(query, {
        input: payload
      });
      expect(result.updateApplication.id).toEqual(cmeApplicationId);

      _.forEach(cmeTypes, (cmeType) => {
        expect(
          result.updateApplication.contextMenuExtensions[cmeType].length
        ).toEqual(1);

        expect(
          result.updateApplication.contextMenuExtensions[cmeType][0]
        ).toEqual(
          expect.objectContaining(payload.contextMenuExtensions[cmeType][0])
        );

        expect(
          result.updateApplication.contextMenuExtensions[cmeType][0].type
        ).toEqual(cmeType.substring(0, cmeType.length - 1));
      });

      application.cme.contextMenuExtensions =
        result.updateApplication.contextMenuExtensions;
    });

    // updateApplicationRole TODO: Enable when updateApplicationRole has been implemented
    xit('should update application role using Hub token', async () => {
      const payload = {
        id: application.appRoles.applicationRoles[0].id,
        description: 'ci-hub-test-app-role-updated',
        permissions: ['AIWARE_FLOW_READ']
      };

      const query = `
      mutation UpdateApplicationRole($appRoleInput: UpdateApplicationRoleInput) {
        updateApplicationRole(input: $appRoleInput) {
          id
          name
          permissions
        }
      }`;

      const result = await gqlClient.queryByAIDataOrgToken(query, {
        $appRoleInput: payload
      });
      expect(result).toBeDefined();

      expect(result.updateApplicationRole.name).toEqual(
        application.appRoles.name
      );

      expect(result.updateApplicationRole.permissions).toBeDefined();
      expect(
        result.createApplication.updateApplicationRole.permissions.length
      ).toEqual(3);
      expect(result.updateApplicationRole.permissions).toEqual([
        ...application.appRoles.applicationRoles[0].permissions,
        ...payload.permissions
      ]);
    });

    // updateApplication.headerbar
    it('should update headerbar through updateApplication using Hub token', async () => {
      const payload = {
        id: headerbarApplicationId,
        headerbar: {
          name: `${application.headerbar.applicationHeaderbar.name}-updated`,
          config: {
            backgroundColor: '#000000',
            help: true,
            notification: false,
            logoSrc: 'www.other-example.com'
          }
        }
      };

      const query = `
        mutation UpdateApplication($input: UpdateApplication) {
          updateApplication(input: $input) {
            id
            name
            applicationHeaderbar {
              name
              config {
                backgroundColor
                help
                notification
                logoSrc
              }
            }
          }
        }
      `;
      const result = await gqlClient.queryByAIDataOrgToken(query, {
        input: payload
      });
      expect(result.updateApplication.id).toEqual(headerbarApplicationId);
      expect(result.updateApplication.name).toEqual(application.headerbar.name);
      expect(result.updateApplication.applicationHeaderbar).toEqual(
        payload.headerbar
      );

      application.headerbar.applicationHeaderbar =
        result.updateApplication.applicationHeaderbar;
    });

    it('should update config definitions through updateApplication using Hub token', async () => {
      const payload = {
        id: appConfigApplicationId,
        applicationConfigDefinition: [
          {
            configKey:
              application.appConfig.applicationConfigDefinitions[0].configKey,
            update: {
              configKey: `${application.appConfig.applicationConfigDefinitions[0].configKey}-updated`
            }
          },
          {
            configKey:
              application.appConfig.applicationConfigDefinitions[1].configKey,
            update: {
              configKey: `${application.appConfig.applicationConfigDefinitions[1].configKey}-updated`
            }
          }
        ]
      };

      const expectedAppConfigDefinitions = [
        {
          ...application.appConfig.applicationConfigDefinitions[0],
          configKey: payload.applicationConfigDefinition[0].update.configKey
        },
        {
          ...application.appConfig.applicationConfigDefinitions[1],
          configKey: payload.applicationConfigDefinition[1].update.configKey
        }
      ];

      const query = `
        mutation UpdateApplication($input: UpdateApplication) {
          updateApplication(input: $input) {
            id
            name
            applicationConfigDefinition {
              count
              records {
                applicationId
                configKey
                configType
                configLevel
                required
                secured
                description
              }
            }
          }
        }
      `;
      const result = await gqlClient.queryByAIDataOrgToken(query, {
        input: payload
      });
      expect(result).toBeDefined();
      expect(result.updateApplication).toBeDefined();
      expect(
        result.updateApplication.applicationConfigDefinition
      ).toBeDefined();
      expect(
        result.updateApplication.applicationConfigDefinition.count
      ).toEqual(2);
      expect(
        result.updateApplication.applicationConfigDefinition.records
      ).toBeDefined();

      expect(
        result.updateApplication.applicationConfigDefinition.records
      ).toEqual(expect.arrayContaining(expectedAppConfigDefinitions));

      application.appConfig.applicationConfigDefinitions =
        result.updateApplication.applicationConfigDefinition.records;
    });

    /*
      Queries
    */

    it('retrieve an application using Hub token', async () => {
      const query = `
      query {
        applications(id: "${simpleApplicationId}") {
          records {
              ${appReturnFields.join(' ')}
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toEqual(1);
      expect(result.applications.records[0].id).toEqual(simpleApplicationId);
      expect(result.applications.records[0].name).toEqual(
        application.simple.name
      );
    });

    it('retrieve multiple applications by IDs using Hub token', async () => {
      const appIds = [simpleApplicationId, cmeApplicationId].filter(Boolean);
      const query = `
      query {
        applications(ids: ${JSON.stringify(appIds)}) {
          records {
              ${appReturnFields.join(' ')}
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toEqual(appIds.length);
      const returnedIds = result.applications.records.map((r) => r.id);
      expect(returnedIds).toEqual(expect.arrayContaining(appIds));
    });

    it('retrieve multiple applications using both id and ids filters using Hub token', async () => {
      const appIds = [cmeApplicationId].filter((id) => id);
      const query = `
      query {
        applications(id: "${simpleApplicationId}", ids: ${JSON.stringify(appIds)}) {
          records {
            id
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      const expectedIds = [simpleApplicationId, ...appIds];
      expect(result.applications.records.length).toEqual(expectedIds.length);
      const returnedIds = result.applications.records.map((r) => r.id);
      expect(returnedIds).toEqual(expect.arrayContaining(expectedIds));
    });

    it('retrieve multiple applications using Hub token', async () => {
      const query = `
      query {
        applications {
          records {
            id
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toBeGreaterThan(1);
    });

    it('retrieve an application with context menu extensions using Hub token', async () => {
      const query = `
      query {
        applications(id: "${cmeApplicationId}") {
          records {
            id
            ${cmeAppReturnFields}
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toEqual(1);
      expect(result.applications.records[0].id).toEqual(cmeApplicationId);
      expect(result.applications.records[0].contextMenuExtensions).toEqual(
        application.cme.contextMenuExtensions
      );
    });

    it('retrieve an application with application roles using Hub token', async () => {
      if (!appRolesApplicationId) {
        return;
      }

      const query = `
      query {
        applications(id: "${appRolesApplicationId}") {
          records {
            id
            applicationRoles(ownedOnly: false) {
              id
              name
              permissions
            }
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toEqual(1);
      expect(result.applications.records[0].id).toEqual(appRolesApplicationId);
      expect(result.applications.records[0].applicationRoles).toEqual(
        application.appRoles.applicationRoles
      );
    });

    it('retrieve an application with headerbar using Hub token', async () => {
      const query = `
      query {
        applications(id: "${headerbarApplicationId}") {
          records {
            id
            applicationHeaderbar {
              name
              config {
                backgroundColor
                help
                notification
                logoSrc
              }
            }
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toEqual(1);
      expect(result.applications.records[0].id).toEqual(headerbarApplicationId);
      expect(result.applications.records[0].applicationHeaderbar).toEqual(
        application.headerbar.applicationHeaderbar
      );
    });

    it('retrieve an application with config definitions using Hub token', async () => {
      const query = `
      query {
        applications(id: "${appConfigApplicationId}") {
          records {
            id
            applicationConfigDefinition {
              count
              records {
                applicationId
                configKey
                configType
                configLevel
                required
                secured
                description
              }
            }
          }
        }
      }`;

      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.applications.records.length).toEqual(1);
      expect(result.applications.records[0].id).toEqual(appConfigApplicationId);
      expect(
        result.applications.records[0].applicationConfigDefinition
      ).toBeDefined();
      expect(
        result.applications.records[0].applicationConfigDefinition.records
          .length
      ).toEqual(2);
      expect(
        result.applications.records[0].applicationConfigDefinition.records
      ).toEqual(
        expect.arrayContaining(
          application.appConfig.applicationConfigDefinitions
        )
      );
    });

    /*
      Clean Up
    */

    it('delete applications that were created using Hub token', async () => {
      const query = `
      mutation {
        ${
          simpleApplicationId
            ? `simple: deleteApplication(id: "${simpleApplicationId}") {
          id
          message
        }`
            : ''
        }
        ${
          cmeApplicationId
            ? `cme: deleteApplication(id: "${cmeApplicationId}") {
          id
          message
        }`
            : ''
        }
        ${
          appRolesApplicationId
            ? `appRoles: deleteApplication(id: "${appRolesApplicationId}") {
          id
          message
        }`
            : ''
        }
        ${
          headerbarApplicationId
            ? `headerbar: deleteApplication(id: "${headerbarApplicationId}") {
          id
          message
        }`
            : ''
        }
        ${
          appConfigApplicationId
            ? `appConfig: deleteApplication(id: "${appConfigApplicationId}") {
          id
          message
        }`
            : ''
        }
      }`;

      const result = await gqlClient.query(query);
      if (simpleApplicationId)
        expect(_.get(result, 'simple.id')).toEqual(simpleApplicationId);
      if (cmeApplicationId)
        expect(_.get(result, 'cme.id')).toEqual(cmeApplicationId);
      if (appRolesApplicationId)
        expect(_.get(result, 'appRoles.id')).toEqual(appRolesApplicationId);
      if (headerbarApplicationId)
        expect(_.get(result, 'headerbar.id')).toEqual(headerbarApplicationId);
      if (appConfigApplicationId)
        expect(_.get(result, 'appConfig.id')).toEqual(appConfigApplicationId);
    });

    afterAll(async () => {
      try {
        // Delete user created in beforeAll
        if (hubUserId) {
          const deleteUserQuery = `mutation {
            deleteUser(id: "${hubUserId}") {
              id
            }
          }`;
          await gqlClient.query(deleteUserQuery);
        }
      } catch (error) {
        console.error('Error deleting Hub user in afterAll:', error.message);
      }

      try {
        // Mark organization as deleted
        if (hubOrgId) {
          const deleteOrgQuery = `mutation {
            updateOrganization(input: {
              id: "${hubOrgId}"
              status: "deleted"
            }) {
              id
              status
            }
          }`;
          await gqlClient.query(deleteOrgQuery);
        }
      } catch (error) {
        console.error('Error deleting Hub organization in afterAll:', error.message);
      }
    });
  }
);

async function getOrganization(name, ignoreExpect) {
  const getOrgQuery = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: contains
        ) {
          records {
            id
            guid
            name
            jsondata
            users {
              records {
                name
                id
                organizationGuid
                organizationId
                organizationGuids
                authGroups {
                  records {
                    id
                    name
                    description
                  }
                }
                roles{
                  id
                } 
                status
              }
            }
          }
        }
      }`;

  const resultOrg = await gqlClient.query(getOrgQuery);
  const applicationOrg = _.get(resultOrg, 'organizations.records[0]');

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg.name).toContain(name);
  }

  return applicationOrg;
}

async function setupTestOrganization(prefixName) {
  // create organization
  const name = `${prefixName}-${uuid.v4()}`;
  const queryOrg = `mutation ($kvp: JSONData!, $apps: JSONData) {
        createOrganization (input: {
          name: "${name}"
          businessUnit: "Legal"
          types: [agency, broadcaster]
          metadata: $kvp
          applications: $apps
        }) {
          id
          guid
          name
          type
          jsondata
        }
      }`;

  const variables = {
    kvp: {
      test: 'value',
      features: {
        automaticPackageCreation: 'enabled'
      }
    },
    apps: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      isDesktopAppEnabled
        ? null
        : {
            applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            applicationKey: 'admin'
          },
      {
        applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        applicationKey: 'developer'
      },
      {
        applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
        applicationKey: 'discovery'
      }
    ].filter((app) => app)
  };
  const resultOrg = await gqlClient.query(queryOrg, variables);
  expect(resultOrg.createOrganization.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg.createOrganization.id).toBeDefined();
  expect(resultOrg.createOrganization.guid).toBeDefined();

  return await getOrganization(name);
}

async function createUser(uniqueId, orgId) {
  const query = `mutation {
    createUser(input: {
    name: "${uniqueId}-admin-user-${uuid.v4()}@localhost"
      organizationId: "${orgId}"
      firstName: "Flow-User"
      lastName: "Admin"
      jsondata: {
        firstName: "Flow-User"
        lastName: "Admin"
      }
      roleIds: ${JSON.stringify(ROLES_IDS)}
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }

  `;
  const result = await gqlClient.query(query);
  return _.get(result, 'createUser.id');
}

async function getOrCreateOrganization(nameOrg) {
  let applicationOrganization = await setupTestOrganization(nameOrg);

  const automaticPackageCreation = _.get(
    applicationOrganization,
    'jsondata.features.automaticPackageCreation'
  );
  if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
    applicationOrganization = await updateOrganization(
      applicationOrganization.id
    );
  }
  return applicationOrganization;
}

async function updateOrganization(orgId) {
  const query = `mutation {
    updateOrganization(input: {
      id: "${orgId}"
      metadata: {
        features: {
          automaticPackageCreation: "enabled"
        }
      }
    }) {
      id
      guid
      name
      type
      jsondata
      users {
        records {
          name
          id
          organizationGuid
          organizationId
          organizationGuids
          authGroups {
            records {
              id
              name
              description
            }
          }
          roles{
            id
          }
          status
        }
      }
    }
  }`;

  const resultOrg = await gqlClient.query(query);
  return _.get(resultOrg, 'updateOrganization');
}

async function getOrCreateUser(applicationOrganization, uniqueId) {
  const users = _.get(applicationOrganization, 'users.records', []);
  const activeUsers = users.filter(
    (user) =>
      user.status === 'active' &&
      user.organizationGuids.length === 1 &&
      _.every(ROLES_IDS, (roleId) =>
        user.roles.some((role) => role.id === roleId)
      )
  );
  let userId;
  if (activeUsers.length === 0) {
    userId = await createUser(uniqueId, applicationOrganization.id);
  } else {
    const adminUser = _.find(activeUsers, (user) =>
      _.includes(user.name, 'admin')
    );
    userId = adminUser ? adminUser.id : users[0].id;
  }
  return userId;
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

/**
 * Because this depends on the config (whitelist, blacklist) from the server
 So we have a special check here
 * @param {*} graphqlError the errors from graphql
 */
function validateInvalidApplicationRoles(graphqlError) {
  const errs = helpers.getErrorsFromGraphqlResponse(graphqlError);
  expect(errs.length > 0).toEqual(true);
  const err = errs[0];
  expect(err).toBeDefined();
  expect(err.message).toContain(
    `the application roles are invalid. Some permissions are not allowed`
  );

  expect(err.data.applicationRoles).toBeDefined();
  expect(err.data.applicationRoles.length > 0).toEqual(true);
  const roleWhitelist = _.get(err.data, 'roles.whitelist', []);
  const roleBlacklist = _.get(err.data, 'roles.blacklist', []);
  err.data.applicationRoles.forEach((o) => {
    expect(o.invalidPermissions).toBeDefined();
    expect(_.isArray(o.invalidPermissions)).toBe(true);
    expect(o.invalidPermissions.length > 0).toEqual(true);
    if (err.data.roles) {
      o.invalidPermissions.forEach((ip) => {
        expect(
          (!_.isEmpty(roleWhitelist) && !roleWhitelist.includes(ip)) ||
            roleBlacklist.includes(ip)
        ).toEqual(true);
      });
    }
  });
}
