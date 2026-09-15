const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const meGql = `
query {
  me {
    id
    name
    organization {
      id
      guid
      jsondata
    }
    authGroups {
      records {
        id
        name
        parentGroups {
          records {
            id
            name
            description
          }
        }
        permissionSet{
          id
          name
          permissions
        }
        appRole {
          description
          permissions {
            records {
              id
              name
              __typename
            }
          }
        }
      }
    }
  }
}`;

const createOrgOptionDefault = {
  kvp: {
    features: {
      enableRBACFeature: 'enabled'
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
  ].filter((app) => app),
  businessUnit: 'Legal',
  types: ['agency', 'broadcaster']
};

const createPackageQuery = `
  mutation createPackage ($name: String!, $distributionType: EngineDistributionType!, $resources: [PackageResourceInput]!, $organizationId: ID, $primaryResourceId: ID) {
    packageCreate ( input: {
      name: $name
      organizationId: $organizationId
      version: "1"
      distributionType: $distributionType
      resources: $resources
      primaryResourceId: $primaryResourceId
    }) {
      id
      name
      distributionType
      primaryResourceId
      organization {
        id
        name
      }
      resources {
        records {
          resourceId
          resourceType
        }
      }
    }
  }
`;

const deletePackageQuery = `
mutation delete ($id: ID!) {
  packageDelete (id: $id) {
    success
    msg
    code
  }
}`;

const updatePackageQuery = `mutation packageUpdate ($input: PackageUpdateInput!) {
  packageUpdate (input : $input){
    id
    name
    icon
    description
    status
    version
    primaryResource {
      id
      resourceId
      resourceType
    }
    distributionType
    resources {
      records {
        id
        resourceId
        resourceType
      }
    }
  }
}
`;

const updatePackageResourcesQuery = `mutation updateResources ($packageId: ID!, $resources: [PackageResourceInput]!) {
  packageUpdateResources (input: {
    packageId: $packageId
    packageResources: $resources
  }) {
    id
    name
    icon
    description
    primaryResource {
      id
      resourceId
      resourceType
    }
    distributionType
    resources {
      records {
        id
        resourceId
        resourceType
      }
    }
  }
}`;

const grantPackageQuery = `
  mutation updateGrant ($packageId: ID!, $packageGrants: [PackageGrantInput]!) {
    packageUpdateGrants(input: {
      packageId: $packageId
      packageGrants: $packageGrants
    }){
      id
      name
    }
  }`;

const queryGrant = `query grant ($id: ID!) {
  packageGrants (id: $id) {
    records {
      package {
        id
        name
      }
      grantType
      organization {
        id
        name
      }
    }
  }
}`;

const getPackageByIdQuery = `query package ($id: ID!) {
  packages(id: $id) {
    records {
      id
      name
      version
      status
      distributionType
      sourceOriginId
      primaryResource {
        resourceId
        resourceType
      }
      resources {
        records {
          resourceId
          resourceType
        }
      }
    }
  }
}`;

const getPackages = `query package ($orgId: ID, $resourceId: ID, $id: ID) {
  packages(orgId: $orgId, resourceId: $resourceId, id: $id) {
    records {
      id
      name
      version
      status
      distributionType
      sourceOriginId
      primaryResource {
        resourceId
        resourceType
      }
      resources {
        records {
          resourceId
          resourceType
        }
      }
    }
  }
}`;

const getPackagesWithGrantTypes = `query filteredPackages ($packageFilter: PackageFilter) {
  packages(packageFilter: $packageFilter) {
    records {
      id
      name
      version
      status
      distributionType
      grantType
      sourceOriginId
      primaryResource {
        resourceId
        resourceType
      }
      resources {
        records {
          resourceId
          resourceType
        }
      }
    }
  }
}`;

const getFilteredPackages = `query filteredPackages ($distributionType: EngineDistributionType, $packageFilter: PackageFilter) {
  packages(distributionType: $distributionType, packageFilter: $packageFilter) {
    records {
      id
      name
      version
      status
      distributionType
      sourceOriginId
      primaryResource {
        resourceId
        resourceType
      }
      resources {
        records {
          resourceId
          resourceType
        }
      }
    }
  }
}`;

const getFilteredPackagesByOrgId = `query filteredPackages ($orgId: ID, $distributionType: EngineDistributionType, $packageFilter: PackageFilter) {
  packages(orgId: $orgId, distributionType: $distributionType, packageFilter: $packageFilter) {
    records {
      id
      name
      version
      status
      distributionType
      sourceOriginId
      primaryResource {
        resourceId
        resourceType
      }
      resources {
        records {
          resourceId
          resourceType
        }
      }
    }
  }
}`;

const getOrgGrantsInfoQuery = `query getOrgGrantsInfo ($limit: Int, $offset: Int, $orgId: ID, $packageFilter: PackageGrantFilter ) {
  packageGrants (limit: $limit offset: $offset orgId: $orgId packageFilter: $packageFilter ) {
   records {
    grantType
    package {
     id
     name
     description
     distributionType
     version
     sourceOriginId
     aiwareVersion
     deleted
     status
     icon
     primaryResource {
      resourceId
      resourceType
    }
     resources {
      count
      records {
       resourceId
       resourceType
     }
    }
     createdAt
     modifiedAt
     organization {
      id
      guid
      name
      imageUrl
      priority
    }
   }
  }
 }
}`;

const createOrgQuery = `
  mutation createOrg ($name: String!, $businessUnit: String!, $types: [OrganizationType], $kvp: JSONData!, $apps: JSONData, $status: OrganizationStatus) {
    createOrganization (input: {
      name: $name
      businessUnit: $businessUnit
      types: $types
      metadata: $kvp
      applications: $apps
      status: $status
    }) {
      id
      guid
      name
      type
      jsondata
    }
  }
`;

const createUserQuery = `mutation createUser ($name: String!, $organizationId: ID!, $roleIds: [ID!], $authGroupIds: [ID!]
) {
  createUser(
    input: {
      name: $name
      password: "testUserPassword"
      organizationId: $organizationId
      roleIds: $roleIds
      firstName: "RBAC-User"
      lastName: "Regular"
      authGroupIds: $authGroupIds
    }
  )  {
    id
    name
    firstName
    lastName
    jsondata
    organizationId
  }
}`;

const createAppQuery = `
mutation ($name: String!, $desc: String, $isPublic: Boolean) { 
  createApplication(input: {
    name: $name,
    description: $desc,
    url: "www.example.com",
    oauth2RedirectUrls: "www.example.com/callback",
    checkPermissions: false,
    iconUrl: "http://abc.com/link-icon.png",
    isPublic: $isPublic
  }) {
    id name key description url oauth2RedirectUrls iconUrl status organizationId
  }
}`;

const createEngineQuery = `mutation createEngine ($name: String, $categoryId: String!, $deploymentModel: DeploymentModel!, $fields: [CreateEngineField!]) {
  createEngine(input: {
    deploymentModel: $deploymentModel
    name: $name
    fields: $fields
    categoryId: $categoryId
  }) {
    id name categoryId deploymentModel
  }
}`;

const createEngineBuildQuery = `mutation createEngineBuild ($engineId: ID!) {
  createEngineBuild(input: {
    engineId: $engineId
    taskRuntime: {
      nodeRed: true
    }
    manifest: {
      runtime: "NodeRed"
    }
  }) {
    id
    status
    validStateActions
  }
}`;

const updateBuildQuery = `mutation updateEngineBuild ($buildId: ID!, $engineId: ID!, $action: BuildUpdateAction!) {
  updateEngineBuild(input: {
    id: $buildId
    engineId: $engineId
    action: $action
  }) {
    id
    engineId
    status
    validStateActions
  }
}`;

const deleteAppQuery = `
mutation ($id: ID!){
  deleteApplication(id: $id) {
    id
    message
  }
}`;

const deleteEngineQuery = `
mutation delEngin ($id: ID!){
  deleteEngine(id: $id) {
    id
    message
  }
}`;

const changeAppStatusQuery = `
mutation appStatus ($action: ApplicationWorkflowAction!, $id: ID!) {
  applicationWorkflow(input: {
    id: $id
    action: $action
  })  {
    id
    status
    }
  }
`;

const createDataRegistryQuery = `
  mutation createDataRegistry ($name: String!, $description: String!) {
          createDataRegistry(input: {
            source: "Some url"
            name: $name
            description: $description
            isPublic: true
          }) {
            id
          }
        }
  `;

const createSchemaQuery = `
  mutation upsertSchemaDraft($schema: JSONData!, $dataRegistryId: ID!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: $dataRegistryId
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        validActions
      }
    }
  `;

const updateSchemaStateQuery = `
mutation updateSchemaState ($id: ID!, $status: SchemaStatus!){
  updateSchemaState(
    input: {
      status: $status
      id: $id
    }
  ) {
    id
    dataRegistryId
    status
    validActions
  }
}`;

const getOrgByStatusQuery = `query org ($status: OrganizationStatus, $limit: Int){
  organizations(status: $status, limit: $limit){
    records {
      id
      name
    }
  }
}`;

const createFlowTemplateQuery = `
  mutation createFlowTemplate ($title: String!, $subtitle: String!, $description: String!, $organizationId: String) {
    createFlowTemplate(input: {
      title: $title
      subtitle: $subtitle
      description: $description
      categories: ["test"]
      public: false
      author: "veritone"
      organizationId: $organizationId
      flow: "W3siaWQiOiJlMTAxNGUzZi4zZWUzZSIsInR5cGUiOiJ0YWIiLCJsYWJlbCI6IkZsb3cgMSIsImRpc2FibGVkIjpmYWxzZSwiaW5mbyI6IiJ9LHsiaWQiOiI0MWU3NTk5Yy42MmQ3MTgiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6ImUxMDE0ZTNmLjNlZTNlIiwibmFtZSI6IiIsImZvcm1hdCI6ImJ1ZmZlciIsInNhbXBsZXMiOltdLCJ0ZG9Db250ZW50Ijoie30iLCJfbXRpbWUiOjAsIngiOjE3MCwieSI6MTYwLCJ3aXJlcyI6W1siMTlmYTE2YmMuOTA2YTI5Il1dfSx7ImlkIjoiMTlmYTE2YmMuOTA2YTI5IiwidHlwZSI6ImFpd2FyZS1vdXQiLCJ6IjoiZTEwMTRlM2YuM2VlM2UiLCJuYW1lIjoiIiwic3RhdHVzQ29kZSI6MjAwLCJmYWlsdXJlTXNnIjoiIiwiZmFpbHVyZU1zZ1R5cGUiOiJzdHIiLCJmYWlsdXJlUmVhc29uIjoiIiwiZmFpbHVyZVJlYXNvblR5cGUiOiJzdHIiLCJza2lwUmVzdWx0Q2FsbGJhY2siOmZhbHNlLCJkaXNhYmxlRGVidWciOmZhbHNlLCJleGNsdWRlTWV0YWRhdGEiOmZhbHNlLCJ4Ijo0NzAsInkiOjE2MCwid2lyZXMiOltdfSx7ImlkIjoiZWY5NGRkOWMuY2JjN2EiLCJ0eXBlIjoiaHR0cCBpbiIsInoiOiJlMTAxNGUzZi4zZWUzZSIsIm5hbWUiOiJPS1RBIHZlcmlmaWNhdGlvbiBlbmRwb2ludCIsInVybCI6Ii9va3RhLXZlcmlmaWNhdGlvbiIsIm1ldGhvZCI6ImdldCIsInVwbG9hZCI6ZmFsc2UsInN3YWdnZXJEb2MiOiIiLCJ4IjoyMDAsInkiOjIyMCwid2lyZXMiOltbIjlhN2VhMDlkLjAxZTFhIl1dfSx7ImlkIjoiOWE3ZWEwOWQuMDFlMWEiLCJ0eXBlIjoiZnVuY3Rpb24iLCJ6IjoiZTEwMTRlM2YuM2VlM2UiLCJuYW1lIjoiIiwiZnVuYyI6ImNvbnN0IGhlYWRlcnMgPSBtc2cucmVxLmhlYWRlcnM7XG5jb25zdCB2ZXJpZmljYXRpb24gPSBoZWFkZXJzWyd4LW9rdGEtdmVyaWZpY2F0aW9uLWNoYWxsZW5nZSddO1xubXNnLnN0YXR1c0NvZGUgPSAyMDA7XG5tc2cucGF5bG9hZCA9IHtcbiAgICAndmVyaWZpY2F0aW9uJzogdmVyaWZpY2F0aW9uXG59O1xuXG5yZXR1cm4gbXNnOyIsIm91dHB1dHMiOjEsIm5vZXJyIjowLCJpbml0aWFsaXplIjoiIiwiZmluYWxpemUiOiIiLCJsaWJzIjpbXSwieCI6NDAwLCJ5IjoyMjAsIndpcmVzIjpbWyJmOGFmNThjYS5hOGNkMjgiXV19LHsiaWQiOiJmOGFmNThjYS5hOGNkMjgiLCJ0eXBlIjoiaHR0cCByZXNwb25zZSIsInoiOiJlMTAxNGUzZi4zZWUzZSIsIm5hbWUiOiJIdHRwIHJlc3BvbnNlIiwic3RhdHVzQ29kZSI6IiIsImhlYWRlcnMiOnt9LCJ4Ijo1ODAsInkiOjIyMCwid2lyZXMiOltdfV0="
    }) {
      id
      title
      subtitle
      organizationId
    }
  }
  `;

const createFlowQuery = `
mutation createFlow ($name: String, $templateId: ID) {
  createFlow (input: {
    name: $name
    templateId: $templateId
    description: "graphql-flow-description"
  }){
    id
    ownerOrganizationId
    isPublic
    name
    categoryId
    deploymentModel
  }
}`;

const deleteFlowTemplate = `mutation deleteFlowTemplate ( $id: ID!) {
  deleteFlowTemplate (id: $id){
    id
  }
}`;

const automatePackageQuery = `
  query automatePackage ($engineId: ID!){
      automatePackage(engineId: $engineId){
        id
        name
        version
        sourceOriginId
        sourcePackageId
        primaryResource
        {
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
  }`;

const createFlowRevisionQuery = `
        mutation createFlowRevision ($flowId: ID!, $runtime: JSONData!) {
          createFlowRevision(input:{
            flowId: $flowId
            runtime: $runtime
            forceCreate: true,
            isHead: true
          }){
            flowRevisionId
          }
        }`;

const deployFlowRevisionQuery = `
        mutation deployFlowRevision ($flowRevisionId: ID, $flowId: ID) {
            deployFlowRevision(input:{
            flowId: $flowId
            flowRevisionId: $flowRevisionId
          }){
            flowRevisionId
            flowRevisionNumb
            isHead
            buildId
            engineId
            isDeployed
            hash
          }
        }`;
const createAppViewerQuery = `mutation appView ($name: String!, $mimetype: String!, $viewerType: ApplicationViewerType!) {
  createApplicationViewer (
    input: {
      name: $name
      mimetype: $mimetype
      viewerType: $viewerType
    }
  ) {
    id
    name
    description
    viewerType
    mimeType
  }
}`;

const createAppViewerBuildQuery = `mutation 
createApplicationViewerBuild ($viewerId: ID!, $sourceUrl: String!, $accessUrl: String!, $status: ApplicationViewerBuildStatus) {
  createApplicationViewerBuild (input: {
    viewerId: $viewerId
    sourceUrl: $sourceUrl
    accessUrl: $accessUrl
    status: $status
  }){
    id
    viewerId
    sourceUrl
    status
  }
}`;

const schemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: 'The Foo Schema',
      default: '',
      examples: ['bar']
    },
    bar: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};

