import { gql } from 'graphql-request';

export const CREATE_THREE_FOLDERS = gql`
  mutation createThreeFolders(
    $input1: CreateFolder!
    $input2: CreateFolder!
    $input3: CreateFolder!
  ) {
    folder1: createFolder(input: $input1) {
      id
      treeObjectId
      name
      status
    }
    folder2: createFolder(input: $input2) {
      id
      treeObjectId
      name
      status
    }
    folder3: createFolder(input: $input3) {
      id
      treeObjectId
      name
      status
    }
  }
`;