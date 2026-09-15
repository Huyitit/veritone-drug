import { gql } from 'graphql-request';

// Engine management operations

export const GET_ENGINE_CATEGORIES = gql`
  query engineCategories(
    $type: String
    $name: String
    $limit: Int
    $ids: [ID!]
    $id: ID
    $offset: Int = 0
  ) {
    engineCategories(
      type: $type
      name: $name
      limit: $limit
      ids: $ids
      id: $id
      offset: $offset
    ) {
      count
      records {
        id
        name
        type {
          name
        }
        description
      }
    }
  }
`;

export const GET_ENGINES = gql`
  query engines(
    $id: ID
    $ids: [ID!]
    $categoryId: String
    $category: String
    $state: [EngineState]
    $owned: Boolean
    $libraryRequired: Boolean
    $filter: EngineFilter
    $createsTDO: Boolean
    $limit: Int
    $buildId: ID
    $buildStatus: [BuildStatus!]
  ) {
    engines(
      id: $id
      ids: $ids
      categoryId: $categoryId
      category: $category
      state: $state
      owned: $owned
      libraryRequired: $libraryRequired
      filter: $filter
      createsTDO: $createsTDO
      limit: $limit
    ) {
      records {
        id
        name
        createsTDO
        libraryRequired
        categoryId
        state
        deploymentModel
        price
        priceDimension
        logoPath
        iconPath
        useCases
        industries
        manifest
        isPublic
        edgeVersion
        cpuResourceMcpu
        gpuSupported
        website
        jwtRights
        distributionType
        category {
          id
          name
        }
        builds(id: $buildId, buildStatus: $buildStatus) {
          records {
            id
            status
            dockerImage
          }
        }
      }
      count
      offset
      limit
    }
  }
`;

export const GET_ENGINE = gql`
  query engine($id: ID!) {
    engine(id: $id) {
      id
      name
      createsTDO
      libraryRequired
      categoryId
      state
      deploymentModel
      fields {
        max
        min
        type
        name
        label
        info
        options {
          key
          value
        }
        defaultValue
        defaultValues
      }
      price
      priceDimension
      logoPath
      iconPath
      useCases
      industries
      manifest
      testingDetails {
        email
        mediaFileUri
        customFields
      }
      isPublic
      edgeVersion
      cpuResourceMcpu
      gpuSupported
      website
      jwtRights
      distributionType
      category {
        id
        name
      }
      builds {
        records {
          id
          status
          dockerImage
        }
      }
    }
  }
`;

export const CREATE_ENGINE = gql`
  mutation createEngine($input: CreateEngine!) {
    createEngine(input: $input) {
      id
      name
      state
      deploymentModel
      categoryId
      createsTDO
      fields {
        max
        min
        type
        name
        label
        info
        options {
          key
          value
        }
        defaultValue
        defaultValues
      }
      price
      priceDimension
      logoPath
      iconPath
      libraryRequired
      useCases
      industries
      manifest
      testingDetails {
        email
        mediaFileUri
        customFields
      }
      isPublic
      edgeVersion
      cpuResourceMcpu
      gpuSupported
      website
      jwtRights
      distributionType
    }
  }
`;

export const UPDATE_ENGINE = gql`
  mutation updateEngine($input: UpdateEngine!) {
    updateEngine(input: $input) {
      id
      standaloneJobTemplates {
        type
        template
      }
      name
      state
      deploymentModel
      categoryId
      fields {
        max
        min
        type
        name
        label
        info
        options {
          key
          value
        }
        defaultValue
        defaultValues
      }
      testingDetails {
        email
        mediaFileUri
        customFields
      }
      price
      priceDimension
      logoPath
      iconPath
      libraryRequired
      useCases
      industries
      manifest
      isPublic
      edgeVersion
      cpuResourceMcpu
      gpuSupported
      website
      jwtRights
      distributionType
    }
  }
`;

export const DELETE_ENGINE = gql`
  mutation deleteEngine($id: ID!) {
    deleteEngine(id: $id) {
      id
      message
    }
  }
`;

export const CREATE_ENGINE_BUILD = gql`
  mutation createEngineBuild($input: CreateBuild!) {
    createEngineBuild(input: $input) {
      id
      engineId
      status
      validStateActions
      engine {
        state
      }
      runtime
    }
  }
`;

export const UPDATE_ENGINE_BUILD = gql`
  mutation updateEngineBuild($input: UpdateBuild!) {
    updateEngineBuild(input: $input) {
      id
      name
      releaseNotes
      status
      engineId
      validStateActions
      runtime
      engine {
        state
      }
    }
  }
`;

export const GET_ENGINE_BUILDS = gql`
  query engineBuilds($engineId: ID!, $status: [String], $buildId: ID) {
    engine(id: $engineId) {
      builds(status: $status, id: $buildId) {
        records {
          id
          status
          dockerImage
          manifest
          runtime
          createdDateTime
          modifiedDateTime
        }
      }
    }
  }
`;

export const DELETE_ENGINE_BUILD = gql`
  mutation deleteEngineBuild($input: DeleteBuild!) {
    deleteEngineBuild(input: $input) {
      id
      message
    }
  }
`;

export const UPLOAD_ENGINE = gql`
  mutation uploadEngineResult($input: UploadEngineResult!) {
    uploadEngineResult(input: $input) {
      id
      uri
      assetType
      contentType
    }
  }
`;

export const ADD_TO_ENGINE_WHITELIST = gql`
  mutation addToEngineWhitelist($input: SetEngineWhitelist!) {
    addToEngineWhitelist(toAdd: $input) {
      organizationId
    }
  }
`;

export const GET_ENGINE_BUILD = gql`
  query engineBuild($id: ID!) {
    engineBuild(id: $id) {
      id
      engineId
      status
      engine {
        id
        state
      }
    }
  }
`;

export const ADD_TO_ENGINE_BLACKLIST = gql`
  mutation addToEngineBlacklist($toAdd: SetEngineBlacklist!) {
    addToEngineBlacklist(toAdd: $toAdd) {
      engines {
        id
      }
      engineCategories {
        id
      }
    }
  }
`;

export const ENGINE_WORKFLOW = gql`
  mutation engineWorkflow($input: EngineWorkflow) {
    engineWorkflow(input: $input) {
      id
      state
    }
  }
`;