const createScheduledJobQuery = `
    mutation createScheduledJob ($name: String!, $schemaId: ID!, $clusterId: ID!, $engineId: ID!, $sourceId: ID!) {
      createScheduledJob(input: {
        name: $name
        runMode: Now
        details: {
          programFormat: "Adult Contemporary"
          foo: "bar"
          isNational: true
        }
        contentTemplates: [
          {
            schemaId: $schemaId
            data: {
              url: "https://youtube.com/channel/123"
              youtubeChannelUrl: "https://youtube.com/channel/123"
              liveTimezone: "PST"
            }
          }
        ]
        isPublic: false
        weeklyScheduleParts: [
          {
            scheduledDay: Monday
            startTime: "09:00:00-08:00"
            stopTime: "10:30-08:00"
          }
        ]
        jobTemplates: [
          {
            skipDecider: true
            clusterId: $clusterId
            jobConfig: {
              createTDOInput: {
                details: {
                  tags: ["foo", "bar"]
                }
              }
            }
            taskTemplates: [
              {
                engineId: $engineId
                payload: {
                  foo: "bar"
                  sourceId: $sourceId
                }
              }
            ]
          }
        ]
      }) {
        id
        primarySourceId
        details
        isPublic
        contentTemplates {
          data
          schemaId
        }
        affiliates {
          count
          records {
            sourceId
            scheduledJobId
            scheduledDay
            startTime
            stopTime
            status
            startDateTime
            stopDateTime
          }
        }
        jobs {
          records {
            id
            targetId
            status
            tasks {
              records {
                id
                status
              }
            }
          }
        }
      }
    }
    `;

