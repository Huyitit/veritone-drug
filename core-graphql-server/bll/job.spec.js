const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();
const testTemplateAudioChunkEngineId = '06c3f1d7-7424-407b-a3b5-6ef61154fc0b';
const testTemplateTextChunkEngineId = '06bbc2e7-aa59-4c32-9ec3-1a147fff78a6';
const testTemplateAudioChunk = mockUtil.getMockEngineTemplate(
  testTemplateAudioChunkEngineId
);
const testTemplateTextChunk = mockUtil.getMockEngineTemplate(
  testTemplateTextChunkEngineId
);
const STREAM_INGESTOR_ENGINE_ID = '8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440'; // stream-ingestor engine
const OUTPUT_WRITER_ENGINE_ID = '8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3';
const SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID =
  '352556c7-de07-4d55-b33f-74b1cf237f25';
const PULL_ENGINE_CATEGORY_ID = '4b150c85-82d0-4a18-b7fb-63e4a58dfcce';
const INGESTION_ENGINE_CATEGORY_ID = '4be1a1b2-653d-4eaa-ba18-747a265305d8';
const moment = require('moment');

let bll, context;

beforeEach(function () {
  context = mockUtil.makeContext();
});

describe('bll Job tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      bll = require('./job.js')(serviceContext);
      chaiExpect(bll).to.be.a('object');
      chaiExpect(Object.keys(bll).length).to.equal(7);
      chaiExpect(typeof bll.detectIsV3Job).to.equal('function');
      chaiExpect(typeof bll.preprocessJob).to.equal('function');
      chaiExpect(typeof bll.placeVariablesToDags).to.equal('function');
      chaiExpect(typeof bll.mergeSingleEngineDags).to.equal('function');
      chaiExpect(typeof bll.renameIoFolders).to.equal('function');
    });
  });

  describe('#detectIsV3Job', function () {
    it('should return false if job and organizationId not exist', async function () {
      let err, res;
      let job = null;
      const organizationId = null;

      try {
        res = await bll.detectIsV3Job(context, job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.isV3Job).to.be.false;
    });

    it('should return false if job.tasks is empty', async function () {
      let err, res;
      let job = { tasks: [] };
      const organizationId = 7682;

      try {
        res = await bll.detectIsV3Job(context, job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.isV3Job).to.be.false;
    });

    it('should return false if engines in job are not V3', async function () {
      let err, res;
      let job = {
        tasks: [
          {
            engineId: '90cabdd8-3739-4a81-b1b5-be20f8fd9783'
          }
        ]
      };
      const organizationId = 7682;

      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: '90cabdd8-3739-4a81-b1b5-be20f8fd9783' }
      ]);

      try {
        res = await bll.detectIsV3Job(context, job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.isV3Job).to.be.false;
      chaiExpect(res.nonV3EngineIds[0]).to.equal(
        '90cabdd8-3739-4a81-b1b5-be20f8fd9783'
      );
    });

    it('should return true if engines in job are all V3', async function () {
      let err, res;
      let job = {
        tasks: [
          {
            engineId: '1144dc99-e9ca-45b8-a8a2-37c821e532c8'
          }
        ]
      };
      const organizationId = 7682;

      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: '1144dc99-e9ca-45b8-a8a2-37c821e532c8', edge_version: 3 }
      ]);

      try {
        res = await bll.detectIsV3Job(context, job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.isV3Job).to.be.true;
      chaiExpect(res.nonV3EngineIds.length).to.equal(0);
    });
  });

  describe('#placeVariablesToDags', function () {
    it('should throw error if engine does not specify a default single job template', async function () {
      let err, res;
      let options = {
        engineIdToTaskMap: {},
        lstEngines: {
          records: [
            {
              id: '06bbc2e7-aa59-4c32-9ec3-1a147fff78a6'
            }
          ]
        },
        job: {},
        organizationId: 7682
      };

      try {
        res = await bll.placeVariablesToDags(context, options);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          `Engine ${options.lstEngines.records[0].id} does not specify a default single job template`
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw not implement error if templateLanguage is not Handlebars', async function () {
      let err, res;
      let options = {
        engineIdToTaskMap: {},
        lstEngines: {
          records: [
            {
              id: testTemplateTextChunkEngineId,
              singleEngineTdoJobJson: {
                templateLanguage: 'invalid',
                template: testTemplateTextChunk
              }
            }
          ]
        },
        job: { targetId: 123 },
        organizationId: 7682
      };

      try {
        res = await bll.placeVariablesToDags(context, options);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          `Engine ${testTemplateTextChunkEngineId} single job template uses unsupported templating language`
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_implemented');
      chaiExpect(res).to.be.undefined;
    });

    it('should place variables into DAGs', async function () {
      let err, res;
      let options = {
        engineIdToTaskMap: {
          '06bbc2e7-aa59-4c32-9ec3-1a147fff78a6': {
            payload: {}
          }
        },
        lstEngines: {
          records: [
            {
              id: testTemplateTextChunkEngineId,
              singleEngineTdoJobJson: {
                templateLanguage: 'Handlebars',
                template: testTemplateTextChunk
              }
            }
          ]
        },
        job: {
          uploadUrl: 'http://localhost',
          targetId: 123
        },
        organizationId: 7682
      };

      try {
        res = await bll.placeVariablesToDags(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res[testTemplateTextChunkEngineId].targetId).to.equal('123');
      chaiExpect(res[testTemplateTextChunkEngineId].tasks.length).to.equal(4);
      chaiExpect(res[testTemplateTextChunkEngineId].routes.length).to.equal(3);
    });
  });

  describe('#preprocessJob', function () {
    it('should replacement engines and convert list engines to DAGs', async function () {
      let err, res;
      let options = {
        job: {
          uploadUrl: 'http://localhost',
          targetId: 123,
          tasks: [
            {
              engineId: '90cabdd8-3739-4a81-b1b5-be20f8fd9783'
            },
            {
              engineId: '1144dc99-e9ca-45b8-a8a2-37c821e532c8',
              payload: {
                libraryId: 'e84671bb-0a5c-41b3-b218-2d3fdbe99c60'
              }
            }
          ]
        },
        organizationId: 7682
      };

      _.set(
        context,
        `_authInfo.organization.kvp.features.enableConvertEnginesToDAG`,
        true
      );
      // serviceContext.bll.task.getReplacementEnginesForTasks
      serviceContext.dbConnections['core'].read._push([
        {
          source_engine_id: '90cabdd8-3739-4a81-b1b5-be20f8fd9783',
          organization_id: 7682,
          replacement_engine_id: testTemplateAudioChunkEngineId,
          payload_func: '$'
        },
        {
          source_engine_id: '1144dc99-e9ca-45b8-a8a2-37c821e532c8',
          organization_id: 7682,
          replacement_engine_id: testTemplateTextChunkEngineId,
          payload_func: '$'
        }
      ]);
      // serviceContext.dal.engine.getEngine 2 times
      serviceContext.dbConnections['core'].read._push([
        { id: testTemplateAudioChunkEngineId, edge_version: 3 }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: testTemplateTextChunkEngineId, edge_version: 3 }
      ]);
      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        {
          id: testTemplateAudioChunkEngineId,
          edge_version: 3,
          single_engine_tdo_job_json: {
            template: testTemplateAudioChunk,
            templateLanguage: 'Handlebars'
          }
        },
        {
          id: testTemplateTextChunkEngineId,
          edge_version: 3,
          single_engine_tdo_job_json: {
            template: testTemplateTextChunk,
            templateLanguage: 'Handlebars'
          }
        }
      ]);
      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        {
          id: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
          category_id: '4b150c85-82d0-4a18-b7fb-63e4a58dfcce'
        },
        {
          id: '8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440'
        },
        {
          id: '06bbc2e7-aa59-4c32-9ec3-1a147fff78a6'
        }
      ]);

      try {
        res = await bll.preprocessJob(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.targetId).to.equal(123);
      chaiExpect(res.tasks.length).to.equal(7);
      chaiExpect(res.routes.length).to.equal(6);
    });
  });

  describe('#mergeSingleEngineDags', function () {
    beforeEach(() => {
      serviceContext._clearAll();
      serviceContext.redisCache.markCacheDirty(true);
    });

    it('should throw error - Invalid DAG: engines with different adapters', async function () {
      let err, res;
      let options = {
        engineIdToDagMap: {},
        organizationId: 7682
      };

      options.engineIdToDagMap[testTemplateAudioChunkEngineId] = {
        tasks: [
          {
            engineId: 'fcc23a76-4f36-46d9-86b1-78e83acdd0f9',
            payload: { url: 'http://localhost' },
            executionPreferences: { priority: 1 },
            ioFolders: [
              {
                referenceId: 'wsa-output',
                mode: 'stream',
                type: 'output'
              }
            ]
          },
          {
            engineId: SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'pb-input',
                mode: 'stream',
                type: 'input'
              }
            ]
          },
          {
            engineId: STREAM_INGESTOR_ENGINE_ID,
            payload: {
              ffmpegTemplate: 'audio',
              customFFMPEGProperties: {
                chunkSizeInSeconds: '300'
              }
            },
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'si-input',
                mode: 'stream',
                type: 'input'
              },
              {
                referenceId: 'si-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: testTemplateAudioChunkEngineId,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'engine-input',
                mode: 'chunk',
                type: 'input'
              },
              {
                referenceId: 'engine-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: OUTPUT_WRITER_ENGINE_ID,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'ow-input',
                mode: 'chunk',
                type: 'input'
              }
            ]
          }
        ]
      };

      options.engineIdToDagMap[testTemplateTextChunkEngineId] = {
        tasks: [
          {
            engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
            payload: {
              url: 'http://localhost'
            },
            executionPreferences: {
              priority: 1
            },
            ioFolders: [
              {
                referenceId: 'wsa-output',
                mode: 'stream',
                type: 'output'
              }
            ]
          },
          {
            engineId: '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a',
            payload: {
              assetType: 'media',
              setAsPrimary: true
            },
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'ai-input',
                mode: 'stream',
                type: 'input'
              }
            ]
          },
          {
            engineId: STREAM_INGESTOR_ENGINE_ID,
            payload: {
              ffmpegTemplate: 'rawchunk'
            },
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'si-input',
                mode: 'stream',
                type: 'input'
              },
              {
                referenceId: 'si-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: testTemplateTextChunkEngineId,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'engine-input',
                mode: 'chunk',
                type: 'input'
              },
              {
                referenceId: 'engine-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: OUTPUT_WRITER_ENGINE_ID,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'ow-input',
                mode: 'chunk',
                type: 'input'
              }
            ]
          }
        ]
      };

      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'fcc23a76-4f36-46d9-86b1-78e83acdd0f9',
          name: 'Nielsen Radio Audience V3',
          category_id: PULL_ENGINE_CATEGORY_ID
        },
        {
          id: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
          name: 'WSA',
          category_id: PULL_ENGINE_CATEGORY_ID
        },
        { id: SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID, name: 'Playback' },
        { id: STREAM_INGESTOR_ENGINE_ID, name: 'SI' },
        { id: testTemplateAudioChunkEngineId, name: 'Cognitive Audio Chunk' },
        { id: OUTPUT_WRITER_ENGINE_ID, name: 'Output Writer' },
        {
          id: '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a',
          name: 'SI2 Stream Asset Creator V3F'
        },
        {
          id: testTemplateTextChunkEngineId,
          name: 'eContext Classify (IAB) V3'
        }
      ]);

      try {
        res = await bll.mergeSingleEngineDags(context, options);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Invalid DAG: engines with different adapters'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.adapterEngineIds.length).to.equal(2);
      chaiExpect(err.data.adapterEngineIds[0]).to.equal(
        'fcc23a76-4f36-46d9-86b1-78e83acdd0f9'
      );
      chaiExpect(err.data.adapterEngineIds[1]).to.equal(
        '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
      );
    });

    it('should merge multiple engine template with appropriate WSA, SI, Playback, OW', async function () {
      let err, res;
      let options = {
        engineIdToDagMap: {},
        organizationId: 7682
      };

      options.engineIdToDagMap[testTemplateAudioChunkEngineId] = {
        tasks: [
          {
            engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
            payload: { url: 'http://localhost' },
            executionPreferences: { priority: 1 },
            ioFolders: [
              {
                referenceId: 'wsa-output',
                mode: 'stream',
                type: 'output'
              }
            ]
          },
          {
            engineId: SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'pb-input',
                mode: 'stream',
                type: 'input'
              }
            ]
          },
          {
            engineId: STREAM_INGESTOR_ENGINE_ID,
            payload: {
              ffmpegTemplate: 'audio',
              customFFMPEGProperties: {
                chunkSizeInSeconds: '300'
              }
            },
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'si-input',
                mode: 'stream',
                type: 'input'
              },
              {
                referenceId: 'si-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: testTemplateAudioChunkEngineId,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'engine-input',
                mode: 'chunk',
                type: 'input'
              },
              {
                referenceId: 'engine-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: OUTPUT_WRITER_ENGINE_ID,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'ow-input',
                mode: 'chunk',
                type: 'input'
              }
            ]
          }
        ],
        routes: [
          {
            parentIoFolderReferenceId: 'wsa-output',
            childIoFolderReferenceId: 'pb-input'
          },
          {
            parentIoFolderReferenceId: 'wsa-output',
            childIoFolderReferenceId: 'si-input'
          },
          {
            parentIoFolderReferenceId: 'si-output',
            childIoFolderReferenceId: 'engine-input'
          },
          {
            parentIoFolderReferenceId: 'engine-output',
            childIoFolderReferenceId: 'ow-input'
          }
        ]
      };

      options.engineIdToDagMap[testTemplateTextChunkEngineId] = {
        tasks: [
          {
            engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
            payload: {
              url: 'http://localhost'
            },
            executionPreferences: {
              priority: 1
            },
            ioFolders: [
              {
                referenceId: 'wsa-output',
                mode: 'stream',
                type: 'output'
              }
            ]
          },
          {
            engineId: '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a',
            payload: {
              assetType: 'media',
              setAsPrimary: true
            },
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'ai-input',
                mode: 'stream',
                type: 'input'
              }
            ]
          },
          {
            engineId: STREAM_INGESTOR_ENGINE_ID,
            payload: {
              ffmpegTemplate: 'rawchunk'
            },
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'si-input',
                mode: 'stream',
                type: 'input'
              },
              {
                referenceId: 'si-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: testTemplateTextChunkEngineId,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'engine-input',
                mode: 'chunk',
                type: 'input'
              },
              {
                referenceId: 'engine-output',
                mode: 'chunk',
                type: 'output'
              }
            ]
          },
          {
            engineId: OUTPUT_WRITER_ENGINE_ID,
            executionPreferences: {
              priority: 1,
              parentCompleteBeforeStarting: true
            },
            ioFolders: [
              {
                referenceId: 'ow-input',
                mode: 'chunk',
                type: 'input'
              }
            ]
          }
        ],
        routes: [
          {
            parentIoFolderReferenceId: 'wsa-output',
            childIoFolderReferenceId: 'ai-input'
          },
          {
            parentIoFolderReferenceId: 'wsa-output',
            childIoFolderReferenceId: 'si-input'
          },
          {
            parentIoFolderReferenceId: 'si-output',
            childIoFolderReferenceId: 'engine-input'
          },
          {
            parentIoFolderReferenceId: 'engine-output',
            childIoFolderReferenceId: 'ow-input'
          }
        ]
      };

      // serviceContext.dal.engine.getEngines
      serviceContext.dbConnections['core'].read._push([
        {
          id: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
          name: 'WSA',
          category_id: PULL_ENGINE_CATEGORY_ID
        },
        {
          id: SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID,
          name: 'Playback',
          category_id: INGESTION_ENGINE_CATEGORY_ID
        },
        {
          id: STREAM_INGESTOR_ENGINE_ID,
          name: 'SI',
          category_id: INGESTION_ENGINE_CATEGORY_ID
        },
        { id: testTemplateAudioChunkEngineId, name: 'Cognitive Audio Chunk' },
        { id: OUTPUT_WRITER_ENGINE_ID, name: 'Output Writer' },
        {
          id: '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a',
          name: 'SI2 Stream Asset Creator V3F',
          category_id: INGESTION_ENGINE_CATEGORY_ID
        },
        {
          id: testTemplateTextChunkEngineId,
          name: 'eContext Classify (IAB) V3'
        }
      ]);

      try {
        res = await bll.mergeSingleEngineDags(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.mergedTasks.length).to.equal(9);
      chaiExpect(res.mergedRoutes.length).to.equal(8);
      chaiExpect(res.mergedTasks).to.eql([
        {
          engineId: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',
          payload: { url: 'http://localhost' },
          executionPreferences: { priority: 1 },
          ioFolders: [
            { referenceId: 'wsa-output', mode: 'stream', type: 'output' }
          ]
        },
        {
          engineId: SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID,
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            { referenceId: 'pb-input', mode: 'stream', type: 'input' }
          ]
        },
        {
          engineId: '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a',
          payload: { assetType: 'media', setAsPrimary: true },
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            { referenceId: 'ai-input', mode: 'stream', type: 'input' }
          ]
        },
        {
          engineId: STREAM_INGESTOR_ENGINE_ID,
          payload: {
            ffmpegTemplate: 'audio',
            customFFMPEGProperties: { chunkSizeInSeconds: '300' }
          },
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            { referenceId: 'si-input-audio', mode: 'stream', type: 'input' },
            { referenceId: 'si-output-audio', mode: 'chunk', type: 'output' }
          ]
        },
        {
          engineId: STREAM_INGESTOR_ENGINE_ID,
          payload: { ffmpegTemplate: 'rawchunk' },
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            { referenceId: 'si-input-rawchunk', mode: 'stream', type: 'input' },
            { referenceId: 'si-output-rawchunk', mode: 'chunk', type: 'output' }
          ]
        },
        {
          engineId: '06c3f1d7-7424-407b-a3b5-6ef61154fc0b',
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            {
              referenceId: 'engine-input-06c3f1d7-7424-407b-a3b5-6ef61154fc0b',
              mode: 'chunk',
              type: 'input'
            },
            {
              referenceId: 'engine-output-06c3f1d7-7424-407b-a3b5-6ef61154fc0b',
              mode: 'chunk',
              type: 'output'
            }
          ]
        },
        {
          engineId: '06bbc2e7-aa59-4c32-9ec3-1a147fff78a6',
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            {
              referenceId: 'engine-input-06bbc2e7-aa59-4c32-9ec3-1a147fff78a6',
              mode: 'chunk',
              type: 'input'
            },
            {
              referenceId: 'engine-output-06bbc2e7-aa59-4c32-9ec3-1a147fff78a6',
              mode: 'chunk',
              type: 'output'
            }
          ]
        },
        {
          engineId: OUTPUT_WRITER_ENGINE_ID,
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            {
              referenceId: 'ow-input-06c3f1d7-7424-407b-a3b5-6ef61154fc0b',
              mode: 'chunk',
              type: 'input'
            }
          ]
        },
        {
          engineId: OUTPUT_WRITER_ENGINE_ID,
          executionPreferences: {
            priority: 1,
            parentCompleteBeforeStarting: true
          },
          ioFolders: [
            {
              referenceId: 'ow-input-06bbc2e7-aa59-4c32-9ec3-1a147fff78a6',
              mode: 'chunk',
              type: 'input'
            }
          ]
        }
      ]);
    });
  });

  describe('#checkProcessingLimitsForOrg', function () {
    beforeEach(() => {
      serviceContext._clearAll();
      serviceContext.redisCache.markCacheDirty(true);
    });

    it('should throw error - Organization is required when calculating the process limit', async function () {
      let err, res;
      let options = {};

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Organization is required when calculating the process limit'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should ignore check if org allow engine overage', async function () {
      let err, res;
      let options = { organizationId: 7682 };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          kvp: { features: { allowEngineOverage: true } },
          isLimitEnforced: false
        }
      ]);

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.be.undefined;
    });

    it('should throw error if org is paused processing', async function () {
      let err, res;
      let options = { organizationId: 1234 };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1234,
          kvp: {
            features: { allowEngineOverage: false },
            billing: { pausedProcessing: true }
          },
          isLimitEnforced: true
        }
      ]);

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('object_limit_exceeded');
    });

    it('should throw error - invalid billing period', async function () {
      let err, res;
      let options = { organizationId: 1235 };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1235,
          kvp: {
            features: { allowEngineOverage: false },
            billing: {
              pausedProcessing: false,
              startDate: moment().add(1, 'minutes')
            }
          },
          isLimitEnforced: true
        }
      ]);

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        chaiExpect(error.message).to.equal('invalid billing period');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
    });

    it('should ignore calculating if no task or job was passed in', async function () {
      let err, res;
      let options = { organizationId: 1236 };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1236,
          kvp: {
            features: { allowEngineOverage: false },
            billing: {
              pausedProcessing: false,
              startDate: moment()
            }
          },
          isLimitEnforced: true
        }
      ]);

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.be.undefined;
    });

    it('should throw error - unavailable_funds', async function () {
      let err, res;
      let options = {
        organizationId: 1237,
        taskId: '20125010_5NKPGBkwU5FRHl6',
        task: { engineId: 'transcribe-speechmatics-container-en' }
      };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1237,
          kvp: {
            features: { allowEngineOverage: false },
            billing: {
              pausedProcessing: false,
              startDate: moment()
            }
          },
          isLimitEnforced: true,
          remainingBudget: 10
        }
      ]);

      // ---- Start function serviceContext.bll.engine.calculateEngineUsageForOrganization
      // -- Start function serviceContext.bll.task.populateEngineForTask
      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: 'transcribe-speechmatics-container-en' }
      ]);
      // -- End function serviceContext.bll.task.populateEngineForTask
      // ---- End function serviceContext.bll.engine.calculateEngineUsageForOrganization

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('unavailable_funds');
    });

    it('should increase the limit pending and save to redis', async function () {
      let err, res;
      let options = {
        organizationId: 1238,
        taskId: '20125010_5NKPGBkwU5FRHl6',
        task: { engineId: 'transcribe-speechmatics-container-en' }
      };

      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1238,
          kvp: {
            features: { allowEngineOverage: false },
            billing: {
              pausedProcessing: false,
              startDate: moment()
            }
          },
          isLimitEnforced: true,
          remainingBudget: 10000
        }
      ]);

      // ---- Start function serviceContext.bll.engine.calculateEngineUsageForOrganization
      // -- Start function serviceContext.bll.task.populateEngineForTask
      // serviceContext.dal.engine.getEngine
      serviceContext.dbConnections['core'].read._push([
        { id: 'transcribe-speechmatics-container-en' }
      ]);
      // -- End function serviceContext.bll.task.populateEngineForTask
      // ---- End function serviceContext.bll.engine.calculateEngineUsageForOrganization

      try {
        res = await bll.checkProcessingLimitsForOrg(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.be.undefined;
      // 3 times call to redis
      // get org limit pending cache
      // set cache for engine list
      // set cache for org limit pending
      chaiExpect(serviceContext.redisClient._counter()).to.equal(4);
      serviceContext.redisClient.get(
        'TEST:PendingCostForOrganization1238',
        (err, res) => {
          chaiExpect(res).to.equal(50);
        }
      );
    });
  });
});
