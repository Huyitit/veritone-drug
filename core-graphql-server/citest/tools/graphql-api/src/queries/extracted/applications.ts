import { gql } from 'graphql-request';

// Application management operations

export const GET_APPLICATIONS = gql`
  query applications(
    $id: ID
    $ids: [ID!]
    $status: ApplicationStatus
    $offset: Int
    $limit: Int
    $accessScope: [AccessScope!]
    $excludeViewOnly: Boolean = true
    $orderBy: [ApplicationSortField]
  ) {
    applications(
      id: $id
      ids: $ids
      status: $status
      offset: $offset
      limit: $limit
      accessScope: $accessScope
      excludeViewOnly: $excludeViewOnly
      orderBy: $orderBy
    ) {
      records {
        id
        name
        description
        deploymentModel
        createdDateTime
        modifiedDateTime
        iconSvg
        iconUrl
        organizationId
        clientSecret
        category
        url
        status
        oauth2RedirectUrls
        validStateActions
        applicationRoles(ownedOnly: false) {
          id
          name
          description
          permissions
          isPrivate
          isApplicationEventRole
        }
        applicationConfigDefinition {
          count
          records {
            applicationId
            configKey
            configType
            configLevel
            required
            secured
            description
          }
        }
        contextMenuExtensions {
          mentions {
            id
            label
            url
            type
          }
          tdos {
            id
            label
            url
            type
          }
          watchlists {
            id
            label
            url
            type
          }
          collections {
            id
            label
            url
            type
          }
        }
      }
      count
      offset
      limit
    }
  }
`;

/**
 * Lists the applications a specific organization can access. Superadmin-only
 * (`orgId`), and intentionally a much narrower selection set than
 * GET_APPLICATIONS — callers only need the application ids an org has access to.
 *
 * Callers wanting the legacy `owned: false` behaviour should pass
 * `accessScope: [public, granted]`, which is exactly what the resolver maps
 * `owned: false` to (see `dalApplication.getApplicationsQuery`: `owned: false`
 * sets hasOwned=false, hasPublic=true, hasGranted=true). `owned` itself is
 * deprecated and past its expiration date, so codegen's introspection of the
 * schema no longer exposes it and a document using it fails validation.
 * Omitting accessScope entirely is NOT the same thing — that defaults to
 * [public, owned, granted].
 */
export const GET_APPLICATIONS_BY_ORG = gql`
  query applicationsByOrg($orgId: ID, $accessScope: [AccessScope!]) {
    applications(orgId: $orgId, accessScope: $accessScope) {
      records {
        id
        name
      }
      count
    }
  }
`;

export const GET_APPLICATION_HEADERBAR = gql`
  query applicationHeaderbar($id: ID) {
    applications(id: $id) {
      records {
        id
        applicationHeaderbar {
          name
          config {
            backgroundColor
            help
            notification
            logoSrc
          }
        }
      }
    }
  }
`;

export const GET_APPLICATION = gql`
  query application($id: ID!, $excludeViewOnly: Boolean) {
    application(id: $id, excludeViewOnly: $excludeViewOnly) {
      id
      name
      description
      deploymentModel
      createdDateTime
      modifiedDateTime
      iconSvg
      iconUrl
      organizationId
      ownerOrganizationId
      clientSecret
      category
      url
      oauth2RedirectUrls
      eventEndpoint
      status
      oauth2RedirectUrls
      eventEndpoint
      validStateActions
      dailyTaskMetrics {
        records {
          date
          taskCount
          storageBytes
          mediaSecs
        }
      }
      contextMenuExtensions {
        mentions {
          id
          label
          url
        }
        tdos {
          id
          label
          url
        }
        watchlists {
          id
          label
          url
        }
        collections {
          id
          label
          url
        }
      }
    }
  }
`;

