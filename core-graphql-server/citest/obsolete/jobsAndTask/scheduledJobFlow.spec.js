const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const clusterHelper = require('../../helpers/cluster');
const folderHelper = require('../../helpers/folder');
const schemaHelper = require('../../helpers/schema');
const jobHelper = require('../../helpers/job');
const engineHelper = require('../../helpers/engine');
const dataRegistryHelper = require('../../helpers/dataRegistry');
const dagTemplateHelper = require('../../helpers/dagTemplate');
const sdoHelper = require('../../helpers/sdo');
const sourceHelper = require('../../helpers/sourceHelper');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const { safe } = require('../../helpers/cleanup/utils');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
const env = config.env;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superToken, superOptions, superUserId, superOrgGuid, superOrgId;

const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

const buildEngineActionList = [
  ['submit', 'pending'],
  ['deploy', 'deployed']
];
const publicBuildEngineActionList = [
  ['submit', 'pending'],
  ['approve', 'approved'],
  ['deploy', 'deployed']
];

const sampleDagTemplate =
  '{\\"tasks\\": [\\n  {\\n    \\"engineId\\": \\"{{{firstEngineId}}}\\",\\n    \\"payload\\": {\\n      \\"url\\": \\"{{{UPLOAD_URL}}}\\"\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priorityOfFirst}} \\"priority\\":{{minus priorityOfFirst 5}} {{/if}}\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"wsa-output\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"{{{secondEngineId}}}\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"pb-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440\\",\\n    \\"payload\\": {\\n      \\"ffmpegTemplate\\": \\"video\\",\\n      \\"customFFMPEGProperties\\": {\\n        \\"chunkSizeInSeconds\\": {{#if chunkSizeInSeconds}} \\"{{{chunkSizeInSeconds}}}\\" {{else}} \\"300\\" {{/if}}\\n      }\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"si-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      },\\n      {\\n        \\"referenceId\\": \\"si-output\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"ow-input\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  }\\n],\\n\\"routes\\": [\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"pb-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"si-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"si-output\\",\\n    \\"childIoFolderReferenceId\\": \\"ow-input\\"\\n  }\\n]}';

