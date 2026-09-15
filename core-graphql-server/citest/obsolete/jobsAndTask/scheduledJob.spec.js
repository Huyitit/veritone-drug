const moment = require('moment');
const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization.js');
const userHelper = require('../../helpers/user.js');
const engineHelper = require('../../helpers/engine.js');
const schemaHelper = require('../../helpers/schema.js');
const regHelper = require('../../helpers/dataRegistry.js');
const sourceHelper = require('../../helpers/sourceHelper.js');
const jobHelper = require('../../helpers/job.js');
const dagTemplateHelper = require('../../helpers/dagTemplate.js');
const clusterHelper = require('../../helpers/cluster.js');
const GraphqlClient = require('../../helpers/gql.js');
const {
  generateEngineActivated,
  deleteEngineInfoGenerated
} = require('../../helpers/engine.js');
const tdoHelper = require('../../helpers/tdo.js');
const config = helpers.config;

const citestMarker = global.citestMarker || 'citest-should-delete';
const env = config.env;
const _ = require('lodash');
const testName = `${citestMarker}-source-` + Date.now();
const chakram = require('chakram');
const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const nameOrg = `${citestMarker}-scheduledJob-` + Date.now();
const uuid = require('uuid');
const { safe } = require('../../helpers/cleanup/utils');
const gqlClient = new GraphqlClient(env);
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);
const createCitestSource1 = `mutation {
  createSource(input: {
    sourceTypeId: 1
    name: "${citestMarker}-sourceType-1"
  }) {
    id
  }
}`;

const createCitestSource17 = `mutation {  
  createSource(input: {
    sourceTypeId: 17
    name: "${citestMarker}-sourceType-17"
  }) {
    id
  }
}`;

let testEngineId;
let testRealtimeEngineId;
let testEngineCategoryId;
let scheduledJobId;
let dataRegistryId;
let newScheduledJobId;
let sourceId1, sourceIdShouldDelete1;
let sourceId2, sourceIdShouldDelete2;
let programFormat;
let clusters;
let defaultCluster;
let nonDefaultCluster;
let defaultClusterSJ;
let nonDefaultClusterSJ;
let tdoIdFromLaunchScheduledJob1, tdoIdFromLaunchScheduledJob2;
let tdoIdFromScheduledJob1, tdoIdFromScheduledJob2;
let adminOptions;
let schemaId;
let userId;
let limitedOrg, unLimitOrg;
const jobIds = [];
let sourceId1test;

const liveImage1 =
  'https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels4_banner.jpg';
const liveImage2 =
  'https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels5_banner.jpg';
