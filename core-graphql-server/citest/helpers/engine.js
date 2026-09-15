const { get } = require('lodash');
const uuid = require('uuid');

async function getEngineCategories(gqlClient) {
  const engineCategoryQuery = `
    query {
        engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
          count
          records {
            id
            name
            type{
              name
            }
          }
        }
      }
  `;

  const engineCategoryResp = await gqlClient.query(
    engineCategoryQuery,
    null,
    true
  );
  const engineCategory = engineCategoryResp.engineCategories.records[0];
  expect(engineCategory.id).toBeDefined();
  expect(engineCategory.name).toEqual('Transcription');
  expect(engineCategory.type.name).toEqual('Cognition');
  return engineCategory;
}

async function createEngine(gqlClient, input) {
  const createEngineQuery = `
    mutation {
        createEngine(input: {
          deploymentModel: FullyNetworkIsolated
          name: "${input.engineName}"
          fields: [{
            max: 2
            min: 1
            type: Number
            name: "engine ${uuid.v4()}"
            label: "test label"
          }],
          categoryId: "${input.engineCategoryId}"
          price: 100
          priceDimension: PRICE_PER_TASK
          logoPath: "http://localhost/logo"
          iconPath: "http://localhost/icon"
          useCases: ["case 1", "case 2"]
          industries: ["industry 1", "industry 2"]
          manifest: {
            engineMode: "chunk"
          }
          testingDetails: {
            email: "dev@veritone.com"
            mediaFileUri: "http://localhost/testingDetails/mediaFileUri"
            customFields: { foo: "bar" }
          }
          isPublic: false
          edgeVersion: 1
          cpuResourceMcpu: 2048
          gpuSupported: aws_p2
          website: "https://veritone.com"
          jwtRights: {
            roles: [
              {
                roleName: "adapter"
                taskRights: [
                  "developer.engine.read",
                  "job:create",
                  "job.read",
                  "cms.access",
                  "cms.sources.read",
                  "cms.sources.update",
                  "task:read"
                ]
                assetRights: [
                  "recording:create",
                  "recording:update"
                ]
              }
            ]
          }
          distributionType: private
        }) {
          id
          state
          deploymentModel
          name
          fields {
            max
            min
            type
            name
            label
          }
          categoryId
          createsTDO
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

  // T09: create under the SESSION token (default userAuth), NOT the api/token auth.
  // The shared citest api token (18eea9) is org-less, so createEngine via token auth
  // sets owner_organization_id = 1 (root org). The find queries in the consuming specs
  // run under the session token (org of sys_graphql_citest_superadmin), and getEngines
  // restricts to (owner_organization_id = sessionOrg OR whitelisted OR is_public). An
  // org-1, non-public engine is therefore invisible to those queries and engines.records[0]
  // comes back undefined. Creating under the session token lands the engine in the session
  // org so it is visible. (createEngineBuild/updateEngineBuild below already use the session
  // token.) The session superadmin holds developer.engine.create, so this does not regress
  // the run-03 not_allowed failure mode.
  const createEngineResp = await gqlClient.query(createEngineQuery);
  const engineCreated = createEngineResp.createEngine;
  expect(engineCreated.id).toBeDefined();
  expect(engineCreated.categoryId).toEqual(input.engineCategoryId);
  expect(engineCreated.state).toEqual('pending');
  expect(engineCreated.name).toEqual(input.engineName);
  return engineCreated;
}

async function getEngine(gqlClient, input) {
  const getEngineQuery = `
    query {
      engines(id: "${input.engineId}") {
        records {
          id
          name
          createsTDO
          libraryRequired
          categoryId
          state
          createdDateTime
          category {
            name
          }
        }
      }
    }
  `;
  // T09: read under the session token to match the org the engine is now created in
  // (see createEngine above). Reading via token auth (org-less) would still find the
  // engine by id, but keeping the auth consistent avoids cross-org cache/visibility skew.
  const getEngineResp = await gqlClient.query(getEngineQuery);
  const engine = getEngineResp.engines.records[0];
  expect(engine.id).toEqual(input.engineId);
  expect(engine.name).toEqual(input.engineName);
  return engine;
}

async function createEngineBuild(gqlClient, input) {
  const createEngineBuildQuery = `
    mutation {
        createEngineBuild(input: {
          engineId: "${input.engineId}"
          taskRuntime: {
            nodeRed: true
          }
          manifest: {
            runtime: "NodeRed"
          }
        }) {
          id
          status
        }
      }
  `;
  const createEngineBuildResp = await gqlClient.query(createEngineBuildQuery);
  const engineBuild = createEngineBuildResp.createEngineBuild;
  expect(engineBuild.id).toBeDefined();
  expect(engineBuild.status).toEqual('available');
  return engineBuild;
}

async function updateEngineBuild(gqlClient, input) {
  const updateEngineBuildQuery = `
    mutation {
        updateEngineBuild(input: {
          id: "${input.engineBuildId}"
          engineId: "${input.engineId}"
          action: ${input.status}
        }) {
          id
          engineId
          status
          validStateActions
        }
      }
  `;
  const updateEngineBuildResp = await gqlClient.query(updateEngineBuildQuery);
  const engineBuildUpdated = updateEngineBuildResp.updateEngineBuild;
  expect(engineBuildUpdated.id).toBeDefined();
  expect(engineBuildUpdated.status).toEqual(
    input.status === 'submit' ? 'approved' : 'deployed'
  );
  expect(engineBuildUpdated.engineId).toEqual(input.engineId);
  return engineBuildUpdated;
}

async function executeQuery(callback, gqlClient, input, retries = 1) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await callback(gqlClient, input);
    } catch (error) {
      lastError = error;
      console.log(`attempt ${i + 1} of ${retries} failed...`);
    }
  }
  throw lastError;
}

async function generateEngineActivated(gqlClient, input) {
  const engineCategory = await executeQuery(getEngineCategories, gqlClient);

  const engineCreated = await executeQuery(createEngine, gqlClient, {
    engineCategoryId: engineCategory.id,
    engineName: input.engineName
  });

  let engine = await executeQuery(
    getEngine,
    gqlClient,
    {
      engineId: engineCreated.id,
      engineName: input.engineName
    },
    2
  );

  const engineBuild = await executeQuery(createEngineBuild, gqlClient, {
    engineId: engine.id
  });

  await executeQuery(updateEngineBuild, gqlClient, {
    engineBuildId: engineBuild.id,
    engineId: engine.id,
    status: 'submit'
  });

  await executeQuery(updateEngineBuild, gqlClient, {
    engineBuildId: engineBuild.id,
    engineId: engine.id,
    status: 'deploy'
  });

  engine = await executeQuery(
    getEngine,
    gqlClient,
    {
      engineId: engine.id,
      engineName: input.engineName
    },
    2
  );
  return {
    engine,
    engineBuild
  };
}

async function deleteEngineInfoGenerated(gqlClient, input) {
  if (input.engineBuildId && input.engineId) {
    const query = `mutation {
          deleteEngineBuild: deleteEngineBuild(input: {
              id: "${input.engineBuildId}"
              engineId: "${input.engineId}"
          }) {
              id
              message
            }
          deleteEngine: deleteEngine(
            id: "${input.engineId}")
          {
            id
            message
          }
        }`;
    await gqlClient.query(query);
  }
}

async function helpGetEngineCategories(client, input) {
  const { gqlClient, options } = client;

  const query = `
    query ($id: ID, $ids: [ID!], $type: String, $name: String, $limit: Int) {
      engineCategories(id: $id, ids: $ids, type: $type, name: $name, limit: $limit) {
        count
        records {
          id
          name
        }
      }
    }
  `;

  return gqlClient.query(query, input, options);
}

async function helpGetEngines(client, input) {
  const { gqlClient, options } = client;

  const query = `
    query (
      $id: ID,
      $ids: [ID!],
      $categoryId: String,
      $category: String,
      $state: [EngineState],
      $owned: Boolean,
      $libraryRequired: Boolean,
      $filter: EngineFilter
      $createsTDO: Boolean,
      $limit: Int,
      $name: String,
      $buildId: ID,
      $buildStatus: [BuildStatus!]
    ) {
      engines(
        id: $id,
        ids: $ids,
        categoryId: $categoryId,
        category: $category,
        state: $state,
        owned: $owned,
        libraryRequired: $libraryRequired,
        filter: $filter,
        createsTDO: $createsTDO,
        limit: $limit,
        name: $name
      ) {
        records {
          id
          name
          createsTDO
          libraryRequired
          categoryId
          state
          category {
            id
            name
          }
          builds(id: $buildId, buildStatus: $buildStatus) {
            records {
              id
              status
            }
          }
        }
      }
    }
  `;

  return gqlClient.query(query, input, options);
}

async function helpUpdateEngineBuild(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation ($input: UpdateBuild!) {
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

  return gqlClient.query(query, { input }, options);
}

async function helpCreateEngine(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation (
      $id: ID, $isPublic: Boolean, $name: String,
      $description: String, $categoryId: String!, $deploymentModel: DeploymentModel!,
      $price: Int, $priceDimension: PriceDimension, $edgeVersion: Int,
      $fields: [CreateEngineField!], $schemas: [EngineSchema], $iconPath: String,
      $logoPath: String, $libraryRequired: Boolean, $createsTDO: Boolean,
      $useCases: [String!], $industries: [String!], $manifest: JSONData, $testingDetails: TestingDetailsField,
      $jwtRights: JWTRightsField, $standaloneJobTemplates: [CreateEngineJobTemplate!], $cpuResourceMcpu: Int,
      $gpuSupported: GPUSupported, $website: String, $distributionType: EngineDistributionType, $entityTags: [EntityTagInput],
      $metadataVersion: Int
    ) {
      createEngine(input: {
        id: $id
        isPublic: $isPublic
        name: $name
        description: $description
        categoryId: $categoryId
        deploymentModel: $deploymentModel
        price: $price
        priceDimension: $priceDimension
        edgeVersion: $edgeVersion
        fields: $fields
        schemas: $schemas
        iconPath: $iconPath
        logoPath: $logoPath
        libraryRequired: $libraryRequired
        createsTDO: $createsTDO
        useCases: $useCases
        industries: $industries
        manifest: $manifest
        testingDetails: $testingDetails
        jwtRights: $jwtRights
        standaloneJobTemplates: $standaloneJobTemplates
        cpuResourceMcpu: $cpuResourceMcpu
        gpuSupported: $gpuSupported
        website: $website
        distributionType: $distributionType
        entityTags: $entityTags
        metadataVersion: $metadataVersion
      }) {
        id
        state
        deploymentModel
        name
        fields {
          max
          min
          type
          name
          label
        }
        categoryId
        createsTDO
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

  return gqlClient.query(query, input, options);
}

async function helpUpdateEngine(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation (
      $id: ID!, $isPublic: Boolean, $name: String,
      $description: String, $categoryId: String, $deploymentModel: DeploymentModel,
      $price: Int, $priceDimension: PriceDimension, $edgeVersion: Int,
      $fields: [CreateEngineField!], $schemas: [EngineSchema], $iconPath: String,
      $logoPath: String, $libraryRequired: Boolean,
      $useCases: [String!], $industries: [String!], $manifest: JSONData, $testingDetails: JSONData,
      $jwtRights: JWTRightsField, $standaloneJobTemplates: [CreateEngineJobTemplate], $cpuResourceMcpu: Int,
      $gpuSupported: GPUSupported, $website: String, $distributionType: EngineDistributionType, $entityTags: [EntityTagInput],
      $metadataVersion: Int
    ) {
      updateEngine(input: {
        id: $id
        isPublic: $isPublic
        name: $name
        description: $description
        categoryId: $categoryId
        deploymentModel: $deploymentModel
        price: $price
        priceDimension: $priceDimension
        edgeVersion: $edgeVersion
        fields: $fields
        schemas: $schemas
        iconPath: $iconPath
        logoPath: $logoPath
        libraryRequired: $libraryRequired
        useCases: $useCases
        industries: $industries
        manifest: $manifest
        testingDetails: $testingDetails
        jwtRights: $jwtRights
        standaloneJobTemplates: $standaloneJobTemplates
        cpuResourceMcpu: $cpuResourceMcpu
        gpuSupported: $gpuSupported
        website: $website
        distributionType: $distributionType
        entityTags: $entityTags
        metadataVersion: $metadataVersion
      }) {
        id
        name
        deploymentModel
        jwtRights
        isPublic
        categoryId
        price
        priceDimension
        edgeVersion
        fields {
          max
          min
          type
          info
          name
          label
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
        standaloneJobTemplates {
          type
          template
        }
        iconPath
        logoPath
        libraryRequired
        useCases
        industries
        manifest
        cpuResourceMcpu
        gpuSupported
        website
        state
        distributionType
      }
    }
  `;

  return gqlClient.query(query, input, options);
}

