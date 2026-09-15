import { helpers } from '../../src/helpers/index';
const moment = require('moment');
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient as GraphqlClientSdk
} from '../../src/graphqlUtil';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import {
  BuildUpdateAction,
  ClusterType,
  DataRegistryOrderBy,
  DayOfWeek,
  DeploymentModel,
  EngineTypeFilter,
  JobDateTimeField,
  JobStatusFilter,
  OrderDirection,
  OrganizationType,
  RunMode,
  ScheduledJobOrderField,
  ScheduledJobPermission,
  SchemaStatus,
  SourcePermission,
  StringMatch
} from '../../src/gql';
import { processTDODeletion } from '../../src/helpers/tdoHelper';
import { safe } from '../../src/helpers/commonHelper';
import { getJobContentApplicationId } from '../../src/helpers/dbHelper';

const config = helpers.config;

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const env = config.env;
const _ = require('lodash');
const testName = `${citestMarker}-source-` + Date.now();
const buildEngineActionList = [BuildUpdateAction.Submit, BuildUpdateAction.Deploy];
const chakram = require('chakram');
const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const nameOrg = `${citestMarker}-scheduledJob-` + Date.now();
const uuid = require('uuid');
let sdkClient: GraphqlClientSdk;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
console.log('isDesktopAppEnabled:', isDesktopAppEnabled);
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId) as string[];
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

let testEngineId: string;
let testRealtimeEngineId: string;
let testEngineCategoryId: string;
let scheduledJobId: string;
let dataRegistryId: string;
let newScheduledJobId: string;
let newJobTemplateId: string;
let sourceId1: string, sourceIdShouldDelete1: string;
let sourceId2: string, sourceIdShouldDelete2: string;
let programFormat: any;
let clusters: any;
let defaultCluster: any;
let nonDefaultCluster: any;
let defaultClusterSJ: any;
let nonDefaultClusterSJ: any;
let tdoIdFromLaunchScheduledJob1: string, tdoIdFromLaunchScheduledJob2: string;
let tdoIdFromScheduledJob1: string, tdoIdFromScheduledJob2: string;
let adminOptions: any;
let schemaId: string;
let userId: string;
let limitedOrg: any, unLimitOrg: any;
let sourceId1test: string;
const jobIds: string[] = [];
const scheduledJobIds: string[] = [];
let dagTemplateId: string;

const liveImage1 =
  'https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels4_banner.jpg';
const liveImage2 =
  'https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels5_banner.jpg';
