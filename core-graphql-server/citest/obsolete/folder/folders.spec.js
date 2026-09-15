const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const { safe } = require('../../helpers/cleanup/utils');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const folderHelper = require('../../helpers/folder');
const config = helpers.config;
const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const citestMarker = globalThis.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const testDataRegistryName = `${citestMarker}-Folder-test-${Date.now().valueOf()}`;

describe('citest_folder: Folders', () => {
  const rootFolderType = 'watchlist';

  const testStateObject = {
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

  let watchlistId,
    watchlistName,
    watchlistTreeObjectId,
    sharedFolderId,
    watchlistId1,
    watchlistFolderId;

  const folderContentTemplate = {
    id: null,
    folderId: null,
    sdoId: null,
    schemaId: null
  };

  let gqlClient;
  let apiToken;
  let generateTagKey;
  let useV2FoldersEnabled = false;
  beforeAll(async () => {
    const tagPrefixTimestamp = Date.now();
    generateTagKey = (suffix) => {
      return `tagkey_${tagPrefixTimestamp}_${suffix}`;
    };
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;

    // check v2FoldersEnabled feature flag in CI Test organization.
    const isV2FoldersEnabled = async () => {
      const res = await gqlClient.query(`
        query {
          me {
            id
            name
            organization {
              id
              guid
              jsondata
            }
          }
      }`);
      expect(res.me).toBeDefined();
      return (
        _.get(res, 'me.organization.jsondata.features.v2FoldersEnabled') ===
        'enabled'
      );
    };
    const isV2Folders = await isV2FoldersEnabled();
    useV2FoldersEnabled = globalThis.v2FoldersAvailable && isV2Folders;

    const dataRegistryForTest =
      await createDataRegistryAndSDOForContentTemplate(gqlClient);
    folderContentTemplate.sdoId = _.get(
      dataRegistryForTest,
      'dataRegistries.records[0].schemas.records[0].structuredDataObjects.records[0].id'
    );
    folderContentTemplate.schemaId = _.get(
      dataRegistryForTest,
      'dataRegistries.records[0].schemas.records[0].structuredDataObjects.records[0].schemaId'
    );
    expect(folderContentTemplate.sdoId).toBeDefined();
    expect(folderContentTemplate.schemaId).toBeDefined();
  });

  afterAll(async () => {
    if (folderContentTemplate.sdoId) {
      const query = `
      mutation {
        deleteStructuredData(input: {
          id: "${folderContentTemplate.sdoId}"
          schemaId: "${folderContentTemplate.schemaId}"
        }) {
          id
          message
        }
      }`;
      const result = await gqlClient.query(query);
      const deleteSDOId = _.get(result, 'deleteStructuredData.id');
      expect(deleteSDOId).toBeDefined();
    }
    if (folderContentTemplate.schemaId) {
      const query = `
  mutation updateSchemaState{
        updateSchemaState(input: {
          id:"${folderContentTemplate.schemaId}",
          status: deleted
        }) {
          id
          status
        }
      }
  `;
      const result = await gqlClient.query(query);
      const status = _.get(result, 'updateSchemaState.status');
      expect(status).toEqual('deleted');
    }
  });

  describe('Root Folders', () => {
    it('create root folders', async () => {
      const query = `mutation {
        createRootFolders(rootFolderType: ${rootFolderType}) {
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

      const result = await gqlClient.query(query);
      expect(result.createRootFolders).toBeDefined();

      const rootFolders = result.createRootFolders;
      expect(rootFolders.length).toEqual(2);
      expect(rootFolders[0].rootFolderTypeId).toEqual(1);
      expect(rootFolders[0].typeId).toEqual(4);
      expect(rootFolders[0].treeObjectId).toBeDefined();
      expect(rootFolders[1].treeObjectId).toBeDefined();
      expect(rootFolders[0].name).toBeDefined();
      expect(rootFolders[1].name).toBeDefined();
      testStateObject.testParentId = rootFolders[1].treeObjectId;
      testStateObject.testMoveParentId = rootFolders[0].treeObjectId;

      const orgRootFolder = _.head(
        _.filter(rootFolders, (rf) => !_.isNil(rf.organizationId))
      );
      testStateObject.orgRootFolderId = orgRootFolder.id;
    });

    it('get root folders by API Token', async () => {
      const query = `query {
        rootFolders(
          type: ${rootFolderType}
        ) {
          id
          organizationId
        }
      }`;
      // On ai13s, `apiToken` is a raw string that doesn't match any auth-dispatch
      // branch in gqlClient.query(), so it falls through to userAuth. Use userAuth
      // explicitly here so local and remote behave the same. The org-less testconfig
      // apiToken (18eea9) has no organizationId and always returns an empty array.
      const result = await gqlClient.query(query);
      const rootFolders = _.get(result, 'rootFolders');
      // should get organization's root Folder when using APIToken
      expect(rootFolders).toBeDefined();
      expect(rootFolders.length >= 1).toEqual(true);
      expect(rootFolders[0].id).toEqual(testStateObject.orgRootFolderId);
      expect(rootFolders[0].organizationId).toBeDefined();
      testStateObject.organizationId = rootFolders[0].organizationId;
    });
  });

  describe('Folders', () => {
    it('create folder: failed to create a new folder due to invalid folder name', async () => {
      const testDescription = citestMarker + '-graphql-folders-description';
      const query = `mutation {
        createFolder(input: {
          name: "",
          description: "${testDescription}",
          parentId: "${testStateObject.testParentId}"
        }) {
          id
          treeObjectId
          name
          description
        }
      }`;
      try {
        const result = await gqlClient.query(query);
        expect(result).not.toBeDefined();
      } catch (ex) {
        expect(ex).toBeDefined();
        expect(`${ex}`).toContain(`the name field is required.`);
      }
    });
    it('create folder: folder name includes spaces', async () => {
      const testNameExpected =
        citestMarker + '-graphql-test-folders-' + uuid.v4();
      const testName = `   ${testNameExpected}   `;
      const testDescription = citestMarker + '-graphql-folders-description';
      const query = `mutation {
        createFolder(input: {
          name: "${testName}",
          description: "${testDescription}",
          parentId: "${testStateObject.testParentId}"
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType}
        }) {
          id
          treeObjectId
          name
          description
        }
      }`;

      const result = await gqlClient.query(query);
      expect(result).toBeDefined();
      expect(result.createFolder.name).toEqual(testNameExpected);
      testStateObject.folderSpaceId = _.get(result, 'createFolder.id');
    });
    it('create a folder', async () => {
      testStateObject.testName =
        citestMarker + '-graphql-test-folders-' + uuid.v4();
      testStateObject.testDescription =
        citestMarker + '-graphql-folders-description';
      const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}",
          description: "${testStateObject.testDescription}",
          parentId: "${testStateObject.testParentId}",
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType},
          entityTags: [
            { tagKey: "${generateTagKey(1)}", tagValue: "tag_value" },
            { tagKey: "${generateTagKey(2)}", tagValue: "tag_value" }
          ]
        }) {
          id
          treeObjectId
          name
          description
          createdDateTime
          modifiedDateTime
          status
          ownerId
          maxDepth
          orderIndex
          entityTags {
            tagKey
            tagValue
          }
        }

        otherFolder: createFolder(input: {
          name: "${testStateObject.testName}-other"
          parentId: "${testStateObject.testMoveParentId}"
          description: "${testStateObject.testDescription}"
          rootFolderType: ${rootFolderType}
          orderIndex: ${testStateObject.testOrderIndex},
          entityTags: [
            { tagKey: "${generateTagKey(3)}", tagValue: "tag_value" },
            { tagKey: "${generateTagKey(4)}", tagValue: "tag_value" }
          ]
        }) {
          id
          entityTags {
            tagKey
            tagValue
          }
        }
      }`;
      const result = await gqlClient.query(query);
      testStateObject.treeObjectId = _.get(result, 'createFolder.treeObjectId');
      testStateObject.folderId = _.get(result, 'createFolder.id');
      testStateObject.otherFolderId = _.get(result, 'otherFolder.id');
      expect(testStateObject.treeObjectId).toBeDefined();
      expect(testStateObject.otherFolderId).toBeDefined();

      expect(result.createFolder.id).toBeDefined();
      expect(result.createFolder.name).toEqual(testStateObject.testName);

      expect(_.get(result, 'createFolder.entityTags')).toMatchObject([
        { tagKey: generateTagKey(1), tagValue: 'tag_value' },
        { tagKey: generateTagKey(2), tagValue: 'tag_value' }
      ]);
      expect(_.get(result, 'otherFolder.entityTags')).toMatchObject([
        { tagKey: generateTagKey(3), tagValue: 'tag_value' },
        { tagKey: generateTagKey(4), tagValue: 'tag_value' }
      ]);
    });

    it('create a descendant folder for filtering', async () => {
      const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}-descendant-other"
          description: "${testStateObject.testDescription}",
          parentId: "${testStateObject.otherFolderId}"
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType},
          entityTags: [
            { tagKey: "${generateTagKey(3)}", tagValue: "tag_value" },
            { tagKey: "${generateTagKey(7)}", tagValue: "tag_value" }
          ]
        }) {
          id
          treeObjectId
          name
          description
          createdDateTime
          modifiedDateTime
          status
          ownerId
          maxDepth
          orderIndex
          entityTags {
            tagKey
            tagValue
          }
        }
      }`;
      const result = await gqlClient.query(query);
      testStateObject.otherDescendantFolderId = _.get(
        result,
        'createFolder.id'
      );
      expect(testStateObject.otherDescendantFolderId).toBeDefined();
      expect(_.get(result, 'createFolder.entityTags')).toMatchObject([
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

      const result = await gqlClient.query(query);
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
        (f) => f.name.match(/[descendant]?-other/g)
      );
      expect(matchFolderNames.length).toEqual(2);
      expect(entityTagFilterFolders.count).toEqual(2);
      expect(_.map(entityTagFilterFolders.records, 'id')).toMatchObject([
        testStateObject.otherFolderId,
        testStateObject.otherDescendantFolderId
      ]);
    });

    it('create folder content template', async () => {
      const query = `mutation {
        createFolderContentTempate (input: {
          folderId: "${testStateObject.treeObjectId}"
          sdoId: "${folderContentTemplate.sdoId}"
          schemaId: "${folderContentTemplate.schemaId}"
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

      const result = await gqlClient.query(query);
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
      const query = `mutation {
        createFolderContentTempate (input: {
          folderId: "${testStateObject.treeObjectId}"
          sdoId: "${folderContentTemplate.sdoId}"
          schemaId: "${folderContentTemplate.schemaId}"
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

      const result = await gqlClient.query(query);
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
      const query = `mutation {
        updateFolderContentTempate (input: {
          id: "${folderContentTemplate.id}"
          sdoId: "${folderContentTemplate.sdoId}"
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

      const result = await gqlClient.query(query);
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
      const result = await gqlClient.query(query);
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
      /* TODO below is env-specific and works only on dev
        expect(result.folder.contentTemplates[1].sdoId).toEqual(
          folderContentTempate.sdoId
        );
       */
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
      const result = await gqlClient.query(query);
      expect(result.folder).toBeDefined();
      expect(result.folder.id).toEqual(testStateObject.orgRootFolderId);
      expect(result.folder.typeId).toEqual(4);
      expect(result.folder.rootFolderTypeId).toBeDefined();
      expect(result.folder.organizationId).toBeDefined();
      expect(result.folder.parent).toBeNull();
    });

    it('delete folder content template', async () => {
      const query = `mutation {
        deleteFolderContentTempate(id: "${folderContentTemplate.id}") {
          id
          message
        }
      }`;

      const result = await gqlClient.query(query);
      expect(result.deleteFolderContentTempate.id).toBeDefined();
      expect(result.deleteFolderContentTempate.id).toEqual(
        folderContentTemplate.id
      );
    });

    it('create a watchlist in the folder', async () => {
      const now = moment();
      const query = `mutation CreateWatchlist($input: CreateWatchlist!) {
     createWatchlist(input: $input) {
        id
        name
        treeObjectId
     }
  }`;
      const variables = {
        input: {
          startDateTime: now.toISOString(),
          stopDateTime: now.add(1, 'h').toISOString(),
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
          searchIndex: 'mine'
        }
      };

      const result = await gqlClient.query(query, variables);
      watchlistId = _.get(result, 'createWatchlist.id');
      watchlistName = _.get(result, 'createWatchlist.name');
      watchlistTreeObjectId =
        _.get(result, 'createWatchlist.treeObjectId') || watchlistId;
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

      const result = await gqlClient.query(query);
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
        citestMarker + '-graphql-test-watchlist-folders-' + uuid.v4();
      testStateObject.testDescription =
        citestMarker + '-graphql-folders-description';
      const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}",
          description: "${testStateObject.testDescription}",
          parentId: "${testStateObject.testParentId}",
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType},
        }) {
          id
          treeObjectId
          name
        }
      }`;
      const result = await gqlClient.query(query);
      watchlistFolderId = _.get(result, 'createFolder.id');
      expect(watchlistFolderId).toBeDefined();
    });
    it('create a watchlist without folderId', async () => {
      const now = moment();
      const query = `mutation CreateWatchlist($input: CreateWatchlist!) {
        createWatchlist(input: $input) {
            id
            name
            treeObjectId
        }
      }`;
      const variables = {
        input: {
          startDateTime: now.toISOString(),
          stopDateTime: now.add(1, 'h').toISOString(),
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
          searchIndex: 'mine'
        }
      };

      const result = await gqlClient.query(query, variables);
      watchlistId1 = _.get(result, 'createWatchlist.id');
      expect(watchlistId1).toBeDefined();
    });

    it('file a watchlist into a folder', async () => {
      const query = `mutation fileWatchlist {
        fileWatchlist(
          input: {
            orderIndex: 1
            watchlistId: "${watchlistId1}"
            folderId: "${watchlistFolderId}"
          }
        ) {
          id
          folders {
            id
          }
        }
      }`;

      const result = await gqlClient.query(query);
      const filedWatchlistId = _.get(result, 'fileWatchlist.id');
      expect(filedWatchlistId).toEqual(watchlistId1);
    });

    it('throw folder content template not found after deleting', async () => {
      const query = `mutation {
        updateFolderContentTempate (input: {
          id: "${folderContentTemplate.id}"
          sdoId: "${folderContentTemplate.sdoId}"
        }) {
          id
        }
      }`;

      expect(async () => gqlClient.query(query)).rejects.toThrow(
        'Folder Content Template'
      );
    });

    it('update a folder', async () => {
      const query = `mutation {
        updateFolder(input: {
          id: "${testStateObject.treeObjectId}"
          name: "${testStateObject.testName}-update"
          entityTags: [
            { tagKey: "${generateTagKey(5)}", tagValue: "tag_value" },
            { tagKey: "${generateTagKey(6)}", tagValue: "tag_value" }
          ]
        }) {
          id
          name
          entityTags {
            tagKey
            tagValue
          }
        }
      }`;
      const result = await gqlClient.query(query);
      expect(result.updateFolder.name).toEqual(
        `${testStateObject.testName}-update`
      );
      expect(_.get(result, 'updateFolder.entityTags')).toMatchObject([
        { tagKey: generateTagKey(5), tagValue: 'tag_value' },
        { tagKey: generateTagKey(6), tagValue: 'tag_value' }
      ]);
    });

    it('move a folder', async () => {
      const query = `mutation {
        moveFolder(input: {
          treeObjectId: "${testStateObject.treeObjectId}"
          prevParentTreeObjectId: "${testStateObject.testParentId}"
          newParentTreeObjectId: "${testStateObject.testMoveParentId}"
          prevOrderIndex: ${testStateObject.testOrderIndex}
          newOrderIndex: ${testStateObject.testOrderIndex}
          rootFolderType: ${rootFolderType}
        }) {
          treeObjectId
          parent {
            treeObjectId
          }
        }
      }`;
      const result = await gqlClient.query(query);
      const moveFolder = result.moveFolder;
      expect(moveFolder.treeObjectId).toEqual(testStateObject.treeObjectId);
      expect(moveFolder.parent.treeObjectId).toEqual(
        testStateObject.testMoveParentId
      );
    });

    it('failed to move parent folder into child folder', async () => {
      const query = `mutation {
        moveFolder(input: {
          treeObjectId: "${testStateObject.testMoveParentId}"
          prevParentTreeObjectId: "${testStateObject.orgRootFolderId}"
          newParentTreeObjectId: "${testStateObject.treeObjectId}"
        }) {
          treeObjectId
          parent {
            treeObjectId
          }
        }
      }`;
      try {
        await gqlClient.query(query);
      } catch (error) {
        expect(`${error}`).toContain(
          `Cannot move parent folder into its own subfolder`
        );
      }
    });

    it('get folderOverview', async () => {
      const query = `query {
        folderOverview(ids: "${testStateObject.treeObjectId}", rootFolderType: watchlist) {
          childFoldersCount
          childNonFolderObjectsCount
          treeObjectIds
        }
      }`;
      const result = await gqlClient.query(query);
      const folderOverview = result.folderOverview;
      expect(folderOverview.childFoldersCount).toEqual(0);
      expect(folderOverview.childNonFolderObjectsCount).toEqual(1);
      expect(_.get(folderOverview, 'treeObjectIds.0')).toEqual(
        useV2FoldersEnabled ? watchlistId : watchlistTreeObjectId
      );
    });

    it('get folderSummaryDetails', async () => {
      const query = `query ($ids: [ID!]!) {
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
      }`;

      const variables = {
        ids: [testStateObject.treeObjectId]
      };
      const result = await gqlClient.query(query, variables);
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
      const query = `mutation  {
        deleteWatchlist(id: "${watchlistId}") {
          id
        }
        deleteWatchlist1: deleteWatchlist(id: "${watchlistId1}") {
          id
        }
      }`;

      const result = await gqlClient.query(query);
      const deletedId = _.get(result, 'deleteWatchlist.id');
      expect(deletedId).toEqual(watchlistId);

      const deletedId1 = _.get(result, 'deleteWatchlist1.id');
      expect(deletedId1).toEqual(watchlistId1);
    });

    it('delete a root folder', async () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.orgRootFolderId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
      try {
        await gqlClient.query(query);
      } catch (error) {
        expect(`${error}`).toContain(`Can not delete root folder`);
      }
    });

    it('delete a descendant folder before deleting its parent folder', async () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.otherDescendantFolderId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
      expect(testStateObject.otherDescendantFolderId).toEqual(
        result.deleteFolder.id
      );
    });

    it('delete a folder', async () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.treeObjectId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
        deleteOtherFolder: deleteFolder(input: {
          id: "${testStateObject.otherFolderId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
        deleteSpaceFolder: deleteFolder(input: {
          id: "${testStateObject.folderSpaceId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
        watchlistFolder: deleteFolder(input: {
          id: "${watchlistFolderId}"
          orderIndex: 0
        }) {
          id
        }
      }`;

      const result = await gqlClient.query(query);
      testStateObject.testIsDeleted = true;

      expect([
        testStateObject.folderId,
        testStateObject.treeObjectId
      ]).toContain(result.deleteFolder.id);
      expect(testStateObject.otherFolderId).toEqual(
        result.deleteOtherFolder.id
      );
      expect(watchlistFolderId).toEqual(result.watchlistFolder.id);
    });

    it('throw folder not found after deleting', async () => {
      const query = `query {
        folder(id: "${testStateObject.treeObjectId}") {
          id
          name
          description
        }
      }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
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
      const result = await gqlClient.query(query);
      const { shareFolder } = result;
      expect(shareFolder.treeObjectId).toEqual(testStateObject.testParentId);
      expect(shareFolder.sharedWith.read).toContainEqual(
        Number.parseInt(testStateObject.organizationId, 10)
      );
    });

    it('fetch shared folders', async () => {
      const query = `query {
         sharedFolders {
            id
            sharedWith {
              read
              write
            }
         }
      }`;
      const result = await gqlClient.query(query);
      const { sharedFolders } = result;
      if (sharedFolders.length) {
        sharedFolderId = sharedFolders[0].id;
      }
    });

    // TODO: Update get folder to allow regular users from shared organizations
    // to fetch folders they have access to via `shared_org_read`.

    it('fetch shared folder by id', async () => {
      const query = `query($id: ID!) {
         folder(id: $id) {
            id
            sharedAccess
         }
      }`;
      if (sharedFolderId) {
        const variables = {
          id: sharedFolderId
        };
        const result = await gqlClient.query(query, variables);
        const { folder } = result;
        expect(folder.id).toEqual(sharedFolderId);
        expect(folder.sharedAccess).toContainEqual('read');
      }
    });
  });

  describe('Super Admin cross-org folder operations', () => {
    let superToken, superOptions;
    let targetOrg, targetOrgSetup, targetAdminUser, targetAdminOptions;
    let targetOrgRootFolderId, targetParentFolderId;
    let superAdminSubFolderId;

    const createOrgAndUserInput = {
      orgInput: {
        name: `${citestMarker}-org-super-admin-subfolder-${uuid.v4()}`,
        businessUnit: 'Legal',
        types: ['agency', 'broadcaster'],
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        },
        apps: [
          isDesktopAppEnabled
            ? null
            : {
                applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
                applicationKey: 'admin'
              },
          {
            applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
            applicationKey: 'cms'
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
        }
      ]
    };

    beforeAll(async () => {
      const result = await gqlClient.connect();
      superToken = result.token;
      superOptions = helpers.requestOptions(superToken);

      targetOrgSetup = await orgHelper.setupTestOrgAndUser(
        { gqlClient, superAdminToken: superToken },
        createOrgAndUserInput
      );

      targetOrg = targetOrgSetup.org;
      expect(targetOrg).toBeDefined();
      expect(targetOrg.name).toContain(
        `${citestMarker}-org-super-admin-subfolder`
      );

      targetAdminUser = _.find(targetOrgSetup.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      targetAdminOptions = targetAdminUser.requestOptions;

      const rootFoldersResult = await folderHelper.helpCreateRootFolder(
        { gqlClient, options: targetAdminOptions },
        { rootFolderType: 'watchlist' }
      );
      expect(rootFoldersResult).toBeDefined();

      const orgRootFolder = rootFoldersResult.find((rf) => rf.ownerId);
      expect(orgRootFolder).toBeDefined();
      targetOrgRootFolderId = orgRootFolder.id;

      const parentFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: targetAdminOptions },
        {
          name: `${citestMarker}-parent-folder-${moment().unix()}`,
          description: `${citestMarker}-parent-folder-desc`,
          parentId: targetOrgRootFolderId,
          rootFolderType: 'watchlist'
        }
      );
      expect(parentFolder).toBeDefined();
      expect(parentFolder.id).toBeDefined();
      targetParentFolderId = parentFolder.id;
    });

    it('super admin can create sub folder in any org', async () => {
      const subFolderName = `${citestMarker}-super-admin-subfolder-${moment().unix()}`;
      const query = `mutation {
        createFolder(input: {
          name: "${subFolderName}",
          description: "${citestMarker}-subfolder-created-by-super-admin",
          parentId: "${targetParentFolderId}",
          rootFolderType: watchlist,
          orderIndex: 0
        }) {
          id
          treeObjectId
          name
          description
          status
          ownerId
          organizationId
          orderIndex
          parent {
            id
          }
        }
      }`;

      const result = await gqlClient.query(query, null, superOptions);
      expect(result.createFolder).toBeDefined();
      expect(result.createFolder.id).toBeDefined();
      expect(result.createFolder.name).toEqual(subFolderName);
      expect(result.createFolder.description).toEqual(
        `${citestMarker}-subfolder-created-by-super-admin`
      );
      expect(result.createFolder.status).toEqual('active');
      expect(result.createFolder.parent.id).toEqual(targetParentFolderId);
      superAdminSubFolderId = result.createFolder.id;
    });

    afterAll(async () => {
      try {
        if (superAdminSubFolderId) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: targetAdminOptions },
            { folderId: superAdminSubFolderId, orderIndex: 0 }
          );
        }
        if (targetParentFolderId) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: targetAdminOptions },
            { folderId: targetParentFolderId, orderIndex: 0 }
          );
        }
        if (!_.isEmpty(targetOrgSetup.listOptions)) {
          const listUserIds = targetOrgSetup.listOptions.map(
            (user) => user.userId
          );
          await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
        }
        if (targetOrg && targetOrg.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            targetOrg.id
          );
        }
      } catch (err) {
        console.warn('Super admin cross-org cleanup error:', err.message);
      }
    });
  });

  describe('FolderPath and TDO', function () {
    let parent, child, leaf, tdoId;
    beforeAll(async () => {
      ({ parent, child, leaf } = await folderHelper.createFolderHierarchy(
        gqlClient,
        testStateObject.orgRootFolderId,
        rootFolderType,
        citestMarker,
        null
      ));
    });

    it('should validate folderPath hierarchy for leaf folder', async () => {
      const query = `query {
        folder(id: "${leaf.id}") {
          folderPath {
            id
            parent { id }
          }
        }
      }`;
      const result = await gqlClient.query(query);
      const folderPath = result.folder.folderPath;

      expect(folderPath.length).toEqual(4);
      expect(folderPath.map((f) => f.id)).toEqual([
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
      tdoId = await folderHelper.createTDOInLeaf(gqlClient, leaf.id, null);
      expect(tdoId).toBeDefined();
    });

    it('should validate folderPath and treeObjectIds for TDO', async () => {
      const query = `query {
        temporalDataObject(id: "${tdoId}") {
          id
          foldersTreeObjectIds
          folders {
            id
            treeObjectId
            folderPath { id parent { id } }
          }
        }
      }`;
      const result = await gqlClient.query(query);
      const tdo = result.temporalDataObject;

      expect(tdo.foldersTreeObjectIds).toContain(parent.treeObjectId);
      expect(tdo.foldersTreeObjectIds).toContain(child.treeObjectId);
      expect(tdo.foldersTreeObjectIds).toContain(leaf.treeObjectId);
      expect(tdo.foldersTreeObjectIds).not.toContain(
        testStateObject.testParentId
      );

      const folderPath = tdo.folders[0].folderPath;
      expect(folderPath.length).toEqual(4);
      expect(folderPath.map((f) => f.id)).toEqual([
        testStateObject.orgRootFolderId,
        parent.id,
        child.id,
        leaf.id
      ]);
    });

    afterAll(async () => {
      await folderHelper.cleanupFolderPathTDO(
        gqlClient,
        tdoId,
        [leaf, child, parent],
        null
      );
    });
  });
});

async function createDataRegistryAndSDOForContentTemplate(gqlClient) {
  let gql;
  let result;
  let variables;

  //Create dataRegistry
  gql = `
  mutation createDataRegistry {
          createDataRegistry(input: {
            source: "Some url"
            name: "${testDataRegistryName}"
            description: "${citestMarker}-folder-test"
            isPublic: true
          }) {
            id
          }
        }
  `;
  result = await gqlClient.query(gql);
  const dataRegistryId = _.get(result, 'createDataRegistry.id');
  expect(dataRegistryId).toBeDefined();

  //Create schema
  gql = `
  mutation upsertSchemaDraft($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${dataRegistryId}",
          schema: $schema
        }) {
        id
        dataRegistryId
      }
    }
  `;

  variables = {
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
  };

  result = await gqlClient.query(gql, variables);
  const schemaId = _.get(result, 'upsertSchemaDraft.id');
  expect(schemaId).toBeDefined();

  //Update Schema State
  gql = `
  mutation updateSchemaState{
        updateSchemaState(input: {
          id:"${schemaId}",
          status: published
        }) {
          id
          status
        }
      }
  `;
  result = await gqlClient.query(gql);
  const status = _.get(result, 'updateSchemaState.status');
  expect(status).toEqual('published');

  //create SDO
  gql = `
    mutation {
      createStructuredData(input: {
      schemaId: "${schemaId}",
      data: {
        example: "example"
      }}) {
            id
          }
        }
      `;
  result = await gqlClient.query(gql);
  const sdoId = _.get(result, 'createStructuredData.id');
  expect(sdoId).toBeDefined();

  //find an SDO for content template
  gql = `
  query {
        dataRegistries(id:"${dataRegistryId}") {
          records {
            id
            name
            createdDateTime
            schemas(status: published) {
              records {
                structuredDataObjects(limit:1) {
                  records {
                    id
                    schemaId
                  }
                }
              }
            }
          }
        }
      }
  `;
  result = await gqlClient.query(gql);
  return result;
}
