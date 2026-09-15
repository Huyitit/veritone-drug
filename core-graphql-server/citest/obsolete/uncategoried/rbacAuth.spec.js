/* global pending */
const helpers = require('../../helpers/index');
const rbacHelper = require('../../helpers/rbacHelper');
const userHelper = require('../../helpers/user');
const orgHelper = require('../../helpers/organization');
const GraphqlClient = require('../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../helpers/superadminSession');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const jwt = require('jsonwebtoken');
const e = require('express');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
const util = require('../../../util.js')();

describe('citest_auth: rbacAuth', () => {
  let session;
  let superOrgGuid, superOrgId, superUserId, superToken;
  let testOrg, testUsers, adminUser, regularUser, secondRegularUser;
  let restrictUser, secondRestrictUser;
  let privateAuthGroupId;
  let adminToken, adminOptions;
  let regularToken, regularOptions;
  let restrictOptions, secondRestrictOptions;
  let useRBACFeature;
  let superAdminOptions;
  let secondRegularOptions;

  let createdSDOId, createACESforSDO, createdSchemaId;

  const impersonateUser = async (user) => {
    const url = `${config.core_admin_url}/admin/impersonate/${user.id}/${user.organizationGuid}`;
    const options = helpers.requestOptions(superToken);
    const impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    const userToken = _.get(impersonated, 'body.token');

    return {
      token: userToken,
      requestOptions: helpers.requestOptions(userToken)
    };
  };

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // T16: This suite previously threaded the SHARED superadmin session
    // (sys_graphql_citest_superadmin, from gqlClient.connect() above) through everything —
    // it created testOrg (createOrganization enrolls the caller as an admin MEMBER via
    // addAdminToOrganization), impersonated its users, and ran superadmin-scoped operations.
    // Under MAX_WORKERS=2, any concurrent spec's teardown that calls the REAL org-delete REST
    // endpoint enumerates all active members of its org and calls removeAllUserSessions(userId)
    // on each — which is GLOBAL, not org-scoped, so it deletes every one of the shared
    // superadmin's session tokens at any point during the run. Bearer validation is per-token-key
    // existence, so a killed token never recovers. (This same spec is ALSO a perpetrator: its own
    // afterAll at the bottom calls the real org-delete on testOrg — see T14/T15/T16.)
    //
    // The fix (same guardrail as T14/T15's savedSearch/instanceAuditLog): use a throwaway
    // superadmin-equivalent that is a member of no org except its own isolated one, so no other
    // spec's org-delete/user-delete/OLP-toggle can enumerate or kill its session, and its own
    // afterAll delete only ever kills that isolated identity. We then point gqlClient.userAuth at
    // the isolated session so every implicit-auth call site below (including the meGql that
    // populates superUserId/superOrgGuid/superOrgId, and setupTestOrgAndUser which creates
    // testOrg) runs AS the isolated superadmin. See helpers/superadminSession.js.
    session = await createIsolatedSuperadmin({ gqlClient });
    superToken = session.token;
    gqlClient.userAuth = session.options; // route all implicit-auth call sites through the isolated SA

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    result = await gqlClient.query(meGql);

    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');

    // testOrg = await setupTestOrganization(gqlClient);
    // T16: pass the isolated superadmin's options explicitly so createTestOrganization creates
    // testOrg AS the isolated identity (not the shared superadmin) even independent of the
    // gqlClient.userAuth reassignment above — org creation is the load-bearing site.
    const testOrgData = await orgHelper.setupTestOrgAndUser(
      { gqlClient, options: session.options, superAdminToken: superToken },
      createOrgAndUserInput
    );

    testOrg = testOrgData.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    // test users + superadmin who created the org
    expect(testUsers.length).toEqual(6);

    adminUser = _.find(testUsers, (user) => {
      return _.includes(user.name, 'admin');
    });
    regularUser = _.find(testUsers, (user) => {
      return (
        _.includes(user.name, 'regular') && !_.includes(user.name, 'restrict')
      );
    });
    secondRegularUser = _.find(testUsers, (user) => {
      return (
        _.includes(user.name, 'second-regular') &&
        !_.includes(user.name, 'restrict')
      );
    });
    restrictUser = _.find(testUsers, (user) => {
      return _.includes(user.name, 'first-restrict');
    });
    secondRestrictUser = _.find(testUsers, (user) => {
      return _.includes(user.name, 'second-restrict');
    });

    // Login for super Admin user
    let impersonated;
    impersonated = await impersonateUser({
      id: superUserId,
      organizationGuid: superOrgGuid
    });
    superAdminOptions = impersonated.requestOptions;

    // Login for Admin user
    impersonated = await impersonateUser(adminUser);
    adminToken = impersonated.token;
    adminOptions = impersonated.requestOptions;

    // Login for Regular user
    impersonated = await impersonateUser(regularUser);
    regularToken = impersonated.token;
    regularOptions = impersonated.requestOptions;

    // Login for Restrict user
    impersonated = await impersonateUser(restrictUser);
    restrictOptions = impersonated.requestOptions;

    // Login for Secondary Restrict user
    impersonated = await impersonateUser(secondRestrictUser);
    secondRestrictOptions = impersonated.requestOptions;

    // Login for Regular user
    impersonated = await impersonateUser(secondRegularUser);
    secondRegularOptions = impersonated.requestOptions;

    // Add regular user to a new group for testing
  });
  describe('Object operations', () => {
    let contentFolderTemplateId;
    describe('with Admin user', () => {
      let result, cmsRootFolderId, newFolderId, newTDOId;
      beforeAll(async () => {
        // check admin logins
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac created by admin user"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms

              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${newFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'createTDO.id');
      });
      it('should verify access to the folder and the tdo', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await gqlClient.query(
          `query folders {
            folder(
              id: "${newFolderId}"
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'folder.id')).toBeDefined();
        expect(_.get(result, 'folder.name')).toContain(
          `${citestMarker}-folder`
        );
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObject(
              id: "${newTDOId}"
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'temporalDataObject.id')).toBeDefined();
        expect(_.get(result, 'temporalDataObject.name')).toContain(
          `${citestMarker}-tdo`
        );
      });
      xit('should remove orgAllAccess ACE from admin created folder and tdo', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await gqlClient.query(
          `mutation removeACE {
            removeACEsFromResource(
              resourceType: Folder
              ids: ["${newFolderId}"]
            ) {
              records {
                id
              }
            }
          }`,
          {},
          adminOptions
        );
        // TDO
        result = await gqlClient.query(
          `mutation removeACE {
            removeACEsFromResource(
              resourceType: TDO
              ids: ["${newTDOId}"]
            ) {
              records {
                id
              }
            }
          }`,
          {},
          adminOptions
        );
      });
      xit('should create a new auth group for regular user', () => {});
      xit('should add regular user to new auth group', () => {});
      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createDataRegistry {
            createDataRegistry(
              input: {
                id: "${uuid.v4()}"
                name: "${citestMarker}-data-registry-${uuid.v4()}"
                description: "test data registry for rbac auth group and permission set operations"
                source: "citest-source"
              }
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createDataRegistry')).toBeDefined();
        expect(_.get(result, 'createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = _.get(result, 'createDataRegistry.id');
      });
      it('should create schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation createSchema {
            createSchema(
              input: {
                id: "${uuid.v4()}"
                dataRegistryId: "${testOrg.dataRegistryId}"
                majorVersion: 1
                minorVersion: 0
                status: draft
                definition: {
                  type: "object"
                  properties: {
                    name: {
                      type: "string"
                    }
                  }
                }
              }
            ) {
              id
              majorVersion
              minorVersion
              status
              definition
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createSchema')).toBeDefined();
        expect(_.get(result, 'createSchema.id')).toBeDefined();

        createdSchemaId = _.get(result, 'createSchema.id');
      });
      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.query(
          `mutation updateSchema {
            updateSchemaState(
              input: {
                id: "${createdSchemaId}"
                status: published
              }
            ) {
              id
              status
            }
          }`,
          {},
          adminOptions
        );

        expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
        expect(_.get(result, 'updateSchemaState.status')).toEqual('published');
      });
      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createSDO {
            createStructuredData(
              input: {
                schemaId: "${createdSchemaId}"
                data: {
                  name: "test SDO"
                }
              }
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          adminOptions
        );

        createdSDOId = _.get(result, 'createStructuredData.id');

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `test SDO`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });
      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getSDO {
            structuredData(
              id: "${createdSDOId}"
              schemaId: "${createdSchemaId}"
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'structuredData.id')).toBeDefined();
        expect(_.get(result, 'structuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'structuredData.data.name')).toContain(`test SDO`);
      });
    });
    describe('with Regular user', () => {
      let result, cmsRootFolderId, newFolderId, newTDOId;
      beforeAll(async () => {
        // Login as Regular user
        result = await gqlClient.query(meGql, {}, regularOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
      });
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
            }
          }`,
          {},
          regularOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac created by regular user"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms
              }
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${newFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'createTDO.id');
      });
      it('should get the folder and the tdo by id', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await gqlClient.query(
          `query folder {
            folder(
              id: "${newFolderId}"
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'folder.id')).toBeDefined();
        expect(_.get(result, 'folder.name')).toContain(
          `${citestMarker}-folder`
        );
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObject(
              id: "${newTDOId}"
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'temporalDataObject.id')).toBeDefined();
        expect(_.get(result, 'temporalDataObject.name')).toContain(
          `${citestMarker}-tdo`
        );
      });
      it('should be able to do getACLForResources on the owned objects', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO ACEs

        const getResourcesACL = await gqlClient.query(
          `query getResourcesACL {
            getACLForResources(
              resourceType: TDO
              ids: ["${newTDOId}"]
            ) {
              records {
                id
                member {
                    ... on BasicUserInfo {
                      id
                      name
                    }
                    ... on AuthGroup {
                      id
                      name
                    }
                  }
              }
            }
          }`,
          {},
          regularOptions
        );

        const resourcesACL = _.get(getResourcesACL, 'getACLForResources');
        expect(_.get(resourcesACL, 'records')).toBeDefined();
        expect(_.get(resourcesACL, 'records[0].id')).toContain(newTDOId);

        const members = _.map(resourcesACL.records, 'member');
        const findUser = _.find(members, { id: regularUser.id });
        expect(findUser).toBeDefined();
      });

      xit('should get tdo through scrolling all temporal data objects (should have only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          regularOptions
        );
        const TDOs = _.get(result, 'temporalDataObjects.records');
        expect(TDOs.length).toEqual(1);
      });
      xit('should get tdo through search (should be only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          regularOptions
        );
        const TDOs = _.get(result, 'temporalDataObjects.records');
        expect(TDOs.length).toEqual(1);
      });
      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createSDO {
            createStructuredData(
              input: {
                schemaId: "${createdSchemaId}"
                data: {
                  name: "test SDO"
                }
              }
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          regularOptions
        );

        createdSDOId = _.get(result, 'createStructuredData.id');

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `test SDO`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });
      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // Re-impersonate the regular user to ensure the token is fresh
        const impersonated = await impersonateUser(regularUser);
        regularOptions = impersonated.requestOptions;

        result = await gqlClient.query(
          `query getSDO {
            structuredData(
              id: "${createdSDOId}"
              schemaId: "${createdSchemaId}"
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'structuredData.id')).toBeDefined();
        expect(_.get(result, 'structuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'structuredData.data.name')).toContain(`test SDO`);
      });
      it('should be able to create Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolderContentTemplate{
            createFolderContentTemplate (input: {
              folderId: "${newFolderId}"
              sdoId: "${createdSDOId}"
              schemaId: "${createdSchemaId}"
            }) {
              id
              folderId
              sdoId
              sdo {
                id
                schemaId
              }
              schemaId
              data
              createdDateTime
              modifiedDateTime
            }
          }`,
          {},
          regularOptions
        );
        const folderContentTemplate = _.get(
          result,
          'createFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(createdSDOId);
        contentFolderTemplateId = folderContentTemplate.id;
      });
      it('should be able to update Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation updateFolderContentTemplate {
            updateFolderContentTemplate (input: {
              id: "${contentFolderTemplateId}"
              sdoId: "${createdSDOId}"
            }) {
              id
              sdoId
              createdDateTime
              modifiedDateTime
            }
          }`,
          {},
          regularOptions
        );
        const folderContentTemplate = _.get(
          result,
          'updateFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(createdSDOId);
      });
      it('should be able to create TDO with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation {
            createTDO(
              input: {
                status: "uploaded",
                startDateTime: 1476726655,
                stopDateTime: 1476726755,
                contentTemplates: [{sdoId: "${createdSDOId}", schemaId: "${createdSchemaId}"}]
              }
            ) {
              id
            }
          }`,
          {},
          regularOptions
        );
        const tdo = _.get(result, 'createTDO');
        expect(tdo.id).toBeDefined();
      });
      it('should get all sdos under a schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getSDOsUnderSchema {
            schema(id: "${createdSchemaId}") {
              structuredDataObjects {
                records {
                  id
                  schemaId
                }
              }
            }
          }
        `,
          {},
          regularOptions
        );
        const sdos = _.get(result, 'schema.structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBe(2);
      });
    });
    describe('with Admin user to clean up test data', () => {
      let result;
      let folderIds, TDOIds;
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get all tdos (should be 3)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'temporalDataObjects.records')).toBeDefined();
        TDOIds = _.get(result, 'temporalDataObjects.records').map(
          (tdo) => tdo.id
        );
        expect(TDOIds.length).toEqual(3);
      });
      it('should get all folders (should be 2)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
              childFolders {
                records {
                  id
                  name
                  status
                  description
                  treeObjectId

                }
              }
            }
          }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(
          result,
          'rootFolders[0].childFolders.records'
        );
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toBeGreaterThanOrEqual(2);
      });
      it('should delete all folders and tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        // Clean up TDOs
        for (var TDOId of TDOIds) {
          // delete TDO
          deletedCount++;
          result = await gqlClient.query(
            `mutation deleteTDOs {
              deleteTDO(
                id: "${TDOId}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toEqual(3);
        deletedCount = 0;
        for (var folderId of folderIds) {
          // delete Folders
          deletedCount++;
          // Get ACL for folder before remove
          const getFolderACL = await gqlClient.query(
            `query getResourcesACL {
              getACLForResources(
                resourceType: Folder
                ids: ["${folderId}"]
              ) {
                records {
                  id
                }
              }
            }`,
            {},
            adminOptions
          );
          let folderACL = _.get(getFolderACL, 'getACLForResources.records');

          for (const ace of folderACL) {
            result = await gqlClient.query(
              `mutation removeACE {
                removeACEsFromResource(
                resourceType: Folder
                ids: ["${ace.id}"]
              ) {
                records {
                  id
                }
              }
            }`,
              {},
              adminOptions
            );
          }
          result = await gqlClient.query(
            `mutation deleteFolder {
              deleteFolder(
                input: {
                  id: "${folderId}"
                  orderIndex: 0
                }
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('RBAC Auth Group and Permission Set Operations', () => {
    describe('with Admin user', () => {
      let result, error;
      let newAuthGroup, newAuthPermissionSet;
      let adminUserId, regularUserId;
      let authGroups, authPermissionSets;
      let cmsRootFolderId, newTDOId, newFolderId;
      let acl;
      let folderIds;
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'me.id');
        // Login as Regular user
        result = await gqlClient.query(meGql, {}, regularOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'me.id');

        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              nameRegex: "${testOrg.name}"
            ) {
              records {
                id
                name
                memberCount
                members(memberType: User, limit: 15, offset: 0) {
                  records {
                    member {
                      __typename
                      ... on User {
                        id
                      }
                    }
                  }
                }
              }
            }
          }`,
          {},
          adminOptions
        );
        authGroups = _.get(result, 'authGroups.records');
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        // the default groups for the organization will include superadmin who created it.
        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = _.get(g, 'members.records', []);
          expect(users.length).toEqual(g.memberCount);
          hasSuperAdminMember = _.some(
            users,
            (u) => _.get(u, 'member.id', '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        result = await gqlClient.query(
          `query permissionSet{
            authPermissionSets(
              nameRegex: "aiWARE"
              authClass: System
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        authPermissionSets = _.get(result, 'authPermissionSets.records');
        expect(authPermissionSets.length).toEqual(4);

        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should NOT delete default auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Try delete default auth groups
        result = null;
        error = null;
        try {
          result = await gqlClient.query(
            `mutation deleteAuthGroup {
              authGroupDelete(
                id: "${authGroups[0].id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'This auth group is a protected group.'
        );
      });
      it('should NOT delete default permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Try delete default auth groups
        let error;
        try {
          result = await gqlClient.query(
            `mutation deleteAuthPermissionSet {
              authPermissionSetDelete(
                id: "${authPermissionSets[0].id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'You cannot delete this permission set.'
        );
      });
      it('should NOT modify default permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const authPermissionSet = authPermissionSets[0];
        result = null;
        error = null;
        try {
          result = await gqlClient.query(
            `mutation updatePermission {
              authPermissionSetUpdate(
                input: {
                  id: "${authPermissionSet.id}"
                  name: "${authPermissionSet.name + ' - citest'}"

                }
              ) {
                id
                name
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        // expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'You cannot update this permission set.'
        );
      });
      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation authGroupCreate {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "${citestMarker}-auth-group"
            }) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroupCreate')).toBeDefined();
        expect(_.get(result, 'authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = _.get(result, 'authGroupCreate');
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
                description: "${citestMarker}-auth-permission-set"
                permissions: [AIWARE_TDO_CREATE,  AIWARE_TDO_DELETE,  AIWARE_TDO_READ,  AIWARE_TDO_SEARCH,  AIWARE_TDO_UPDATE]
              }
            ) {
              id
              name
              permissions
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac created by admin for auth group and permission set operations"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms

              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');
        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Folder
              ids: ["${newFolderId}"]
              entries: [
                {
                  member: {
                    id: "${newAuthGroup.id}"
                    memberType: Group
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should create Folder with addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac with addACEs nested mutation"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms

              }
            ) {
              id
              name
              addACEs(
                entries: [
                  {
                    member: {
                      id: "${newAuthGroup.id}"
                      memberType: Group
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectID
                  objectType
                }
                count
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');
        acl = _.get(result, 'createFolder.addACEs.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 new ACE, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });
      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createDataRegistry {
            createDataRegistry(
              input: {
                id: "${uuid.v4()}"
                name: "${citestMarker}-data-registry-${uuid.v4()}"
                description: "test data registry for rbac auth group and permission set operations"
                source: "citest-source"
              }
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createDataRegistry')).toBeDefined();
        expect(_.get(result, 'createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = _.get(result, 'createDataRegistry.id');
      });
      it('should create Schema and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation createSchema {
            createSchema(
              input: {
                id: "${uuid.v4()}"
                dataRegistryId: "${testOrg.dataRegistryId}"
                majorVersion: 1
                minorVersion: 0
                status: draft
                definition: {
                  type: "object"
                  properties: {
                    name: {
                      type: "string"
                    }
                  }
                }
              }
            ) {
              id
              majorVersion
              minorVersion
              status
              definition
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createSchema')).toBeDefined();
        expect(_.get(result, 'createSchema.id')).toBeDefined();

        createdSchemaId = _.get(result, 'createSchema.id');

        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: SDOSchema
              ids: ["${createdSchemaId}"]
              entries: [
                {
                  member: {
                    id: "${newAuthGroup.id}"
                    memberType: Group
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(createdSchemaId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });
      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.query(
          `mutation updateSchema {
            updateSchemaState(
              input: {
                id: "${createdSchemaId}"
                status: published
              }
            ) {
              id
              status
            }
          }`,
          {},
          adminOptions
        );

        expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
        expect(_.get(result, 'updateSchemaState.status')).toEqual('published');
      });
      it('should add ACEs on SDO using addACEToResources', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(createdSDOId).toBeDefined();

        let error;
        try {
          result = await gqlClient.query(
            `mutation {
              addACEsToResources(
                resourceType: SDO
                resourceTypeSchemaId: "${createdSchemaId}"
                ids: ["${createdSDOId}"]
                entries: [
                  {
                    member: {
                      id: "${newAuthGroup.id}"
                      memberType: Group
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectType
                }
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }

        createACESforSDO = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of createACESforSDO) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(createdSDOId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });
      it('should remove ACEs from an SDO using removeACEsFromResource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(createdSDOId).toBeDefined();
        expect(createACESforSDO).toBeDefined();
        const aceCount = createACESforSDO.length;
        expect(aceCount).toBeGreaterThan(0);
        const aceId = createACESforSDO[0].id;

        let error;
        try {
          result = await gqlClient.query(
            `mutation {
              removeACEsFromResource(
                resourceType: SDO
                resourceTypeSchemaId: "${createdSchemaId}"
                ids: ["${aceId}"]
              ) {
                records {
                  id
                }
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }

        const aces = _.get(result, 'removeACEsFromResource.records');
        expect(aces).toBeDefined();
        expect(aces.length).toEqual(aceCount - 1);
      });
      it('should create SDO without addACEs and add default ACEs automatically', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.query(
          `mutation createSDO {
            createStructuredData(
              input: {
                schemaId: "${createdSchemaId}"
                data: {
                  name: "citest-sdo"
                }
              }
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          adminOptions
        );

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `citest-sdo`
        );

        let newSDOId = _.get(result, 'createStructuredData.id');

        const getResourcesACL = await gqlClient.query(
          `query getResourcesACL {
            getACLForResources(
              resourceType: SDO
              ids: ["${newSDOId}"]
            ) {
              records {
                id
              }
            }
          }`,
          {},
          adminOptions
        );

        const resourcesACL = _.get(getResourcesACL, 'getACLForResources');
        expect(_.get(resourcesACL, 'records')).toBeDefined();
        expect(_.get(resourcesACL, 'records[0].id')).toContain(newSDOId);

        // 1 owner ACE + 2 default ACEs (orgAdmin + aiWARE Full Access && orgUsers + aiWARE Read Only)
        expect(_.get(resourcesACL, 'records.length')).toEqual(3);
      });
      it('should create SDO with addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.query(
          `mutation createSDO {
            createStructuredData(
              input: {
                schemaId: "${createdSchemaId}"
                data: {
                  name: "citest-sdo"
                }
              }
            ) {
              id
              data
              schemaId
              addACEs(
                entries: [
                  {
                    member: {
                      id: "${newAuthGroup.id}"
                      memberType: Group
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectID
                  objectType
                }
                count
              }
            }
          }`,
          {},
          adminOptions
        );

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `citest-sdo`
        );
        const newSDOId = _.get(result, 'createStructuredData.id');
        acl = _.get(result, 'createStructuredData.addACEs.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newSDOId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 3 ACEs: 1 owner ACE + 1 new ACE + 1 default ACE (orgAdmin + aiWARE Full Access)
        expect(acl.length).toEqual(3);
      });
      it('should delete the created SDOs', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.query(
          `query sdos {
            structuredDataObjects(
              schemaId: "${createdSchemaId}"
              offset: 0
              limit: 50
            ) {
              records {
                id
              }
            }
          }`,
          {},
          adminOptions
        );
        const SDOs = _.get(result, 'structuredDataObjects.records');
        expect(SDOs.length).toBeGreaterThanOrEqual(2);
        let deletedCount = 0;
        for (var sdo of SDOs) {
          deletedCount++;
          result = await gqlClient.query(
            `mutation deleteStructuredData {
              deleteStructuredData(input: {
                id: "${sdo.id}"
                schemaId: "${createdSchemaId}"
              }) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(2);
      });
      it('should get all folders (should be 2 created by admin)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
              childFolders {
                records {
                  id
                  name
                  status
                  treeObjectId

                }
              }
            }
          }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(
          result,
          'rootFolders[0].childFolders.records'
        );
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toEqual(2);
      });
      it('should delete these folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        for (var folderId of folderIds) {
          // delete Folders
          deletedCount++;
          result = await gqlClient.query(
            `mutation deleteFolder {
              deleteFolder(
                input: {
                  id: "${folderId}"
                  orderIndex: 0
                }
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toEqual(2);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getGroup {
            authGroups {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        const authGroups = _.get(result, 'authGroups.records');
        for (var g of authGroups) {
          let error;
          try {
            result = await gqlClient.query(
              `mutation deleteAuthG {
                authGroupDelete(
                  id: "${g.id}"
                ) {
                  id
                }
              }`,
              {},
              adminOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }
        result = await gqlClient.query(
          `query getGroup {
            authGroups {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(
          _.get(result, 'authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query authPermissionSets{
            authPermissionSets(
              nameRegex: "${citestMarker}-auth-permission-set"
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        const permissionSets = _.get(result, 'authPermissionSets.records');
        for (var ps of permissionSets) {
          result = await gqlClient.query(
            `mutation deleteAuthPermissionSet {
              authPermissionSetDelete(
                id: "${ps.id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        result = await gqlClient.query(
          `query authPermissionSets{
            authPermissionSets(
              nameRegex: "${citestMarker}-auth-permission-set"
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSets.records').length).toEqual(0);
      });
    });
  });

  describe('JWT Token Operations', () => {
    let jwtToken, jwtTokenOption;
    let result, error;
    let newAuthGroup, newAuthPermissionSet;
    let adminUserId, regularUserId;
    let authGroups, authPermissionSets;
    let cmsRootFolderId, newTDOId, newFolderId;
    let acl;
    let folderIds;
    describe('on normal operations', () => {
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'me.id');
        // Login as Regular user
        result = await gqlClient.query(meGql, {}, regularOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'me.id');

        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              nameRegex: "${testOrg.name}"
            ) {
              records {
                id
                name
                members(memberType: User, limit: 15, offset: 0) {
                  records {
                    member {
                      __typename
                      ... on User {
                        id
                      }
                    }
                  }
                }
              }
            }
          }`,
          {},
          adminOptions
        );
        authGroups = _.get(result, 'authGroups.records');
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        // the default groups for the organization will include superadmin who created it.
        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = _.get(g, 'members.records', []);
          hasSuperAdminMember = _.some(
            users,
            (u) => _.get(u, 'member.id', '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        result = await gqlClient.query(
          `query permissionSet{
            authPermissionSets(
              nameRegex: "aiWARE"
              authClass: System
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        authPermissionSets = _.get(result, 'authPermissionSets.records');
        expect(authPermissionSets.length).toEqual(4);

        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation authGroupCreate {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "${citestMarker}-auth-group"
            }) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroupCreate')).toBeDefined();
        expect(_.get(result, 'authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = _.get(result, 'authGroupCreate');
      });
      it('should add regular user to the new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation authGroupAddMembers{
            authGroupAddMembers(
              id: "${newAuthGroup.id}"
              members: [{
                id: "${regularUserId}"
                memberType: User
              }]
            ) {
              id
              name
              description

            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroupAddMembers')).toBeDefined();
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
                description: "${citestMarker}-auth-permission-set"
                permissions: [AIWARE_TDO_CREATE,  AIWARE_TDO_DELETE,  AIWARE_TDO_READ,  AIWARE_TDO_SEARCH,  AIWARE_TDO_UPDATE, AIWARE_FOLDER_READ, RECORDING_READ]
              }
            ) {
              id
              name
              permissions
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac by admin for JWT token test"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms

              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');
        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Folder
              ids: ["${newFolderId}"]
              entries: [
                {
                  member: {
                    id: "${newAuthGroup.id}"
                    memberType: Group
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${newFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'createTDO.id');
        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: TDO
              ids: ["${newTDOId}"]
              entries: [
                {
                  member: {
                    id: "${newAuthGroup.id}"
                    memberType: Group
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newTDOId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('Should create JWT token and query regular user', async () => {
        result = await gqlClient.query(
          `query getGroup {
            authGroups {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        const authGroups = _.get(result, 'authGroups.records');
        // Assign Payload for JWT token
        result = await gqlClient.query(
          `mutation getEngJWT {
            getEngineJWT(
              input: {
                resource: {
                  userId: "${regularUserId}"
                  tdoId: "${newTDOId}"
                }
              }
            ) {
              token
            }
          }`,
          {},
          adminOptions
        );
        jwtToken = _.get(result, 'getEngineJWT.token');
        expect(jwtToken).toBeDefined();
        jwtTokenOption = helpers.requestOptions(jwtToken);
      });
      it('Should query new TDO using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query TDO {
            temporalDataObject(
              id: ${newTDOId}
            ) {
              id
              name
            }
          }`,
          {},
          jwtTokenOption
        );
        expect(_.get(result, 'temporalDataObject.id')).toEqual(newTDOId);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getGroup {
            authGroups {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        const authGroups = _.get(result, 'authGroups.records');
        for (var g of authGroups) {
          let error;
          try {
            result = await gqlClient.query(
              `mutation deleteAuthG {
                authGroupDelete(
                  id: "${g.id}"
                ) {
                  id
                }
              }`,
              {},
              adminOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }
        result = await gqlClient.query(
          `query getGroup {
            authGroups {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(
          _.get(result, 'authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query authPermissionSets{
            authPermissionSets(
              nameRegex: "${citestMarker}-auth-permission-set"
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        const permissionSets = _.get(result, 'authPermissionSets.records');
        for (var ps of permissionSets) {
          result = await gqlClient.query(
            `mutation deleteAuthPermissionSet {
              authPermissionSetDelete(
                id: "${ps.id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        result = await gqlClient.query(
          `query authPermissionSets{
            authPermissionSets(
              nameRegex: "${citestMarker}-auth-permission-set"
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSets.records').length).toEqual(0);
      });
      it('Should NOT query new folder using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let error;
        try {
          result = await gqlClient.query(
            `query TDO {
              temporalDataObject(
                id: ${newTDOId}
              ) {
                id
                name
              }
            }`,
            {},
            jwtTokenOption
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
      });
      it('Should delete new folder', async () => {
        result = await gqlClient.query(
          `mutation deleteFolder {
            deleteFolder(
              input: {
                id: "${newFolderId}"
                orderIndex: 0
              }
            ) {
              id
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'deleteFolder.id')).toEqual(newFolderId);
      });
      it('Should delete new TDO', async () => {
        result = await gqlClient.query(
          `mutation deleteTDOs {
            deleteTDO(
              id: "${newTDOId}"
            ) {
              id
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'deleteTDO.id')).toEqual(newTDOId);
      });
    });
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'ownerOrganization operations - %s uses OLP features on OLP organization',
    (tokenType) => {
      let result;
      let tokenOptions;
      let newAuthGroup, newAuthPermissionSet;
      let cmsRootFolderId, newFolderId;
      let acl;
      let folderIds;

      beforeAll(async () => {
        // superAdmin can use OLP features on other OLP organizations, whether they belong to OLP or non-OLP.
        tokenOptions =
          tokenType === 'superAdmin'
            ? helpers.requestOptions(superToken)
            : adminOptions;
      });

      it('should get cms root folder via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query cmsFolder {
          rootFolders(
            type: cms
          ) {
            id
            name
            description
          }
        }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation authGroupCreate {
          authGroupCreate(input: {
            name: "${citestMarker}-auth-group-${uuid.v4()}"
            description: "${citestMarker}-auth-group"
            ownerOrganization: "${testOrg.guid}"
          }) {
            id
            name
            organization {
              id
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(_.get(result, 'authGroupCreate')).toBeDefined();
        expect(_.get(result, 'authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        expect(_.get(result, 'authGroupCreate.organization.id')).toEqual(
          testOrg.id
        );
        newAuthGroup = _.get(result, 'authGroupCreate');
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [AIWARE_TDO_CREATE,  AIWARE_TDO_DELETE,  AIWARE_TDO_READ,  AIWARE_TDO_SEARCH,  AIWARE_TDO_UPDATE]
              organizationID: ${testOrg.id}  #this is ownerOrganization
            }
          ) {
            id
            name
            permissions
            organization {
              id
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        expect(
          _.get(result, 'authPermissionSetCreate.organization.id')
        ).toEqual(testOrg.id);
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // should create Folder in OLP org via adminOrg
        result = await gqlClient.query(
          `mutation createFolder {
          createFolder(
            input: {
              name: "${citestMarker}-folder-${uuid.v4()}"
              description: "test folder for rbac created by admin for auth group and permission set operations"
              parentId: "${cmsRootFolderId}"
              rootFolderType: cms

            }
          ) {
            id
            name
          }
        }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');

        // superAdmin adds ACE to resource with specific ownerOrganization
        result = await gqlClient.query(
          `mutation addRole {
          addACEsToResources(
            resourceType: Folder
            ids: ["${newFolderId}"]
            entries: [
              {
                member: {
                  id: "${newAuthGroup.id}"
                  memberType: Group
                }
                permissionSetID: "${newAuthPermissionSet.id}"
              }
            ]
            ownerOrganization: "${testOrg.guid}"
          ) {
            records {
              id
              objectType
              organization {
                id
              }
            }
          }
        }`,
          {},
          tokenOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should get all folders (should be more than 1 created by admin) via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query cmsFolder {
          rootFolders(
            type: cms
          ) {
            id
            name
            description
            childFolders {
              records {
                id
                name
                status
                treeObjectId

              }
            }
          }
        }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(
          result,
          'rootFolders[0].childFolders.records'
        );
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });
      it('should get ACL for organization resource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query getACLForResources {
          getACLForResources(
            ids: [${testOrg.id}]
            resourceType: Organization
            ownerOrganization: "${testOrg.guid}"
          ) {
            records {
              id
              objectID
              objectType
              organization {
                id
                guid
              }
              permissionSet {
                id
                name
                organization {
                  id
                  guid
                }
              }
              member {
                ... on AuthGroup {
                  id
                  name
                  organization {
                    id
                    guid
                  }
                }
              }
            }
          }
        }
        `,
          {},
          tokenOptions
        );
        const acls = _.get(result, 'getACLForResources.records');
        expect(acls.length).toBeGreaterThan(0);
        expect(_.get(acls, '[0].organization.id')).toEqual(testOrg.id);
        expect(_.get(acls, '[0].permissionSet.organization.id')).toEqual(
          testOrg.id
        );
        expect(_.get(acls, '[0].member.organization.id')).toEqual(testOrg.id);
      });
      it('should delete these folders via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        let deletedCount = 0;
        for (var folderId of folderIds) {
          // delete Folders
          deletedCount++;
          result = await gqlClient.query(
            `mutation deleteFolder {
            deleteFolder(
              input: {
                id: "${folderId}"
                orderIndex: 0
              }
            ) {
              id
            }
          }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(1);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query getGroup {
          authGroups (ownerOrganization: "${testOrg.guid}") {
            records {
              id
              name
              organization {
                id
              }
            }
          }
        }`,
          {},
          tokenOptions
        );
        const authGroups = _.get(result, 'authGroups.records');
        for (var g of authGroups) {
          expect(_.get(g, 'organization.id')).toEqual(testOrg.id);
          let error;
          try {
            result = await gqlClient.query(
              `mutation deleteAuthG {
              authGroupDelete(
                id: "${g.id}"
                ownerOrganization: "${testOrg.guid}"
              ) {
                id
              }
            }`,
              {},
              tokenOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }
        result = await gqlClient.query(
          `query getGroup {
          authGroups (ownerOrganization: "${testOrg.guid}") {
            records {
              id
              name
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(
          _.get(result, 'authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query authPermissionSets{
          authPermissionSets(
            nameRegex: "${citestMarker}-auth-permission-set"
            ownerOrganization: "${testOrg.guid}"
          ) {
            records {
              id
              name
              organization {
                id
              }
            }
          }
        }`,
          {},
          tokenOptions
        );
        const permissionSets = _.get(result, 'authPermissionSets.records');
        for (var ps of permissionSets) {
          expect(_.get(ps, 'organization.id')).toEqual(testOrg.id);
          result = await gqlClient.query(
            `mutation deleteAuthPermissionSet {
            authPermissionSetDelete(
              id: "${ps.id}"
              ownerOrganization: "${testOrg.guid}"
            ) {
              id
            }
          }`,
            {},
            tokenOptions
          );
        }
        result = await gqlClient.query(
          `query authPermissionSets{
          authPermissionSets(
            nameRegex: "${citestMarker}-auth-permission-set"
            ownerOrganization: "${testOrg.guid}"
          ) {
            records {
              id
              name
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(_.get(result, 'authPermissionSets.records').length).toEqual(0);
      });
    }
  );

  describe('Manage access to resources', () => {
    let result;
    let defaultAGsToRemoveMember = [];
    let acl;
    let cmsRootFolderId;
    let folderIds = [];
    let newAuthPermissionSet;
    let restrictedFolderId;
    let restrictedFolderName;
    let schemaId, sdoFolderId, sdoId;

    beforeAll(async () => {
      // check restrictUser logins
      result = await gqlClient.query(meGql, {}, restrictOptions);
      expect(_.get(result, 'me.name')).toContain(
        `${citestMarker}-first-restrict-user`
      );
      defaultAGsToRemoveMember = _.get(result, 'me.authGroups.records', []);
      result = await gqlClient.query(
        `query cmsFolder {
          rootFolders(
            type: cms
          ) {
            id
            name
            description
          }
        }`,
        {},
        adminOptions
      );
      const rootFolders = _.get(result, 'rootFolders');
      expect(rootFolders.length).toBeGreaterThan(0);
      expect(_.get(rootFolders[0], 'name')).toContain('cms');
      cmsRootFolderId = _.get(rootFolders[0], 'id');
    });

    it('should removes restrict users from default AGs', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

      if (authGroupIds.length > 0) {
        result = await Promise.all(
          authGroupIds.map((id) =>
            gqlClient.query(
              `mutation authGroupRemoveMembers {
                authGroupRemoveMembers(
                  id: "${id}",
                  memberIds: ["${restrictUser.id}", "${secondRestrictUser.id}"]
                ) {
                  id
                }
              }`,
              {},
              adminOptions
            )
          )
        );
        expect(result.length).toEqual(authGroupIds.length);
      }
    });

    it('should not be able to create Folder Content Template without AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation createDataRegistry {
          createDataRegistry(
            input: {
              id: "${uuid.v4()}"
              name: "${citestMarker}-data-registry-${uuid.v4()}"
              description: "test data registry for rbac auth group and permission set operations"
              source: "citest-source"
            }
          ) {
            id
            name
            description
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'createDataRegistry')).toBeDefined();
      expect(_.get(result, 'createDataRegistry.name')).toContain(
        `${citestMarker}-data-registry`
      );
      testOrg.dataRegistryId = _.get(result, 'createDataRegistry.id');
      result = await gqlClient.query(
        `mutation createSchema {
          createSchema(
            input: {
              id: "${uuid.v4()}"
              dataRegistryId: "${testOrg.dataRegistryId}"
              majorVersion: 1
              minorVersion: 0
              status: draft
              definition: {
                type: "object"
                properties: {
                  name: {
                    type: "string"
                  }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
            definition
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'createSchema')).toBeDefined();
      expect(_.get(result, 'createSchema.id')).toBeDefined();

      schemaId = _.get(result, 'createSchema.id');

      expect(schemaId).toBeDefined();

      result = await gqlClient.query(
        `mutation updateSchema {
          updateSchemaState(
            input: {
              id: "${schemaId}"
              status: published
            }
          ) {
            id
            status
          }
        }`,
        {},
        adminOptions
      );

      expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
      expect(_.get(result, 'updateSchemaState.status')).toEqual('published');
      result = await gqlClient.query(
        `mutation createFolder {
          createFolder(
            input: {
              name: "${citestMarker}-folder-${uuid.v4()}"
              description: "test folder for rbac created by regular user"
              parentId: "${cmsRootFolderId}"
              rootFolderType: cms
            }
          ) {
            id
            name
          }
        }`,
        {},
        regularOptions
      );
      expect(_.get(result, 'createFolder')).toBeDefined();
      expect(_.get(result, 'createFolder.name')).toContain(
        `${citestMarker}-folder`
      );
      sdoFolderId = _.get(result, 'createFolder.id');

      // grant access folder to restrictUser
      const folderPermissionRes = await gqlClient.query(
        `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-folder-permission-set-${uuid.v4()}"
                description: "${citestMarker}-folder-permission-set"
                permissions: [
                  AIWARE_FOLDER_UPDATE
                ]
              }
            ) {
              id
              name
              permissions
            }
          }`,
        {},
        adminOptions
      );
      expect(
        _.get(folderPermissionRes, 'authPermissionSetCreate')
      ).toBeDefined();
      expect(
        _.get(folderPermissionRes, 'authPermissionSetCreate.name')
      ).toContain(`${citestMarker}-folder-permission-set`);
      const folderPermissionSets = _.get(
        folderPermissionRes,
        'authPermissionSetCreate'
      );

      await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          ids: [sdoFolderId],
          resourceType: 'Folder',
          entries: [
            {
              member: {
                id: restrictUser.id,
                memberType: 'User'
              },
              permissionSetID: folderPermissionSets.id
            }
          ]
        }
      );

      result = await gqlClient.query(
        `mutation createSDO {
          createStructuredData(
            input: {
              schemaId: "${schemaId}"
              data: {
                name: "test SDO"
              }
            }
          ) {
            id
            data
            schemaId
          }
        }`,
        {},
        regularOptions
      );

      sdoId = _.get(result, 'createStructuredData.id');
      // Login for Regular user
      const impersonated = await impersonateUser(restrictUser);
      restrictOptions = impersonated.requestOptions;

      const query = `mutation {
        createFolderContentTemplate (input: {
          folderId: "${sdoFolderId}"
          sdoId: "${sdoId}"
          schemaId: "${schemaId}"
        }) {
          id
          folderId
          sdoId
          sdo {
            id
            schemaId
          }
          schemaId
          data
          createdDateTime
          modifiedDateTime
        }
      }`;
      await expect(gqlClient.query(query, {}, restrictOptions)).rejects.toThrow(
        /No authorization access role found for Mutation.createFolderContentTemplate/
      );
    });

    it('should be able to create Folder Content Template with AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [
                AIWARE_SDO_READ,
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      const sdoPermissionSets = _.get(result, 'authPermissionSetCreate');
      result = await gqlClient.query(
        `mutation addRole {
            addACEsToResources(
              resourceType: SDOSchema
              ids: ["${schemaId}"]
              entries: [
                {
                  member: {
                    id: "${restrictUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${sdoPermissionSets.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
        {},
        adminOptions
      );

      // re impersonateUser to reset role
      const impersonated = await impersonateUser(restrictUser);
      restrictOptions = impersonated.requestOptions;

      result = await gqlClient.query(
        `mutation createFolderContentTemplate{
        createFolderContentTemplate (input: {
          folderId: "${sdoFolderId}"
          sdoId: "${sdoId}"
          schemaId: "${schemaId}"
        }) {
          id
          folderId
          sdoId
          sdo {
            id
            schemaId
          }
          schemaId
          data
          createdDateTime
          modifiedDateTime
        }
      }`,
        {},
        restrictOptions
      );

      const folderContentTemplate = _.get(
        result,
        'createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(sdoId);
    });

    it('should create a new permission set', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [
                AIWARE_FOLDER_UPDATE,
                AIWARE_FOLDER_READ,
                AIWARE_FOLDER_DELETE,
                AIWARE_FOLDER_CREATE,
                AIWARE_FOLDER_FILE
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
    });

    it('should share Root Folder Access with restrict users', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation addRole {
            addACEsToResources(
              resourceType: Folder
              ids: ["${cmsRootFolderId}"]
              entries: [
                {
                  member: {
                    id: "${restrictUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                },
                {
                  member: {
                    id: "${secondRestrictUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
        {},
        adminOptions
      );

      acl = _.get(result, 'addACEsToResources.records');
      // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 2 ACEs on user level
      expect(acl.length).toEqual(4);

      // add a trick to get user-private auth group id from acl
      const resourceACEOnUserLevel = _.find(acl, (ace) =>
        ace.id.includes(newAuthPermissionSet.id)
      );
      // aceId = resource_type::resource_id::ag_id::ps_id;
      privateAuthGroupId = _.get(resourceACEOnUserLevel, 'id', '').split(
        '::'
      )[2];
    });

    describe('should grant the user access to a private resource', () => {
      it('should not allow restricted users to create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await impersonateUser(restrictUser);
        restrictOptions = impersonated.requestOptions;
        const query = `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac created by admin for auth group and permission set operations"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms
              }
            ) {
              id
              name
            }
          }`;

        await expect(
          gqlClient.query(query, {}, restrictOptions)
        ).rejects.toThrow(
          /No authorization access role found for Mutation.createFolder/
        );
      });

      it('should be able to create Folder with AIWARE_FOLDER_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [
                AIWARE_FOLDER_CREATE,
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        const folderPermissionSets = _.get(result, 'authPermissionSetCreate');
        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Organization
              ids: ["${testOrg.id}"]
              entries: [
                {
                  member: {
                    id: "${restrictUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${folderPermissionSets.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );

        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac created by admin for auth group and permission set operations"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms
              }
            ) {
              id
              name
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderName = _.get(result, 'createFolder.name');
        restrictedFolderId = _.get(result, 'createFolder.id');
        folderIds.push(restrictedFolderId);
      });
      it('should verify owner access', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(restrictUser);
        restrictOptions = impersonated.requestOptions;

        result = await gqlClient.query(
          `query {
            folder(id: "${restrictedFolderId}") {
              id
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId);
      });
      it('should allow a restricted user to update a folder they created', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await impersonateUser(restrictUser);
        restrictOptions = impersonated.requestOptions;
        const result = await gqlClient.query(
          `mutation updateFolder {
            updateFolder(
              input: {
                id: "${restrictedFolderId}"
                name: "${restrictedFolderName}-updated"
              }
            ) {
              id
              name
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'updateFolder')).toBeDefined();
        expect(_.get(result, 'updateFolder.name')).toContain(
          `${restrictedFolderName}-updated`
        );
      });
      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(secondRestrictUser);
        secondRestrictOptions = impersonated.requestOptions;

        const query = `query {
          folder(id: "${restrictedFolderId}") {
            id
          }
        }`;

        await expect(
          gqlClient.query(query, {}, secondRestrictOptions)
        ).rejects.toThrow();
        //The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('should verify user access for updating folder when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(secondRestrictUser);
        secondRestrictOptions = impersonated.requestOptions;

        const query = `mutation updateFolder {
            updateFolder(
              input: {
                id: "${restrictedFolderId}"
                name: "${restrictedFolderName}-updated"
              }
            ) {
              id
              name
            }
          }`;

        await expect(
          gqlClient.query(query, {}, secondRestrictOptions)
        ).rejects.toThrow();
        //The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('admin shares Private Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Folder
              ids: ["${restrictedFolderId}"]
              entries: [
                {
                  member: {
                    id: "${secondRestrictUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });
      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(secondRestrictUser);
        secondRestrictOptions = impersonated.requestOptions;

        result = await gqlClient.query(
          `query {
            folder(id: "${restrictedFolderId}") {
              id
            }
          }`,
          {},
          secondRestrictOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId);
      });
    });

    describe('should grant the user access to specific resources', () => {
      let restrictedFolderId1, restrictedFolderId2;
      it('should create folder', async () => {
        const result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac created by admin for auth group and permission set operations"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms

              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderId1 = _.get(result, 'createFolder.id');
        folderIds.push(restrictedFolderId1);
      });
      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(restrictUser);
        restrictOptions = impersonated.requestOptions;

        const query = `query {
          folder(id: "${restrictedFolderId1}") {
            id
          }
        }`;

        await expect(
          gqlClient.query(query, {}, restrictOptions)
        ).rejects.toThrow();
        //The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('should share Folder Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Folder
              ids: ["${restrictedFolderId1}"]
              entries: [
                {
                  member: {
                    id: "${restrictUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        acl = _.get(result, 'addACEsToResources.records');
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner ACE + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });
      it('should create Folder and share Folder Resource Access with user - by addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuid.v4()}"
                description: "test folder for rbac with addACEs nested mutation"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms
              }
            ) {
              id
              name
              addACEs(
                entries: [
                   {
                    member: {
                      id: "${restrictUser.id}"
                      memberType: User
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectID
                  objectType
                }
                count
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderId2 = _.get(result, 'createFolder.id');
        folderIds.push(restrictedFolderId2);

        acl = _.get(result, 'createFolder.addACEs.records');
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 ACE on user level, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });
      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(restrictUser);
        restrictOptions = impersonated.requestOptions;

        result = await gqlClient.query(
          `query {
            folder(id: "${restrictedFolderId1}") {
              id
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId1);

        result = await gqlClient.query(
          `query {
            folder(id: "${restrictedFolderId2}") {
              id
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId2);
      });
    });
    it('should delete these folders', async () => {
      let deletedCount = 0;
      for (let folderId of folderIds) {
        // delete Folders
        deletedCount++;
        result = await gqlClient.query(
          `mutation deleteFolder {
              deleteFolder(
                input: {
                  id: "${folderId}"
                  orderIndex: 0
                }
              ) {
                id
              }
            }`,
          {},
          adminOptions
        );
      }
      expect(deletedCount).toEqual(3);
    });

    describe('should not be accessible to User Default Private AG via the regular groups APIs', () => {
      it("the user's default private AG cannot be listed", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // authGroups API.
        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              ids: ["${privateAuthGroupId}"]
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroups.records')).toBeDefined();
        expect(result.authGroups.records.length).toEqual(0);

        // authGroups in User type.
        const impersonated = await chakram.get(
          `${config.core_admin_url}/admin/impersonate/${restrictUser.id}/${restrictUser.organizationGuid}`,
          helpers.requestOptions(superToken)
        );
        expect(_.get(impersonated, 'body.token')).toBeDefined();
        result = await gqlClient.query(meGql, {}, restrictOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-first-restrict-user`
        );
        const defaultAGs = _.get(result, 'me.authGroups.records', []);
        const defaultAGIds = _.map(defaultAGs, 'id');
        expect(defaultAGIds.includes(privateAuthGroupId)).toEqual(false);
      });
      it("the user's default private AG cannot be updated", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const query = `mutation authGroupUpdate {
            authGroupUpdate(
              input: {
                id: "${privateAuthGroupId}"
                description: "test2"
                name: "test2"
              }
            ) {
              id
              name
            }
          }`;
        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
      it("the user's default private AG cannot be deleted", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `mutation deleteAuthGroup {
            authGroupDelete(
              id: "${privateAuthGroupId}"
            ) {
              id
            }
          }`;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('This auth group is a protected group.');
      });
      it("the user's default private AG cannot be added members to it", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `
          mutation authGroupAddMembers{
            authGroupAddMembers(
              id: "${privateAuthGroupId}"
              members: [{
                id: "${regularUser.id}"
                memberType: User
              }]
            ) {
              id
              name
              description

            }
          }
        `;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
      it("members cannot be added to the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `
          mutation authGroupAddMembers{
            authGroupAddMembers(
              id: "${privateAuthGroupId}"
              members: [{
                id: "${regularUser.id}"
                memberType: User
              }]
            ) {
              id
              name
              description

            }
          }
        `;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
      it("members cannot be removed from the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `
          mutation authGroupRemoveMembers {
            authGroupRemoveMembers(
              id: "${privateAuthGroupId}",
              memberIds: ["${restrictUser.id}"]
            ) {
                id
              }
          }
        `;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
    });
    it('should only delete non-protected auth groups', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `query getGroup {
          authGroups {
            records {
              id
              name
            }
          }
        }`,
        {},
        adminOptions
      );
      const authGroups = _.get(result, 'authGroups.records');
      for (var g of authGroups) {
        let error;
        try {
          result = await gqlClient.query(
            `mutation deleteAuthG {
              authGroupDelete(
                id: "${g.id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        if (g.name.includes(`${citestMarker}-org`)) {
          expect(_.toString(error)).toContain(
            'This auth group is a protected group.'
          );
        }
      }
      result = await gqlClient.query(
        `query getGroup {
          authGroups {
            records {
              id
              name
            }
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'authGroups.records').length).toBeGreaterThanOrEqual(
        2
      );
    });
    it('should only delete non-protected permission sets', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `query authPermissionSets{
          authPermissionSets(
            nameRegex: "${citestMarker}-auth-permission-set"
          ) {
            records {
              id
              name
            }
          }
        }`,
        {},
        adminOptions
      );
      const permissionSets = _.get(result, 'authPermissionSets.records');

      for (var ps of permissionSets) {
        result = await gqlClient.query(
          `mutation deleteAuthPermissionSet {
            authPermissionSetDelete(
              id: "${ps.id}"
            ) {
              id
            }
          }`,
          {},
          adminOptions
        );
      }
      result = await gqlClient.query(
        `query authPermissionSets{
          authPermissionSets(
            nameRegex: "${citestMarker}-auth-permission-set"
          ) {
            records {
              id
              name
            }
          }
        }`,
        {},
        adminOptions
      );
    });
  });
  describe('RBAC for get packages', () => {
    let ci_app_grant_package;
    let app_uuid = uuid.v4();
    let testAppId;
    let testApp = {
      id: uuid.v4(),
      name: `${citestMarker} Package App - ${app_uuid}}`,
      key: `citest-package-app ${app_uuid}`,
      description: `Citest Package App - ${app_uuid}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    };
    let ci_app_owned_package;
    let newAuthPermissionSet;
    it('should create application', async () => {
      const query = `
          mutation createApp {
            createApplication(
              input: {
                name: "${testApp.name}"
                key: "${testApp.key}"
                description: "${testApp.description}"
                url: "${testApp.url}"
                oauth2RedirectUrls: "${testApp.oauth2RedirectUrls}"
                checkPermissions: ${testApp.checkPermissions}
                status: ${testApp.status}
                disableAutoPackageCreation: true # disable auto package creation for createPackage below
              }
            ) {
              id
              name
              status
            }
          }
        `;
      const result = await gqlClient.query(query, {}, superAdminOptions);
      testAppId = _.get(result, 'createApplication.id');
      expect(testAppId).toBeDefined();
    });
    it('should create package with application resource', async () => {
      let appGrantPackageQuery = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${citestMarker} citest appGrant test package"
                version: "1.0"
                primaryResourceId: "${testAppId}"
                resources: [
                  {
                    resourceId: "${testAppId}"
                    resourceType: application
                    action: ADD
                  }
                ]
              }
            ) {
              id
              resources {
                records {
                  id
                  resourceType
                  resourceAlias
                }
              }
            }
          }
        `;
      let resultAppGrantPackageMutation = await gqlClient.query(
        appGrantPackageQuery,
        {},
        superAdminOptions
      );
      ci_app_grant_package = _.get(
        resultAppGrantPackageMutation,
        'packageCreate'
      );
    });
    it('should grant package to organization with VIEW access', async () => {
      const query = `
          mutation addGrant {
            packageUpdateGrants(
              input: {
                packageId: "${ci_app_grant_package.id}"
                packageGrants: [
                  {
                    organizationId: ${testOrg.id}
                    action: ADD
                    grantType: VIEW
                  }
                ]
              }
            ) {
              id
              name
              version
            }
          }
        `;
      const result = await gqlClient.query(query, {}, superAdminOptions);
      expect(_.get(result, 'packageUpdateGrants.id')).toEqual(
        ci_app_grant_package.id
      );
    });

    it('should create a package owned by organization', async () => {
      let query = `
          mutation createPackage {
            packageCreate(
              input: {
                name: "${citestMarker} citest org owned packages"
                version: "1.0"
                organizationId:"${testOrg.id}"
              }
            ) {
              id
            }
          }
        `;
      let resultAppGrantPackageMutation = await gqlClient.query(
        query,
        {},
        adminOptions
      );
      ci_app_owned_package = _.get(
        resultAppGrantPackageMutation,
        'packageCreate'
      );
    });

    it('admin user should fetch both granted and org-owned packages', async () => {
      const packagesQuery = `
         query packages {
          packages (ids: ["${ci_app_grant_package.id}", "${ci_app_owned_package.id}"]) {
            records {
              id
              name
              status
              organization {
                id
              }
            }
          }
        }
        `;
      const packagesResult = await gqlClient.query(
        packagesQuery,
        {},
        adminOptions
      );
      const packages = _.get(packagesResult, 'packages.records');
      expect(packages.length).toEqual(2);
    });

    it('regular user with AIWARE_DEVELOPER_ENGINE_READ should fetch both granted and org-owned packages', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `
      mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [
                DEVELOPER_ENGINE_READ
              ]
            }
          ) {
            id
            name
            permissions
          }
        }
      `;
      const result = await gqlClient.query(query, {}, adminOptions);

      expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');

      const result1 = await gqlClient.query(
        `mutation addRole {
            addACEsToResources(
              resourceType: Organization
              ids: ["${testOrg.id}"]
              entries: [
                {
                  member: {
                    id: "${secondRegularUser.id}"
                    memberType: User
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
        {},
        adminOptions
      );

      const acl = _.get(result, 'addACEsToResources.records');

      // Login for Regular user
      const impersonated = await impersonateUser(secondRegularUser);
      secondRegularOptions = impersonated.requestOptions;

      const packagesQuery = `
         query packages {
          packages (ids: ["${ci_app_grant_package.id}", "${ci_app_owned_package.id}"]) {
            records {
              id
              name
              status
              organization {
                id
              }
            }
          }
        }
        `;
      const packagesResult = await gqlClient.query(
        packagesQuery,
        {},
        secondRegularOptions
      );
      const packages = _.get(packagesResult, 'packages.records');
      expect(packages.length).toEqual(2);
    });

    it('regular user without AIWARE_DEVELOPER_ENGINE_READ should fetch only granted packages', async () => {
      const packagesQuery = `
         query packages {
          packages (ids: ["${ci_app_grant_package.id}", "${ci_app_owned_package.id}"]) {
            records {
              id
              name
              status
              organization {
                id
              }
            }
          }
        }
        `;
      const packagesResult = await gqlClient.query(
        packagesQuery,
        {},
        regularOptions
      );
      const packages = _.get(packagesResult, 'packages.records');
      expect(packages.length).toEqual(1);
    });

    it('superadmin should see same packages via packages query and packageGrants', async () => {
      const grantedIds = await getGrantedPackageIds(
        testOrg.id,
        superAdminOptions
      );
      const fetchedPackages = await getPackagesByIds(
        grantedIds,
        superAdminOptions
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('developer user should see same packages from packages and packageGrants', async () => {
      const grantedIds = await getGrantedPackageIds(
        testOrg.id,
        secondRegularOptions
      );
      const fetchedPackages = await getPackagesByIds(
        grantedIds,
        secondRegularOptions
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('regular user without developer permission should see same granted packages from both APIs', async () => {
      const grantedIds = await getGrantedPackageIds(testOrg.id, regularOptions);
      const fetchedPackages = await getPackagesByIds(
        grantedIds,
        regularOptions
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('should delete multiple packages sequentially', async () => {
      const packageIdsToDelete = [
        ci_app_grant_package.id,
        ci_app_owned_package.id
      ];

      for (const id of packageIdsToDelete) {
        const deletePackage = `
          mutation {
            packageDelete(id: "${id}") {
              success
              msg
              code
            }
          }
        `;

        const result = await gqlClient.query(
          deletePackage,
          {},
          superAdminOptions
        );
        expect(result.packageDelete.success).toBe(true);
      }
    });
    it('should delete application', async () => {
      const query = `
          mutation deleteTestApp {
            deleteApplication(id: "${testAppId}") {
              id
              message
            }
          }
        `;
      const result = await gqlClient.query(query);
      const deletedApp = _.get(result, 'deleteApplication');
      expect(deletedApp.id).toEqual(testAppId);
    });
  });

  describe('ACE Inheritance with ace inherit flag', () => {
    let parentFolderId, childFolderId, childTDOId;
    let testAuthGroupId, testPermissionSetId;
    let adminUserId, regularUserId;
    let cmsRootFolderId;
    let result;

    describe('with Admin user', () => {
      beforeAll(async () => {
        // Verify admin login
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'me.id');

        result = await gqlClient.query(meGql, {}, regularOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'me.id');
        // Create test auth group
        result = await gqlClient.query(
          `mutation authGroupCreate {
            authGroupCreate(
              input: {
                name: "${citestMarker}-inherit-test-group-${uuid.v4()}"
                description: "Test group for inheritance testing"
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        testAuthGroupId = _.get(result, 'authGroupCreate.id');
        expect(testAuthGroupId).toBeDefined();

        // Create test permission set
        result = await gqlClient.query(
          `mutation authPermissionSetCreate {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-inherit-test-permissions-${uuid.v4()}"
                description: "Test permissions for inheritance testing"
                permissions: [AIWARE_FOLDER_READ, AIWARE_FOLDER_UPDATE, AIWARE_TDO_READ]
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        testPermissionSetId = _.get(result, 'authPermissionSetCreate.id');
        expect(testPermissionSetId).toBeDefined();

        result = await gqlClient.query(
          `query cmsFolder {
            rootFolders(
              type: cms
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        const rootFolders = _.get(result, 'rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create parent folder with ACE having inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-parent-folder-inherit-${uuid.v4()}"
                description: "Parent folder with inherit ACE"
                parentId: "${cmsRootFolderId}"
              }
            ) {
              id
              name
              addACEs(entries: [
                  {
                    member: {
                      id: "${testAuthGroupId}"
                      memberType: Group
                    }
                    permissionSetID: "${testPermissionSetId}"
                    options: ["inherit"]
                  },
                  {
                    member: {
                      id: "${regularUserId}"
                      memberType: User
                    }
                    permissionSetID: "${testPermissionSetId}"
                    options: ["inherit"]
                  }
                ]) {
                    records { id options }
                  }
            }
          }`,
          {},
          adminOptions
        );
        parentFolderId = _.get(result, 'createFolder.id');
        expect(parentFolderId).toBeDefined();
      });

      it('should verify parent folder ACE has options: inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const result = await gqlClient.query(
          `query getACL {
            getACLForResources(
              ids: ["${parentFolderId}"]
              resourceType: Folder
            ) {
              records {
                id
                memberType: __typename
                member {
                  ... on BasicUserInfo { id }
                  ... on AuthGroup { id }
                  memberType: __typename
                }
                permissionSet {
                  id
                }
                options
              }
            }
          }`,
          {},
          adminOptions
        );
        const acl = _.get(result, 'getACLForResources.records', []);
        const inheritACE = acl.find(
          (ace) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritACE).toBeDefined();
        expect(inheritACE.options).toContain('inherit');
      });

      it("should create parent folder with user private group ACE having options: ['inherit']", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const result = await gqlClient.query(
          `mutation addACEs {
            addACEsToResources(
              ids: ["${parentFolderId}"]
              resourceType: Folder
              entries: [
                {
                  member: {
                    id: "${adminUserId}"
                    memberType: User
                  }
                  permissionSetID: "${testPermissionSetId}"
                  options: ["inherit"]
                }
              ]
            ) {
              records {
                id
                member {
                  ... on BasicUserInfo {id}
                  ... on AuthGroup {id name}
                  memberType: __typename
                }
                permissionSet {
                  id
                }
                options
              }
            }
          }`,
          {},
          adminOptions
        );
        const acl = _.get(result, 'addACEsToResources.records');
        const userPrivateACE = acl.find(
          (ace) =>
            ace.options.includes('inherit') &&
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`)
        );
        expect(userPrivateACE).toBeDefined();
        expect(userPrivateACE.options).toContain('inherit');
      });

      it('should create child folder and verify ACE inheritance with inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-child-folder-${uuid.v4()}"
                description: "Child folder to test inheritance"
                parentId: "${parentFolderId}"
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        childFolderId = _.get(result, 'createFolder.id');
        expect(childFolderId).toBeDefined();

        // Verify that ACEs with inherit flag are inherited
        result = await gqlClient.query(
          `query getACL {
            getACLForResources(
              ids: ["${childFolderId}"]
              resourceType: Folder
            ) {
              records {
                id
                member {
                  ... on BasicUserInfo { id }
                  ... on AuthGroup { id }
                  memberType: __typename
                }
                permissionSet {
                  id
                }
                options
              }
            }
          }`,
          {},
          adminOptions
        );
        const childACL = _.get(result, 'getACLForResources.records', []);

        //expect(childACL).toEqual([]);

        // Should inherit the regular test group ACE with inherit flag
        const inheritedTestGroupACE = childACL.find(
          (ace) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();
        expect(inheritedTestGroupACE.options).toContain('inherit');

        // Should inherit the user private group ACE with inherit flag (this normally wouldn't inherit)
        const inheritedUserPrivateACE = childACL.find(
          (ace) =>
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`) &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedUserPrivateACE).toBeDefined();
        expect(inheritedUserPrivateACE.options).toContain('inherit');
      });

      it('should create TDO in child folder and verify ACE inheritance without inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                name: "${citestMarker}-child-tdo-${uuid.v4()}"
                description: "Child TDO to test inheritance"
                parentFolderId: "${childFolderId}"
                startDateTime: "2025-08-26T00:00:00Z"
                stopDateTime: "2025-08-26T00:00:00Z"
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        childTDOId = _.get(result, 'createTDO.id');
        expect(childTDOId).toBeDefined();

        // Verify that ACEs are inherited to TDO (TDOs don't have inherit flag since they're not containers)
        result = await gqlClient.query(
          `query getACL {
            getACLForResources(
              ids: ["${childTDOId}"]
              resourceType: TDO
            ) {
              records {
                id
                member {
                  ... on BasicUserInfo { id }
                  ... on AuthGroup { id }
                  memberType: __typename
                }
                permissionSet {
                  id
                }
              }
            }
          }`,
          {},
          adminOptions
        );
        const tdoACL = _.get(result, 'getACLForResources.records', []);

        // Should inherit the regular test group ACE
        const inheritedTestGroupACE = tdoACL.find(
          (ace) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();

        // Should inherit the user private group ACE (because parent had inherit flag)
        const inheritedUserPrivateACE = tdoACL.find(
          (ace) =>
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`) &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedUserPrivateACE).toBeDefined();
      });

      it('should verify regular user can access resources through inherited ACE', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        // Regular user should be able to access child TDO through inherited user private group ACE
        result = await gqlClient.query(
          `query tdo {
            temporalDataObject(id: "${childTDOId}") {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'temporalDataObject.id')).toEqual(childTDOId);

        // TODO: For some reason the following always fails. If the test cleanup is disabled executing the same
        // query manually works as expected. For some reason this only happens with folders and not TDOs. It is possible
        // to have a stale rbac cache somewhere?

        // Regular user should be able to access child folder through inherited user private group ACE
        /*
        result = await gqlClient.query(
          `query folder {
            folder(id: "${parentFolderId}") {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(parentFolderId);
        */
      });

      afterAll(async () => {
        if (!useRBACFeature) {
          return;
        }

        // Clean up test resources
        if (childTDOId) {
          await gqlClient.query(
            `mutation deleteTDO {
              deleteTDO(id: "${childTDOId}") { id }
            }`,
            {},
            adminOptions
          );
        }

        if (childFolderId) {
          await gqlClient.query(
            `mutation deleteFolder {
              deleteFolder(input: {id: "${childFolderId}", orderIndex: 0}) { id }
            }`,
            {},
            adminOptions
          );
        }

        if (parentFolderId) {
          await gqlClient.query(
            `mutation deleteFolder {
              deleteFolder(input: {id: "${parentFolderId}", orderIndex: 0}) { id }
            }`,
            {},
            adminOptions
          );
        }

        if (testAuthGroupId) {
          await gqlClient.query(
            `mutation deleteAuthGroup {
              authGroupDelete(id: "${testAuthGroupId}") { id }
            }`,
            {},
            adminOptions
          );
        }

        if (testPermissionSetId) {
          await gqlClient.query(
            `mutation deletePermissionSet {
              authPermissionSetDelete(id: "${testPermissionSetId}") { id }
            }`,
            {},
            adminOptions
          );
        }
      });

      describe('Folder without inherit flag comparison', () => {
        let parentFolderNoInheritId, childFolderNoInheritId;

        beforeAll(async () => {
          if (!useRBACFeature) {
            return;
          }

          // Create parent folder WITHOUT inherit flag on user private group ACE
          result = await gqlClient.query(
            `mutation createFolder {
              createFolder(
                input: {
                  name: "${citestMarker}-parent-folder-no-inherit-${uuid.v4()}"
                  description: "Parent folder without inherit ACE"
                  parentId: "${cmsRootFolderId}"
                }
              ) {
                id
                name
                addACEs (entries: [
                    {
                      member: {
                        id: "${testAuthGroupId}"
                        memberType: Group
                      }
                      permissionSetID: "${testPermissionSetId}"
                    }
                  ]) {
                      records { id options }
                    }
              }
            }`,
            {},
            adminOptions
          );
          parentFolderNoInheritId = _.get(result, 'createFolder.id');
          expect(parentFolderNoInheritId).toBeDefined();
        });

        it('should verify parent folder ACE does NOT have inherit flag', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          result = await gqlClient.query(
            `query getACL {
              getACLForResources(
                ids: ["${parentFolderNoInheritId}"]
                resourceType: Folder
              ) {
                records {
                  id
                  member {
                    ... on BasicUserInfo { id }
                    ... on AuthGroup { id }
                    memberType: __typename
                  }
                  permissionSet {
                    id
                  }
                  options
                }
              }
            }`,
            {},
            adminOptions
          );
          const acl = _.get(result, 'getACLForResources.records', []);
          const userPrivateACE = acl.find(
            (ace) =>
              ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`
          );
          expect(userPrivateACE).toBeDefined();
          expect(userPrivateACE.options).not.toContain('inherit');
        });

        it('should create child folder and verify user private group ACE is NOT inherited', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          result = await gqlClient.query(
            `mutation createFolder {
              createFolder(
                input: {
                  name: "${citestMarker}-child-folder-no-inherit-${uuid.v4()}"
                  description: "Child folder to test no inheritance"
                  parentId: "${parentFolderNoInheritId}"
                }
              ) {
                id
                name
              }
            }`,
            {},
            adminOptions
          );
          childFolderNoInheritId = _.get(result, 'createFolder.id');
          expect(childFolderNoInheritId).toBeDefined();

          // Verify that user private group ACE is NOT inherited (due to authGroupClass restriction)
          result = await gqlClient.query(
            `query getACL {
              getACLForResources(
                ids: ["${childFolderNoInheritId}"]
                resourceType: Folder
              ) {
                records {
                  id
                  member {
                    ... on BasicUserInfo { id }
                    ... on AuthGroup { id }
                    memberType: __typename
                  }
                  permissionSet {
                    id
                  }
                  options
                }
              }
            }`,
            {},
            adminOptions
          );
          const childACL = _.get(result, 'getACLForResources.records', []);

          // Should NOT inherit the user private group ACE (due to authGroupClass restriction)
          const notInheritedUserPrivateACE = childACL.find(
            (ace) =>
              ace.member.id === regularUserId &&
              ace.permissionSet.id === testPermissionSetId
          );
          expect(notInheritedUserPrivateACE).toBeUndefined();
        });

        afterAll(async () => {
          if (!useRBACFeature) {
            return;
          }

          // Clean up test resources
          if (childFolderNoInheritId) {
            await gqlClient.query(
              `mutation deleteFolder {
                deleteFolder(input: {id: "${childFolderNoInheritId}" orderIndex: 1}) { id }
              }`,
              {},
              adminOptions
            );
          }

          if (parentFolderNoInheritId) {
            await gqlClient.query(
              `mutation deleteFolder {
                deleteFolder(input: {id: "${parentFolderNoInheritId}" orderIndex: 1}) { id }
              }`,
              {},
              adminOptions
            );
          }
        });
      });
    });
  });

  describe('Evaluate OLP Migration of Organization', () => {
    async function setOrgOLPFlag(orgId, enabled) {
      return gqlClient.query(
        `mutation updateOrganization {
          updateOrganization (input: {
            id: "${orgId}"
            metadata: {
              features: {
                enableRBACFeature: "${enabled ? 'enabled' : 'disabled'}"
              }
            }
          }){
            id
            status
            jsondata
          }
        }`,
        {},
        helpers.requestOptions(superToken)
      );
    }

    it('olpMigration should be removed', async () => {
      // Disable org enableRBACFeature
      let result = await setOrgOLPFlag(testOrg.id, false);
      const updateOrganization = _.get(result, 'updateOrganization');
      expect(updateOrganization).toBeDefined();
      expect(updateOrganization.id).toBeDefined();

      const _elasticRetryAttempts = 5;
      // retry 5 times to ensure olpMigration is removed
      for (let i = 0; i < _elasticRetryAttempts + 1; i++) {
        await util.sleep(1000);
        result = await gqlClient.query(
          `
        query organizations {
          organizations(
              kvpProperty: "features.olpMigration",
              name: "${testOrg.name}"
              nameMatch: exact
              limit: 1
              offset: 0
          ) {
            count
            records {
              id
              jsondata
            }
          }
        }
        `,
          {},
          helpers.requestOptions(superToken)
        );

        const organizations = _.get(result, 'organizations');
        expect(organizations).toBeDefined();
        try {
          expect(organizations.count).toEqual(0);
          break;
        } catch (error) {
          console.log(`Retrying to check olpMigration removal: ${i + 1}`);
        }

        if (i === _elasticRetryAttempts) {
          throw new Error(
            `Failed to remove olpMigration after ${_elasticRetryAttempts} attempts`
          );
        }
      }
    });
    it('should verify restricted user can get all SDOs and Schema after OLP migration disable', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      if (!createdSchemaId) {
        pending('No schema created in previous tests');
      }

      if (!createdSDOId) {
        pending('No SDO created in previous tests');
      }

      const getSchema = await gqlClient.query(
        `query getSchemas {
          schema(
            id: "${createdSchemaId}"
          ) {
            id
          }
        }`,
        {},
        restrictOptions
      );

      const getSDOs = await gqlClient.query(
        `query getStructuredDataObjects {
          structuredDataObjects(
          schemaId: "${createdSchemaId}"
          ) {
            records {
              id
            }
          }
        }`,
        {},
        restrictOptions
      );

      const schemaId = _.get(getSchema, 'schema.id');
      expect(schemaId).toBeDefined();
      expect(schemaId).toEqual(createdSchemaId);

      const sdos = _.get(getSDOs, 'structuredDataObjects.records');
      expect(sdos).toBeDefined();
      expect(sdos.length).toBeGreaterThanOrEqual(0);
    });

    describe('olp enabled', () => {
      beforeAll(async () => {
        // enable OLP
        let result = await setOrgOLPFlag(testOrg.id, true);
        expect(result.updateOrganization.id).toEqual(testOrg.id);
      });

      it('should be able to access pre-existing sdo and schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        if (!createdSchemaId) {
          pending('No schema created in previous tests');
        }

        if (!createdSDOId) {
          pending('No SDO created in previous tests');
        }

        const getSchema = await gqlClient.query(
          `query getSchemas {
          schema(
            id: "${createdSchemaId}"
          ) {
            id
          }
        }`,
          {},
          restrictOptions
        );

        const getSDOs = await gqlClient.query(
          `query getStructuredDataObjects {
          structuredDataObjects(
          schemaId: "${createdSchemaId}"
          ) {
            records {
              id
            }
          }
        }`,
          {},
          restrictOptions
        );

        const schemaId = _.get(getSchema, 'schema.id');
        expect(schemaId).toBeDefined();
        expect(schemaId).toEqual(createdSchemaId);

        const sdos = _.get(getSDOs, 'structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBeGreaterThanOrEqual(0);
      });

      afterAll(async () => {
        // disable OLP to cleanup the created default objects
        let result = await setOrgOLPFlag(testOrg.id, false);
        expect(result.updateOrganization.id).toEqual(testOrg.id);
      });
    });
  });

  afterAll(async () => {
    // T16: delete testOrg via the real REST endpoint (as before) — this is now SAFE because the
    // only superadmin it enumerates as an active member is the isolated identity created above,
    // whose session we no longer need. Await it before cleanup() to avoid racing the isolated
    // session teardown. session.cleanup() then removes the isolated org+user using its OWN
    // bootstrap (shared-SA) options, which are not a member of testOrg and survive its deletion.
    await helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken);
    await session?.cleanup();
  });
});

const meGql = `
query {
  me {
    id
    name
    status
    organization {
      id
      guid
      status
      jsondata
    }
    authGroupIds
    authGroups {
      records {
        id
        name
        authClass
        parentGroups {
          records {
            id
            name
            description
          }
        }
        permissionSet{
          id
          name
          permissions
        }
        appRole {
          description
          permissions {
            records {
              id
              name
              __typename
            }
          }
        }
      }
    }
  }
}`;

const getOrgGQL = `
query getOrganization($orgName: String) {
  organizations(
    name: $orgName
    nameMatch: exact
  ) {
    records {
      id
      guid
      name
      rootFolder {
        id
        name
        description
      }
      users {
        records {
          name
          id
          organizationGuid
          organizationId
          authGroups {
            records {
              id
              name
              description
            }
          }
        }
      }
    }
  }
}`;

async function setupTestOrganization(client) {
  // set up organization and users
  const orgName = `${citestMarker}-org-${uuid.v4()}`;
  const createOrgGql = `mutation ($kvp: JSONData!, $apps: JSONData) {
    createOrganization (input: {
      name: "${orgName}"
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
      features: {
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
  const org = await client.query(createOrgGql, variables);
  const newOrgGuid = _.get(org, 'createOrganization.guid');
  const newOrgId = _.get(org, 'createOrganization.id');
  const jsondata = _.get(org, 'createOrganization.jsondata');

  // newFilePicker flag should be enabled in the new organization
  const useNewFilePickerFeature = _.get(
    org,
    'createOrganization.jsondata.features.newFilePicker'
  );
  expect(useNewFilePickerFeature).toEqual('enabled');

  // create admin + regular users
  const createAdminUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${citestMarker}-admin-user-${uuid.v4()}@localhost"
          organizationId: "${newOrgId}"
          firstName: "RBAC-User"
          lastName: "Admin"
          jsondata: {
            firstName: "RBAC-User"
            lastName: "Admin"
          }
          roleIds: [
            ${!isDesktopAppEnabled ? '"ddca9b68-d775-4934-8ffd-7aecc779b652"' : ''}# Admin
            "032218c3-d47e-4287-9d16-7bb867c01266", # Desktop
            "cf2ed945-176b-4dd9-943e-22fcb1cf684f"   # CMS Editor
          ]
        }
      )  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }`;

  await client.query(createAdminUser, {});

  const createRegularUser = `
        mutation createUser {
          createUser(
            input: {
              name: "${citestMarker}-regular-user-${uuid.v4()}@localhost"
              organizationId: "${newOrgId}"
              firstName: "RBAC-User"
              lastName: "Regular"
              jsondata: {
                firstName: "RBAC-User"
                lastName: "Regular"
              }
              roleIds: [
                "555033d1-508c-49c0-8127-66c2dc129828"   # CMS Viewer
              ]
            }
          )  {
            id
            name
            firstName
            lastName
            jsondata
          }
        }`;
  const regularUser = await client.query(createRegularUser);

  const createRestrictUsers = `
        mutation createUser {
          restrictUser: createUser(
            input: {
              name: "${citestMarker}-first-restrict-user-${uuid.v4()}@localhost"
              organizationId: "${newOrgId}"
              firstName: "RBAC-User"
              lastName: "Restrict Regular"
              jsondata: {
                firstName: "RBAC-User"
                lastName: "Restrict Regular"
              }
              roleIds: []
            }
          )  {
            id
            name
            firstName
            lastName
            jsondata
            authGroups {
              records {
                id
                name
                appRole {
                  id
                }
              }
            }
            roles {
              id
            }
          },
          secondRestrictUser: createUser(
            input: {
              name: "${citestMarker}-second-restrict-user-${uuid.v4()}@localhost"
              organizationId: "${newOrgId}"
              firstName: "RBAC-User"
              lastName: "Restrict Regular"
              jsondata: {
                firstName: "RBAC-User"
                lastName: "Restrict Regular"
              }
              roleIds: []
            }
          )  {
            id
            name
            firstName
            lastName
            jsondata
          }
        }`;
  const restrictedUsers = await client.query(createRestrictUsers);

  const roleIds = _.get(restrictedUsers, 'restrictUser.roles');
  expect(roleIds).toBeDefined();
  expect(roleIds).toEqual([]);
  const authGroupsOfRestrictUser = _.get(
    restrictedUsers,
    'restrictUser.authGroups.records',
    []
  );
  const appRolesAGs = _.filter(
    authGroupsOfRestrictUser,
    (ag) => !!_.get(ag, 'appRole.id')
  );
  expect(appRolesAGs.length).toEqual(0); // should not have any app roles since no roles assigned

  const createSecondRegularUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${citestMarker}-second-regular-user-${uuid.v4()}@localhost"
          organizationId: "${newOrgId}"
          firstName: "RBAC-User1"
          lastName: "Regular"
          jsondata: {
            firstName: "RBAC-User1"
            lastName: "Regular"
          }
          roleIds: [
            "555033d1-508c-49c0-8127-66c2dc129828"   # CMS Viewer
          ]
        }
      )  {
        id
        name
        firstName
        lastName
        jsondata
      }
  }`;
  const regularUser1 = await client.query(createSecondRegularUser);

  const result = await client.query(getOrgGQL, { orgName: orgName });

  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}
function extractPackageIdsFromResults(results, type = 'packages') {
  if (type === 'packages') {
    return _.map(_.get(results, 'packages.records'), 'id');
  } else {
    return _.map(_.get(results, 'packageGrants.records'), (r) =>
      _.get(r, 'package.id')
    );
  }
}

const getGrantedPackageIds = async (orgId, userOptions) => {
  const grantsQuery = `
    query {
      packageGrants(orgId: "${orgId}", limit: 1000) {
        records {
          package { id }
        }
      }
    }
  `;
  const grantsRes = await gqlClient.query(grantsQuery, {}, userOptions);
  return extractPackageIdsFromResults(grantsRes, 'grants');
};

const getPackagesByIds = async (ids, userOptions) => {
  const idList = ids.map((id) => `"${id}"`).join(', ');
  const packagesQuery = `
    query {
      packages(ids: [${idList}], limit: 1000) {
        records { id }
      }
    }
  `;
  const packagesRes = await gqlClient.query(packagesQuery, {}, userOptions);
  return extractPackageIdsFromResults(packagesRes, 'packages');
};

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    kvp: {
      features: {
        enableRBACFeature: 'enabled',
        enableRBACFeatureForSDO: 'enabled'
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
  },
  userInputs: [
    {
      key: 'adminUser',
      name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      key: 'regularUser',
      name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'restrictUser',
      name: `${citestMarker}-first-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    },
    {
      key: 'secondRestrictUser',
      name: `${citestMarker}-second-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    }
  ]
};
