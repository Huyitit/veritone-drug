import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '../../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import { safe } from '../../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../../helpers/superadminSession';
import { setupTestOrgAndUser } from '../../helpers/organization.helper';
import {
  OrganizationType,
  RootFolderType,
  SchemaStatus,
  AuthResourceType,
  AuthGroupMemberType,
  AuthPermissionType,
  AuthObjectClass
} from '../../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

describe('citest_structureddata: rbac Admin', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superClient: GraphqlClient;
  let superUserId: string;

  let testSetup: any;
  let testOrg: any;
  let useRBACFeature: boolean;

  let adminUser: any, adminOptions: Record<string, string> | undefined;
  let firstRegularUser: any;
  let secondRegularUser: any,
    secondRegularUserOptions: Record<string, string> | undefined;

  let createACESforSDO: any[];
  let createdSchemaId: string;

  let createdSDOId: string | undefined;
  let createdSchemaIdForSDOOperation: string | undefined;

  async function createStructuredDataWithAces(
    options: Record<string, string> | undefined,
    input: {
      schemaId: string;
      data?: any;
      addAcesEntries: Array<{
        member: { id: string; memberType: string };
        permissionSetID: string;
      }>;
    }
  ): Promise<any> {
    const { addAcesEntries, ...basicInput } = input;
    const entriesString = addAcesEntries.reduce((query, record) => {
      return (
        query +
        `
          {
            member: {
              id: "${record.member.id}"
              memberType: ${record.member.memberType}
            }
            permissionSetID: "${record.permissionSetID}"
          },`
      );
    }, ``);

    const query = `mutation createSDO ($id: ID, $schemaId: ID!, $data: JSONData, $dataString: String){
      createStructuredData(
        input: {
          id: $id
          data: $data
          schemaId: $schemaId
          dataString: $dataString
        }
      ) {
        id
        data
        schemaId
        modifiedDateTime
        createdDateTime
        addACEs(entries: [${entriesString}]) {
          records {
            id
            objectID
            objectType
          }
          count
        }
      }
    }`;
    return superClient.query(query, basicInput, options);
  }

  async function createCmsFolderFlow(
    options: Record<string, string> | undefined,
    marker: string
  ): Promise<string> {
    const rootFoldersRes = await superClient.sdk.rootFolders(
      { rootFolderType: RootFolderType.Cms },
      options
    );
    const rootFolders = rootFoldersRes.data.rootFolders ?? [];
    let cmsRootFolderId: string;

    if (rootFolders.length > 0) {
      cmsRootFolderId = rootFolders[0]!.id;
    } else {
      const createRootFolderRes = await superClient.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        options
      );
      const createdRootFolders =
        createRootFolderRes.data.createRootFolders ?? [];
      cmsRootFolderId = createdRootFolders[1]!.treeObjectId!;
    }

    const folderRes = await superClient.sdk.createFolder(
      {
        input: {
          name: `${marker}-folder-${uuidv4()}`,
          description: 'test folder for rbac created by admin user',
          parentId: cmsRootFolderId,
          rootFolderType: RootFolderType.Cms
        }
      },
      options
    );

    return folderRes.data.createFolder!.id;
  }

  beforeAll(async () => {
    const env = config.env;

    // T22: Provision a brand-new superadmin in its own isolated org for
    // every run, rather than reusing the shared bootstrap session (an admin
    // MEMBER of every org it creates). This suite's own teardown deleting
    // testOrg would otherwise enumerate the shared superadmin's membership
    // and kill its session GLOBALLY — the T14/T15/T16 defect.
    // createIsolatedSuperadmin's throwaway org has no such membership problem.
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    superClient = isolatedSuperadmin.client;

    const introspectionRes: any = await superClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);
    useRBACFeature = _.has(introspectionRes, '__type.name');

    const meRes: any = await superClient.sdk.meBasic();
    expect(meRes.data.me).toBeDefined();
    superUserId = _.get(meRes, 'data.me.id');

    testSetup = await setupTestOrgAndUser(superClient, createOrgAndUserInput);

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    const testUsers = _.get(testOrg, 'users.records');
    // test users + superadmin who created the org
    expect(testUsers.length).toEqual(4);

    const listOptions = testSetup.listOptions ?? [];
    const findUser = (marker: string) =>
      listOptions.find((u: any) => u.userName?.includes(marker));

    adminUser = findUser('-admin-user-');
    adminOptions = adminUser?.requestOptions;

    firstRegularUser = findUser('-first-regular-user-');

    secondRegularUser = findUser('-second-regular-user-');
    secondRegularUserOptions = secondRegularUser?.requestOptions;
  });

  describe('Object operations', () => {
    describe('with Admin user', () => {
      let dataRegistryId: string;
      let schemaId: string;
      let sdoId1: string;
      let newFolderId: string;
      let contentTemplateId1: string;

      beforeAll(async () => {
        const res: any = await superClient.sdk.meBasic({}, adminOptions);
        expect(_.get(res, 'data.me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });

      it('should create data registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createDataRegistry(
          {
            input: {
              id: uuidv4(),
              name: `${citestMarker}-data-registry-${uuidv4()}`,
              description:
                'test data registry for rbac auth group and permission set operations',
              source: 'citest-source'
            }
          },
          adminOptions
        );
        expect(res.data.createDataRegistry).toBeDefined();
        expect(res.data.createDataRegistry?.name).toContain(
          `${citestMarker}-data-registry`
        );
        dataRegistryId = res.data.createDataRegistry!.id;
      });

      it('should create schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createSchema(
          {
            input: {
              id: uuidv4(),
              dataRegistryId,
              majorVersion: 1,
              minorVersion: 0,
              status: SchemaStatus.Draft,
              definition: {
                type: 'object',
                properties: { name: { type: 'string' } }
              }
            }
          },
          adminOptions
        );

        expect(res.data.createSchema).toBeDefined();
        expect(res.data.createSchema?.id).toBeDefined();
        schemaId = res.data.createSchema!.id;
      });

      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.updateSchemaState(
          { input: { id: schemaId, status: SchemaStatus.Published } },
          adminOptions
        );

        expect(res.data.updateSchemaState).toBeDefined();
        expect(res.data.updateSchemaState?.id).toBeDefined();
        expect(res.data.updateSchemaState?.status).toEqual(
          SchemaStatus.Published
        );
      });

      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createStructuredData(
          { input: { schemaId, data: { name: 'admin user test SDO 1' } } },
          adminOptions
        );

        sdoId1 = res.data.createStructuredData!.id;
        expect(res.data.createStructuredData).toBeDefined();
        expect(res.data.createStructuredData?.data?.name).toContain(
          `admin user test SDO 1`
        );
        expect(res.data.createStructuredData?.schemaId).toEqual(schemaId);
      });

      it('should read the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.structuredData(
          { id: sdoId1, schemaId },
          adminOptions
        );

        expect(res.data.structuredData?.id).toBeDefined();
        expect(res.data.structuredData?.schemaId).toEqual(schemaId);
        expect(res.data.structuredData?.data?.name).toContain(
          `admin user test SDO 1`
        );
      });

      it('should update the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createStructuredData(
          {
            input: {
              id: sdoId1,
              schemaId,
              data: { name: 'admin user test SDO 1 updated' }
            }
          },
          adminOptions
        );

        expect(res.data.createStructuredData).toBeDefined();
        expect(res.data.createStructuredData?.data?.name).toContain(
          `admin user test SDO 1 updated`
        );
        expect(res.data.createStructuredData?.schemaId).toEqual(schemaId);
      });

      it('should update the created SDO using updateStructuredData mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res: any = await superClient.sdk.updateStructuredData(
          {
            input: {
              id: sdoId1,
              schemaId,
              data: { name: 'admin user test SDO 1 updated by admin' }
            }
          },
          adminOptions
        );

        const updateStructuredDataResult = _.get(
          res,
          'data.updateStructuredData'
        );
        expect(updateStructuredDataResult).toBeDefined();
        expect(updateStructuredDataResult.data.name).toContain(
          `admin user test SDO 1 updated by admin`
        );
        expect(updateStructuredDataResult.schemaId).toEqual(schemaId);
        expect(updateStructuredDataResult.id).toEqual(sdoId1);
      });

      it('should failed when using updating structured date mutation with non-exist SDOId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        await expect(
          superClient.sdk.updateStructuredData(
            {
              input: {
                id: uuidv4(),
                schemaId,
                data: { name: 'admin user test SDO 1 updated by admin' }
              }
            },
            adminOptions
          )
        ).rejects.toThrow(/Structured data object not found/);
      });

      it('should create a new SDO with non-exist SDOId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createStructuredData(
          {
            input: {
              id: uuidv4(),
              schemaId,
              data: { name: 'admin user test SDO 1 created by admin' }
            }
          },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(res.data.createStructuredData).toBeDefined();
        expect(res.data.createStructuredData?.data?.name).toContain(
          `admin user test SDO 1 created by admin`
        );
        expect(res.data.createStructuredData?.schemaId).toEqual(schemaId);
        expect(res.data.createStructuredData?.id).toBeDefined();
        const newSDOId = res.data.createStructuredData!.id;

        const deleteRes = await superClient.sdk.deleteStructuredData(
          { input: { id: newSDOId, schemaId } },
          adminOptions
        );

        expect(deleteRes).toBeDefined();
        expect(deleteRes.data.deleteStructuredData).toBeDefined();
        expect(deleteRes.data.deleteStructuredData?.id).toEqual(newSDOId);
      });

      describe('should RUD private SDO', () => {
        let permSetId: string;
        let privateSDOId: string;

        it('should create a private SDO', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          const permSetResult = await superClient.sdk.authPermissionSetCreate(
            {
              input: {
                name: `${citestMarker}-auth-permission-set-read-sdo-${uuidv4()}`,
                description: `${citestMarker}-auth-permission-set-read-sdo`,
                permissions: [AuthPermissionType.AiwareSdoRead]
              }
            },
            adminOptions
          );
          expect(permSetResult).toBeDefined();
          permSetId = permSetResult.data.authPermissionSetCreate!.id;
          expect(permSetId).toBeDefined();

          const res: any = await createStructuredDataWithAces(
            firstRegularUser?.requestOptions,
            {
              schemaId,
              data: { name: 'first regular user test SDO 1' },
              addAcesEntries: [
                {
                  member: { id: secondRegularUser.userId, memberType: 'User' },
                  permissionSetID: permSetId
                }
              ]
            }
          );
          expect(res).toBeDefined();
          expect(_.get(res, 'createStructuredData')).toBeDefined();
          expect(_.get(res, 'createStructuredData.data.name')).toContain(
            `first regular user test SDO 1`
          );
          expect(_.get(res, 'createStructuredData.schemaId')).toEqual(schemaId);
          privateSDOId = _.get(res, 'createStructuredData.id');
        });

        it('should read the private SDO by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          const res = await superClient.sdk.structuredData(
            { id: privateSDOId, schemaId },
            adminOptions
          );
          expect(res).toBeDefined();
          expect(res.data.structuredData).toBeDefined();
          expect(res.data.structuredData?.id).toEqual(privateSDOId);
        });

        it('should update the private SDO by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }
          const res = await superClient.sdk.createStructuredData(
            {
              input: {
                id: privateSDOId,
                schemaId,
                data: {
                  name: 'first regular user test SDO 1 updated by admin'
                }
              }
            },
            adminOptions
          );

          expect(res.data.createStructuredData).toBeDefined();
          expect(res.data.createStructuredData?.data?.name).toContain(
            `first regular user test SDO 1 updated by admin`
          );
          expect(res.data.createStructuredData?.schemaId).toEqual(schemaId);
          expect(res.data.createStructuredData?.id).toEqual(privateSDOId);
        });

        it('should delete the private SDO by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }
          const res = await superClient.sdk.deleteStructuredData(
            { input: { id: privateSDOId, schemaId } },
            adminOptions
          );
          expect(res).toBeDefined();
          expect(res.data.deleteStructuredData).toBeDefined();
          expect(res.data.deleteStructuredData?.id).toEqual(privateSDOId);
        });
      });

      it('should read existing SDO via query Schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const query = `query getSchema($id: ID!) {
          schema(id: $id) {
            id status createdDateTime modifiedDateTime dataRegistryId definition validActions
            dataRegistry { id publishedSchema { id } }
            structuredDataObjects(limit: 10, offset: 0) { records { id } }
          }
        }`;
        const res: any = await superClient.query(
          query,
          { id: schemaId },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(_.get(res, 'schema')).toBeDefined();
        expect(_.get(res, 'schema.id')).toEqual(schemaId);
        expect(_.get(res, 'schema.structuredDataObjects')).toBeDefined();
        expect(
          _.get(res, 'schema.structuredDataObjects.records')
        ).toBeDefined();
        expect(
          _.get(res, 'schema.structuredDataObjects.records.length')
        ).toEqual(1);
        expect(
          _.get(res, 'schema.structuredDataObjects.records[0].id')
        ).toEqual(sdoId1);
      });

      it('should create folder content template', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        newFolderId = await createCmsFolderFlow(adminOptions, citestMarker);

        const res = await superClient.sdk.createFolderContentTemplate(
          { input: { folderId: newFolderId, sdoId: sdoId1, schemaId } },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(res.data.createFolderContentTemplate).toBeDefined();
        expect(res.data.createFolderContentTemplate?.id).toBeDefined();
        contentTemplateId1 = res.data.createFolderContentTemplate!.id;
        expect(res.data.createFolderContentTemplate?.sdoId).toEqual(sdoId1);
        expect(res.data.createFolderContentTemplate?.schemaId).toEqual(
          schemaId
        );
        newFolderId = res.data.createFolderContentTemplate!.folderId;
      });

      it('should update folder content template', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.updateFolderContentTemplate(
          {
            input: { id: contentTemplateId1, sdoId: sdoId1, schemaId }
          },
          adminOptions
        );
        expect(res).toBeDefined();
        const updateFolderContentTemplate =
          res.data.updateFolderContentTemplate;
        expect(updateFolderContentTemplate).toBeDefined();
        expect(updateFolderContentTemplate?.id).toBeDefined();
        expect(updateFolderContentTemplate?.id).toEqual(contentTemplateId1);
        expect(updateFolderContentTemplate?.sdoId).toEqual(sdoId1);
      });

      it('should query folder to get folder content template', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.folder(
          { id: newFolderId },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(res.data.folder).toBeDefined();
        expect(res.data.folder?.id).toBeDefined();
        expect(res.data.folder?.contentTemplates).toBeDefined();
        expect(res.data.folder?.contentTemplates?.length).toEqual(1);
        expect(res.data.folder?.contentTemplates?.[0]?.id).toEqual(
          contentTemplateId1
        );
        expect(res.data.folder?.contentTemplates?.[0]?.sdoId).toEqual(sdoId1);
        expect(res.data.folder?.contentTemplates?.[0]?.schemaId).toEqual(
          schemaId
        );
      });

      it('should create TDO with content template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726755,
              contentTemplates: [{ sdoId: sdoId1, schemaId }]
            }
          },
          adminOptions
        );
        expect(res.data.createTDO).toBeDefined();
        expect(res.data.createTDO?.id).toBeDefined();
      });

      it('should delete the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.deleteStructuredData(
          { input: { id: sdoId1, schemaId } },
          adminOptions
        );

        expect(res.data.deleteStructuredData).toBeDefined();
        expect(res.data.deleteStructuredData?.id).toEqual(sdoId1);
      });
    });
  });

  describe('RBAC Auth Group and Permission Set Operations', () => {
    describe('with Admin user', () => {
      let sdoId2: string;
      let newAuthGroup: any;
      let newAuthPermissionSet: any;
      let cmsRootFolderId: string;
      let dataRegistryId: string;

      beforeAll(async () => {
        const res = await superClient.sdk.authGroups(
          { nameRegex: testOrg.name },
          adminOptions
        );
        const authGroups = res.data.authGroups?.records ?? [];
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        // the default groups for the organization will include superadmin who created it.
        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = g?.members?.records ?? [];
          hasSuperAdminMember = _.some(
            users,
            (u: any) => _.get(u, 'member.id', '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        const permSetsRes = await superClient.sdk.authPermissionSets(
          { nameRegex: 'aiWARE', authClass: [AuthObjectClass.System] },
          adminOptions
        );
        expect(permSetsRes.data.authPermissionSets?.records?.length).toEqual(4);

        const rootFoldersRes = await superClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rootFoldersRes.data.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('Root Folder');
        cmsRootFolderId = rootFolders[0]!.id;
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`
            }
          },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(res.data.authGroupCreate?.name).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = res.data.authGroupCreate;
      });

      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareSdoCreate,
                AuthPermissionType.AiwareSdoDelete,
                AuthPermissionType.AiwareSdoRead,
                AuthPermissionType.AiwareSdoUpdate
              ]
            }
          },
          adminOptions
        );
        expect(res.data.authPermissionSetCreate).toBeDefined();
        expect(res.data.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = res.data.authPermissionSetCreate;
      });

      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createDataRegistry(
          {
            input: {
              name: `${citestMarker}-data-registry-${uuidv4()}`,
              description:
                'test data registry for rbac auth group and permission set operations',
              source: 'citest-source'
            }
          },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(res.data.createDataRegistry).toBeDefined();
        expect(res.data.createDataRegistry?.name).toContain(
          `${citestMarker}-data-registry`
        );
        dataRegistryId = res.data.createDataRegistry!.id;
      });

      it('should create Schema and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createSchema(
          {
            input: {
              id: uuidv4(),
              dataRegistryId,
              majorVersion: 1,
              minorVersion: 0,
              status: SchemaStatus.Draft,
              definition: {
                type: 'object',
                properties: { name: { type: 'string' } }
              }
            }
          },
          adminOptions
        );
        expect(res).toBeDefined();
        expect(res.data.createSchema).toBeDefined();
        expect(res.data.createSchema?.id).toBeDefined();
        createdSchemaId = res.data.createSchema!.id;

        const aceRes = await superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.SdoSchema,
            ids: [createdSchemaId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );

        const acl = aceRes.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(createdSchemaId) &&
              ace!.id.includes(newAuthGroup.id) &&
              ace!.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });

      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        expect(createdSchemaId).toBeDefined();

        const res = await superClient.sdk.updateSchemaState(
          { input: { id: createdSchemaId, status: SchemaStatus.Published } },
          adminOptions
        );

        expect(res.data.updateSchemaState).toBeDefined();
        expect(res.data.updateSchemaState?.id).toBeDefined();
        expect(res.data.updateSchemaState?.status).toEqual(
          SchemaStatus.Published
        );
      });

      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.createStructuredData(
          {
            input: {
              schemaId: createdSchemaId,
              data: { name: 'admin user test SDO 2' }
            }
          },
          adminOptions
        );

        sdoId2 = res.data.createStructuredData!.id;
        expect(res.data.createStructuredData).toBeDefined();
        expect(res.data.createStructuredData?.data?.name).toContain(
          `admin user test SDO 2`
        );
        expect(res.data.createStructuredData?.schemaId).toEqual(
          createdSchemaId
        );
      });

      it('should add ACEs on SDO using addACEToResources', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(sdoId2).toBeDefined();

        const res = await superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Sdo,
            ids: [sdoId2],
            resourceTypeSchemaId: createdSchemaId,
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        createACESforSDO = res.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of createACESforSDO) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(sdoId2) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });

      it('should throw error when add ACEs on SDO using addACEToResources with invalid schemaId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(sdoId2).toBeDefined();

        let error: any;
        const req = superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Sdo,
            ids: [sdoId2],
            resourceTypeSchemaId: dataRegistryId, // invalid schemaId, should be createdSchemaId instead dataRegistryId
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        await expect(req).rejects.toThrow('The requested object was not found');
      });

      it('should remove ACEs from an SDO using removeACEsFromResource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(sdoId2).toBeDefined();
        expect(createACESforSDO).toBeDefined();
        const aceCount = createACESforSDO.length;
        expect(aceCount).toBeGreaterThan(0);
        const aceId = createACESforSDO[0].id;

        const res: any = await superClient.sdk.removeACEsFromResource(
          {
            resourceType: AuthResourceType.Sdo,
            ids: [aceId],
            resourceTypeSchemaId: createdSchemaId
          },
          adminOptions
        );
        const aces = _.get(res, 'data.removeACEsFromResource.records');
        expect(aces).toBeDefined();
        expect(aces.length).toEqual(aceCount - 1);
      });

      it('should throw error when remove ACEs from an SDO using removeACEsFromResource with invalid schemaId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(sdoId2).toBeDefined();
        expect(createACESforSDO).toBeDefined();
        const aceCount = createACESforSDO.length;
        expect(aceCount).toBeGreaterThan(0);
        const aceId = createACESforSDO[0].id;

        const req = superClient.sdk.removeACEsFromResource(
          {
            ids: [aceId],
            resourceType: AuthResourceType.Sdo,
            resourceTypeSchemaId: dataRegistryId
          },
          adminOptions
        );

        await expect(req).rejects.toThrow('The requested object was not found');
      });

      it('should create SDO without addACEs and add default ACEs automatically', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        const res = await superClient.sdk.createStructuredData(
          {
            input: { schemaId: createdSchemaId, data: { name: 'citest-sdo' } }
          },
          adminOptions
        );

        expect(res.data.createStructuredData).toBeDefined();
        expect(res.data.createStructuredData?.data?.name).toContain(
          `citest-sdo`
        );

        const newSDOId = res.data.createStructuredData!.id;

        const getResourcesACL = await superClient.sdk.GetResourcesACL(
          { resourceType: AuthResourceType.Sdo, ids: [newSDOId] },
          adminOptions
        );

        const resourcesACL = getResourcesACL.data.getACLForResources;
        expect(resourcesACL?.records).toBeDefined();
        expect(resourcesACL?.records?.[0]?.id).toContain(newSDOId);

        // 1 owner ACE + 2 default ACEs (orgAdmin + aiWARE Full Access && orgUsers + aiWARE Read Only)
        expect(resourcesACL?.records?.length).toEqual(3);
      });

      it('should create SDO with addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        const res: any = await createStructuredDataWithAces(adminOptions, {
          schemaId: createdSchemaId,
          data: { name: 'citest-sdo' },
          addAcesEntries: [
            {
              member: { id: newAuthGroup.id, memberType: 'Group' },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        });

        expect(_.get(res, 'createStructuredData')).toBeDefined();
        expect(_.get(res, 'createStructuredData.data.name')).toContain(
          `citest-sdo`
        );
        const newSDOId = _.get(res, 'createStructuredData.id');
        const acl = _.get(res, 'createStructuredData.addACEs.records', []);
        let checkGroupAdded = false;
        for (const ace of acl) {
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

        const res = await superClient.sdk.structuredDataObjects(
          { schemaId: createdSchemaId, offset: 0, limit: 50 },
          adminOptions
        );

        const SDOs = res.data.structuredDataObjects?.records ?? [];
        expect(SDOs.length).toBeGreaterThanOrEqual(2);
        let deletedCount = 0;
        for (const sdo of SDOs) {
          deletedCount++;
          await superClient.sdk.deleteStructuredData(
            { input: { id: sdo!.id, schemaId: createdSchemaId } },
            adminOptions
          );

          const aclRes = await superClient.sdk.GetResourcesACL(
            {
              ids: [sdo!.id],
              resourceType: AuthResourceType.Sdo,
              ownerOrganization: testOrg.guid
            },
            adminOptions
          );

          const sdoACL = aclRes.data.getACLForResources?.records ?? [];
          expect(sdoACL.length).toEqual(0);
        }
        expect(deletedCount).toBeGreaterThanOrEqual(2);
      });

      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const authGroupsRes = await superClient.sdk.authGroups(
          {},
          adminOptions
        );
        const authGroups = authGroupsRes.data.authGroups?.records ?? [];
        for (const g of authGroups) {
          let error: any;
          try {
            await superClient.sdk.authGroupDelete({ id: g!.id }, adminOptions);
          } catch (e) {
            error = e;
          }
          if (g!.name?.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }

        const authGroupsDataRes = await superClient.sdk.authGroups(
          {},
          adminOptions
        );
        expect(
          authGroupsDataRes.data.authGroups?.records?.length
        ).toBeGreaterThanOrEqual(2);
      });

      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permissionSetsRes = await superClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permissionSets =
          permissionSetsRes.data.authPermissionSets?.records ?? [];
        for (const ps of permissionSets) {
          await superClient.sdk.authPermissionSetDelete(
            { id: ps!.id },
            adminOptions
          );
        }

        const permissionRes = await superClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        expect(permissionRes.data.authPermissionSets?.records?.length).toEqual(
          0
        );
      });
    });
  });

  afterAll(async () => {
    if (createdSDOId && createdSchemaIdForSDOOperation) {
      await safe('delete SDO', () =>
        superClient.sdk.deleteStructuredData(
          {
            input: {
              id: createdSDOId!,
              schemaId: createdSchemaIdForSDOOperation!
            }
          },
          adminOptions
        )
      );

      await safe('delete schema', () =>
        superClient.sdk.updateSchemaState(
          {
            input: {
              id: createdSchemaIdForSDOOperation!,
              status: SchemaStatus.Deleted
            }
          },
          adminOptions
        )
      );

      await safe('verify SDO ACL cleanup', () =>
        superClient.sdk.GetResourcesACL(
          { ids: [createdSDOId!], resourceType: AuthResourceType.Sdo },
          adminOptions
        )
      );
    }

    if (testSetup?.listOptions?.length) {
      await safe('delete users', async () => {
        for (const user of testSetup.listOptions) {
          await superClient.sdk.deleteUser({ id: user.userId });
        }
      });
    }

    if (testOrg?.id) {
      await safe('delete organization', () =>
        helpers.deleteOrganization(
          superClient.authUrl,
          testOrg.id,
          isolatedSuperadmin.token
        )
      );
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });
});

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuidv4(),
    businessUnit: 'Legal',
    types: [OrganizationType.Agency, OrganizationType.Broadcaster],
    adminSeatLimit: null,
    metadata: {
      features: {
        enableRBACFeature: 'enabled',
        enableRBACFeatureForSDO: 'enabled'
      }
    },
    applications: [
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
      name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      name: `${citestMarker}-first-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      name: `${citestMarker}-second-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    }
  ]
};
