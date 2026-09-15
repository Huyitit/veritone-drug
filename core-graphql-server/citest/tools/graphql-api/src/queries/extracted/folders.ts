import { gql } from 'graphql-request';

// Folder management operations

export const CREATE_ROOT_FOLDERS = gql`
  mutation createRootFolders($rootFolderType: RootFolderType!) {
    createRootFolders(rootFolderType: $rootFolderType) {
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
  }
`;

export const GET_ROOT_FOLDERS = gql`
  query rootFolders($rootFolderType: RootFolderType) {
    rootFolders(type: $rootFolderType) {
      id
      description
      treeObjectId
      rootFolderTypeId
      childFolders {
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
      typeId
      organizationId
      ownerId
      createdDateTime
      orderIndex
      name
    }
  }
`;

export const GET_ROOT_FOLDER_WITH_CHILD_FOLDERS = gql`
  query rootFolderWithChildFolders(
    $rootFolderType: RootFolderType
    $limit: Int = 30
    $offset: Int = 0
    $orderBy: [FolderOrderBy!]
    $names: [String]
    $nameMatch: StringMatch = contains
  ) {
    rootFolders(type: $rootFolderType) {
      id
      name
      description
      ownerId
      treeObjectId
      childFolders(
        limit: $limit
        offset: $offset
        orderBy: $orderBy
        names: $names
        nameMatch: $nameMatch
      ) {
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
  }
`;

export const CREATE_FOLDER_BASIC = gql`
  mutation createFolderBasic($input: CreateFolder!) {
    createFolder(input: $input) {
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
      rootFolderTypeId
    }
  }
`;

export const CREATE_FOLDER = gql`
  mutation createFolder($input: CreateFolder!) {
    createFolder(input: $input) {
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
      parent {
        id
      }
      entityTags {
        tagKey
        tagValue
      }
      rootFolderTypeId
    }
  }
`;

export const GET_FOLDER_BASIC = gql`
  query folderBasic($id: ID!) {
    folder(id: $id) {
      id
      treeObjectId
      name
      description
      typeId
      status
      ownerId
      createdDateTime
      modifiedDateTime
      orderIndex
    }
  }
`;

export const GET_FOLDER = gql`
  query folder($id: ID!) {
    folder(id: $id) {
      id
      treeObjectId
      name
      description
      typeId
      status
      ownerId
      sharedAccess
      parent {
        id
      }
      createdDateTime
      modifiedDateTime
      orderIndex
      subfolders {
        id
        treeObjectId
        name
        description
        orderIndex
        typeId
      }
      childTDOs {
        count
        records {
          id
          name
          startDateTime
          stopDateTime
        }
        offset
        limit
      }
      contentTemplates {
        id
        folderId
        sdoId
        schemaId
      }
    }
  }
`;

export const UPDATE_FOLDER = gql`
  mutation updateFolder($input: UpdateFolder!) {
    updateFolder(input: $input) {
      id
      treeObjectId
      name
      description
      modifiedDateTime
      orderIndex
      status
      entityTags {
        tagKey
        tagValue
      }
    }
  }
`;

export const DELETE_FOLDER = gql`
  mutation deleteFolder($input: DeleteFolder!) {
    deleteFolder(input: $input) {
      id
      message
    }
  }
`;

export const MOVE_FOLDER = gql`
  mutation moveFolder($input: MoveFolder) {
    moveFolder(input: $input) {
      id
      treeObjectId
      name
      parent {
        id
        treeObjectId
      }
      modifiedDateTime
    }
  }
`;

export const MOVE_FOLDERS = gql`
  mutation moveFolders($input: MoveFolders) {
    moveFolders(input: $input) {
      organizationId
      newParentFolderId
      validFolderIds
      invalidFolderIds
      message
    }
  }
`;

export const CREATE_FOLDER_CONTENT_TEMPLATE = gql`
  mutation createFolderContentTemplate($input: CreateFolderContentTemplate!) {
    createFolderContentTemplate(input: $input) {
      id
      folderId
      sdoId
      schemaId
    }
  }
`;

export const SHARE_FOLDER = gql`
  mutation shareFolder($input: ShareFolderInput) {
    shareFolder(input: $input) {
      id
      name
      status
      orderIndex
      sharedWith {
        read
        write
      }
      sharedAccess
    }
  }
`;

// GET_FOLDER_TREE operation removed - folderTree query does not exist in schema

export const UPDATE_FOLDER_CONTENT_TEMPLATE = gql`
  mutation updateFolderContentTemplate($input: UpdateFolderContentTemplate!) {
    updateFolderContentTemplate(input: $input) {
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
  }
`;

export const DELETE_FOLDER_CONTENT_TEMPLATE = gql`
  mutation deleteFolderContentTemplate($id: ID!) {
    deleteFolderContentTemplate(id: $id) {
      id
    }
  }
`;

export const BUNK_CREATE_WATCHLIST = gql`
  mutation bulkCreateWatchlist($watchlists: [CreateWatchlist!]) {
    bulkCreateWatchlist(input: { watchlists: $watchlists }) {
      records {
        id
        stopDateTime
        name
        cognitiveSearches {
          id
          mentionStatusId
        }
        folders {
          id
          treeObjectId
          name
        }
        sourceIds
        subscriptions {
          id
          scheduledDay
          scheduledTime
          scheduledTimeZone
          contact {
            emailAddress
            phoneNumber
          }
        }
      }
    }
  }
`;

export const DELETE_SUBSCRIPTION = gql`
  mutation deleteSubscription($id: ID!) {
    deleteSubscription(id: $id) {
      id
      message
    }
  }
`;

export const DELETE_COGNATIVE_SEARCH = gql`
  mutation deleteCognitiveSearch($id: ID!) {
    deleteCognitiveSearch(id: $id) {
      id
      message
    }
  }
`;

export const CREATE_SUBSCRIPTION = gql`
  mutation createSubscription($input: CreateSubscription!) {
    createSubscription(input: $input) {
      id
      jsondata
      targetId
      isActive
    }
  }
`;

export const CREATE_COGNITIVE_SEARCH = gql`
  mutation createCognitiveSearch($input: CreateCognitiveSearch!) {
    createCognitiveSearch(input: $input) {
      id
      query
      profile
    }
  }
`;

export const UPDATE_COGNITIVE_SEARCH = gql`
  mutation updateCognitiveSearch($input: UpdateCognitiveSearch!) {
    updateCognitiveSearch(input: $input) {
      id
      mentionStatusId
      profile
      query
    }
  }
`;

export const SUBSCRIPTION = gql`
  query subscription($id: ID!) {
    subscription(id: $id) {
      id
    }
  }
`;

export const FILE_WATCHLIST = gql`
  mutation fileWatchlist($input: FileWatchlist!) {
    fileWatchlist(input: $input) {
      id
      folders {
        id
      }
    }
  }
`;
