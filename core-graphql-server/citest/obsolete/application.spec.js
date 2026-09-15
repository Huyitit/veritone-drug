const helpers = require('../helpers');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';
const DEFAULT_APP_EVENT_ROLE_NAME = 'Default App Access';
const chakram = require('chakram');
const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

const nameOrg = `${citestMarker}-application-rbac`;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const ROLES_IDS = [
  'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
];
let superAdminOption;
let useRBACFeature = false;

describe('Application', () => {
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
    const userId = await getOrCreateUser(applicationOrganization, uniqueId);

    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;

    adminOptions = await impersonate(userId, applicationOrgGUID, result.token);
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(
      applicationOrganization,
      'jsondata.features.automaticPackageCreation'
    );
    //adminOption is the current userOption

    useRBACFeature = isFullRBACFeature(adminOptions);
  });

  function isFullRBACFeature(userOption) {
    const introspectionQuery = gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    const result = gqlClient.query(
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

    it('Create an application', async () => {
      const query = `
      mutation {
        createApplication(input: {
          name: "${basicApplication.name}",
          key: "${basicApplication.key}"
          description: "${basicApplication.description}",
          url: "${basicApplication.url}",
          oauth2RedirectUrls: "${basicApplication.oauth2RedirectUrls}",
          checkPermissions: ${basicApplication.checkPermissions},
          iconUrl: "${basicApplication.iconUrl}"
        }) {
         id name description url oauth2RedirectUrls iconUrl
        }
      }`;

      const basicAppResult = await gqlClient.query(query, null, adminOptions);
      let createdApplication = _.get(basicAppResult, 'createApplication');
      basicApplicationId = _.get(createdApplication, 'id');
      expect(basicApplicationId).toBeDefined();
      expect(createdApplication.oauth2RedirectUrls.length).toEqual(1);
      expect(_.omit(createdApplication, ['id', 'oauth2RedirectUrls'])).toEqual(
        _.omit(basicApplication, [
          'id',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );
    });
    it('Query and Check created application', async () => {
      const query = `
        query {
            application(id: "${basicApplicationId}") {
            id name description url oauth2RedirectUrls iconUrl
            }
        }`;
      const result = await gqlClient.query(query, null, adminOptions);
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
      const result = await gqlClient.query(
        query,
        { input: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(basicApplicationId);
      expect(result.updateApplication.iconUrl).toEqual(payload.iconUrl);
      expect(result.updateApplication.signedIconUrl).toEqual(payload.iconUrl);
      basicApplication.name = payload.name;
    });
    it('Query and Check created application after update', async () => {
      const query = `
        query {
            application(id: "${basicApplicationId}") {
            id name description url oauth2RedirectUrls iconUrl
            }
        }`;
      const result = await gqlClient.query(query, null, adminOptions);
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
        console.log(action);
        const query = `
          mutation {
            applicationWorkflow(input: {
              id: "${basicApplicationId}"
              action: ${action[0]}
            })  {
              id
              status
              }
            }
          `;
        const result = await gqlClient.query(query, null, adminOptions);
        expect(result.applicationWorkflow.id).toEqual(basicApplicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });
    it('Delete application', async () => {
      const query = `
      mutation {deleteApplication(id: "${basicApplicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        console.log(result);
        expect(_.get(result, 'deleteApplication.id')).toEqual(
          basicApplicationId
        );
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
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
      const query = `
      mutation {
        createApplication(input: {
          name: "${rejectApplication.name}",
          description: "${rejectApplication.description}",
          url: "${rejectApplication.url}",
          oauth2RedirectUrls: "${rejectApplication.oauth2RedirectUrls}",
          checkPermissions: ${rejectApplication.checkPermissions},
          iconUrl: "${rejectApplication.iconUrl}"
        }) {
         id name description url oauth2RedirectUrls iconUrl
        }
      }`;

      const basicAppResult = await gqlClient.query(query, null, adminOptions);
      let createdApplication = _.get(basicAppResult, 'createApplication');
      rejectApplicationId = _.get(createdApplication, 'id');
      expect(rejectApplicationId).toBeDefined();
      expect(createdApplication.oauth2RedirectUrls.length).toEqual(1);
      expect(_.omit(createdApplication, ['id', 'oauth2RedirectUrls'])).toEqual(
        _.omit(rejectApplication, [
          'id',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );
    });
    it('Query and Check created application', async () => {
      const query = `
        query {
            application(id: "${rejectApplicationId}") {
            id name description url oauth2RedirectUrls iconUrl
            }
        }`;
      const result = await gqlClient.query(query, null, adminOptions);
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
      const result = await gqlClient.query(
        query,
        { input: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(rejectApplicationId);
      expect(result.updateApplication.iconUrl).toEqual(payload.iconUrl);
      expect(result.updateApplication.signedIconUrl).toEqual(payload.iconUrl);
      rejectApplication.name = payload.name;
    });
    it('Query and Check created application after update', async () => {
      const query = `
        query {
            application(id: "${rejectApplicationId}") {
            id name description url oauth2RedirectUrls iconUrl
            }
        }`;
      const result = await gqlClient.query(query, null, adminOptions);
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
        console.log(action);
        const query = `
          mutation {
            applicationWorkflow(input: {
              id: "${rejectApplicationId}"
              action: ${action[0]}
            })  {
              id
              status
              }
            }
          `;
        const result = await gqlClient.query(query, null, adminOptions);
        expect(result.applicationWorkflow.id).toEqual(rejectApplicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });
    it('Delete application', async () => {
      const query = `
      mutation {deleteApplication(id: "${rejectApplicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        console.log(result);
        expect(_.get(result, 'deleteApplication.id')).toEqual(
          rejectApplicationId
        );
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  }); //Testing

  describe('Application Lifecycle Approved with resources added at create', () => {
    let applicationReturnField = `id name description url oauth2RedirectUrls iconUrl
         applicationHeaderbar {
            name
            config {
              backgroundColor
              help
              notification
              logoSrc
            }
          }
        contextMenuExtensions {
          mentions{ id }
          tdos{ id }
          watchlists{ id }
          collections{ id }
        }
        applicationConfigDefinition {
            count
            records {
              applicationId
            }
          }
        }`;
    let contextMenuExtensionPayload;
    it('Prepare application context menu extension', async () => {
      const mentionId = '${mentionId}';
      const tdoId = '${tdoId}';
      const watchlistId = '${watchlistId}';
      const collectionId = '${collectionId}';
      contextMenuExtensionPayload = `{
        mentions: [
          {
            id: "${uuid.v4()}", 
            label: "${citestMarker} citest mention", 
            url: "http://www.example.com/${mentionId}", 
            type: mention
          }], 
        tdos: [
          {
            id: "${uuid.v4()}", 
            label: "${citestMarker} citest tdos", 
            url: "http://www.example.com/${tdoId}", 
            type: tdo
          }], 
        watchlists: [
          {
            id: "${uuid.v4()}", 
            label: "${citestMarker} citest watchlists", 
            url: "http://www.example.com/${watchlistId}", 
            type: watchlist
          }
        ], 
        collections: [
          {
            id: "${uuid.v4()}", 
            label: "${citestMarker} citest collections", 
            url: "http://www.example.com/${collectionId}", 
            type: collection
          }
        ]
      }`;
    });
    let applicationConfigDefinitionPayload;
    it('Prepare application config definition', async () => {
      applicationConfigDefinitionPayload = `[
        {
          configKey: "${citestMarker} Hub Test ApplicationConfigDefinition - ${uuid.v4()}-org-key",
          configType: String,
          configLevel: Organization,
          required: false,
          secured: false,
          description: "Tests org-level config definition for Hub."
        },
        {
          configKey: "${citestMarker} Hub Test ApplicationConfigDefinition - ${uuid.v4()}-org-key",
          configType: String,
          configLevel: User,
          required: false,
          secured: false,
          description: "Tests user-level config definition for Hub."
        }
      ]`;
    });
    let headerBarPayload;
    it('Prepare application header bar data', async () => {
      headerBarPayload = `
        {
          name: "${citestMarker}-headerbar data",
          config: {
            help: true,
            backgroundColor: "#0000FF",
            notification: false,
            logoSrc: "www.example.com"
          }
        }
      `;
    });
    let applicationId;
    it('Create an application with multiple resources', async () => {
      const query = `
      mutation {
        createApplication(
        input: {
          name: "${citestMarker} all resources application - ${uniqueId} id", 
          description: "${citestMarker} all resources application - ${uniqueId} id", 
          url: "www.example.com", 
          oauth2RedirectUrls: "www.example.com/callback", 
          checkPermissions: true, 
          iconUrl: "http://abc.com/link-icon.png", 
          contextMenuExtensions: ${contextMenuExtensionPayload},
          headerbarEnabled: true,
          headerbar: ${headerBarPayload},
          applicationConfigDefinition: ${applicationConfigDefinitionPayload}
        }
      ) {
        ${applicationReturnField}
      }
    `;
      const result = await gqlClient.query(query, null, adminOptions);
      let applicationResult = _.get(result, 'createApplication');
      applicationId = applicationResult.id;
      expect(applicationId).toBeDefined();
      expect(applicationResult.contextMenuExtensions).toBeDefined();
      expect(
        applicationResult.applicationConfigDefinition.count
      ).toBeGreaterThan(0);
      expect(applicationResult.applicationHeaderbar).toBeDefined();
    });
    it('Query', async () => {
      const query = `
        query {
            application(id: "${applicationId}") {
            id name description url oauth2RedirectUrls iconUrl
            }
        }`;
      const result = await gqlClient.query(query, null, adminOptions);
      expect(result.application.id).toBeDefined();
    });
    it('Workflow application through cycle submit -> approve -> deploy', async () => {
      const actionAndStatusList = [
        ['submit', 'pending'],
        ['approve', 'approved'],
        ['deploy', 'active'],
        ['disable', 'disabled']
      ];
      for (let action of actionAndStatusList) {
        const query = `
          mutation {
            applicationWorkflow(input: {
              id: "${applicationId}"
              action: ${action[0]}
            })  {
              id
              status
              }
            }
          `;
        const result = await gqlClient.query(query, null, adminOptions);
        expect(result.applicationWorkflow.id).toEqual(applicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });
    //Delete application
    it('Delete application', async () => {
      const query = `
      mutation {deleteApplication(id: "${applicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        expect(_.get(result, 'deleteApplication.id')).toEqual(applicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  }); //Testing

  describe('Application Lifecycle Approved with resources added each update', () => {
    let applicationData = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };
    let applicationId;
    it('Create a basic application', async () => {
      const query = `
      mutation {
        createApplication(input: {
          name: "${applicationData.name}",
          key: "${applicationData.key}"
          description: "${applicationData.description}",
          url: "${applicationData.url}",
          oauth2RedirectUrls: "${applicationData.oauth2RedirectUrls}",
          checkPermissions: ${applicationData.checkPermissions},
          iconUrl: "${applicationData.iconUrl}"
        }) {
         id name description url oauth2RedirectUrls iconUrl
        }
      }`;

      const basicAppResult = await gqlClient.query(query, null, adminOptions);
      let createdApplication = _.get(basicAppResult, 'createApplication');
      applicationId = _.get(createdApplication, 'id');
      expect(applicationId).toBeDefined();
      expect(createdApplication.oauth2RedirectUrls.length).toEqual(1);
      expect(_.omit(createdApplication, ['id', 'oauth2RedirectUrls'])).toEqual(
        _.omit(applicationData, [
          'id',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );
    });
    let contextMenuExtensionId;
    it('Prepare context menu extension data', async () => {
      let contextMenuExtensionPayload = {
        mentions: [
          {
            id: uuid.v4(),
            label: `${citestMarker} Foo Mention`,
            url: 'http://www.example.com/${mentionId}',
            type: 'mention'
          }
        ],
        tdos: [
          {
            id: uuid.v4(),
            label: `${citestMarker} Foo TDO`,
            url: 'http://www.example.com/${tdoId}',
            type: 'tdo'
          }
        ],
        watchlists: [
          {
            id: uuid.v4(),
            label: `${citestMarker} Foo Watchlist`,
            url: 'http://www.example.com/${watchlistId}',
            type: 'watchlist'
          }
        ],
        collections: [
          {
            id: uuid.v4(),
            label: `${citestMarker} Foo Collection`,
            url: 'http://www.example.com/${collectionId}',
            type: 'collection'
          }
        ]
      };
      const query = `
        mutation CreateContextMenuExtension($input: CreateContextMenuExtension!) {
          newCme: createContextMenuExtension(input: $input) {
            id label url type
          }
        }
      `;
      const result = await gqlClient.query(
        query,
        {
          input: contextMenuExtensionPayload
        },
        adminOptions
      );
      expect(result.newCme).toEqual(
        expect.objectContaining(_.omit(contextMenuExtensionPayload, 'id'))
      );
      expect(result.newCme.id).toBeDefined();
      expect(result.newCme.id).not.toEqual(applicationId);

      contextMenuExtensionId = result.newCme.id;
    });
    it('Update application with context menu extension', async () => {
      const payload = {
        id: applicationId,
        name: applicationData.name,
        description: applicationData.description,
        iconUrl: applicationData.iconUrl,
        url: applicationData.url
      };
      const query = `
      mutation UpdateApplication($newCmeInput: UpdateApplication) {
          updateApplication(input: $newCmeInput) {
            id
            contextMenuExtensions {
            mentions{ id }
            tdos{ id }
            watchlists{ id }
            collections{ id }
        }
          }
        }`;
      const result = await gqlClient.query(
        query,
        { newCmeInput: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(applicationId);
    });
    let applicationConfigDefinitionPayload;
    it('Prepare application config definition data', async () => {
      applicationConfigDefinitionPayload = [
        {
          configKey: `${application.appConfig.name}-org-key`,
          configType: 'String',
          configLevel: 'Organization',
          required: false,
          secured: false,
          description: 'Tests org-level config definition'
        },
        {
          configKey: `${application.appConfig.name}-user-key`,
          configType: 'String',
          configLevel: 'User',
          required: false,
          secured: false,
          description: 'Tests user-level config definition'
        }
      ];
    });
    it('Update application with config definition', async () => {});
    let headerBarPayload;
    it('Prepare application header bar data', async () => {
      headerBarPayload = {
        name: `${application.headerbar.name}-headerbar`,
        config: {
          backgroundColor: '#0000FF',
          help: true,
          notification: false,
          logoSrc: 'www.example.com'
        }
      };
    });
    it('Update application with header bar', async () => {
      const payload = {
        id: applicationId,
        name: applicationData.name,
        description: applicationData.description,
        iconUrl: applicationData.iconUrl,
        url: applicationData.url
      };
      const query = `
      mutation UpdateApplication($newCmeInput: UpdateApplication) {
          updateApplication(input: $newCmeInput) {
            id
            contextMenuExtensions {
            mentions{ id }
            tdos{ id }
            watchlists{ id }
            collections{ id }
        }
          }
        }`;
      const result = await gqlClient.query(
        query,
        { newCmeInput: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(applicationId);
    });
    it.each(['engines', 'dataRegistries'])(
      'Add %s application component',
      async (componentType) => {
        const componentIds = {
          engines: [
            'd1bc57fe-675d-435d-9f4d-2f074485ec55',
            'ea0ada2a-7571-4aa5-9172-b5a7d989b041'
          ],
          dataRegistries: ['0b3ddb59-3252-4251-8c22-ea833984e60b']
        };
        const payload = {
          id: applicationId,
          type: componentType,
          componentIds: componentIds[componentType],
          action: 'add'
        };

        const query = `
            mutation UpdateApplicationComponent($input: UpdateApplicationComponent!) {
              updateApplicationComponent(input: $input) {
                ${componentType} {
                  records {
                    id
                  }
                }
              }
            }
          `;

        const result = await gqlClient.query(
          query,
          {
            input: payload
          },
          adminOptions
        );
        expect(
          _.map(
            _.get(result, [
              'updateApplicationComponent',
              componentType,
              'records'
            ]),
            'id'
          ).sort()
        ).toEqual(componentIds[componentType]);
      }
    );
    it('Cycle application by status pending -> approved -> active', async () => {
      const actionAndStatusList = [
        ['submit', 'pending'],
        ['approve', 'approved'],
        ['deploy', 'active'],
        ['disable', 'disabled']
      ];
      for (let action of actionAndStatusList) {
        console.log(action);
        const query = `
          mutation {
            applicationWorkflow(input: {
              id: "${applicationId}"
              action: ${action[0]}
            })  {
              id
              status
              }
            }
          `;
        const result = await gqlClient.query(query, null, adminOptions);
        expect(result.applicationWorkflow.id).toEqual(applicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });
    it('Delete application', async () => {
      const query = `
      mutation {deleteApplication(id: "${applicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        console.log(result);
        expect(_.get(result, 'deleteApplication.id')).toEqual(applicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Errors', () => {
    let baseApplication = {
      id: `${uuid.v4()}`,
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };
    it('Create base application', async () => {
      const query = `
      mutation {
        createApplication(input: {
          name: "${baseApplication.name}",
          description: "${baseApplication.description}",
          url: "${baseApplication.url}",
          oauth2RedirectUrls: "${baseApplication.oauth2RedirectUrls}",
          checkPermissions: ${baseApplication.checkPermissions},
          iconUrl: "${baseApplication.iconUrl}"
        }) {
         id name description url oauth2RedirectUrls iconUrl
        }
      }`;

      const basicAppResult = await gqlClient.query(query, null, adminOptions);
      let createdApplication = _.get(basicAppResult, 'createApplication');
      let baseApplicationId = _.get(createdApplication, 'id');
      expect(baseApplicationId).toBeDefined();
    });
    it.each(['name', 'id'])(
      'create an application with duplicate %s',
      async (field) => {
        let query;
        switch (field) {
          case field === 'name':
            query = `
              mutation {
                createApplication(input: {
                  id: "${uuid.v4()}",
                  name: "${application[0].name}",
                  description: "${application[0].description}",
                  url: "${application[0].url}",
                  oauth2RedirectUrls: "${application[0].oauth2RedirectUrls}",
                  checkPermissions: ${application[0].checkPermissions}
                }) {
                  id
                }
              }`;
            break;
          case field === 'id':
            query = `
              mutation {
                createApplication(input: {
                  id: "${application[0].id}",
                  name: "${application[0].name} + ${uuid.v4()}",
                  description: "${application[0].description}",
                  url: "${application[0].url}",
                  oauth2RedirectUrls: "${application[0].oauth2RedirectUrls}",
                  checkPermissions: ${application[0].checkPermissions}
                }) {
                  id
                }
              }`;
        }

        try {
          await gqlClient.query(query, null, adminOptions);
        } catch (ex) {
          expect(ex.message).toContain(
            'Application with this key already exists'
          );
        }
      }
    );
  });
  //Negative cases
  //Application work flow, wrong status updates
  //Create: duplicate key in several places
  //Update: duplicate key?
  describe('Application Roles', () => {
    const appRoles6 = [
      {
        id: uuid.v4(),
        name: `ci-test-app-role-${uuid.v4()}`,
        description: 'ci-test-app-role',
        isPrivate: false,
        isAppEventRole: false,
        permissions: ['SUPERADMIN', 'ADMIN_ORG_CREATE', 'CMS_ACCESS']
      }
    ];
    const appRoles7 = [
      {
        id: uuid.v4(),
        name: `ci-test-app-role-${uuid.v4()}`,
        description: 'ci-test-app-role',
        isPrivate: false,
        isAppEventRole: false,
        permissions: ['CMS_ACCESS']
      }
    ];

    let newRoleId, existingRoleId;
    let applicationForRole;
    let roleApplicationId;

    it('create an application for Roles', async () => {
      applicationForRole = {
        name: `${citestMarker} Citest App 11 - ${uniqueId}`,
        key: `${citestMarker} citest_app_11_${uniqueId}`,
        description: `${citestMarker} Citest App 11 - ${uniqueId}`,
        url: 'www.example.com',
        checkPermissions: false,
        status: 'active'
      };
      const query = `
      mutation {
            createApplication(input: {
            name: "${applicationForRole.name}",
            description: "${applicationForRole.description}",
            url: "${applicationForRole.url}",
            oauth2RedirectUrls: "${applicationForRole.oauth2RedirectUrls}",
            checkPermissions: ${applicationForRole.checkPermissions}
            status: ${applicationForRole.status}
          }) {
            id name key status url
            }
          }`;
      const roleAppResult = await gqlClient.query(query, null, adminOptions);
      let app1 = _.get(roleAppResult, 'createApplication');
      roleApplicationId = _.get(app1, 'id');
      expect(roleApplicationId).toBeDefined();
    });

    it('active app with existing/new roles: only role upserts and skip role deletions', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated',
        applicationRoles: [
          {
            id: uuid.v4(),
            name: `${citestMarker}-app-role-${uuid.v4()}`,
            description: 'new role',
            isPrivate: false,
            isAppEventRole: false,
            permissions: ['CMS_ACCESS']
          },
          {
            id: uuid.v4(),
            name: `${citestMarker}-app-role-${uuid.v4()}`,
            description: 'existing role',
            isPrivate: false,
            isAppEventRole: false,
            permissions: ['CMS_ACCESS']
          }
        ]
      };

      const query = `
          mutation UpdateApplication($input: UpdateApplication) {
            updateApplication(input: $input) {
              id
              name
              description
              status
              iconUrl
              signedIconUrl
              applicationRoles(ownedOnly: false) {
                id
                name
                description
                permissions
                isPrivate
                isApplicationEventRole
              }
            }
          }
        `;
      const result = await gqlClient.query(
        query,
        { input: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(
        _.get(result, 'updateApplication.applicationRoles[0].isPrivate')
      ).toEqual(false);
      expect(
        _.get(
          result,
          'updateApplication.applicationRoles[0].isApplicationEventRole'
        )
      ).toEqual(false);
      newRoleId = result.updateApplication.applicationRoles[0].id;
      existingRoleId = result.updateApplication.applicationRoles[1].id;
    });

    it('should verify new application roles are included in organization roles', async () => {
      const getOrgRolesQuery = ` query fetchOrgAppsAndRoles{
        organization(id: "${applicationOrgId}"){
          roles(isAppEventRole: false) {
            id
            name
            appName
            description
          }
        }
      }`;
      const resultOrg = await gqlClient.query(
        getOrgRolesQuery,
        null,
        adminOptions
      );
      const roles = resultOrg.organization.roles;
      expect(roles.find((item) => item.id === newRoleId)).toBeDefined();
    });

    it('active app with empty roles: skip role upserts and skip role deletions.', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated_1',
        applicationRoles: []
      };

      const query = `
          mutation UpdateApplication($input: UpdateApplication) {
            updateApplication(input: $input) {
              id
              name
              description
              iconUrl
              signedIconUrl
              applicationRoles(ownedOnly: false) {
                id
                name
                description
                permissions
                isPrivate
                isApplicationEventRole
              }
            }
          }
        `;
      const result = await gqlClient.query(
        query,
        { input: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(result.updateApplication.description).toEqual(
        applicationForRole.description + '_updated_1'
      );
      const appRoles = _.get(result, 'updateApplication.applicationRoles');
      expect(appRoles).toBeDefined();
      const filteredAppRoles = _.filter(
        appRoles,
        (r) => r.id === newRoleId || r.id === existingRoleId
      );
      expect(filteredAppRoles.length).toEqual(2);
    });

    it('disable an application', async () => {
      const query = `mutation {
        applicationWorkflow(input: {
          id: "${roleApplicationId}"
          action: disable
        })  {
          id
          description
          url
          deploymentModel
          status
        }
      }
      `;
      const result = await gqlClient.query(query);
      expect(result.applicationWorkflow.id).toEqual(roleApplicationId);
      expect(result.applicationWorkflow.status).toEqual('disabled');
    });

    it('non-active app with existing/new roles: implement role upserts and delete any roles not included in input', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated_2',
        applicationRoles: [
          {
            id: existingRoleId,
            description: 'existing role updated'
          }
        ]
      };

      const query = `
          mutation UpdateApplication($input: UpdateApplication) {
            updateApplication(input: $input) {
              id
              name
              description
              iconUrl
              signedIconUrl
              applicationRoles(ownedOnly: false) {
                id
                name
                description
                permissions
                isPrivate
                isApplicationEventRole
              }
            }
          }
        `;
      const result = await gqlClient.query(
        query,
        { input: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(result.updateApplication.description).toEqual(
        applicationForRole.description + '_updated_2'
      );
      const appRoles = _.get(result, 'updateApplication.applicationRoles');
      expect(appRoles).toBeDefined();
      const newRole = _.find(appRoles, { id: newRoleId });
      expect(newRole).toBeUndefined();
      const existingRole = _.find(appRoles, { id: existingRoleId });
      expect(existingRole).toBeDefined();
      expect(existingRole.description).toEqual('existing role updated');
    });

    it('non-active app with empty roles: delete all roles of the application ', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated_3',
        applicationRoles: []
      };

      const query = `
          mutation UpdateApplication($input: UpdateApplication) {
            updateApplication(input: $input) {
              id
              name
              description
              iconUrl
              signedIconUrl
              applicationRoles(ownedOnly: false) {
                id
                name
                description
                permissions
                isPrivate
                isApplicationEventRole
              }
            }
          }
        `;
      const result = await gqlClient.query(
        query,
        { input: payload },
        adminOptions
      );
      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(result.updateApplication.description).toEqual(
        applicationForRole.description + '_updated_3'
      );
      const appRoles = _.get(result, 'updateApplication.applicationRoles');
      expect(appRoles).toBeDefined();
      const filteredAppRoles = _.filter(
        appRoles,
        (r) => r.id === newRoleId || r.id === existingRoleId
      );
      expect(filteredAppRoles.length).toEqual(0);
    });

    let applicationRoles7Id;
    it('create application should not throw an error if permissions in application roles are valid', async () => {
      const app = {
        id: uuid.v4(),
        name: `${citestMarker} App 7 - permissions is valid - ${uniqueId}`,
        key: `${citestMarker.replace(/-/g, '_')}_app-7_${uniqueId}`,
        description: `${citestMarker} App 7 - ${uniqueId}`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active',
        applicationRoles: appRoles7
      };

      const query = `
          mutation createApplication($appRoles: [CreateApplicationRole!]) {
            createApplication(input: {
              id: "${app.id}",
              name: "${app.name}",
              description: "${app.description}",
              url: "${app.url}",
              checkPermissions: ${app.checkPermissions},
              applicationRoles: $appRoles
            }) {
              ${appReturnFields.join(' ')},
              applicationRoles(ownedOnly: false) {
                id
                name
                permissions
              }
            }
          }`;
      const vars = {
        appRoles: app.applicationRoles
      };
      try {
        const result = await gqlClient.query(query, vars, adminOptions);
        expect(result).toBeDefined();
        expect(result.createApplication).toBeDefined();
        expect(result.createApplication.id).toEqual(app.id);
        expect(result.createApplication.name).toEqual(app.name);
        expect(result.createApplication.applicationRoles).toBeDefined();
        expect(result.createApplication.applicationRoles.length).toEqual(1);
        expect(
          result.createApplication.applicationRoles[0].permissions
        ).toBeDefined();
        expect(
          result.createApplication.applicationRoles[0].permissions.length
        ).toEqual(1);
        expect(
          result.createApplication.applicationRoles[0].permissions[0]
        ).toEqual(`CMS_ACCESS`);
        applicationId7 = app.id;
        roleId = result.createApplication.applicationRoles[0].id;
        applicationRoles7Id = result.createApplication.id;
      } catch (ex) {
        validateInvalidApplicationRoles(ex);
      }
    });

    it('should verify created applicationRoles is included in organization roles', async () => {
      const getOrgRolesQuery = ` query fetchOrgAppsAndRoles{
      organization(id: "${applicationOrgId}"){
        roles(isAppEventRole: false) {
          id
          name
          appName
          description
        }
      }
    }`;
      const resultOrg = await gqlClient.query(
        getOrgRolesQuery,
        null,
        adminOptions
      );
      const roles = resultOrg.organization.roles;
      expect(roles.find((item) => item.id === roleId)).toBeDefined();
    });

    itif(
      global.enableAppEventFeature,
      'get application field needed for updating application',
      async () => {
        const query = `
      query ($appId:ID!) {
        application(id: $appId) {
          id
          name
          description
          iconUrl
          url
          deploymentModel
          eventEndpoint
          ownerOrganizationId
        }
      }
    `;

        const result = await gqlClient.query(
          query,
          { appId: eventApplicationId },
          adminOptions
        );
        let app = _.get(result, 'application');
        expect(app.id).toEqual(eventApplicationId);
        expect(app.name).toEqual(application[2].name);
        expect(app.description).toEqual(application[2].description);
        expect(app.url).toEqual(application[2].url);
        application[2].iconUrl = app.iconUrl;
        application[2].deploymentModel = app.deploymentModel;
        application[2].ownerOrganizationId = app.ownerOrganizationId;
      }
    );

    it('cleanup applicationRole application', async () => {
      const query = `
      mutation {
          appBase : deleteApplication(id: "${roleApplicationId}") {
          id
          message
        }
          appEvent: deleteApplication(id: "${applicationRoles7Id}") {
              id
              message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        expect(_.get(result, 'appBase.id')).toEqual(roleApplicationId);
        expect(_.get(result, 'appEvent.id')).toEqual(applicationRoles7Id);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Context Menu Extension', () => {
    let cmeApplicationId;
    let contextMenuExtensionId;
    it('create application for context menu extension', async () => {
      let cmeApplication = {
        name: `${citestMarker} Citest App 2 - ${uniqueId}`,
        key: `${citestMarker} citest_app_2_${uniqueId}`,
        description: '${citestMarker} Citest App 2',
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false
      };

      const query = `
      mutation {
          createApplication(input: {
            name: "${cmeApplication.name}",
            description: "${cmeApplication.description}",
            url: "${cmeApplication.url}",
            oauth2RedirectUrls: "${cmeApplication.oauth2RedirectUrls}",
            checkPermissions: ${cmeApplication.checkPermissions}
          }) {
            ${appReturnFields.join(' ')}
          }
        }`;

      const cmeApplicationresult = await gqlClient.query(
        query,
        null,
        adminOptions
      );
      let app1 = _.get(cmeApplicationresult, 'createApplication');
      cmeApplicationId = _.get(app1, 'id');
      expect(cmeApplicationId).toBeDefined();
      expect(app1.oauth2RedirectUrls.length).toEqual(1);
      expect(_.omit(app1, ['id', 'key', 'oauth2RedirectUrls'])).toEqual(
        _.omit(cmeApplication, [
          'id',
          'key',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );
    });
    it('create context menu extension', async () => {
      const payload = {
        id: cmeApplicationId,
        label: 'Foo Mention',
        url: 'http://www.example.com/${mentionId}',
        type: 'mention'
      };

      const query = `
        mutation CreateContextMenuExtension($input: CreateContextMenuExtension!) {
          cme: createContextMenuExtension(input: $input) {
            ${cmeReturnFields.join(' ')}
          }
        }
      `;

      const result = await gqlClient.query(
        query,
        {
          input: payload
        },
        adminOptions
      );

      expect(result.cme).toEqual(
        expect.objectContaining(_.omit(payload, 'id'))
      );
      expect(result.cme.id).toBeDefined();
      expect(result.cme.id).not.toEqual(cmeApplicationId);

      contextMenuExtensionId = result.cme.id;
    });
    it('delete context menu extension', async () => {
      const payload = {
        id: contextMenuExtensionId
      };

      const query = `
        mutation DeleteContextMenuExtension($input: DeleteContextMenuExtension!) {
          cme: deleteContextMenuExtension(input: $input) {
            id
          }
        }
      `;

      const result = await gqlClient.query(
        query,
        {
          input: payload
        },
        adminOptions
      );

      expect(result.cme).toEqual(expect.objectContaining(payload));
    });

    it.each(['id', 'label', 'url', 'type'])(
      'createContextMenuExtension throws if %s is missing',
      async (field) => {
        const payload = {
          id: cmeApplicationId,
          label: 'Foo Mention',
          url: 'http://www.example.com/${mentionId}',
          type: 'mention'
        };

        const query = `
        mutation CreateContextMenuExtension($input: CreateContextMenuExtension!) {
          cme: createContextMenuExtension(input: $input) {
            ${cmeReturnFields.join(' ')}
          }
        }
      `;

        await expect(async () =>
          gqlClient.query(
            query,
            {
              input: _.omit(payload, field)
            },
            adminOptions
          )
        ).rejects.toThrow(field);
      }
    );

    it('cleanup application context menu application', async () => {
      const query = `
      mutation {
          deleteApplication(id: "${cmeApplicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        expect(_.get(result, 'deleteApplication.id')).toEqual(cmeApplicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Components', () => {
    let acApplicationId;
    const applicationComponentTypes = ['engines', 'dataRegistries'];

    it('create application for application components', async () => {
      let acApplication = {
        name: `${citestMarker} Citest App 3 - ${uniqueId}`,
        key: `${citestMarker} citest_app_3_${uniqueId}`,
        description: '${citestMarker} Citest App 3',
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false
      };

      const query = `
      mutation {
          createApplication(input: {
            name: "${acApplication.name}",
            description: "${acApplication.description}",
            url: "${acApplication.url}",
            oauth2RedirectUrls: "${acApplication.oauth2RedirectUrls}",
            checkPermissions: ${acApplication.checkPermissions}
          }) {
            ${appReturnFields.join(' ')}
          }
        }`;

      const acApplicationresult = await gqlClient.query(
        query,
        null,
        adminOptions
      );
      let app1 = _.get(acApplicationresult, 'createApplication');
      acApplicationId = _.get(app1, 'id');
      expect(acApplicationId).toBeDefined();
      expect(app1.oauth2RedirectUrls.length).toEqual(1);
      expect(_.omit(app1, ['id', 'key', 'oauth2RedirectUrls'])).toEqual(
        _.omit(acApplication, [
          'id',
          'key',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );
    });

    it.each(['engines', 'dataRegistries'])(
      'add %s application component',
      async (componentType) => {
        const componentIds = {
          engines: [
            'd1bc57fe-675d-435d-9f4d-2f074485ec55',
            'ea0ada2a-7571-4aa5-9172-b5a7d989b041'
          ],
          dataRegistries: ['0b3ddb59-3252-4251-8c22-ea833984e60b']
        };
        const payload = {
          id: acApplicationId,
          type: componentType,
          componentIds: componentIds[componentType],
          action: 'add'
        };

        const query = `
            mutation UpdateApplicationComponent($input: UpdateApplicationComponent!) {
              updateApplicationComponent(input: $input) {
                ${componentType} {
                  records {
                    id
                  }
                }
              }
            }
          `;

        const result = await gqlClient.query(
          query,
          {
            input: payload
          },
          adminOptions
        );
        expect(
          _.map(
            _.get(result, [
              'updateApplicationComponent',
              componentType,
              'records'
            ]),
            'id'
          ).sort()
        ).toEqual(componentIds[componentType]);
      }
    );

    it('retrieve application components', async () => {
      const query = `
      query {
        application(id: "${acApplicationId}") {
          ${appReturnFields.join(' ')}
          components {
            engines {
              records {
                id
              }
            }
            dataRegistries {
              records {
                id
              }
            }
            contextMenuExtensions {
              ${cmeReturnFields.join(' ')}
            }
          }
        }
      }`;

      const result = await gqlClient.query(query, null, adminOptions);

      const data = _.get(result, 'application.components');
      expect(_.get(data, 'engines.records.length')).toBeGreaterThan(0);
      expect(_.get(data, 'dataRegistries.records.length')).toBeGreaterThan(0);
    });

    it.each(applicationComponentTypes)(
      'remove app component %s',
      async (componentType) => {
        const payload = {
          id: acApplicationId,
          type: componentType,
          componentIds: componentIds[componentType],
          action: 'remove'
        };

        const query = `
              mutation UpdateApplicationComponent($input: UpdateApplicationComponent!) {
                updateApplicationComponent(input: $input) {
                  ${componentType} {
                    records {
                      id
                    }
                  }
                }
              }
            `;

        const result = await gqlClient.query(
          query,
          {
            input: payload
          },
          adminOptions
        );
        const data = _.get(result, 'updateApplicationComponent');
        const recordIds = _.map(_.get(data, [componentType, 'records']), 'id');
        expect(recordIds).toEqual(
          expect.not.arrayContaining(componentIds[componentType])
        );
      }
    );

    it('cleanup application component application', async () => {
      const query = `
      mutation {
          deleteApplication(id: "${acApplicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        expect(_.get(result, 'deleteApplication.id')).toEqual(acApplicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Package', () => {
    let apApplicationId;

    it('create application for application package', async () => {
      let apApplication = {
        name: `${citestMarker} Citest App 5 - ${uniqueId}`,
        key: `${citestMarker} citest_app_5_${uniqueId}`,
        description: '${citestMarker} Citest App 5',
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false
      };

      const query = `
      mutation {
          createApplication(input: {
            name: "${apApplication.name}",
            description: "${apApplication.description}",
            url: "${apApplication.url}",
            oauth2RedirectUrls: "${apApplication.oauth2RedirectUrls}",
            checkPermissions: ${apApplication.checkPermissions}
          }) {
            ${appReturnFields.join(' ')}
          }
        }`;

      const apApplicationResult = await gqlClient.query(
        query,
        null,
        adminOptions
      );
      let app1 = _.get(apApplicationResult, 'createApplication');
      apApplicationId = _.get(app1, 'id');
      expect(apApplicationId).toBeDefined();
      expect(app1.oauth2RedirectUrls.length).toEqual(1);
      expect(_.omit(app1, ['id', 'key', 'oauth2RedirectUrls'])).toEqual(
        _.omit(apApplication, [
          'id',
          'key',
          'checkPermissions',
          'oauth2RedirectUrls'
        ])
      );
    });

    it('creates an application package when creating an application', async () => {
      const query = `
        query {
          packages(primaryResourceId: "${apApplicationId}") {
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

      const result = await gqlClient.query(query, null, adminOptions);
      expect(result.packages).toBeDefined();
      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toBeGreaterThan(0);
      expect(result.packages.records[0].id).toBeDefined();
      expect(result.packages.records[0].primaryResource).toBeDefined();
      expect(result.packages.records[0].primaryResource.resourceId).toEqual(
        apApplicationId
      );
      expect(result.packages.records[0].primaryResource.resourceType).toEqual(
        'application'
      );

      appPackageId = result.packages.records[0].id;
    });

    it('delete application package', async () => {
      const query = `mutation {
      deleteAppPackage: packageDelete(id: "${appPackageId}") {
        success
      }
    }`;
      const result = await gqlClient.query(query, null, adminOptions);
      expect(result.deleteAppPackage).toBeDefined();
      expect(result.deleteAppPackage.success).toEqual(true);
    });
    it('cleanup application package application', async () => {
      const query = `
      mutation {
          deleteApplication(id: "${apApplicationId}") {
          id
          message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        expect(_.get(result, 'deleteApplication.id')).toEqual(apApplicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
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
        const query = `
      mutation ($roleIds: [ID]) {
        getApplicationJWT(input: {
          appId: "${applicationId}"
          orgId: ${orgId}
          roleIds: $roleIds
        }) {
          applicationId
          organizationId
          token
        }
      }
    `;
        const variables = { roleIds };
        const result = await gqlClient.query(query, variables, adminOptions);
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
        const query = `
      mutation {
        updateOrganization(input: {
          id: ${orgId}
          applicationAccess: {
            applicationId: "${eventApplicationId}"
            enable: true
          }
        })
        {
          id
          name
          applications {
            records {
              id
              name
              key
            }
          }
        }
      }
    `;
        const result = await gqlClient.query(query, null, adminOptions);
        const updateOrganization = _.get(result, 'updateOrganization');
        expect(updateOrganization.id).toEqual(orgId);
        expect(updateOrganization.name).toBeDefined();
        expect(updateOrganization.applications.records.length).toBeGreaterThan(
          0
        );
      }
    );

    itif(
      global.enableAppEventFeature,
      'add an endpoint to the application',
      async () => {
        const testEventEndpoint = 'https://dev-local.aiware.run/event-endpoint';
        const query = `
      mutation {
        updateApplicationEventEndpoint(input: {
          id: "${eventApplicationId}"
          eventEndpoint: "${testEventEndpoint}"
        }) {
          id
          eventEndpoint
        }
      }
    `;
        const result = await gqlClient.query(query, null, adminOptions);
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
        const query = `
      query Application($appId:ID!) {
        application(id: $appId) {
          id
          eventEndpoint
        }
      }
    `;
        const result = await gqlClient.query(
          query,
          { appId: eventApplicationId },
          adminOptions
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
        const query = `
      mutation DeleteAppEndpoint($appId:ID!) {
        removeApplicationEventEndpoint(id: $appId) {
          id
          message
        }
      }
    `;
        const result = await gqlClient.query(
          query,
          { appId: eventApplicationId },
          adminOptions
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
          const queryApp = `
        mutation createApplication($appRoles: [CreateApplicationRole!], 
          $appConfigDefInput: [ApplicationConfigDefinitionInput]) {
          createApplication(input: {
            id: "${app.id}",
            name: "${app.name}",
            description: "${app.description}",
            url: "${app.url}",
            checkPermissions: ${app.checkPermissions},
            applicationRoles: $appRoles,
            applicationConfigDefinition: $appConfigDefInput
          }) {
            ${appReturnFields.join(' ')},
            applicationRoles(ownedOnly: false) {
              id
              name
              permissions
              isPrivate
              isApplicationEventRole
            }
          }
        }`;
          const vars = {
            appRoles: app.applicationRoles,
            appConfigDefInput: app.appConfigDefinition
          };

          const resultApp = await gqlClient.query(queryApp, vars, adminOptions);
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
          const queryAddToOrg = `
        mutation {
          applicationAddToOrg(
            orgId: ${applicationOrgId}
            appId: "${applicationIdToOrg}"
            configs: {
              configKey: "${app.appConfigDefinition[0].configKey}",
              configValue: "test"
            }
          )
          {
            id
          }
        }
      `;
          const resultAddToOrg = await gqlClient.query(
            queryAddToOrg,
            {},
            adminOptions
          );
          const addApplicationToOrganization = _.get(
            resultAddToOrg,
            'applicationAddToOrg'
          );
          expect(addApplicationToOrganization.id).toEqual(applicationIdToOrg);

          // getApplicationConfig
          const queryGetAppConfig = `
        query {
          applicationConfig(
            orgId: ${applicationOrgId}
            appId: "${applicationIdToOrg}",
            configKeyRegexp: "${app.appConfigDefinition[0].configKey}"
          )
          {
            records {
              userId
              configKey
              value
            }
          }
        }
      `;
          const resultGetAppConfig = await gqlClient.query(
            queryGetAppConfig,
            {},
            adminOptions
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
          const queryAppDelete = `
        mutation {
          appToOrg: deleteApplication(id: "${applicationIdToOrg}") {
            id
            message
          }
        }`;

          const resultAppDelete = await gqlClient.query(
            queryAppDelete,
            null,
            adminOptions
          );
          expect(_.get(resultAppDelete, 'appToOrg.id')).toEqual(
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
        const queryApp = `
      mutation createApplication($appConfigDefInput: [ApplicationConfigDefinitionInput]) {
        createApplication(input: {
          id: "${app.id}",
          name: "${app.name}",
          key: "${app.key}",
          description: "${app.description}",
          url: "${app.url}",
          checkPermissions: ${app.checkPermissions},
          applicationConfigDefinition: $appConfigDefInput
        }) {
          ${appReturnFields.join(' ')},
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
            isApplicationEventRole
          }
        }
      }`;
        const vars = {
          appConfigDefInput: app.appConfigDefinition
        };

        const resultApp = await gqlClient.query(queryApp, vars, adminOptions);
        expect(resultApp).toBeDefined();
        expect(resultApp.createApplication).toBeDefined();
        expect(resultApp.createApplication.id).toEqual(app.id);
        expect(resultApp.createApplication.name).toEqual(app.name);
        // createApplication without applicationRoles
        expect(resultApp.createApplication.applicationRoles.length).toEqual(0);
        const applicationIdToOrg = app.id;

        // add app to org
        const queryAddToOrg = `
      mutation {
        applicationAddToOrg(
          orgId: ${applicationOrgId}
          appId: "${applicationIdToOrg}"
          configs: {
            configKey: "${app.appConfigDefinition[0].configKey}",
            configValue: "test"
          }
        )
        {
          id
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
            isApplicationEventRole
            organization {
              id
            }
          }
        }
      }
    `;
        const resultAddToOrg = await gqlClient.query(
          queryAddToOrg,
          {},
          adminOptions
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

        // getApplicationConfig
        const queryGetAppConfig = `
      query {
        applicationConfig(
          orgId: ${applicationOrgId}
          appId: "${applicationIdToOrg}",
          configKeyRegexp: "${app.appConfigDefinition[0].configKey}"
        )
        {
          records {
            userId
            configKey
            value
          }
        }
      }
    `;
        const resultGetAppConfig = await gqlClient.query(
          queryGetAppConfig,
          {},
          adminOptions
        );
        const userIdInAppConfig = _.get(
          resultGetAppConfig,
          'applicationConfig.records[0].userId'
        );
        // userId field of a config at org level must be null.
        expect(userIdInAppConfig).toEqual(null);

        // delete test application
        const queryAppDelete = `
      mutation {
        deleteApplication(id: "${applicationIdToOrg}") {
          id
          message
        }
      }`;

        const resultAppDelete = await gqlClient.query(
          queryAppDelete,
          null,
          adminOptions
        );
        expect(_.get(resultAppDelete, 'deleteApplication.id')).toEqual(
          applicationIdToOrg
        );
      }
    );
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

    beforeAll(async () => {
      const result = await gqlClient.connect();
      expect(result.apiToken).toBeDefined();
      expect(result.token).toBeDefined();

      const applicationOrganization = await getOrCreateOrganization(nameOrg);
      const userId = await getOrCreateUser(applicationOrganization, uniqueId);
      const applicationOrgGUID = applicationOrganization.guid;

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
  const queryOrg = `mutation ($kvp: JSONData!, $apps: JSONData) {
        createOrganization (input: {
          name: "${prefixName}-${uuid.v4()}"
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

  return await getOrganization(prefixName);
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
  let applicationOrganization = await getOrganization(nameOrg, true);

  if (!applicationOrganization) {
    applicationOrganization = await setupTestOrganization(nameOrg);
  }

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
