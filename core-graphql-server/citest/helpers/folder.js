const _ = require('lodash');
const moment = require('moment');

async function helpGetRootFolders(client, rootFolderType, childFoldersOptions) {
  const { gqlClient, options } = client;

  // Build childFolders query with optional parameters
  let childFoldersQuery = 'childFolders';
  if (childFoldersOptions) {
    const params = [];
    if (childFoldersOptions.limit)
      params.push(`limit: ${childFoldersOptions.limit}`);
    if (childFoldersOptions.offset !== undefined)
      params.push(`offset: ${childFoldersOptions.offset}`);
    if (childFoldersOptions.orderBy) {
      const orderByStr = childFoldersOptions.orderBy
        .map((o) => `{field: ${o.field}, direction: ${o.direction}}`)
        .join(', ');
      params.push(`orderBy: [${orderByStr}]`);
    }
    if (params.length > 0) {
      childFoldersQuery += `(${params.join(', ')})`;
    }
  }

  const result = await gqlClient.query(
    `query cmsFolder {
      rootFolders(
        type: ${rootFolderType}
      ) {
        id
        name
        description
        ownerId
        treeObjectId
        ${childFoldersQuery} {
          count
          records {
            id
            name
            status
            description
            treeObjectId
            orderIndex
            ownerId
            modifiedDateTime
            contentTemplates {
              id
              folderId
            }
          }
        }
      }
    }`,
    {},
    options
  );
  const rootFolders = _.get(result, 'rootFolders');
  return rootFolders;
}

/*
  input: {
    $name: String!, $description: String!, $parentId: ID!, $rootFolderType: RootFolderType
    $orderIndex: Int, $userId: ID, $entityTags: [EntityTagInput], addAcesEntries
  }
*/
async function helpCreateFolder(client, input) {
  const { gqlClient, options } = client;
  const { addAcesEntries } = input;

  let addACEsString = '';
  if (addAcesEntries) {
    addACEsString = `
    addACEs(
      entries: ${addAcesEntries}
    ) {
      records {
        id
        options
        objectID
        objectType
      }
      count
    }`;
  }

  const createFolderQuery = `
    mutation createFolder(
      $name: String!, $description: String!, $parentId: ID!, $rootFolderType: RootFolderType
      $orderIndex: Int, $userId: ID, $entityTags: [EntityTagInput]
    ) {
      createFolder(
        input: {
          name: $name
          description: $description
          parentId: $parentId
          rootFolderType: $rootFolderType
          orderIndex: $orderIndex
          userId: $userId
          entityTags: $entityTags
        }
      ) {
        id
        name
        orderIndex
        ${addACEsString}
      }
    }`;

  const result = await gqlClient.query(createFolderQuery, input, options);
  return _.get(result, 'createFolder');
}

async function helpDeleteFolder(client, input) {
  const { gqlClient, options } = client;
  const { folderId, orderIndex } = input;

  const result = await gqlClient.query(
    `mutation deleteFolder {
      deleteFolder(
        input: {
          id: "${folderId}"
          orderIndex: ${orderIndex}
        }
      ) {
        id
      }
    }`,
    {},
    options
  );

  return _.get(result, 'deleteFolder');
}

