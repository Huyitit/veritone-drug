import {
  createGraphqlClient,
  AuthType,
  GraphqlClient,
  buildRequestHeaders
} from '@api/src/graphqlUtil';
import {
  pollUntilReady,
  waitForAuthGroupMembershipByLogin
} from '@api/test/helpers/rbacPropagation';
import { v4 as uuidv4 } from 'uuid';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  OrganizationStatus,
  OrganizationType,
  RootFolderType,
  SchemaStatus
} from '@api/src/gql/gql';

const citestMarker = `citest-should-delete-sdo`;
const startDateTime =
  new Date(Date.now() - 2 * 60 * 60 * 1000).getTime() / 1000;
const stopDateTime = new Date(Date.now() - 1 * 60 * 60 * 1000).getTime() / 1000;
const testName = `${citestMarker}_userolpsdo_` + Date.now();
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

let adminRequestHeaders: Record<string, string>,
  firstRegularRequestHeaders: Record<string, string>,
  secondRegularRequestHeaders: Record<string, string>,
  firstRestrictRequestHeaders: Record<string, string>,
  secondRestrictRequestHeaders: Record<string, string>;
let orgId: string;
let userIds: string[] = [];
let adminUserInput;

describe('citest_structureddata: user olp sdo', () => {
  let gqlClient: GraphqlClient;
  let dataRegistryId: string, schemaId: string, sdoId: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // create organization
    const createOrgResult = await gqlClient.sdk.createOrganization({
      input: orgInput
    });

    orgId = createOrgResult?.data?.createOrganization?.id as string;
    expect(orgId).toBeDefined();

    // create admin user
    adminUserInput = getAdminUserInput();
    const createAdminUserResult = await gqlClient.sdk.createUser({
      input: {
        ...adminUserInput,
        organizationId: orgId
      }
    });
    expect(createAdminUserResult?.data?.createUser?.id).toBeDefined();

    adminRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: adminUserInput.name,
      password: adminUserInput.password
    });

    // create first regular user
    const createFirstRegularUserResult = await gqlClient.sdk.createUser({
      input: {
        ...firstRegularUserInput,
        organizationId: orgId
      }
    });
    expect(createFirstRegularUserResult?.data?.createUser?.id).toBeDefined();

    firstRegularRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: firstRegularUserInput.name,
      password: firstRegularUserInput.password
    });

    // create second regular user
    const createSecondRegularUserResult = await gqlClient.sdk.createUser({
      input: {
        ...secondRegularUserInput,
        organizationId: orgId
      }
    });
    expect(createSecondRegularUserResult?.data?.createUser?.id).toBeDefined();

    secondRegularRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: secondRegularUserInput.name,
      password: secondRegularUserInput.password
    });

    // create first restrict user
    const createFirstRestrictUserResult = await gqlClient.sdk.createUser({
      input: {
        ...firstRestrictUserInput,
        organizationId: orgId
      }
    });
    expect(createFirstRestrictUserResult?.data?.createUser?.id).toBeDefined();

    firstRestrictRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: firstRestrictUserInput.name,
      password: firstRestrictUserInput.password
    });

    // create second restrict user
    const createSecondRestrictUserResult = await gqlClient.sdk.createUser({
      input: {
        ...secondRestrictUserInput,
        organizationId: orgId
      }
    });
    expect(createSecondRestrictUserResult?.data?.createUser?.id).toBeDefined();

    secondRestrictRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: secondRestrictUserInput.name,
      password: secondRestrictUserInput.password
    });

    userIds.push(createAdminUserResult?.data?.createUser?.id as string);
    userIds.push(createFirstRegularUserResult?.data?.createUser?.id as string);
    userIds.push(createSecondRegularUserResult?.data?.createUser?.id as string);
    userIds.push(createFirstRestrictUserResult?.data?.createUser?.id as string);
    userIds.push(
      createSecondRestrictUserResult?.data?.createUser?.id as string
    );
  });

  // Setup resources
  it('creates a data registry', async () => {
    const result = await gqlClient.sdk.createDataRegistry(
      {
        input: {
          name: `${citestMarker}-test-data-registry-${uuidv4()}`,
          description: `${citestMarker}-test-data-registry-${uuidv4()}`,
          source: `${citestMarker}-test-data-registry-source-${uuidv4()}`
        }
      },
      adminRequestHeaders
    );

    dataRegistryId = result?.data?.createDataRegistry?.id as string;
    expect(dataRegistryId).toBeDefined();
    expect(result?.data?.createDataRegistry?.organizationId).toBe(orgId);
  });

  it('creates a schema', async () => {
    const result = await gqlClient.sdk.createSchema(
      {
        input: {
          id: uuidv4(),
          majorVersion: 1,
          minorVersion: 0,
          status: SchemaStatus.Published,
          dataRegistryId: dataRegistryId,
          definition: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      },
      adminRequestHeaders
    );

    schemaId = result?.data?.createSchema?.id as string;
    expect(schemaId).toBeDefined();
  });

  describe('Regular User Tests', () => {
    let cmsRootFolderId: string, newFolderId: string;
    let firstRegularUserSdoId1: string;
    it('get cms root folders', async () => {
      const result = await gqlClient.sdk.rootFolders(
        {
          rootFolderType: RootFolderType.Cms
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.rootFolders).toBeDefined();
      expect(result?.data?.rootFolders?.length).toBeGreaterThan(0);
      cmsRootFolderId = result?.data?.rootFolders?.[0]?.id as string;
    });

    it('create a folder', async () => {
      const result = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'test folder for regular user',
            parentId: cmsRootFolderId,
            rootFolderType: RootFolderType.Cms
          }
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.createFolder?.id).toBeDefined();
      newFolderId = result?.data?.createFolder?.id as string;
    });

    it('create a sdo', async () => {
      const result = await gqlClient.sdk.createStructuredData(
        {
          input: {
            schemaId: schemaId,
            data: {
              name: 'regular user test sdo 1'
            }
          }
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.createStructuredData?.id).toBeDefined();
      firstRegularUserSdoId1 = result?.data?.createStructuredData?.id as string;
    });

    it('get the created sdo', async () => {
      const result = await gqlClient.sdk.structuredData(
        {
          id: firstRegularUserSdoId1,
          schemaId: schemaId
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.structuredData?.id).toBeDefined();
      expect(result?.data?.structuredData?.id).toBe(firstRegularUserSdoId1);
      expect(result?.data?.structuredData?.schemaId).toBe(schemaId);
      expect(result?.data?.structuredData?.data?.name).toContain(
        'regular user test sdo 1'
      );
    });

    it('update the created sdo', async () => {
      const result = await gqlClient.sdk.createStructuredData(
        {
          input: {
            id: firstRegularUserSdoId1,
            schemaId: schemaId,
            data: { name: 'regular user test sdo 1 updated' }
          }
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.createStructuredData?.id).toBeDefined();
      expect(result?.data?.createStructuredData?.id).toBe(
        firstRegularUserSdoId1
      );
      expect(result?.data?.createStructuredData?.schemaId).toBe(schemaId);
      expect(result?.data?.createStructuredData?.data?.name).toContain(
        'regular user test sdo 1 updated'
      );
    });

    it('should get all sdos under a schema', async () => {
      const result = await gqlClient.sdk.schema(
        {
          id: schemaId
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.schema?.structuredDataObjects?.records?.length).toBe(
        1
      );
      expect(
        result?.data?.schema?.structuredDataObjects?.records?.[0]?.id
      ).toBe(firstRegularUserSdoId1);
    });

    describe('not RUD a private sdo from other users', () => {
      let RUDPermissionSetId: string;
      let privateSecondRegularUserSdoId1: string;
      let defaultAuthGroupIds: string[];
      beforeAll(async () => {
        let result: any;

        const meResult = await gqlClient.sdk.me({}, firstRegularRequestHeaders);
        expect(meResult?.data?.me?.id).toBeDefined();
        defaultAuthGroupIds = meResult?.data?.me?.authGroupIds ?? [];

        for (const authGroupId of defaultAuthGroupIds) {
          const deleteResult = await gqlClient.sdk.authGroupRemoveMembers(
            {
              id: authGroupId,
              memberIds: [userIds[1]]
            },
            adminRequestHeaders
          );
          expect(deleteResult?.data?.authGroupRemoveMembers?.id).toBe(
            authGroupId
          );
        }

        // Re-login until the session actually reflects the removal. Asserting a
        // denial against a session that still carries the old groups is what
        // made this suite flaky.
        firstRegularRequestHeaders = await waitForAuthGroupMembershipByLogin(
          gqlClient,
          {
            userName: firstRegularUserInput.name,
            password: firstRegularUserInput.password
          },
          { expectAbsent: defaultAuthGroupIds }
        );

        // create auth permission set
        result = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-RUD-sdo-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set-RUD-sdo`,
              permissions: [
                AuthPermissionType.AiwareSdoRead,
                AuthPermissionType.AiwareSdoUpdate,
                AuthPermissionType.AiwareSdoDelete
              ]
            }
          },
          adminRequestHeaders
        );
        expect(result?.data?.authPermissionSetCreate?.id).toBeDefined();
        RUDPermissionSetId = result?.data?.authPermissionSetCreate
          ?.id as string;
      });

      it('create a private sdo by second regular user', async () => {
        // second regular user create a private sdo by share with admin user
        const result = await gqlClient.sdk.createStructuredDataNestedMutation(
          {
            input: {
              schemaId: schemaId,
              data: {
                name: 'second regular user test sdo 1'
              }
            },
            entries: [
              {
                member: {
                  id: userIds[0], // admin user
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: RUDPermissionSetId
              }
            ]
          },
          secondRegularRequestHeaders
        );
        expect(result?.data?.createStructuredData?.id).toBeDefined();
        privateSecondRegularUserSdoId1 = result?.data?.createStructuredData
          ?.id as string;
      });

      it('can not get the private sdo by first regular user', async () => {
        await expect(
          gqlClient.sdk.structuredData(
            {
              id: privateSecondRegularUserSdoId1,
              schemaId: schemaId
            },
            firstRegularRequestHeaders
          )
        ).rejects.toMatchObject({
          response: {
            errors: [
              expect.objectContaining({
                message: expect.stringContaining('No authorization access role')
              })
            ]
          }
        });
      });

      it('can not update the private sdo by first regular user', async () => {
        await expect(
          gqlClient.sdk.createStructuredData(
            {
              input: {
                id: privateSecondRegularUserSdoId1,
                schemaId: schemaId,
                data: { name: 'second regular user test sdo 1 updated' }
              }
            },
            firstRegularRequestHeaders
          )
        ).rejects.toMatchObject({
          response: {
            errors: [
              expect.objectContaining({
                message: expect.stringContaining('No authorization access role')
              })
            ]
          }
        });
      });

      it('can not delete the private sdo by first regular user', async () => {
        await expect(
          gqlClient.sdk.deleteStructuredData(
            {
              input: {
                id: privateSecondRegularUserSdoId1,
                schemaId: schemaId
              }
            },
            firstRegularRequestHeaders
          )
        ).rejects.toMatchObject({
          response: {
            errors: [
              expect.objectContaining({
                message: expect.stringContaining('No authorization access role')
              })
            ]
          }
        });
      });

      afterAll(async () => {
        let deleteResult: any;
        // delete auth permission set
        if (RUDPermissionSetId) {
          deleteResult = await gqlClient.sdk.authPermissionSetDelete(
            {
              id: RUDPermissionSetId
            },
            adminRequestHeaders
          );
          expect(deleteResult?.data?.authPermissionSetDelete?.id).toBe(
            RUDPermissionSetId
          );
        }

        // delete private sdo
        if (privateSecondRegularUserSdoId1) {
          deleteResult = await gqlClient.sdk.deleteStructuredData(
            {
              input: {
                id: privateSecondRegularUserSdoId1,
                schemaId: schemaId
              }
            },
            adminRequestHeaders
          );
          expect(deleteResult?.data?.deleteStructuredData?.id).toBe(
            privateSecondRegularUserSdoId1
          );
        }

        // add default auth groups back to first regular user
        for (const authGroupId of defaultAuthGroupIds) {
          const addResult = await gqlClient.sdk.authGroupAddMembers(
            {
              id: authGroupId,
              members: [
                {
                  id: userIds[1],
                  memberType: AuthGroupMemberType.User
                }
              ]
            },
            adminRequestHeaders
          );
          expect(addResult?.data?.authGroupAddMembers?.id).toBe(authGroupId);
        }

        // The three tests that follow this describe block run as the first
        // regular user again, so the groups must be genuinely back before we
        // hand control over — not merely requested back.
        firstRegularRequestHeaders = await waitForAuthGroupMembershipByLogin(
          gqlClient,
          {
            userName: firstRegularUserInput.name,
            password: firstRegularUserInput.password
          },
          { expectPresent: defaultAuthGroupIds }
        );
      });
    });

    it('create folder content template with first regular user', async () => {
      const result = await gqlClient.sdk.createFolderContentTemplate(
        {
          input: {
            folderId: newFolderId,
            sdoId: firstRegularUserSdoId1,
            schemaId: schemaId
          }
        },
        firstRegularRequestHeaders
      );

      expect(result?.data?.createFolderContentTemplate?.id).toBeDefined();
      expect(result?.data?.createFolderContentTemplate?.sdoId).toBe(
        firstRegularUserSdoId1
      );
      expect(result?.data?.createFolderContentTemplate?.schemaId).toBe(
        schemaId
      );
    });

    it('get folder to verify folder content template with admin token', async () => {
      const result = await gqlClient.sdk.folder(
        {
          id: newFolderId
        },
        adminRequestHeaders
      );

      expect(result?.data?.folder?.id).toBeDefined();
      expect(result?.data?.folder?.contentTemplates?.[0]?.sdoId).toBe(
        firstRegularUserSdoId1
      );
      expect(result?.data?.folder?.contentTemplates?.[0]?.schemaId).toBe(
        schemaId
      );
    });

    it('delete structured data with admin token', async () => {
      const result = await gqlClient.sdk.deleteStructuredData(
        {
          input: {
            id: firstRegularUserSdoId1,
            schemaId: schemaId
          }
        },
        firstRegularRequestHeaders
      );

      expect(result?.data?.deleteStructuredData?.id).toBe(
        firstRegularUserSdoId1
      );
    });
  });

  describe('Restrict User Tests', () => {
    let defaultAuthGroupIds: string[];
    let RUDPermissionSetId: string;
    let privateSdo1: string;
    let publicSdo1: string;
    let cmsRootFolderId: string;
    let newFolderId: string;
    let folderUpdatePermissionSetId: string;
    let folderContentTemplateId: string;
    beforeAll(async () => {
      // login as first restrict user
      const result = await gqlClient.sdk.me({}, firstRestrictRequestHeaders);
      expect(result?.data?.me?.id).toBeDefined();
      defaultAuthGroupIds = result?.data?.me?.authGroupIds ?? [];

      // remove default auth groups from first restrict user and second restrict user
      for (const authGroupId of defaultAuthGroupIds) {
        const result = await gqlClient.sdk.authGroupRemoveMembers(
          {
            id: authGroupId,
            memberIds: [userIds[3], userIds[4]]
          },
          adminRequestHeaders
        );
        expect(result?.data?.authGroupRemoveMembers?.id).toBe(authGroupId);
      }

      // Both restrict users lose their groups in the same call, so both
      // sessions have to be confirmed clear before any assertion runs.
      firstRestrictRequestHeaders = await waitForAuthGroupMembershipByLogin(
        gqlClient,
        {
          userName: firstRestrictUserInput.name,
          password: firstRestrictUserInput.password
        },
        { expectAbsent: defaultAuthGroupIds }
      );

      secondRestrictRequestHeaders = await waitForAuthGroupMembershipByLogin(
        gqlClient,
        {
          userName: secondRestrictUserInput.name,
          password: secondRestrictUserInput.password
        },
        { expectAbsent: defaultAuthGroupIds }
      );

      // create auth permission set
      const permResult = await gqlClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-RUD-sdo-${uuidv4()}`,
            description: `${citestMarker}-auth-permission-set-RUD-sdo`,
            permissions: [
              AuthPermissionType.AiwareSdoRead,
              AuthPermissionType.AiwareSdoUpdate,
              AuthPermissionType.AiwareSdoDelete
            ]
          }
        },
        adminRequestHeaders
      );
      expect(permResult?.data?.authPermissionSetCreate?.id).toBeDefined();
      RUDPermissionSetId = permResult?.data?.authPermissionSetCreate
        ?.id as string;

      // get cms root folder
      const rootFolders = await gqlClient.sdk.rootFolders(
        {
          rootFolderType: RootFolderType.Cms
        },
        adminRequestHeaders
      );
      expect(rootFolders?.data?.rootFolders?.length).toBeGreaterThan(0);
      cmsRootFolderId = rootFolders?.data?.rootFolders?.[0]?.id as string;

      // create a folder
      const createFolderResult = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'test folder for restrict user',
            parentId: cmsRootFolderId,
            rootFolderType: RootFolderType.Cms
          }
        },
        adminRequestHeaders
      );
      expect(createFolderResult?.data?.createFolder?.id).toBeDefined();
      expect(createFolderResult?.data?.createFolder?.name).toContain(
        `${citestMarker}-folder`
      );
      newFolderId = createFolderResult?.data?.createFolder?.id as string;

      // add update folder permission to firs, second restrict user
      const addFolderPermissionResult =
        await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-folder-update-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set-folder-update`,
              permissions: [AuthPermissionType.AiwareFolderUpdate]
            }
          },
          adminRequestHeaders
        );
      expect(
        addFolderPermissionResult?.data?.authPermissionSetCreate?.id
      ).toBeDefined();
      folderUpdatePermissionSetId = addFolderPermissionResult?.data
        ?.authPermissionSetCreate?.id as string;

      const addFolderAcePermissionResult =
        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: userIds[4], // second restrict user
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: folderUpdatePermissionSetId
              },
              {
                member: {
                  id: userIds[3], // first restrict user
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: folderUpdatePermissionSetId
              }
            ]
          },
          adminRequestHeaders
        );
      expect(
        addFolderAcePermissionResult?.data?.addACEsToResources?.records?.length
      ).toBeGreaterThan(0);
    });

    it('create a private sdo by regular user share only with second restrict user', async () => {
      const result = await gqlClient.sdk.createStructuredDataNestedMutation(
        {
          input: {
            schemaId: schemaId,
            data: { name: 'regular user test sdo 1' }
          },
          entries: [
            {
              member: {
                id: userIds[4], // second restrict user
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: RUDPermissionSetId
            }
          ]
        },
        firstRegularRequestHeaders
      );
      expect(result?.data?.createStructuredData?.id).toBeDefined();
      privateSdo1 = result?.data?.createStructuredData?.id as string;
    });

    it('can not get the private sdo by first restrict user', async () => {
      await expect(
        gqlClient.sdk.structuredData(
          {
            id: privateSdo1,
            schemaId: schemaId
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    it('can not update the private sdo by first restrict user', async () => {
      await expect(
        gqlClient.sdk.createStructuredData(
          {
            input: {
              id: privateSdo1,
              schemaId: schemaId,
              data: { name: 'regular user test sdo 1 updated' }
            }
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    it('can not delete the private sdo by first restrict user', async () => {
      await expect(
        gqlClient.sdk.deleteStructuredData(
          {
            input: {
              id: privateSdo1,
              schemaId: schemaId
            }
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    it('can not create Folder Content Template with AIWARE_SDO_READ permission by first restrict user', async () => {
      await expect(
        gqlClient.sdk.createFolderContentTemplate(
          {
            input: {
              folderId: newFolderId,
              sdoId: privateSdo1,
              schemaId: schemaId
            }
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    it('can get the private sdo by second restrict user', async () => {
      // Unlike the membership waits above, what is settling here is the ACE
      // granted by the preceding test (`createStructuredData` with `entries`),
      // which is keyed on the resource rather than on this session — so poll
      // the read itself. It is side-effect free, safe to repeat.
      const result = await pollUntilReady(
        () =>
          gqlClient.sdk.structuredData(
            {
              id: privateSdo1,
              schemaId: schemaId
            },
            secondRestrictRequestHeaders
          ),
        (value) => value?.data?.structuredData?.id === privateSdo1
      );
      expect(result?.data?.structuredData?.id).toBe(privateSdo1);
    });

    xit('can update the private sdo by second restrict user', async () => {
      const result = await gqlClient.sdk.createStructuredData(
        {
          input: {
            id: privateSdo1,
            schemaId: schemaId,
            data: { name: 'regular user test sdo 1 updated' }
          }
        },
        secondRestrictRequestHeaders
      );
      expect(result?.data?.createStructuredData?.id).toBe(privateSdo1);
      expect(result?.data?.createStructuredData?.data?.name).toBe(
        'regular user test sdo 1 updated'
      );
    });
    it('can create Folder Content Template with AIWARE_SDO_READ permission by second restrict user', async () => {
      const result = await gqlClient.sdk.createFolderContentTemplate(
        {
          input: {
            folderId: newFolderId,
            sdoId: privateSdo1,
            schemaId: schemaId
          }
        },
        secondRestrictRequestHeaders
      );
      expect(result?.data?.createFolderContentTemplate?.id).toBeDefined();
      folderContentTemplateId = result?.data?.createFolderContentTemplate
        ?.id as string;
    });

    it('can delete the private sdo by second restrict user', async () => {
      const result = await gqlClient.sdk.deleteStructuredData(
        {
          input: {
            id: privateSdo1,
            schemaId: schemaId
          }
        },
        secondRestrictRequestHeaders
      );
      expect(result?.data?.deleteStructuredData?.id).toBe(privateSdo1);
    });

    it('create a public sdo by admin user', async () => {
      const result = await gqlClient.sdk.createStructuredData(
        {
          input: {
            schemaId: schemaId,
            data: { name: 'public sdo 1' }
          }
        },
        adminRequestHeaders
      );
      expect(result?.data?.createStructuredData?.id).toBeDefined();
      publicSdo1 = result?.data?.createStructuredData?.id as string;
    });

    it('can not get the public sdo by first restrict user', async () => {
      await expect(
        gqlClient.sdk.structuredData(
          {
            id: publicSdo1,
            schemaId: schemaId
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    it('can not update the public sdo by first restrict user', async () => {
      await expect(
        gqlClient.sdk.createStructuredData(
          {
            input: {
              id: publicSdo1,
              schemaId: schemaId,
              data: { name: 'public sdo 1 updated' }
            }
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    it('can not delete the public sdo by first restrict user', async () => {
      await expect(
        gqlClient.sdk.deleteStructuredData(
          {
            input: {
              id: publicSdo1,
              schemaId: schemaId
            }
          },
          firstRestrictRequestHeaders
        )
      ).rejects.toMatchObject({
        response: {
          errors: [
            expect.objectContaining({
              message: expect.stringContaining('No authorization access role')
            })
          ]
        }
      });
    });

    afterAll(async () => {
      let deleteResult: any;
      // delete auth permission set
      if (RUDPermissionSetId) {
        deleteResult = await gqlClient.sdk.authPermissionSetDelete(
          {
            id: RUDPermissionSetId
          },
          adminRequestHeaders
        );
        expect(deleteResult?.data?.authPermissionSetDelete?.id).toBe(
          RUDPermissionSetId
        );
      }

      if (folderUpdatePermissionSetId) {
        deleteResult = await gqlClient.sdk.authPermissionSetDelete(
          {
            id: folderUpdatePermissionSetId
          },
          adminRequestHeaders
        );
        expect(deleteResult?.data?.authPermissionSetDelete?.id).toBe(
          folderUpdatePermissionSetId
        );
      }

      // delete folder
      if (newFolderId) {
        deleteResult = await gqlClient.sdk.deleteFolder(
          {
            input: {
              id: newFolderId,
              orderIndex: 0
            }
          },
          adminRequestHeaders
        );
        expect(deleteResult?.data?.deleteFolder?.id).toBe(newFolderId);
      }

      // delete public sdo
      if (publicSdo1) {
        deleteResult = await gqlClient.sdk.deleteStructuredData(
          {
            input: {
              id: publicSdo1,
              schemaId: schemaId
            }
          },
          adminRequestHeaders
        );
        expect(deleteResult?.data?.deleteStructuredData?.id).toBe(publicSdo1);
      }

      // add default auth groups to first restrict user and second restrict user back
      for (const authGroupId of defaultAuthGroupIds) {
        const result = await gqlClient.sdk.authGroupAddMembers(
          {
            id: authGroupId,
            members: [
              {
                id: userIds[3], // first restrict user
                memberType: AuthGroupMemberType.User
              },
              {
                id: userIds[4], // second restrict user
                memberType: AuthGroupMemberType.User
              }
            ]
          },
          adminRequestHeaders
        );
        expect(result?.data?.authGroupAddMembers?.id).toBe(authGroupId);
      }
    });
  });

  afterAll(async () => {
    let deleteResult: any;

    // delete users
    if (userIds.length > 0) {
      for (const userId of userIds) {
        deleteResult = await gqlClient.sdk.deleteUser({
          id: userId
        });
        expect(deleteResult?.data?.deleteUser?.id).toBe(userId);
      }
    }

    // delete org
    if (orgId) {
      deleteResult = await gqlClient.sdk.updateOrganization({
        input: {
          id: orgId,
          status: OrganizationStatus.Deleted
        }
      });

      expect(deleteResult?.data?.updateOrganization?.id).toBe(orgId);
      expect(deleteResult?.data?.updateOrganization?.status).toBe(
        OrganizationStatus.Deleted
      );
    }
  });
});

const orgInput = {
  name: citestMarker + '-org-olp-sdo-' + uuidv4(),
  businessUnit: 'Legal',
  types: [OrganizationType.Agency, OrganizationType.Broadcaster],
  metadata: {
    features: {
      automaticPackageCreation: 'enabled',
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
};

function getAdminUserInput() {
  return {
    name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
    password: 'testPassword',
    roleIds: [
      isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
      '032218c3-d47e-4287-9d16-7bb867c01266',
      '6d982ee9-ff07-499f-a182-03457a6187f6',
      '3577dfc6-f441-41f9-8dab-ef9079530450',
      '912e377e-f4a4-4184-8db1-baa9670d8081'
    ].filter((roleId) => roleId)
  };
}

const firstRegularUserInput = {
  name: `${citestMarker}-first-regular-user-${uuidv4()}@localhost`,
  password: 'testPassword',
  roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
};

const secondRegularUserInput = {
  name: `${citestMarker}-second-regular-user-${uuidv4()}@localhost`,
  password: 'testPassword',
  roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
};

const firstRestrictUserInput = {
  name: `${citestMarker}-first-restrict-user-${uuidv4()}@localhost`,
  password: 'testPassword',
  roleIds: []
};

const secondRestrictUserInput = {
  name: `${citestMarker}-second-restrict-user-${uuidv4()}@localhost`,
  password: 'testPassword',
  roleIds: []
};