async function helpCreateEngineBuild(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `
    mutation (
      $id: ID, $engineId: ID!, $taskRuntime: JSONData,
      $dockerImage: String, $manifest: JSONData, $releaseNotes: String
      ) {
      createEngineBuild(
        input: {
          id: $id
          engineId: $engineId
          taskRuntime: $taskRuntime
          dockerImage: $dockerImage
          manifest: $manifest
          releaseNotes: $releaseNotes
        }
      ) {
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
    `,
    input,
    options
  );
}

async function helpDeleteEngineBuild(client, input) {
  const { gqlClient, options } = client;
  const { id, engineId } = input;

  return gqlClient.query(
    `mutation deleteEngineBuild {
      deleteEngineBuild(input: {
        id: "${id}"
        engineId: "${engineId}"
      }) {
        id
        message
      }
    }`,
    {},
    options
  );
}

async function helpEngineWorkflow(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `mutation engineWorkflow ($id: ID!, $action: EngineWorkflowAction!) {
      engineWorkflow(input: {
        id: $id
        action: $action
      }) {
        id
        state
      }
    }`,
    input,
    options
  );
}

async function helpGetEngine(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  return gqlClient.query(
    `query {
      engine(
        id: "${id}"
      ) {
        id
        name
        state
      }
    }`,
    {},
    options
  );
}

