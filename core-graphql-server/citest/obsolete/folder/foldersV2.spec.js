const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const { safe } = require('../../helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const chakram = require('chakram');
const {
  createFolderHierarchy,
  createTDOInLeaf,
  cleanupFolderPathTDO
} = require('../../helpers/folder.js');
const admin = require('../../../routes/admin');
const util = require('../../../util.js')();
const orgHelper = require('../../helpers/organization.js');
const userHelper = require('../../helpers/user.js');
const folderHelper = require('../../helpers/folder.js');
const applicationHelper = require('../../helpers/application.js');
const citestMarker = globalThis.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const orgNamePrefix = `${citestMarker}-folderv2-citest-org`;
const createANewOrgForTesting = true;
let userId, adminId;

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

// This citest only works on an environment that enables v2FoldersAvailable feature flag
describeif(globalThis.v2FoldersAvailable, 'citest_folder: V2Folders', () => {
  let superToken, superOrgName, superAdminName;
  let testOrg, testUsers, adminUser, regularUser;
  let adminToken, adminOptions;
  let gqlClient;

  let watchlistId,
    watchlistName,
    watchlistTreeObjectId,
    sharedFolderId,
    watchlistId1,
    watchlistFolderId;
  let generateTagKey;
  let options;

  const rootFolderType = 'watchlist';
  const testStateObject = {
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
  const folderContentTemplate = {
    id: null,
    folderId: null,
    sdoId: null,
    schemaId: null
  };

  beforeAll(async () => {
    const tagPrefixTimestamp = moment().unix();
    generateTagKey = (suffix) => {
      return `tagkey_${tagPrefixTimestamp}_${suffix}`;
    };
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    options = helpers.requestOptions(superToken);
    result = await gqlClient.query(meGql);

    expect(result.me).toBeDefined();
    superOrgName = _.get(result, 'me.organization.name');
    superAdminName = _.get(result, 'me.name');
    // get citest org
    if (!createANewOrgForTesting) {
      result = await gqlClient.query(getOrgGQL());
      testOrg = _.get(result, 'organizations.records[0]');
    }

    if (testOrg) {
      console.log(
        `>> Found a test org for Folder V2: ${testOrg.id} - ${testOrg.name}`
      );
    } else {
      // create a new org
      testOrg = await setupTestOrganization(gqlClient);
    }
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(orgNamePrefix);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    // test users + superadmin who created the org
    expect(testUsers.length).toEqual(3);

    adminUser = _.find(testUsers, (user) => {
      return _.includes(user.name, 'admin');
    });
    regularUser = _.find(testUsers, (user) => {
      return _.includes(user.name, 'regular');
    });

    // Login for Admin user
    let url, impersonated;
    url = `${config.core_admin_url}/admin/impersonate/${adminUser.id}/${adminUser.organizationGuid}`;
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    adminToken = _.get(impersonated, 'body.token');
    adminOptions = helpers.requestOptions(adminToken);

    // Login for Regular user
    url = `${config.core_admin_url}/admin/impersonate/${regularUser.id}/${regularUser.organizationGuid}`;
    impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
  });

  afterAll(async () => {
    // Delete SDO
    if (folderContentTemplate.sdoId && folderContentTemplate.schemaId) {
      await safe('delete SDO', async () => {
        const queryDeleteSDO = `mutation deleteSDO {
            deleteStructuredData (input: {id: "${folderContentTemplate.sdoId}", schemaId: "${folderContentTemplate.schemaId}"}){
              id
              message
            }
          }
        `;
        await gqlClient.query(queryDeleteSDO, {}, adminOptions);
      });
    }

    // Delete users
    const queryDeleteUser = `
      mutation deleteUser ($id: ID!){
        deleteUser (id: $id) {
          id
          __typename
          message
        }
      }`;

    if (userId) {
      await safe('delete userId', async () => {
        await gqlClient.query(queryDeleteUser, { id: userId }, options);
      });
    }

    if (adminId) {
      await safe('delete adminId', async () => {
        await gqlClient.query(queryDeleteUser, { id: adminId }, options);
      });
    }

    // Set org status to deleted
    if (testOrg.id) {
      await safe('mark organization as deleted', async () => {
        const query = `mutation updateOrg {
            updateOrganization (input: {
              id: "${testOrg.id}"
              status: "deleted"
            }){
              id
              status
            }
          }`;

        const result = await gqlClient.query(query, {}, options);
        const updatedStatus = _.get(result, 'updateOrganization.status', '');
        expect(updatedStatus).toEqual('deleted');
      });
    }
  });

  it('find an SDO for content template', async () => {
    // Get SDO
    const { sdoId, schemaId } = await setupTestGetSDO(gqlClient, adminOptions);

    expect(sdoId).toBeDefined();
    expect(schemaId).toBeDefined();

    folderContentTemplate.sdoId = sdoId;
    folderContentTemplate.schemaId = schemaId;
  });

  // Root Folders
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

      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.createRootFolders).toBeDefined();

      const rootFolders = result.createRootFolders;
      expect(rootFolders.length).toEqual(2);
      expect(rootFolders[0].rootFolderTypeId).toEqual(1);
      expect(rootFolders[0].typeId).toEqual(4);
      expect(rootFolders[0].treeObjectId).toBeDefined();
      expect(rootFolders[1].treeObjectId).toBeDefined();
      expect(rootFolders[0].name).toBeDefined();
      expect(rootFolders[1].name).toBeDefined();
      const expectOrgRootFolderName =
        testOrg.name + ' ' + rootFolderType + ' Root Folder';
      const expectUserRootFolderName =
        adminUser.name + ' ' + rootFolderType + ' Root Folder';
      expect(rootFolders[0].name).toEqual(expectOrgRootFolderName);
      expect(rootFolders[1].name).toEqual(expectUserRootFolderName);

      testStateObject.testParentId = rootFolders[1].treeObjectId;
      testStateObject.testMoveParentId = rootFolders[0].treeObjectId;

      const orgRootFolder = _.head(
        _.filter(rootFolders, (rf) => !_.isNil(rf.organizationId))
      );
      testStateObject.orgRootFolderId = orgRootFolder.id;
    });

    it('create root folders with spadmin', async () => {
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
      testStateObject.testParentId1 = rootFolders[1].id;
      const orgRootFolder = _.head(
        _.filter(rootFolders, (rf) => _.isNil(rf.ownerId))
      );
      testStateObject.orgRootFolderId1 = orgRootFolder.id;
      const userRootFolder = _.head(
        _.filter(rootFolders, (rf) => !_.isNil(rf.ownerId))
      );
      testStateObject.userRootFolderId1 = userRootFolder.id;
    });

    it('should get root folders', async () => {
      const query = `query {
        rootFolders(
          type: ${rootFolderType}
        ) {
          id
          name
          organizationId
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      const rootFolders = _.get(result, 'rootFolders');
      // should get organization's root Folder when using APIToken
      expect(rootFolders).toBeDefined();
      expect(rootFolders.length >= 1).toEqual(true);
      expect(rootFolders[0].id).toEqual(testStateObject.orgRootFolderId);
      expect(rootFolders[0].organizationId).toBeDefined();
      const expectOrgRootFolderName =
        testOrg.name + ' ' + rootFolderType + ' Root Folder';
      const expectUserRootFolderName =
        adminUser.name + ' ' + rootFolderType + ' Root Folder';
      expect(rootFolders[0].name).toEqual(expectOrgRootFolderName);
      expect(rootFolders[1].name).toEqual(expectUserRootFolderName);
    });
  });

  // Folders
  describe('Folders', () => {
    it('create a folder', async () => {
      testStateObject.testName =
        citestMarker + '-graphql-test-folders-' + moment().unix();
      testStateObject.testDescription =
        citestMarker + '-graphql-folders-description';
      const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}",
          description: "${testStateObject.testDescription}",
          parentId: "${testStateObject.testParentId}",
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType}
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
          treeObjectId
          entityTags {
            tagKey
            tagValue
          }
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      testStateObject.testFolderIdV2 = _.get(result, 'createFolder.id');
      testStateObject.testId = _.get(result, 'createFolder.treeObjectId');
      testStateObject.testOtherId = _.get(result, 'otherFolder.id');

      expect(testStateObject.testId).toBeDefined();
      expect(testStateObject.testOtherId).toBeDefined();

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
          parentId: "${testStateObject.testOtherId}"
          description: "${testStateObject.testDescription}"
          rootFolderType: ${rootFolderType}
          orderIndex: ${testStateObject.testOrderIndex},
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
      const result = await gqlClient.query(query, {}, adminOptions);
      testStateObject.testOtherDescendantId = _.get(result, 'createFolder.id');
      expect(testStateObject.testOtherDescendantId).toBeDefined();
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

      const result = await gqlClient.query(query, {}, adminOptions);
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
        testStateObject.testOtherId,
        testStateObject.testOtherDescendantId
      ]);
    });

    it('create folder content template', async () => {
      const query = `mutation {
        createFolderContentTemplate (input: {
          folderId: "${testStateObject.testId}"
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

      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.createFolderContentTemplate.id).toBeDefined();
      expect(result.createFolderContentTemplate.folderId).toEqual(
        testStateObject.testFolderIdV2
      );
      expect(result.createFolderContentTemplate.sdoId).toEqual(
        folderContentTemplate.sdoId
      );
      expect(result.createFolderContentTemplate.schemaId).toEqual(
        folderContentTemplate.schemaId
      );
    });

    it('create more folder content template', async () => {
      const query = `mutation {
        createFolderContentTemplate (input: {
          folderId: "${testStateObject.testId}"
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

      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.createFolderContentTemplate.id).toBeDefined();
      folderContentTemplate.id = result.createFolderContentTemplate.id;
      expect(result.createFolderContentTemplate.folderId).toEqual(
        testStateObject.testFolderIdV2
      );
      expect(result.createFolderContentTemplate.sdoId).toEqual(
        folderContentTemplate.sdoId
      );
      expect(result.createFolderContentTemplate.schemaId).toEqual(
        folderContentTemplate.schemaId
      );
    });

    it('update folder content template', async () => {
      const query = `mutation {
        updateFolderContentTemplate (input: {
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

      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.updateFolderContentTemplate.id).toBeDefined();
      expect(result.updateFolderContentTemplate.folderId).toEqual(
        testStateObject.testFolderIdV2
      );
      expect(result.updateFolderContentTemplate.sdoId).toEqual(
        folderContentTemplate.sdoId
      );
      expect(result.updateFolderContentTemplate.schemaId).toEqual(
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
        folder(id: "${testStateObject.testId}") {
          ...folderFields
        }
        otherFolder: folder(id: "${testStateObject.testOtherId}") {
          ...folderFields
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
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
      // v2 folders do not support order
      // expect(_.get(result, 'folder.orderIndex')).toEqual(
      //   testStateObject.testOrderIndex
      // );
      // expect(_.get(result, 'otherFolder.orderIndex')).toEqual(
      //   testStateObject.testOrderIndex
      // );
      /* TODO below is env-specific and works only on dev
        expect(result.folder.contentTemplates[1].sdoId).toEqual(
          folderContentTempate.sdoId
        );
       */
    });

    it('delete folder content template', async () => {
      const query = `mutation {
        deleteFolderContentTemplate(id: "${folderContentTemplate.id}") {
          id
          message
        }
      }`;

      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.deleteFolderContentTemplate.id).toBeDefined();
      expect(result.deleteFolderContentTemplate.id).toEqual(
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
          searchIndex: 'mine'
        }
      };

      const result = await gqlClient.query(query, variables, adminOptions);
      watchlistId = _.get(result, 'createWatchlist.id');
      watchlistName = _.get(result, 'createWatchlist.name');
      watchlistTreeObjectId = _.get(result, 'createWatchlist.treeObjectId');
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

      const result = await gqlClient.query(query, {}, adminOptions);
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
        citestMarker + '-graphql-test-watchlist-foldersV2-' + moment().unix();
      testStateObject.testDescription =
        citestMarker + '-graphql-folders-description';
      const query = `mutation {
            createFolder(input: {

              name: "${testStateObject.testName}",
              description: "${testStateObject.testDescription}",
              parentId: "${testStateObject.testParentId}",
              orderIndex: ${testStateObject.testOrderIndex},
              rootFolderType: ${rootFolderType}
            }) {
              id
              treeObjectId
              name
            }
          }`;
      const result = await gqlClient.query(query, {}, adminOptions);
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

      const result = await gqlClient.query(query, variables, adminOptions);
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

      const result = await gqlClient.query(query, {}, adminOptions);
      const filedWatchlistId = _.get(result, 'fileWatchlist.id');
      expect(filedWatchlistId).toEqual(watchlistId1);
    });

    it('throw folder content template not found after deleting', async () => {
      const query = `mutation {
          updateFolderContentTemplate (input: {
            id: "${folderContentTemplate.id}"
            sdoId: "${folderContentTemplate.sdoId}"
          }) {
            id
          }
        }`;

      expect(async () =>
        gqlClient.query(query, {}, adminOptions)
      ).rejects.toThrow('Folder Content Template');
    });

    it('update a folder', async () => {
      const query = `mutation {
          updateFolder(input: {
            id: "${testStateObject.testId}"
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
      const result = await gqlClient.query(query, {}, adminOptions);
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
          folderId: "${testStateObject.testId}"
          fromFolderId: "${testStateObject.testParentId}"
          toFolderId: "${testStateObject.testMoveParentId}"
          treeObjectId: "${testStateObject.testId}"
          prevParentTreeObjectId: "${testStateObject.testParentId}"
          newParentTreeObjectId: "${testStateObject.testMoveParentId}"
        }) {
          treeObjectId
          parent {
            treeObjectId
          }
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      const moveFolder = result.moveFolder;
      expect(moveFolder.treeObjectId).toEqual(testStateObject.testId);
      expect(moveFolder.parent.treeObjectId).toEqual(
        testStateObject.testMoveParentId
      );
    });

    it('failed to move parent folder into child folder', async () => {
      const query = `mutation {
        moveFolder(input: {
          treeObjectId: "${testStateObject.testMoveParentId}"
          prevParentTreeObjectId: "${testStateObject.orgRootFolderId}"
          newParentTreeObjectId: "${testStateObject.testId}"
        }) {
          treeObjectId
          parent {
            treeObjectId
          }
        }
      }`;
      try {
        await gqlClient.query(query, {}, adminOptions);
      } catch (error) {
        expect(`${error}`).toContain(
          `Cannot move parent folder into its own subfolder`
        );
      }
    });

    it('get folderOverview', async () => {
      const query = `query {
        folderOverview(ids: "${testStateObject.testId}", rootFolderType: watchlist) {
          childFoldersCount
          childNonFolderObjectsCount
          objectIds
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      const folderOverview = result.folderOverview;
      expect(folderOverview.childFoldersCount).toEqual(0);
      expect(folderOverview.childNonFolderObjectsCount).toEqual(1);
      expect(_.get(folderOverview, 'objectIds[0]')).toBeDefined();
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
        ids: [testStateObject.testId]
      };
      const result = await gqlClient.query(query, variables, adminOptions);
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
      const query = `query ($ids: [ID!]!) {
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
      }`;

      const variables = {
        ids: [watchlistFolderId]
      };
      const result = await gqlClient.query(query, variables, adminOptions);
      const folderSummaryDetails = result.folderSummaryDetails;
      expect(folderSummaryDetails.length).toBeGreaterThanOrEqual(2);

      // Find watchlist object entries - they should have typeId = 2
      const watchlistEntries = folderSummaryDetails.filter(
        (entry) => entry.typeId === 2
      );
      expect(watchlistEntries.length).toBeGreaterThanOrEqual(1);

      // Verify watchlist object has typeId = 2 (from v2_folder_type where folder_type_name = 'watchlist')
      const watchlistEntry = watchlistEntries.find(
        (entry) => entry.id === watchlistId1
      );
      expect(watchlistEntry).toBeDefined();
      expect(watchlistEntry.typeId).toEqual(2);

      // Find folder entries - they should have typeId = 1 (fallback to folderTypeId)
      const folderEntries = folderSummaryDetails.filter(
        (entry) => entry.typeId === 1
      );
      expect(folderEntries.length).toBeGreaterThanOrEqual(1);

      // Folder entry should have the watchlist filed in its childWatchlistsIds
      const folderEntry = folderEntries.find(
        (entry) => entry.id === watchlistFolderId
      );
      expect(folderEntry).toBeDefined();
      expect(folderEntry.childWatchlistsIds).toContain(watchlistId1);
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
        await gqlClient.query(query, {}, adminOptions);
      } catch (error) {
        expect(`${error}`).toContain(`Can not delete root folder`);
      }
    });

    it('delete watchlist in the folder', async () => {
      const query = `mutation  {
        deleteWatchlist(id: "${watchlistId}") {
          id
        }
      }`;

      const result = await gqlClient.query(query, {}, adminOptions);
      const deletedId = _.get(result, 'deleteWatchlist.id');
      expect(deletedId).toEqual(watchlistId);
    });

    it('delete a descendant folder before deleting its parent folder', async () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.testOtherDescendantId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      expect(testStateObject.testOtherDescendantId).toEqual(
        result.deleteFolder.id
      );
    });

    it('delete a folder', async () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.testFolderIdV2}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
        deleteOtherFolder: deleteFolder(input: {
          id: "${testStateObject.testOtherId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      testStateObject.testIsDeleted = true;
      expect(result.deleteFolder.id).toEqual(testStateObject.testFolderIdV2);
      expect(result.deleteOtherFolder.id).toEqual(testStateObject.testOtherId);
    });

    it('create a folder for sharing', async () => {
      const query = `mutation {
            createFolder(input: {
              name: "${testStateObject.testName}-share-folder"
              description: "${testStateObject.testDescription}",
              parentId: "${testStateObject.testParentId1}"
              orderIndex: ${testStateObject.testOrderIndex},
              rootFolderType: ${rootFolderType},
            }) {
              id
              treeObjectId
              name
            }
          }`;
      const result = await gqlClient.query(query);
      testStateObject.sharedFolderId = _.get(result, 'createFolder.id');
      testStateObject.sharedTreeObjectId = _.get(
        result,
        'createFolder.treeObjectId'
      );
      expect(testStateObject.sharedFolderId).toBeDefined();
    });

    it('share rootFolder with folderId', async () => {
      const query = `mutation {
            shareFolder (input: {folderId: "${testStateObject.userRootFolderId1}", readOrganizationIds: [${testOrg.id}]}) {
              id
              name
              treeObjectId
              sharedWith {
                read
                write
              }
            }
          }`;
      const result = await gqlClient.query(query);
      const { shareFolder } = result;
      expect(shareFolder.id).toEqual(testStateObject.userRootFolderId1);
      expect(shareFolder.sharedWith.read).toContainEqual(
        parseInt(testOrg.id, 10)
      );
    });

    xit('fetch shared rootFolders and verify name', async () => {
      const query = `query {
             sharedFolders {
                id
                name
                sharedWith {
                  read
                  write
                }
             }
          }`;
      const result = await gqlClient.query(query, null, adminOptions);
      const sharedFolders = _.get(result, 'sharedFolders', []);
      expect(sharedFolders.length).toBeGreaterThan(0);
      const folder = sharedFolders.find(
        (f) => f.id === testStateObject.userRootFolderId1
      );
      expect(folder).toBeDefined();
      const expectUserRootFolderName =
        superAdminName + ' ' + rootFolderType + ' Root Folder';
      expect(folder.name).toEqual(expectUserRootFolderName);
    });

    it('share a folder with folderId', async () => {
      const query = `mutation {
            shareFolder (input: {folderId: "${testStateObject.sharedFolderId}", readOrganizationIds: [${testOrg.id}]}) {
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
      expect(shareFolder.id).toEqual(testStateObject.sharedFolderId);
      expect(shareFolder.sharedWith.read).toContainEqual(
        Number.parseInt(testOrg.id, 10)
      );
    });

    it('share a folder with treeObjectId', async () => {
      const query = `mutation {
            shareFolder (input: {treeObjectId: "${testStateObject.sharedTreeObjectId}", readOrganizationIds: [${testOrg.id}]}) {
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
      expect(shareFolder.id).toEqual(testStateObject.sharedFolderId);
      expect(shareFolder.sharedWith.read).toContainEqual(
        Number.parseInt(testOrg.id, 10)
      );
    });

    it('fetch shared folders with parentFolderId', async () => {
      const query = `query {
             sharedFolders {
                id
                sharedWith {
                  read
                  write
                }
             }
          }`;
      const result = await gqlClient.query(query, null, adminOptions);
      const { sharedFolders } = result;
      // The sharedFolders query has no deterministic ordering so position varies across runs
      const ids = (sharedFolders ?? []).map((f) => f.id);
      expect(ids).toContain(testStateObject.sharedFolderId);
    });

    it('should get shared folder by id with none OLP', async () => {
      const updateOrgRBAC = async (orgId, enabled) => {
        const query = `mutation updateOrganization {
          updateOrganization(input: {
            id: "${orgId}"
            metadata: { features: { enableRBACFeature: "${enabled ? 'enabled' : 'disabled'}" } }
          }){
            id
            status
            jsondata
          }
        }`;
        const result = await gqlClient.query(query);
        return _.get(result, 'updateOrganization.id', '');
      };

      const updatedOrgId = await updateOrgRBAC(testOrg.id, false);
      expect(updatedOrgId).toEqual(testOrg.id);

      // Fetch shared folder
      const folderQuery = `query($id: ID!) {
        folder(id: $id) {
            id
            sharedAccess
        }
      }`;
      const variables = { id: testStateObject.sharedFolderId };
      const folderResult = await gqlClient.query(
        folderQuery,
        variables,
        adminOptions
      );
      const folder = folderResult.folder;
      expect(folder.id).toEqual(testStateObject.sharedFolderId);
      expect(folder.sharedAccess).toContainEqual('read');

      // Revert org back to OLP
      const revertedOrgId = await updateOrgRBAC(testOrg.id, true);
      expect(revertedOrgId).toEqual(testOrg.id);
    });

    it('throw folder not found after deleting', async () => {
      const query = `query {
        folder(id: "${testStateObject.testId}") {
          id
          name
          description
        }
      }`;
      await expect(async () =>
        gqlClient.query(query, {}, adminOptions)
      ).rejects.toThrow('not_found');
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
      const result = await gqlClient.query(query, {}, adminOptions);
      const { sharedFolders } = result;
      if (sharedFolders.length) {
        sharedFolderId = sharedFolders[0].id;
      }
    });

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
        const result = await gqlClient.query(query, variables, adminOptions);
        const { folder } = result;
        expect(folder.id).toEqual(sharedFolderId);
        expect(folder.sharedAccess).toContainEqual('read');
      }
    });
  });

  describe('FolderPath and TDO', function () {
    let parent, child, leaf, tdoId;

    beforeAll(async () => {
      ({ parent, child, leaf } = await createFolderHierarchy(
        gqlClient,
        testStateObject.orgRootFolderId,
        rootFolderType,
        citestMarker,
        adminOptions
      ));
    });

    it('should validate folderPath hierarchy for leaf folder', async () => {
      const query = `query {
        folder(id: "${leaf.id}") {
          id
          parent { id }
          folderPath {
            id
            parent { id }
          }
        }
      }`;
      const result = await gqlClient.query(query, null, adminOptions);
      const folderPath = result.folder.folderPath;
      expect(_.get(result, 'folder.id')).toEqual(leaf.id);
      expect(_.get(result, 'folder.parent.id')).toEqual(child.id);

      expect(folderPath.length).toEqual(3);
      expect(folderPath.map((f) => f.id)).toEqual([
        testStateObject.orgRootFolderId,
        parent.id,
        child.id
      ]);

      expect(folderPath[0].id).toEqual(testStateObject.orgRootFolderId);
      expect(folderPath[1].parent.id).toEqual(testStateObject.orgRootFolderId);
      expect(folderPath[2].parent.id).toEqual(parent.id);
    });

    it('should create TDO in leaf folder', async () => {
      tdoId = await createTDOInLeaf(gqlClient, leaf.id, adminOptions);
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
      const result = await gqlClient.query(query, null, adminOptions);
      const tdo = result.temporalDataObject;
      expect(tdo.foldersTreeObjectIds).toContain(parent.treeObjectId);
      expect(tdo.foldersTreeObjectIds).toContain(child.treeObjectId);
      expect(tdo.foldersTreeObjectIds).toContain(leaf.treeObjectId);
      expect(tdo.foldersTreeObjectIds).not.toContain(
        testStateObject.testParentId
      );

      const folderPath = tdo.folders[0].folderPath;
      expect(folderPath.length).toEqual(3);
      expect(folderPath.map((f) => f.id)).toEqual([
        testStateObject.orgRootFolderId,
        parent.id,
        child.id
      ]);
    });

    afterAll(async () => {
      await cleanupFolderPathTDO(
        gqlClient,
        tdoId,
        [leaf, child, parent],
        adminOptions
      );
    });
  });

  // Application Folders - fileApplication idempotency
  describe('Application Folders', () => {
    let appRootFolderId;
    let folderId;
    const appId = 'e4739d44-53d2-4153-b55f-5e246fc989b1';
    const appType = 'application';

    it('should create root folders for application', async () => {
      const query = `mutation {
        createRootFolders(rootFolderType: ${appType}) {
          id
          treeObjectId
          rootFolderTypeId
          organizationId
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOptions);
      expect(result.createRootFolders).toBeDefined();
      const orgRootFolder = result.createRootFolders.find(
        (rf) => !_.isNil(rf.organizationId)
      );
      appRootFolderId = orgRootFolder.treeObjectId;
      expect(appRootFolderId).toBeDefined();
    });

    it('should create an application folder and file application three times', async () => {
      // 1. Create Folder
      const createFolderMutation = `mutation createApplicationGroup {
        createFolder(
          input : {
            parentId: "${appRootFolderId}",
            name: "citest-app-folder-${moment().unix()}",
            description: "",
            rootFolderType: ${appType}
          }
        ) {
          id
        }
      }`;
      const createResult = await gqlClient.query(
        createFolderMutation,
        {},
        adminOptions
      );
      folderId = createResult.createFolder.id;
      expect(folderId).toBeDefined();

      // 2. File Application 3 times
      const fileAppMutation = `mutation addApplicationToGroupTest {
        fileApplication(
          input: {
            appId: "${appId}"
            folderId: "${folderId}"
          }
        ) {
          id
          isPublic
          metadataVersion
          details
          name
          category
          description
        }
      }`;

      // First time
      const res1 = await gqlClient.query(fileAppMutation, {}, adminOptions);
      expect(res1.fileApplication.id).toEqual(appId);

      // Second time
      const res2 = await gqlClient.query(fileAppMutation, {}, adminOptions);
      expect(res2.fileApplication.id).toEqual(appId);

      // Third time
      const res3 = await gqlClient.query(fileAppMutation, {}, adminOptions);
      expect(res3.fileApplication.id).toEqual(appId);
    });

    it('unfile application from folder should succeed', async () => {
      const unfileAppRes = await applicationHelper.helpUnfileAppToFolder(
        { gqlClient, options: adminOptions },
        { folderId: folderId, appId: appId }
      );

      expect(_.get(unfileAppRes, 'id')).toEqual(appId);
    });

    it('delete application folder should succeed', async () => {
      const deleteFolderRes = await folderHelper.helpDeleteFolder(
        { gqlClient, options: adminOptions },
        { folderId: folderId, orderIndex: 0 }
      );

      expect(_.get(deleteFolderRes, 'id')).toEqual(folderId);
    });
  });

  describe('switch folder version tests', () => {
    let testOrgSetup, testOrg, testUsers, adminUser, adminOptions;
    let orgRootFolder, userRootFolder, parentFolder, childFolder;
    beforeAll(async () => {
      // create org V1 and admin
      testOrgSetup = await orgHelper.setupTestOrgAndUser(
        { gqlClient, superAdminToken: superToken },
        createOrgAndUserInput
      );

      testOrg = testOrgSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);
      expect(testOrg.users).toBeDefined();
      testUsers = _.get(testOrg, 'users.records');

      // Login for Admin user
      adminUser = _.find(testOrgSetup.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      adminOptions = adminUser.requestOptions;

      // create root folder v1
      const rootFolder = await folderHelper.helpCreateRootFolder(
        { gqlClient, options: adminOptions },
        { rootFolderType: 'cms' }
      );

      expect(rootFolder).toBeDefined();
      userRootFolder = rootFolder.find((rf) => rf.ownerId === adminUser.userId);
      expect(userRootFolder).toBeDefined();

      orgRootFolder = rootFolder.find((rf) => rf.ownerId === null);
      expect(orgRootFolder).toBeDefined();
    });

    it('create parent and child folder v1', async () => {
      // create parent folder
      parentFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-parent-${uuid.v4()}`,
          description: '',
          parentId: userRootFolder.id,
          rootFolderType: 'cms'
        }
      );
      expect(parentFolder).toBeDefined();

      // create child folder
      childFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-child-${uuid.v4()}`,
          description: '',
          parentId: parentFolder.id,
          rootFolderType: 'cms'
        }
      );
      expect(childFolder).toBeDefined();
    });

    it('delete folders v1', async () => {
      const deleteChildRes = await folderHelper.helpDeleteFolder(
        { gqlClient, options: adminOptions },
        { folderId: childFolder.id, orderIndex: 0 }
      );
      expect(_.get(deleteChildRes, 'id')).toEqual(childFolder.id);

      const deleteRes = await folderHelper.helpDeleteFolder(
        { gqlClient, options: adminOptions },
        { folderId: parentFolder.id, orderIndex: 0 }
      );
      expect(_.get(deleteRes, 'id')).toEqual(parentFolder.id);
    });

    it('switch for v2 Folder', async () => {
      const switchOrg = await orgHelper.updateOrganization(
        { gqlClient },
        {
          id: testOrg.id,
          jsondata: {
            features: {
              v2FoldersEnabled: 'enabled'
            }
          }
        }
      );
      expect(_.get(switchOrg, 'id')).toEqual(testOrg.id);
    });

    it('folders should not exist after switch', async () => {
      let isFolderV2 = false;

      do {
        await helpers.sleep(2000); // wait for 2 seconds to make sure the switch is effective
        const loginRes = await userHelper.loginUser(
          { gqlClient },
          {
            userName: adminUser.username,
            password: 'testUserPassword'
          }
        );

        const orgConfig = _.get(loginRes, 'organization.jsondata.features', {});
        isFolderV2 = orgConfig.v2FoldersEnabled === 'enabled';
      } while (!isFolderV2);
      // get folder
      const folderRes = folderHelper.helpGetFolder(
        { gqlClient, options: adminOptions },
        { id: parentFolder.id }
      );

      await expect(folderRes).rejects.toThrow(/not_found/);
    });

    it('rootFolder name should not change after switch', async () => {
      const rootFolderRes = await folderHelper.helpGetFolder(
        { gqlClient, options: adminOptions },
        { id: userRootFolder.id }
      );

      const folder = _.get(rootFolderRes, 'folder');
      expect(folder.name).toEqual(userRootFolder.name);

      const orgRootFolderRes = await folderHelper.helpGetFolder(
        { gqlClient, options: adminOptions },
        { id: orgRootFolder.id }
      );

      const orgFolder = _.get(orgRootFolderRes, 'folder');
      expect(orgFolder.name).toEqual(orgRootFolder.name);
    });
  });
});

async function setupTestOrganization(client) {
  const orgName = `${orgNamePrefix}-${uuid.v4()}`;
  // set up organization and users
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
        v2FoldersEnabled: 'enabled'
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
        applicationId: 'e4739d44-53d2-4153-b55f-5e246fc989b1',
        applicationKey: 'aiWARE Desktop'
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
  const newOrgId = _.get(org, 'createOrganization.id');
  console.log(`>> Created test org for Folder V2: ${newOrgId} - ${orgName}`);

  // create admin + regular users
  // Admin roles: Admin; CMS Customer Service, Discovery Editor
  const createAdminUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${orgNamePrefix}-admin-user-${uuid.v4()}@localhost"
          organizationId: "${newOrgId}"
          firstName: "FolderV2-User"
          lastName: "Admin"
          jsondata: {
            firstName: "FolderV2-User"
            lastName: "Admin"
          }
          roleIds: [
            ${!isDesktopAppEnabled ? 'ddca9b68-d775-4934-8ffd-7aecc779b652' : ''}
            "032218c3-d47e-4287-9d16-7bb867c01266",
            "6d982ee9-ff07-499f-a182-03457a6187f6",
            "3577dfc6-f441-41f9-8dab-ef9079530450"
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

  // create adminUser
  const adminUser = await client.query(createAdminUser, {});
  adminId = _.get(adminUser, 'createUser.id', '');

  const createRegularUser = `
    mutation createUser {
      createUser(
        input: {
          name: "${orgNamePrefix}--regular-user-${uuid.v4()}@localhost"
          organizationId: "${newOrgId}"
          firstName: "FolderV2-User"
          lastName: "Regular"
          jsondata: {
            firstName: "FolderV2-User"
            lastName: "Regular"
          }
        }
      )  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }`;

  // regularUser
  const user = await client.query(createRegularUser);
  userId = _.get(user, 'createUser.id', '');

  const result = await client.query(getOrgGQL(orgName));

  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      name
      guid
      jsondata
    }
    authGroups {
      records {
        id
        name
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

const getOrgGQL = (orgName) => `
query getOrganization {
  organizations(
    name: "${orgName || orgNamePrefix}"
    nameMatch: contains
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

const queryGetSDO = `
    query {
      dataRegistries(filterByOwnership: mine, limit: 1, nameMatch: contains, name: "${orgNamePrefix}-") {
        records {
          id
          name
          schemas(status: published) {
            records {
              id
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
async function setupTestGetSDO(_gqlClient, _adminOptions) {
  const folderContentTemplate = {
    registryId: null,
    sdoId: null,
    schemaId: null
  };

  // Get SDO
  const result = await _gqlClient.query(queryGetSDO, {}, _adminOptions);
  folderContentTemplate.registryId = _.get(
    result,
    'dataRegistries.records[0].id'
  );
  folderContentTemplate.schemaId = _.get(
    result,
    'dataRegistries.records[0].schemas.records[0].id'
  );
  folderContentTemplate.sdoId = _.get(
    result,
    'dataRegistries.records[0].schemas.records[0].structuredDataObjects.records[0].id'
  );

  // Create new registry
  if (!folderContentTemplate.registryId || !folderContentTemplate.schemaId) {
    let query = `        
        fragment dataRegistryFields on DataRegistry {
          id
          name
          source
          description
          organizationId
          createdDateTime
          createdBy {
            id
          }
          modifiedBy {
            id
          }
          modifiedDateTime
        }

        
        fragment schemaFields on Schema {
          id
          dataRegistryId
          definition
          majorVersion
          minorVersion
          status
          validActions
          createdBy {
            id
          }
          createdDateTime
          modifiedBy {
            id
          }
          modifiedDateTime
        }
        mutation CreateDataRegistry($config: CreateDataRegistry!, $schema: UpsertSchemaDraft!) {
          createDataRegistry(input: $config) {
            ...dataRegistryFields
          }
          upsertSchemaDraft(input: $schema) {
            ...schemaFields
          }
        }

      `;

    const dataRegistryId = uuid.v4();
    let variables = {
      config: {
        id: `${dataRegistryId}`,
        source: '',
        name: `${orgNamePrefix}--schema-${uuid.v4()}`,
        description: '${orgNamePrefix}--schema'
      },
      schema: {
        dataRegistryId: `${dataRegistryId}`,
        schema: {
          type: 'object',
          title: `'${orgNamePrefix}-'`,
          required: ['email'],
          properties: {
            email: {
              type: 'string'
            },
            userName: {
              type: 'string'
            }
          },
          description: 'For CI test'
        }
      }
    };
    let result = await _gqlClient.query(query, variables, _adminOptions);
    folderContentTemplate.registryId = dataRegistryId;
    folderContentTemplate.schemaId = _.get(result, 'upsertSchemaDraft.id');

    // Public schema
    query = `
      fragment schemaFields on Schema {
        id
        dataRegistryId
        definition
        majorVersion
        minorVersion
        status
        validActions
        createdBy {
          id
        }
        createdDateTime
        modifiedBy {
          id
        }
        modifiedDateTime
      }
      mutation UpdateSchemaState($input: UpdateSchemaState!) {
        results: updateSchemaState(input: $input) {
          ...schemaFields
        }
      }`;

    variables = {
      input: {
        id: `${folderContentTemplate.schemaId}`,
        status: 'published',
        breakingChanges: false
      }
    };
    result = await _gqlClient.query(query, variables, _adminOptions);
    const schemaStatus = _.get(result, 'results.status');
    expect(schemaStatus).toBeDefined();
    expect(schemaStatus).toEqual(`published`);
    await util.sleep(1000);
  }

  if (!folderContentTemplate.sdoId) {
    // Create a SDO
    const query = `
      mutation createStructuredData {
        createStructuredData(input: {
          schemaId: "${folderContentTemplate.schemaId}",
          data: {
            email: "folderv2-email-${uuid.v4()}@veritone.com",
            userName: "folderv2-email-${uuid.v4()}@veritone.com",
          }
        }) {
          id
          data
          createdDateTime
          modifiedDateTime
        }
      }
      `;
    const result = await _gqlClient.query(query, {}, _adminOptions);
    folderContentTemplate.sdoId = _.get(result, 'createStructuredData.id');
  }

  return folderContentTemplate;
}

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    kvp: {
      features: {
        v2FoldersEnabled: 'disabled'
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
    }
  ]
};