const createClusterQuery = `mutation createCluster ($name: String!){
  createCluster(input: {
    name: $name
    type: RT
    dockerCredentials: {}
    allowedEngines: []
    status: active
    edgeVersion: 3
  }) {
    id
    name
    edgeVersion
  }
}`;

const sourceCreateQuery = `
mutation createSource ($name: String!) {
  createSource(input: {
    sourceTypeId: 1
    name: $name
  }) {
    id
    sourceTypeId          
  }
}`;

const getSchemaByStatusQuery = `
query schemas ($status: [SchemaStatus!]){
  schemas(status: $status) {
    records {
      id
      status
    }
  }
}`;

const appConfigDefinitionCreateQuery = `mutation applicationConfigDefinitionCreate (
  $appId: ID!, $orgId: ID, $configKey: String!, $configType: ApplicationConfigValueEnum!, $configLevel: ApplicationConfigLevelEnum!, $required: Boolean!, $secured: Boolean!, $description: String!, $packageId: ID
  ) {
  applicationConfigDefinitionCreate(input: {
    appId: $appId
    orgId: $orgId
    configKey: $configKey
    configType: $configType
    configLevel: $configLevel
    description: $description
    required: $required
    secured: $secured
    packageId: $packageId
  }){
    records {
      id
      configKey
      applicationId
      configKey
      configType
      configLevel
    }
  }
}`;