async function helpLaunchSingleEngineJob(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation launchSingleEngineJob (
    $engineId: ID!, $targetId: ID, $uploadUrl: String, $clusterId: ID, $priority: Int!, $fields: [EngineFieldValue]
  ) {
      launchSingleEngineJob(input: {
        engineId: $engineId
        targetId: $targetId
        uploadUrl: $uploadUrl
        clusterId: $clusterId
        priority: $priority
        fields: $fields
      }) {
        id
        clusterId
        tasks {
          count
          records {
            id
            engineId
            executionPreferences {
              priority
            }
          }
        }
      }
    }`;

  return gqlClient.query(query, input, options);
}

async function helpDeleteEngine(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  return gqlClient.query(
    `mutation deleteEngine {
      deleteEngine(id: "${id}") {
        id
        message
      }
    }`,
    {},
    options
  );
}

async function helGetEngineBuild(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  const query = `
    query getEngineBuild{
      engineBuild(id:"${id}"){
        id
        status
        engine {
          id
          state
        }
      }
    }`;

  return await gqlClient.query(query, {}, options);
}

async function helpGetEngineResults(client, input) {
  const { gqlClient, options } = client;
  return gqlClient.query(
    `query engineResults (
      $tdoId: ID, $sourceId: ID, $ignoreUserEdited: Boolean, $engineIds: [ID!], $engineCategoryIds: [ID!]
    ) {
      engineResults(
        tdoId: $tdoId
        sourceId: $sourceId
        ignoreUserEdited: $ignoreUserEdited
        engineIds: $engineIds
        engineCategoryIds: $engineCategoryIds
      ) {
        records {
          tdoId
          engineId
          assetId
          jsondata
          userEdited
        }
      }
    }`,
    input,
    options
  );
}

async function helpGetEngineBuild(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  return gqlClient.query(
    `query getEngineBuild{
      engineBuild(id:"${id}"){
        id
        status
        engine {
          id
          state
        }
      }
    }`,
    {},
    options
  );
}

async function helpCreateCluster(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation createCluster (
    $name: String!,
    $allowedEngines: [String]!,
    $dockerCredentials: JSONData!
    $edgeVersion: Int
  ) {
    createCluster(input: {
      name: $name
      allowedEngines: $allowedEngines
      dockerCredentials: $dockerCredentials
      edgeVersion: $edgeVersion
    }) {
      id
      edgeVersion
    }
  }`;
  return gqlClient.query(query, input, options);
}