export const CREATE_APPLICATION = gql`
  mutation createApplication($input: CreateApplication!) {
    createApplication(input: $input) {
      id
      name
      description
      deploymentModel
      url
      oauth2RedirectUrls
      iconUrl
      iconSvg
      signedIconUrl
      category
      status
      oauth2RedirectUrls
      eventEndpoint
      createdDateTime
      validStateActions
      applicationRoles(ownedOnly: false) {
        id
        name
        description
        permissions
        isPrivate
        isApplicationEventRole
      }
      applicationHeaderbar {
        name
        config {
          backgroundColor
          help
          notification
          logoSrc
        }
      }
      applicationConfigDefinition {
        count
        records {
          applicationId
          configKey
          configType
          configLevel
          required
          secured
          description
        }
      }
      entityTags {
        entityType
        tagKey
        tagValue
      }
      contextMenuExtensions {
        mentions {
          id
          label
          url
          type
        }
        tdos {
          id
          label
          url
          type
        }
        watchlists {
          id
          label
          url
          type
        }
        collections {
          id
          label
          url
          type
        }
      }
    }
  }
`;

export const UPDATE_APPLICATION = gql`
  mutation updateApplication($input: UpdateApplication!) {
    updateApplication(input: $input) {
      id
      name
      description
      deploymentModel
      url
      iconUrl
      iconSvg
      signedIconUrl
      category
      status
      oauth2RedirectUrls
      modifiedDateTime
      applicationRoles(ownedOnly: false) {
        id
        name
        description
        permissions
        isPrivate
        isApplicationEventRole
      }
      applicationHeaderbar {
        name
        config {
          backgroundColor
          help
          notification
          logoSrc
        }
      }
      applicationConfigDefinition {
        count
        records {
          applicationId
          configKey
          configType
          configLevel
          required
          secured
          description
        }
      }
      contextMenuExtensions {
        mentions {
          id
          label
          url
          type
        }
        tdos {
          id
          label
          url
          type
        }
        watchlists {
          id
          label
          url
          type
        }
        collections {
          id
          label
          url
          type
        }
      }
    }
  }
`;

export const DELETE_APPLICATION = gql`
  mutation deleteApplication($id: ID!) {
    deleteApplication(id: $id) {
      id
      message
    }
  }
`;

export const APPLICATION_WORKFLOW = gql`
  mutation applicationWorkflow($input: ApplicationWorkflow!) {
    applicationWorkflow(input: $input) {
      id
      name
      description
      url
      deploymentModel
      status
      validStateActions
    }
  }
`;

export const CREATE_CONTEXT_MENU_EXTENSION = gql`
  mutation createContextMenuExtension($input: CreateContextMenuExtension!) {
    createContextMenuExtension(input: $input) {
      id
      label
      url
      type
    }
  }
`;

export const DELETE_CONTEXT_MENU_EXTENSION = gql`
  mutation deleteContextMenuExtension($input: DeleteContextMenuExtension!) {
    deleteContextMenuExtension(input: $input) {
      id
      message
    }
  }
`;

export const BULK_DELETE_CONTEXT_MENU_EXTENSIONS = gql`
  mutation bulkDeleteContextMenuExtensions(
    $input: BulkDeleteContextMenuExtensions!
  ) {
    bulkDeleteContextMenuExtensions(input: $input) {
      mentions {
        id
      }
      tdos {
        id
      }
      watchlists {
        id
      }
      collections {
        id
      }
    }
  }
`;

export const APPLICATION_CONFIG_DEFINITION_CREATE = gql`
  mutation applicationConfigDefinitionCreate(
    $appId: ID!
    $orgId: ID
    $configKey: String!
    $configType: ApplicationConfigValueEnum!
    $configLevel: ApplicationConfigLevelEnum!
    $required: Boolean!
    $secured: Boolean!
    $description: String!
    $packageId: ID
  ) {
    applicationConfigDefinitionCreate(
      input: {
        appId: $appId
        orgId: $orgId
        configKey: $configKey
        configType: $configType
        configLevel: $configLevel
        description: $description
        required: $required
        secured: $secured
        packageId: $packageId
      }
    ) {
      records {
        id
        configKey
        applicationId
        organizationGuid
        packageId
        configType
        configLevel
      }
    }
  }
`;