let sharedApiToken;
let engineInfo;
describe('citest_jobs: Scheduled job tests', () => {
  let apiToken;
  let token;
  const uniqueId = citestMarker + '-' + Date.now().valueOf();
  beforeAll(async () => {
    const env = config.env;
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    const organizationId = result.organizationId;
    // console.log('result', result._response._body.organization)
    const engineName = `${citestMarker}-engine-${Date.now()}-${organizationId}`;

    apiToken = result.apiToken;
    token = result.token;

    limitedOrg = await getOrCreateOrganization({
      nameOrg: `${citestMarker}-scheduledJob-` + Date.now(),
      remainingBudget: 0,
      isLimitEnforced: true
    });

    unLimitOrg = await getOrCreateOrganization({
      nameOrg: `${citestMarker}-scheduledJob-` + Date.now(),
      remainingBudget: 0,
      isLimitEnforced: false
    });

    engineInfo = await generateEngineActivated(gqlClient, {
      engineName
    });
  });

  afterAll(async () => {
    if (jobIds.length > 0) {
      for (const jobId of jobIds) {
        await safe(`cancel job ${jobId}`, async () =>
          jobHelper.helpCancelJob({ gqlClient }, { jobId })
        );
      }
    }

    if (_.get(engineInfo, 'engine.id') && _.get(engineInfo, 'engineBuild.id')) {
      await safe('delete generated engine info', async () =>
        deleteEngineInfoGenerated(gqlClient, {
          engineBuildId: engineInfo.engineBuild.id,
          engineId: engineInfo.engine.id
        })
      );
    }

    // delete source
    if (sourceIdShouldDelete1) {
      // get owner token
      await safe('delete source sourceIdShouldDelete1', async () => {
        const ownerInfo = await sourceHelper.helpGetSourceById(
          { gqlClient },
          { sourceId: sourceIdShouldDelete1 }
        );

        const guid = _.get(ownerInfo, 'organization.guid', '');
        const users = _.get(ownerInfo, 'organization.users.records', []);
        const ownerId = users.find((user) => user.name.includes(citestMarker));
        const ownerOption = await impersonate(ownerId.id, guid, token);

        // delete source by owner token
        const result = await sourceHelper.helpDeleteSource(
          { gqlClient, options: ownerOption },
          sourceIdShouldDelete1
        );
        expect(result.deleteSource.id).toEqual(sourceIdShouldDelete1);
      });
    }

    if (sourceIdShouldDelete2) {
      await safe('delete source sourceIdShouldDelete2', async () => {
        const ownerInfo = await sourceHelper.helpGetSourceById(
          { gqlClient },
          { sourceId: sourceIdShouldDelete2 }
        );

        const guid = _.get(ownerInfo, 'organization.guid', '');
        const users = _.get(ownerInfo, 'organization.users.records', []);
        const ownerId = users.find((user) => user.name.includes(citestMarker));
        const ownerOption = await impersonate(ownerId.id, guid, token);

        // delete source by owner token
        const result = await sourceHelper.helpDeleteSource(
          { gqlClient, options: ownerOption },
          sourceIdShouldDelete2
        );
        expect(result.deleteSource.id).toEqual(sourceIdShouldDelete2);
      });
    }

    if (sourceId1test) {
      await safe('delete source sourceId1test', async () =>
        sourceHelper.helpDeleteSource(
          { gqlClient, options: adminOptions },
          sourceId1test
        )
      );
    }

    // delete schema, dataRegistry
    if (schemaId) {
      await safe(`delete schema ${schemaId}`, async () =>
        schemaHelper.helpDeleteSchema({ gqlClient }, { schemaId })
      );
    }

    // delete user
    if (userId) {
      await safe('delete user', async () =>
        userHelper.deleteUser({ gqlClient }, userId)
      );
    }

    // delete org
    if (limitedOrg && limitedOrg.id) {
      await safe('delete organization', async () => {
        const deleteOrg = await orgHelper.deleteOrganization(
          { gqlClient },
          limitedOrg.id
        );
        expect(deleteOrg.updateOrganization.id).toEqual(limitedOrg.id);
      });
    }

    if (unLimitOrg && unLimitOrg.id) {
      await safe('delete organization', async () => {
        const deleteOrg = await orgHelper.deleteOrganization(
          { gqlClient },
          unLimitOrg.id
        );
        expect(deleteOrg.updateOrganization.id).toEqual(unLimitOrg.id);
      });
    }
  });

  it('create a dataRegistry and its schema', async () => {
    let dataRegResult = await regHelper.helpCreateDataRegistry(
      { gqlClient },
      {
        source: `${citestMarker}-scheduledJob source`,
        name: `${citestMarker} Youtube Source Schema ${Date.now().valueOf()}`,
        description: `${citestMarker}-scheduledJob-youtube-schema`
      }
    );
    const createDataRegistry = _.get(dataRegResult, 'createDataRegistry');
    dataRegistryId = createDataRegistry.id;
    expect(dataRegistryId).toBeDefined();
    await createAndUpdateSchema(dataRegistryId);
  });

  it('find a test engine, schema, and source', async () => {
    const [
      testEngine,
      testRTEngine,
      clustersData,
      dataRegistries,
      source1,
      source2
    ] = await Promise.all([
      engineHelper.helpGetEngines(
        { gqlClient },
        {
          createsTDO: false,
          state: ['active'],
          limit: 1,
          name: engineInfo.engine.name
        }
      ),
      engineHelper.helpGetEngines(
        { gqlClient },
        {
          createsTDO: false,
          state: ['active'],
          filter: { mode: 'Chunk' },
          limit: 1
        }
      ),
      clusterHelper.helpGetClusters({ gqlClient }, { type: 'RT' }),
      regHelper.helpGetDataRegistries(
        { gqlClient },
        { id: dataRegistryId, schemaStatus: ['published'] }
      ),
      sourceHelper.helpQuerySource(
        { gqlClient },
        { sourceTypeId: 1, limit: 4, permission: 'owner' }
      ),
      sourceHelper.helpQuerySource(
        { gqlClient },
        { sourceTypeId: 17, limit: 4, permission: 'owner' }
      )
    ]);
    // verify at least one response
    testEngineId = _.get(testEngine, 'engines.records[0].id');
    expect(testEngineId).toBeDefined();
    testEngineCategoryId = _.get(testEngine, 'engines.records[0].category.id');
    expect(testEngineCategoryId).toBeDefined();
    schemaId = _.get(
      dataRegistries,
      'dataRegistries.records[0].schemas.records[0].id'
    );
    expect(schemaId).toBeDefined();

    sourceId1 = _.get(source1, 'records[0].id');
    if (!sourceId1) {
      const s1 = await gqlClient.query(createCitestSource1);
      sourceId1 = _.get(s1, 'createSource.id');
      sourceIdShouldDelete1 = sourceId1;
    }
    expect(sourceId1).toBeDefined();
    sourceId2 = _.get(source2, 'records[0].id');
    if (!sourceId2) {
      const s17 = await gqlClient.query(createCitestSource17);
      sourceId2 = _.get(s17, 'createSource.id');
      sourceIdShouldDelete2 = sourceId2;
    }
    expect(sourceId2).toBeDefined();

    clusters = _.get(clustersData, 'records');
    expect(clusters).toBeDefined();

    testRealtimeEngineId = _.get(testRTEngine, 'engines.records[0].id');
    expect(testRealtimeEngineId).toBeDefined();

    // If we can't find default cluster then we probably need to start paging
    // For now we have a very small amount of clusters
    defaultCluster = _.find(clusters, 'default');
    expect(defaultCluster).toBeDefined();

    // Might not always have other clusters than default
    nonDefaultCluster = _.find(
      clusters,
      (cluster) => cluster.default === false
    );

    programFormat = _.get(source1, 'records[0].sourceType.programFormats[0]');
    expect(programFormat).toBeDefined();
  });

  it('run scheduledJobs crontab query ', async () => {
    await jobHelper.helpGetScheduledJobs(
      { gqlClient, options: true },
      { hasJobTemplate: true, isActive: true }
    );
  });

  it('create a scheduled job', async () => {
    const result = await jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        name: `${testName}-job`,
        runMode: 'Now',
        details: {
          programFormat: programFormat,
          foo: 'bar',
          programLiveImage: liveImage1,
          programImage: liveImage2,
          isNational: true
        },
        isPublic: false,
        contentTemplates: [
          {
            schemaId: schemaId,
            data: {
              url: 'https://youtube.com/channel/123',
              youtubeChannelUrl: 'https://youtube.com/channel/123',
              liveTimezone: 'PST'
            }
          }
        ],
        weeklyScheduleParts: [
          {
            scheduledDay: 'Monday',
            startTime: '09:00:00-08:00',
            stopTime: '10:30-08:00'
          }
        ],
        jobTemplates: [
          {
            jobConfig: {
              createTDOInput: {
                details: { tags: ['foo', 'bar'] }
              },
              jobPipelineStage: 1
            },
            taskTemplates: [
              {
                engineId: testEngineId,
                payload: { foo: 'bar', sourceId: sourceId1 }
              }
            ]
          }
        ]
      },
      { isCollaborator: true }
    );
    // verify at least one response
    newScheduledJobId = _.get(result, 'id');
    expect(newScheduledJobId).toBeDefined();
    expect(_.get(result, 'jobs.records[0].jobConfig.authData')).toBeDefined();
    expect(
      _.get(result, 'jobs.records[0].jobConfig.authDataLaunch')
    ).toBeDefined();
    const newJob = _.get(result, 'jobs.records[0]');
    expect(_.get(newJob, 'jobConfig.authDataLaunch')).toBeDefined();
    expect(_.get(newJob, 'jobConfig.authData.applicationId')).toEqual(
      'GraphQL-CI-Test'
    );
    expect(_.get(result, 'contentTemplates[0].data.url')).toEqual(
      'https://youtube.com/channel/123'
    );
    expect(_.get(result, 'isPublic')).toEqual(false);
    expect(_.get(result, 'primarySourceId')).toEqual(sourceId1);
    /*
    expect(_.get(result, 'collaborators.records[0].organizationId')).toEqual(
      '14954'
    );
    expect(_.get(result, 'collaborators.records[0].permission')).toEqual(
      'viewer'
    );
    */
    expect(_.get(result, 'details.foo')).toEqual('bar');
    expect(_.get(result, 'details.programFormat')).toEqual(
      'Adult Contemporary'
    );
    expect(_.get(result, 'details.isNational')).toEqual(true);
    expect(_.get(result, 'affiliates.count')).toEqual(0);
    tdoIdFromScheduledJob1 = getTdoIdFromScheduledJob(result);
  });

  it('update a scheduled job', async () => {
    const result = await jobHelper.helpUpdateScheduledJob(
      { gqlClient },
      {
        id: newScheduledJobId,
        isPublic: true,
        details: { isNational: false, foo: 'bar' },
        jobTemplates: [
          {
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } }
            },
            taskTemplates: [
              {
                engineId: testEngineId,
                payload: { foo: 'bar', sourceId: sourceId2 }
              }
            ]
          }
        ]
      },
      { isCollaborator: true }
    );
    // verify at least one response
    expect(_.get(result, 'id')).toEqual(newScheduledJobId);
    expect(_.get(result, 'isPublic')).toEqual(true);
    expect(_.get(result, 'jobPipelineIds')).toBeNull();
    // expect(_.get(result, 'collaborators.count')).toEqual(2);
    // expect(_.get(result, 'collaborators.records.length')).toEqual(2);
    expect(
      _.get(result, 'collaborators.records[0].organizationId')
    ).toBeDefined();
    // expect(
    //   _.get(result, 'collaborators.records[1].organizationId')
    // ).toBeDefined();
    expect(_.get(result, 'collaborators.records[0].permission')).toBeDefined();
    // expect(_.get(result, 'collaborators.records[1].permission')).toBeDefined();
    expect(_.get(result, 'details.foo')).toEqual('bar');
    const programFormat = _.get(result, 'details.programFormat');
    expect(programFormat).toBeDefined();
    expect(_.get(result, 'primarySourceId')).toEqual(`${sourceId2}`);
    expect(_.get(result, 'details.isNational')).toEqual(false);
  });

  it('update a scheduled job again', async () => {
    const result = await jobHelper.helpUpdateScheduledJob(
      { gqlClient },
      { id: newScheduledJobId },
      { isCollaborator: true }
    );
    // verify at least one response
    expect(_.get(result, 'id')).toEqual(newScheduledJobId);
    expect(_.get(result, 'collaborators.count')).toEqual(1);
    expect(_.get(result, 'collaborators.records.length')).toEqual(1);
    /*
    expect(
      _.get(
        result, 'collaborators.records[0].organizationId'
      )
    ).toEqual('14954');
    expect(
      _.get(
        result, 'collaborators.records[0].permission'
      )
    ).toEqual('editor');
    */
  });

  it('should not update a scheduled job misses/has invalid engineId', async () => {
    let result, error;
    try {
      result = await jobHelper.helpUpdateScheduledJob(
        { gqlClient },
        {
          id: newScheduledJobId,
          jobTemplates: [
            {
              jobConfig: {
                createTDOInput: {
                  details: { tags: ['foo', 'bar'] }
                }
              },
              taskTemplates: [
                {
                  engineId: 'notfound_engine_id',
                  payload: { foo: 'bar', sourceId: sourceId2 }
                }
              ]
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }
    expect(result).toBeUndefined();
    expect(error).toBeDefined();
    const graphqlErrors = helpers.getErrorsFromGraphqlResponse(error);
    expect(graphqlErrors).toBeDefined();
    expect(graphqlErrors.length > 0).toEqual(true);
    expect(graphqlErrors[0].message).toEqual('Some engines were not found');
    expect(graphqlErrors[0].data.engineIds).toEqual(['notfound_engine_id']);
  });

  it('launch a scheduled job', async () => {
    const result = await jobHelper.helpLaunchScheduledJobs(
      { gqlClient },
      { scheduledJobId: newScheduledJobId },
      { assetType: 'content-template' }
    );
    // verify at least one job created
    expect(_.get(result, '[0].id')).toBeDefined();
    // verify that target TDO was created
    expect(_.get(result, '[0].target.id')).toBeDefined();
    // verify that a content template was applied
    expect(_.get(result, '[0].target.assets.count')).toEqual(1);
    tdoIdFromLaunchScheduledJob1 = result[0].target.id;
    jobIds.push(_.get(result, '[0].id'));
    expect(_.get(result, '[0].target.thumbnailUrl')).toEqual(liveImage1);
    expect(_.get(result, '[0].target.sourceData.scheduledJobId')).toEqual(
      newScheduledJobId
    );
    expect(_.get(result, '[0].target.sourceData.sourceId')).toEqual(sourceId2);
    expect(_.get(result, '[0].target.sourceImageUrl')).toEqual(liveImage2);
    expect(_.get(result, '[0].scheduledJobId')).toEqual(newScheduledJobId);
    expect(_.get(result, '[0].scheduledJob.id')).toEqual(newScheduledJobId);
  });

  it('launch a scheduled job without application header', async () => {
    const { requestOptions } = require('../../helpers/index');
    const reqOptions = requestOptions(
      config.env === 'ai13s' ? token : apiToken
    );
    delete reqOptions.headers['X-Veritone-Application'];
    const result = await jobHelper.helpLaunchScheduledJobs(
      { gqlClient, options: reqOptions },
      { scheduledJobId: newScheduledJobId }
    );
    // verify at least one job created
    tdoIdFromLaunchScheduledJob2 = result[0].target.id;
    jobIds.push(_.get(result, '[0].id'));
    expect(_.get(result, '[0].id')).toBeDefined();
    const jobConfig = _.get(result, '[0].jobConfig');
    expect(_.get(jobConfig, 'authDataLaunch')).toBeDefined();
    // it should get the applicationId from scheduled job

    expect(_.get(jobConfig, 'authDataLaunch.applicationId')).toEqual(
      'GraphQL-CI-Test'
    );
  });

  // Read path in newCreateJob extracted contentApplicationId from jobConfig.authData (the stale template) instead
  // of jobConfig.authDataLaunch (the freshly resolved launch-time value), leaving job_new.job.content_application_id NULL for scheduled-job launches.
  // This asserts the launch-time X-Veritone-Application header wins. The column is not accessible via gql schema so we read postgres directly.
  it('launch-time X-Veritone-Application populates content_application_id even when template has stored authData', async () => {
    const jobDb = require('../../helpers/jobDb.js');
    const { requestOptions } = require('../../helpers/index');
    const launchAppId = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'; // Developer app fixture

    const reqOptions = requestOptions(
      config.env === 'ai13s' ? token : apiToken
    );
    reqOptions.headers['X-Veritone-Application'] = launchAppId;

    const result = await jobHelper.helpLaunchScheduledJobs(
      { gqlClient, options: reqOptions },
      { scheduledJobId: newScheduledJobId }
    );
    const launchedJobId = _.get(result, '[0].id');
    expect(launchedJobId).toBeDefined();
    jobIds.push(launchedJobId);

    const dbValue = await jobDb.getJobContentApplicationId(launchedJobId);
    expect(dbValue).toEqual(launchAppId);
  });

  it('find scheduled jobs', async () => {
    const [
      byEngineId,
      byEngineCategoryId,
      byEngineType,
      withTemplates,
      withoutTemplates,
      byRunning,
      jobs,
      scheduledJobs
    ] = await Promise.all([
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        { engineId: testEngineId, limit: 1 }
      ),
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        { engineCategoryId: testEngineCategoryId, limit: 1 }
      ),
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        { engineType: 'Cognition', limit: 1 }
      ),
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        {
          hasJobTemplate: true,
          limit: 1,
          orderBy: [{ field: 'createdDateTime', direction: 'desc' }]
        }
      ),
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        {
          hasJobTemplate: false,
          limit: 1,
          orderBy: [{ field: 'createdDateTime', direction: 'desc' }]
        }
      ),
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        {
          hasRunningJobs: true,
          orderBy: [{ field: 'createdDateTime', direction: 'desc' }],
          limit: 1
        }
      ),
      jobHelper.helpGetJobs(
        { gqlClient },
        {
          status: ['running', 'pending'],
          limit: 1,
          dateTimeFilter: [
            {
              field: 'createdDateTime',
              fromDateTime: moment().subtract(1, 'weeks').toISOString()
            }
          ]
        }
      ),
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        {
          isActive: true,
          runMode: 'Once',
          limit: 5,
          primarySourceId: [sourceId2, sourceId1],
          permission: 'owner',
          orderBy: [{ field: 'stopDateTime', direction: 'asc' }]
        }
      )
    ]);

    // verify at least one response
    expect(_.get(scheduledJobs, 'records[0].id')).toBeDefined();
    scheduledJobId = _.get(scheduledJobs, 'records[0].id');
    expect(_.get(scheduledJobs, 'records[0].details')).toBeDefined();
    expect(_.get(scheduledJobs, 'records[0].parts')).toBeDefined();
    expect(_.get(scheduledJobs, 'records[0].permission')).toEqual('owner');
    expect(_.get(jobs, 'count')).toEqual(1);
    // TODO query to jobs table is including nonexistent scheduled job IDs?
    // possibly from jobs run just before sj deleted or created with
    // bad sj IDs.
    //expect(_.get(result, 'byRunning.count')).toEqual(1);
    expect(_.get(byEngineId, 'count')).toEqual(1);
    expect(_.get(byEngineCategoryId, 'count')).toEqual(1);
    expect(_.get(byEngineType, 'count')).toEqual(1);
    expect(_.get(withTemplates, 'records[0].allJobTemplates.count')).toEqual(1);
    expect(_.get(withoutTemplates, 'records[0].allJobTemplates.count')).toEqual(
      0
    );
  });

  it('find a scheduled job', async () => {
    const queryResult = Promise.all([
      jobHelper.helpGetJobs(
        { gqlClient },
        { scheduledJobId: newScheduledJobId, limit: 1 }
      ),
      jobHelper.helpGetScheduledJobs({ gqlClient }, { id: 'foo' }),
      jobHelper.helpGetScheduledJobs({ gqlClient }, { id: newScheduledJobId }),
      jobHelper.helpGetScheduledJobs({ gqlClient }, { id: scheduledJobId })
    ]);

    await expect(queryResult).rejects.toThrow('not_found');
  });

  it('create rt scheduled jobs', async () => {
    let createClusterMutation = [
      jobHelper.helpCreateScheduledJob(
        { gqlClient },
        {
          name: `${testName}-defaultCluster`,
          jobTemplates: {
            clusterId: defaultCluster.id,
            taskTemplates: { engineId: testRealtimeEngineId }
          }
        }
      )
    ];

    // Some env will not have a second cluster
    if (nonDefaultCluster) {
      createClusterMutation.push(
        jobHelper.helpCreateScheduledJob(
          { gqlClient },
          {
            name: `${testName}-nonDefaultCluster`,
            jobTemplates: {
              clusterId: nonDefaultCluster.id,
              taskTemplates: { engineId: testRealtimeEngineId }
            }
          }
        )
      );
    }

    const result = await Promise.all(createClusterMutation);
    defaultClusterSJ = _.get(result, '[0]');
    nonDefaultClusterSJ = _.get(result, '[1]');

    expect(defaultClusterSJ).toBeDefined();
    if (nonDefaultCluster) {
      expect(nonDefaultClusterSJ).toBeDefined();
    }
  });

  it('find scheduledJobs by clusterId', async () => {
    const [defaultClusterData, nonDefaultClusterData] = await Promise.all([
      jobHelper.helpGetScheduledJobs(
        { gqlClient },
        {
          clusterId: defaultCluster.id,
          orderBy: { field: 'createdDateTime', direction: 'desc' },
          limit: 1
        }
      ),
      nonDefaultCluster
        ? jobHelper.helpGetScheduledJobs(
            { gqlClient },
            {
              clusterId: nonDefaultCluster.id,
              orderBy: { field: 'createdDateTime', direction: 'desc' },
              limit: 1
            }
          )
        : null
    ]);
    const defaultClusterSJs = defaultClusterData;
    const nonDefaultClusterSJs = nonDefaultClusterData;

    expect(defaultClusterSJs).toBeDefined();
    expect(defaultClusterSJs.count).toEqual(1);
    if (nonDefaultCluster) {
      expect(nonDefaultClusterSJs).toBeDefined();
      expect(nonDefaultClusterSJs.count).toEqual(1);
    }
  });

  it('should update scheduled job - ingestionStatus', async () => {
    const result = await jobHelper.helpUpdateScheduledJob(
      { gqlClient },
      { id: newScheduledJobId, ingestionStatus: 'METRICS_ONLY' }
    );
    const updateScheduledJob = result;

    expect(updateScheduledJob).toBeDefined();
    expect(updateScheduledJob.id).toEqual(newScheduledJobId);
    expect(updateScheduledJob.ingestionStatusId).toEqual('4');
  });

  it('should update scheduled job - ingestionStatusId', async () => {
    const result = await jobHelper.helpUpdateScheduledJob(
      { gqlClient },
      { id: newScheduledJobId, ingestionStatusId: 3 }
    );
    const updateScheduledJob = result;

    expect(updateScheduledJob).toBeDefined();
    expect(updateScheduledJob.id).toEqual(newScheduledJobId);
    expect(updateScheduledJob.ingestionStatusId).toEqual('3');
  });

  it('should create and delete a schedule job via dag template ids', async () => {
    const sampleDagTemplate =
      '{\\"tasks\\": [\\n  {\\n    \\"engineId\\": \\"{{{firstEngineId}}}\\",\\n    \\"payload\\": {\\n      \\"url\\": \\"{{{UPLOAD_URL}}}\\"\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priorityOfFirst}} \\"priority\\":{{minus priorityOfFirst 5}} {{/if}}\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"wsa-output\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"{{{secondEngineId}}}\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"pb-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440\\",\\n    \\"payload\\": {\\n      \\"ffmpegTemplate\\": \\"video\\",\\n      \\"customFFMPEGProperties\\": {\\n        \\"chunkSizeInSeconds\\": {{#if chunkSizeInSeconds}} \\"{{{chunkSizeInSeconds}}}\\" {{else}} \\"300\\" {{/if}}\\n      }\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"si-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      },\\n      {\\n        \\"referenceId\\": \\"si-output\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"ow-input\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  }\\n],\\n\\"routes\\": [\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"pb-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"si-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"si-output\\",\\n    \\"childIoFolderReferenceId\\": \\"ow-input\\"\\n  }\\n]}';
    const createDagTemplateQuery = `
   mutation createDagTemplate{
      createDagTemplate(input:{
      name:"${citestMarker} Webstream Speechmatics Reprocess Template"
      description:"English Transcription"
      tags:[
        "transcription"
      ]
      dagTemplateLanguage:"Handlebars"
      dag: "${sampleDagTemplate}"
      }){
        id
        cognitiveCategoryId
        targetOrganizationId
       }
    }    
    `;
    const createTemplateResult = await gqlClient.query(createDagTemplateQuery);
    const createDagTemplate = _.get(createTemplateResult, 'createDagTemplate');
    expect(createDagTemplate).toBeDefined();
    expect(createDagTemplate.id).toBeDefined();

    const createResult = await jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        name: `${testName}-testdagtemplatejob`,
        dagTemplates: {
          dagTemplateIds: [createDagTemplate.id],
          params: { foo: 'bar' },
          jobConfig: { foo: 'bar' }
        }
      }
    );
    const createScheduledJob = createResult;

    expect(createScheduledJob).toBeDefined();
    expect(createScheduledJob.id).toBeDefined();
    expect(createScheduledJob.jobTemplateIds).toBeDefined();
    expect(_.isArray(createScheduledJob.jobTemplateIds)).toBe(true);
    expect(createScheduledJob.jobTemplateIds.length).toBe(1);
    expect(createScheduledJob.jobTemplateIds[0]).toBeDefined();

    const deleteResult = await jobHelper.helpDeleteScheduledJob(
      { gqlClient },
      { scheduledJobId: createScheduledJob.id }
    );
    const deleteScheduledJob = deleteResult;

    expect(deleteScheduledJob).toBeDefined();
    expect(deleteScheduledJob.id).toBeDefined();
    expect(deleteScheduledJob.id).toEqual(createScheduledJob.id);

    const deleteDagTemplateResult =
      await dagTemplateHelper.helpDeleteDagTemplate(
        { gqlClient },
        { id: createDagTemplate.id }
      );

    const deleteDagTemplate = deleteDagTemplateResult;

    expect(deleteDagTemplate).toBeDefined();
    expect(deleteDagTemplate.id).toBeDefined();
    expect(deleteDagTemplate.id).toEqual(createDagTemplate.id);
  });

  it('should fail when isLimitEnforced is true and remainingBudget is 0', async () => {
    const applicationOrganization = await getOrCreateOrganization({
      nameOrg: limitedOrg.name,
      remainingBudget: 0,
      isLimitEnforced: true
    });
    const applicationOrgId = applicationOrganization.id;
    expect(applicationOrganization.remainingBudget).toEqual(0);
    expect(applicationOrganization.isLimitEnforced).toEqual(true);

    const scheduledJobPromise = jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        organizationId: applicationOrgId,
        name: `${testName}-job`,
        runMode: 'Now',
        details: {
          programFormat: programFormat,
          foo: 'bar',
          isNational: true
        },
        isPublic: false
      }
    );
    await expect(scheduledJobPromise).rejects.toThrow(
      'The organization has run out of budget. Job cannot be created.'
    );
  });

  it('should create job when isLimitEnforced is false and remainingBudget is 0', async () => {
    const applicationOrganization = await getOrCreateOrganization({
      nameOrg: unLimitOrg.name,
      remainingBudget: 0,
      isLimitEnforced: false
    });
    const applicationOrgId = applicationOrganization.id;
    const applicationOrgGUID = applicationOrganization.guid;
    expect(applicationOrganization.remainingBudget).toEqual(0);
    expect(applicationOrganization.isLimitEnforced).toEqual(false);
    userId = await getOrCreateUser(applicationOrganization, uniqueId);
    adminOptions = await impersonate(userId, applicationOrgGUID, token);
    // Create a test engine for the org
    try {
      // Use superadmin to add
      await engineHelper.helpAddToEngineWhitelist(
        { gqlClient },
        { organizationId: applicationOrgId, engineIds: [testEngineId] }
      );
    } catch (err) {
      expect(err).toBeUndefined();
    }

    const s1 = await sourceHelper.helpCreateSource(
      { gqlClient, options: adminOptions },
      {
        sourceTypeId: 1,
        name: `${citestMarker}-sourceType-1`
      }
    );
    sourceId1test = _.get(s1, 'id');

    const result = await jobHelper.helpCreateScheduledJob(
      { gqlClient, options: adminOptions },
      {
        organizationId: applicationOrgId,
        name: `${testName}-job`,
        runMode: 'Now',
        details: {
          programFormat: programFormat,
          foo: 'bar',
          programLiveImage: liveImage1,
          programImage: liveImage2,
          isNational: true
        },
        isPublic: false,
        contentTemplates: [
          {
            schemaId: schemaId,
            data: {
              url: 'https://youtube.com/channel/123',
              youtubeChannelUrl: 'https://youtube.com/channel/123',
              liveTimezone: 'PST'
            }
          }
        ],
        weeklyScheduleParts: [
          {
            scheduledDay: 'Monday',
            startTime: '09:00:00-08:00',
            stopTime: '10:30-08:00'
          }
        ],
        jobTemplates: [
          {
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } },
              jobPipelineStage: 1
            },

            taskTemplates: [
              {
                engineId: testEngineId,
                payload: { foo: 'bar', sourceId: sourceId1test }
              }
            ]
          }
        ]
      }
    );
    const scheduledJobId = _.get(result, 'id');
    expect(scheduledJobId).toBeDefined();

    const resultDelete = await jobHelper.helpDeleteScheduledJob(
      { gqlClient, options: adminOptions },
      { scheduledJobId: scheduledJobId }
    );
    expect(resultDelete.id).toEqual(scheduledJobId);
    tdoIdFromScheduledJob2 = getTdoIdFromScheduledJob(result);
    await deleteTdos(
      gqlClient,
      _.compact([tdoIdFromScheduledJob2]),
      adminOptions
    );
  });

  it('throw error if any engineId in the jobTemplates is not active.', async () => {
    const engineCategory = await getEngineCategories(gqlClient);
    const categoryId = _.get(engineCategory, 'id');

    const testName = `${citestMarker}-engine-` + Date.now();
    const createEngineResp = await createEngine(gqlClient, categoryId);
    const engineId = createEngineResp.id;
    const resultJob = jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        name: `${testName}-job`,
        runMode: 'Now',
        details: { programFormat: programFormat, foo: 'bar', isNational: true },
        isPublic: false,
        contentTemplates: [
          {
            schemaId: dataRegistryId,
            data: {
              url: 'https://youtube.com/channel/123',
              youtubeChannelUrl: 'https://youtube.com/channel/123',
              liveTimezone: 'PST'
            }
          }
        ],
        weeklyScheduleParts: [
          {
            scheduledDay: 'Monday',
            startTime: '09:00:00-08:00',
            stopTime: '10:30-08:00'
          }
        ],
        jobTemplates: [
          {
            skipDecider: true,
            clusterId: defaultCluster.id,
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } }
            },
            taskTemplates: [
              {
                engineId: engineId,
                payload: { foo: 'bar', sourceId: 'sourceId' }
              }
            ]
          }
        ]
      }
    );
    await expect(resultJob).rejects.toThrow('Some engines are not active');

    const resultDelete = await engineHelper.helpDeleteEngine(
      { gqlClient },
      { id: engineId }
    );
    expect(resultDelete.deleteEngine.id).toEqual(engineId);
  });

  it('throw error if no engine IDs are found in templates', async () => {
    const testName = `${citestMarker}-engine-` + Date.now();
    const createJob = jobHelper.helpCreateScheduledJob(
      { gqlClient },
      {
        name: `${testName}-job`,
        runMode: 'Now',
        details: { programFormat: programFormat, foo: 'bar', isNational: true },
        isPublic: false,
        contentTemplates: [
          {
            schemaId: dataRegistryId,
            data: {
              url: 'https://youtube.com/channel/123',
              youtubeChannelUrl: 'https://youtube.com/channel/123',
              liveTimezone: 'PST'
            }
          }
        ],
        weeklyScheduleParts: [
          {
            scheduledDay: 'Monday',
            startTime: '09:00:00-08:00',
            stopTime: '10:30-08:00'
          }
        ],
        jobTemplates: [
          {
            skipDecider: true,
            clusterId: defaultCluster.id,
            jobConfig: {
              createTDOInput: { details: { tags: ['foo', 'bar'] } }
            },
            taskTemplates: [{ payload: { foo: 'bar', sourceId: 'sourceId' } }]
          }
        ]
      }
    );

    await expect(createJob).rejects.toThrow(
      'No engine IDs were found in the provided templates.'
    );
  });

  it('delete a scheduled job', async () => {
    const [newScheduledJob, defaultRTSJ, nonDefaultRTSJ] = await Promise.all([
      jobHelper.helpDeleteScheduledJob(
        { gqlClient },
        { scheduledJobId: newScheduledJobId }
      ),
      jobHelper.helpDeleteScheduledJob(
        { gqlClient },
        { scheduledJobId: defaultClusterSJ.id }
      ),
      nonDefaultClusterSJ
        ? jobHelper.helpDeleteScheduledJob(
            { gqlClient },
            { scheduledJobId: nonDefaultClusterSJ.id }
          )
        : null
    ]);
    expect(_.get(newScheduledJob, 'id')).toBeDefined();
    expect(_.get(defaultRTSJ, 'id')).toBeDefined();
  });

  it('clear tdo from createScheduledJob', async () => {
    await deleteTdos(
      gqlClient,
      _.compact([
        tdoIdFromScheduledJob1,
        tdoIdFromLaunchScheduledJob1,
        tdoIdFromLaunchScheduledJob2
      ])
    );
  });

  async function createAndUpdateSchema(dataRegistryId) {
    const schemaCreateResult = await schemaHelper.helpCreateSchemaDraft(
      { gqlClient },
      {
        dataRegistryId: dataRegistryId,
        schema: {
          type: 'object',
          title: `${citestMarker} Scheduled_job_tests`,
          required: ['url'],
          properties: {
            url: {
              id: '/properties/url',
              type: 'string',
              title: 'YouTube Channel URL',
              pattern:
                '^((http|https)://)?(www.)?youtube.com/(channel/|user/)[a-zA-Z0-9-]{1,}'
            }
          },
          description: `${citestMarker} createScheduleJob`
        }
      }
    );
    let schemaResult = schemaCreateResult;
    schemaId = schemaResult.id;
    expect(schemaId).toBeDefined();

    let schemaUpdateResult = await schemaHelper.helpPublishSchema(
      { gqlClient },
      { id: schemaId, breakingChanges: false }
    );
    let schemaUpdate = _.get(schemaUpdateResult, 'updateSchemaState');
    expect(schemaUpdate.id).toEqual(schemaId);
    expect(schemaUpdate.status).toEqual('published');
  }
});
async function getOrganization(name) {
  const resultOrg = await orgHelper.findOrgWithFilter(
    { gqlClient },
    { name: name, nameMatch: 'contains' }
  );
  const applicationOrg = _.get(resultOrg, '[0]');
  return applicationOrg;
}

