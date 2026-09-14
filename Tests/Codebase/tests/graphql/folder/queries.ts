export const CHECK_ROOT_FOLDERS = `
  query CheckRootFolders($type: RootFolderType) {
    rootFolders(type: $type) {
      id
      typeId
      rootFolderTypeId
      name
    }
  }
`;

export const GET_ROOT_FOLDERS = `
  query GetRootFolders {
    rootFolders {
      id
      ownerId
    }
  }
`;

export const GET_FOLDER = `
  query GetFolder($id: ID!) {
    folder(id: $id) {
      id
      name
      childFolders {
        records {
          id
          name
        }
      }
    }
  }
`;

export const GET_FOLDER_OVERVIEW = `
  query GetFolderOverview($ids: [ID!]!) {
    folderOverview(ids: $ids) {
      childFoldersCount
      childNonFolderObjectsCount
    }
  }
`;
