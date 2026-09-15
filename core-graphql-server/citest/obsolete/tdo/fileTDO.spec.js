const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const { safe } = require('../helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const util = require('../../util.js')();

const rootFolderType = 'collection';
const citestMarker = global.citestMarker || 'citest-should-delete';

const testStateObject = {
  testId: null,
  testName: null,
  testDescription: null,
  testParentId: null,
  testMoveParentId: null,
  testOrderIndex: 0,
  testIsDeleted: false,
  // this is used for which step of the tests are on
  test: 0
};

let folderId = null;
let tdoId = null;
let newFolderId = null;
let deleteFolder1 = null;
let deleteFolder2 = null;
let olpMigration = null;
describe('citest_tdo: setup TDO filing test', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    const queryCheckOrgSetting = `
    query me {
      me {
        id
        name
        organization {
          id
          name
          jsondata
        }
      }
    }`;

    const orgData = await gqlClient.query(queryCheckOrgSetting);
    olpMigration = _.get(
      orgData,
      'me.organization.jsondata.features.olpMigration',
      false
    );
  });

  it('create a TDO', async () => {
    const query = `
    mutation {
      createTDO(input: {
          status: "uploaded",
          startDateTime: 1476726655,
          stopDateTime: 1476726655
      }) {
          id
          applicationId
      }
    }`;

    const result = await gqlClient.query(query);

    tdoId = _.get(result, 'createTDO.id');
    expect(tdoId).toBeDefined();
  });

  it('update TDO name', async () => {
    const tdoName = `${citestMarker}-testTDO-${uuid.v4()}`;
    const query = `mutation {
      updateTDO(input: {
        id: ${tdoId}
        name: "${tdoName}"
        details:{
          veritoneFile:{
            fileName:"${citestMarker}-testTDOFileName"
          }
        }
      }) {
        id
        name
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.updateTDO).toBeDefined();
    expect(result.updateTDO.name).toEqual(tdoName);
  });

  it('create root folders', async () => {
    const query = `mutation {
        createRootFolders(rootFolderType: ${rootFolderType}) {
          id
          description
          treeObjectId
          rootFolderTypeId
          typeId
        }
      }`;

    const result = await gqlClient.query(query);

    expect(result.createRootFolders).toBeDefined();

    const rootFolders = result.createRootFolders;

    testStateObject.testParentId = rootFolders[1].treeObjectId;
    testStateObject.testMoveParentId = rootFolders[0].treeObjectId;
  });

  it('create a folder', async () => {
    testStateObject.testName = citestMarker + '-graphql-folders';
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
          description
          createdDateTime
          modifiedDateTime
          status
          ownerId
          maxDepth
          orderIndex
        }
      }`;
    const result = await gqlClient.query(query);
    testStateObject.testId = result.createFolder.treeObjectId;
    testStateObject.test = 1;

    expect(result.createFolder.id).toBeDefined();
    expect(result.createFolder.name).toEqual(testStateObject.testName);
    folderId = result.createFolder.treeObjectId;
    deleteFolder1 = folderId;
  });

  it('throw error if TDO is not found', async () => {
    const query = `mutation {
          fileTemporalDataObject(input: {
            tdoId: "-123"
            folderId: "${folderId}"
          }) {
            id
            folders {
              id
            }
          }
        }`;
    expect(async () => gqlClient.query(query)).rejects.toThrow(
      'The requested TDO was not found'
    );
  });

  it('file a TDO in a folder', async () => {
    const query = `mutation {
          fileTemporalDataObject(input: {
            tdoId: "${tdoId}"
            folderId: "${folderId}"
          }) {
            id
            folders {
              id
              parent {
                id
              }
            }
          }
        }`;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'fileTemporalDataObject.id')).toBeDefined();
  });

  it('throw error refiling a TDO in a folder', async () => {
    const query = `mutation {
          fileTemporalDataObject(input: {
            tdoId: "${tdoId}"
            folderId: "${folderId}"
          }) {
            id
            folders {
              id
            }
          }
        }`;
    expect(async () => gqlClient.query(query)).rejects.toThrow(
      'TDO has already been filed elsewhere.'
    );
  });

  it('create a folder', async () => {
    testStateObject.testName = citestMarker + '-graphql-test-folders';
    testStateObject.testDescription =
      citestMarker + '-graphql-folders-description';

    const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}-2",
          description: "${testStateObject.testDescription}-2",
          parentId: "${testStateObject.testParentId}",
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType}
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
        }
      }`;
    const result = await gqlClient.query(query);

    expect(result.createFolder.id).toBeDefined();
    expect(result.createFolder.name).toEqual(testStateObject.testName + '-2');
    newFolderId = result.createFolder.treeObjectId;
    deleteFolder2 = newFolderId;
  });

  it('get a folder', async () => {
    const query = `query {
        folder(id: "${folderId}") {
          id
          name
          description
          typeId
          subfolders {
            id
            treeObjectId
            name
            description
          }
          childTDOs {
            count
            records {
              id
            }
          }
        }
      }`;
    const result = await gqlClient.query(query);

    expect(result.folder.id).toBeDefined();
    expect(result.folder.subfolders).toEqual([]);
    expect(result.folder.childTDOs.count).toEqual(1);
    expect(result.folder.childTDOs.records[0]).toHaveProperty('id', tdoId);
  });

  it('move tdo to new folder', async () => {
    const query = `mutation {
        moveTemporalDataObject(input: {
          tdoId: "${tdoId}"
          oldFolderId: "${folderId}"
          newFolderId: "${newFolderId}"
        }) {
          id
          folders {
            id
            treeObjectId
          }
        }
      }`;

    const moveFolderPromise = gqlClient.query(query);
    // if feature flag olpMigration is enabled.
    // During the OLP transition, moving files is disabled because it can lead to resources without ACEs being locked out

    if (olpMigration) {
      await expect(moveFolderPromise).rejects.toThrow(
        /OLP is being enabled. During the OLP transition, moving files is disabled because it can lead to resources without ACEs being locked out/
      );
    } else {
      const result = await moveFolderPromise;
      await util.sleep(500); // Wait for eventual consistency
      testStateObject.test = 3;
      const { moveTemporalDataObject } = result;
      expect(moveTemporalDataObject.id).toEqual(tdoId);
      expect(_.get(moveTemporalDataObject, 'folders[0].treeObjectId')).toEqual(
        newFolderId
      );

      folderId = newFolderId;
    }
  });

  it('unfile a TDO in a folder', async () => {
    const query = `mutation {
          unfileTemporalDataObject(input: {
            tdoId: "${tdoId}"
            folderId: "${folderId}"
          }) {
            id
            folders {
              id
            }
          }
        }`;
    const result = await gqlClient.query(query);
    let unfileTemporalDataObject = _.get(result, 'unfileTemporalDataObject');
    expect(unfileTemporalDataObject.id).toBeDefined();
    expect(unfileTemporalDataObject.folders).toEqual([]);
  });

  it('have moved', async () => {
    const query = `query {
      folder(id: "${folderId}") {
        id
        childTDOs {
          count
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.folder.id).toBeDefined();
    expect(result.folder.subfolders).toBeFalsy();
    expect(result.folder.childTDOs.count).toEqual(0);
  });

  it('file a TDO in a folder again', async () => {
    const query = `mutation {
        fileTemporalDataObject(input: {
          tdoId: "${tdoId}"
          folderId: "${folderId}"
        }) {
          id
          folders {
            id
            parent {
              id
            }
          }
        }
      }`;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'fileTemporalDataObject.id')).toBeDefined();
  });

  it('have been filed again', async () => {
    const query = `query {
      folder(id: "${folderId}") {
        id
        childTDOs {
          count
          records {
            id
          }
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.folder.id).toBeDefined();
    expect(result.folder.childTDOs.count).toEqual(1);
    expect(result.folder.childTDOs.records[0].id).toEqual(tdoId);
  });

  it('delete the TDO', async () => {
    const query = `
  mutation {
    deleteTDO(id: "${tdoId}") {
      id
      message
    }
  }`;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
  });

  it('have been removed from folder', async () => {
    const query = `query {
      folder(id: "${folderId}") {
        id
        childTDOs {
          count
        }
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.folder.id).toBeDefined();
    expect(result.folder.childTDOs.count).toEqual(0);
  });

  it('delete a folder', async () => {
    const query = `mutation {
        deleteFolder(input: {
          id: "${deleteFolder1}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
    const result = await gqlClient.query(query);
    testStateObject.test = 4;
    testStateObject.testIsDeleted = true;

    expect(result.deleteFolder.id).toEqual(deleteFolder1);
  });

  it('delete move folder', async () => {
    const query = `mutation {
        deleteFolder(input: {
          id: "${deleteFolder2}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
    const result = await gqlClient.query(query);

    expect(result.deleteFolder.id).toEqual(deleteFolder2);
  });

  afterAll(async () => {
    // Clean up TDO
    if (tdoId) {
      await safe(`delete TDO ${tdoId}`, async () => {
        const query = `mutation { deleteTDO(id: "${tdoId}") { id message } }`;
        await gqlClient.query(query);
      });
    }

    // Clean up folders
    const folderIds = [deleteFolder1, deleteFolder2].filter(Boolean);
    for (const id of folderIds) {
      await safe(`delete folder ${id}`, async () => {
        const query = `mutation { deleteFolder(input: { id: "${id}", orderIndex: ${testStateObject.testOrderIndex} }) { id } }`;
        await gqlClient.query(query);
      });
    }
  });
});
