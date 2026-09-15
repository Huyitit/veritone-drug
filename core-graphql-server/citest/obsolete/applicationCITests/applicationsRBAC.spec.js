/* global pending */
const helpers = require('../../helpers');
const appHelpers = require('../../helpers/application');
const rbacHelpers = require('../../helpers/rbacHelper');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';
const chakram = require('chakram');
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const nameOrg = `${citestMarker}-rbac`;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);
let superAdminOption;
let useRBACFeature = false;
let authPermissionId;
let userId;
let authGroupId;
let rootFolderId, folderId, tdoID, jwtToken;

//Core operations of base applications
describe('citest_application: Application With RBAC', () => {
  let applicationOrgId, applicationOrgGUID;
  let automaticPackageCreation;
  let adminOptions;
  const uniqueId = Date.now().valueOf();
  const serviceToken =
    'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50';
  helpers.requestOptions(serviceToken);
  const appRolesToOrganization = [
    {
      id: uuid.v4(),
      name: `${citestMarker}-app-role-${uniqueId}`,
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
  const appReturnFields = [
    'id',
    'name',
    'key',
    'description',
    'url',
    'oauth2RedirectUrls',
    'organizationId'
  ];

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
    let userOrgInfo = await getOrgInfo(adminOptions);

    await setOLPPermissions(
      userOrgInfo,
      `
    AIWARE_SCHEMA_CREATE
    DEVELOPER_ENGINE_CREATE
    DEVELOPER_ENGINE_READ
    DEVELOPER_ENGINE_UPDATE
    DEVELOPER_ENGINE_ENABLE
    DEVELOPER_ACCESS          # for headerbar app access
    DEVELOPER_ENGINE_DELETE`
    );
    //adminOption is the current userOption
    adminOptions = await impersonate(userId, applicationOrgGUID, result.token);
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

  describeif(
    global.enableRBACFeature,
    'add application to an organization - create default appRole AG and appRole PS',
    () => {
      let applicationIdToOrg;
      let roleId;
      const app = {
        name: `${citestMarker} App RBAC - ${uniqueId}`,
        description: `${citestMarker} App RBAC - ${uniqueId}`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active',
        applicationRoles: appRolesToOrganization,
        appConfigDefinition: appConfigDefinition
      };
      it('Create Application with applicationRoles and application config definition', async () => {
        try {
          // create application
          const resultApp = await appHelpers.helpCreateApp(
            { gqlClient, options: adminOptions },
            {
              name: app.name,
              description: app.description,
              url: app.url,
              checkPermissions: app.checkPermissions,
              applicationRoles: app.applicationRoles,
              applicationConfigDefinition: app.appConfigDefinition
            }
          );

          expect(resultApp).toBeDefined();
          expect(resultApp.createApplication).toBeDefined();
          expect(resultApp.createApplication.id).toBeDefined();
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
          applicationIdToOrg = resultApp.createApplication.id;
          roleId = resultApp.createApplication.applicationRoles[0].id;
        } catch (ex) {
          validateInvalidApplicationRoles(ex);
        }
      });

      it('Add application to organization', async () => {
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
          { gqlClient, options: superAdminOption },
          inputAppAddToOrg
        );

        const addApplicationToOrganization = _.get(
          resultAddToOrg,
          'applicationAddToOrg'
        );
        expect(addApplicationToOrganization.id).toEqual(applicationIdToOrg);
        await helpers.sleep(1000);
      });

      it('Check application config', async () => {
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
      });

      it('Check authGroups', async () => {
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
          superAdminOption
        );
        const resAuthGroups = _.get(resultAuthGroups, 'authGroups.records');
        expect(_.get(resAuthGroups, '[0].id')).toBeDefined();
        expect(_.get(resAuthGroups, '[0].appRole.id')).toEqual(roleId);
      });

      it('Check permissionSets', async () => {
        const resultPermissionSet = await rbacHelpers.helpGetAuthPermissions(
          { gqlClient, options: superAdminOption },
          {
            roleID: roleId,
            ownerOrganization: applicationOrgId
          }
        );

        expect(_.get(resultPermissionSet, '[0].id')).toBeDefined();
        expect(_.get(resultPermissionSet, '[0].applicationRole.id')).toEqual(
          roleId
        );
      });
      it('should create a root folder', async () => {
        const query = `mutation createRootFolders {
            createRootFolders(rootFolderType: cms) {
              id
              description
              treeObjectId
              rootFolderTypeId
              typeId
              organizationId
              ownerId
              createdDateTime
              orderIndex
              name
            }
        }`;
        const result = await gqlClient.query(query, null, adminOptions);
        rootFolderId = _.get(result, 'createRootFolders[1].id');
        expect(rootFolderId).toBeDefined();
      });
      it('should create a folder under root folder', async () => {
        const name = citestMarker + '-graphql-folders-name';
        const description = citestMarker + '-graphql-folders-description';

        const query = `mutation createFolder {
          createFolder(
            input: { 
              name: "${name}",  
              parentId:"${rootFolderId}", 
              rootFolderType: cms, 
              description:"${description}"
              }
          ) {
            id
          }
        }`;
        const result = await gqlClient.query(query, null, adminOptions);
        folderId = _.get(result, 'createFolder.id');
        expect(folderId).toBeDefined();
      });
      it('should create a TDO inside folder', async () => {
        const query = `mutation createTDO {
            createTDO(
              input: {
                stopDateTime: "2025-10-16T15:28:37.663Z"
    		        startDateTime: "2025-10-16T15:24:37.663Z"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                isPublic: false
                addToIndex: true
                parentFolderId: "${folderId}"
              }
            ) {
              id
              name
            }
          }`;
        const result = await gqlClient.query(query, null, adminOptions);
        tdoID = _.get(result, 'createTDO.id');
        expect(tdoID).toBeDefined();
      });
      it('should generate JWT token for application', async () => {
        const query = `mutation getApplicationJWT {
          getApplicationJWT(input: {
              appId: "${applicationIdToOrg}"
              orgId: "${applicationOrgId}"
              roleIds: ["6d982ee9-ff07-499f-a182-03457a6187f6"]
          }) {
            token
            applicationId
          }
        }`;
        const result = await gqlClient.query(query, null, adminOptions);
        jwtToken = _.get(result, 'getApplicationJWT.token');
        expect(jwtToken).toBeDefined();
      });
      it('should retrieve TDO with folder using user token', async () => {
        const query = `query getTDO{
          temporalDataObject(id:"${tdoID}") {
            id
            folders {
              id
            }
          }
        }`;
        const result = await gqlClient.query(query, null, adminOptions);
        const folderIds = _.get(result, 'temporalDataObject.folders').map(
          (f) => f.id
        );
        expect(folderIds).toContain(folderId);
        expect(folderIds.length).toBeGreaterThan(0);
        expect(_.get(result, 'temporalDataObject.id')).toBeDefined();
      });
      it('should retrieve TDO with folder using JWT token', async () => {
        const query = `query getTDO{
          temporalDataObject(id:"${tdoID}") {
            id
            folders {
              id
            }
          }
        }`;
        const requestOptions = helpers.requestOptions(jwtToken);
        const result = await gqlClient.query(query, null, requestOptions);
        const folderIds = _.get(result, 'temporalDataObject.folders').map(
          (f) => f.id
        );
        expect(folderIds).toContain(folderId);
        expect(folderIds.length).toBeGreaterThan(0);
        expect(_.get(result, 'temporalDataObject.id')).toBeDefined();
      });

      describe('Cleanup test resources', () => {
        it('delete application', async () => {
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
        });

        it('delete authPermission', async () => {
          if (authPermissionId) {
            const query = `mutation del {
              authPermissionSetDelete (id: "${authPermissionId}") {
                id
                message
              }
            }`;

            const deleteData = await gqlClient.query(query, {}, adminOptions);
            expect(deleteData.authPermissionSetDelete.id).toEqual(
              authPermissionId
            );
          }
        });

        it('delete authGroup', async () => {
          if (authGroupId) {
            const query = `mutation del {
              authGroupDelete (id: "${authGroupId}") {
                id
                message
              }
            }`;

            const deleteData = await gqlClient.query(query, {}, adminOptions);
            expect(deleteData.authGroupDelete.id).toEqual(authGroupId);
          }
        });
        it('delete user', async () => {
          const query = `mutation {
              deleteUser(id: "${userId}")  {
                id
              }
            }`;
          const result = await gqlClient.query(query);
          expect(result.deleteUser.id).toEqual(userId);
        });
        it('update oganization - status to deleted', async () => {
          const query = `mutation {
          updateOrganization(input: {
            id: "${applicationOrgId}"
            status: "deleted"
          }) {
            id
            status
          }
        }`;

          const result = await gqlClient.query(query);
          expect(result.updateOrganization.status).toEqual('deleted');
        });
      });
    }
  );
});

