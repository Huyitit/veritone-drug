import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { OrganizationStatus, RootFolderType, SearchIndex } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const orgNamePrefix = `${citestMarker}-folderv2-citest-org`;

const describeif = (condition: any, title: string, fn: () => void) =>
  condition ? describe(title, fn) : describe.skip(title, fn);

async function moveFolderRaw(
  client: GraphqlClient,
  input: Record<string, any>,
  options: any
): Promise<any> {
  const result: any = await client.query(
    `mutation ($input: MoveFolder!) {
      moveFolder(input: $input) {
        treeObjectId
        parent {
          treeObjectId
        }
      }
    }`,
    { input },
    options
  );
  return result?.moveFolder;
}

async function loginUserRaw(
  client: GraphqlClient,
  userName: string,
  password: string
): Promise<any> {
  const result: any = await client.query(
    `mutation ($input: UserLogin!) {
      userLogin(input: $input) {
        token
        organization {
          id
          jsondata
        }
      }
    }`,
    { input: { userName, password } }
  );
  return result?.userLogin;
}

async function findMineDataRegistrySDO(
  client: GraphqlClient,
  options: any
): Promise<{ registryId?: string; schemaId?: string; sdoId?: string }> {
  const result: any = await client.query(
    `query {
      dataRegistries(filterByOwnership: mine, limit: 1, nameMatch: contains, name: "${orgNamePrefix}-") {
        records {
          id
          name
          schemas(status: published) {
            records {
              id
              structuredDataObjects(limit: 1) {
                records {
                  id
                  schemaId
                }
              }
            }
          }
        }
      }
    }`,
    {},
    options
  );
  return {
    registryId: _.get(result, 'dataRegistries.records[0].id'),
    schemaId: _.get(result, 'dataRegistries.records[0].schemas.records[0].id'),
    sdoId: _.get(
      result,
      'dataRegistries.records[0].schemas.records[0].structuredDataObjects.records[0].id'
    )
  };
}

async function setupTestGetSDO(
  client: GraphqlClient,
  options: any
): Promise<{ registryId?: string; sdoId?: string; schemaId?: string }> {
  const folderContentTemplate = await findMineDataRegistrySDO(client, options);

  if (!folderContentTemplate.registryId || !folderContentTemplate.schemaId) {
    const dataRegistryId = uuidv4();
    const createRes = await client.sdk.createDataRegistry(
      {
        input: {
          id: dataRegistryId,
          source: '',
          name: `${orgNamePrefix}--schema-${uuidv4()}`,
          description: `${orgNamePrefix}--schema`
        }
      },
      options
    );
    expect(createRes?.data?.createDataRegistry?.id).toBeDefined();

    const upsertRes = await client.sdk.upsertSchemaDraft(
      {
        input: {
          dataRegistryId,
          schema: {
            type: 'object',
            title: `'${orgNamePrefix}-'`,
            required: ['email'],
            properties: {
              email: { type: 'string' },
              userName: { type: 'string' }
            },
            description: 'For CI test'
          }
        }
      },
      options
    );
    folderContentTemplate.registryId = dataRegistryId;
    folderContentTemplate.schemaId = upsertRes?.data?.upsertSchemaDraft?.id;

    const publishRes = await client.sdk.updateSchemaState(
      {
        input: {
          id: folderContentTemplate.schemaId!,
          status: 'published' as any,
          breakingChanges: false
        }
      },
      options
    );
    expect(publishRes?.data?.updateSchemaState?.status).toEqual('published');
    await helpers.sleep(1000);
  }

  if (!folderContentTemplate.sdoId) {
    const sdoRes = await client.sdk.createStructuredData(
      {
        input: {
          schemaId: folderContentTemplate.schemaId!,
          data: {
            email: `folderv2-email-${uuidv4()}@veritone.com`,
            userName: `folderv2-email-${uuidv4()}@veritone.com`
          }
        }
      },
      options
    );
    folderContentTemplate.sdoId = sdoRes?.data?.createStructuredData?.id;
  }

  return folderContentTemplate;
}

