import { gql } from 'graphql-request';

// Flow management operations

export const CREATE_FLOW = gql`
  mutation createFlow($input: CreateFlow!) {
    createFlow(input: $input) {
      id
      name
      description
      ownerOrganizationId
      isPublic
      categoryId
      deploymentModel
      createdDateTime
      modifiedDateTime
      state
    }
  }
`;

export const GET_FLOW = gql`
  query flow($id: ID!) {
    flow(id: $id) {
      id
      name
      description
      ownerOrganizationId
      isPublic
      categoryId
      deploymentModel
      createdDateTime
      modifiedDateTime
      state
      tasks {
        records {
          id
          engineId
          payload
          executionPreferences {
            priority
            parentCompleteBeforeStarting
          }
          ioFolders {
            referenceId
            mode
            type
          }
        }
      }
    }
  }
`;

export const GET_FLOWS = gql`
  query flows($offset: Int, $limit: Int) {
    flows(offset: $offset, limit: $limit) {
      records {
        id
        name
        description
        ownerOrganizationId
        isPublic
        categoryId
        deploymentModel
        createdDateTime
        modifiedDateTime
        state
      }
      count
      offset
      limit
    }
  }
`;

// updateFlow mutation does not exist in schema
export const UPDATE_FLOW = gql`
  mutation updateFlow($input: CreateEngine) {
    updateFlow(input: $input) {
      id
      ownerOrganizationId
      isPublic
      name
      categoryId
      deploymentModel
    }
  }
`;

// deleteFlow mutation does not exist in schema

export const CREATE_PACKAGE = gql`
  mutation packageCreate($input: PackageCreateInput!) {
    packageCreate(input: $input) {
      id
      name
      description
      createdAt
      modifiedAt
      distributionType
      primaryResourceId
      version
      organization {
        id
        name
      }
      resources {
        records {
          id
          resourceId
          resourceAlias
          resourceType
        }
      }
    }
  }
`;

export const GET_PACKAGE = gql`
  query packages($id: ID!) {
    packages(id: $id) {
      records {
        id
        name
        description
        organization {
          id
        }
        createdAt
        modifiedAt
        resources {
          records {
            id
          }
        }
      }
    }
  }
`;

export const UPDATE_PACKAGE_GRANTS = gql`
  mutation packageUpdateGrants($input: BulkPackageGrantInput!) {
    packageUpdateGrants(input: $input) {
      id
    }
  }
`;

// DELETE_PACKAGE operation removed - packageDelete mutation does not exist in schema

export const CREATE_DAG_TEMPLATE = gql`
  mutation createDagTemplate($input: CreateDagTemplate!) {
    createDagTemplate(input: $input) {
      id
      name
      description
      cognitiveCategoryId
      mimeType
      dag
      dagTemplateLanguage
      targetOrganizationId
      tags
    }
  }
`;

export const GET_DAG_TEMPLATE = gql`
  query dagTemplate($id: ID!) {
    dagTemplate(id: $id) {
      id
      name
      description
      cognitiveCategoryId
      mimeType
      dag
      dagTemplateLanguage
      targetOrganizationId
    }
  }
`;

export const GET_DAG_TEMPLATES = gql`
  query dagTemplates($offset: Int, $limit: Int) {
    dagTemplates(offset: $offset, limit: $limit) {
      records {
        id
        name
        description
      }
      count
      offset
      limit
    }
  }
`;

export const UPDATE_DAG_TEMPLATE = gql`
  mutation updateDagTemplate($input: UpdateDagTemplate!) {
    updateDagTemplate(input: $input) {
      id
      name
      description
      cognitiveCategoryId
      mimeType
      dag
      dagTemplateLanguage
      targetOrganizationId
      tags
    }
  }
`;

export const DELETE_DAG_TEMPLATE = gql`
  mutation deleteDagTemplate($id: ID!) {
    deleteDagTemplate(id: $id) {
      id
      message
    }
  }
`;

export const LAUNCH_DAG_TEMPLATE = gql`
  mutation launchDAGTemplate($input: LaunchDAGTemplateInput!) {
    launchDAGTemplate(input: $input) {
      id
      targetId
      tasks {
        count
        records {
          id
          engine {
            id
            name
          }
          payload
          executionPreferences {
            priority
          }
        }
      }
      routes {
        parentIoFolderReferenceId
        childIoFolderReferenceId
        endpoint
        options
      }
    }
  }
`;