async function setOLPPermissions(orgInfo, permissions) {
  const olpObjectIds = {};

  let query = `
    mutation {
      authGroupCreate(input: {
        name: "${citestMarker}-auth-group-engine-test-${uuid.v4()}"
        description: "desc"
        ownerOrganization: "${orgInfo.orgGuid}",
        members: [{
          id: "${orgInfo.userId}",
          memberType: User
        }]
      }) {
        id
        name
      }
    }
  `;

  let result = await gqlClient.query(query, null);
  expect(result.authGroupCreate.id).toBeDefined();
  authGroupId = _.get(result, 'authGroupCreate.id');
  olpObjectIds.authGroupId = _.get(result, 'authGroupCreate.id');

  query = `mutation {
      authPermissionSetCreate(input: {
        name: "${citestMarker}-engine-test-${uuid.v4()}",
        description: "desc"
        organizationID: "${orgInfo.orgId}",
        permissions: [
          ${permissions}
        ]
      }){
        id
        permissions
      }
    }`;

  result = await gqlClient.query(query, null);
  expect(result.authPermissionSetCreate.id).toBeDefined();
  authPermissionId = _.get(result, 'authPermissionSetCreate.id');
  olpObjectIds.permissionId = _.get(result, 'authPermissionSetCreate.id');

  query = `mutation  {
    addACEsToResources(
      ids:["${orgInfo.orgId}"],
      resourceType: Organization,
      ownerOrganization: "${orgInfo.orgGuid}",
      entries: [{
        member: {id: "${olpObjectIds.authGroupId}", memberType: Group},
        permissionSetID: "${olpObjectIds.permissionId}"}
      ]) {
      records {
        id
        objectType
        permissionSet {
          id
        }
        objectType
      }
    }
  }`;

  result = await gqlClient.query(query, null);
  expect(result.addACEsToResources.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = result.addACEsToResources.records;

  return olpObjectIds;
}

async function getOrganization(name, ignoreExpect, nameMatch = 'contains') {
  const getOrgQuery = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: ${nameMatch}
          status: active
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
        automaticPackageCreation: 'enabled',
        enableRBACFeature: 'enabled'
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
  let newName = _.get(resultOrg, 'createOrganization.name');

  return await getOrganization(newName, true, 'exact');
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
          enableRBACFeature: "enabled"
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

const getOrgInfo = async (userOptions) => {
  let query = `
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
  }`;

  let result = await gqlClient.query(query, null, userOptions);

  expect(result.me).toBeDefined();
  return {
    orgGuid: _.get(result, 'me.organization.guid'),
    orgId: _.get(result, 'me.organization.id'),
    orgName: _.get(result, 'me.organization.name'),
    userId: _.get(result, 'me.id'),
    userName: _.get(result, 'me.name'),
    isOLPEnabled:
      _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
      'enabled'
  };
};

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
