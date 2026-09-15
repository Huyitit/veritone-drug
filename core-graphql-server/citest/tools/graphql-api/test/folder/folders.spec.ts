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

const testDataRegistryName = `${citestMarker}-Folder-test-${Date.now()}`;

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

describe('citest_folder: Folders', () => {
  const rootFolderType = RootFolderType.Watchlist;

  const testStateObject: any = {
    treeObjectId: null,
    otherFolderId: null,
    testName: null,
    testDescription: null,
    testParentId: null,
    testMoveParentId: null,
    testOrderIndex: 0,
    testIsDeleted: false,
    organizationId: null,
    orgRootFolderId: null,
    otherDescendantFolderId: null
  };

  let watchlistId: any,
    watchlistName: any,
    watchlistTreeObjectId: any,
    sharedFolderId: any,
    watchlistId1: any,
    watchlistFolderId: any;

  const folderContentTemplate: any = {
    id: null,
    folderId: null,
    sdoId: null,
    schemaId: null
  };

  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let options: Record<string, string>;
  let generateTagKey: (suffix: number) => string;
  let useV2FoldersEnabled = false;

  beforeAll(async () => {
    const tagPrefixTimestamp = Date.now();
    generateTagKey = (suffix: number) =>
      `tagkey_${tagPrefixTimestamp}_${suffix}`;

    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    options = isolatedSuperadmin.options;

    // check v2FoldersEnabled feature flag on this spec's isolated org.
    const meRes = await isolatedSuperadmin.client.sdk.me();
    expect(meRes?.data?.me).toBeDefined();
    const isV2Folders =
      _.get(
        meRes,
        'data.me.organization.jsondata.features.v2FoldersEnabled'
      ) === 'enabled';
    useV2FoldersEnabled = (global as any).v2FoldersAvailable && isV2Folders;

    const dataRegistryForTest =
      await createDataRegistryAndSDOForContentTemplate(
        isolatedSuperadmin.client,
        options
      );
    folderContentTemplate.sdoId = dataRegistryForTest.sdoId;
    folderContentTemplate.schemaId = dataRegistryForTest.schemaId;
    expect(folderContentTemplate.sdoId).toBeDefined();
    expect(folderContentTemplate.schemaId).toBeDefined();
  });

  afterAll(async () => {
    if (folderContentTemplate.sdoId) {
      await safe('delete structured data', () =>
        isolatedSuperadmin.client.sdk.deleteStructuredData(
          {
            input: {
              id: folderContentTemplate.sdoId,
              schemaId: folderContentTemplate.schemaId
            }
          },
          options
        )
      );
    }
    if (folderContentTemplate.schemaId) {
      await safe('delete schema', () =>
        isolatedSuperadmin.client.sdk.updateSchemaState(
          {
            input: {
              id: folderContentTemplate.schemaId,
              status: 'deleted' as any
            }
          },
          options
        )
      );
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('Root Folders', () => {
    it('create root folders', async () => {
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
      testStateObject.testParentId = rootFolders![1]!.treeObjectId;
      testStateObject.testMoveParentId = rootFolders![0]!.treeObjectId;

      const orgRootFolder = _.head(
        _.filter(rootFolders, (rf: any) => !_.isNil(rf.organizationId))
      );
      testStateObject.orgRootFolderId = (orgRootFolder as any).id;
    });

    it('get root folders', async () => {
      const rootFoldersRes = await isolatedSuperadmin.client.sdk.rootFolders(
        { rootFolderType: RootFolderType.Watchlist },
        options
      );
      const rootFolders = rootFoldersRes?.data?.rootFolders ?? [];
      // should get organization's root Folder for this identity
      expect(rootFolders).toBeDefined();
      expect(rootFolders.length >= 1).toEqual(true);
      expect(rootFolders[0]?.id).toEqual(testStateObject.orgRootFolderId);
      expect(rootFolders[0]?.organizationId).toBeDefined();
      testStateObject.organizationId = rootFolders[0]?.organizationId;
    });
  });

  describe('Folders', () => {
    it('create folder: failed to create a new folder due to invalid folder name', async () => {
      const testDescription = citestMarker + '-graphql-folders-description';
      try {
        const result = await isolatedSuperadmin.client.sdk.createFolder(
          {
            input: {
              name: '',
              description: testDescription,
              parentId: testStateObject.testParentId
            }
          },
          options
        );
        expect(result).not.toBeDefined();
      } catch (ex) {
        expect(ex).toBeDefined();
        expect(`${ex}`).toContain(`the name field is required.`);
      }
    });

    it('create folder: folder name includes spaces', async () => {
      const testNameExpected =
        citestMarker + '-graphql-test-folders-' + uuidv4();
      const testName = `   ${testNameExpected}   `;
      const testDescription = citestMarker + '-graphql-folders-description';

      const folderRes = await isolatedSuperadmin.client.sdk.createFolder(
        {
          input: {
            name: testName,
            description: testDescription,
            parentId: testStateObject.testParentId,
            orderIndex: testStateObject.testOrderIndex,
            rootFolderType: RootFolderType.Watchlist
          }
        },
        options
      );
      const folder = folderRes?.data?.createFolder;
      expect(folder).toBeDefined();
      expect(folder?.name).toEqual(testNameExpected);
      testStateObject.folderSpaceId = folder?.id;
    });

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
        options
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
        options
      );

      testStateObject.treeObjectId = folder?.data?.createFolder?.treeObjectId;
      testStateObject.folderId = folder?.data?.createFolder?.id;
      testStateObject.otherFolderId = otherFolder?.data?.createFolder?.id;
      expect(testStateObject.treeObjectId).toBeDefined();
      expect(testStateObject.otherFolderId).toBeDefined();

      expect(folder?.data?.createFolder?.id).toBeDefined();
      expect(folder?.data?.createFolder?.name).toEqual(
        testStateObject.testName
      );

      expect(folder?.data?.createFolder?.entityTags).toMatchObject([
        { tagKey: generateTagKey(1), tagValue: 'tag_value' },
        { tagKey: generateTagKey(2), tagValue: 'tag_value' }
      ]);
      expect(otherFolder?.data?.createFolder?.entityTags).toMatchObject([
        { tagKey: generateTagKey(3), tagValue: 'tag_value' },
        { tagKey: generateTagKey(4), tagValue: 'tag_value' }
      ]);
    });

    it('create a descendant folder for filtering', async () => {
      const folder = await isolatedSuperadmin.client.sdk.createFolder(
        {
          input: {
            name: `${testStateObject.testName}-descendant-other`,
            description: testStateObject.testDescription,
            parentId: testStateObject.otherFolderId,
            orderIndex: testStateObject.testOrderIndex,
            rootFolderType,
            entityTags: [
              { tagKey: generateTagKey(3), tagValue: 'tag_value' },
              { tagKey: generateTagKey(7), tagValue: 'tag_value' }
            ]
          }
        },
        options
      );
      testStateObject.otherDescendantFolderId = folder?.data?.createFolder?.id;
      expect(testStateObject.otherDescendantFolderId).toBeDefined();
      expect(folder?.data?.createFolder?.entityTags).toMatchObject([
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
        options
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
        testStateObject.otherFolderId,
        testStateObject.otherDescendantFolderId
      ]);
    });

    it('create folder content template', async () => {
      const result: any = await isolatedSuperadmin.client.query(
        `mutation ($input: CreateFolderContentTempate!) {
          createFolderContentTempate(input: $input) {
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
        {
          input: {
            folderId: testStateObject.treeObjectId,
            sdoId: folderContentTemplate.sdoId,
            schemaId: folderContentTemplate.schemaId
          }
        },
        options
      );
      expect(result.createFolderContentTempate.id).toBeDefined();
      expect([
        testStateObject.folderId,
        testStateObject.treeObjectId
      ]).toContain(result.createFolderContentTempate.folderId);
      expect(result.createFolderContentTempate.sdoId).toEqual(
        folderContentTemplate.sdoId
      );
      expect(result.createFolderContentTempate.schemaId).toEqual(
        folderContentTemplate.schemaId
      );
    });

    it('create more folder content template', async () => {
      const result: any = await isolatedSuperadmin.client.query(
        `mutation ($input: CreateFolderContentTempate!) {
          createFolderContentTempate(input: $input) {
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
        {
          input: {
            folderId: testStateObject.treeObjectId,
            sdoId: folderContentTemplate.sdoId,
            schemaId: folderContentTemplate.schemaId
          }
        },
        options
      );
      expect(result.createFolderContentTempate.id).toBeDefined();
      folderContentTemplate.id = result.createFolderContentTempate.id;
      expect([
        testStateObject.folderId,
        testStateObject.treeObjectId
      ]).toContain(result.createFolderContentTempate.folderId);
      expect(result.createFolderContentTempate.sdoId).toEqual(
        folderContentTemplate.sdoId
      );
      expect(result.createFolderContentTempate.schemaId).toEqual(
        folderContentTemplate.schemaId
      );
    });

    it('update folder content template', async () => {
      const result: any = await isolatedSuperadmin.client.query(
        `mutation ($input: UpdateFolderContentTempate!) {
          updateFolderContentTempate(input: $input) {
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
        {
          input: {
            id: folderContentTemplate.id,
            sdoId: folderContentTemplate.sdoId
          }
        },
        options
      );
      expect(result.updateFolderContentTempate.id).toBeDefined();
      expect([
        testStateObject.folderId,
        testStateObject.treeObjectId
      ]).toContain(result.updateFolderContentTempate.folderId);
      expect(result.updateFolderContentTempate.sdoId).toEqual(
        folderContentTemplate.sdoId
      );
      expect(result.updateFolderContentTempate.schemaId).toEqual(
        folderContentTemplate.schemaId
      );
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
        folder(id: "${testStateObject.treeObjectId}") {
          ...folderFields
        }
        otherFolder: folder(id: "${testStateObject.otherFolderId}") {
          ...folderFields
        }
      }`;
      const result: any = await isolatedSuperadmin.client.query(
        query,
        {},
        options
      );
      expect(result.folder.id).toBeDefined();
      expect(result.folder.typeId).toEqual(1);
      expect(_.get(result, 'folder.parent.treeObjectId')).toEqual(
        testStateObject.testParentId
      );
      expect([
        testStateObject.folderId,
        testStateObject.treeObjectId
      ]).toContain(_.get(result, 'folder.contentTemplates[0].folderId'));
      expect(_.get(result, 'otherFolder.parent.treeObjectId')).toEqual(
        testStateObject.testMoveParentId
      );
      expect(_.get(result, 'folder.orderIndex')).toEqual(
        testStateObject.testOrderIndex
      );
      expect(_.get(result, 'otherFolder.orderIndex')).toEqual(
        testStateObject.testOrderIndex
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

    it('get a rootFolder', async () => {
      const query = `query {
        folder(id: "${testStateObject.orgRootFolderId}") {
          id
          name
          typeId
          rootFolderTypeId
          organizationId
          treeObjectId
          parent {
            treeObjectId
          }
        }
      }`;
      const result: any = await isolatedSuperadmin.client.query(
        query,
        {},
        options
      );
      expect(result.folder).toBeDefined();
      expect(result.folder.id).toEqual(testStateObject.orgRootFolderId);
      expect(result.folder.typeId).toEqual(4);
      expect(result.folder.rootFolderTypeId).toBeDefined();
      expect(result.folder.organizationId).toBeDefined();
      expect(result.folder.parent).toBeNull();
    });

    it('delete folder content template', async () => {
      const result: any = await isolatedSuperadmin.client.query(
        `mutation ($id: ID!) {
          deleteFolderContentTempate(id: $id) {
            id
            message
          }
        }`,
        { id: folderContentTemplate.id },
        options
      );
      expect(result.deleteFolderContentTempate.id).toBeDefined();
      expect(result.deleteFolderContentTempate.id).toEqual(
        folderContentTemplate.id
      );
    });

    it('create a watchlist in the folder', async () => {
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
            parentFolderId: testStateObject.treeObjectId,
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
        options
      );
      watchlistId = watchlist?.data?.createWatchlist?.id;
      watchlistName = watchlist?.data?.createWatchlist?.name;
      watchlistTreeObjectId =
        watchlist?.data?.createWatchlist?.treeObjectId || watchlistId;
      expect(watchlistId).toBeDefined();
      expect(watchlistName).toBeDefined();
      expect(watchlistTreeObjectId).toBeDefined();
    });

    it('return childWatchlists', async () => {
      const query = `query {
            folder(id: "${testStateObject.treeObjectId}") {
              childWatchlists (limit: 1, name: "${watchlistName}") {
                count
                offset
                limit
                records {
                  id
                  treeObjectId
                  folders {
                    treeObjectId
                  }
                }
              }
            }
          }`;

      const result: any = await isolatedSuperadmin.client.query(
        query,
        {},
        options
      );
      const childWatchlists = _.get(result, 'folder.childWatchlists', {});
      expect(childWatchlists.count).toEqual(1);
      expect(childWatchlists.records).toHaveLength(1);
      expect(_.get(childWatchlists, 'records[0].id')).toEqual(watchlistId);
      expect(_.get(childWatchlists, 'records[0].treeObjectId')).toBeDefined();
      expect(
        _.get(childWatchlists, 'records[0].folders[0].treeObjectId')
      ).toEqual(testStateObject.treeObjectId);
    });

    it('create a watchlist folder', async () => {
      testStateObject.testName =
        citestMarker + '-graphql-test-watchlist-folders-' + uuidv4();
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
        options
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
        options
      );
      watchlistId1 = watchlist?.data?.createWatchlist?.id;
      expect(watchlistId1).toBeDefined();
    });

    it('file a watchlist into a folder', async () => {
      const result: any = await isolatedSuperadmin.client.query(
        `mutation fileWatchlist($input: FileWatchlist!) {
          fileWatchlist(input: $input) {
            id
            folders {
              id
            }
          }
        }`,
        {
          input: {
            orderIndex: 1,
            watchlistId: watchlistId1,
            folderId: watchlistFolderId
          }
        },
        options
      );
      const filedWatchlistId = _.get(result, 'fileWatchlist.id');
      expect(filedWatchlistId).toEqual(watchlistId1);
    });

    it('throw folder content template not found after deleting', async () => {
      expect(
        isolatedSuperadmin.client.query(
          `mutation ($input: UpdateFolderContentTempate!) {
            updateFolderContentTempate(input: $input) {
              id
            }
          }`,
          {
            input: {
              id: folderContentTemplate.id,
              sdoId: folderContentTemplate.sdoId
            }
          },
          options
        )
      ).rejects.toThrow('Folder Content Template');
    });

    it('update a folder', async () => {
      const updateFolder = await isolatedSuperadmin.client.sdk.updateFolder(
        {
          input: {
            id: testStateObject.treeObjectId,
            name: `${testStateObject.testName}-update`,
            entityTags: [
              { tagKey: generateTagKey(5), tagValue: 'tag_value' },
              { tagKey: generateTagKey(6), tagValue: 'tag_value' }
            ]
          }
        },
        options
      );
      expect(updateFolder?.data?.updateFolder?.name).toEqual(
        `${testStateObject.testName}-update`
      );
      expect(updateFolder?.data?.updateFolder?.entityTags).toMatchObject([
        { tagKey: generateTagKey(5), tagValue: 'tag_value' },
        { tagKey: generateTagKey(6), tagValue: 'tag_value' }
      ]);
    });

    it('move a folder', async () => {
      const moveFolder = await moveFolderRaw(
        isolatedSuperadmin.client,
        {
          treeObjectId: testStateObject.treeObjectId,
          prevParentTreeObjectId: testStateObject.testParentId,
          newParentTreeObjectId: testStateObject.testMoveParentId,
          prevOrderIndex: testStateObject.testOrderIndex,
          newOrderIndex: testStateObject.testOrderIndex,
          rootFolderType
        },
        options
      );
      expect(moveFolder?.treeObjectId).toEqual(testStateObject.treeObjectId);
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
            newParentTreeObjectId: testStateObject.treeObjectId
          },
          options
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
          folderOverview(ids: "${testStateObject.treeObjectId}", rootFolderType: watchlist) {
            childFoldersCount
            childNonFolderObjectsCount
            treeObjectIds
          }
        }`,
        {},
        options
      );
      const folderOverview = result.folderOverview;
      expect(folderOverview.childFoldersCount).toEqual(0);
      expect(folderOverview.childNonFolderObjectsCount).toEqual(1);
      expect(_.get(folderOverview, 'treeObjectIds.0')).toEqual(
        useV2FoldersEnabled ? watchlistId : watchlistTreeObjectId
      );
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
        { ids: [testStateObject.treeObjectId] },
        options
      );
      const folderSummaryDetails = result.folderSummaryDetails;
      expect(folderSummaryDetails).toHaveLength(2);
      expect(folderSummaryDetails[0].treeObjectId).toEqual(
        useV2FoldersEnabled ? watchlistId : watchlistTreeObjectId
      );
      expect(folderSummaryDetails[0].depth).toEqual(1);
      expect(folderSummaryDetails[1].treeObjectId).toEqual(
        testStateObject.treeObjectId
      );
      expect(folderSummaryDetails[1].typeId).toEqual(1);
      expect(_.get(folderSummaryDetails, '1.childWatchlistsIds.0')).toEqual(
        watchlistId
      );
      expect(folderSummaryDetails[1].depth).toEqual(0);
    });

    it('delete watchlist in the folder', async () => {
      const deletedRes = await isolatedSuperadmin.client.sdk.deleteWatchlist(
        { id: watchlistId },
        options
      );
      expect(deletedRes?.data?.deleteWatchlist?.id).toEqual(watchlistId);

      const deletedRes1 = await isolatedSuperadmin.client.sdk.deleteWatchlist(
        { id: watchlistId1 },
        options
      );
      expect(deletedRes1?.data?.deleteWatchlist?.id).toEqual(watchlistId1);
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
          options
        );
      } catch (error) {
        expect(`${error}`).toContain(`Can not delete root folder`);
      }
    });

    it('delete a descendant folder before deleting its parent folder', async () => {
      const deleteRes = await isolatedSuperadmin.client.sdk.deleteFolder(
        {
          input: {
            id: testStateObject.otherDescendantFolderId,
            orderIndex: testStateObject.testOrderIndex
          }
        },
        options
      );
      expect(testStateObject.otherDescendantFolderId).toEqual(
        deleteRes?.data?.deleteFolder?.id
      );
    });

    it('delete a folder', async () => {
      const deleteFolderRes = await isolatedSuperadmin.client.sdk.deleteFolder(
        {
          input: {
            id: testStateObject.treeObjectId,
            orderIndex: testStateObject.testOrderIndex
          }
        },
        options
      );
      const deleteOtherFolderRes =
        await isolatedSuperadmin.client.sdk.deleteFolder(
          {
            input: {
              id: testStateObject.otherFolderId,
              orderIndex: testStateObject.testOrderIndex
            }
          },
          options
        );
      await isolatedSuperadmin.client.sdk.deleteFolder(
        {
          input: {
            id: testStateObject.folderSpaceId,
            orderIndex: testStateObject.testOrderIndex
          }
        },
        options
      );
      const deleteWatchlistFolderRes =
        await isolatedSuperadmin.client.sdk.deleteFolder(
          {
            input: { id: watchlistFolderId, orderIndex: 0 }
          },
          options
        );

      testStateObject.testIsDeleted = true;

      expect([
        testStateObject.folderId,
        testStateObject.treeObjectId
      ]).toContain(deleteFolderRes?.data?.deleteFolder?.id);
      expect(testStateObject.otherFolderId).toEqual(
        deleteOtherFolderRes?.data?.deleteFolder?.id
      );
      expect(watchlistFolderId).toEqual(
        deleteWatchlistFolderRes?.data?.deleteFolder?.id
      );
    });

    it('throw folder not found after deleting', async () => {
      expect(
        isolatedSuperadmin.client.sdk.folder(
          { id: testStateObject.treeObjectId },
          options
        )
      ).rejects.toThrow('not_found');
    });

    it('share a folder', async () => {
      const query = `mutation {
        shareFolder (input: {treeObjectId: "${testStateObject.testParentId}", readOrganizationIds: [${testStateObject.organizationId}]}) {
          id
          treeObjectId
          sharedWith {
            read
            write
          }
        }
      }`;

      const shareRes = await isolatedSuperadmin.client.query(
        query,
        {},
        options
      );
      const shareFolder = shareRes?.shareFolder;
      expect(shareFolder?.treeObjectId).toEqual(testStateObject.testParentId);
      expect(shareFolder?.sharedWith?.read).toContainEqual(
        Number.parseInt(testStateObject.organizationId, 10)
      );
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
        options
      );
      const { sharedFolders } = result;
      if (sharedFolders.length) {
        sharedFolderId = sharedFolders[0].id;
      }
    });

    // TODO: Update get folder to allow regular users from shared organizations
    // to fetch folders they have access to via `shared_org_read`.

    it('fetch shared folder by id', async () => {
      if (sharedFolderId) {
        const result: any = await isolatedSuperadmin.client.query(
          `query($id: ID!) {
             folder(id: $id) {
                id
                sharedAccess
             }
          }`,
          { id: sharedFolderId },
          options
        );
        const { folder } = result;
        expect(folder.id).toEqual(sharedFolderId);
        expect(folder.sharedAccess).toContainEqual('read');
      }
    });
  });

  describe('Super Admin cross-org folder operations', () => {
    let targetOrg: any, targetOrgSetup: any, targetAdminOptions: any;
    let targetOrgRootFolderId: any, targetParentFolderId: any;
    let superAdminSubFolderId: any;

    const createOrgAndUserInput = {
      orgInput: {
        name: `${citestMarker}-org-super-admin-subfolder-${uuidv4()}`,
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
          }
        ]
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
        }
      ]
    };

    beforeAll(async () => {
      targetOrgSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );

      targetOrg = targetOrgSetup.org;
      expect(targetOrg).toBeDefined();
      expect(targetOrg.name).toContain(
        `${citestMarker}-org-super-admin-subfolder`
      );

      const targetAdminUser = targetOrgSetup.listOptions?.[0];
      targetAdminOptions = targetAdminUser?.requestOptions;

      const rootFoldersRes =
        await isolatedSuperadmin.client.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          targetAdminOptions
        );
      const rootFoldersResult = rootFoldersRes?.data?.createRootFolders ?? [];
      expect(rootFoldersResult).toBeDefined();

      const orgRootFolder = rootFoldersResult.find((rf: any) => rf.ownerId);
      expect(orgRootFolder).toBeDefined();
      targetOrgRootFolderId = orgRootFolder?.id;

      const parentFolderRes = await isolatedSuperadmin.client.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-parent-folder-${Date.now()}`,
            description: `${citestMarker}-parent-folder-desc`,
            parentId: targetOrgRootFolderId,
            rootFolderType: RootFolderType.Watchlist
          }
        },
        targetAdminOptions
      );
      const parentFolder = parentFolderRes?.data?.createFolder;
      expect(parentFolder).toBeDefined();
      expect(parentFolder?.id).toBeDefined();
      targetParentFolderId = parentFolder?.id;
    });

    it('super admin can create sub folder in any org', async () => {
      const subFolderName = `${citestMarker}-super-admin-subfolder-${Date.now()}`;

      const createFolderRes = await isolatedSuperadmin.client.sdk.createFolder(
        {
          input: {
            name: subFolderName,
            description: `${citestMarker}-subfolder-created-by-super-admin`,
            parentId: targetParentFolderId,
            rootFolderType: RootFolderType.Watchlist,
            orderIndex: 0
          }
        },
        options
      );
      const createFolder = createFolderRes?.data?.createFolder;
      expect(createFolder).toBeDefined();
      expect(createFolder?.id).toBeDefined();
      expect(createFolder?.name).toEqual(subFolderName);
      expect(createFolder?.description).toEqual(
        `${citestMarker}-subfolder-created-by-super-admin`
      );
      expect(createFolder?.status).toEqual('active');
      expect(createFolder?.parent?.id).toEqual(targetParentFolderId);
      superAdminSubFolderId = createFolder?.id;
    });

    afterAll(async () => {
      if (superAdminSubFolderId) {
        await safe('delete super admin subfolder', () =>
          isolatedSuperadmin.client.sdk.deleteFolder(
            { input: { id: superAdminSubFolderId, orderIndex: 0 } },
            targetAdminOptions
          )
        );
      }
      if (targetParentFolderId) {
        await safe('delete target parent folder', () =>
          isolatedSuperadmin.client.sdk.deleteFolder(
            { input: { id: targetParentFolderId, orderIndex: 0 } },
            targetAdminOptions
          )
        );
      }

      const listUserIds = (targetOrgSetup?.listOptions ?? []).map(
        (user: any) => user.userId
      );
      if (listUserIds.length > 0) {
        await safe('delete users', async () => {
          for (const id of listUserIds) {
            await gqlClient.sdk.deleteUser({ id }, options);
          }
        });
      }

      if (targetOrg?.id) {
        await safe('delete target org', () =>
          gqlClient.sdk.updateOrganization(
            { input: { id: targetOrg.id, status: OrganizationStatus.Deleted } },
            options
          )
        );
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
          options
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
      leaf = await createFolder(`${citestMarker}-leaf-${Date.now()}`, child.id);
    });

    it('should validate folderPath hierarchy for leaf folder', async () => {
      const result: any = await isolatedSuperadmin.client.query(
        `query {
          folder(id: "${leaf.id}") {
            folderPath {
              id
              parent { id }
            }
          }
        }`,
        {},
        options
      );
      const folderPath = result.folder.folderPath;

      expect(folderPath.length).toEqual(4);
      expect(folderPath.map((f: any) => f.id)).toEqual([
        testStateObject.orgRootFolderId,
        parent.id,
        child.id,
        leaf.id
      ]);
      expect(folderPath[1].parent.id).toEqual(testStateObject.orgRootFolderId);
      expect(folderPath[2].parent.id).toEqual(parent.id);
      expect(folderPath[3].parent.id).toEqual(child.id);
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
        options
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
        {},
        options
      );
      const tdo = result.temporalDataObject;

      expect(tdo.foldersTreeObjectIds).toContain(parent.treeObjectId);
      expect(tdo.foldersTreeObjectIds).toContain(child.treeObjectId);
      expect(tdo.foldersTreeObjectIds).toContain(leaf.treeObjectId);
      expect(tdo.foldersTreeObjectIds).not.toContain(
        testStateObject.testParentId
      );

      const folderPath = tdo.folders[0].folderPath;
      expect(folderPath.length).toEqual(4);
      expect(folderPath.map((f: any) => f.id)).toEqual([
        testStateObject.orgRootFolderId,
        parent.id,
        child.id,
        leaf.id
      ]);
    });

    afterAll(async () => {
      if (tdoId) {
        await safe('delete TDO', () =>
          isolatedSuperadmin.client.sdk.deleteTDO({ id: tdoId }, options)
        );
      }
      for (const f of [leaf, child, parent]) {
        if (f?.id) {
          await safe(`delete folder ${f.id}`, () =>
            isolatedSuperadmin.client.sdk.deleteFolder(
              { input: { id: f.id, orderIndex: 0 } },
              options
            )
          );
        }
      }
    });
  });
});