const createDataSetQuery = `
  mutation createDataset ($name: String!, $description: String!, $schemaId: ID!) {
    createDataset (input: {
      name: $name
      description: $description
      schemaId: $schemaId
    }){
      datasetId
      schemaId
      name
      description
      
    }
  }`;

const createAutomateNodeQuery = `mutation createTDOwithAsset ($name: String, $startDateTime: DateTime!, $isPublic: Boolean) {
  createTDOWithAsset(input:{
    startDateTime: $startDateTime
    contentType: "application/gzip"
    assetType: "automateNode"
    name: $name
    addToIndex: true
    isPublic: $isPublic
    uri: "./citest/data/AutomateNode-1.1.1.gz"
    details: {
      tags: [
        {
          value: "automateNode"
        }
      ],
      addToIndex: true,
      automateNode: {
          module: "AutomateNode",
          type: "AutomateType",
          version: "1.1.1",
          author: "citest",
          desc: "desc",
          keywords: "test"
      }
    }
  }){
    id
  }
}`;

const createAutoPaletteQuery = `
  mutation createTDO ($name: String, $startDateTime: DateTime!, $stopDateTime: DateTime!){
    createTDO(input:{
      startDateTime: $startDateTime
      stopDateTime: $stopDateTime
      name: $name
      isPublic: true
      addToIndex: false
      details: {
        tags: [
          {
            value: "automatePalette"
          }
        ],
        addToIndex: false,
        nodeModules: {
          moduleName: "@gagestestorg/npm_private_test_package",
          moduleRepo: "npm",
          isPrivateRepo: true,
          isPrivateRegistry: false,
          moduleVersion: "1.0.0",
          scope: "gagestestorg",
          registryUrl: "",
          sshUrl: ""
        }
      }
    }){
      id
    }
  }`;