async function helpCreateFolderContentTemplate(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `mutation createFolderContentTemplate ($folderId: ID!, $sdoId: ID!, $schemaId: ID!, $data: JSONData ) {
      createFolderContentTemplate (input: {
        folderId: $folderId
        sdoId: $sdoId
        schemaId: $schemaId
        data: $data
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
    input,
    options
  );
}

async function helpDeleteContentFolderTemplate(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  const result = await gqlClient.query(
    `mutation del {
      deleteFolderContentTemplate (id: "${id}"){
        id
      }
    }`,
    {},
    options
  );

  return _.get(result, 'deleteFolderContentTemplate');
}

async function helpUpdateFolderContentTemplate(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `mutation updateFolderContentTemplate($id: ID!, $folderId: ID, $sdoId: ID, $schemaId: ID, $data: JSONData) {
      updateFolderContentTemplate(input: { id: $id, folderId: $folderId, sdoId: $sdoId, schemaId: $schemaId, data: $data }) {
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
    input,
    options
  );
}

async function helpGetFolder(client, input) {
  const { gqlClient, options } = client;
  const { id, isShowChild, isShowTdo, isFolderPath, treeObjectId } = input;

  return gqlClient.query(
    `query folder {
      folder(
        id: "${id}"
      ) {
        id
        name
        orderIndex
        description
        status
        ${treeObjectId ? `treeObjectId` : ''}
        ${
          isFolderPath
            ? `folderPath {
                id
                name
                folderPath {
                  id
                  name
                }
              }`
            : ''
        }
        ${
          isShowTdo
            ? `childTDOs {
                count
                records {
                  id
                  name
                }
              }`
            : ''
        }
        ${
          isShowChild
            ? `childFolders {
                records {
                  id
                  name
                  orderIndex
                }
              }`
            : ''
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
        }
      }
    }`,
    {},
    options
  );
}

async function createFolderHierarchy(
  gqlClient,
  rootFolderId,
  rootFolderType,
  citestMarker,
  authOptions
) {
  try {
    const createFolder = async (name, parentId) => {
      const query = `mutation {
      createFolder(input: {
        name: "${name}",
        description: "CI Test Folder",
        parentId: "${parentId}",
        rootFolderType: ${rootFolderType}
      }) {
        id
        treeObjectId
        name
      }
    }`;
      return await gqlClient.query(query, null, authOptions);
    };

    const parentResult = await createFolder(
      `${citestMarker}-parent-${moment().unix()}`,
      rootFolderId
    );
    const parent = {
      id: parentResult.createFolder.id,
      treeObjectId: parentResult.createFolder.treeObjectId
    };

    const childResult = await createFolder(
      `${citestMarker}-child-${moment().unix()}`,
      parent.id
    );
    const child = {
      id: childResult.createFolder.id,
      treeObjectId: childResult.createFolder.treeObjectId
    };

    const leafResult = await createFolder(
      `${citestMarker}-leaf-${moment().unix()}`,
      child.id
    );
    const leaf = {
      id: leafResult.createFolder.id,
      treeObjectId: leafResult.createFolder.treeObjectId
    };

    return { parent, child, leaf };
  } catch (error) {
    console.error('Failed to create folder hierarchy:', error.message);
    throw error;
  }
}

async function createTDOInLeaf(gqlClient, leafFolderId, authOptions) {
  try {
    const now = moment.utc();
    const query = `mutation {
    createTDO(input: {
      startDateTime: ${Math.floor(now.valueOf() / 1000)},
      stopDateTime: ${Math.floor(now.add(5, 'minutes').valueOf() / 1000)},
      addToIndex: true,
      parentFolderId: "${leafFolderId}"
    }) {
      id
    }
  }`;
    const result = await gqlClient.query(query, null, authOptions);
    return result.createTDO.id;
  } catch (error) {
    console.error('Failed to create TDO in leaf:', error.message);
    throw error;
  }
}

async function cleanupFolderPathTDO(gqlClient, tdoId, folders, authOptions) {
  if (tdoId) {
    try {
      await gqlClient.query(
        `mutation { deleteTDO(id: "${tdoId}") { id } }`,
        null,
        authOptions
      );
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  }

  for (const f of folders) {
    if (f?.id) {
      try {
        await gqlClient.query(
          `mutation { deleteFolder(input: { id: "${f.id}", orderIndex: 0 }) { id } }`,
          null,
          authOptions
        );
      } catch (error) {
        console.warn('Cleanup error:', error.message);
      }
    }
  }
}

async function helpCreateRootFolder(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation createRootFolders ($rootFolderType: RootFolderType) {
    createRootFolders (rootFolderType: $rootFolderType) {
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

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'createRootFolders');
}

async function helpUpdateFolder(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation updateFolder($input: UpdateFolder) {
      updateFolder(input: $input) {
        id
        name
        description
        status
        orderIndex
        entityTags {
          tagValue
          tagKey
        }
      }
    }`;
  const result = await gqlClient.query(query, { input }, options);

  return _.get(result, 'updateFolder');
}

async function helpMoveFolder(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation moveFolder ($input: MoveFolder) {
    moveFolder (input: $input){
      id
      name
      description
      status
      orderIndex
      parent {
        id
        name
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'moveFolder');
}

async function helpMoveMultiFolders(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation ($input: MoveFolders) {
    moveFolders (input: $input){
      organizationId
      newParentFolderId
      validFolderIds
      invalidFolderIds
      message
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'moveFolders');
}

async function helpShareFolder(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `mutation shareFolder ($input: ShareFolderInput) {
      shareFolder (input: $input) {
        id
        name
        status
        orderIndex
        sharedWith{
          read
          write
        }
        sharedAccess
      }
    }`,
    { input },
    options
  );

  return _.get(result, 'shareFolder');
}

async function helpGetSharedFolder(client, input) {
  const { gqlClient, options } = client;

  const result = await gqlClient.query(
    `query {
      sharedFolders{
        id
        name
        status
        orderIndex
      }
    }`,
    {},
    options
  );

  return _.get(result, 'sharedFolders');
}

async function helpCreateRootFolders(client, rootFolderType) {
  const { gqlClient, options } = client;
  const result = await gqlClient.query(
    `mutation CREATE_rootFolder {
      createRootFolders(rootFolderType: ${rootFolderType}) {
        id
        ownerId
      }
    }`,
    {},
    options
  );
  const rootFolder = _.get(result, 'createRootFolders');
  return rootFolder;
}

module.exports = {
  helpGetRootFolders,
  helpCreateFolder,
  helpDeleteFolder,
  helpUpdateFolder,
  helpShareFolder,
  helpMoveFolder,
  helpCreateFolderContentTemplate,
  helpUpdateFolderContentTemplate,
  helpDeleteContentFolderTemplate,
  helpGetFolder,
  createFolderHierarchy,
  createTDOInLeaf,
  cleanupFolderPathTDO,
  helpCreateRootFolder,
  helpGetSharedFolder,
  helpMoveMultiFolders,
  helpCreateRootFolders
};