export const APPLICATION_CONFIG_DEFINITION_UPDATE = gql`
  mutation applicationConfigDefinitionUpdate($appId: ID!, $configKey: String!) {
    applicationConfigDefinitionUpdate(
      input: [
        {
          filter: { appId: $appId, configKey: $configKey }
          update: { configType: String }
        }
      ]
    ) {
      records {
        id
        applicationId
        configKey
        configType
        configLevel
      }
    }
  }
`;

export const APPLICATION_CONFIG_DEFINITION_DELETE = gql`
  mutation applicationConfigDefinitionDelete(
    $appId: ID!
    $orgId: ID
    $configKey: String!
  ) {
    applicationConfigDefinitionDelete(
      input: { appId: $appId, orgId: $orgId, configKey: $configKey }
    ) {
      success
      code
      msg
    }
  }
`;

export const APPLICATION_CONFIG_SET = gql`
  mutation applicationConfigSet(
    $appId: ID!
    $orgId: ID
    $configs: [ApplicationConfigValueInput!]!
  ) {
    applicationConfigSet(
      input: { appId: $appId, orgId: $orgId, configs: $configs }
    ) {
      records {
        configKey
        value
      }
    }
  }
`;

export const APPLICATION_CONFIG_DELETE = gql`
  mutation applicationConfigDelete(
    $appId: ID!
    $orgId: ID
    $configKey: String!
  ) {
    applicationConfigDelete(
      input: { appId: $appId, orgId: $orgId, configKey: $configKey }
    ) {
      success
      code
      msg
    }
  }
`;

export const DELETE_APPLICATION_VIEWER = gql`
  mutation deleteApplicationViewer($viewerId: ID!) {
    deleteApplicationViewer(viewerId: $viewerId) {
      id
    }
  }
`;

export const ADD_APP_TO_ORG = gql`
  mutation addAppToOrg(
    $orgId: ID!
    $appId: ID!
    $configs: [ApplicationConfigInput!]
  ) {
    applicationAddToOrg(orgId: $orgId, appId: $appId, configs: $configs) {
      id
      name
      applicationRoles(ownedOnly: false) {
        id
        name
        permissions
        isApplicationEventRole
        organization {
          id
        }
      }
    }
  }
`;

export const GET_APPLICATION_JWT = gql`
  mutation getApplicationJWT($input: GetApplicationJWT!) {
    getApplicationJWT(input: $input) {
      applicationId
      organizationId
      token
    }
  }
`;

export const UPDATE_APPLICATION_EVENT_ENDPOINT = gql`
  mutation updateApplicationEventEndpoint(
    $input: UpdateApplicationEventEndpoint!
  ) {
    updateApplicationEventEndpoint(input: $input) {
      id
      eventEndpoint
    }
  }
`;

export const REMOVE_APPLICATION_EVENT_ENDPOINT = gql`
  mutation removeApplicationEventEndpoint($id: ID!) {
    removeApplicationEventEndpoint(id: $id) {
      id
      message
    }
  }
`;

/**
 * Deprecated server-side in favour of packageUpdate/packageUpdateResources,
 * but still exercised by the application-components citests.
 */
export const UPDATE_APPLICATION_COMPONENT = gql`
  mutation updateApplicationComponent($input: UpdateApplicationComponent!) {
    updateApplicationComponent(input: $input) {
      engines {
        records {
          id
          name
        }
      }
      dataRegistries {
        records {
          id
          name
        }
      }
      contextMenuExtensions {
        id
        label
        url
        type
      }
    }
  }
`;

export const GET_APPLICATION_CONFIG = gql`
  query applicationConfig($appId: ID!, $orgId: ID, $configKeyRegexp: String) {
    applicationConfig(
      appId: $appId
      orgId: $orgId
      configKeyRegexp: $configKeyRegexp
    ) {
      records {
        userId
        configKey
        value
      }
    }
  }
`;

export const UNFILE_APP = gql`
  mutation unfileApplication($input: UnfileApplication!) {
    unfileApplication(input: $input) {
      id
      name
      description
    }
  }
`;

export const FILE_APP = gql`
  mutation fileApplication($input: FileApplication!) {
    fileApplication(input: $input) {
      id
      isPublic
      metadataVersion
      details
      name
      category
      description
    }
  }
`;