async function setupTestOrganization(input) {
  // create organization
  const variables = {
    kvp: {
      test: 'value',
      features: {
        automaticPackageCreation: 'enabled'
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
    ].filter((app) => app)
  };

  const resultOrg = await orgHelper.createTestOrganization(
    { gqlClient },
    {
      name: `${input.nameOrg}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: variables.kvp,
      apps: variables.apps,
      remainingBudget: input.remainingBudget,
      isLimitEnforced: input.isLimitEnforced
    }
  );

  expect(resultOrg.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg.id).toBeDefined();
  expect(resultOrg.guid).toBeDefined();
  return await getOrganization(input.nameOrg);
}

async function getOrCreateOrganization(input) {
  const { nameOrg, remainingBudget, isLimitEnforced } = input;
  let applicationOrganization = await getOrganization(nameOrg);
  if (
    !applicationOrganization ||
    !_.includes(applicationOrganization.name, 'scheduledJob')
  ) {
    applicationOrganization = await setupTestOrganization({
      nameOrg,
      remainingBudget,
      isLimitEnforced
    });
  }
  if (
    applicationOrganization.remainingBudget !== remainingBudget ||
    applicationOrganization.isLimitEnforced !== isLimitEnforced
  ) {
    applicationOrganization = await updateOrganization({
      orgId: applicationOrganization.id,
      remainingBudget,
      isLimitEnforced
    });
  }
  return applicationOrganization;
}

async function updateOrganization(input) {
  const resultOrg = await orgHelper.updateOrganization(
    { gqlClient },
    {
      id: input.orgId,
      remainingBudget: input.remainingBudget,
      isLimitEnforced: input.isLimitEnforced
    }
  );

  return resultOrg;
}

async function createUser(uniqueId, orgId) {
  const result = await userHelper.helpCreateUser(
    { gqlClient },
    {
      name: `${uniqueId}-admin-user-${uuid.v4()}@localhost`,
      organizationId: orgId,
      firstName: 'Flow-User',
      lastName: 'Admin',
      jsondata: { firstName: 'Flow-User', lastName: 'Admin' },
      roleIds: ROLES_IDS
    }
  );
  return _.get(result, 'id');
}
async function getOrCreateUser(applicationOrganization, uniqueId) {
  const users = _.get(applicationOrganization, 'users.records', []);
  const activeUsers = users.filter(
    (user) =>
      user.status === 'active' &&
      user.organizationGuids.length === 1 &&
      _.every(ROLES_IDS, (roleId) =>
        user.roles.some((role) => role.id === roleId)
      )
  );
  let userId;
  if (activeUsers.length === 0) {
    userId = await createUser(uniqueId, applicationOrganization.id);
  } else {
    const adminUser = _.find(activeUsers, (user) =>
      _.includes(user.name, 'admin')
    );
    userId = adminUser ? adminUser.id : users[0].id;
  }
  return userId;
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function getEngineCategories(gqlClient) {
  const engineCategoryResp = await engineHelper.helpGetEngineCategories(
    { gqlClient, options: true },
    { type: 'Cognition', name: 'Transcription', limit: 1 }
  );
  return engineCategoryResp.engineCategories.records[0];
}

async function createEngine(gqlClient, categoryId) {
  const testName = `${citestMarker}-engine-` + Date.now();
  // T09: create under the SESSION token (omit options: true) so the engine owns to the
  // session org. With the org-less api token (options: true) the engine lands in org 1,
  // and the createScheduledJob call below (session token) cannot see it — so the server
  // returns "Some engines were not found" instead of the expected "Some engines are not
  // active". See generateEngineActivated in helpers/engine.js for the same root cause.
  const createEngineResp = await engineHelper.helpCreateEngine(
    { gqlClient },
    {
      name: testName,
      categoryId: categoryId,
      deploymentModel: 'FullyNetworkIsolated'
    }
  );
  return createEngineResp.createEngine;
}

function getTdoIdFromScheduledJob(scheduledJobResult) {
  return _.get(
    scheduledJobResult,
    'createScheduledJob.jobs.records[0].targetId'
  );
}
async function deleteTdos(gqlClient, tdoList, options) {
  for (let i = 0; i < tdoList.length; i++) {
    const resultScheduleJob = await tdoHelper.processTDODeletion(
      gqlClient,
      tdoList[i],
      null,
      options
    );
    expect(_.get(resultScheduleJob, 'deleteTDO.id')).toEqual(tdoList[i]);
  }
}