async function createDataRegistryAndSDOForContentTemplate(
  client: GraphqlClient,
  options: any
): Promise<{ sdoId: string; schemaId: string }> {
  const createRes = await client.sdk.createDataRegistry(
    {
      input: {
        source: 'Some url',
        name: testDataRegistryName,
        description: `${citestMarker}-folder-test`,
        isPublic: true
      }
    },
    options
  );
  const dataRegistryId = createRes?.data?.createDataRegistry?.id;
  expect(dataRegistryId).toBeDefined();

  const upsertRes = await client.sdk.upsertSchemaDraft(
    {
      input: {
        dataRegistryId: dataRegistryId!,
        schema: {
          $id: 'http://example.com/example.json',
          type: 'object',
          definitions: {},
          $schema: 'http://json-schema.org/draft-07/schema#',
          properties: {
            foo: {
              $id: '/properties/foo',
              type: 'string',
              title: 'The Foo Schema',
              default: '',
              examples: ['bar']
            },
            bar: {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          }
        }
      }
    },
    options
  );
  const schemaId = upsertRes?.data?.upsertSchemaDraft?.id;
  expect(schemaId).toBeDefined();

  const publishRes = await client.sdk.updateSchemaState(
    { input: { id: schemaId!, status: 'published' as any } },
    options
  );
  expect(publishRes?.data?.updateSchemaState?.status).toEqual('published');

  const sdoRes = await client.sdk.createStructuredData(
    {
      input: {
        schemaId: schemaId!,
        data: { example: 'example' }
      }
    },
    options
  );
  const sdoId = sdoRes?.data?.createStructuredData?.id;
  expect(sdoId).toBeDefined();

  const findRes: any = await client.query(
    `query ($id: ID!) {
      dataRegistries(id: $id) {
        records {
          id
          schemas(status: published) {
            records {
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
    { id: dataRegistryId },
    options
  );

  const foundSdoId = _.get(
    findRes,
    'dataRegistries.records[0].schemas.records[0].structuredDataObjects.records[0].id'
  );
  const foundSchemaId = _.get(
    findRes,
    'dataRegistries.records[0].schemas.records[0].structuredDataObjects.records[0].schemaId'
  );

  return { sdoId: foundSdoId, schemaId: foundSchemaId };
}