describeif(
  (global as any).v2FoldersAvailable,
  'citest_folder: V2Folders',
  () => {
    let gqlClient: GraphqlClient;
    let isolatedSuperadmin: Awaited<
      ReturnType<typeof createIsolatedSuperadmin>
    >;
    let options: Record<string, string>;
    let testSetup: any;
    let testOrg: any, adminUser: any;
    let adminOptions: any;

    let watchlistId: any,
      watchlistName: any,
      watchlistTreeObjectId: any,
      sharedFolderId: any,
      watchlistId1: any,
      watchlistFolderId: any;
    let generateTagKey: (suffix: number) => string;

    const rootFolderType = RootFolderType.Watchlist;
    const testStateObject: any = {
      testId: null,
      testFolderIdV2: null,
      testOtherId: null,
      testName: null,
      testDescription: null,
      testParentId: null,
      testMoveParentId: null,
      testOrderIndex: 0,
      testIsDeleted: false,
      organizationId: null,
      orgRootFolderId: null,
      testOtherDescendantId: null,
      testParentId1: null,
      orgRootFolderId1: null,
      sharedFolderId: null,
      sharedTreeObjectId: null,
      userRootFolderId1: null
    };
    const folderContentTemplate: any = {
      id: null,
      folderId: null,
      sdoId: null,
      schemaId: null
    };

    const createOrgAndUserInput = {
      orgInput: {
        name: `${orgNamePrefix}-${uuidv4()}`,
        businessUnit: 'Legal',
        types: ['agency', 'broadcaster'],
        metadata: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        },
        applications: [
          {
            applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
            applicationKey: 'cms'
          },
          {
            applicationId: 'e4739d44-53d2-4153-b55f-5e246fc989b1',
            applicationKey: 'aiWARE Desktop'
          },
          {
            applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
            applicationKey: 'discovery'
          }
        ]
      },
      userInputs: [
        {
          name: `${orgNamePrefix}-admin-user-${uuidv4()}@localhost`,
          password: 'testPassword',
          firstName: 'FolderV2-User',
          lastName: 'Admin',
          roleIds: [
            isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
            '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
            '6d982ee9-ff07-499f-a182-03457a6187f6',
            '3577dfc6-f441-41f9-8dab-ef9079530450'
          ].filter((roleId) => roleId)
        },
        {
          name: `${orgNamePrefix}-regular-user-${uuidv4()}@localhost`,
          password: 'testPassword',
          firstName: 'FolderV2-User',
          lastName: 'Regular',
          roleIds: []
        }
      ]
    };

    beforeAll(async () => {
      const tagPrefixTimestamp = Date.now();
      generateTagKey = (suffix: number) =>
        `tagkey_${tagPrefixTimestamp}_${suffix}`;

      const env = config.env;
      gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

      isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
      options = isolatedSuperadmin.options;

      testSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );
      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(orgNamePrefix);

      const [au] = testSetup.listOptions ?? [];
      adminUser = au;
      adminOptions = au?.requestOptions;
    });

    afterAll(async () => {
      if (folderContentTemplate.sdoId && folderContentTemplate.schemaId) {
        await safe('delete SDO', () =>
          isolatedSuperadmin.client.sdk.deleteStructuredData(
            {
              input: {
                id: folderContentTemplate.sdoId,
                schemaId: folderContentTemplate.schemaId
              }
            },
            adminOptions
          )
        );
      }

      const listUserIds = (testSetup?.listOptions ?? []).map(
        (user: any) => user.userId
      );
      if (listUserIds.length > 0) {
        await safe('delete users', async () => {
          for (const id of listUserIds) {
            await isolatedSuperadmin.client.sdk.deleteUser({ id }, options);
          }
        });
      }

      if (testOrg?.id) {
        await safe('mark organization as deleted', () =>
          isolatedSuperadmin.client.sdk.updateOrganization(
            { input: { id: testOrg.id, status: OrganizationStatus.Deleted } },
            options
          )
        );
      }

      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
    });

    it('find an SDO for content template', async () => {
      const { sdoId, schemaId } = await setupTestGetSDO(
        isolatedSuperadmin.client,
        adminOptions
      );

      expect(sdoId).toBeDefined();
      expect(schemaId).toBeDefined();

      folderContentTemplate.sdoId = sdoId;
      folderContentTemplate.schemaId = schemaId;
    });

    describe('Root Folders', () => {
      it('create root folders', async () => {
        const rootFoldersRes =
          await isolatedSuperadmin.client.sdk.createRootFolders(
            { rootFolderType: RootFolderType.Watchlist },
            adminOptions
          );
        const rootFolders = rootFoldersRes?.data?.createRootFolders;
        expect(rootFolders).toBeDefined();
        expect(rootFolders!.length).toEqual(2);
        expect(rootFolders![0]!.rootFolderTypeId).toEqual(1);
        expect(rootFolders![0]!.typeId).toEqual(4);
        expect(rootFolders![0]!.treeObjectId).toBeDefined();
        expect(rootFolders![1]!.treeObjectId).toBeDefined();
        expect(rootFolders![0]!.name).toBeDefined();
        expect(rootFolders![1]!.name).toBeDefined();
        const expectOrgRootFolderName =
          testOrg.name + ' ' + rootFolderType + ' Root Folder';
        const expectUserRootFolderName =
          adminUser.userName + ' ' + rootFolderType + ' Root Folder';
        expect(rootFolders![0]!.name).toEqual(expectOrgRootFolderName);
        expect(rootFolders![1]!.name).toEqual(expectUserRootFolderName);

        testStateObject.testParentId = rootFolders![1]!.treeObjectId;
        testStateObject.testMoveParentId = rootFolders![0]!.treeObjectId;

        const orgRootFolder = _.head(
          _.filter(rootFolders, (rf: any) => !_.isNil(rf.organizationId))
        );
        testStateObject.orgRootFolderId = (orgRootFolder as any).id;
      });

      it('create root folders with spadmin', async () => {
        const rootFoldersRes =
          await isolatedSuperadmin.client.sdk.createRootFolders(
            { rootFolderType: RootFolderType.Watchlist },
            options
          );
        const rootFolders = rootFoldersRes?.data?.createRootFolders;
        expect(rootFolders).toBeDefined();
        expect(rootFolders!.length).toEqual(2);
        expect(rootFolders![0]!.rootFolderTypeId).toEqual(1);
        expect(rootFolders![0]!.typeId).toEqual(4);
        expect(rootFolders![0]!.treeObjectId).toBeDefined();
        expect(rootFolders![1]!.treeObjectId).toBeDefined();
        expect(rootFolders![0]!.name).toBeDefined();
        expect(rootFolders![1]!.name).toBeDefined();
        testStateObject.testParentId1 = rootFolders![1]!.id;
        const orgRootFolder = _.head(
          _.filter(rootFolders, (rf: any) => _.isNil(rf.ownerId))
        );
        testStateObject.orgRootFolderId1 = (orgRootFolder as any).id;
        const userRootFolder = _.head(
          _.filter(rootFolders, (rf: any) => !_.isNil(rf.ownerId))
        );
        testStateObject.userRootFolderId1 = (userRootFolder as any).id;
      });

      it('should get root folders', async () => {
        const rootFoldersRes = await isolatedSuperadmin.client.sdk.rootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions
        );
        const rootFolders = rootFoldersRes?.data?.rootFolders ?? [];
        expect(rootFolders).toBeDefined();
        expect(rootFolders.length >= 1).toEqual(true);
        expect(rootFolders[0]?.id).toEqual(testStateObject.orgRootFolderId);
        expect(rootFolders[0]?.organizationId).toBeDefined();
        const expectOrgRootFolderName =
          testOrg.name + ' ' + rootFolderType + ' Root Folder';
        const expectUserRootFolderName =
          adminUser.userName + ' ' + rootFolderType + ' Root Folder';
        expect(rootFolders[0]?.name).toEqual(expectOrgRootFolderName);
        expect(rootFolders[1]?.name).toEqual(expectUserRootFolderName);
      });
    });

    describe('Folders', () => {
      it('create a folder', async () => {
        testStateObject.testName =
          citestMarker + '-graphql-test-folders-' + uuidv4();
        testStateObject.testDescription =
          citestMarker + '-graphql-folders-description';

        const folder = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: testStateObject.testName,
              description: testStateObject.testDescription,
              parentId: testStateObject.testParentId,
              orderIndex: testStateObject.testOrderIndex,
              rootFolderType,
              entityTags: [
                { tagKey: generateTagKey(1), tagValue: 'tag_value' },
                { tagKey: generateTagKey(2), tagValue: 'tag_value' }
              ]
            }
          },
          adminOptions
        );
        const otherFolder = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: `${testStateObject.testName}-other`,
              parentId: testStateObject.testMoveParentId,
              description: testStateObject.testDescription,
              rootFolderType,
              orderIndex: testStateObject.testOrderIndex,
              entityTags: [
                { tagKey: generateTagKey(3), tagValue: 'tag_value' },
                { tagKey: generateTagKey(4), tagValue: 'tag_value' }
              ]
            }
          },
          adminOptions
        );

        testStateObject.testFolderIdV2 = folder?.data?.createFolder?.id;
        testStateObject.testId = folder?.data.createFolder?.treeObjectId;
        testStateObject.testOtherId = otherFolder?.data.createFolder?.id;

        expect(testStateObject.testId).toBeDefined();
        expect(testStateObject.testOtherId).toBeDefined();

        expect(folder?.data.createFolder?.id).toBeDefined();
        expect(folder?.data.createFolder?.name).toEqual(
          testStateObject.testName
        );

        expect(folder?.data.createFolder?.entityTags).toMatchObject([
          { tagKey: generateTagKey(1), tagValue: 'tag_value' },
          { tagKey: generateTagKey(2), tagValue: 'tag_value' }
        ]);
        expect(otherFolder?.data.createFolder?.entityTags).toMatchObject([
          { tagKey: generateTagKey(3), tagValue: 'tag_value' },
          { tagKey: generateTagKey(4), tagValue: 'tag_value' }
        ]);
      });

      it('create a descendant folder for filtering', async () => {
        const folder = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: `${testStateObject.testName}-descendant-other`,
              parentId: testStateObject.testOtherId,
              description: testStateObject.testDescription,
              rootFolderType,
              orderIndex: testStateObject.testOrderIndex,
              entityTags: [
                { tagKey: generateTagKey(3), tagValue: 'tag_value' },
                { tagKey: generateTagKey(7), tagValue: 'tag_value' }
              ]
            }
          },
          adminOptions
        );
        testStateObject.testOtherDescendantId = folder?.data.createFolder?.id;
        expect(testStateObject.testOtherDescendantId).toBeDefined();
        expect(folder?.data.createFolder?.entityTags).toMatchObject([
          { tagKey: generateTagKey(3), tagValue: 'tag_value' },
          { tagKey: generateTagKey(7), tagValue: 'tag_value' }
        ]);
      });

      it('return childFolders if a folder has any', async () => {
        const query = `query {
          folder(id: "${testStateObject.testMoveParentId}") {
            childFolders {
              count
              offset
              limit
              records {
                id
                name
              }
            }

            nameFilter: childFolders (names: ["${testStateObject.testName}"]){
              count
              offset
              limit
              records {
                id
                name
              }
            }
            entityTagsFilter: childFolders (entityTags: [{ key: "${generateTagKey(
              3
            )}"}]){
              count
              offset
              limit
              records {
                id
                name
              }
            }
          }
        }`;

        const result: any = await isolatedSuperadmin.client.query(
          query,
          {},
          adminOptions
        );
        const childFolders = _.get(result, 'folder.childFolders', {});
        const nameFilterFolders = _.get(result, 'folder.nameFilter', {});
        const entityTagFilterFolders = _.get(
          result,
          'folder.entityTagsFilter',
          {}
        );
        expect(childFolders.count).toBeDefined();
        expect(childFolders.offset).toBeDefined();
        expect(childFolders.limit).toBeDefined();
        expect(childFolders.records).toBeDefined();
        expect(childFolders.records.length).toEqual(childFolders.count);
        expect(nameFilterFolders.count).toEqual(2);
        const matchFolderNames = _.filter(
          _.get(nameFilterFolders, 'records'),
          (f: any) => f.name.match(/[descendant]?-other/g)
        );
        expect(matchFolderNames.length).toEqual(2);
        expect(entityTagFilterFolders.count).toEqual(2);
        expect(_.map(entityTagFilterFolders.records, 'id')).toMatchObject([
          testStateObject.testOtherId,
          testStateObject.testOtherDescendantId
        ]);
      });

      it('create folder content template', async () => {
        const res =
          await isolatedSuperadmin.client.sdk.createFolderContentTemplate(
            {
              input: {
                folderId: testStateObject.testId,
                sdoId: folderContentTemplate.sdoId,
                schemaId: folderContentTemplate.schemaId
              }
            },
            adminOptions
          );
        const created = res?.data?.createFolderContentTemplate;
        expect(created?.id).toBeDefined();
        expect(created?.folderId).toEqual(testStateObject.testFolderIdV2);
        expect(created?.sdoId).toEqual(folderContentTemplate.sdoId);
        expect(created?.schemaId).toEqual(folderContentTemplate.schemaId);
      });

      it('create more folder content template', async () => {
        const res =
          await isolatedSuperadmin.client.sdk.createFolderContentTemplate(
            {
              input: {
                folderId: testStateObject.testId,
                sdoId: folderContentTemplate.sdoId,
                schemaId: folderContentTemplate.schemaId
              }
            },
            adminOptions
          );
        const created = res?.data?.createFolderContentTemplate;
        expect(created?.id).toBeDefined();
        folderContentTemplate.id = created?.id;
        expect(created?.folderId).toEqual(testStateObject.testFolderIdV2);
        expect(created?.sdoId).toEqual(folderContentTemplate.sdoId);
        expect(created?.schemaId).toEqual(folderContentTemplate.schemaId);
      });

      it('update folder content template', async () => {
        const res =
          await isolatedSuperadmin.client.sdk.updateFolderContentTemplate(
            {
              input: {
                id: folderContentTemplate.id,
                sdoId: folderContentTemplate.sdoId
              }
            },
            adminOptions
          );
        const updated = res?.data?.updateFolderContentTemplate;
        expect(updated?.id).toBeDefined();
        expect(updated?.folderId).toEqual(testStateObject.testFolderIdV2);
        expect(updated?.sdoId).toEqual(folderContentTemplate.sdoId);
        expect(updated?.schemaId).toEqual(folderContentTemplate.schemaId);
      });

      it('get a folder', async () => {
        const query = `
        fragment folderFields on Folder {
          id
          name
          description
          createdDateTime
          modifiedDateTime
          status
          ownerId
          maxDepth
          orderIndex
          typeId
          subfolders {
            id
            name
            description
          }
          parent {
            treeObjectId
          }
          contentTemplates {
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
          entityTags {
            tagKey
            tagValue
          }
        }
        query {
          folder(id: "${testStateObject.testId}") {
            ...folderFields
          }
          otherFolder: folder(id: "${testStateObject.testOtherId}") {
            ...folderFields
          }
        }`;
        const result: any = await isolatedSuperadmin.client.query(
          query,
          {},
          adminOptions
        );
        expect(result.folder.id).toBeDefined();
        expect(result.folder.typeId).toEqual(1);
        expect(_.get(result, 'folder.parent.treeObjectId')).toEqual(
          testStateObject.testParentId
        );
        expect(_.get(result, 'folder.contentTemplates[0].folderId')).toEqual(
          testStateObject.testFolderIdV2
        );
        expect(_.get(result, 'otherFolder.parent.treeObjectId')).toEqual(
          testStateObject.testMoveParentId
        );

        expect(_.get(result, 'folder.entityTags')).toMatchObject([
          { tagKey: generateTagKey(1), tagValue: 'tag_value' },
          { tagKey: generateTagKey(2), tagValue: 'tag_value' }
        ]);
        expect(_.get(result, 'otherFolder.entityTags')).toMatchObject([
          { tagKey: generateTagKey(3), tagValue: 'tag_value' },
          { tagKey: generateTagKey(4), tagValue: 'tag_value' }
        ]);
      });

      it('delete folder content template', async () => {
        const res =
          await isolatedSuperadmin.client.sdk.deleteFolderContentTemplate(
            { id: folderContentTemplate.id },
            adminOptions
          );
        const deleted = res?.data?.deleteFolderContentTemplate;
        expect(deleted?.id).toBeDefined();
        expect(deleted?.id).toEqual(folderContentTemplate.id);
      });

      it('create a watchlist in the folder', async () => {
        const now = new Date();
        const stop = new Date(now.getTime() + 60 * 60 * 1000);
        const watchlist = await isolatedSuperadmin.client.sdk.createWatchlist(
          {
            input: {
              startDateTime: now.toISOString(),
              stopDateTime: stop.toISOString(),
              name: `${citestMarker} ${now.toISOString()}`,
              cognitiveSearches: [
                {
                  mentionStatusId: '1',
                  jsonstring: `{"state":{"search":"waterboy","language":"en"},"engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}`
                }
              ],
              sourceTypeIds: ['1'],
              parentFolderId: testStateObject.testId,
              details: {
                targetAudience: {
                  ageGroup: [2, 2],
                  gender: 3
                }
              },
              subscriptions: [],
              searchIndex: SearchIndex.Mine
            }
          },
          adminOptions
        );
        watchlistId = watchlist?.data.createWatchlist?.id;
        watchlistName = watchlist?.data.createWatchlist?.name;
        watchlistTreeObjectId = watchlist?.data?.createWatchlist?.treeObjectId;
        expect(watchlistId).toBeDefined();
        expect(watchlistName).toBeDefined();
        expect(watchlistTreeObjectId).toBeDefined();
      });

      it('return childWatchlists', async () => {
        const query = `query {
              folder(id: "${testStateObject.testId}") {
                childWatchlists (limit: 1, name: "${watchlistName}") {
                  count
                  offset
                  limit
                  records {
                    id
                    folders {
                      id
                    }
                  }
                }
              }
            }`;

        const result: any = await isolatedSuperadmin.client.query(
          query,
          {},
          adminOptions
        );
        const childWatchlists = _.get(result, 'folder.childWatchlists', {});
        expect(childWatchlists.count).toEqual(1);
        expect(childWatchlists.records).toHaveLength(1);
        expect(_.get(childWatchlists, 'records[0].id')).toEqual(watchlistId);
        expect(_.get(childWatchlists, 'records[0].folders[0].id')).toEqual(
          testStateObject.testFolderIdV2
        );
      });

      it('create a watchlist folder', async () => {
        testStateObject.testName =
          citestMarker + '-graphql-test-watchlist-foldersV2-' + uuidv4();
        testStateObject.testDescription =
          citestMarker + '-graphql-folders-description';

        const folderRes = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: testStateObject.testName,
              description: testStateObject.testDescription,
              parentId: testStateObject.testParentId,
              orderIndex: testStateObject.testOrderIndex,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        watchlistFolderId = folderRes?.data?.createFolder?.id;
        expect(watchlistFolderId).toBeDefined();
      });

      it('create a watchlist without folderId', async () => {
        const now = new Date();
        const stop = new Date(now.getTime() + 60 * 60 * 1000);
        const watchlist = await isolatedSuperadmin.client.sdk.createWatchlist(
          {
            input: {
              startDateTime: now.toISOString(),
              stopDateTime: stop.toISOString(),
              name: `${citestMarker} citest ${now.toISOString()}`,
              cognitiveSearches: [
                {
                  mentionStatusId: '1',
                  jsonstring: `{"state":{"search":"waterboy","language":"en"},"engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}`
                }
              ],
              sourceTypeIds: ['1'],
              details: {
                targetAudience: {
                  ageGroup: [2, 2],
                  gender: 3
                }
              },
              subscriptions: [],
              searchIndex: SearchIndex.Mine
            }
          },
          adminOptions
        );
        watchlistId1 = watchlist?.data?.createWatchlist?.id;
        expect(watchlistId1).toBeDefined();
      });

      it('file a watchlist into a folder', async () => {
        const filed = await isolatedSuperadmin.client.sdk.fileWatchlist(
          {
            input: {
              orderIndex: 1,
              watchlistId: watchlistId1,
              folderId: watchlistFolderId
            }
          },
          adminOptions
        );
        expect(filed?.data?.fileWatchlist?.id).toEqual(watchlistId1);
      });

      it('throw folder content template not found after deleting', async () => {
        expect(
          isolatedSuperadmin.client.sdk.updateFolderContentTemplate(
            {
              input: {
                id: folderContentTemplate.id,
                sdoId: folderContentTemplate.sdoId
              }
            },
            adminOptions
          )
        ).rejects.toThrow('Folder Content Template');
      });

      it('update a folder', async () => {
        const updated = await isolatedSuperadmin.client.sdk.updateFolder(
          {
            input: {
              id: testStateObject.testId,
              name: `${testStateObject.testName}-update`,
              entityTags: [
                { tagKey: generateTagKey(5), tagValue: 'tag_value' },
                { tagKey: generateTagKey(6), tagValue: 'tag_value' }
              ]
            }
          },
          adminOptions
        );
        expect(updated?.data?.updateFolder?.name).toEqual(
          `${testStateObject.testName}-update`
        );
        expect(updated?.data?.updateFolder?.entityTags).toMatchObject([
          { tagKey: generateTagKey(5), tagValue: 'tag_value' },
          { tagKey: generateTagKey(6), tagValue: 'tag_value' }
        ]);
      });

      it('move a folder', async () => {
        const moveFolder = await moveFolderRaw(
          isolatedSuperadmin.client,
          {
            folderId: testStateObject.testId,
            fromFolderId: testStateObject.testParentId,
            toFolderId: testStateObject.testMoveParentId,
            treeObjectId: testStateObject.testId,
            prevParentTreeObjectId: testStateObject.testParentId,
            newParentTreeObjectId: testStateObject.testMoveParentId
          },
          adminOptions
        );
        expect(moveFolder?.treeObjectId).toEqual(testStateObject.testId);
        expect(moveFolder?.parent?.treeObjectId).toEqual(
          testStateObject.testMoveParentId
        );
      });

      it('failed to move parent folder into child folder', async () => {
        try {
          await moveFolderRaw(
            isolatedSuperadmin.client,
            {
              treeObjectId: testStateObject.testMoveParentId,
              prevParentTreeObjectId: testStateObject.orgRootFolderId,
              newParentTreeObjectId: testStateObject.testId
            },
            adminOptions
          );
        } catch (error) {
          expect(`${error}`).toContain(
            `Cannot move parent folder into its own subfolder`
          );
        }
      });

      it('get folderOverview', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query {
            folderOverview(ids: "${testStateObject.testId}", rootFolderType: watchlist) {
              childFoldersCount
              childNonFolderObjectsCount
              objectIds
            }
          }`,
          {},
          adminOptions
        );
        const folderOverview = result.folderOverview;
        expect(folderOverview.childFoldersCount).toEqual(0);
        expect(folderOverview.childNonFolderObjectsCount).toEqual(1);
        expect(_.get(folderOverview, 'objectIds[0]')).toBeDefined();
      });

      it('get folderSummaryDetails', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query ($ids: [ID!]!) {
            folderSummaryDetails(ids: $ids, rootFolderType: watchlist) {
              id
              treeObjectId
              typeId
              childFoldersCount
              childNonFolderObjectsCount
              childWatchlistsIds
              createdBy {
                id
              }
              depth
              fingerprints
              marketCount
              trackMyPrograms
              mediaSourceTypeIds
              orderIndex
              parentTreeObjectId
              programCount
              searchTerms
              trackingUnitName
              trackingUnitStartDate
              trackingUnitStopDate
              createdDateTime
              modifiedDateTime
            }
          }`,
          { ids: [testStateObject.testId] },
          adminOptions
        );
        const folderSummaryDetails = result.folderSummaryDetails;
        expect(folderSummaryDetails).toHaveLength(2);
        // watchlist object row: typeId = 2 from v2_folder_type join (folder_type_name = 'watchlist')
        expect(folderSummaryDetails[0].typeId).toEqual(2);
        expect(folderSummaryDetails[0].depth).toEqual(1);
        // folder row: typeId falls back to folderTypeId = 1
        expect(folderSummaryDetails[1].typeId).toEqual(1);
        expect(_.get(folderSummaryDetails, '1.childWatchlistsIds.0')).toEqual(
          watchlistId
        );
        expect(folderSummaryDetails[1].depth).toEqual(0);
      });

      it('get folderSummaryDetails with watchlist type_id = 2', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query ($ids: [ID!]!) {
            folderSummaryDetails(ids: $ids, rootFolderType: watchlist) {
              id
              treeObjectId
              typeId
              childFoldersCount
              childNonFolderObjectsCount
              childWatchlistsIds
              depth
              trackingUnitName
              createdDateTime
              modifiedDateTime
            }
          }`,
          { ids: [watchlistFolderId] },
          adminOptions
        );
        const folderSummaryDetails = result.folderSummaryDetails;
        expect(folderSummaryDetails.length).toBeGreaterThanOrEqual(2);

        const watchlistEntries = folderSummaryDetails.filter(
          (entry: any) => entry.typeId === 2
        );
        expect(watchlistEntries.length).toBeGreaterThanOrEqual(1);

        const watchlistEntry = watchlistEntries.find(
          (entry: any) => entry.id === watchlistId1
        );
        expect(watchlistEntry).toBeDefined();
        expect(watchlistEntry.typeId).toEqual(2);

        const folderEntries = folderSummaryDetails.filter(
          (entry: any) => entry.typeId === 1
        );
        expect(folderEntries.length).toBeGreaterThanOrEqual(1);

        const folderEntry = folderEntries.find(
          (entry: any) => entry.id === watchlistFolderId
        );
        expect(folderEntry).toBeDefined();
        expect(folderEntry.childWatchlistsIds).toContain(watchlistId1);
      });

      it('delete a root folder', async () => {
        try {
          await isolatedSuperadmin.client.sdk.deleteFolder(
            {
              input: {
                id: testStateObject.orgRootFolderId,
                orderIndex: testStateObject.testOrderIndex
              }
            },
            adminOptions
          );
        } catch (error) {
          expect(`${error}`).toContain(`Can not delete root folder`);
        }
      });

      it('delete watchlist in the folder', async () => {
        const deletedRes = await isolatedSuperadmin.client.sdk.deleteWatchlist(
          { id: watchlistId },
          adminOptions
        );
        expect(deletedRes?.data?.deleteWatchlist?.id).toEqual(watchlistId);
      });

      it('delete a descendant folder before deleting its parent folder', async () => {
        const deleteRes = await isolatedSuperadmin.client.sdk.deleteFolder(
          {
            input: {
              id: testStateObject.testOtherDescendantId,
              orderIndex: testStateObject.testOrderIndex
            }
          },
          adminOptions
        );
        expect(testStateObject.testOtherDescendantId).toEqual(
          deleteRes?.data?.deleteFolder?.id
        );
      });

      it('delete a folder', async () => {
        const deleteFolderRes =
          await isolatedSuperadmin.client.sdk.deleteFolder(
            {
              input: {
                id: testStateObject.testFolderIdV2,
                orderIndex: testStateObject.testOrderIndex
              }
            },
            adminOptions
          );
        const deleteOtherFolderRes =
          await isolatedSuperadmin.client.sdk.deleteFolder(
            {
              input: {
                id: testStateObject.testOtherId,
                orderIndex: testStateObject.testOrderIndex
              }
            },
            adminOptions
          );
        testStateObject.testIsDeleted = true;
        expect(deleteFolderRes?.data?.deleteFolder?.id).toEqual(
          testStateObject.testFolderIdV2
        );
        expect(deleteOtherFolderRes?.data?.deleteFolder?.id).toEqual(
          testStateObject.testOtherId
        );
      });

      it('create a folder for sharing', async () => {
        const folderRes = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: `${testStateObject.testName}-share-folder`,
              description: testStateObject.testDescription,
              parentId: testStateObject.testParentId1,
              orderIndex: testStateObject.testOrderIndex,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          options
        );
        const folder = folderRes?.data?.createFolder;
        testStateObject.sharedFolderId = folder?.id;
        testStateObject.sharedTreeObjectId = folder?.treeObjectId;
        expect(testStateObject.sharedFolderId).toBeDefined();
      });

      it('share rootFolder with folderId', async () => {
        const shareRes = await isolatedSuperadmin.client.sdk.shareFolder(
          {
            input: {
              folderId: testStateObject.userRootFolderId1,
              readOrganizationIds: [Number.parseInt(testOrg.id, 10)]
            }
          },
          options
        );
        const shareFolder = shareRes?.data?.shareFolder;
        expect(shareFolder?.id).toEqual(testStateObject.userRootFolderId1);
        expect(shareFolder?.sharedWith?.read).toContainEqual(
          Number.parseInt(testOrg.id, 10)
        );
      });

      it('share a folder with folderId', async () => {
        const shareRes = await isolatedSuperadmin.client.sdk.shareFolder(
          {
            input: {
              folderId: testStateObject.sharedFolderId,
              readOrganizationIds: [Number.parseInt(testOrg.id, 10)]
            }
          },
          options
        );
        const shareFolder = shareRes?.data?.shareFolder;
        expect(shareFolder?.id).toEqual(testStateObject.sharedFolderId);
        expect(shareFolder?.sharedWith?.read).toContainEqual(
          Number.parseInt(testOrg.id, 10)
        );
      });

      it('share a folder with treeObjectId', async () => {
        const shareRes = await isolatedSuperadmin.client.sdk.shareFolder(
          {
            input: {
              folderId: testStateObject.sharedTreeObjectId,
              readOrganizationIds: [Number.parseInt(testOrg.id, 10)]
            }
          },
          options
        );
        const shareFolder = shareRes?.data?.shareFolder;
        expect(shareFolder?.id).toEqual(testStateObject.sharedFolderId);
        expect(shareFolder?.sharedWith?.read).toContainEqual(
          Number.parseInt(testOrg.id, 10)
        );
      });

      it('fetch shared folders with parentFolderId', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query {
             sharedFolders {
                id
                sharedWith {
                  read
                  write
                }
             }
          }`,
          null,
          adminOptions
        );
        const { sharedFolders } = result;
        // The sharedFolders query has no deterministic ordering so position varies across runs
        const ids = (sharedFolders ?? []).map((f: any) => f.id);
        expect(ids).toContain(testStateObject.sharedFolderId);
      });

      it('should get shared folder by id with none OLP', async () => {
        const updateOrgRBAC = async (orgId: string, enabled: boolean) => {
          const res = await isolatedSuperadmin.client.sdk.updateOrganization(
            {
              input: {
                id: orgId,
                metadata: {
                  features: {
                    enableRBACFeature: enabled ? 'enabled' : 'disabled'
                  }
                }
              }
            },
            options
          );
          return res?.data?.updateOrganization?.id ?? '';
        };

        const updatedOrgId = await updateOrgRBAC(testOrg.id, false);
        expect(updatedOrgId).toEqual(testOrg.id);

        const folderRes = await isolatedSuperadmin.client.sdk.folder(
          { id: testStateObject.sharedFolderId },
          adminOptions
        );
        const folder = folderRes?.data?.folder as any;
        expect(folder?.id).toEqual(testStateObject.sharedFolderId);
        expect(folder?.sharedAccess).toContainEqual('read');

        const revertedOrgId = await updateOrgRBAC(testOrg.id, true);
        expect(revertedOrgId).toEqual(testOrg.id);
      });

      it('throw folder not found after deleting', async () => {
        await expect(
          isolatedSuperadmin.client.sdk.folder(
            { id: testStateObject.testId },
            adminOptions
          )
        ).rejects.toThrow('not_found');
      });

      it('fetch shared folders', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query {
              sharedFolders {
                id
                sharedWith {
                  read
                  write
                }
              }
          }`,
          {},
          adminOptions
        );
        const { sharedFolders } = result;
        if (sharedFolders.length) {
          sharedFolderId = sharedFolders[0].id;
        }
      });

      it('fetch shared folder by id', async () => {
        if (sharedFolderId) {
          const folderRes = await isolatedSuperadmin.client.sdk.folder(
            { id: sharedFolderId },
            adminOptions
          );
          const folder = folderRes?.data?.folder as any;
          expect(folder?.id).toEqual(sharedFolderId);
          expect(folder?.sharedAccess).toContainEqual('read');
        }
      });
    });

    describe('FolderPath and TDO', () => {
      let parent: any, child: any, leaf: any, tdoId: any;

      beforeAll(async () => {
        const createFolder = async (name: string, parentId: string) => {
          const res = await isolatedSuperadmin.client.sdk.createFolder(
            {
              input: {
                name,
                description: 'CI Test Folder',
                parentId,
                rootFolderType: RootFolderType.Watchlist
              }
            },
            adminOptions
          );
          const created = res?.data?.createFolder;
          return { id: created!.id, treeObjectId: created!.treeObjectId };
        };

        parent = await createFolder(
          `${citestMarker}-parent-${Date.now()}`,
          testStateObject.orgRootFolderId
        );
        child = await createFolder(
          `${citestMarker}-child-${Date.now()}`,
          parent.id
        );
        leaf = await createFolder(
          `${citestMarker}-leaf-${Date.now()}`,
          child.id
        );
      });

      it('should validate folderPath hierarchy for leaf folder', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query {
            folder(id: "${leaf.id}") {
              id
              parent { id }
              folderPath {
                id
                parent { id }
              }
            }
          }`,
          null,
          adminOptions
        );
        const folderPath = result.folder.folderPath;
        expect(_.get(result, 'folder.id')).toEqual(leaf.id);
        expect(_.get(result, 'folder.parent.id')).toEqual(child.id);

        expect(folderPath.length).toEqual(3);
        expect(folderPath.map((f: any) => f.id)).toEqual([
          testStateObject.orgRootFolderId,
          parent.id,
          child.id
        ]);

        expect(folderPath[0].id).toEqual(testStateObject.orgRootFolderId);
        expect(folderPath[1].parent.id).toEqual(
          testStateObject.orgRootFolderId
        );
        expect(folderPath[2].parent.id).toEqual(parent.id);
      });

      it('should create TDO in leaf folder', async () => {
        const now = new Date();
        const stop = new Date(now.getTime() + 5 * 60 * 1000);
        const tdoRes = await isolatedSuperadmin.client.sdk.createTDO(
          {
            input: {
              startDateTime: Math.floor(now.getTime() / 1000),
              stopDateTime: Math.floor(stop.getTime() / 1000),
              addToIndex: true,
              parentFolderId: leaf.id
            }
          },
          adminOptions
        );
        tdoId = tdoRes?.data?.createTDO?.id;
        expect(tdoId).toBeDefined();
      });

      it('should validate folderPath and treeObjectIds for TDO', async () => {
        const result: any = await isolatedSuperadmin.client.query(
          `query {
            temporalDataObject(id: "${tdoId}") {
              id
              foldersTreeObjectIds
              folders {
                id
                treeObjectId
                folderPath { id parent { id } }
              }
            }
          }`,
          null,
          adminOptions
        );
        const tdo = result.temporalDataObject;
        expect(tdo.foldersTreeObjectIds).toContain(parent.treeObjectId);
        expect(tdo.foldersTreeObjectIds).toContain(child.treeObjectId);
        expect(tdo.foldersTreeObjectIds).toContain(leaf.treeObjectId);
        expect(tdo.foldersTreeObjectIds).not.toContain(
          testStateObject.testParentId
        );

        const folderPath = tdo.folders[0].folderPath;
        expect(folderPath.length).toEqual(3);
        expect(folderPath.map((f: any) => f.id)).toEqual([
          testStateObject.orgRootFolderId,
          parent.id,
          child.id
        ]);
      });

      afterAll(async () => {
        if (tdoId) {
          await safe('delete TDO', () =>
            isolatedSuperadmin.client.sdk.deleteTDO({ id: tdoId }, adminOptions)
          );
        }
        for (const f of [leaf, child, parent]) {
          if (f?.id) {
            await safe(`delete folder ${f.id}`, () =>
              isolatedSuperadmin.client.sdk.deleteFolder(
                { input: { id: f.id, orderIndex: 0 } },
                adminOptions
              )
            );
          }
        }
      });
    });

    // Application Folders - fileApplication idempotency
    describe('Application Folders', () => {
      let appRootFolderId: any;
      let folderId: any;
      const appId = 'e4739d44-53d2-4153-b55f-5e246fc989b1';

      it('should create root folders for application', async () => {
        const rootFoldersRes =
          await isolatedSuperadmin.client.sdk.createRootFolders(
            { rootFolderType: RootFolderType.Application },
            adminOptions
          );
        const rootFolders = rootFoldersRes?.data?.createRootFolders ?? [];
        expect(rootFolders).toBeDefined();
        const orgRootFolder = rootFolders.find(
          (rf: any) => !_.isNil(rf.organizationId)
        );
        appRootFolderId = orgRootFolder?.treeObjectId;
        expect(appRootFolderId).toBeDefined();
      });

      it('should create an application folder and file application three times', async () => {
        const createRes = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              parentId: appRootFolderId,
              name: `citest-app-folder-${Date.now()}`,
              description: '',
              rootFolderType: RootFolderType.Application
            }
          },
          adminOptions
        );
        folderId = createRes?.data?.createFolder?.id;
        expect(folderId).toBeDefined();

        // File 3 times to prove idempotency
        const res1 = await isolatedSuperadmin.client.sdk.fileApplication(
          {
            input: {
              appId,
              folderId
            }
          },
          adminOptions
        );
        expect(res1?.data?.fileApplication?.id).toEqual(appId);

        const res2 = await isolatedSuperadmin.client.sdk.fileApplication(
          { input: { appId, folderId } },
          adminOptions
        );
        expect(res2?.data?.fileApplication?.id).toEqual(appId);

        const res3 = await isolatedSuperadmin.client.sdk.fileApplication(
          { input: { appId, folderId } },
          adminOptions
        );
        expect(res3?.data?.fileApplication?.id).toEqual(appId);
      });

      it('unfile application from folder should succeed', async () => {
        const unfileAppRes =
          await isolatedSuperadmin.client.sdk.unfileApplication(
            {
              input: {
                folderId,
                appId
              }
            },
            adminOptions
          );
        expect(unfileAppRes?.data?.unfileApplication?.id).toEqual(appId);
      });

      it('delete application folder should succeed', async () => {
        const deleteFolderRes =
          await isolatedSuperadmin.client.sdk.deleteFolder(
            { input: { id: folderId, orderIndex: 0 } },
            adminOptions
          );
        expect(deleteFolderRes?.data?.deleteFolder?.id).toEqual(folderId);
      });
    });

    describe('switch folder version tests', () => {
      let switchOrgSetup: any, switchOrg: any, switchAdminUser: any;
      let switchAdminOptions: any;
      let orgRootFolder: any,
        userRootFolder: any,
        parentFolder: any,
        childFolder: any;

      const createSwitchOrgAndUserInput = {
        orgInput: {
          name: citestMarker + '-org-folder-rbac-' + uuidv4(),
          businessUnit: 'Legal',
          types: ['agency', 'broadcaster'],
          metadata: {
            features: {
              v2FoldersEnabled: 'disabled'
            }
          },
          applications: [
            {
              applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
              applicationKey: 'cms'
            },
            {
              applicationId: 'e4739d44-53d2-4153-b55f-5e246fc989b1',
              applicationKey: 'aiWARE Desktop'
            },
            {
              applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
              applicationKey: 'discovery'
            }
          ]
        },
        userInputs: [
          {
            name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
            password: 'testUserPassword',
            roleIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
            ].filter((roleId) => roleId)
          }
        ]
      };

      beforeAll(async () => {
        // create org V1 and admin
        switchOrgSetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          createSwitchOrgAndUserInput
        );

        switchOrg = switchOrgSetup.org;
        expect(switchOrg).toBeDefined();
        expect(switchOrg.name).toContain(`${citestMarker}-org`);

        const [au] = switchOrgSetup.listOptions ?? [];
        switchAdminUser = au;
        switchAdminOptions = au?.requestOptions;

        // create root folder v1
        const rootFolderRes =
          await isolatedSuperadmin.client.sdk.createRootFolders(
            { rootFolderType: RootFolderType.Cms },
            switchAdminOptions
          );
        const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];
        expect(rootFolder).toBeDefined();
        userRootFolder = rootFolder.find(
          (rf: any) => rf.ownerId === switchAdminUser.userId
        );
        expect(userRootFolder).toBeDefined();

        orgRootFolder = rootFolder.find((rf: any) => rf.ownerId === null);
        expect(orgRootFolder).toBeDefined();
      });

      afterAll(async () => {
        const listUserIds = (switchOrgSetup?.listOptions ?? []).map(
          (user: any) => user.userId
        );
        if (listUserIds.length > 0) {
          await safe('delete users', async () => {
            for (const id of listUserIds) {
              await isolatedSuperadmin.client.sdk.deleteUser({ id }, options);
            }
          });
        }
        if (switchOrg?.id) {
          await safe('delete switch org', () =>
            isolatedSuperadmin.client.sdk.updateOrganization(
              {
                input: { id: switchOrg.id, status: OrganizationStatus.Deleted }
              },
              options
            )
          );
        }
      });

      it('create parent and child folder v1', async () => {
        const parentFolderRes =
          await isolatedSuperadmin.client.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-parent-${uuidv4()}`,
                description: '',
                parentId: userRootFolder.id,
                rootFolderType: RootFolderType.Cms
              }
            },
            switchAdminOptions
          );
        parentFolder = parentFolderRes?.data?.createFolder;
        expect(parentFolder).toBeDefined();

        const childFolderRes = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-${uuidv4()}`,
              description: '',
              parentId: parentFolder?.id,
              rootFolderType: RootFolderType.Cms
            }
          },
          switchAdminOptions
        );
        childFolder = childFolderRes?.data?.createFolder;
        expect(childFolder).toBeDefined();
      });

      it('delete folders v1', async () => {
        const deleteChildRes = await isolatedSuperadmin.client.sdk.deleteFolder(
          { input: { id: childFolder.id, orderIndex: 0 } },
          switchAdminOptions
        );
        expect(deleteChildRes?.data?.deleteFolder?.id).toEqual(childFolder.id);

        const deleteRes = await isolatedSuperadmin.client.sdk.deleteFolder(
          { input: { id: parentFolder.id, orderIndex: 0 } },
          switchAdminOptions
        );
        expect(deleteRes?.data?.deleteFolder?.id).toEqual(parentFolder.id);
      });

      it('switch for v2 Folder', async () => {
        const switchRes =
          await isolatedSuperadmin.client.sdk.updateOrganization(
            {
              input: {
                id: switchOrg.id,
                metadata: { features: { v2FoldersEnabled: 'enabled' } }
              }
            },
            options
          );
        expect(switchRes?.data?.updateOrganization?.id).toEqual(switchOrg.id);
      });

      it('folders should not exist after switch', async () => {
        let isFolderV2 = false;

        do {
          await helpers.sleep(2000); // wait for 2 seconds to make sure the switch is effective
          const loginRes = await loginUserRaw(
            isolatedSuperadmin.client,
            switchAdminUser.userName,
            'testUserPassword'
          );

          const orgConfig = _.get(
            loginRes,
            'organization.jsondata.features',
            {}
          );
          isFolderV2 = orgConfig.v2FoldersEnabled === 'enabled';
        } while (!isFolderV2);

        const folderRes = isolatedSuperadmin.client.sdk.folder(
          { id: parentFolder.id },
          switchAdminOptions
        );

        await expect(folderRes).rejects.toThrow(/not_found/);
      });

      it('rootFolder name should not change after switch', async () => {
        const rootFolderRes = await isolatedSuperadmin.client.sdk.folder(
          { id: userRootFolder.id },
          switchAdminOptions
        );
        const folder = rootFolderRes?.data?.folder;
        expect(folder?.name).toEqual(userRootFolder.name);

        const orgRootFolderRes = await isolatedSuperadmin.client.sdk.folder(
          { id: orgRootFolder.id },
          switchAdminOptions
        );
        const orgFolder = orgRootFolderRes?.data?.folder;
        expect(orgFolder?.name).toEqual(orgRootFolder.name);
      });
    });
  }
);