describe('citest_jobs: Schedule job test flow', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superOptions = helpers.requestOptions(superToken);

    result = await userHelper.getMyInfo({
      gqlClient,
      options: superOptions
    });

    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');
  });

  describe.each([false, true])('Scheduled job', (isEnabledOlp) => {
    let testSetup;

    let testOrg, adminUser, regularUser, testUsers;
    let adminOptions, regularOptions;
    let createOrgAndUserInput, createSecondOrgAndUserInput;
    let testTdo;
    let testEngine, jobTemplate, engineBuildId, jobTemplateId;

    let testClusterIds = [];
    let testCluster,
      otherCluster,
      otherClusterId,
      otherOrgDagTemplateId,
      createDagTemplate,
      createDagTemplate2;
    const scheduledJobIdsToDelete = [];
    const engineIdsOrg1 = [];
    const testData = {
      clusterId: null,
      engineId: null,
      scheduledJobId: null,
      applicationId: null,
      jobId: null,
      jobFromTemplateId: null,
      rootFolderData: null,
      folder: null,
      rootFolderData2: null,
      folder2: null,
      jobWithIoFolder: null,
      jobWithBuild: null
    };

    describe(`Scheduled job test with isEnabledOlp = ${isEnabledOlp}`, () => {
      beforeAll(async () => {
        createOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // set up org 1
        testSetup = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createOrgAndUserInput
        );

        testOrg = testSetup.org;
        expect(testOrg).toBeDefined();
        expect(testOrg.name).toContain(`${citestMarker}-org`);
        expect(testOrg.users).toBeDefined();
        testUsers = _.get(testOrg, 'users.records');

        // Login for Admin user
        adminUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        adminOptions = adminUser.requestOptions;

        // Create test TDO for org 1
        testTdo = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-test-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );

        // Create engine for org 1
        const engineCreate = await engineHelper.helpCreateEngine(
          { gqlClient, options: adminOptions },
          {
            name: citestMarker + '-engine-' + uuid.v4(),
            categoryId: engineCategoryId,
            deploymentModel: 'FullyNetworkIsolated'
          }
        );
        testEngine = engineCreate.createEngine;
        engineIdsOrg1.push(testEngine.id);

        // Create test Cluster for org 1
        const clusters = await engineHelper.helpCreateCluster(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-test-cluster-${uuid.v4()}`,
            dockerCredentials: {},
            allowedEngines: [],
            status: 'active'
          }
        );
        testCluster = clusters.createCluster;
        testClusterIds.push(testCluster.id);

        // create dag template
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
        const createTemplateResult = await gqlClient.query(
          createDagTemplateQuery,
          {},
          adminOptions
        );
        createDagTemplate = _.get(createTemplateResult, 'createDagTemplate');
        expect(createDagTemplate).toBeDefined();
        expect(createDagTemplate.id).toBeDefined();

        // Login for Regular user
        regularUser = _.find(testSetup.listOptions, (user) => {
          return user.key === 'regularUser';
        });
        regularOptions = regularUser.requestOptions;

        createSecondOrgAndUserInput = getOrgAndUserInput(isEnabledOlp);

        // get dag template from other org
        const otherOrgDagTemplateResult =
          await dagTemplateHelper.helpGetDagTemplates(
            { gqlClient, options: superOptions },
            { limit: 1 }
          );

        otherOrgDagTemplateId = _.get(
          otherOrgDagTemplateResult,
          'records[0].id'
        );
      });

      it('Create ScheduledJob without name should fail', async () => {
        let scheduledJob = jobHelper.helpCreateScheduledJob(
          { gqlClient, options: adminOptions },
          {
            jobTemplates: {
              clusterId: testCluster.id,
              taskTemplates: { engineId: testEngine.id }
            }
          }
        );

        await expect(scheduledJob).rejects.toThrow(/name.* was not provided/);
      });
      describe('Create Schedule Job', () => {
        describe('Scheduled job with job template', () => {
          beforeAll(async () => {
            // create job template
            jobTemplate = await jobHelper.helpCreateJobTemplate(
              { gqlClient, options: adminOptions },
              { taskTemplates: [{ engineId: testEngine.id }] }
            );
          });

          it('Create schedule Job using not existed jobTemplateIds should fail', async () => {
            let scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplateIds: [999999999]
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using not active jobTemplateIds should fail', async () => {
            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplateIds: [jobTemplate.id]
              }
            );

            await expect(scheduledJobRes).rejects.toThrow(
              /engines are not active/
            );
          });

          it('Create schedule Job using valid jobTemplateIds should success', async () => {
            // build and deploy engine
            const build = await buildAndDeployEngine(
              testEngine.id,
              adminOptions
            );

            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplateIds: [jobTemplate.id]
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            testData.scheduledJobId = scheduledJobRes.id;
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          it('Get schedule job', async () => {
            const scheduledJob = await jobHelper.helpGetScheduledJobById(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            expect(scheduledJob).toBeDefined();
            expect(scheduledJob.id).toEqual(testData.scheduledJobId);
          });

          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
            _.pull(scheduledJobIdsToDelete, testData.scheduledJobId);
          });
        });

        describe('Schedule job with CreateJobTemplate option', () => {
          beforeAll(async () => {});

          // applicationId:
          /* Application ID. Used only by Veritone platform components.
            Other clients should not attempt to send this field. Any value sent will be ignored. */
          // it('Create schedule Job using not existed appId should fail', async () => {});
          // it('Create schedule Job using not have access appId should fail', async () => {});
          // it('Create schedule Job using org own appId success', async () => {});
          // it('Create schedule Job using public appId success', async () => {});

          // clusterId:
          it('Create schedule Job using not existed clusterId should fail', async () => {
            const scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [{ clusterId: uuid.v4() }]
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using inaccessible clusterId should fail', async () => {
            const otherClusterRes = await clusterHelper.helpGetClusters(
              { gqlClient, options: superOptions },
              { status: 'active', limit: 1 }
            );

            if (otherClusterRes.records.length) {
              otherCluster = otherClusterRes.records[0];
            } else {
              // create cluster by super admin
              const clusterCreateRes = await clusterHelper.helpCreateCluster(
                { gqlClient, options: superOptions },
                {
                  name: `${citestMarker}-test-cluster-${uuid.v4()}`,
                  dockerCredentials: {},
                  allowedEngines: [],
                  status: 'active'
                }
              );

              otherCluster = clusterCreateRes;
              otherClusterId = otherCluster.id;
            }
            const scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: { clusterId: otherCluster.id }
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using valid clusterId success', async () => {
            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          // invalid routes:
          xit('Create schedule Job using not existed parentIoFolderReferenceId should fail', async () => {
            const randomId = uuid.v4();
            const scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    routes: [{ parentIoFolderReferenceId: randomId }],
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: randomId,
                            mode: 'chunk',
                            type: 'input'
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });
          xit('Create schedule Job using not existed childIoFolderReferenceId should fail', async () => {
            const randomId = uuid.v4();
            const scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    routes: [{ childIoFolderReferenceId: randomId }],
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: randomId,
                            mode: 'chunk',
                            type: 'input'
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });
          xit('Create schedule Job using inaccessible folderId should fail', async () => {
            const otherOrgFolder = await folderHelper.helpGetRootFolders(
              { gqlClient, options: superOptions },
              'cms',
              {
                limit: 1,
                offset: 0,
                orderBy: [
                  { field: 'createdDateTime', direction: 'desc' },
                  { field: 'name', direction: 'asc' }
                ]
              }
            );

            const folderId = otherOrgFolder[0].childFolders.records[0].id;

            const scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    routes: { parentIoFolderReferenceId: folderId },
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: folderId,
                            mode: 'chunk',
                            type: 'input'
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });

          it('Create schedule Job using valid folderId should success', async () => {
            const createRootFolders = await folderHelper.helpCreateRootFolder(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-root-folder-${uuid.v4()}`,
                rootFolderType: 'cms'
              }
            );
            const rootFolderId = createRootFolders[0].id;

            const newFolder = await folderHelper.helpCreateFolder(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-child-folder-${uuid.v4()}`,
                description: 'test',
                parentId: rootFolderId,
                rootFolderType: 'cms'
              }
            );
            const folderId = newFolder.id;
            testData.folder = newFolder;

            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    routes: { parentIoFolderReferenceId: folderId },
                    taskTemplates: [
                      {
                        engineId: testEngine.id,
                        ioFolders: [
                          {
                            referenceId: folderId,
                            mode: 'chunk',
                            type: 'input'
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          // taskTemplates:
          it('Create schedule Job using invalid taskTemplates input should fail', async () => {
            // create scheduled job with random engine id
            const scheduledJob = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: uuid.v4() }]
                }
              }
            );

            await expect(scheduledJob).rejects.toThrow(/not found/);
          });

          it('Create schedule Job using valid taskTemplates should success', async () => {
            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: [
                  {
                    clusterId: testCluster.id,
                    taskTemplates: [{ engineId: testEngine.id }]
                  }
                ]
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
            testData.scheduledJobId = scheduledJobRes.id;
            testData.jobTemplateId = scheduledJobRes.jobTemplateIds[0];
          });

          //         new job template is created
          it('new job template is created and associate with created job', async () => {
            const jobTemplateRes = await jobHelper.helpGetJobTemplateById(
              { gqlClient, options: adminOptions },
              { jobTemplateId: testData.jobTemplateId }
            );
            expect(jobTemplateRes).toBeDefined();
            expect(jobTemplateRes.id).toEqual(testData.jobTemplateId);
          });

          // new job template is associate with created job
          it('new job template is associate with created job', async () => {
            const scheduleJob = await jobHelper.helpGetScheduledJobById(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            expect(scheduleJob).toBeDefined();
            expect(scheduleJob.id).toEqual(testData.scheduledJobId);
            const listJobTemplateIds = _.get(
              scheduleJob,
              'allJobTemplates.records',
              []
            ).map((r) => r.id);
            expect(listJobTemplateIds).toContain(testData.jobTemplateId);
          });

          // revert ScheduledJob success
          it('revert ScheduledJob success', async () => {
            try {
              let revertScheduledJob = await jobHelper.helpRevertScheduledJob(
                { gqlClient, options: adminOptions },
                { scheduledJobId: testData.scheduledJobId }
              );
              expect(revertScheduledJob).toBeDefined();
              expect(revertScheduledJob.id).toEqual(testData.scheduledJobId);
            } catch (error) {
              expect(error.message).toContain(
                'This scheduled job is already a legacy schedule job'
              );
            }
          });

          // deleteScheduledJob success
          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
            _.pull(scheduledJobIdsToDelete, testData.scheduledJobId);
          });
        });

        describe('Schedule job with ScheduledJobDagTemplateConfig', () => {
          it('Create schedule Job using not existed dagTemplateIds should fail', async () => {
            const createResult = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-job-${uuid.v4()}`,
                dagTemplates: {
                  dagTemplateIds: [uuid.v4()],
                  params: { foo: 'bar' },
                  jobConfig: { foo: 'bar' }
                }
              }
            );

            await expect(createResult).rejects.toThrow(/not_found/);
          });

          xit('Create schedule Job using inaccessible dagTemplateIds should fail', async () => {
            const createResult = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-job-${uuid.v4()}`,
                dagTemplates: {
                  dagTemplateIds: [otherOrgDagTemplateId],
                  params: { foo: 'bar' },
                  jobConfig: { foo: 'bar' }
                }
              }
            );
            await expect(createResult).rejects.toThrow(/not_found/);
          });

          it('Create schedule Job using valid dag template should success', async () => {
            const createResult = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-job-${uuid.v4()}`,
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

            testData.scheduledJobId = createScheduledJob.id;
            testData.dagTemplateId = createDagTemplate.id;
            scheduledJobIdsToDelete.push(createScheduledJob.id);
          });

          it('deleteScheduledJob success', async () => {
            const deleteResult = await jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            const deleteScheduledJob = deleteResult;
            _.pull(scheduledJobIdsToDelete, testData.scheduledJobId);
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);

            const deleteDagTemplateResult =
              await dagTemplateHelper.helpDeleteDagTemplate(
                { gqlClient, options: adminOptions },
                { id: testData.dagTemplateId }
              );

            const deleteDagTemplate = deleteDagTemplateResult;

            expect(deleteDagTemplate).toBeDefined();
            expect(deleteDagTemplate.id).toBeDefined();
            expect(deleteDagTemplate.id).toEqual(testData.dagTemplateId);
          });
        });

        describe('Schedule job with detailsSchemaId', () => {
          beforeAll(async () => {
            // create data registry
            const dataRegistryRes =
              await dataRegistryHelper.helpCreateDataRegistry(
                { gqlClient, options: adminOptions },
                {
                  source: `${citestMarker}-data-registry-${uuid.v4()}`,
                  name: `${citestMarker} Youtube Source Schema ${Date.now().valueOf()}`,
                  description: `${citestMarker}_scheduledJob-youtube-schema`
                }
              );

            const dataRegistryResData = _.get(
              dataRegistryRes,
              'createDataRegistry'
            );
            expect(dataRegistryResData).toBeDefined();
            expect(dataRegistryResData.id).toBeDefined();
            testData.dataRegistryId = dataRegistryResData.id;

            // create schema
            const testSchemaInput = {
              $id: 'http://example.com/example.json',
              type: 'object',
              definitions: {},
              $schema: 'http://json-schema.org/draft-07/schema#',
              properties: {
                name: {
                  type: 'string',
                  title: 'Name'
                },
                phone: {
                  type: 'string',
                  title: 'Phone'
                }
              }
            };

            const schemaCreateRes = await schemaHelper.helpUpsertSchemaDraft(
              { gqlClient, options: adminOptions },
              {
                dataRegistryId: testData.dataRegistryId,
                schema: testSchemaInput
              }
            );
            const schemaData = _.get(schemaCreateRes, 'upsertSchemaDraft');
            expect(schemaData).toBeDefined();
            expect(schemaData.id).toBeDefined();
            testData.schemaId = schemaData.id;

            await schemaHelper.helpPublishSchema(
              { gqlClient, options: adminOptions },
              { id: testData.schemaId }
            );
          });

          xit('Create schedule job using not existed schema should fail', async () => {
            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                detailsSchemaId: uuid.v4(),
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );
            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          xit('Create schedule job using inaccessible schema should fail', async () => {
            const privateSchemaRes = await schemaHelper.helpGetSchemas(
              { gqlClient, options: superOptions },
              { limit: 1, status: ['published'], accessScope: ['owned'] }
            );

            const privateSchemaId = _.get(
              privateSchemaRes,
              'records[0].id',
              null
            );
            expect(privateSchemaId).toBeDefined();

            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                detailsSchemaId: privateSchemaId,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );
            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          it('Create schedule job using public schema should success', async () => {
            const publicSchemaRes = await schemaHelper.helpGetSchemas(
              { gqlClient, options: superOptions },
              { limit: 1, status: ['published'], accessScope: ['public'] }
            );

            const publicSchemaId = _.get(
              publicSchemaRes,
              'records[0].id',
              null
            );
            expect(publicSchemaId).toBeDefined();

            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                detailsSchemaId: publicSchemaId,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          it('Create schedule job using owned schema should success', async () => {
            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                detailsSchemaId: testData.schemaId,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            testData.scheduledJobId = scheduledJobRes.id;
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            _.pull(scheduledJobIdsToDelete, testData.scheduledJobId);
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
          });
        });

        describe('Schedule job with contentTemplates', () => {
          it('Create schedule job using contentTemplates with invalid schemaId should fail', async () => {
            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: { engineId: testEngine.id }
                },
                contentTemplates: [
                  {
                    schemaId: uuid.v4(),
                    data: {
                      url: 'https://youtube.com/channel/123',
                      youtubeChannelUrl: 'https://youtube.com/channel/123',
                      liveTimezone: 'PST'
                    }
                  }
                ]
              }
            );
            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });
          it('Create schedule job using contentTemplates with valid schema ID success', async () => {
            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: { engineId: testEngine.id }
                },
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    data: {
                      url: 'https://youtube.com/channel/123',
                      youtubeChannelUrl: 'https://youtube.com/channel/123',
                      liveTimezone: 'PST'
                    }
                  }
                ]
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            // testData.scheduledJobId = scheduledJobRes.id;
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          it('Create schedule job using contentTemplates with invalid sdo ID should fail', async () => {
            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: { engineId: testEngine.id }
                },
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    sdoId: uuid.v4()
                  }
                ]
              }
            );
            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          it('Create schedule job using contentTemplates with valid sdo and schema should success', async () => {
            // create sdo
            const sdoCreateRes = await sdoHelper.helpCreateStructuredData(
              { gqlClient, options: adminOptions },
              {
                schemaId: testData.schemaId,
                data: { foo: 'bar' }
              }
            );

            const sdoData = _.get(sdoCreateRes, 'createStructuredData');
            testData.sdoId = sdoData.id;

            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: { engineId: testEngine.id }
                },
                contentTemplates: [
                  {
                    schemaId: testData.schemaId,
                    sdoId: sdoData.id
                  }
                ]
              }
            );
            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            testData.scheduledJobId = scheduledJobRes.id;
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          it('new content template is auto created', async () => {
            // const scheduledJob = await jobHelper.helpGetScheduledJobById(
          });

          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            expect(deleteScheduledJob).toBeDefined();
            _.pull(scheduledJobIdsToDelete, testData.scheduledJobId);
          });
        });

        describe('Schedule job with CreateProgramAffiliate', () => {
          it('Create source should success', async () => {
            let createSourceResult = await sourceHelper.helpCreateSource(
              { gqlClient, options: adminOptions },
              {
                sourceTypeId: 1,
                name: `${citestMarker}_source_${uuid.v4()}`,
                isPublic: false
              }
            );
            expect(createSourceResult).toBeDefined();
            expect(createSourceResult.id).toBeDefined();
            testData.sourceId = createSourceResult.id;
          });

          it('Create schedule job using not valid source should fail', async () => {
            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                affiliates: [
                  {
                    sourceId: uuid.v4(),
                    scheduledDay: 'Monday',
                    startDateTime: '2025-02-04T10:30:00.123456Z',
                    stopDateTime: '2025-02-04T10:30:00.123456Z',
                    startTime: '10:30:00',
                    stopTime: '11:30:00'
                  }
                ],
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );
            await expect(scheduledJobRes).rejects.toThrow(/not_found/);
          });

          it('Create schedule job using invalid CreateProgramAffiliate should fail', async () => {
            const scheduledJobRes = jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                affiliates: [
                  {
                    sourceId: testData.sourceId,
                    scheduledDay: 'Monday',
                    startDateTime: '2025-02-04T10:30:00.123456Z',
                    stopDateTime: '2025-02-04T10:30:00.123456Z',
                    startTime: '10:30:00',
                    stopTime: '11:30:00xxxx'
                  }
                ],
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );
            await expect(scheduledJobRes).rejects.toThrow(
              /Invalid format for Time field/
            );
          });

          it('Create schedule job using valid CreateProgramAffiliate should success', async () => {
            const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
              { gqlClient, options: adminOptions },
              {
                name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
                affiliates: [
                  {
                    sourceId: testData.sourceId,
                    scheduledDay: 'Monday',
                    startDateTime: '2025-02-04T10:30:00.123456Z',
                    stopDateTime: '2025-02-04T10:30:00.123456Z',
                    startTime: '10:30:00',
                    stopTime: '11:30:00'
                  }
                ],
                jobTemplates: {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              }
            );

            expect(scheduledJobRes).toBeDefined();
            expect(scheduledJobRes.id).toBeDefined();
            testData.scheduledJobId = scheduledJobRes.id;
            scheduledJobIdsToDelete.push(scheduledJobRes.id);
          });

          // deleteScheduledJob success
          it('deleteScheduledJob success', async () => {
            let deleteScheduledJob = await jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testData.scheduledJobId }
            );
            expect(deleteScheduledJob).toBeDefined();
            expect(deleteScheduledJob.id).toEqual(testData.scheduledJobId);
            _.pull(scheduledJobIdsToDelete, testData.scheduledJobId);
          });
        });
      });

      describe('Update Schedule Job', () => {
        beforeAll(async () => {
          // create scheduled job
          const scheduledJobRes = await jobHelper.helpCreateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [{ engineId: testEngine.id }]
              }
            }
          );

          expect(scheduledJobRes).toBeDefined();
          expect(scheduledJobRes.id).toBeDefined();
          testData.scheduledJobId = scheduledJobRes.id;
          scheduledJobIdsToDelete.push(scheduledJobRes.id);
        });

        it('update scheduledJob weeklyScheduleParts should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              weeklyScheduleParts: [
                {
                  scheduledDay: 'Monday',
                  startTime: '09:00:00-08:00',
                  stopTime: '10:30-08:00'
                }
              ]
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob recurringScheduleParts should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              recurringScheduleParts: [
                {
                  repeatIntervalUnit: 'Days',
                  repeatInterval: 1,
                  durationSeconds: 10,
                  startTime: '09:00:00-08:00'
                }
              ]
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob name, description, runMode should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              name: `${citestMarker}-updated-scheduled-job-${uuid.v4()}`,
              description: 'updated description',
              runMode: 'Recurring'
            }
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
          expect(updatedScheduledJob.name).toContain(
            `${citestMarker}-updated-scheduled-job-`
          );
          expect(updatedScheduledJob.description).toEqual(
            'updated description'
          );
        });

        it('update scheduledJob isActive, isPublic  should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              isActive: true,
              isPublic: false
            }
          );
          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
          expect(updatedScheduledJob.isActive).toEqual(true);
          expect(updatedScheduledJob.isPublic).toEqual(false);
        });

        it('Other org query public scheduledJob should success', async () => {
          const scheduledJob = await jobHelper.helpGetScheduledJobs(
            { gqlClient, options: adminOptions },
            { isActive: true, limit: 1 }
          );
          expect(scheduledJob).toBeDefined();
          const records = _.get(scheduledJob, 'records', []);
          expect(records.length).toEqual(1);
        });

        xit('update scheduledJob using invalid startDateTime, stopDateTime should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              startDateTime: 'A2020-12-31T21:07:14-05:00ZZZ0Z',
              stopDateTime: '2019-12-31T21:07:14-05:00ZZZ0'
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/aaa/);
        });

        it('update scheduledJob using valid startDateTime, stopDateTime should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              startDateTime: '2020-12-31T21:07:14-05:00',
              stopDateTime: '2021-12-31T21:07:14-05:00'
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update schedule Job jobTemplateIds using invalid jobtemplateId should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplateIds: [uuid.v4()]
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(
            /No engine IDs were found/
          );
        });

        it('update schedule Job jobTemplateIds using valid jobtemplateId should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplateIds: [jobTemplate.id]
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
          expect(updatedScheduledJob.jobTemplateIds).toContain(jobTemplate.id);
        });

        // update scheduleJob jobTemplates using applicationId:
        // it('update scheduleJob jobTemplates using not exited appId should fail', async () => {});
        // it('update scheduleJob jobTemplates using inaccessible appId should fail', async () => {});
        // it('update scheduleJob jobTemplates using public appID should success', async () => {});
        // it('update scheduleJob jobTemplates using owned appID should success', async () => {});

        // update scheduleJob jobTemplates using clusterId:
        it('update scheduleJob jobTemplates using not exited clusterId should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: uuid.v4(),
                taskTemplates: [{ engineId: testEngine.id }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        it('update scheduleJob jobTemplates using inaccessible clusterId should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: otherCluster.id,
                taskTemplates: [{ engineId: testEngine.id }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        it('update scheduleJob jobTemplates using accessible clusterId should success', async () => {
          const clusters = await engineHelper.helpCreateCluster(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-test-cluster-${uuid.v4()}`,
              dockerCredentials: {},
              allowedEngines: [],
              status: 'active'
            }
          );

          const newCluster = clusters.createCluster;
          testClusterIds.push(newCluster.id);

          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: newCluster.id,
                taskTemplates: [{ engineId: testEngine.id }]
              }
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        // update scheduleJob jobTemplates using routes:
        it('update scheduleJob jobTemplates using not match parentIoFolderReferenceId should fail', async () => {
          const randomId = uuid.v4();
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [
                  {
                    engineId: testEngine.id,
                    ioFolders: [
                      { referenceId: randomId, mode: 'chunk', type: 'input' }
                    ]
                  }
                ],
                routes: [{ parentIoFolderReferenceId: testData.folder.id }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        xit('update scheduleJob jobTemplates using not existed parentIoFolderReferenceId should fail', async () => {
          const randomId = uuid.v4();
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [
                  {
                    engineId: testEngine.id,
                    ioFolders: [
                      { referenceId: randomId, mode: 'chunk', type: 'input' }
                    ]
                  }
                ],
                routes: [{ parentIoFolderReferenceId: randomId }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        xit('update scheduleJob jobTemplates using not existed childIoFolderReferenceId should fail', async () => {
          const randomId = uuid.v4();
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [
                  {
                    engineId: testEngine.id,
                    ioFolders: [
                      { referenceId: randomId, mode: 'chunk', type: 'input' }
                    ]
                  }
                ],
                routes: [{ childIoFolderReferenceId: randomId }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        xit('update scheduleJob jobTemplates using inaccessible FolderReferenceId should fail', async () => {
          const otherOrgFolder = await folderHelper.helpGetRootFolders(
            { gqlClient, options: superOptions },
            'cms',
            {
              limit: 1,
              offset: 0,
              orderBy: [
                { field: 'createdDateTime', direction: 'desc' },
                { field: 'name', direction: 'asc' }
              ]
            }
          );

          const folderId = _.get(
            otherOrgFolder,
            '[0].childFolders.records[0].id'
          );

          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [
                  {
                    engineId: testEngine.id,
                    ioFolders: [
                      {
                        referenceId: folderId,
                        mode: 'chunk',
                        type: 'input'
                      }
                    ]
                  }
                ],
                routes: [{ parentIoFolderReferenceId: folderId }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not found/);
        });

        it('update scheduleJob jobTemplates using valid parentIoFolderReferenceId, childIoFolderReferenceId should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [
                  {
                    engineId: testEngine.id,
                    ioFolders: [
                      {
                        referenceId: testData.folder.id,
                        mode: 'chunk',
                        type: 'input'
                      }
                    ]
                  }
                ],
                routes: [{ parentIoFolderReferenceId: testData.folder.id }]
              }
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduleJob jobTemplates using invalid taskTemplates should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [{ engineId: uuid.v4() }]
              }
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(
            /engines were not found/
          );
        });

        it('new jobTemplates is created after update success', async () => {
          const scheduledJob = await jobHelper.helpGetScheduledJobById(
            { gqlClient, options: adminOptions },
            { scheduledJobId: testData.scheduledJobId }
          );

          expect(scheduledJob).toBeDefined();
          const jobTemplateId = _.get(
            scheduledJob,
            'allJobTemplates.records[0].id'
          );

          const updateScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              jobTemplates: {
                clusterId: testCluster.id,
                taskTemplates: [{ engineId: testEngine.id }]
              }
            }
          );

          expect(scheduledJob).toBeDefined();
          expect(scheduledJob.id).toEqual(testData.scheduledJobId);
          const newJobTemplateIds = _.get(
            updateScheduledJob,
            'allJobTemplates.records[0].id'
          );
          expect(newJobTemplateIds).not.toEqual(jobTemplateId);
        });

        it('update scheduledJob dagTemplates using not existed dagTemplateIds should fail', async () => {
          const createResult = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              dagTemplates: {
                dagTemplateIds: [uuid.v4()],
                params: { foo: 'bar' },
                jobConfig: { foo: 'bar' }
              }
              // name: `${citestMarker}-job-${uuid.v4()}`,
              // dagTemplates: {
              //   dagTemplateIds: [uuid.v4()],
              //   params: { foo: 'bar' },
              //   jobConfig: { foo: 'bar' }
              // }
            }
          );

          await expect(createResult).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob dagTemplates using inaccessible dagTemplateIds should fail', async () => {
          const createResult = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              dagTemplates: {
                dagTemplateIds: [otherOrgDagTemplateId],
                params: { foo: 'bar' },
                jobConfig: { foo: 'bar' }
              }
            }
          );
          await expect(createResult).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob dagTemplates using valid dagTemplateIds should success', async () => {
          // create dag template
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
          const createTemplateResult = await gqlClient.query(
            createDagTemplateQuery,
            {},
            adminOptions
          );
          const dagTemplate = _.get(createTemplateResult, 'createDagTemplate');
          createDagTemplate2 = dagTemplate;

          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              dagTemplates: {
                dagTemplateIds: [dagTemplate.id],
                params: { foo: 'bar' },
                jobConfig: { foo: 'bar' }
              }
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        xit('update scheduledJob detailsSchemaId using not existed schema should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              detailsSchemaId: uuid.v4()
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        xit('update scheduledJob detailsSchemaId using inaccessible schema should fail', async () => {
          const privateSchemaRes = await schemaHelper.helpGetSchemas(
            { gqlClient },
            { limit: 1, accessScope: ['owned'] }
          );

          const privateSchemaId = _.get(
            privateSchemaRes,
            'records[0].id',
            null
          );
          expect(privateSchemaId).toBeDefined();

          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              detailsSchemaId: privateSchemaId
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob detailsSchemaId using valid schema should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              detailsSchemaId: testData.schemaId
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob contentTemplates using invalid schemaId should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              contentTemplates: [
                {
                  schemaId: uuid.v4(),
                  data: {
                    url: 'https://youtube.com/channel/123',
                    youtubeChannelUrl: 'https://youtube.com/channel/123',
                    liveTimezone: 'PST'
                  }
                }
              ]
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob contentTemplates using valid schemaId should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              contentTemplates: [
                {
                  schemaId: testData.schemaId,
                  data: {
                    url: 'https://youtube.com/channel/456',
                    youtubeChannelUrl: 'https://youtube.com/channel/456',
                    liveTimezone: 'PST'
                  }
                }
              ]
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });

        it('update scheduledJob contentTemplates using invalid sdoId should fail', async () => {
          const updatedScheduledJob = jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              contentTemplates: [
                {
                  schemaId: testData.schemaId,
                  sdoId: uuid.v4()
                }
              ]
            }
          );

          await expect(updatedScheduledJob).rejects.toThrow(/not_found/);
        });

        it('update scheduledJob contentTemplates using valid schemaId, sdo should success', async () => {
          const updatedScheduledJob = await jobHelper.helpUpdateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              id: testData.scheduledJobId,
              contentTemplates: [
                {
                  schemaId: testData.schemaId,
                  sdoId: testData.sdoId
                }
              ]
            }
          );

          expect(updatedScheduledJob).toBeDefined();
          expect(updatedScheduledJob.id).toEqual(testData.scheduledJobId);
        });
      });

      describe('Clone, revert, delete schedule job', () => {
        let testScheduledJobId;
        beforeAll(async () => {
          // create scheduled job
          const newScheduledJobRes = await jobHelper.helpCreateScheduledJob(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-scheduled-job-${uuid.v4()}`,
              jobTemplates: [
                {
                  clusterId: testCluster.id,
                  taskTemplates: [{ engineId: testEngine.id }]
                }
              ]
            }
          );
          expect(newScheduledJobRes).toBeDefined();
          expect(newScheduledJobRes.id).toBeDefined();
          testScheduledJobId = newScheduledJobRes.id;
          scheduledJobIdsToDelete.push(testScheduledJobId);
        });

        it('Clone not existed ScheduledJob should fail', async () => {
          let cloneScheduledJob = jobHelper.helpCloneScheduledJob(
            { gqlClient, options: adminOptions },
            { scheduledJobId: 999999999 }
          );
          await expect(cloneScheduledJob).rejects.toThrow(/not found/);
        });

        it('Delete not existed ScheduledJob should fail', async () => {
          let deleteScheduledJob = jobHelper.helpDeleteScheduledJob(
            { gqlClient, options: adminOptions },
            { scheduledJobId: 999999999 }
          );
          await expect(deleteScheduledJob).rejects.toThrow(/not found/);
        });

        it('Revert not existed ScheduledJob should fail', async () => {
          let revertScheduledJob = jobHelper.helpRevertScheduledJob(
            { gqlClient, options: adminOptions },
            { scheduledJobId: 999999999 }
          );
          await expect(revertScheduledJob).rejects.toThrow(/not found/);
        });

        // Clone schedule job with orgId Used only by Veritone platform components.
        // Other clients should not attempt to send this field. Any value sent will be ignored.
        //it('Clone ScheduledJob for non existed org should fail', async () => {});
        //it('Clone ScheduledJob for existed org, current org should success', async () => {});

        // unskip after clone scheduled job fixed (VE-20064)
        xit('Clone ScheduledJob success', async () => {
          const clonedScheduledJob = await jobHelper.helpCloneScheduledJob(
            { gqlClient, options: adminOptions },
            { scheduledJobId: testScheduledJobId }
          );

          expect(clonedScheduledJob).toBeDefined();
          expect(clonedScheduledJob.id).toBeDefined();
        });

        it('Get ScheduledJob success', async () => {
          const scheduledJob = await jobHelper.helpGetScheduledJobs(
            { gqlClient, options: adminOptions },
            { scheduledJobId: testScheduledJobId }
          );
          expect(scheduledJob).toBeDefined();
        });

        it('revert ScheduledJob success', async () => {
          try {
            const revertedScheduledJob = await jobHelper.helpRevertScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId: testScheduledJobId }
            );
            expect(revertedScheduledJob).toBeDefined();
            expect(revertedScheduledJob.id).toEqual(testScheduledJobId);
          } catch (error) {
            expect(error.message).toContain(
              'This scheduled job is already a legacy schedule job'
            );
          }
        });

        it('deleteScheduledJob success', async () => {
          let deleteScheduledJob = await jobHelper.helpDeleteScheduledJob(
            { gqlClient, options: adminOptions },
            { scheduledJobId: testScheduledJobId }
          );
          expect(deleteScheduledJob).toBeDefined();
          expect(deleteScheduledJob.id).toEqual(testScheduledJobId);
          _.pull(scheduledJobIdsToDelete, testScheduledJobId);
        });
      });

      afterAll(async () => {
        for (const scheduledJobId of _.uniq(
          _.compact(scheduledJobIdsToDelete)
        )) {
          await safe(`delete scheduled job ${scheduledJobId}`, async () =>
            jobHelper.helpDeleteScheduledJob(
              { gqlClient, options: adminOptions },
              { scheduledJobId }
            )
          );
        }

        // delete all created engines
        if (engineIdsOrg1.length > 0) {
          for (let engineId of engineIdsOrg1) {
            await safe(`delete engine ${engineId}`, async () =>
              engineHelper.helpDeleteEngine(
                { gqlClient, options: adminOptions },
                { id: engineId }
              )
            );
          }
        }

        // delete tdo
        if (testTdo) {
          await safe(`delete tdo ${testTdo.id}`, async () =>
            tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOptions },
              { id: testTdo.id }
            )
          );
        }

        // delete source
        if (testData.sourceId) {
          await safe(`delete source ${testData.sourceId}`, async () =>
            sourceHelper.helpDeleteSource(
              { gqlClient, options: adminOptions },
              testData.sourceId
            )
          );
        }

        // delete sdo
        if (testData.sdoId) {
          await safe(`delete sdo ${testData.sdoId}`, async () =>
            sdoHelper.helpDeleteStructuredData(
              { gqlClient, options: adminOptions },
              { id: testData.sdoId, schemaId: testData.schemaId }
            )
          );
        }

        // delete schema
        if (testData.schemaId) {
          await safe(`delete schema ${testData.schemaId}`, async () =>
            schemaHelper.helpDeleteSchema(
              { gqlClient, options: adminOptions },
              { schemaId: testData.schemaId }
            )
          );
        }

        // delete dag template
        if (createDagTemplate2) {
          await safe(`delete dag template ${createDagTemplate2.id}`, async () =>
            dagTemplateHelper.helpDeleteDagTemplate(
              { gqlClient, options: adminOptions },
              { id: createDagTemplate2.id }
            )
          );
        }

        // delete cluster
        if (otherClusterId) {
          await safe(`delete cluster ${otherClusterId}`, async () =>
            clusterHelper.helpDeleteCluster(
              { gqlClient, options: superOptions },
              { clusterId: otherClusterId }
            )
          );
        }

        if (testClusterIds.length > 0) {
          for (const clusterId of _.uniq(_.compact(testClusterIds))) {
            await safe(`delete cluster ${clusterId}`, async () =>
              clusterHelper.helpDeleteCluster(
                { gqlClient, options: adminOptions },
                { clusterId }
              )
            );
          }
        }

        // delete folder
        if (testData.folder) {
          await safe(`delete folder ${testData.folder.id}`, async () =>
            folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              { folderId: testData.folder.id, orderIndex: 0 }
            )
          );
        }

        // delete users and orgs
        if (!_.isEmpty(testSetup.listOptions)) {
          const listUserIds = testSetup.listOptions.map((user) => user.userId);
          await safe(`delete users ${listUserIds.join(', ')}`, async () =>
            userHelper.deleteMultiUser({ gqlClient }, listUserIds)
          );
        }

        if (testOrg.id) {
          await safe(`delete org ${testOrg.id}`, async () =>
            orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg.id
            )
          );
        }
      });
    });
  });
});

function getOrgAndUserInput(isEnabledOlp = false) {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      remainingBudget: 1000000,
      kvp: {
        billing: { pausedProcessing: false },
        features: {
          enableOLPFeature: isEnabledOlp ? 'enabled' : 'disabled'
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
    },
    userInputs: [
      {
        key: 'adminUser',
        name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };

  return createOrgAndUserInput;
}

async function buildAndDeployEngine(engineId, options, isPublic = false) {
  // Create engine build and deploy it
  const engineBuildRes = await engineHelper.helpCreateEngineBuild(
    { gqlClient, options: options },
    {
      engineId: engineId,
      taskRuntime: { nodeRed: true },
      manifest: { runtime: 'NodeRed' }
    }
  );
  const engineBuildId = _.get(engineBuildRes, 'createEngineBuild.id');

  const buildEngineActionListToUse = isPublic
    ? publicBuildEngineActionList
    : buildEngineActionList;
  // Submit and deploy the build

  let build;
  for (let action of buildEngineActionListToUse) {
    build = await engineHelper.helpUpdateEngineBuild(
      { gqlClient, options: options },
      {
        id: engineBuildId,
        engineId: engineId,
        action: action[0]
      }
    );
  }

  return build;
}