async function helpDeleteCluster(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;
  return gqlClient.query(
    `mutation deleteCluster {
      deleteCluster(id: "${id}") {
        id
        message
      }
    }`,
    {},
    options
  );
}

// Multipart upload variant (uses file attachment)
async function helpCreateEngineAssetMultipart(client, input) {
  const { gqlClient, options } = client;
  const {
    tdoId,
    filePath,
    fileName,
    contentType = 'application/json',
    type = 'vtn-standard',
    engineId,
    taskId
  } = input;

  const query = `
    mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        contentType: "${contentType}"
        assetType: "${type}"
        sourceData: {
          engineId: "${engineId}"
          taskId: "${taskId}"
        }
      }) {
        id
        uri
      }
    }
  `;

  const headers = options && options.headers ? options.headers : options;
  return gqlClient.uploadFile(query, fileName, filePath, headers);
}

async function helpAddToEngineWhitelist(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation addToEngineWhitelist ($input: SetEngineWhitelist!) {
      addToEngineWhitelist (toAdd: $input) {
        organizationId
      }
    }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'addToEngineWhitelist');
}

async function helpUploadEngineResult(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: UploadEngineResult!) {
    uploadEngineResult(input: $input) {
      id
      uri
      assetType
      contentType
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'uploadEngineResult');
}

module.exports = {
  generateEngineActivated,
  deleteEngineInfoGenerated,
  getEngineCategories,
  helpGetEngineCategories,
  helpGetEngine,
  helpGetEngines,
  helpCreateEngine,
  helpUpdateEngine,
  helpDeleteEngine,
  helGetEngineBuild,
  helpCreateEngineBuild,
  helpUpdateEngineBuild,
  helpDeleteEngineBuild,
  helpEngineWorkflow,
  helpLaunchSingleEngineJob,
  helpGetEngineResults,
  helpGetEngineBuild,
  helpCreateCluster,
  helpDeleteCluster,
  helpCreateEngineAssetMultipart,
  helpAddToEngineWhitelist,
  helpUploadEngineResult
};
