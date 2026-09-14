export const USER_LOGIN = `
  mutation Login($input: UserLogin!) {
    userLogin(input: $input) {
      token
      user {
        id
        organizationId
        organization {
          id
          name
        }
      }
      organization {
        id
        name
      }
    }
  }
`;

export const CREATE_ROOT_FOLDERS = `
  mutation CreateRootFolders($rootFolderType: RootFolderType) {
    createRootFolders(rootFolderType: $rootFolderType) {
      id
      rootFolderTypeId
      name
    }
  }
`;

export const CREATE_FOLDER = `
  mutation CreateFolder($input: CreateFolder!) {
    createFolder(input: $input) {
      id
      name
      description
    }
  }
`;

export const UPDATE_FOLDER = `
  mutation UpdateFolder($input: UpdateFolder!) {
    updateFolder(input: $input) {
      id
      name
    }
  }
`;

export const MOVE_FOLDER = `
  mutation MoveFolder($input: MoveFolder!) {
    moveFolder(input: $input) {
      id
      name
    }
  }
`;

export const MOVE_FOLDERS = `
  mutation MoveFolders($input: MoveFolders!) {
    moveFolders(input: $input) {
      organizationId
      newParentFolderId
      validFolderIds
      invalidFolderIds
      message
    }
  }
`;

export const DELETE_FOLDER = `
  mutation DeleteFolder($input: DeleteFolder!) {
    deleteFolder(input: $input) {
      message
    }
  }
`;
