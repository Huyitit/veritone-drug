/* global pending */
const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const folderHelper = require('../../helpers/folder');
const rbacHelper = require('../../helpers/rbacHelper');
const watchlistHelper = require('../../helpers/watchlist');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const fs = require('fs');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
let gqlClient;
let testSetup, testSetup2;
const env = config.env;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superOrgGuid, superOrgId;
let testUsers;
let superToken, superOptions, superUserId;
let testOrg, adminUser, adminUser2, regularUser, restrictedUser;
let adminOptions, adminOptions2, regularOptions, restrictedOptions;
let testOrg2, adminOrg2, adminOrg2Options;
let regularOrg2, regularOrg2Options;

let apiOptions;
let deleteFolders = [];

const twoDaysAgo = new Date();
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

describe('folder convert script test', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superOptions = helpers.requestOptions(superToken);

    result = await userHelper.getMyInfo({
      gqlClient
    });

    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');
  });

  xdescribe('create legacy v1 data', () => {
    describe.each(['without', 'with'])(
      'single org v1 %s watchlist',
      (watchlist) => {
        let testFolderData = {
          singleOrg: {
            org: {
              id: null,
              guid: null
            },
            userId: null,
            adminOptions: null,
            rootFolderId: null,
            subFolderId: null,
            watchlistId: null
          }
        };
        it('create org V1 folder', async () => {
          const orgAndUserInput = getOrgAndUserInput('v1');
          testSetup = await orgHelper.setupTestOrgAndUser(
            { gqlClient, superAdminToken: superToken },
            orgAndUserInput
          );

          testOrg = testSetup.org;
          expect(testOrg).toBeDefined();
          expect(testOrg.name).toContain(`${citestMarker}-org`);
          expect(testOrg.users).toBeDefined();
          testUsers = _.get(testOrg, 'users.records');

          testFolderData.singleOrg.org.id = testOrg.id;
          testFolderData.singleOrg.org.guid = testOrg.guid;

          // Login for Admin user
          adminUser = _.find(testSetup.listOptions, (user) => {
            return user.key === 'adminUser';
          });
          adminOptions = adminUser.requestOptions;
          testFolderData.singleOrg.adminOptions = adminOptions;
          testFolderData.singleOrg.userId = adminUser.userId;
        });

        it('create V1 root folder', async () => {
          const createFolderResponse = await folderHelper.helpCreateRootFolder(
            { gqlClient, options: adminOptions },
            { rootFolderType: 'watchlist' }
          );
          expect(createFolderResponse).toBeDefined();
          const userRoot = createFolderResponse.find((item) => item.ownerId);
          expect(userRoot.id).toBeDefined();

          testFolderData.singleOrg.rootFolderId = userRoot.id;
        });

        it('create V1 sub folder', async () => {
          const rootFolderId = testFolderData.singleOrg.rootFolderId;

          const createFolderResponse = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              parentId: rootFolderId,
              name: `${citestMarker}-folder-${uuid.v4()}`,
              description: '',
              rootFolderType: 'watchlist'
            }
          );
          expect(createFolderResponse).toBeDefined();
          expect(createFolderResponse.id).toBeDefined();

          testFolderData.singleOrg.subFolderId = createFolderResponse.id;
        });

        it('create watchlist in sub folder', async () => {
          if (watchlist.toLowerCase() === 'without') {
            return;
          }

          const childFolderId = testFolderData.singleOrg.subFolderId;

          const createWatchlistResponse =
            await watchlistHelper.helpCreateWatchList(
              { gqlClient, options: adminOptions },
              {
                searchIndex: 'mine',
                startDateTime: twoDaysAgo.toISOString(),
                stopDateTime: tomorrow.toISOString(),
                name: `${citestMarker}-watchlist-${uuid.v4()}`,
                sourceTypeIds: [1, 2, 5],
                parentFolderId: childFolderId
                // cognitiveSearches: [
                //   {
                //     mentionStatusId: 1
                //     jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
                //   }
                // ]
              }
            );

          expect(createWatchlistResponse).toBeDefined();
          expect(createWatchlistResponse.id).toBeDefined();
          testFolderData.singleOrg.watchlistId = createWatchlistResponse.id;
        });

        afterAll(async () => {
          fs.writeFileSync(
            `./citest_folder_v1_single_org_${watchlist}_watchlist.json`,
            JSON.stringify(testFolderData.singleOrg, null, 2)
          );
        });
      }
    );

    describe.each(['without', 'with', 'with_same_amount'])(
      'multi org %s watchlist',
      (watchlist) => {
        const multiOrg = {
          orgA: {
            id: null,
            guid: null
          },
          userA: null,
          adminOptionsA: null,
          rootFolderIdA: null,
          subFolderIdA: null,
          watchlistIdA: null,
          orgB: {
            id: null,
            guid: null
          },
          userB: null,
          adminOptionsB: null,
          rootFolderIdB: null,
          subFolderIdB: null,
          watchlistIdB: null
        };
        it('create orgA V1 and userA', async () => {
          const orgAndUserInput = getOrgAndUserInput('v1');
          testSetup = await orgHelper.setupTestOrgAndUser(
            { gqlClient, superAdminToken: superToken },
            orgAndUserInput
          );

          testOrg = testSetup.org;
          expect(testOrg).toBeDefined();
          expect(testOrg.name).toContain(`${citestMarker}-org`);
          expect(testOrg.users).toBeDefined();
          testUsers = _.get(testOrg, 'users.records');

          // Login for Admin user
          multiOrg.userA = _.find(testSetup.listOptions, (user) => {
            return user.key === 'adminUser';
          });
          multiOrg.adminOptionsA = multiOrg.userA.requestOptions;

          multiOrg.orgA.id = testOrg.id;
          multiOrg.orgA.guid = testOrg.guid;
        });

        it('create orgB V1 and userB', async () => {
          const orgAndUserInput = getOrgAndUserInput('v1');
          testSetup2 = await orgHelper.setupTestOrgAndUser(
            { gqlClient, superAdminToken: superToken },
            orgAndUserInput
          );

          const testOrgB = testSetup2.org;
          expect(testOrgB).toBeDefined();
          expect(testOrgB.name).toContain(`${citestMarker}-org`);
          expect(testOrgB.users).toBeDefined();
          testUsers = _.get(testOrgB, 'users.records');

          // Login for Admin user
          multiOrg.userB = _.find(testSetup2.listOptions, (user) => {
            return user.key === 'adminUser';
          });
          multiOrg.adminOptionsB = multiOrg.userB.requestOptions;

          multiOrg.orgB.id = testOrgB.id;
          multiOrg.orgB.guid = testOrgB.guid;
        });

        it('userA create V1 root folder in orgA', async () => {
          const createFolderResponse = await folderHelper.helpCreateRootFolder(
            { gqlClient, options: multiOrg.adminOptionsA },
            { rootFolderType: 'watchlist' }
          );
          expect(createFolderResponse).toBeDefined();
          const userRoot = createFolderResponse.find((item) => item.ownerId);
          expect(userRoot.id).toBeDefined();

          multiOrg.rootFolderIdA = userRoot.id;
        });

        it('userA create V1 sub folder in orgA', async () => {
          const rootFolderId = multiOrg.rootFolderIdA;

          const createFolderResponse = await folderHelper.helpCreateFolder(
            { gqlClient, options: multiOrg.adminOptionsA },
            {
              parentId: rootFolderId,
              name: `${citestMarker}-folder-${uuid.v4()}`,
              description: '',
              rootFolderType: 'watchlist'
            }
          );
          expect(createFolderResponse).toBeDefined();
          expect(createFolderResponse.id).toBeDefined();

          multiOrg.subFolderIdA = createFolderResponse.id;
        });

        it('create 2 watchlists in sub folder orgA', async () => {
          if (watchlist.toLowerCase().includes('without')) {
            return;
          }

          const childFolderId = multiOrg.subFolderIdA;

          // create 2 watchlists
          const createWatchlistResponse = await Promise.all([
            watchlistHelper.helpCreateWatchList(
              { gqlClient, options: multiOrg.adminOptionsA },
              {
                searchIndex: 'mine',
                startDateTime: twoDaysAgo.toISOString(),
                stopDateTime: tomorrow.toISOString(),
                name: `${citestMarker}-watchlist-${uuid.v4()}`,
                sourceTypeIds: [1, 2, 5],
                parentFolderId: childFolderId
              }
            ),
            watchlistHelper.helpCreateWatchList(
              { gqlClient, options: multiOrg.adminOptionsA },
              {
                searchIndex: 'mine',
                startDateTime: twoDaysAgo.toISOString(),
                stopDateTime: tomorrow.toISOString(),
                name: `${citestMarker}-watchlist-${uuid.v4()}`,
                sourceTypeIds: [1, 2, 5],
                parentFolderId: childFolderId
              }
            )
          ]);

          expect(createWatchlistResponse).toBeDefined();
          expect(createWatchlistResponse[0].id).toBeDefined();
          expect(createWatchlistResponse[1].id).toBeDefined();
          multiOrg.watchlistIdA0 = createWatchlistResponse[0].id;
          multiOrg.watchlistIdA1 = createWatchlistResponse[1].id;
        });

        it('add userA to orgB', async () => {
          const addUserResponse = await userHelper.helpAddUserToOrg(
            { gqlClient, options: multiOrg.adminOptionsB },
            {
              userId: multiOrg.userA.userId,
              organizationGuid: multiOrg.orgB.guid,
              roleIds: [
                'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
                'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
              ]
            }
          );
          expect(addUserResponse).toBeDefined();
        });

        it('userA create V1 root folder in orgB', async () => {
          // login userA to orgB
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: multiOrg.userA.userId, organizationGuid: multiOrg.orgB.guid }
          );
          multiOrg.adminOptionsA = impersonated.requestOptions;

          const createFolderResponse = await folderHelper.helpCreateRootFolder(
            { gqlClient, options: multiOrg.adminOptionsA },
            { rootFolderType: 'watchlist' }
          );
          expect(createFolderResponse).toBeDefined();
          const userRoot = createFolderResponse.find((item) => item.ownerId);
          expect(userRoot.id).toBeDefined();
          multiOrg.rootFolderIdB = userRoot.id;
        });

        it('userA create V1 sub folder in orgB', async () => {
          const rootFolderId = multiOrg.rootFolderIdB;

          const createFolderResponse = await folderHelper.helpCreateFolder(
            { gqlClient, options: multiOrg.adminOptionsA },
            {
              parentId: rootFolderId,
              name: `${citestMarker}-folder-${uuid.v4()}`,
              description: '',
              rootFolderType: 'watchlist'
            }
          );
          expect(createFolderResponse).toBeDefined();
          expect(createFolderResponse.id).toBeDefined();
          multiOrg.subFolderIdB = createFolderResponse.id;
        });

        it('create 1 watchlist in sub folder orgB', async () => {
          if (watchlist.toLowerCase().includes('without')) {
            return;
          }

          const childFolderId = multiOrg.subFolderIdB;

          const createWatchlistResponse =
            await watchlistHelper.helpCreateWatchList(
              { gqlClient, options: multiOrg.adminOptionsA },
              {
                searchIndex: 'mine',
                startDateTime: twoDaysAgo.toISOString(),
                stopDateTime: tomorrow.toISOString(),
                name: `${citestMarker}-watchlist-${uuid.v4()}`,
                sourceTypeIds: [1, 2, 5],
                parentFolderId: childFolderId
              }
            );

          expect(createWatchlistResponse).toBeDefined();
          expect(createWatchlistResponse.id).toBeDefined();
          multiOrg.watchlistIdB1 = createWatchlistResponse.id;
        });

        it('create another watchlist in sub folder orgB', async () => {
          if (!watchlist.toLowerCase().includes('with_same_amount')) {
            return;
          }

          const createWatchlistResponse =
            await watchlistHelper.helpCreateWatchList(
              { gqlClient, options: multiOrg.adminOptionsA },
              {
                searchIndex: 'mine',
                startDateTime: twoDaysAgo.toISOString(),
                stopDateTime: tomorrow.toISOString(),
                name: `${citestMarker}-watchlist-${uuid.v4()}`,
                sourceTypeIds: [1, 2, 5],
                parentFolderId: multiOrg.subFolderIdB
              }
            );

          expect(createWatchlistResponse).toBeDefined();
          expect(createWatchlistResponse.id).toBeDefined();
          multiOrg.watchlistIdB0 = createWatchlistResponse.id;
        });

        afterAll(async () => {
          fs.writeFileSync(
            `./citest_folder_v1_multi_org_${watchlist}_watchlist.json`,
            JSON.stringify(multiOrg, null, 2)
          );
        });
      }
    );
  });

  // run script file designs/folders-202207/03-convert-data.sql

  describe('verify folder v2 convertion', () => {
    describe.each(['without', 'with'])(
      'single org %s watchlist',
      (watchlist) => {
        let singleOrgData;
        beforeAll(async () => {
          const rawData = fs.readFileSync(
            `./citest_folder_v1_single_org_${watchlist}_watchlist.json`
          );
          singleOrgData = JSON.parse(rawData);
        });

        it('update to folder V2 should success', async () => {
          const updateResult = await orgHelper.updateOrganization(
            { gqlClient, options: superOptions },
            {
              id: singleOrgData.org.id,
              jsondata: {
                features: {
                  v2FoldersEnabled: 'enabled'
                }
              }
            }
          );

          expect(updateResult).toBeDefined();
          expect(updateResult.id).toEqual(singleOrgData.org.id);
        });

        it('verify root folder converted', async () => {
          // login
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            {
              id: singleOrgData.userId,
              organizationGuid: singleOrgData.org.guid
            }
          );

          singleOrgData.adminOptions = impersonated.requestOptions;

          const getFolderResponse = await folderHelper.helpGetRootFolders(
            { gqlClient, options: singleOrgData.adminOptions },
            'watchlist'
          );

          expect(getFolderResponse).toBeDefined();
          const userRoot = getFolderResponse.find(
            (item) => item.ownerId === singleOrgData.userId
          );
          expect(userRoot).toBeDefined();
          expect(userRoot.id).toEqual(singleOrgData.rootFolderId);
        });

        it('verify sub folder converted', async () => {
          const getFolderResponse = await folderHelper.helpGetFolder(
            { gqlClient, options: singleOrgData.adminOptions },
            { id: singleOrgData.subFolderId }
          );

          expect(getFolderResponse).toBeDefined();
          expect(getFolderResponse.folder.id).toEqual(
            singleOrgData.subFolderId
          );
        });

        it('verify watchlist converted', async () => {
          if (watchlist.toLowerCase() === 'without') {
            return;
          }
          const getWatchlistResponse =
            await watchlistHelper.helpGetWatchlistById(
              { gqlClient, options: singleOrgData.adminOptions },
              { watchlistId: singleOrgData.watchlistId }
            );

          expect(getWatchlistResponse).toBeDefined();
          expect(getWatchlistResponse.id).toEqual(singleOrgData.watchlistId);
        });

        afterAll(async () => {
          // cleanup
          // delete watchlist
          if (watchlist.toLowerCase() === 'with' && singleOrgData.watchlistId) {
            await watchlistHelper.helpDeleteWatchList(
              { gqlClient, options: singleOrgData.adminOptions },
              { watchlistId: singleOrgData.watchlistId }
            );
          }

          // delete sub folder
          if (singleOrgData.subFolderId) {
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: singleOrgData.adminOptions },
              { folderId: singleOrgData.subFolderId, orderIndex: 0 }
            );
          }

          // delete user
          if (singleOrgData.userId) {
            await userHelper.deleteUser(
              { gqlClient, options: superOptions },
              singleOrgData.userId
            );
          }

          // delete org
          if (singleOrgData.org.id) {
            await orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              singleOrgData.org.id
            );
          }

          // delete file json
          fs.unlinkSync(
            './citest_folder_v1_single_org_' + watchlist + '_watchlist.json'
          );
        });
      }
    );

    describe('multi org without watchlist', () => {
      let multiOrgData;
      beforeAll(async () => {
        const rawData = fs.readFileSync(
          `./citest_folder_v1_multi_org_without_watchlist.json`
        );
        multiOrgData = JSON.parse(rawData);
      });

      it('update to folder V2 should success', async () => {
        const updateResultA = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: multiOrgData.orgA.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateResultA).toBeDefined();
        expect(updateResultA.id).toEqual(multiOrgData.orgA.id);

        const updateResultB = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: multiOrgData.orgB.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateResultB).toBeDefined();
        expect(updateResultB.id).toEqual(multiOrgData.orgB.id);
      });

      it('verify root folder org1 converted', async () => {
        // login userA to orgA
        const impersonatedA = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          {
            id: multiOrgData.userA.userId,
            organizationGuid: multiOrgData.orgA.guid
          }
        );
        multiOrgData.adminOptionsA = impersonatedA.requestOptions;

        const getFolderResponseA = await folderHelper.helpGetRootFolders(
          { gqlClient, options: multiOrgData.adminOptionsA },
          'watchlist'
        );

        expect(getFolderResponseA).toBeDefined();
        const userRootA = getFolderResponseA.find((item) => item.ownerId);
        expect(userRootA).toBeDefined();
        expect(userRootA.id).toEqual(multiOrgData.rootFolderIdA);
      });

      it('verify sub folder org1 converted', async () => {
        // org1 created first so root folderId will be converted
        const getFolderResponse = await folderHelper.helpGetFolder(
          { gqlClient, options: multiOrgData.adminOptionsA },
          { id: multiOrgData.subFolderIdA }
        );

        expect(getFolderResponse).toBeDefined();
        expect(getFolderResponse.folder.id).toEqual(multiOrgData.subFolderIdA);
      });

      it('verify new root folder org2 is created', async () => {
        // login userA to orgB
        const impersonatedB = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          {
            id: multiOrgData.userA.userId,
            organizationGuid: multiOrgData.orgB.guid
          }
        );
        multiOrgData.adminOptionsB = impersonatedB.requestOptions;

        // org1 created first so root folderId will be converted, org2 should have new root folder created
        const getFolderResponseB = await folderHelper.helpGetRootFolders(
          { gqlClient, options: multiOrgData.adminOptionsB },
          'watchlist'
        );

        expect(getFolderResponseB).toBeDefined();
        const userRootB = getFolderResponseB.find((item) => item.ownerId);
        expect(userRootB).toBeDefined();
      });

      it('verify sub folder org2 converted', async () => {
        const getFolderResponse = await folderHelper.helpGetFolder(
          { gqlClient, options: multiOrgData.adminOptionsB },
          { id: multiOrgData.subFolderIdB }
        );

        expect(getFolderResponse).toBeDefined();
        expect(getFolderResponse.folder.id).toEqual(multiOrgData.subFolderIdB);
      });

      afterAll(async () => {
        // cleanup
        // delete users
        if (multiOrgData.userA && multiOrgData.userA.userId) {
          await userHelper.deleteUser(
            { gqlClient, options: superOptions },
            multiOrgData.userA.userId
          );
        }

        // delete orgA
        if (multiOrgData.orgA.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            multiOrgData.orgA.id
          );
        }

        // delete orgB
        if (multiOrgData.orgB.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            multiOrgData.orgB.id
          );
        }

        // delete file json
        fs.unlinkSync('./citest_folder_v1_multi_org_without_watchlist.json');
      });
    });

    describe('multi org with watchlist', () => {
      let multiOrgData;
      beforeAll(async () => {
        const rawData = fs.readFileSync(
          `./citest_folder_v1_multi_org_with_watchlist.json`
        );
        multiOrgData = JSON.parse(rawData);
      });

      it('update to folder V2 should success', async () => {
        const updateResultA = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: multiOrgData.orgA.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateResultA).toBeDefined();
        expect(updateResultA.id).toEqual(multiOrgData.orgA.id);

        const updateResultB = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: multiOrgData.orgB.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateResultB).toBeDefined();
        expect(updateResultB.id).toEqual(multiOrgData.orgB.id);
      });

      it('verify root folder org1 converted', async () => {
        // login userA to orgA
        const impersonatedA = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          {
            id: multiOrgData.userA.userId,
            organizationGuid: multiOrgData.orgA.guid
          }
        );
        multiOrgData.adminOptionsA = impersonatedA.requestOptions;

        // org1 has 2 watchlists org2 only has 1 so root folder should be converted for org1 and new root folder created for org2
        const getFolderResponseA = await folderHelper.helpGetRootFolders(
          { gqlClient, options: multiOrgData.adminOptionsA },
          'watchlist'
        );

        expect(getFolderResponseA).toBeDefined();
        const userRootA = getFolderResponseA.find((item) => item.ownerId);
        expect(userRootA).toBeDefined();
        expect(userRootA.id).toEqual(multiOrgData.rootFolderIdA);
      });

      it('verify root folder org2 converted', async () => {
        // login userA to orgB
        const impersonatedB = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          {
            id: multiOrgData.userA.userId,
            organizationGuid: multiOrgData.orgB.guid
          }
        );
        multiOrgData.adminOptionsB = impersonatedB.requestOptions;

        // org1 has 2 watchlists org2 only has 1 so root folder should be converted for org1 and new root folder created for org2
        const getFolderResponseB = await folderHelper.helpGetRootFolders(
          { gqlClient, options: multiOrgData.adminOptionsB },
          'watchlist'
        );

        expect(getFolderResponseB).toBeDefined();
        const userRootB = getFolderResponseB.find((item) => item.ownerId);
        expect(userRootB).toBeDefined();
        expect(userRootB.id !== multiOrgData.rootFolderIdB).toBeTruthy();
      });

      it('verify sub folder org1 converted', async () => {
        const getFolderResponse = await folderHelper.helpGetFolder(
          { gqlClient, options: multiOrgData.adminOptionsA },
          { id: multiOrgData.subFolderIdA }
        );

        expect(getFolderResponse).toBeDefined();
        expect(getFolderResponse.folder.id).toEqual(multiOrgData.subFolderIdA);
      });

      it('verify sub folder org2 converted', async () => {
        const getFolderResponse = await folderHelper.helpGetFolder(
          { gqlClient, options: multiOrgData.adminOptionsB },
          { id: multiOrgData.subFolderIdB }
        );

        expect(getFolderResponse).toBeDefined();
        expect(getFolderResponse.folder.id).toEqual(multiOrgData.subFolderIdB);
      });

      it('verify watchlist in org1 converted', async () => {
        const getWatchlistResponse1 =
          await watchlistHelper.helpGetWatchlistById(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA1 }
          );

        expect(getWatchlistResponse1).toBeDefined();
        expect(getWatchlistResponse1.id).toEqual(multiOrgData.watchlistIdA1);

        const getWatchlistResponse2 =
          await watchlistHelper.helpGetWatchlistById(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA0 }
          );

        expect(getWatchlistResponse2).toBeDefined();
        expect(getWatchlistResponse2.id).toEqual(multiOrgData.watchlistIdA0);
      });

      it('verify watchlist in org2 converted', async () => {
        const getWatchlistResponse = await watchlistHelper.helpGetWatchlistById(
          { gqlClient, options: multiOrgData.adminOptionsB },
          { watchlistId: multiOrgData.watchlistIdB1 }
        );

        expect(getWatchlistResponse).toBeDefined();
        expect(getWatchlistResponse.id).toEqual(multiOrgData.watchlistIdB1);
      });

      afterAll(async () => {
        // cleanup
        // delete watchlists
        if (multiOrgData.watchlistIdA1) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA1 }
          );
        }
        if (multiOrgData.watchlistIdA0) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA0 }
          );
        }
        if (multiOrgData.watchlistIdB1) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { watchlistId: multiOrgData.watchlistIdB1 }
          );
        }

        // delete sub folders
        if (multiOrgData.subFolderIdA) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { folderId: multiOrgData.subFolderIdA, orderIndex: 0 }
          );
        }
        if (multiOrgData.subFolderIdB) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { folderId: multiOrgData.subFolderIdB, orderIndex: 0 }
          );
        }

        // delete users
        if (multiOrgData.userA && multiOrgData.userA.userId) {
          await userHelper.deleteUser(
            { gqlClient, options: superOptions },
            multiOrgData.userA.userId
          );
        }

        // delete orgA
        if (multiOrgData.orgA.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            multiOrgData.orgA.id
          );
        }

        // delete orgB
        if (multiOrgData.orgB.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            multiOrgData.orgB.id
          );
        }

        // delete file json
        fs.unlinkSync('./citest_folder_v1_multi_org_with_watchlist.json');
      });
    });

    describe('multi org with same amount of watchlist', () => {
      let multiOrgData;
      beforeAll(async () => {
        const rawData = fs.readFileSync(
          `./citest_folder_v1_multi_org_with_same_amount_watchlist.json`
        );
        multiOrgData = JSON.parse(rawData);
      });

      it('update to folder V2 should success', async () => {
        const updateResultA = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: multiOrgData.orgA.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateResultA).toBeDefined();
        expect(updateResultA.id).toEqual(multiOrgData.orgA.id);

        const updateResultB = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: multiOrgData.orgB.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateResultB).toBeDefined();
        expect(updateResultB.id).toEqual(multiOrgData.orgB.id);
      });

      it('verify root folder org2 created', async () => {
        // login userA to orgB
        const impersonatedB = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          {
            id: multiOrgData.userA.userId,
            organizationGuid: multiOrgData.orgB.guid
          }
        );
        multiOrgData.adminOptionsB = impersonatedB.requestOptions;

        // org2 has same amount of watchlists as org1 but org1 created first
        // so root folderId will be converted for org1 and new root folder created for org2
        const getFolderResponseB = await folderHelper.helpGetRootFolders(
          { gqlClient, options: multiOrgData.adminOptionsB },
          'watchlist'
        );

        expect(getFolderResponseB).toBeDefined();
        const userRootB = getFolderResponseB.find((item) => item.ownerId);
        expect(userRootB).toBeDefined();
        expect(userRootB.id !== multiOrgData.rootFolderIdB).toEqual(true);
      });

      it('verify root folder org1 converted', async () => {
        // login userA to orgA
        const impersonatedA = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          {
            id: multiOrgData.userA.userId,
            organizationGuid: multiOrgData.orgA.guid
          }
        );
        multiOrgData.adminOptionsA = impersonatedA.requestOptions;

        // org2 has same amount of watchlists as org1 but org1 created first
        // so root folderId will be converted for org1 and new root folder created for org2
        const getFolderResponseA = await folderHelper.helpGetRootFolders(
          { gqlClient, options: multiOrgData.adminOptionsA },
          'watchlist'
        );

        expect(getFolderResponseA).toBeDefined();
        const userRootA = getFolderResponseA.find((item) => item.ownerId);
        expect(userRootA).toBeDefined();
        expect(userRootA.id).toEqual(multiOrgData.rootFolderIdA);
      });

      it('verify sub folder org1 converted', async () => {
        const getFolderResponse = await folderHelper.helpGetFolder(
          { gqlClient, options: multiOrgData.adminOptionsA },
          { id: multiOrgData.subFolderIdA }
        );

        expect(getFolderResponse).toBeDefined();
        expect(getFolderResponse.folder.id).toEqual(multiOrgData.subFolderIdA);
      });

      it('verify sub folder org2 converted', async () => {
        const getFolderResponse = await folderHelper.helpGetFolder(
          { gqlClient, options: multiOrgData.adminOptionsB },
          { id: multiOrgData.subFolderIdB }
        );

        expect(getFolderResponse).toBeDefined();
        expect(getFolderResponse.folder.id).toEqual(multiOrgData.subFolderIdB);
      });

      it('verify watchlist in org1 converted', async () => {
        const getWatchlistResponse1 =
          await watchlistHelper.helpGetWatchlistById(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA1 }
          );

        expect(getWatchlistResponse1).toBeDefined();
        expect(getWatchlistResponse1.id).toEqual(multiOrgData.watchlistIdA1);

        const getWatchlistResponse2 =
          await watchlistHelper.helpGetWatchlistById(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA0 }
          );

        expect(getWatchlistResponse2).toBeDefined();
        expect(getWatchlistResponse2.id).toEqual(multiOrgData.watchlistIdA0);
      });

      it('verify watchlist in org2 converted', async () => {
        const getWatchlistResponse1 =
          await watchlistHelper.helpGetWatchlistById(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { watchlistId: multiOrgData.watchlistIdB0 }
          );

        expect(getWatchlistResponse1).toBeDefined();
        expect(getWatchlistResponse1.id).toEqual(multiOrgData.watchlistIdB0);

        const getWatchlistResponse2 =
          await watchlistHelper.helpGetWatchlistById(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { watchlistId: multiOrgData.watchlistIdB1 }
          );

        expect(getWatchlistResponse2).toBeDefined();
        expect(getWatchlistResponse2.id).toEqual(multiOrgData.watchlistIdB1);
      });

      afterAll(async () => {
        // cleanup
        // delete watchlists
        if (multiOrgData.watchlistIdA1) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA1 }
          );
        }
        if (multiOrgData.watchlistIdA0) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { watchlistId: multiOrgData.watchlistIdA0 }
          );
        }
        if (multiOrgData.watchlistIdB1) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { watchlistId: multiOrgData.watchlistIdB1 }
          );
        }
        if (multiOrgData.watchlistIdB0) {
          await watchlistHelper.helpDeleteWatchList(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { watchlistId: multiOrgData.watchlistIdB0 }
          );
        }

        // delete sub folders
        if (multiOrgData.subFolderIdA) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: multiOrgData.adminOptionsA },
            { folderId: multiOrgData.subFolderIdA, orderIndex: 0 }
          );
        }
        if (multiOrgData.subFolderIdB) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: multiOrgData.adminOptionsB },
            { folderId: multiOrgData.subFolderIdB, orderIndex: 0 }
          );
        }

        // delete users
        if (multiOrgData.userA && multiOrgData.userA.userId) {
          await userHelper.deleteUser(
            { gqlClient, options: superOptions },
            multiOrgData.userA.userId
          );
        }

        // delete orgA
        if (multiOrgData.orgA.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            multiOrgData.orgA.id
          );
        }

        // delete orgB
        if (multiOrgData.orgB.id) {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            multiOrgData.orgB.id
          );
        }

        // delete file json
        fs.unlinkSync(
          './citest_folder_v1_multi_org_with_same_amount_watchlist.json'
        );
      });
    });
  });

  afterAll(async () => {});
});

function getOrgAndUserInput(version = 'v1') {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: 'disabled',
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
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
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ]
      },
      {
        key: 'adminUser2',
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ]
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user-${version}-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      },
      {
        key: 'restrictUser',
        name: `${citestMarker}-restrict-user-${version}-${uuid.v4()}@localhost`,
        roleIds: []
      }
    ]
  };

  return createOrgAndUserInput;
}