let engineIdsToDelete: string[] = [];
describe('citest_jobs: Scheduled job tests', () => {
  const uniqueId = citestMarker + '-' + Date.now().valueOf();
  beforeAll(async () => {
    const env = config.env;

    // T25-style isolation: use a throwaway superadmin identity instead of the
    // shared session, so nothing this spec does can terminate the shared
    // session used by every other spec in the shard. See
    // test/helpers/superadminSession.ts.
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = isolatedSuperadmin.client;

    expect(sdkClient.sessionToken).toBeDefined();

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
  });

  afterAll(async () => {
    if (jobIds.length > 0) {
      const promises = jobIds.map((jobId) =>
        safe(`delete job ${jobId}`, async () =>
          sdkClient.sdk.cancelJob({ id: jobId })
        )
      );
      await Promise.all(promises);
    }

    if (scheduledJobIds.length > 0) {
      const promises = scheduledJobIds.map((scheduledJobId) =>
        safe(`delete scheduled job ${scheduledJobId}`, async () =>
          sdkClient.sdk.deleteScheduledJob({ id: scheduledJobId })
        )
      );
      await Promise.all(promises);
    }

    if (dagTemplateId) {
      await safe(`delete dag template ${dagTemplateId}`, async () =>
        sdkClient.sdk.deleteDagTemplate({ id: dagTemplateId })
      );
    }

    if (engineIdsToDelete.length > 0) {
      const promises = engineIdsToDelete.map((engineId) =>
        safe(`delete engine ${engineId}`, async () =>
          sdkClient.sdk.deleteEngine({ id: engineId })
        )
      );

      await Promise.all(promises);
    }

    // delete source
    if (sourceIdShouldDelete1) {
      // get owner token

      // delete source by owner token
      await safe(`delete source ${sourceIdShouldDelete1}`, async () => {
        const ownerInfoRes = await sdkClient.sdk.getSourceById({
          id: sourceIdShouldDelete1
        });

        const ownerInfo = _.get(ownerInfoRes, 'data.source');
        const guid = _.get(ownerInfo, 'organization.guid', '');
        const users = _.get(ownerInfo, 'organization.users.records', []);
        const ownerId = users.find((user: any) =>
          user.name.includes(citestMarker)
        );
        const ownerOption = await impersonate(
          ownerId.id,
          guid,
          isolatedSuperadmin.token
        );
        await sdkClient.sdk.deleteSource(
          {
            id: sourceIdShouldDelete1
          },
          getRequestHeaders(ownerOption)
        );
      });
    }

    if (sourceIdShouldDelete2) {
      // delete source by owner token
      await safe(`delete source ${sourceIdShouldDelete2}`, async () => {
        const ownerInfoRes = await sdkClient.sdk.getSourceById({
          id: sourceIdShouldDelete2
        });

        const ownerInfo = _.get(ownerInfoRes, 'data.source');
        const guid = _.get(ownerInfo, 'organization.guid', '');
        const users = _.get(ownerInfo, 'organization.users.records', []);
        const ownerId = users.find((user: any) =>
          user.name.includes(citestMarker)
        );
        const ownerOption = await impersonate(
          ownerId.id,
          guid,
          isolatedSuperadmin.token
        );
        await sdkClient.sdk.deleteSource(
          { id: sourceIdShouldDelete2 },
          getRequestHeaders(ownerOption)
        );
      });
    }

    if (sourceId1test) {
      await safe(`delete source ${sourceId1test}`, async () =>
        sdkClient.sdk.deleteSource(
          { id: sourceId1test },
          getRequestHeaders(adminOptions)
        )
      );
    }

    // delete schema, dataRegistry
    if (schemaId) {
      await safe(`delete schema and dataRegistry ${schemaId}`, async () =>
        sdkClient.sdk.updateSchemaState({
          input: { id: schemaId, status: SchemaStatus.Deleted }
        })
      );
    }

    // delete user
    if (userId) {
      await safe(`delete user ${userId}`, async () =>
        sdkClient.sdk.deleteUser({ id: userId })
      );
    }

    // delete org
    if (limitedOrg && limitedOrg.id) {
      await safe(`delete org ${limitedOrg.id}`, async () =>
        sdkClient.sdk.updateOrganization({
          input: { id: limitedOrg.id, status: 'deleted' }
        })
      );
    }

    if (unLimitOrg && unLimitOrg.id) {
      await safe(`delete org ${unLimitOrg.id}`, async () =>
        sdkClient.sdk.updateOrganization({
          input: { id: unLimitOrg.id, status: 'deleted' }
        })
      );
    }

    // T25: tear down the isolated throwaway superadmin org/user LAST, after
    // every teardown above has run. See test/helpers/superadminSession.ts.
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  it('get or create a dataRegistry and its schema', async () => {
    let dataRegResult = await sdkClient.sdk.createDataRegistry({
      input: {
        source: `${citestMarker}-scheduledJob source`,
        name: `${citestMarker} Youtube Source Schema ${Date.now().valueOf()}`,
        description: `${citestMarker}-scheduledJob-youtube-schema`
      }
    });

    const createDataRegistry = _.get(dataRegResult, 'data.createDataRegistry');
    dataRegistryId = createDataRegistry.id;
    expect(dataRegistryId).toBeDefined();
    await createAndUpdateSchema(dataRegistryId);
  });

  it('find a test engine, schema, and source', async () => {
    // The isolated superadmin's org owns no engines of its own, and can't
    // see builds on other orgs' engines (even public ones) - so rather than
    // guessing at an already-deployed engine visible to this org, create and
    // deploy our own (cleaned up via engineIdsToDelete in afterAll).
    const engineCategory = await getEngineCategories();
    const categoryId = _.get(engineCategory, 'id');
    expect(categoryId).toBeDefined();

    const [
      testEngine,
      testRTEngine,
      clustersData,
      dataRegistries,
      source1,
      source2
    ] = await Promise.all([
      createEngine(categoryId),
      createEngine(categoryId, { engineMode: 'chunk' }),
      sdkClient.sdk.clusters({ type: ClusterType.Rt }),
      sdkClient.sdk.dataRegistries({
        id: dataRegistryId,
        schemaStatus: [SchemaStatus.Published]
      }),
      sdkClient.sdk.sources({
        sourceTypeId: '1',
        limit: 4,
        permission: SourcePermission.Owner
      }),
      sdkClient.sdk.sources({
        sourceTypeId: '17',
        limit: 4,
        permission: SourcePermission.Owner
      })
    ]);

    testEngineId = _.get(testEngine, 'id');
    expect(testEngineId).toBeDefined();
    engineIdsToDelete.push(testEngineId);
    testEngineCategoryId = _.get(testEngine, 'categoryId');
    expect(testEngineCategoryId).toBeDefined();

    testRealtimeEngineId = _.get(testRTEngine, 'id');
    expect(testRealtimeEngineId).toBeDefined();
    engineIdsToDelete.push(testRealtimeEngineId);

    await Promise.all([
      buildAndDeployEngine(testEngineId),
      buildAndDeployEngine(testRealtimeEngineId)
    ]);

    schemaId = _.get(
      dataRegistries,
      'data.dataRegistries.records[0].schemas.records[0].id'
    );
    expect(schemaId).toBeDefined();

    sourceId1 = _.get(source1, 'data.sources.records[0].id');
    if (!sourceId1) {
      const s1 = await sdkClient.sdk.createSource({
        input: {
          name: `${citestMarker}-sourceType-1`,
          sourceTypeId: '1'
        }
      });
      sourceId1 = _.get(s1, 'data.createSource.id');
      sourceIdShouldDelete1 = sourceId1;
    }
    expect(sourceId1).toBeDefined();
    sourceId2 = _.get(source2, 'data.sources.records[0].id');
    if (!sourceId2) {
      const s17 = await sdkClient.sdk.createSource({
        input: {
          name: `${citestMarker}-sourceType-17`,
          sourceTypeId: '17'
        }
      });
      sourceId2 = _.get(s17, 'data.createSource.id');
      sourceIdShouldDelete2 = sourceId2;
    }
    expect(sourceId2).toBeDefined();

    clusters = _.get(clustersData, 'data.clusters.records');
    expect(clusters).toBeDefined();

    // If we can't find default cluster then we probably need to start paging
    // For now we have a very small amount of clusters
    defaultCluster = _.find(clusters, 'default');
    expect(defaultCluster).toBeDefined();

    // Might not always have other clusters than default
    nonDefaultCluster = _.find(
      clusters,
      (cluster: any) => cluster.default === false
    );

    programFormat = _.get(
      source1,
      'data.sources.records[0].sourceType.programFormats[0]'
    );
    expect(programFormat).toBeDefined();
  });

  it('run scheduledJobs crontab query ', async () => {
    await sdkClient.sdk.scheduledJobs({ hasJobTemplate: true, isActive: true });
  });

  it('create a scheduled job', async () => {
    const result = await sdkClient.sdk.scheduledJobCreate({
      input: {
        name: `${testName}-job`,
        runMode: RunMode.Now,
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
            scheduledDay: DayOfWeek.Monday,
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
      }
    });
    // verify at least one response
    newScheduledJobId = _.get(result, 'data.createScheduledJob.id');
    expect(newScheduledJobId).toBeDefined();
    scheduledJobIds.push(newScheduledJobId);
    expect(
      _.get(
        result,
        'data.createScheduledJob.jobs.records[0].jobConfig.authData'
      )
    ).toBeDefined();
    expect(
      _.get(
        result,
        'data.createScheduledJob.jobs.records[0].jobConfig.authDataLaunch'
      )
    ).toBeDefined();
    const newJob = _.get(result, 'data.createScheduledJob.jobs.records[0]');

    expect(_.get(newJob, 'jobConfig.authDataLaunch')).toBeDefined();
    // expect(_.get(newJob, 'jobConfig.authData.applicationId')).toEqual(
    //   'GraphQL-CI-Test'
    // );
    expect(
      _.get(result, 'data.createScheduledJob.contentTemplates[0].data.url')
    ).toEqual('https://youtube.com/channel/123');
    expect(_.get(result, 'data.createScheduledJob.isPublic')).toEqual(false);
    expect(_.get(result, 'data.createScheduledJob.primarySourceId')).toEqual(
      sourceId1
    );
    /*
    expect(_.get(result, 'collaborators.records[0].organizationId')).toEqual(
      '14954'
    );
    expect(_.get(result, 'collaborators.records[0].permission')).toEqual(
      'viewer'
    );
    */
    expect(_.get(result, 'data.createScheduledJob.details.foo')).toEqual('bar');
    expect(
      _.get(result, 'data.createScheduledJob.details.programFormat')
    ).toEqual('Adult Contemporary');
    expect(_.get(result, 'data.createScheduledJob.details.isNational')).toEqual(
      true
    );
    expect(_.get(result, 'data.createScheduledJob.affiliates.count')).toEqual(
      0
    );
    tdoIdFromScheduledJob1 = getTdoIdFromScheduledJob(result);
  });

  it('update a scheduled job', async () => {
    const result = await sdkClient.sdk.scheduledJobUpdate({
      input: {
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
      }
    });

    // verify at least one response
    const updateScheduledJobData = _.get(result, 'data.updateScheduledJob');
    expect(_.get(updateScheduledJobData, 'id')).toEqual(newScheduledJobId);
    expect(_.get(updateScheduledJobData, 'isPublic')).toEqual(true);
    expect(_.get(updateScheduledJobData, 'jobPipelineIds')).toBeNull();
    // expect(_.get(updateScheduledJobData, 'collaborators.count')).toEqual(2);
    // expect(_.get(updateScheduledJobData, 'collaborators.records.length')).toEqual(2);
    expect(
      _.get(updateScheduledJobData, 'collaborators.records[0].organizationId')
    ).toBeDefined();
    // expect(
    //   _.get(updateScheduledJobData, 'collaborators.records[1].organizationId')
    // ).toBeDefined();
    expect(
      _.get(updateScheduledJobData, 'collaborators.records[0].permission')
    ).toBeDefined();
    // expect(_.get(updateScheduledJobData, 'collaborators.records[1].permission')).toBeDefined();
    expect(_.get(updateScheduledJobData, 'details.foo')).toEqual('bar');
    const programFormat = _.get(
      updateScheduledJobData,
      'details.programFormat'
    );
    expect(programFormat).toBeDefined();
    expect(_.get(updateScheduledJobData, 'primarySourceId')).toEqual(
      `${sourceId2}`
    );
    expect(_.get(updateScheduledJobData, 'details.isNational')).toEqual(false);
  });

  it('update a scheduled job again', async () => {
    const result = await sdkClient.sdk.scheduledJobUpdate({
      input: {
        id: newScheduledJobId
      }
    });

    // verify at least one response
    const scheduleJob = _.get(result, 'data.updateScheduledJob');
    expect(_.get(scheduleJob, 'id')).toEqual(newScheduledJobId);
    expect(_.get(scheduleJob, 'collaborators.count')).toEqual(1);
    expect(_.get(scheduleJob, 'collaborators.records.length')).toEqual(1);
    /*
    expect(
      _.get(
        scheduleJob, 'collaborators.records[0].organizationId'
      )
    ).toEqual('14954');
    expect(
      _.get(
        scheduleJob, 'collaborators.records[0].permission'
      )
    ).toEqual('editor');
    */
  });

  it('should not update a scheduled job misses/has invalid engineId', async () => {
    let result, error;
    result = sdkClient.sdk.scheduledJobUpdate({
      input: {
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
    });

    await expect(result).rejects.toThrow('Some engines were not found');
    await expect(result).rejects.toThrow('notfound_engine_id');
  });

  it('launch a scheduled job', async () => {
    const result = await sdkClient.sdk.scheduledJobLaunch({
      input: {
        scheduledJobId: newScheduledJobId
      }
    });

    // verify at least one job created
    const scheduledJob = _.get(result, 'data.launchScheduledJobs');
    expect(scheduledJob).toBeDefined();
    const jobId = _.get(scheduledJob, '[0].id');
    expect(_.get(scheduledJob, '[0].id')).toBeDefined();
    jobIds.push(jobId);

    // verify that target TDO was created
    expect(_.get(scheduledJob, '[0].target.id')).toBeDefined();
    // verify that a content template was applied
    expect(_.get(scheduledJob, '[0].target.assets.count')).toEqual(1);
    tdoIdFromLaunchScheduledJob1 = scheduledJob[0].target.id;
    expect(_.get(scheduledJob, '[0].target.thumbnailUrl')).toEqual(liveImage1);
    expect(_.get(scheduledJob, '[0].target.sourceData.scheduledJobId')).toEqual(
      newScheduledJobId
    );
    expect(_.get(scheduledJob, '[0].target.sourceData.sourceId')).toEqual(
      sourceId2
    );
    expect(_.get(scheduledJob, '[0].target.sourceImageUrl')).toEqual(
      liveImage2
    );
    expect(_.get(scheduledJob, '[0].scheduledJobId')).toEqual(
      newScheduledJobId
    );
    expect(_.get(scheduledJob, '[0].scheduledJob.id')).toEqual(
      newScheduledJobId
    );
  });

  it('launch a scheduled job without application header', async () => {
    const reqOptions = helpers.requestOptions(isolatedSuperadmin.token);
    const headers = _.omit(reqOptions.headers, ['X-Veritone-Application']);
    const result = await sdkClient.sdk.scheduledJobLaunch(
      {
        input: { scheduledJobId: newScheduledJobId }
      },
      headers
    );

    // verify at least one job created
    const job = _.get(result, 'data.launchScheduledJobs[0]');
    expect(job).toBeDefined();
    const jobId = _.get(job, 'id');
    expect(jobId).toBeTruthy();
    jobIds.push(jobId);
    tdoIdFromLaunchScheduledJob2 = _.get(
      result,
      'data.launchScheduledJobs[0].target.id'
    );
    expect(_.get(result, 'data.launchScheduledJobs[0].id')).toBeDefined();
    const jobConfig = _.get(result, 'data.launchScheduledJobs[0].jobConfig');
    expect(_.get(jobConfig, 'authDataLaunch')).toBeDefined();
    // it should get the applicationId from scheduled job

    // expect(_.get(jobConfig, 'authDataLaunch.applicationId')).toEqual(
    //   'GraphQL-CI-Test'
    // );
  });

  // Read path in newCreateJob extracted contentApplicationId from jobConfig.authData (the stale template) instead
  // of jobConfig.authDataLaunch (the freshly resolved launch-time value), leaving job_new.job.content_application_id NULL for scheduled-job launches.
  // This asserts the launch-time X-Veritone-Application header wins. The column is not accessible via gql schema so we read postgres directly.
  it('launch-time X-Veritone-Application populates content_application_id even when template has stored authData', async () => {
    const launchAppId = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'; // Developer app fixture

    const reqOptions = helpers.requestOptions(isolatedSuperadmin.token);
    reqOptions.headers['X-Veritone-Application'] = launchAppId;

    const result = await sdkClient.sdk.scheduledJobLaunch(
      {
        input: { scheduledJobId: newScheduledJobId }
      },
      getRequestHeaders(reqOptions)
    );

    const launchedJobId = _.get(result, 'data.launchScheduledJobs[0].id');
    expect(launchedJobId).toBeDefined();
    jobIds.push(launchedJobId);

    const dbValue = await getJobContentApplicationId(launchedJobId);
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
      sdkClient.sdk.scheduledJobs({ engineId: testEngineId, limit: 1 }),
      sdkClient.sdk.scheduledJobs({
        engineCategoryId: testEngineCategoryId,
        limit: 1
      }),
      sdkClient.sdk.scheduledJobs({
        engineType: EngineTypeFilter.Cognition,
        limit: 1
      }),
      sdkClient.sdk.scheduledJobs({
        hasJobTemplate: true,
        limit: 1,
        orderBy: [
          {
            field: ScheduledJobOrderField.CreatedDateTime,
            direction: OrderDirection.Desc
          }
        ]
      }),
      sdkClient.sdk.scheduledJobs({
        hasJobTemplate: false,
        limit: 1,
        orderBy: [
          {
            field: ScheduledJobOrderField.CreatedDateTime,
            direction: OrderDirection.Desc
          }
        ]
      }),
      sdkClient.sdk.scheduledJobs({
        hasRunningJobs: true,
        orderBy: [
          {
            field: ScheduledJobOrderField.CreatedDateTime,
            direction: OrderDirection.Desc
          }
        ],
        limit: 1
      }),
      sdkClient.sdk.jobs({
        status: [JobStatusFilter.Running, JobStatusFilter.Pending],
        limit: 1,
        dateTimeFilter: [
          {
            field: JobDateTimeField.CreatedDateTime,
            fromDateTime: moment().subtract(1, 'weeks').toISOString()
          }
        ]
      }),
      sdkClient.sdk.scheduledJobGetList({
        isActive: true,
        runMode: RunMode.Once,
        limit: 5,
        primarySourceId: [sourceId2, sourceId1],
        permission: ScheduledJobPermission.Owner,
        orderBy: [
          {
            field: ScheduledJobOrderField.StopDateTime,
            direction: OrderDirection.Asc
          }
        ]
      })
    ]);

    // verify at least one response
    const scheduledJobData = _.get(scheduledJobs, 'data.scheduledJobs');
    expect(_.get(scheduledJobData, 'records[0].id')).toBeDefined();
    scheduledJobId = _.get(scheduledJobData, 'records[0].id');
    expect(_.get(scheduledJobData, 'records[0].details')).toBeDefined();
    expect(_.get(scheduledJobData, 'records[0].parts')).toBeDefined();
    expect(_.get(scheduledJobData, 'records[0].permission')).toEqual('owner');

    const jobsData = _.get(jobs, 'data.jobs');
    expect(_.get(jobsData, 'count')).toEqual(1);
    // TODO query to jobs table is including nonexistent scheduled job IDs?
    // possibly from jobs run just before sj deleted or created with
    // bad sj IDs.
    //expect(_.get(result, 'byRunning.count')).toEqual(1);

    expect(_.get(byEngineId, 'data.scheduledJobs.count')).toEqual(1);
    expect(_.get(byEngineCategoryId, 'data.scheduledJobs.count')).toEqual(1);
    expect(_.get(byEngineType, 'data.scheduledJobs.count')).toEqual(1);
    expect(
      _.get(
        withTemplates,
        'data.scheduledJobs.records[0].allJobTemplates.count'
      )
    ).toEqual(1);
    expect(
      _.get(
        withoutTemplates,
        'data.scheduledJobs.records[0].allJobTemplates.count'
      )
    ).toEqual(0);
  });

  it('find a scheduled job', async () => {
    const queryResult = Promise.all([
      sdkClient.sdk.jobs({ id: newScheduledJobId, limit: 1 }),
      sdkClient.sdk.scheduledJobGetList({ id: 'foo' }),
      sdkClient.sdk.scheduledJobGetList({ id: newScheduledJobId }),
      sdkClient.sdk.scheduledJobGetList({ id: scheduledJobId })
    ]);

    await expect(queryResult).rejects.toThrow('not_found');
  });

  it('create rt scheduled jobs', async () => {
    let createClusterMutation = [
      sdkClient.sdk.scheduledJobCreate({
        input: {
          name: `${testName}-defaultCluster`,
          jobTemplates: [
            {
              clusterId: defaultCluster.id,
              taskTemplates: [{ engineId: testRealtimeEngineId }]
            }
          ]
        }
      })
    ];

    // Some env will not have a second cluster
    if (nonDefaultCluster) {
      createClusterMutation.push(
        sdkClient.sdk.scheduledJobCreate({
          input: {
            name: `${testName}-nonDefaultCluster`,
            jobTemplates: [
              {
                clusterId: nonDefaultCluster.id,
                taskTemplates: [{ engineId: testRealtimeEngineId }]
              }
            ]
          }
        })
      );
    }

    const result = await Promise.all(createClusterMutation);
    defaultClusterSJ = _.get(result, '[0].data.createScheduledJob');
    nonDefaultClusterSJ = _.get(result, '[1].data.createScheduledJob');

    expect(defaultClusterSJ).toBeDefined();
    scheduledJobIds.push(defaultClusterSJ.id);
    if (nonDefaultCluster) {
      expect(nonDefaultClusterSJ).toBeDefined();
      scheduledJobIds.push(nonDefaultClusterSJ.id);
    }
  });

  it('find scheduledJobs by clusterId', async () => {
    const [defaultClusterData, nonDefaultClusterData] = await Promise.all([
      sdkClient.sdk.scheduledJobGetList({
        clusterId: defaultCluster.id,
        orderBy: [
          {
            field: ScheduledJobOrderField.CreatedDateTime,
            direction: OrderDirection.Desc
          }
        ],
        limit: 1
      }),
      nonDefaultCluster
        ? sdkClient.sdk.scheduledJobGetList({
            clusterId: nonDefaultCluster.id,
            orderBy: [
              {
                field: ScheduledJobOrderField.CreatedDateTime,
                direction: OrderDirection.Desc
              }
            ],
            limit: 1
          })
        : null
    ]);
    const defaultClusterSJs = _.get(defaultClusterData, 'data.scheduledJobs');
    const nonDefaultClusterSJs = _.get(
      nonDefaultClusterData,
      'data.scheduledJobs'
    );

    expect(defaultClusterSJs).toBeDefined();
    expect(defaultClusterSJs.count).toEqual(1);
    if (nonDefaultCluster) {
      expect(nonDefaultClusterSJs).toBeDefined();
      expect(nonDefaultClusterSJs.count).toEqual(1);
    }
  });

  it('should update scheduled job - ingestionStatus', async () => {
    const result = await sdkClient.sdk.scheduledJobUpdate({
      input: {
        id: newScheduledJobId,
        // @ts-ignore
        ingestionStatus: 'METRICS_ONLY'
      }
    });

    const updateScheduledJob = _.get(result, 'data.updateScheduledJob');

    expect(updateScheduledJob).toBeDefined();
    expect(updateScheduledJob.id).toEqual(newScheduledJobId);
    expect(updateScheduledJob.ingestionStatusId).toEqual('4');
  });

  it('should update scheduled job - ingestionStatusId', async () => {
    const result = await sdkClient.sdk.scheduledJobUpdate({
      input: {
        id: newScheduledJobId,
        // @ts-ignore
        ingestionStatusId: '3'
      }
    });

    const updateScheduledJob = _.get(result, 'data.updateScheduledJob');

    expect(updateScheduledJob).toBeDefined();
    expect(updateScheduledJob.id).toEqual(newScheduledJobId);
    expect(updateScheduledJob.ingestionStatusId).toEqual('3');
  });

  it('should create and delete a schedule job via dag template ids', async () => {
    const sampleDagTemplate =
      '{"tasks": [  {    "engineId": "{{{firstEngineId}}}",    "payload": {      "url": "{{{UPLOAD_URL}}}"    },    "executionPreferences": {      {{#if priorityOfFirst}} "priority":{{minus priorityOfFirst 5}} {{/if}}    },    "ioFolders": [      {        "referenceId": "wsa-output",        "mode": "stream",        "type": "output"      }    ]  },  {    "engineId": "{{{secondEngineId}}}",    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "pb-input",        "mode": "stream",        "type": "input"      }    ]  },  {    "engineId": "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440",    "payload": {      "ffmpegTemplate": "video",      "customFFMPEGProperties": {        "chunkSizeInSeconds": {{#if chunkSizeInSeconds}} "{{{chunkSizeInSeconds}}}" {{else}} "300" {{/if}}      }    },    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "si-input",        "mode": "stream",        "type": "input"      },      {        "referenceId": "si-output",        "mode": "chunk",        "type": "output"      }    ]  },  {    "engineId": "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3",    "executionPreferences": {      {{#if priority}} "priority":{{{priority}}}, {{/if}}      "parentCompleteBeforeStarting": true    },    "ioFolders": [      {        "referenceId": "ow-input",        "mode": "chunk",        "type": "input"      }    ]  }],"routes": [  {    "parentIoFolderReferenceId": "wsa-output",    "childIoFolderReferenceId": "pb-input"  },  {    "parentIoFolderReferenceId": "wsa-output",    "childIoFolderReferenceId": "si-input"  },  {    "parentIoFolderReferenceId": "si-output",    "childIoFolderReferenceId": "ow-input"  }]}';

    const createTemplateResult = await sdkClient.sdk.createDagTemplate({
      input: {
        name: `${citestMarker} Webstream Speechmatics Reprocess Template`,
        description: 'English Transcription',
        tags: ['transcription'],
        dagTemplateLanguage: 'Handlebars',
        dag: sampleDagTemplate
      }
    });

    const createDagTemplate = _.get(
      createTemplateResult,
      'data.createDagTemplate'
    );
    expect(createDagTemplate).toBeDefined();
    expect(createDagTemplate.id).toBeDefined();
    dagTemplateId = createDagTemplate.id;

    const createResult = await sdkClient.sdk.createScheduledJob({
      input: {
        name: `${testName}-testdagtemplatejob`,
        dagTemplates: {
          dagTemplateIds: [createDagTemplate.id],
          params: { foo: 'bar' },
          jobConfig: { foo: 'bar' }
        }
      }
    });

    const createScheduledJob = _.get(createResult, 'data.createScheduledJob');

    expect(createScheduledJob).toBeDefined();
    expect(createScheduledJob.id).toBeDefined();
    scheduledJobIds.push(createScheduledJob.id);
    expect(createScheduledJob.jobTemplateIds).toBeDefined();
    expect(_.isArray(createScheduledJob.jobTemplateIds)).toBe(true);
    expect(createScheduledJob.jobTemplateIds.length).toBe(1);
    expect(createScheduledJob.jobTemplateIds[0]).toBeDefined();

    const deleteResult = await sdkClient.sdk.deleteScheduledJob({
      id: createScheduledJob.id
    });

    const deleteScheduledJob = _.get(deleteResult, 'data.deleteScheduledJob');

    expect(deleteScheduledJob).toBeDefined();
    expect(deleteScheduledJob.id).toBeDefined();
    expect(deleteScheduledJob.id).toEqual(createScheduledJob.id);
    _.pull(scheduledJobIds, createScheduledJob.id);

    const deleteDagTemplateResult = await sdkClient.sdk.deleteDagTemplate({
      id: createDagTemplate.id
    });

    const deleteDagTemplate = _.get(
      deleteDagTemplateResult,
      'data.deleteDagTemplate'
    );

    expect(deleteDagTemplate).toBeDefined();
    expect(deleteDagTemplate.id).toBeDefined();
    expect(deleteDagTemplate.id).toEqual(createDagTemplate.id);
    dagTemplateId = '';
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

    const scheduledJobPromise = sdkClient.sdk.createScheduledJob({
      input: {
        organizationId: applicationOrgId,
        name: `${testName}-job`,
        runMode: RunMode.Now,
        details: {
          programFormat: programFormat,
          foo: 'bar',
          isNational: true
        },
        isPublic: false
      }
    });

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
    adminOptions = await impersonate(
      userId,
      applicationOrgGUID,
      isolatedSuperadmin.token
    );
    // Create a test engine for the org
    try {
      // Use superadmin to add
      await sdkClient.sdk.addToEngineWhitelist({
        input: {
          organizationId: applicationOrgId,
          engineIds: [testEngineId]
        }
      });
    } catch (err) {
      expect(err).toBeUndefined();
    }

    const s1 = await sdkClient.sdk.createSource(
      {
        input: {
          sourceTypeId: '1',
          name: `${citestMarker}-sourceType-1`
        }
      },
      getRequestHeaders(adminOptions)
    );
    sourceId1test = _.get(s1, 'data.createSource.id');

    const result = await sdkClient.sdk.createScheduledJob(
      {
        input: {
          organizationId: applicationOrgId,
          name: `${testName}-job`,
          runMode: RunMode.Now,
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
              scheduledDay: DayOfWeek.Monday,
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
      },
      getRequestHeaders(adminOptions)
    );

    const scheduledJobId = _.get(result, 'data.createScheduledJob.id');
    expect(scheduledJobId).toBeDefined();
    scheduledJobIds.push(scheduledJobId);

    const resultDelete = await sdkClient.sdk.deleteScheduledJob(
      {
        id: scheduledJobId
      },
      getRequestHeaders(adminOptions)
    );

    expect(_.get(resultDelete, 'data.deleteScheduledJob.id')).toEqual(
      scheduledJobId
    );

    _.pull(scheduledJobIds, scheduledJobId);
    tdoIdFromScheduledJob2 = getTdoIdFromScheduledJob(result);
    await deleteTdos(
      _.compact([tdoIdFromScheduledJob2]),
      adminOptions
    );
  });

  it('throw error if any engineId in the jobTemplates is not active.', async () => {
    const engineCategory = await getEngineCategories();
    const categoryId = _.get(engineCategory, 'id');

    const testName = `${citestMarker}-engine-` + Date.now();
    const createEngineResp = await createEngine(categoryId);
    const engineId = createEngineResp.id;
    expect(engineId).toBeDefined();
    engineIdsToDelete.push(engineId);

    const resultJob = sdkClient.sdk.createScheduledJob({
      input: {
        name: `${testName}-job`,
        runMode: RunMode.Now,
        details: { programFormat: programFormat, foo: 'bar', isNational: true },
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
            scheduledDay: DayOfWeek.Monday,
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
    });

    await expect(resultJob).rejects.toThrow('Some engines are not active');

    const resultDelete = await sdkClient.sdk.deleteEngine({
      id: engineId
    });

    expect(_.get(resultDelete, 'data.deleteEngine.id')).toEqual(engineId);
    _.pull(engineIdsToDelete, engineId);
  });

  it('throw error if no engine IDs are found in templates', async () => {
    const testName = `${citestMarker}-engine-` + Date.now();
    const createJob = sdkClient.sdk.createScheduledJob({
      input: {
        name: `${testName}-job`,
        runMode: RunMode.Now,
        details: { programFormat: programFormat, foo: 'bar', isNational: true },
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
            scheduledDay: DayOfWeek.Monday,
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
    });

    await expect(createJob).rejects.toThrow(
      'No engine IDs were found in the provided templates.'
    );
  });

  it('delete a scheduled job', async () => {
    const [newScheduledJob, defaultRTSJ, nonDefaultRTSJ] = await Promise.all([
      sdkClient.sdk.deleteScheduledJob({ id: newScheduledJobId }),
      sdkClient.sdk.deleteScheduledJob({ id: defaultClusterSJ.id }),
      nonDefaultClusterSJ
        ? sdkClient.sdk.deleteScheduledJob({ id: nonDefaultClusterSJ.id })
        : null
    ]);
    expect(_.get(newScheduledJob, 'data.deleteScheduledJob.id')).toBeDefined();
    _.pull(scheduledJobIds, newScheduledJobId);
    expect(_.get(defaultRTSJ, 'data.deleteScheduledJob.id')).toBeDefined();
    _.pull(scheduledJobIds, defaultClusterSJ.id);
    if (nonDefaultRTSJ) {
      expect(_.get(nonDefaultRTSJ, 'data.deleteScheduledJob.id')).toBeDefined();
      _.pull(scheduledJobIds, nonDefaultClusterSJ.id);
    }
  });

  it('clear tdo from createScheduledJob', async () => {
    await deleteTdos(
      _.compact([
        tdoIdFromScheduledJob1,
        tdoIdFromLaunchScheduledJob1,
        tdoIdFromLaunchScheduledJob2
      ])
    );
  });

  async function createAndUpdateSchema(dataRegistryId: string) {
    const schemaCreateResult = await sdkClient.sdk.upsertSchemaDraft({
      input: {
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
    });

    let schemaResult = _.get(schemaCreateResult, 'data.upsertSchemaDraft');
    schemaId = schemaResult.id;
    expect(schemaId).toBeDefined();

    let schemaUpdateResult = await sdkClient.sdk.updateSchemaState({
      input: {
        id: schemaId,
        breakingChanges: false,
        status: SchemaStatus.Published
      }
    });

    let schemaUpdate = _.get(schemaUpdateResult, 'data.updateSchemaState');
    expect(schemaUpdate.id).toEqual(schemaId);
    expect(schemaUpdate.status).toEqual('published');
  }
});
async function getOrganization(name: string) {
  const resultOrg = await sdkClient.sdk.organizations({
    nameMatch: StringMatch.Exact,
    name: name,
    limit: 1
  });

  const applicationOrg = _.get(resultOrg, 'data.organizations.records[0]');
  return applicationOrg;
}

async function setupTestOrganization(input: {
  nameOrg: string;
  remainingBudget: number;
  isLimitEnforced: boolean;
}) {
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

  const name = input.nameOrg;
  const resultOrgRes = await sdkClient.sdk.createOrganization({
    input: {
      name: name,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: variables.kvp,
      applications: variables.apps,
      remainingBudget: input.remainingBudget,
      isLimitEnforced: input.isLimitEnforced
    }
  });

  const resultOrg = _.get(resultOrgRes, 'data.createOrganization');
  expect(resultOrg.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg.id).toBeDefined();
  expect(resultOrg.guid).toBeDefined();
  return await getOrganization(name);
}

async function getOrCreateOrganization(input: {
  nameOrg: string;
  remainingBudget: number;
  isLimitEnforced: boolean;
}) {
  const { nameOrg, remainingBudget, isLimitEnforced } = input;
  let applicationOrganization = await setupTestOrganization({
    nameOrg,
    remainingBudget,
    isLimitEnforced
  });

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

async function updateOrganization(input: {
  orgId: string;
  remainingBudget: number;
  isLimitEnforced: boolean;
}) {
  const resultOrg = await sdkClient.sdk.updateOrganization({
    input: {
      id: input.orgId,
      remainingBudget: input.remainingBudget,
      isLimitEnforced: input.isLimitEnforced
    }
  });

  return _.get(resultOrg, 'data.updateOrganization');
}

async function createUser(uniqueId: string, orgId: string) {
  const result = await sdkClient.sdk.createUser({
    input: {
      name: `${uniqueId}-admin-user-${uuid.v4()}@localhost`,
      organizationId: orgId,
      firstName: 'Flow-User',
      lastName: 'Admin',
      jsondata: { firstName: 'Flow-User', lastName: 'Admin' },
      roleIds: ROLES_IDS
    }
  });

  return _.get(result, 'data.createUser.id');
}
async function getOrCreateUser(applicationOrganization: any, uniqueId: string) {
  const users = _.get(applicationOrganization, 'users.records', []);
  const activeUsers = users.filter(
    (user: any) =>
      user.status === 'active' &&
      user.organizationGuids.length === 1 &&
      _.every(ROLES_IDS, (roleId: string) =>
        user.roles.some((role: any) => role.id === roleId)
      )
  );
  let userId;
  if (activeUsers.length === 0) {
    userId = await createUser(uniqueId, applicationOrganization.id);
  } else {
    const adminUser = _.find(activeUsers, (user: any) =>
      _.includes(user.name, 'admin')
    );
    userId = adminUser ? adminUser.id : users[0].id;
  }
  return userId;
}

async function impersonate(
  userId: string,
  applicationOrgGUID: string,
  token: string
) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function getEngineCategories() {
  const engineCategoryResp = await sdkClient.sdk.engineCategories({
    type: 'Cognition',
    name: 'Transcription',
    limit: 1
  });

  return _.get(engineCategoryResp, 'data.engineCategories.records[0]');
}

async function createEngine(categoryId: string, manifest?: any) {
  const testName = `${citestMarker}-engine-` + Date.now();
  const createEngineResp = await sdkClient.sdk.createEngine({
    input: {
      name: testName,
      categoryId: categoryId,
      deploymentModel: DeploymentModel.FullyNetworkIsolated,
      createsTDO: false,
      ...(manifest && { manifest })
    }
  });

  return _.get(createEngineResp, 'data.createEngine');
}

async function buildAndDeployEngine(engineId: string) {
  const engineBuildRes = await sdkClient.sdk.createEngineBuild({
    input: {
      engineId,
      taskRuntime: { nodeRed: true },
      manifest: { runtime: 'NodeRed' }
    }
  });
  const engineBuildId = _.get(engineBuildRes, 'data.createEngineBuild.id');
  expect(engineBuildId).toBeDefined();

  let build;
  for (const action of buildEngineActionList) {
    build = await sdkClient.sdk.updateEngineBuild({
      input: { id: engineBuildId, engineId, action }
    });
  }

  return _.get(build, 'data.updateEngineBuild');
}

function getTdoIdFromScheduledJob(scheduledJobResult: any) {
  return _.get(
    scheduledJobResult,
    'data.createScheduledJob.jobs.records[0].targetId'
  );
}
async function deleteTdos(tdoList: string[], options: any = {}) {
  for (let i = 0; i < tdoList.length; i++) {
    const resultScheduleJob = await processTDODeletion(
      sdkClient,
      tdoList[i],
      true,
      getRequestHeaders(options)
    );
    expect(_.get(resultScheduleJob, 'data.deleteTDO.id')).toEqual(tdoList[i]);
  }
}