const flowRuntime = JSON.stringify(
  '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
);

const createFolderQuery = `mutation createFolder (
  $name: String!, 
  $description: String!
  $parentId: ID!
  $orderIndex: Int
  $rootFolderType: RootFolderType){
        createFolder(input: {
          name: $name
          description:  $description
          parentId: $parentId
          orderIndex: $orderIndex
          rootFolderType: $rootFolderType
        }) {
          id
          treeObjectId
          name
          description
        }
      }`;

const createRootFolderQuery = `mutation createRootFolders ($rootFolderType: RootFolderType!) {
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
}`;

const createTDOQuery = `
    mutation createTDO ($name: String!) {
      createTDO(
        input: {
          startDateTime: 1623253937
          stopDateTime: 1623259000
          name: $name
          description: "test"
          isPublic: true
        }
      ) {
        id
        name
      }
    }
  `;

const createSDOQuery = `mutation ($schemaId: ID!) {
    createStructuredData(input: {
      schemaId: $schemaId
      data: {
        foo: "test-schema status: the schema is published"
      }
    }) {
      id
      data
      dataString
      schemaId
      modifiedDateTime
      createdDateTime
    }
  }`;

module.exports = {
  createOrgQuery,
  createOrgOptionDefault,
  createPackageQuery,
  deletePackageQuery,
  getPackageByIdQuery,
  grantPackageQuery,
  meGql,
  queryGrant,
  updatePackageQuery,
  updatePackageResourcesQuery,
  getOrgGrantsInfoQuery,
  createAppQuery,
  createEngineQuery,
  createEngineBuildQuery,
  updateBuildQuery,
  createUserQuery,
  deleteAppQuery,
  deleteEngineQuery,
  getPackages,
  getFilteredPackages,
  getFilteredPackagesByOrgId,
  getPackagesWithGrantTypes,
  changeAppStatusQuery,
  createSchemaQuery,
  createDataRegistryQuery,
  updateSchemaStateQuery,
  getOrgByStatusQuery,
  createFlowQuery,
  createFlowTemplateQuery,
  deleteFlowTemplate,
  automatePackageQuery,
  createFlowRevisionQuery,
  deployFlowRevisionQuery,
  createAppViewerQuery,
  createAppViewerBuildQuery,
  schemaInput,
  createScheduledJobQuery,
  createClusterQuery,
  sourceCreateQuery,
  getSchemaByStatusQuery,
  appConfigDefinitionCreateQuery,
  createDataSetQuery,
  createAutomateNodeQuery,
  createAutoPaletteQuery,
  flowRuntime,
  createFolderQuery,
  createRootFolderQuery,
  createTDOQuery,
  createSDOQuery
};