export const CREATE_FLOW_REVISION = gql`
  mutation createFlowRevision($input: CreateFlowRevision) {
    createFlowRevision(input: $input) {
      flowRevisionId
      engineId
      buildId
      userId
    }
  }
`;

export const DEPLOY_FLOW_REVISION = gql`
  mutation deployFlowRevision($input: DeployFlowRevision) {
    deployFlowRevision(input: $input) {
      flowRevisionId
      flowRevisionNumb
      isHead
      buildId
      engineId
      isDeployed
      hash
    }
  }
`;

export const GET_AUTOMATE_PACKAGE = gql`
  query automatePackage($engineId: ID!) {
    automatePackage(engineId: $engineId) {
      id
      name
      version
      sourceOriginId
      sourcePackageId
      primaryResource {
        resourceId
        resourceType
      }
      resources {
        records {
          packageId
          resourceAlias
          resourceId
          resourceType
        }
      }
      nestedResources {
        records {
          packageId
          resourceAlias
          resourceId
          resourceType
        }
      }
    }
  }
`;

export const GET_FLOW_REVISION = gql`
  query getFlowRevision($id: ID!) {
    flowRevision(id: $id) {
      flowRevisionId
      description
    }
  }
`;

export const UPDATE_FLOW_REVISION = gql`
  mutation updateFlowRevision($flowRevisionId: ID!, $description: String) {
    updateFlowRevision(
      input: { flowRevisionId: $flowRevisionId, description: $description }
    ) {
      description
    }
  }
`;

export const GET_FLOW_REVISIONS = gql`
  query getFlowRevisions(
    $id: ID
    $offset: Int = 0
    $limit: Int = 30
    $isHead: Boolean
    $isDeployed: Boolean
    $hasBuilds: Boolean
    $engineId: ID
    $buildId: ID
    $userId: ID
    $flowId: ID
    $createOnEmpty: Boolean = true
  ) {
    flowRevisions(
      id: $id
      offset: $offset
      limit: $limit
      isHead: $isHead
      isDeployed: $isDeployed
      hasBuilds: $hasBuilds
      engineId: $engineId
      buildId: $buildId
      userId: $userId
      flowId: $flowId
      createOnEmpty: $createOnEmpty
    ) {
      records {
        engineId
        flowRevisionId
      }
    }
  }
`;

export const CREATE_FLOW_TEMPLATE = gql`
  mutation createFlowTemplate($input: CreateFlowTemplate) {
    createFlowTemplate(input: $input) {
      id
      title
      subtitle
      organizationId
    }
  }
`;

export const DELETE_FLOW_TEMPLATE = gql`
  mutation deleteFlowTemplate($id: ID!) {
    deleteFlowTemplate(id: $id) {
      id
    }
  }
`;

export const UPDATE_FLOW_TEMPLATE = gql`
  mutation updateFlowTemplate($input: UpdateFlowTemplate) {
    updateFlowTemplate(input: $input) {
      id
      title
      subtitle
    }
  }
`;

export const GET_FLOW_TEMPLATES = gql`
  query flowTemplates(
    $id: ID
    $offset: Int = 0
    $limit: Int = 30
    $showPublic: Boolean = true
    $categories: [String]
    $tags: [String]
    $title: String
    $authors: [String]
  ) {
    flowTemplates(
      id: $id
      offset: $offset
      limit: $limit
      showPublic: $showPublic
      categories: $categories
      tags: $tags
      title: $title
      authors: $authors
    ) {
      count
      records {
        id
        title
      }
    }
  }
`;

export const REMOVE_DAG_TEMPLATE_FROM_ORG = gql`
  mutation removeDagTemplateFromOrganization(
    $input: RemoveDagFromOrganization
  ) {
    removeDagTemplateFromOrganization(input: $input) {
      dagTemplateId
      organizationIds
    }
  }
`;

export const ADD_DAG_TEMPLATE_TO_ORG = gql`
  mutation addDagTemplateToOrganization($input: AddDagTemplateToOrganization!) {
    addDagTemplateToOrganization(input: $input) {
      dagTemplateId
      organizationIds
    }
  }
`;
