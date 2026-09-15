const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const mockUtil = global.mockUtil;
const mapper = require('./mapper.js');
let serviceContext = initializeServiceContext();
let dalTdo = require('./tdo.js')(serviceContext);
describe('tdo.js', function () {
  describe('#require', function () {
    it('should have correct function exports', function () {
      expect(typeof dalTdo).toEqual('object');
      expect(Object.keys(dalTdo).length).toEqual(53);
      expectFunction(dalTdo, 'getTDO');
      expectFunction(dalTdo, 'getTDOs');
      expectFunction(dalTdo, 'getTDODetails');
      expectFunction(dalTdo, 'getTDOSourceData');
      expectFunction(dalTdo, 'updateTDO');
      expectFunction(dalTdo, 'createTDO');
      expectFunction(dalTdo, 'createTDOWithAsset');
      expectFunction(dalTdo, 'deleteTDO');
      expectFunction(dalTdo, 'cleanupTDO');
      expectFunction(dalTdo, 'tdoCacheKey');
      expectFunction(dalTdo, 'clearCachedTDO');
      expectFunction(dalTdo, 'getAssets');
      expectFunction(dalTdo, 'getTDOAssetCount');
      expectFunction(dalTdo, 'incrTDOAssetCount');
      expectFunction(dalTdo, 'decrTDOAssetCount');
      expectFunction(dalTdo, 'getStreamData');
      expectFunction(dalTdo, 'getStreamManifest');
      expectFunction(dalTdo, 'getFakeMediaAsset');
      expectFunction(dalTdo, 'getPrimaryAsset');
      expectFunction(dalTdo, 'getFieldFilter');
      expectFunction(dalTdo, 'isClonedRecording');
      expectFunction(dalTdo, 'isClonedAsset');
      expectFunction(dalTdo, 'getEngineRuns');
      expectFunction(dalTdo, 'getTDOSourceTaskData');
      expectFunction(dalTdo, 'requestClone');
      expectFunction(dalTdo, 'addMediaSegment');
      expectFunction(dalTdo, 'addMediaSegmentsBulk');
      expectFunction(dalTdo, 'addSourceDataToNewTdo');
      expectFunction(dalTdo, 'newTdoSetup');
      expectFunction(dalTdo, 'syncMediaMdpAsset');
      expectFunction(dalTdo, 'updateFolderInSearchIndex');
      expectFunction(dalTdo, 'handleDeleteAssets');
      expectFunction(dalTdo, '_getAssetsToDeleteByTdoId');
      expectFunction(dalTdo, 'getCloneRequest');
      expectFunction(dalTdo, 'getCloneRequests');
      expectFunction(dalTdo, 'updateClone');
      expectFunction(dalTdo, 'getCloneMapping');
      expectFunction(dalTdo, 'createCloneMapping');
      expectFunction(dalTdo, 'refreshClone');
      expectFunction(dalTdo, 'cancelClone');
      expectFunction(dalTdo, 'processRefreshRecording');
      expectFunction(dalTdo, 'shouldCloneAssetBasedOnFilters');
    });
  });

  describe('#getTDOs', function () {
    beforeAll(function () {
      _.merge(serviceContext.dal.application, { getAppIdFromOrgId: jest.fn() });
    });
    it('should get with internal token, no args', async function () {
      // tests for broken SQL if there is no where clause
      serviceContext.dbConnections['core'].read._push([]);
      const res = await dalTdo.getTDOs(
        mockUtil.makeContext({ authType: 'api_internal' }),
        { limit: 1 }
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(0);
    });
    it('should query by ID', async function () {
      // the final query. should filter by ID.
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1234'
            // add some verification of query structure, with application_id in WHERE
          }
        ],
        true,
        ['1234', 'id', 'WHERE']
      );
      const res = await dalTdo.getTDOs(
        mockUtil.makeContext({ authType: 'api_internal' }),
        { limit: 1, id: '1234' }
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });
    it('should query by IDs', async function () {
      // the final query. should filter by ID.
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1234'
            // add some verification of query structure, with application_id in WHERE
          }
        ],
        true,
        ['1234', 'id', 'WHERE']
      );
      const res = await dalTdo.getTDOs(
        mockUtil.makeContext({ authType: 'api_internal' }),
        { limit: 1, ids: ['1234'] }
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });
    it('should query by org ID', async function () {
      // get group ID for org
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get app ID for supplied org ID.
      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValueOnce(
        'a0359273-ecc6-4934-aa6b-092fbed49956'
      );
      // the final query. should filter by app ID.
      serviceContext.dbConnections['core'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            id: '1234'
            // add some verification of query structure, with application_id in WHERE
          }
        ],
        true,
        ['a0359273-ecc6-4934-aa6b-092fbed49956', 'application_id', 'WHERE']
      );
      const res = await dalTdo.getTDOs(
        mockUtil.makeContext({ authType: 'api_internal' }),
        { limit: 1, organizationId: '7682' }
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });
    it('should default sort to start_date_time desc', async function () {
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          if (!sql.toLowerCase().includes('order by r.start_date_time desc')) {
            return false;
          }
          return true;
        }
      );
      await dalTdo.getTDOs(mockUtil.makeContext(), { offset: 0 });
    });
    it('should add sub-sort for stop_date_time', async function () {
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          if (
            !sql
              .toLowerCase()
              .includes('order by r.stop_date_time desc, r.recording_id desc')
          ) {
            return false;
          }
          return true;
        }
      );
      await dalTdo.getTDOs(mockUtil.makeContext(), { orderBy: 'stopDateTime' });
    });
    it('should add sub-sort for created_date_time', async function () {
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          if (
            !sql
              .toLowerCase()
              .includes(
                'order by r.created_date_time desc, r.recording_id desc'
              )
          ) {
            return false;
          }
          return true;
        }
      );
      await dalTdo.getTDOs(mockUtil.makeContext(), {
        orderBy: 'createdDateTime'
      });
    });
    it('should add sub-sort for modified_date_time', async function () {
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          if (
            !sql
              .toLowerCase()
              .includes(
                'order by r.modified_date_time desc, r.recording_id desc'
              )
          ) {
            return false;
          }
          return true;
        }
      );
      await dalTdo.getTDOs(mockUtil.makeContext(), {
        orderBy: 'modifiedDateTime'
      });
    });
    it('should handle custom sort order', async function () {
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          if (
            !sql
              .toLowerCase()
              .includes('order by r.modified_date_time asc, r.recording_id asc')
          ) {
            return false;
          }
          return true;
        }
      );
      await dalTdo.getTDOs(mockUtil.makeContext(), {
        orderBy: 'modifiedDateTime',
        orderDirection: 'asc',
        offset: 100
      });
    });
    it('should enforce max offset', async function () {
      try {
        await dalTdo.getTDOs(mockUtil.makeContext(), { offset: 3001 });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should accept offset below max', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      await dalTdo.getTDOs(mockUtil.makeContext(), { offset: 2099 });
    });
    it('should enforce non-default max offset', async function () {
      const orig = _.set(serviceContext, 'config.maxTDOOffset', 2000);
      const dal = require('./tdo.js')(serviceContext);
      try {
        await dal.getTDOs(mockUtil.makeContext(), { offset: 2001 });
        _.set(serviceContext, 'config.maxTDOOffset', orig);
      } catch (err) {
        _.set(serviceContext, 'config.maxTDOOffset', orig);
        expect(err.name).toEqual('invalid_input');
        expect(_.get(err, 'data.errorName')).toEqual('max_tdo_offset');
        expect(_.get(err, 'data.offset')).toEqual(2001);
        expect(_.get(err, 'data.maxOffset')).toEqual(2000);
      }
    });
    it('should not enforce if config is off', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      const orig = _.set(serviceContext, 'config.maxTDOOffsetEnabled', false);
      const dal = require('./tdo.js')(serviceContext);
      await dal.getTDOs(mockUtil.makeContext(), { offset: 5000 });
      _.set(serviceContext, 'config.maxTDOOffsetEnabled', orig);
    });
    it('should apply RBAC auth filter when enabled', async function () {
      const context = mockUtil.makeContext();
      const tdoId = '123';

      _.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '7682',
          name: 'test org',
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        }
      ]);
      _.set(context, '_authInfo.authGroups', ['auth-group-1', 'auth-group-2']);
      const mockAuthFilter = jest.fn((idField, argNum) => ({
        join: `JOIN rbac.acl_recording _acl_r_ ON (${idField})::text=_acl_r_.recording_id`,
        where: `(_acl_r_.auth_group_id=ANY($${argNum}::uuid[]) AND _acl_r_.permission_set_id=ANY($${argNum + 1}::uuid[]))`,
        args: [['auth-group-id'], ['permission-set-id']],
        metadata: {
          resourceType: 'TDO'
        }
      }));
      _.set(context, '_rbacAuthFilter', mockAuthFilter);

      serviceContext.dbConnections['core'].read._push([
        {
          id: tdoId,
          application_id: 'app-123',
          start_date_time: moment().subtract(1, 'hour').toISOString(),
          stop_date_time: moment().toISOString(),
          is_public: false,
          json: {
            startDateTime: moment().subtract(1, 'hour').unix(),
            stopDateTime: moment().unix(),
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix()
          }
        }
      ], false, [], (sql, params) => {
        // Verify RBAC filter is applied in SQL query
        expect(sql).toContain('JOIN rbac.acl_recording _acl_r_');
        expect(sql).toContain('_acl_r_.auth_group_id=ANY');
        expect(sql).toContain('_acl_r_.permission_set_id=ANY');
        expect(params[0]).toEqual(
          expect.arrayContaining(['auth-group-id'])
        );
        expect(params[1]).toEqual(
          expect.arrayContaining(['permission-set-id'])
        );

        return true;
      });

      const result = await dalTdo.getTDOs(context, { limit: 100 });

      expect(result).toBeDefined();
      expect(result.count).toEqual(1);
    });
  });

  describe('#createTDO', function () {
    let mockPartitionTable, newTdo;
    beforeAll(function () {
      _.set(serviceContext, 'config.rateLimit.maxTDOMetadataSize', 500);
      mockPartitionTable = require('../test/partitionTable.mock.js')(
        serviceContext
      );
      _.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
      _.merge(serviceContext.bll, {
        rbacAuth: {
          getAuthGroups: jest.fn(),
          getAuthPermissionSets: jest.fn(),
          addACEsToResources: jest.fn(),
          addDefaultACEsToResources: jest.fn()
        }
      });
      dalTdo = require('./tdo.js')(serviceContext);
    });

    afterAll(function () {
      jest.resetModules();
    });

    it('should fail on over-large details', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '12345'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: '12345'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          exists: true
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: '12345'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['core'].write._push([
        { recording_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }
      ]);
      try {
        await dalTdo.createTDO(mockUtil.makeContext(), {
          input: {
            applicationId: '123',
            details: {
              bigstr: _.pad('test', 500)
            }
          }
        });
        expect.fail('did not error on over-large input');
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages.length).toEqual(1);
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
        if (err.name === 'AssertionError') throw err;
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should succeed on valid input', async function () {
      const dateStr = moment().toISOString();
      const start = moment().subtract(2, 'hour').toISOString();
      const stop = moment().subtract(1, 'hour').toISOString();

      // get org for checking if the org can create new TDO
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '12345'
        }
      ]);
      // get group ID for org
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        //xxx
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1234',
          name: 'test source',
          organizationId: '7682',
          sourceTypeId: '123456'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          name: 'test source type',
          id: '123456'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: '1234',
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0',
          permission: 'owner'
        },
        {
          source_id: '1234',
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf1',
          permission: 'viewer'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            groupId: 'c0455964-c72f-4f17-a740-110bb7cfabf0',
            organizationId: 7682
          }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            groupId: 'c0455964-c72f-4f17-a740-110bb7cfabf1',
            organizationId: 7683
          }
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '12345',
          name: 'test scheduled job'
        }
      ]);
      // insert into media table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '123',
          created_date_time: dateStr,
          modified_date_time: dateStr
        }
      ]);

      // upsert media metadata
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // this is the insert to recording and recording_metadata
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [
          start,
          stop, // verifies that times were converted correctly
          'created_by',
          'modified_by'
        ],
        (sql, vars) => {
          expect(vars[11]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396'); // createdBy
          // make sure we didn't insert any bogus keys
          if (vars.includes('recording-id')) return false;
          return true;
        }
      );
      // this is the final getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            str: 'test'
          }
        }
      ]);

      //get org for application id
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '12345'
        }
      ]);

      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // get source content templates
      serviceContext.dbConnections['media_platform'].read._push([
        {
          sdo_id: 'd0455964-c72f-4f17-a740-110bb7cfabf0',
          data_registry_id: 'd0455964-c72f-4f17-a740-110bb7cfabf1'
        }
      ]);
      // scheduled job content templates
      serviceContext.dbConnections['media_platform'].read._push([
        {
          sdo_id: 'a0455964-c72f-4f17-a740-110bb7cfabf0',
          data_registry_id: 'd0455964-c72f-4f17-a740-110bb7cfabf1'
        }
      ]);

      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            organizationId: '7682',
            dataRegistryMetadataId: 'd0455964-c72f-4f17-a740-110bb7cfabf1',
            id: 'd0455964-c72f-4f17-a740-110bb7cfabf1',
            schema: {},
            status: 'published',
            storageName: 'foo_bar'
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            name: 'test',
            organizationId: '7682',
            isSystem: false,
            id: 'd0455964-c72f-4f17-a740-110bb7cfabf1'
          }
        ],
        false
      );

      // SDOs
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            data: { foo: 'bar' }
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            data: { foo: 'bar2' }
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            data: { foo: 'bar3' }
          }
        ],
        false
      );

      // create content template assets
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: 'a1234'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: 'a1235'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          veritoneProgram: { foo: 'bar' }
        }
      ]);

      // get orgId for updating media usage
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '12345'
        }
      ]);
      // first new asset
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: '12345_a1',
          recording_id: '12345',
          content_type: 'video/mp4',
          uri: 'http://localhost/movie1',
          type: 'media'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: '12345_a2',
          recording_id: '12345',
          content_type: 'video/quicktime',
          uri: 'http://localhost/movie2',
          type: 'media'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      await dalTdo.createTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          organizationId: 7682,
          applicationId: '123',
          startDateTime: start,
          stopDateTime: moment(stop).valueOf(),
          parentFolderId: 'f0455964-c72f-4f17-a740-110bb7cfabf8',
          details: {
            str: 'test',
            veritoneFile: {
              fileName: 'foo.text',
              size: 100
            },
            recordingId: 'foo'
          },
          sourceData: {
            sourceId: '1234',
            scheduledJobId: '12345'
          },
          assets: [
            {
              assetType: 'media',
              contentType: 'video/mp4',
              uri: 'http://localhost/movie/1',
              setAsPrimary: true
            },
            {
              assetType: 'media',
              contentType: 'video/quicktime',
              uri: 'http://localhost/movie/2'
            }
          ],
          addToIndex: false
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(9);
      const messages = serviceContext.messageUtil._messages();
      // last message is public create recording
      expect(messages[8].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );

      // VE-17001: verify deferred event emission ordering.
      // AssetUpload/AssetUploaded events should be emitted AFTER all TDO
      // initialization (RBAC, indexing, content templates, caching) is complete.
      // This includes events from content-template assets created in applyContentTemplates.
      const assetUploadIndices = [];
      const nonAssetUploadIndices = [];
      messages.forEach((m, idx) => {
        if (m.event === 'asset_upload' || m.event === 'asset_uploaded') {
          assetUploadIndices.push(idx);
        } else {
          nonAssetUploadIndices.push(idx);
        }
      });
      // asset upload events should exist
      expect(assetUploadIndices.length).toBeGreaterThan(0);
      // All asset upload/uploaded events must come AFTER all non-asset-upload events
      // (except the final RecordingCreated audit event which is the very last).
      // This validates that deferred events are emitted only after all TDO
      // initialization is complete.
      const lastNonAssetUploadBeforeDeferred = nonAssetUploadIndices
        .filter((idx) => idx < Math.min(...assetUploadIndices));
      const firstAssetUploadIdx = Math.min(...assetUploadIndices);
      const lastAssetUploadIdx = Math.max(...assetUploadIndices);
      // The RecordingCreated audit event should be the very last event
      const recordingCreatedIdx = messages.length - 1;
      expect(messages[recordingCreatedIdx].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      // All asset upload events should be contiguous and just before RecordingCreated
      expect(lastAssetUploadIdx).toBeLessThan(recordingCreatedIdx);
      // All asset upload events should come after all other non-final events
      assetUploadIndices.forEach((idx) => {
        lastNonAssetUploadBeforeDeferred.forEach((nonIdx) => {
          expect(idx).toBeGreaterThan(nonIdx);
        });
      });

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(9);
    });
    it('should succeed on valid input - internal key', async function () {
      const dateStr = moment().toISOString();
      const start = moment().subtract(2, 'hour').toISOString();
      const stop = moment().subtract(1, 'hour').toISOString();

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1234',
          name: 'test source',
          organizationId: '789',
          sourceTypeId: '123456'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          name: 'test source type',
          id: '123456'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: '1234',
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0',
          permission: 'owner'
        },
        {
          source_id: '1234',
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf1',
          permission: 'viewer'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            groupId: 'c0455964-c72f-4f17-a740-110bb7cfabf0',
            organizationId: 7682
          }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            groupId: 'c0455964-c72f-4f17-a740-110bb7cfabf1',
            organizationId: 7683
          }
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '12345',
          name: 'test scheduled job'
        }
      ]);
      // insert into media table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '123',
          created_date_time: dateStr,
          modified_date_time: dateStr
        }
      ]);

      // upsert media metadata
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // this is the insert to recording and recording_metadata
      serviceContext.dbConnections['core'].read._push([], true, [
        start,
        stop // verifies that times were converted correctly
      ]);
      // this is the final getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            str: 'test'
          }
        }
      ]);

      // get source content templates
      serviceContext.dbConnections['media_platform'].read._push([]);
      // scheduled job content templates
      serviceContext.dbConnections['media_platform'].read._push([]);

      // indexing
      //get org for application id
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '12345'
        }
      ]);

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);

      const res = await dalTdo.createTDO(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          organizationId: 7682,
          input: {
            organizationId: 7682,
            applicationId: '123',
            startDateTime: start,
            stopDateTime: moment(stop).valueOf(),
            parentFolderId: 'f0455964-c72f-4f17-a740-110bb7cfabf8',
            details: {
              str: 'test',
              veritoneFile: {
                fileName: 'foo.text',
                size: 100
              }
            },
            sourceData: {
              sourceId: '1234',
              scheduledJobId: '12345'
            }
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.applicationId).toEqual('123');
    });
    it('should create TDO success with valid taskId in sourceData', async function () {
      const start = moment().subtract(2, 'hour').toISOString();
      const stop = moment().subtract(1, 'hour').toISOString();
      const args = {
        organizationId: 7682,
        input: {
          organizationId: 7682,
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          startDateTime: start,
          stopDateTime: moment(stop).valueOf(),
          sourceData: {
            taskId: '19072809_PvS3K82ZKRS58iC'
          }
        }
      };
      const context = mockUtil.makeContext();

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );
      // addClusterDataToNewTdo -- serviceContext.dal.task.getTask
      serviceContext.dbConnections['core'].read._push([
        { id: '19072809_PvS3K82ZKRS58iC', job_id: '19072809_PvS3K82ZKR' }
      ]);
      // addClusterDataToNewTdo -- serviceContext.dal.job.getJob
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        '19072809_PvS3K82ZKR'
      );
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19072809_PvS3K82ZKR',
          cluster_id: 'onprem-82d53b71-ede3-4d67-b9c7-cac39c9d9de5'
        }
      ]);
      // createInMediaTable
      serviceContext.dbConnections['media_platform'].write._push([
        { media_id: 570003829 }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([]);
      // createInRecordingTable
      serviceContext.dbConnections['core'].write._push([
        { recording_id: 570003829 }
      ]);
      // getTDO -- _getTDO -- getAllRecordings
      serviceContext.dbConnections['core'].write._push([{ id: 570003829 }]);

      const res = await dalTdo.createTDO(context, args);

      expect(res).toBeDefined();
      expect(res.id).toEqual(570003829);
    });
    it('should succeed on valid input - add ACEs', async function () {
      const dateStr = moment().toISOString();
      const start = moment().subtract(2, 'hour').toISOString();
      const stop = moment().subtract(1, 'hour').toISOString();

      // get org for checking if the org can create new TDO
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_guid: 'guid',
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        }
      ]);
      // get group ID for org
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        //xxx
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1234',
          name: 'test source',
          organizationId: '7682',
          sourceTypeId: '123456'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          name: 'test source type',
          id: '123456'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: '1234',
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0',
          permission: 'owner'
        },
        {
          source_id: '1234',
          group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf1',
          permission: 'viewer'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            groupId: 'c0455964-c72f-4f17-a740-110bb7cfabf0',
            organizationId: 7682
          }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            groupId: 'c0455964-c72f-4f17-a740-110bb7cfabf1',
            organizationId: 7683
          }
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '12345',
          name: 'test scheduled job'
        }
      ]);
      // insert into media table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '123',
          created_date_time: dateStr,
          modified_date_time: dateStr
        }
      ]);

      // upsert media metadata
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // this is the insert to recording and recording_metadata
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [
          start,
          stop // verifies that times were converted correctly
        ],
        (sql, vars) => {
          // make sure we didn't insert any bogus keys
          if (vars.includes('recording-id')) return false;
          return true;
        }
      );
      // this is the final getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            str: 'test'
          }
        }
      ]);

      //get org for application id
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '12345'
        }
      ]);

      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // get source content templates
      serviceContext.dbConnections['media_platform'].read._push([
        {
          sdo_id: 'd0455964-c72f-4f17-a740-110bb7cfabf0',
          data_registry_id: 'd0455964-c72f-4f17-a740-110bb7cfabf1'
        }
      ]);
      // scheduled job content templates
      serviceContext.dbConnections['media_platform'].read._push([
        {
          sdo_id: 'a0455964-c72f-4f17-a740-110bb7cfabf0',
          data_registry_id: 'd0455964-c72f-4f17-a740-110bb7cfabf1'
        }
      ]);

      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            organizationId: '7682',
            dataRegistryMetadataId: 'd0455964-c72f-4f17-a740-110bb7cfabf1',
            id: 'd0455964-c72f-4f17-a740-110bb7cfabf1',
            schema: {},
            status: 'published',
            storageName: 'foo_bar'
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            name: 'test',
            organizationId: '7682',
            isSystem: false,
            id: 'd0455964-c72f-4f17-a740-110bb7cfabf1'
          }
        ],
        false
      );

      // SDOs
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            data: { foo: 'bar' }
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            data: { foo: 'bar2' }
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            data: { foo: 'bar3' }
          }
        ],
        false
      );

      // create content template assets
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: 'a1234'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: 'a1235'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          veritoneProgram: { foo: 'bar' }
        }
      ]);

      // get orgId for updating media usage
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '12345'
        }
      ]);
      // first new asset
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: '12345_a1',
          recording_id: '12345',
          content_type: 'video/mp4',
          uri: 'http://localhost/movie1',
          type: 'media'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          asset_id: '12345_a2',
          recording_id: '12345',
          content_type: 'video/quicktime',
          uri: 'http://localhost/movie2',
          type: 'media'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (arg1, arg2) => {
          expect(arg2.organizationId).toEqual(7682);
          expect(arg2.objectId).toEqual('123');
          expect(arg2.resourceType).toEqual('TDO');
          return Promise.resolve();
        }
      );

      await dalTdo.createTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          organizationId: 7682,
          applicationId: '123',
          startDateTime: start,
          stopDateTime: moment(stop).valueOf(),
          parentFolderId: 'f0455964-c72f-4f17-a740-110bb7cfabf8',
          details: {
            str: 'test',
            veritoneFile: {
              fileName: 'foo.text',
              size: 100
            },
            recordingId: 'foo'
          },
          sourceData: {
            sourceId: '1234',
            scheduledJobId: '12345'
          },
          assets: [
            {
              assetType: 'media',
              contentType: 'video/mp4',
              uri: 'http://localhost/movie/1',
              setAsPrimary: true
            },
            {
              assetType: 'media',
              contentType: 'video/quicktime',
              uri: 'http://localhost/movie/2'
            }
          ],
          addToIndex: false
        }
      });
    });
  });

  describe('#updateTDO', function () {
    beforeAll(function () {
      _.set(serviceContext, 'config.rateLimit.maxTDOMetadataSize', 500);
      _.merge(serviceContext.dal.application, { getAppIdFromOrgId: jest.fn() });
      _.merge(serviceContext.dal.user, { getDefaultOrgAdminUser: jest.fn() });
      _.merge(serviceContext.bll, {
        rbacAuth: {
          removeACEsFromResources: jest.fn()
        }
      });

      dalTdo = require('./tdo.js')(serviceContext);
    });

    it('should fail on over-large details', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix()
          }
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);

      try {
        await dalTdo.updateTDO(mockUtil.makeContext(), {
          organizationId: 7682,
          input: {
            id: '123',
            applicationId: '123',
            details: {
              bigstr: _.pad('test', 500)
            }
          }
        });
        jest.fail('did not error on over-large input');
      } catch (err) {
        if (err.name === 'AssertionError') throw err;
        expect(err.name).toEqual('invalid_input');
      }
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(3);
    });
    it('should throw not found if not tdo updated', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix()
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);

      try {
        await dalTdo.updateTDO(mockUtil.makeContext(), {
          organizationId: 7682,
          input: {
            id: '123',
            applicationId: '123',
            details: {
              str: 'test'
            }
          }
        });
        jest.fail('did not throw on no db update');
      } catch (err) {
        if (err.name === 'AssertionError') throw err;
        expect(err.name).toEqual('not_found');
      }
      expect(serviceContext.messageUtil._counter()).toEqual(1);
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(3);
    });
    it('should succeed on normal details 1', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123',
            application_id: '123',
            metadata: { str: 'test' }
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/modified_by\s=/);
          expect(params[1]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396'); // modifiedBy

          return true;
        }
      );

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);

      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '123',
          applicationId: '123',
          details: {
            str: 'test'
          }
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(6);
    });
    it('should succeed on normal details with only content templates added ', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);

      serviceContext.dbConnections['media_platform'].write._push([]);

      serviceContext.dbConnections['core'].write._push([{ id: 123 }]);

      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '123',
          applicationId: '123',
          contentTemplates: [
            {
              schemaId: '8bd4b00c-1492-44a2-a564-22bd449a7a84',
              data: {
                name: 'new-conten-template-2560007393',
                userId: '1223456789'
              }
            }
          ]
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(6);
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(6);
    });
    it('should succeed on normal details - tags', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);
      // get organization by id
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '123'
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '123',
          applicationId: '123',
          details: {
            tags: [{ label: 'test', value: 'test' }]
          }
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(4);
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(6);
    });
    it('should succeed on normal details - internal key', async function () {
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      const now = moment();
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          start_date_time: now.valueOf(),
          stop_date_time: now.valueOf(),
          json: {
            createdDateTime: now.unix(),
            modifiedDateTime: now.unix(),
            startDateTime: now.unix(),
            stopDateTime: now.unix(),
            status: 'downloaded'
          }
        }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf()
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      await dalTdo.updateTDO(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          organizationId: 7682,
          input: {
            id: '123',
            stopDateTime: now.add(5, 'minute').unix(),
            applicationId: '123',
            details: {
              str: 'test'
            }
          }
        }
      );
      expect(serviceContext.messageUtil._counter()).toEqual(4);
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(6);
    });
    // VE-26223: these values fail silently if wrong, so assert them explicitly.
    // - Use Unix seconds, not milliseconds, or the indexer will treat the previous
    //   window as >48h and skip cleanup.
    // - Use the pre-update TDO state; otherwise the previous/current windows are
    //   identical and cleanup never runs.
    it('should report the pre-update timespan to the indexer when a TDO is trimmed', async function () {
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);

      // The VE-26223 shape: ingest opened a provisional 900s window, ffprobe then
      // trimmed it to the real 15s duration.
      const start = moment('2026-08-06T00:00:00Z');
      const provisionalStop = start.clone().add(900, 'seconds');
      const trimmedStop = start.clone().add(15, 'seconds');

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          start_date_time: start.valueOf(),
          stop_date_time: provisionalStop.valueOf(),
          json: {
            createdDateTime: start.unix(),
            modifiedDateTime: start.unix(),
            startDateTime: start.unix(),
            stopDateTime: provisionalStop.unix(),
            status: 'downloaded'
          }
        }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);
      // The UPDATE's RETURNING row - the timespan as actually stored. The trim was
      // accepted here, so it matches what was requested.
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' },
          start_date_time: start.toISOString(),
          stop_date_time: trimmedStop.toISOString()
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: start.valueOf(),
          media_stop_time: trimmedStop.valueOf()
        }
      ]);
      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      await dalTdo.updateTDO(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          organizationId: 7682,
          input: {
            id: '123',
            stopDateTime: trimmedStop.unix(),
            applicationId: '123'
          }
        }
      );

      const indexEvent = _.find(
        serviceContext.messageUtil._messages(),
        (message) => message.event === 'recording_cognition_completed'
      );
      expect(indexEvent).toBeDefined();

      expect(indexEvent.payload.previousStartDateTime).toEqual(start.unix());
      expect(indexEvent.payload.previousStopDateTime).toEqual(
        provisionalStop.unix()
      );
      // Guards the seconds-vs-milliseconds half on its own: a millisecond value
      // would still satisfy "not the trimmed stop" below.
      expect(indexEvent.payload.previousStopDateTime).toBeLessThan(1e12);
      // And the pre-update half: the trimmed stop is the post-update value.
      expect(indexEvent.payload.previousStopDateTime).not.toEqual(
        trimmedStop.unix()
      );
    });

    // The fields are only carried when the indexer would actually delete something,
    // i.e. when the TDO got shorter. This is not just noise reduction: indexing-server
    // refuses to drop any event carrying them, so emitting them on every update would
    // exempt the whole updateTDO path from dedupe — worst for live TDOs, whose stop
    // time is pushed forward continuously.
    it('should not report a previous timespan when the TDO does not shrink', async function () {
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);

      const start = moment('2026-08-06T00:00:00Z');
      const stop = start.clone().add(60, 'seconds');
      const grownStop = start.clone().add(600, 'seconds');

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          start_date_time: start.valueOf(),
          stop_date_time: stop.valueOf(),
          json: {
            createdDateTime: start.unix(),
            modifiedDateTime: start.unix(),
            startDateTime: start.unix(),
            stopDateTime: stop.unix(),
            status: 'downloaded'
          }
        }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' },
          start_date_time: start.toISOString(),
          stop_date_time: grownStop.toISOString()
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: start.valueOf(),
          media_stop_time: grownStop.valueOf()
        }
      ]);
      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      await dalTdo.updateTDO(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          organizationId: 7682,
          input: {
            id: '123',
            stopDateTime: grownStop.unix(),
            applicationId: '123'
          }
        }
      );

      const indexEvent = _.find(
        serviceContext.messageUtil._messages(),
        (message) => message.event === 'recording_cognition_completed'
      );
      expect(indexEvent).toBeDefined();

      expect(indexEvent.payload).not.toHaveProperty('previousStartDateTime');
      expect(indexEvent.payload).not.toHaveProperty('previousStopDateTime');
    });

    // Under preventTrim the write is GREATEST(stop_date_time, $n), so a request to
    // shorten is discarded and the TDO never actually shrinks. Reporting one here would
    // be worse than a wasted field: indexing-server refuses to drop events carrying a
    // previous timespan, so a phantom shrink makes the event undroppable and defeats
    // dedupe on live TDOs - which are precisely the ones sending preventTrim.
    //
    // This is why the values must come from the UPDATE's returned row and not from the
    // request: the two differ only on this path.
    it('should not report a previous timespan when preventTrim discards the shorter stop', async function () {
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);

      const start = moment('2026-08-06T00:00:00Z');
      const savedStop = start.clone().add(900, 'seconds');
      const requestedStop = start.clone().add(15, 'seconds');

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          start_date_time: start.valueOf(),
          stop_date_time: savedStop.valueOf(),
          json: {
            createdDateTime: start.unix(),
            modifiedDateTime: start.unix(),
            startDateTime: start.unix(),
            stopDateTime: savedStop.unix(),
            status: 'downloaded'
          }
        }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '12345' }
      ]);
      // The UPDATE's RETURNING row: GREATEST kept the longer stop, so the stored
      // timespan is unchanged even though a shorter one was requested.
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' },
          start_date_time: start.toISOString(),
          stop_date_time: savedStop.toISOString()
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: start.valueOf(),
          media_stop_time: savedStop.valueOf()
        }
      ]);
      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      await dalTdo.updateTDO(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          organizationId: 7682,
          input: {
            id: '123',
            stopDateTime: requestedStop.unix(),
            flags: ['preventTrim'],
            applicationId: '123'
          }
        }
      );

      const indexEvent = _.find(
        serviceContext.messageUtil._messages(),
        (message) => message.event === 'recording_cognition_completed'
      );
      expect(indexEvent).toBeDefined();

      expect(indexEvent.payload).not.toHaveProperty('previousStartDateTime');
      expect(indexEvent.payload).not.toHaveProperty('previousStopDateTime');
    });

    it('should handle name change correctly', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);
      // get organization by id
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      // updateTDODb
      let updateTdoArgs;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123',
            application_id: '123',
            metadata: { str: 'test' }
          }
        ],
        true,
        [],
        (sql, args) => {
          updateTdoArgs = args;
          return true;
        }
      );

      // updateMediaDb
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '123'
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      const veritoneFile = {
        fileName: 'original-file.mp4',
        mimetype: 'video/mp4',
        duration: 10,
        segmented: true,
        hasAudio: false,
        hasVideo: true,
        videoFrameRate: true,
        width: 500,
        height: 300
      };

      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '123',
          applicationId: '123',
          name: 'sample.mp4',
          details: {
            veritoneFile
          }
        }
      });
      expect(serviceContext.messageUtil._counter()).toEqual(4);

      expect(updateTdoArgs.length).toEqual(7);
      expect(updateTdoArgs[3]).toEqual('veritone-file');
      expect(JSON.parse(updateTdoArgs[4])).toEqual(
        _.merge({ fileName: 'sample.mp4' }, veritoneFile)
      );
    });

    it('should update veritone-file blob when name changes via details.veritoneFile.fileName', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '456',
          application_id: '456',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      let updateTdoArgs;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '456',
            application_id: '456',
            metadata: { str: 'test' }
          }
        ],
        true,
        [],
        (sql, args) => {
          updateTdoArgs = args;
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '456',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '456'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      const veritoneFile = {
        fileName: 'from-details.mp4',
        mimetype: 'video/mp4',
        duration: 15
      };

      // Test when input.name is not provided but details.veritoneFile.fileName is
      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '456',
          applicationId: '456',
          details: {
            veritoneFile
          }
        }
      });

      expect(updateTdoArgs.length).toEqual(7);
      expect(updateTdoArgs[3]).toEqual('veritone-file');
      expect(JSON.parse(updateTdoArgs[4])).toEqual(
        _.merge({ fileName: 'from-details.mp4' }, veritoneFile)
      );
    });

    it('should create new veritone-file blob when name changes but no existing blob', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '789',
          application_id: '789',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      let updateTdoArgs;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '789',
            application_id: '789',
            metadata: { str: 'test' }
          }
        ],
        true,
        [],
        (sql, args) => {
          updateTdoArgs = args;
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '789',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '789'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      // Test when name changes but no veritoneFile in details
      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '789',
          applicationId: '789',
          name: 'new-file-name.mp4',
          details: {
            someOtherMetadata: {
              value: 'test'
            }
          }
        }
      });

      // Should have created a new veritone-file blob
      expect(updateTdoArgs.length).toEqual(9); // 7 base + 2 for new blob
      const veritoneFileIndex = updateTdoArgs.indexOf('veritone-file');
      expect(veritoneFileIndex).toBeGreaterThan(-1);
      expect(JSON.parse(updateTdoArgs[veritoneFileIndex + 1])).toEqual({
        fileName: 'new-file-name.mp4'
      });
    });

    it('should preserve other properties when updating veritone-file blob fileName', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '101112',
          application_id: '101112',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      let updateTdoArgs;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '101112',
            application_id: '101112',
            metadata: { str: 'test' }
          }
        ],
        true,
        [],
        (sql, args) => {
          updateTdoArgs = args;
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '101112',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '101112'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      const veritoneFile = {
        fileName: 'original-complex-file.mp4',
        mimetype: 'video/mp4',
        duration: 120,
        size: 524288000,
        segmented: true,
        hasAudio: true,
        hasVideo: true,
        videoFrameRate: 30,
        width: 1920,
        height: 1080,
        customProperty: 'custom-value'
      };

      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '101112',
          applicationId: '101112',
          name: 'renamed-complex-file.mp4',
          details: {
            veritoneFile
          }
        }
      });

      expect(updateTdoArgs.length).toEqual(7);
      expect(updateTdoArgs[3]).toEqual('veritone-file');
      const updatedBlob = JSON.parse(updateTdoArgs[4]);

      // Should update fileName but preserve all other properties
      expect(updatedBlob.fileName).toEqual('renamed-complex-file.mp4');
      expect(updatedBlob.mimetype).toEqual('video/mp4');
      expect(updatedBlob.duration).toEqual(120);
      expect(updatedBlob.size).toEqual(524288000);
      expect(updatedBlob.segmented).toEqual(true);
      expect(updatedBlob.hasAudio).toEqual(true);
      expect(updatedBlob.hasVideo).toEqual(true);
      expect(updatedBlob.videoFrameRate).toEqual(30);
      expect(updatedBlob.width).toEqual(1920);
      expect(updatedBlob.height).toEqual(1080);
      expect(updatedBlob.customProperty).toEqual('custom-value');
    });

    it('should handle input.name taking precedence over details.veritoneFile.fileName', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '131415',
          application_id: '131415',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      let updateTdoArgs;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '131415',
            application_id: '131415',
            metadata: { str: 'test' }
          }
        ],
        true,
        [],
        (sql, args) => {
          updateTdoArgs = args;
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '131415',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '131415'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      const veritoneFile = {
        fileName: 'details-file-name.mp4',
        mimetype: 'video/mp4',
        duration: 60
      };

      // Test precedence: input.name should override details.veritoneFile.fileName
      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '131415',
          applicationId: '131415',
          name: 'input-name-wins.mp4', // This should take precedence
          details: {
            veritoneFile
          }
        }
      });

      expect(updateTdoArgs.length).toEqual(7);
      expect(updateTdoArgs[3]).toEqual('veritone-file');
      const updatedBlob = JSON.parse(updateTdoArgs[4]);

      // Should use input.name, not details.veritoneFile.fileName
      expect(updatedBlob.fileName).toEqual('input-name-wins.mp4');
      expect(updatedBlob.mimetype).toEqual('video/mp4');
      expect(updatedBlob.duration).toEqual(60);
    });

    it('should not create veritone-file blob when name does not change', async function () {
      const now = moment();
      _.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '161718',
          application_id: '161718',
          json: {
            createdDateTime: moment().unix(),
            modifiedDateTime: moment().unix(),
            status: 'downloaded'
          }
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);

      let updateTdoArgs;
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '161718',
            application_id: '161718',
            metadata: { str: 'test' }
          }
        ],
        true,
        [],
        (sql, args) => {
          updateTdoArgs = args;
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '161718',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf(),
          application_id: '161718'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      // Test when only non-name fields change
      await dalTdo.updateTDO(mockUtil.makeContext(), {
        organizationId: 7682,
        input: {
          id: '161718',
          applicationId: '161718',
          description: 'Updated description only',
          details: {
            someMetadata: {
              value: 'test-value'
            }
          }
        }
      });

      // The key assertion: should not create veritone-file blob when name doesn't change
      expect(updateTdoArgs.indexOf('veritone-file')).toEqual(-1);
      // Should have some metadata but not veritone-file
      expect(updateTdoArgs.length).toBeGreaterThan(5); // Base args + metadata blobs
    });
  });

  describe('#getFieldFilter()', function () {
    const filters = [
      {
        toDateTime: '2017-10-19T07:35:31.000Z',
        field: 'startDateTime'
      },
      {
        fromDateTime: '2017-10-19T07:35:31.000Z',
        field: 'stopDateTime'
      }
    ];
    it('should return by field', function () {
      expect(dalTdo.getFieldFilter(filters, 'startDateTime')).toBeDefined();
      expect(dalTdo.getFieldFilter(filters, 'stopDateTime')).toBeDefined();
    });
    it('should return by field and op', function () {
      expect(
        dalTdo.getFieldFilter(filters, 'startDateTime', 'toDateTime')
      ).toBeDefined();
      expect(
        dalTdo.getFieldFilter(filters, 'stopDateTime', 'fromDateTime')
      ).toBeDefined();
    });
    it('should return ! for no match', function () {
      expect(
        dalTdo.getFieldFilter(filters, 'startDateTime', 'fromDateTime')
      ).toBeUndefined();
      expect(
        dalTdo.getFieldFilter(filters, 'stopDateTime', 'toDateTime')
      ).toBeUndefined();
      expect(
        dalTdo.getFieldFilter(filters, 'noField', 'toDateTime')
      ).toBeUndefined();
    });
  });

  describe('#deleteTDO', function () {
    beforeAll(function () {
      jest.mock('../util/presigner.s3.buckets', () => ({
        init: jest.fn(),
        getInstance: jest.fn(() => ({
          getDeletableUris: jest.fn((uri) => Promise.resolve({ primaryUri: uri, fallbackUri: null }))
        }))
      }));
      _.merge(serviceContext, {
        dal: {
          organization: {
            getOrganization: jest.fn()
          }
        },
        bll: {
          rbacAuth: {
            removeACEsFromResources: jest.fn()
          }
        }
      });
    });
    afterAll(function () {
      jest.resetModules();
    });

    it('should delete a TDO', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: 'a123'
        }
      ]);
      // mock for serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);

      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [
          {
            details: {
              veritoneProgram: {
                foo: 'bar'
              },
              veritoneFile: {
                foo: 'bar'
              },
              veritoneClone: {
                cloneBlobs: false,
                // tests that we don't delete a cloned asset's content.
                // ID should match one that we add to the assets list below.
                newAssetIdsToOldAssetIds: {
                  '123-cloned1': '45600002_cloned1'
                }
              }
            }
          }
        ],
        false
      );
      // _getAssetsToDeleteByTdoId
      const assets1 = [];
      // tests paging - makes sure we cover all 40 assets
      for (let i = 0; i < 30; i++) {
        assets1.push({
          id: `123-${i}`,
          containerId: '123',
          uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-${i}`
        });
      }
      serviceContext.dbConnections['core'].read._push(assets1);
      const assets2 = [];
      for (let i = 0; i < 10; i++) {
        assets2.push({
          id: `123-${i + 30}`,
          containerId: '123',
          uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-${i + 30}`
        });
      }
      assets2.push({
        // tests that we don't delete that asset's content
        id: '123-cloned1',
        containerId: '123',
        uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
      });
      // tests that we don't delete an asset not in our bucket
      assets2.push({
        id: `123-31`,
        containerId: '123',
        uri: `https://not-our-bucket.s3.amazonaws.com/not/our/bucket`
      });
      serviceContext.dbConnections['core'].read._push(assets2);
      // --- End mock _getAssetsToDeleteByTdoId

      // deleteTDODb
      serviceContext.dbConnections['core'].write._push([]);
      // deleteTDOMediaDb
      serviceContext.dbConnections['media_platform'].write._push([
        { mention_id: 1234, organization_id: 7682, mention_date: new Date() }
      ]);
      // deleteMetadataByTDO
      serviceContext.dbConnections['core'].write._push([], false, [
        'recording_metadata',
        'recording_id'
      ]);

      // deleteAssetsByTDO
      serviceContext.dbConnections['core'].write._push([], false, [
        'recording_asset',
        'recording_id',
        'asset_id = ANY'
      ]);
      // mock for serviceContext.dal.organization.setLastAssetUpdatedDate
      serviceContext.dbConnections['media_platform'].write._push([]);

      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return Promise.resolve({
          organizationId: 1000
        });
      });

      serviceContext.bll.rbacAuth.removeACEsFromResources.mockImplementation(
        (ctx, rbacArgs) => {
          expect(rbacArgs.resourceType).toEqual('TDO');
          expect(rbacArgs.ids.length).toBeGreaterThan(0);
        }
      );

      const res = await dalTdo.deleteTDO(mockUtil.makeContext(), {
        id: '123',
        applicationId: 'a123'
      });
      // this verifies that we actually cleaned up the correct number
      // of assets.
      expect(serviceContext.storage._deleteAssetCounter()).toEqual(40);
      // note that we did NOT add query results for the asset URI
      // cleanup queries. this is not necessary when deleting the TDO
      // because the entire asset row is deleted

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(6);
      expect(serviceContext.messageUtil._counter()).toEqual(4);
      // verify internal and public events were sent
      expect(serviceContext.messageUtil._messages()[0].event).toEqual(
        'recording_deleted'
      );
      expect(serviceContext.messageUtil._messages()[1].event).toEqual(
        'recording_deleted'
      );
      expect(serviceContext.messageUtil._messages()[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success'
        })
      );
      expect(serviceContext.messageUtil._messages()[2].event).toEqual(
        'asset_metadata_deleted'
      );
      expect(serviceContext.messageUtil._messages()[3].event).toEqual(
        'mentions_deleted'
      );
      expect(
        serviceContext.bll.rbacAuth.removeACEsFromResources
      ).toHaveBeenCalled();
    });
  });

  describe('#cleanupTDO', function () {
    it('should handle storage-only cleanup', async function () {});
  });

  describe('#updateFolderInSearchIndex', function () {
    it('should emit event', async function () {
      await dalTdo.updateFolderInSearchIndex({}, { id: 123 });
      expect(serviceContext.messageUtil._counter()).toEqual(1);
      // verify internal and public events were sent
      expect(serviceContext.messageUtil._messages()[0].event).toEqual(
        'recording_folder_changed'
      );
      expect(serviceContext.messageUtil._messages()[0].recordingId).toEqual(
        123
      );
    });
  });

  describe('#getEngineRuns', function () {
    it('should get engine runs', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123_a123',
          asset_id: '123_a123',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine using sourceEngineId key
            sourceName: 'test engine',
            sourceEngineId: 'e123',
            sourceTaskId: '123abc_1'
          }
        },
        {
          id: '123_a124',
          asset_id: '123_a124',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_d: '123',
          recording_d: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine using source key
            sourceName: 'test engine 2',
            source: 'e124',
            sourceTaskId: '124abc_2'
          }
        },
        {
          id: '123_a125',
          asset_id: '123_a125',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine by alias
            sourceName: 'aliased engine',
            sourceEngineId: 'e126',
            sourceTaskId: '126abc_1'
          }
        },
        {
          id: '123_a125',
          asset_id: '123_a125',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // weird case - engine ID but no task
            sourceName: 'engine without task',
            sourceEngineId: 'e128'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e128',
          alias_id: 'e128',
          name: 'engine without task reference'
        }
      ]);

      const tdoStart = moment().subtract(2, 'hour');
      const tdoStop = tdoStart.add(1, 'hour');
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          start_date_time: tdoStart.toISOString(),
          stop_date_time: tdoStop.toISOString(),
          created_date_time: tdoStart.toISOString(),
          modified_date_time: tdoStart.toISOString(),
          is_public: false,
          application_id: 'a123',
          json: {
            startDateTime: tdoStart.unix(),
            stopDateTime: tdoStop.unix(),
            createdDateTime: tdoStart.unix(),
            modifiedDateTime: tdoStart.unix()
          }
        }
      ]);
      // the tasks.
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123abc_1', // source task for first asset
          engine_id: 'e123',
          status: 'complete'
        },
        {
          id: 'e123abc_9', // different task for same engine - should not be used
          engine_id: 'e123',
          status: 'complete'
        },
        {
          id: '124abc_2', // source task for second asset
          engine_id: 'e124',
          status: 'complete'
        },
        {
          id: '124abc_3', // different task for same engine
          engine_id: 'e124',
          status: 'failed'
        },
        {
          id: '124abc_11', // totally unrelated engine with no result output
          engine_id: 'e333',
          status: 'complete'
        },
        {
          id: '126abc_1', // for engine referenced by alias
          engine_id: 'e126',
          status: 'complete'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'unrelated-engine',
          name: 'unrelated engine',
          alias_id: 'e333'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'unrelated-engine',
          name: 'unrelated engine',
          alias_id: 'e333'
        },
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        },
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        },
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);

      // query for transcript assets. empty for now. TODO test.
      serviceContext.dbConnections['core'].read._push([]);
      const res = await dalTdo.getEngineRuns(
        { id: '123' },
        {
          offset: 0,
          limit: 10
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(4);
      expect(res.records).toBeDefined();
      expect(res.records.length).toEqual(4);

      expect(res.records[0].task).toBeDefined();
      expect(res.records[0].task.id).toEqual('124abc_11');
      expect(res.records[0].engine).toBeDefined();
      expect(res.records[0].engine.id).toEqual('e333');

      expect(res.records[1].task).toBeDefined();
      expect(res.records[1].task.id).toEqual('126abc_1');
      expect(res.records[1].engine).toBeDefined();
      expect(res.records[1].engine.id).toEqual('e126');

      expect(res.records[2].task).toBeDefined();
      expect(res.records[2].task.id).toEqual('123abc_1');
      expect(res.records[2].engine).toBeDefined();
      // below verifies that alias ID was returned instead of real one
      expect(res.records[2].engine.id).toEqual('a123');

      expect(res.records[3].task).toBeDefined();
      expect(res.records[3].task.id).toEqual('124abc_2');
      expect(res.records[3].engine).toBeDefined();
      expect(res.records[3].engine.id).toEqual('e124');
    });
    it('should get engine runs - handle missing engines', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123_a123',
          asset_id: '123_a123',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine using sourceEngineId key
            sourceName: 'test engine',
            sourceEngineId: 'e123',
            sourceTaskId: '123abc_1'
          }
        },
        {
          id: '123_a124',
          asset_id: '123_a124',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_d: '123',
          recording_d: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine using source key
            sourceName: 'test engine 2',
            source: 'e124',
            sourceTaskId: '124abc_2'
          }
        },
        {
          id: '123_a125',
          asset_id: '123_a125',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine by alias
            sourceName: 'aliased engine',
            sourceEngineId: 'e126',
            sourceTaskId: '126abc_1'
          }
        },
        {
          id: '123_a125',
          asset_id: '123_a125',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // weird case - engine ID but no task
            sourceName: 'engine without task',
            sourceEngineId: 'e128'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      // test_engine_2 not found
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e128',
          alias_id: 'e128',
          name: 'engine without task reference'
        }
      ]);

      const tdoStart = moment().subtract(2, 'hour');
      const tdoStop = tdoStart.add(1, 'hour');
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          start_date_time: tdoStart.toISOString(),
          stop_date_time: tdoStop.toISOString(),
          created_date_time: tdoStart.toISOString(),
          modified_date_time: tdoStart.toISOString(),
          is_public: false,
          application_id: 'a123',
          json: {
            startDateTime: tdoStart.unix(),
            stopDateTime: tdoStop.unix(),
            createdDateTime: tdoStart.unix(),
            modifiedDateTime: tdoStart.unix()
          }
        }
      ]);
      // the tasks.
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123abc_1', // source task for first asset
          engine_id: 'e123',
          status: 'complete'
        },
        {
          id: 'e123abc_9', // different task for same engine - should not be used
          engine_id: 'e123',
          status: 'complete'
        },
        {
          id: '124abc_2', // source task for second asset
          engine_id: 'e124',
          status: 'complete'
        },
        {
          id: '124abc_3', // different task for same engine
          engine_id: 'e124',
          status: 'failed'
        },
        {
          id: '124abc_11', // totally unrelated engine with no result output
          engine_id: 'e333',
          status: 'complete'
        },
        {
          id: '126abc_1', // for engine referenced by alias
          engine_id: 'e126',
          status: 'complete'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'unrelated-engine',
          name: 'unrelated engine',
          alias_id: 'e333'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'unrelated-engine',
          name: 'unrelated engine',
          alias_id: 'e333'
        },
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        },
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        },
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);

      // query for transcript assets. empty for now. TODO test.
      serviceContext.dbConnections['core'].read._push([]);
      const res = await dalTdo.getEngineRuns(
        { id: '123' },
        {
          offset: 0,
          limit: 10
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(4);
      expect(res.records).toBeDefined();
      expect(res.records.length).toEqual(4);

      expect(res.records[0].task).toBeDefined();
      expect(res.records[0].task.id).toEqual('124abc_11');
      expect(res.records[0].engine).toBeDefined();
      expect(res.records[0].engine.id).toEqual('e333');

      expect(res.records[1].task).toBeDefined();
      expect(res.records[1].task.id).toEqual('126abc_1');
      expect(res.records[1].engine).toBeDefined();
      expect(res.records[1].engine.id).toEqual('e126');

      expect(res.records[2].task).toBeDefined();
      expect(res.records[2].task.id).toEqual('123abc_1');
      expect(res.records[2].engine).toBeDefined();
      // below verifies that alias ID was returned instead of real one
      expect(res.records[2].engine.id).toEqual('a123');

      expect(res.records[3].task).toBeDefined();
      expect(res.records[3].task.id).toEqual('124abc_2');
      expect(res.records[3].engine).toBeDefined();
      expect(res.records[3].engine.id).toEqual('e124');
    });
    it('should get engine runs - handle missing engines', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123_a123',
          asset_id: '123_a123',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine using sourceEngineId key
            sourceName: 'test engine',
            sourceEngineId: 'e123',
            sourceTaskId: '123abc_1'
          }
        },
        {
          id: '123_a124',
          asset_id: '123_a124',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_d: '123',
          recording_d: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine using source key
            sourceName: 'test engine 2',
            source: 'e124',
            sourceTaskId: '124abc_2'
          }
        },
        {
          id: '123_a125',
          asset_id: '123_a125',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // references engine by alias
            sourceName: 'aliased engine',
            sourceEngineId: 'e126',
            sourceTaskId: '126abc_1'
          }
        },
        {
          id: '123_a125',
          asset_id: '123_a125',
          content_type: 'application/json',
          type: 'vtn-standard',
          container_id: '123',
          recording_id: '123',
          created_date_time: moment().valueOf(),
          modified_date_time: moment().valueOf(),
          user_edited: false,
          metadata: {
            // weird case - engine ID but no task
            sourceName: 'engine without task',
            sourceEngineId: 'e128'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      // test_engine_2 not found
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e128',
          alias_id: 'e128',
          name: 'engine without task reference'
        }
      ]);

      const tdoStart = moment().subtract(2, 'hour');
      const tdoStop = tdoStart.add(1, 'hour');
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          start_date_time: tdoStart.toISOString(),
          stop_date_time: tdoStop.toISOString(),
          created_date_time: tdoStart.toISOString(),
          modified_date_time: tdoStart.toISOString(),
          is_public: false,
          application_id: 'a123',
          json: {
            startDateTime: tdoStart.unix(),
            stopDateTime: tdoStop.unix(),
            createdDateTime: tdoStart.unix(),
            modifiedDateTime: tdoStart.unix()
          }
        }
      ]);
      // the tasks.
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123abc_1', // source task for first asset
          engine_id: 'e123',
          status: 'complete'
        },
        {
          id: 'e123abc_9', // different task for same engine - should not be used
          engine_id: 'e123',
          status: 'complete'
        },
        {
          id: '124abc_2', // source task for second asset
          engine_id: 'e124',
          status: 'complete'
        },
        {
          id: '124abc_3', // different task for same engine
          engine_id: 'e124',
          status: 'failed'
        },
        {
          id: '124abc_11', // totally unrelated engine with no result output
          engine_id: 'e333',
          status: 'complete'
        },
        {
          id: '126abc_1', // for engine referenced by alias
          engine_id: 'e126',
          status: 'complete'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'unrelated-engine',
          name: 'unrelated engine',
          alias_id: 'e333'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'unrelated-engine',
          name: 'unrelated engine',
          alias_id: 'e333'
        },
        {
          id: 'aliased-engine',
          alias_id: 'e126',
          name: 'aliased engine'
        },
        {
          id: 'e123',
          alias_id: 'a123',
          name: 'test engine'
        },
        {
          id: 'e124',
          alias_id: 'e124',
          name: 'test engine 2'
        }
      ]);

      // query for transcript assets. empty for now. TODO test.
      serviceContext.dbConnections['core'].read._push([]);
      const res = await dalTdo.getEngineRuns(
        { id: '123' },
        {
          offset: 0,
          limit: 10
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.count).toEqual(4);
      expect(res.records).toBeDefined();
      expect(res.records.length).toEqual(4);

      expect(res.records[0].task).toBeDefined();
      expect(res.records[0].task.id).toEqual('124abc_11');
      expect(res.records[0].engine).toBeDefined();
      expect(res.records[0].engine.id).toEqual('e333');

      expect(res.records[1].task).toBeDefined();
      expect(res.records[1].task.id).toEqual('126abc_1');
      expect(res.records[1].engine).toBeDefined();
      expect(res.records[1].engine.id).toEqual('e126');

      expect(res.records[2].task).toBeDefined();
      expect(res.records[2].task.id).toEqual('123abc_1');
      expect(res.records[2].engine).toBeDefined();
      // below verifies that alias ID was returned instead of real one
      expect(res.records[2].engine.id).toEqual('a123');

      expect(res.records[3].task).toBeDefined();
      expect(res.records[3].task.id).toEqual('124abc_2');
      expect(res.records[3].engine).toBeDefined();
      expect(res.records[3].engine.id).toEqual('e124');
    });
  });

  describe('#addMediaSegment', function () {
    it('should add media segment and set primary asset', async function () {
      const now = moment();
      serviceContext.dbConnections['core'].read._push([
        {
          // initial get TDO
          id: '123',
          application_id: 'a123',
          start_date_time: now.valueOf(),
          stop_date_time: now.valueOf(),
          json: {
            startDateTime: now.unix(),
            stopDateTime: now.unix()
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        /*{ // get asset
        id: '123_a2',
        container_id: '123',
        applicationId: 'a123',
        type: 'media-mdp',
        content_type: 'application/json',
        uri: 'http://localhost:3000/what'
      }*/
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7682,
            name: 'test org',
            kvp: {}
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '123_a123',
            recording_id: '123',
            type: 'media-mdp',
            content_type: 'application/json',
            uri:
              'https://s3.amazonaws.com/dev-api.veritone.com/64712779-b6ea-4d5f-95c9-10c1f6f271f2',
            user_edited: false
          }
        ],
        true,
        ['mediaMdpAsset', 'jsonb_set']
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: '123',
          application_id: 'a123',
          start_date_time: now.valueOf(),
          stop_date_time: now.add(10, 'seconds').valueOf(),
          json: {
            startDateTime: now.unix(),
            stopDateTime: now.add(10, 'seconds').unix()
          }
        }
      ]);
      const res = await dalTdo.addMediaSegment(mockUtil.makeContext(), {
        input: {
          containerId: '123',
          url: 'http://localhost:3000/what',
          details: {
            segmentStartTimeMs: 0,
            segmentStopTimeMs: 2000
          }
        }
      });
    });
  });

  describe('#getStreamManifest', function () {
    let rutil,
      oneSegmentMdpUri,
      oneSegmentMdp,
      multiSegmentMdpUri,
      multiSegmentMdp;

    beforeAll(function () {
      oneSegmentMdpUri = 'http://localhost:3000/oneSegmentMdp';
      oneSegmentMdp = mockMdpData(1);
      multiSegmentMdpUri = 'http://localhost:3000/multiSegmentMdp';
      multiSegmentMdp = mockMdpData(3);
      // Mock download MDP file
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => {
        return {
          getSignedUrl: (uri, bucket, fn) => Promise.resolve(uri),
          download: (uri, context) => {
            if (uri === oneSegmentMdpUri) {
              return Promise.resolve(JSON.stringify(oneSegmentMdp));
            } else {
              return Promise.resolve(JSON.stringify(multiSegmentMdp));
            }
          }
        };
      });

      serviceContext = initializeServiceContext();
      dalTdo = require('./tdo.js')(serviceContext);
    });
    afterAll(() => {
      jest.resetModules();
    });

    it('should get manifest from redis cache', async function () {
      const tdoId = 123;
      const key =
        'core-graphql-server:TemporalDataObject:ManifestMDPFile:' + tdoId;
      // add it to redis "cache"
      const value = mockMdpData(4);
      serviceContext.redisClient.set(key, JSON.stringify(value));
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1300001584_La5qM8G4MT',
          assetId: '1300001584_La5qM8G4MT',
          uri: oneSegmentMdpUri,
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: {},
          containerId: '1300001584',
          recordingId: '1300001584',
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        }
      ]);
      // should succeed without hitting database
      const res = await dalTdo.getStreamManifest(mockUtil.makeContext(), {
        id: tdoId
      });
      expect(res).toBeDefined();
      expect(res.segments).toBeDefined();
      expect(res.segments.length).toEqual(5); // num seg + init
    });
    it('should process multiple mdp assets', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1300001584_La5qM8G4MT',
          assetId: '1300001584_La5qM8G4MT',
          uri: oneSegmentMdpUri,
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: {},
          containerId: '1300001584',
          recordingId: '1300001584',
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        }
      ]); // get assets
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1300001584_La5qM8G4MT',
          assetId: '1300001584_La5qM8G4MT',
          uri: oneSegmentMdpUri,
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: {},
          containerId: '1300001584',
          recordingId: '1300001584',
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        },
        {
          id: 'asset2',
          assetId: 'asset2',
          uri: multiSegmentMdpUri,
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: {},
          containerId: '123',
          recordingId: '123',
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        },
        {
          id: 'asset3',
          assetId: 'asset3',
          uri: oneSegmentMdpUri,
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: {},
          containerId: '123',
          recordingId: '123',
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        }
      ]); // get assets
      const res = await dalTdo.getStreamManifest(mockUtil.makeContext(), {
        id: '123'
      });
      expect(res).toBeDefined();
      expect(res.initSegment).toBeDefined();
      expect(res.initSegment.url).toEqual('http://segment/0');
      expect(res.segments.length).toEqual(3);
    });
  });

  describe('#getPrimaryAsset', function () {
    // Skipped. See https://github.com/veritone/aiware-core/issues/345.
    xit('should not use stale cached num segments', async function () {
      serviceContext._clearAll();

      // empty details - no segments
      serviceContext.dbConnections['core'].read._push([{ details: {} }], false);
      // media-mdp - empty (no segments)
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([]); // media-init
      let res = await dalTdo.getPrimaryAsset(
        mockUtil.makeContext(),
        {
          modifiedDateTime: moment().subtract(15, 'minute').valueOf(),
          id: '123'
        },
        {
          assetType: 'media'
        }
      );
      expect(res).toBeUndefined();

      // clear redis to make sure we don't pick up from mock redis
      // since we are testing for a bug in local caching
      serviceContext.redisClient._clear();

      serviceContext.dbConnections['core'].read._push([{ details: {} }], false);
      serviceContext.dbConnections['core'].read._push([{ id: 'a123' }]); // media-mdp
      serviceContext.dbConnections['core'].read._push([
        {
          source_id: 123
        }
      ]);
      serviceContext.dbConnections['core'].read._push([]); // media-init

      res = await dalTdo.getPrimaryAsset(
        mockUtil.makeContext(),
        {
          modifiedDateTime: moment().subtract(15, 'minute').valueOf(),
          id: '123'
        },
        {
          assetType: 'media'
        }
      );
      // verify format of primary asset
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.contentType).toEqual('video/mp4');
      expect(res.assetType).toEqual('media');
      expect(res.containerId).toEqual('123');
      expect(res.details).toBeDefined();
      expect(res.details.virtualAsset).toEqual(true);
      expect(res.uri).toBeDefined();
      expect(res.uri).toEqual(
        expect.arrayContaining('media-streamer/download/tdo/123')
      );
    });
  });

  describe('#getFakeMediaAsset', function () {
    const tdoId = '123';
    const testContentType = 'test/test';
    let rutil;
    beforeAll(function () {
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => {
        return {
          isSuperAdmin: (authInfo) => true
        };
      });
      serviceContext = initializeServiceContext();
      dalTdo = require('./tdo.js')(serviceContext);
    });
    afterAll(() => {
      jest.resetModules();
    });

    it('should return default if no media inits or details', async function () {
      // getTDOSourceData
      serviceContext.dbConnections['core'].read._push([]);
      // getMediaInitAssets
      serviceContext.dbConnections['core'].read._push([]);
      // getTDODetails
      serviceContext.dbConnections['core'].read._push([], false);
      const res = await dalTdo.getFakeMediaAsset(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          id: '123'
        }
      );
      expect(res).toBeDefined();
      expect(res.id).toEqual('VlRBOm1lZGlhOjEyMw==');
      expect(res.containerId).toEqual(tdoId);
      expect(res.details.virtualAsset).toEqual(true);
      expect(res.contentType).toEqual('video/mp4');
    });
    it('should get contentType from media init', async function () {
      // getTDOSourceData
      serviceContext.dbConnections['core'].read._push([{}]);
      // getMediaInitAssets
      serviceContext.dbConnections['core'].read._push([
        {
          assetId: '123_456',
          content_type: testContentType
        }
      ]);
      // getTDODetails
      serviceContext.dbConnections['core'].read._push([{ details: {} }], false);
      const res = await dalTdo.getFakeMediaAsset(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          id: '123'
        }
      );
      expect(res.contentType).toEqual(testContentType);
    });
    it('should get contentType from veritone file mimetype', async function () {
      // getTDOSourceData
      serviceContext.dbConnections['core'].read._push([{}]);
      // getMediaInitAssets
      serviceContext.dbConnections['core'].read._push([]);
      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [{ details: { veritoneFile: { mimetype: testContentType } } }],
        false
      );
      const res = await dalTdo.getFakeMediaAsset(
        mockUtil.makeContext({ authType: 'api_internal' }),
        {
          id: '123'
        }
      );
      expect(res.contentType).toEqual(testContentType);
    });
    it('should get uri media-streamer for portable cluster', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const tdo = { id: 570003829 };

      // util.getMediaStreamerUri
      serviceContext.dbConnections['core'].read._push([
        {
          content: { clusterId: 'onprem-82d53b71-ede3-4d67-b9c7-cac39c9d9de5' }
        }
      ]);
      // serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'onprem-82d53b71-ede3-4d67-b9c7-cac39c9d9de5',
          type: 'OnPrem',
          cluster_config: {
            managementNodeId: '0c823dc5-b6c8-4ef0-b4c8-15089644fa7c'
          }
        }
      ]);
      // serviceContext.dal.clusterNode.getClusterNode
      serviceContext.dbConnections['core'].read._push([
        {
          id: '0c823dc5-b6c8-4ef0-b4c8-15089644fa7c',
          metrics: {
            mbRam: 8678,
            mbDisk: 36157,
            cpuCount: 24,
            ipExternal: '66.85.101.182',
            ipInternal: '10.17.21.1'
          }
        }
      ]);
      // getTDOSourceData -- serviceContext.dal.shared.getTDOSourceTaskData
      serviceContext.dbConnections['core'].read._push([
        {
          content: { clusterId: 'onprem-82d53b71-ede3-4d67-b9c7-cac39c9d9de5' }
        }
      ]);
      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [{ details: { veritoneFile: { mimetype: testContentType } } }],
        false
      );

      try {
        res = await dalTdo.getFakeMediaAsset(context, tdo);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.containerId).toEqual(570003829);
      expect(res.uri).toEqual(
        'http://66.85.101.182/media-streamer/download/tdo/570003829'
      );
      expect(res.details.virtualAsset).toEqual(true);
    });
  });

  describe('#addSourceDataToNewTdo', function () {
    it('should not add customer success owner acl for media with private source', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.organizationId', 17560);
      const input = {
        sourceId: -1,
        applicationId: 'cf05552b-52e0-46fa-8f7f-4c9eee135c51',
        organizationId: 17560
      };
      const jsondata = {};
      const details = {
        veritonePermissions: {
          isPublic: false,
          acls: [
            {
              groupId: '48cfed01-362e-42b4-954e-147730cca81a',
              permission: 'owner'
            }
          ]
        }
      };

      // getSource
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: -1,
          name: 'Private Media',
          source_type_id: 5,
          organization_id: 7682,
          is_public: true
        }
      ]);
      // getSourceType
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'General',
          credential_type: 'None',
          organization_id: 7682,
          requires_scan_pipeline: false,
          is_live: false,
          is_public: false,
          category_id: 5,
          icon_class: 'icon-sources'
        }
      ]);
      // getGroupIdForOrgId
      serviceContext.dbConnections['sso'].read._push([
        { group_id: '48cfed01-362e-42b4-954e-147730cca81a' }
      ]);
      // getGroupIdForOrgId from cache for 7682
      // getGroupIdForOrgId in getCollaborators one more time from cache
      // getCollaborators
      serviceContext.dbConnections['media_platform'].read._push([]);

      await dalTdo.addSourceDataToNewTdo(
        context,
        input,
        jsondata,
        details,
        true
      );

      expect(input.sourceId).toEqual(-1);
      expect(input.sourceData.sourceId).toEqual('-1');
      expect(jsondata.mediaSourceId).toEqual('-1');
      expect(details.veritoneMediaSource.mediaSourceId).toEqual('-1');
      expect(details.veritoneMediaSource.mediaSourceTypeId).toEqual('5');
      expect(details.veritonePermissions.isPublic).toEqual(false);
      expect(details.veritonePermissions.acls.length).toEqual(1);
      // permision owner acl for current org
      expect(details.veritonePermissions.acls[0].groupId).toEqual(
        '48cfed01-362e-42b4-954e-147730cca81a'
      );
      expect(details.veritonePermissions.acls[0].permission).toEqual('owner');
    });
    it('should not add customer success owner acl for media with source has no organizationId', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.organizationId', 17560);
      const input = {
        sourceId: 38873,
        applicationId: 'cf05552b-52e0-46fa-8f7f-4c9eee135c51',
        organizationId: 17560
      };
      const jsondata = {};
      const details = {
        veritonePermissions: {
          isPublic: false,
          acls: [
            {
              groupId: '48cfed01-362e-42b4-954e-147730cca81a',
              permission: 'owner'
            }
          ]
        }
      };

      // getSource (source did not have organization id)
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 38873,
          name: 'KMLE Country',
          source_type_id: 3,
          is_public: true
        }
      ]);
      // getSourceType
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 3,
          name: 'YouTube Channel',
          credential_type: 'None',
          organization_id: 7682,
          requires_scan_pipeline: true,
          is_live: false,
          is_public: false,
          category_id: 3,
          icon_class: 'icon-youtube-play'
        }
      ]);
      // getGroupIdForOrgId from cache for 17560
      // getGroupIdForOrgId from cache for 7682
      // getGroupIdForOrgId in getCollaborators one more time from cache
      // getCollaborators without owner
      serviceContext.dbConnections['media_platform'].read._push([]);

      await dalTdo.addSourceDataToNewTdo(
        context,
        input,
        jsondata,
        details,
        true
      );

      expect(input.sourceId).toEqual(38873);
      expect(input.sourceData.sourceId).toEqual('38873');
      expect(jsondata.mediaSourceId).toEqual('38873');
      expect(details.veritoneMediaSource.mediaSourceId).toEqual('38873');
      expect(details.veritoneMediaSource.mediaSourceTypeId).toEqual('3');
      expect(details.veritonePermissions.isPublic).toEqual(false);
      expect(details.veritonePermissions.acls.length).toEqual(1);
      // verified that permision owner acl for current org and did not have customer success owner acl
      expect(details.veritonePermissions.acls[0].groupId).toEqual(
        '48cfed01-362e-42b4-954e-147730cca81a'
      );
      expect(details.veritonePermissions.acls[0].permission).toEqual('owner');
    });
    it('should add source acl for media with source has organizationId and acl', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.organizationId', 17560);
      const input = {
        sourceId: 40012,
        applicationId: 'cf05552b-52e0-46fa-8f7f-4c9eee135c51',
        organizationId: 17560
      };
      const jsondata = {};
      const details = {
        veritonePermissions: {
          isPublic: true,
          acls: [
            {
              groupId: '48cfed01-362e-42b4-954e-147730cca81a',
              permission: 'owner'
            }
          ]
        }
      };

      // getSource
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 40012,
          name: 'WFBC-FM - Entercom Greenville',
          source_type_id: 1,
          is_public: true,
          organization_id: 17560
        }
      ]);
      // getSourceType
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 1,
          name: 'Audio',
          credential_type: 'None',
          organization_id: 7682,
          requires_scan_pipeline: true,
          is_live: true,
          is_public: true,
          category_id: 1,
          icon_class: 'icon-audio'
        }
      ]);
      // getGroupIdForOrgId from cache for 17560
      // getGroupIdForOrgId
      serviceContext.dbConnections['sso'].read._push([
        { group_id: '48cfed01-362e-42b4-954e-147730cca81a' }
      ]);
      // getGroupIdForOrgId from cache for 7682
      // getGroupIdForOrgId in getCollaborators one more time from cache
      // getCollaborators with source acls
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 40012,
          group_id: '48cfed01-362e-42b4-954e-147730cca81a',
          permission: 'owner'
        },
        {
          source_id: 40012,
          group_id: '3c3d86db-d783-4e51-a559-9ec83f499506',
          permission: 'editor'
        }
      ]);

      // getOrgIdForGroupId
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp:
            '{"groupType":"organization","organizationName":"dev team org","organizationId":"17560"}'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp:
            '{"groupType":"organization","organizationName":"dev team org","organizationId":"17560"}'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp:
            '{"groupType":"organization","organizationName":"dev team org","organizationId":"17560"}'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp:
            '{"groupType":"organization","organizationName":"dev team org","organizationId":"14871"}'
        }
      ]);

      await dalTdo.addSourceDataToNewTdo(
        context,
        input,
        jsondata,
        details,
        true
      );

      expect(input.sourceId).toEqual(40012);
      expect(input.sourceData.sourceId).toEqual('40012');
      expect(jsondata.mediaSourceId).toEqual('40012');
      expect(details.veritoneMediaSource.mediaSourceId).toEqual('40012');
      expect(details.veritoneMediaSource.mediaSourceTypeId).toEqual('1');
      expect(details.veritonePermissions.isPublic).toEqual(true);
      expect(details.veritonePermissions.acls.length).toEqual(2);
      // verified that permision owner acl for current org and acls from source
      expect(details.veritonePermissions.acls[0].groupId).toEqual(
        '48cfed01-362e-42b4-954e-147730cca81a'
      );
      expect(details.veritonePermissions.acls[0].permission).toEqual('owner');
      expect(details.veritonePermissions.acls[1].groupId).toEqual(
        '3c3d86db-d783-4e51-a559-9ec83f499506'
      );
      expect(details.veritonePermissions.acls[1].permission).toEqual('editor');
    });
  });

  describe('#getTDO', function () {
    it('should error cleanly on empty id param', async function () {
      try {
        await dalTdo.getTDO(mockUtil.makeContext(), {
          id: '',
          organizationId: 7682
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should error cleanly on invalid input and log audit event', async function () {
      try {
        serviceContext.config.featureFlags.readAuditEvents = true;
        const ctx = mockUtil.makeContext({ authType: 'api_internal' });
        await dalTdo.getTDO(ctx, {
          id: '',
          organizationId: 7682
        });
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'read',
            actionResult: 'failure'
          })
        );
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should error cleanly on no id param', async function () {
      try {
        await dalTdo.getTDO(mockUtil.makeContext(), { organizationId: 7682 });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should fetch a TDO and emit audit event', async function () {
      // tests for broken SQL if there is no where clause
      serviceContext.dbConnections['core'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            id: '1234',
            created_by: 'userId',
            modified_by: 'userId'
          }
        ],
        true,
        ['1234']
      );
      serviceContext.config.featureFlags.readAuditEvents = true;
      const ctx = mockUtil.makeContext({ authType: 'api_internal' });
      const res = await dalTdo.getTDO(ctx, { id: '1234' });
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'read',
          actionResult: 'success'
        })
      );
    });
    it('should get with internal token', async function () {
      // tests for broken SQL if there is no where clause
      serviceContext.dbConnections['core'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            id: '1234',
            created_by: 'userId',
            modified_by: 'userId'
          }
        ],
        true,
        ['1234']
      );
      const res = await dalTdo.getTDO(
        mockUtil.makeContext({ authType: 'api_internal' }),
        { id: '1234' }
      );
      expect(res).toBeDefined();
      expect(res.id).toEqual('1234');
      expect(res.createdBy).toEqual('userId');
      expect(res.modifiedBy).toEqual('userId');
    });
    it('should get with user token acls', async function () {
      // get group ID for org
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get app ID for supplied org ID.
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // the final query should filter by acls
      serviceContext.dbConnections['core'].read._push(
        [
          {
            application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            id: '1234'
            // add some verification of query structure, with application_id in WHERE
          }
        ],
        false, // skip validation for json query
        [
          'rmacl',
          '"permission":"editor"',
          '"permission":"viewer"',
          'a0359273-ecc6-4934-aa6b-092fbed49956',
          'application_id',
          'ON rmacl.recording_id = r.recording_id AND rmacl.type'
        ]
      );
      const res = await dalTdo.getTDO(
        mockUtil.makeContext({ authType: 'user' }),
        {
          id: '1234',
          organizationId: '7682',
          applicationIds: ['a0359273-ecc6-4934-aa6b-092fbed49956']
        }
      );
      expect(res).toBeDefined();
      expect(res.id).toEqual('1234');
    });
    it('should get with package grant', async function () {
      // get group ID for org
      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'b0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // get app ID for supplied org ID.
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // the final query should filter by acls
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1234',
            json: {
              veritonePermissions: {
                packageId: 'p_123'
              }
            }
          }
        ],
        false
      );

      // check for package grant
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'p_123'
          }
        ],
        false
      );

      const res = await dalTdo.getTDO(
        mockUtil.makeContext({ authType: 'user' }),
        {
          id: '1234',
          organizationId: '7682',
          applicationIds: ['a0359273-ecc6-4934-aa6b-092fbed49956']
        }
      );
      expect(res).toBeDefined();
      expect(res.id).toEqual('1234');
    });
  });

  describe('#getCloneRequests', function () {
    let originalReadMap;
    beforeEach(function () {
      originalReadMap = serviceContext.dbConnections['core'].read.map;
    });
    afterEach(function () {
      serviceContext.dbConnections['core'].read.map = originalReadMap;
    });
    it('should return clone requests list with applicationIds', async function () {
      const args = {
        applicationIds: ['app-1'],
        offset: 0,
        limit: 30
      };
      const unixSec = moment().unix();
      const rows = [
        {
          clone_id: 'clone-1',
          status: 'complete',
          number_of_completed_recordings: 2,
          number_of_recordings: 2,
          created_date_time: unixSec,
          modified_date_time: unixSec,
          source_application_id: 'app-1',
          destination_application_id: 'app-2',
          request: {}
        }
      ];
      serviceContext.dbConnections['core'].read.map = jest.fn((sql, sqlParams, mapRow) =>
        Promise.resolve(rows.map((row) => mapRow(row)))
      );
      const res = await dalTdo.getCloneRequests(null, null, args);
      expect(res).toBeDefined();
      expect(res.records).toEqual(rows.map((row) => mapper.mapCloneJob(row)));
      expect(res.offset).toEqual(0);
      expect(res.limit).toEqual(30);
      expect(res.count).toEqual(1);
    });
    it('should filter by cloneId and applicationId when provided', async function () {
      const args = {
        applicationIds: ['app-1'],
        offset: 0,
        limit: 10
      };
      serviceContext.dbConnections['core'].read.map = jest.fn().mockResolvedValue([]);
      await dalTdo.getCloneRequests('clone-123', 'app-1', args);
      const sql = serviceContext.dbConnections['core'].read.map.mock.calls[0][0];
      expect(sql).toContain('recording.recording_clone');
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
      expect(serviceContext.dbConnections['core'].read.map).toHaveBeenCalled();
    });
    it('should use default limit 30 and offset 0 in SQL when args omit them', async function () {
      const args = { applicationIds: ['app-1'] };
      serviceContext.dbConnections['core'].read.map = jest.fn().mockResolvedValue([]);
      await dalTdo.getCloneRequests(null, null, args);
      const [sql, params] = serviceContext.dbConnections['core'].read.map.mock.calls[0];
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
      expect(params).toEqual(
        expect.arrayContaining([30, 0])
      );
      expect(params[params.length - 2]).toBe(30);
      expect(params[params.length - 1]).toBe(0);
    });
  });

  describe('#createClone', function () {
    it('should throw invalid input', async function () {
      let res, err;
      try {
        res = await dalTdo.createClone(null);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
    });
    it('should create clone recording', async function () {
      let res, err;
      try {
        serviceContext.dbConnections['core'].write._push([{ clone_id: 123 }]);
        res = await dalTdo.createClone({ clone_id: 123 });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual(123);
    });
  });

  describe('#incrementCompletedRecordingsInClone', function () {
    it('should throw invalid input missing cloneId!', async function () {
      let res, err;
      try {
        res = await dalTdo.incrementCompletedRecordingsInClone(null);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should update increase of recordings', async function () {
      let res, err;
      try {
        serviceContext.dbConnections['core'].write._push([
          { clone_id: 123, number_of_completed_recordings: 1 }
        ]);
        res = await dalTdo.incrementCompletedRecordingsInClone('123');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('#updateClone', function () {
    it('should throw invalid input when clone is not an object', async function () {
      let err;
      try {
        await dalTdo.updateClone(undefined);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should update clone', async function () {
      let res, err;
      try {
        serviceContext.dbConnections['core'].write._push([
          {
            clone_id: '123',
            status: 'fail',
            request: {},
            response: {
              recordings: []
            }
          }
        ]);
        res = await dalTdo.updateClone({
          cloneId: '123',
          status: 'fail',
          response: {
            recordings: []
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('123');
      expect(res.status).toEqual('fail');
    });
  });

  describe('#getAssets', function () {
    it('should getAssets not include vitural asset', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '123-assetId',
            containerId: '123',
            assetType: 'transcript',
            contentType: 'application/ttml',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-assetId`
          }
        ],
        false
      );
      try {
        const context = mockUtil.makeContext();
        const getAssetsArgs = {
          assetType: 'transcript',
          contentType: 'application/ttml'
        };
        const tdo = {
          id: '123',
          applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          details: {
            'veritone-clone': {
              newAssetIdsToOldAssetIds: {}
            }
          }
        };
        res = await dalTdo.getAssets(context, getAssetsArgs, tdo);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records.length).toEqual(1);
      expect(res.records[0].id).toEqual('123-assetId');
      expect(res.records[0].containerId).toEqual('123');
      expect(res.records[0].uri).toEqual(
        'https://dev.inspirent.s3.amazonaws.com/assets/123/123-assetId'
      );
    });
  });

  describe('#cloneAsset', function () {
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const originalAsset = {
      id: '123-original',
      containerId: '123',
      assetType: 'media',
      contentType: 'video/mp4',
      uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
    };
    const newTdo = {
      id: '1234',
      applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
      details: {
        veritoneClone: {
          newAssetIdsToOldAssetIds: {}
        }
      }
    };
    const applicationId = 'a0359273-ecc6-4934-aa6b-092fbed49956';
    const status = {
      assets: []
    };

    let rutil;
    beforeAll(function () {
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => {
        return {
          getClientInfo: (context) => 'user@local.com',
          stripOwnedStorageUrlSignature: (uri) => uri,
          isOurBucket: (uri) => false
        };
      });

      serviceContext = initializeServiceContext();
      dalTdo = require('./tdo.js')(serviceContext);
    });
    afterAll(() => {
      jest.resetModules();
    });

    it('should clone asset with cloneBlod', async function () {
      //
      const cloneBlob = true;
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '123-original',
            containerId: '123',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '123-cloned',
            containerId: '1234',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      const res = await dalTdo.cloneAsset(
        context,
        originalAsset,
        newTdo,
        applicationId,
        status,
        cloneBlob
      );

      expect(res).toBeDefined();
      expect(res.id).toEqual('123-cloned');
      expect(res.containerId).toEqual('1234');
      expect(res.uri).toEqual(
        'https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1'
      );
    });
    it('should clone asset without cloneBlod', async function () {
      const cloneBlob = false;
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      // mock get Organization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '7682' }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '123-original',
            containerId: '123',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '123-cloned',
            containerId: '1234',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      const res = await dalTdo.cloneAsset(
        context,
        originalAsset,
        newTdo,
        applicationId,
        status,
        cloneBlob
      );

      expect(res).toBeDefined();
      expect(res.id).toEqual('123-cloned');
      expect(res.containerId).toEqual('1234');
      expect(res.uri).toEqual(
        'https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1'
      );
    });
  });

  describe('#cloneJobs', function () {
    beforeAll(function () {
      _.merge(serviceContext.dal.application, { getAppIdFromOrgId: jest.fn() });
      _.merge(serviceContext.dal.user, { getDefaultOrgAdminUser: jest.fn() });
    });
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const originalTdoId = '1234';
    const clonedTdoId = '12345';
    const cloneInput = {
      sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
      destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
      sourceOrgId: '7355',
      destinationOrgId: '20224'
    };
    const status = {
      jobs: []
    };

    const cloneRequest = {
      sourceApplicationId: cloneInput.sourceApplicationId,
      destinationApplicationId: cloneInput.destinationApplicationId
    };
    const options = {
      destinationOrgId: cloneInput.destinationOrgId
    };

    it('should clone jobs', async function () {
      let res, err;
      const destinationAppId = cloneInput.destinationApplicationId;
      const sourceAppId = cloneInput.sourceApplicationId;

      // mock database result to source TDO query
      serviceContext.dbConnections['core'].read._push([
        {
          id: originalTdoId,
          application_id: sourceAppId,
          organization_id: cloneInput.sourceOrgId,
          is_public: false
        }
      ]);

      // get Jobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('1234_job1')
        },
        {
          id: mockUtil.toTaskId('1234_job2')
        }
      ]);

      // getTasks  for 1234_job1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: mockUtil.toTaskId('newTask_1231'),
            engine_id: '0f771994-8ed4-49b9-b40b-f066d02b30dd',
            status: 'complete'
          },
          {
            id: mockUtil.toTaskId('newTask_1232'),
            engine_id: '4735047e-bc07-47b9-bacf-4a4c45319987',
            status: 'complete'
          }
        ],
        false
      );

      // mock database result to TDO query
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          application_id: destinationAppId,
          organization_id: '20224',
          is_public: false
        }
      ]);

      // mock get Organization in createJobImpl function
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '20224' }
      ]);
      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([
        { id: '0f771994-8ed4-49b9-b40b-f066d02b30dd' },
        { id: '4735047e-bc07-47b9-bacf-4a4c45319987' }
      ]);
      // select application_id for engine_id
      serviceContext.dbConnections['core'].read._push([
        { application_id: destinationAppId }
      ]);
      // select oldest application_id and application_name
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: destinationAppId,
            application_name: 'oldest application'
          }
        ],
        false
      );
      // dal/job.js ->> newCreateJob ->> serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // model/job.js ->> Job.prototype.validate ->> dalEngine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: '0f771994-8ed4-49b9-b40b-f066d02b30dd',
          category_id: '230943d0-7b60-46f8-a0fd-c937df313853'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '4735047e-bc07-47b9-bacf-4a4c45319987',
          category_id: 'e7b4fe4b-bddc-48be-8768-ca67470f9693'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '4735047e-bc07-47b9-bacf-4a4c45319987',
          category_id: 'e7b4fe4b-bddc-48be-8768-ca67470f9693'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '4735047e-bc07-47b9-bacf-4a4c45319987',
          category_id: 'e7b4fe4b-bddc-48be-8768-ca67470f9693'
        }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId1', runtime: { iron: '' } }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId1', runtime: { iron: '' } }
      ]);
      // populateTaskWithEngineBuildInfo ->> serviceContext.dal.engineCategory.getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '230943d0-7b60-46f8-a0fd-c937df313853',
            engine_ids: ['0f771994-8ed4-49b9-b40b-f066d02b30dd'],
            engine_alias_ids: ['0f771994-8ed4-49b9-b40b-f066d02b30dd']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'e7b4fe4b-bddc-48be-8768-ca67470f9693',
            engine_ids: ['4735047e-bc07-47b9-bacf-4a4c45319987'],
            engine_alias_ids: ['4735047e-bc07-47b9-bacf-4a4c45319987']
          }
        ],
        false
      );
      // dal/job.dal ->> createJobDb
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('1234_job1'),
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          recording_id: 12345,
          organization_id: 7682,
          job_config: { isReprocessing: false }
        }
      ]);
      // createTasksDB
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: mockUtil.toTaskId('1234_job2_task1'),
            engine_id: '0f771994-8ed4-49b9-b40b-f066d02b30dd',
            status: 'fail'
          },
          {
            id: mockUtil.toTaskId('1234_job2_task2'),
            engine_id: '4735047e-bc07-47b9-bacf-4a4c45319987',
            status: 'fail'
          }
        ],
        false
      );
      // dal/job.dal ->> updateJobStatus
      serviceContext.dbConnections['core'].write._push([]);
      // getTasks  for 1234_job2 -- skip create job 2
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: mockUtil.toTaskId('1234_job2_task1'),
            engine_id: '0f771994-8ed4-49b9-b40b-f066d02b30dd',
            status: 'fail'
          },
          {
            id: mockUtil.toTaskId('1234_job2_task2'),
            engine_id: '4735047e-bc07-47b9-bacf-4a4c45319987',
            status: 'fail'
          }
        ],
        false
      );

      // mock get Organization in createJobImpl function
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '20224' }
      ]);
      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([
        { id: 'insert-into-index' },
        { id: 'mention-generate' }
      ]);
      // mock value for get deployed builds
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId1', runtime: { iron: '' } }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'buildId2', runtime: { iron: '' } }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'insert-into-index',
          category_id: 'bb213734-de44-4932-8395-e0810762d166'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'mention-generate',
          category_id: '45175cf9-797f-4e5c-a200-9a8d6b360d70'
        }
      ]);
      // get Engine category
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'bb213734-de44-4932-8395-e0810762d166',
            engine_ids: ['insert-into-index'],
            engine_alias_ids: ['insert-into-index']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '45175cf9-797f-4e5c-a200-9a8d6b360d70',
            engine_ids: ['mention-generate'],
            engine_alias_ids: ['mention-generate']
          }
        ],
        false
      );
      // createJobDb
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: 'newJob_1234',
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          recording_id: 12345,
          organization_id: 7682,
          retries: 0,
          job_status: 'pending'
        }
      ]);
      // createTasks
      serviceContext.dbConnections['core'].write._push([
        { id: '20114609_jaqnOp7IDAg7s7X', engine_id: 'insert-into-index' }
      ]);
      serviceContext.dbConnections['core'].write._push([
        { id: '20114609_qnOp7IDAg7s7YU', engine_id: 'mention-generate' }
      ]);

      // get oldest org admin default in tokenHelper.createJwtToken
      serviceContext.dal.application.getAppIdFromOrgId.mockResolvedValueOnce(
        'org_guid'
      );
      serviceContext.dal.user.getDefaultOrgAdminUser.mockResolvedValueOnce();

      try {
        res = await dalTdo.cloneJobs(
          context,
          { id: originalTdoId },
          { id: clonedTdoId },
          cloneRequest,
          options,
          status
        );
      } catch (error) {
        expect(error.message).toEqual(
          'CreateJob must have at least one task definition.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
    });
  });

  describe('#getTDOSourceTaskData', function () {
    it('should get tdo source task data', async function () {
      let res, err;
      const tdoId = 123456789;

      serviceContext.dbConnections['core'].read._push([
        { content: 'content Test' }
      ]);

      try {
        res = await dalTdo.getTDOSourceTaskData(tdoId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual('content Test');
    });
    it('should get tdo source task data, from cache', async function () {
      let res, err, resFromCache;
      const tdoId = 123456789;

      serviceContext.dbConnections['core'].read._push([
        { content: 'content Test' }
      ]);

      try {
        res = await dalTdo.getTDOSourceTaskData(tdoId);
        resFromCache = await dalTdo.getTDOSourceTaskData(tdoId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual('content Test');
      expect(resFromCache).toBeDefined();
      expect(resFromCache).toEqual('content Test');
    });
    it('should get empty tdo source task data', async function () {
      let res, err;
      const tdoId = 12345678;

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dalTdo.getTDOSourceTaskData(tdoId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toEqual(null);
    });
  });

  describe('#processClone', function () {
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const dateStr = moment().toISOString();
    const now = moment();
    const start = moment().subtract(2, 'hour').toISOString();
    const stop = moment().subtract(1, 'hour').toISOString();

    xit('should process clone', async function () {
      let res, err;

      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [{ details: { numSegments: 1 } }],
        false
      );

      //--- Begin getAssets by tdo ---//
      // getFakeMediaAsset
      // getTDOSourceData
      serviceContext.dbConnections['core'].read._push([{}]);
      // getMediaInitAssets
      serviceContext.dbConnections['core'].read._push([
        {
          assetId: '123_456',
          content_type: 'test/test'
        }
      ]);
      // get assets
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '9453821_wAjmVP2ekI',
            container_id: '12345',
            assetType: 'transcript',
            contentType: 'application/ttml',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`,
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        false
      );
      //-- End getAssets by tdo

      //--- Begin createTDO ---//

      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );

      // insert into media table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '123',
          created_date_time: dateStr,
          modified_date_time: dateStr
        }
      ]);

      // upsert media metadata
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // this is the insert to recording and recording_metadata
      serviceContext.dbConnections['core'].read._push([], true, [
        start,
        stop // verifies that times were converted correctly
      ]);
      serviceContext.dbConnections['core'].read._push([{}]);
      serviceContext.dbConnections['core'].read._push([{ count: 2 }]);
      // this is the final getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1234',
          start_date_time: start,
          stop_date_time: stop,
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          json: {
            'veritone-clone': {
              newAssetIdsToOldAssetIds: {}
            }
          }
        }
      ]);

      // get source content templates
      // serviceContext.dbConnections['media_platform'].read._push([]);
      // scheduled job content templates
      // serviceContext.dbConnections['media_platform'].read._push([]);

      //--- End createTDO ---//
      //--- Begin clone Asset ---//
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '123-original',
            containerId: '123',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '123-cloned',
            containerId: '1234',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      //--- End cloneAsset ---//
      //--- Begin cloneJobs---//

      // get Jobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('1234_job1')
        },
        {
          id: mockUtil.toTaskId('1234_job2')
        }
      ]);
      // getTasks  for 1234_job1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: mockUtil.toTaskId('1234_job1_task1'),
            engine_id: 'e123',
            status: 'complete'
          }
        ],
        false
      );
      // mock database result to TDO query
      // mock get Organization in createJobImpl function
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '20224' }
      ]);
      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([{ id: 'e123' }]);
      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'e123', id: 'buildId1' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'e123', id: 'buildId2' }
      ]);
      // mock return value from core-job-server
      // note that rp is mocked out in serviceContext.mock.js
      require('request-promise').mockReset();
      require('request-promise').mockResolvedValueOnce({
        jobId: mockUtil.toTaskId('newJob_123'),
        recordingId: '12345',
        applicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
        status: 'pending'
      });
      // create insert into index and generate mention job
      // mock get Organization in createJobImpl function
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: '20224' }
      ]);
      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([
        { id: 'insert-into-index' },
        { id: 'mention-generate' }
      ]);
      require('request-promise').mockResolvedValueOnce({
        jobId: mockUtil.toTaskId('newJob_1234'),
        recordingId: '12345',
        applicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
        status: 'complete'
      });
      //--- End cloneJobs ---//

      //--- Begin doUpdateTDO ---//
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf()
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      //--- End doUpdateTDO ---//

      try {
        const originalTdo = {
          id: '1234',
          startDateTime: start,
          stopDateTime: stop,
          applicationId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
          details: {
            'veritone-clone': {
              newAssetIdsToOldAssetIds: {}
            }
          }
        };
        const cloneRequest = {
          id: 'test-clone-id',
          sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          request: {
            cloneBlobs: false,
            includeAssets: true,
            cloneAssets: []
          }
        };
        const options = {
          destinationOrgId: '20224'
        };
        res = await dalTdo.processClone(context, originalTdo, cloneRequest, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res.id).toEqual('123');
    });
  });

  describe('#runProcessClone', function () {
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const dateStr = moment().toISOString();
    const now = moment();
    const start = moment().subtract(2, 'hour').toISOString();
    const stop = moment().subtract(1, 'hour').toISOString();

    it('should pass clone request tdoIds to getAllRecordings as ids', async function () {
      const tdoId = '123456789';
      serviceContext.redisCache.markCacheDirty(true);
      const getOrgSpy = jest
        .spyOn(serviceContext.dal.organization, 'getOrgIdFromAppId')
        .mockImplementation((applicationId) => {
          if (applicationId === '39677772-8da3-42e9-ac9e-361b9079e6bf') {
            return Promise.resolve('7355');
          }
          if (applicationId === 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa') {
            return Promise.resolve('20224');
          }
          return Promise.resolve('0');
        });

      const readMapSpy = jest
        .spyOn(serviceContext.dbConnections['core'].read, 'map')
        .mockImplementationOnce(async (sql, args) => {
          expect(String(sql)).toMatch(/recording_id/i);
          expect(args).toEqual(expect.arrayContaining([tdoId]));
          return [];
        });

      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          status: 'running',
          number_of_recordings: 0,
          number_of_completed_recordings: 0
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          status: 'complete',
          number_of_recordings: 0,
          number_of_completed_recordings: 0,
          request: {},
          response: { records: [] }
        }
      ]);

      const cloneRequest = {
        id: '39677772-8da3-42e9-ac9e-361b9079e6bf',
        sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
        destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
        request: {
          tdoIds: [tdoId]
        }
      };

      try {
        await dalTdo.runProcessClone(context, 'new_only', cloneRequest, {
          isRefresh: false
        });
      } finally {
        getOrgSpy.mockRestore();
        readMapSpy.mockRestore();
      }
    });

    it('should run process clone', async function () {
      let res, err;

      // Org lookups (getOrgIdFromAppId) consume from sso.read queue below
      // First read in getAllRecordings: push an Error so the mock throws and we hit the catch block
      serviceContext.dbConnections['core'].read._push(new Error('getRecordings fail'), true, [], null);
      // updateClone('failed', ...) in runProcessClone catch uses write.map (direct runProcessClone;
      // no requestClone outer catch).
      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          status: 'failed',
          request: {},
          response: { error: 'getRecordings fail', records: [] },
          number_of_recordings: 0,
          number_of_completed_recordings: 0
        }
      ]);

      serviceContext.redisCache.markCacheDirty(true);
      // get source orgId by sourceApplicationId
      serviceContext.dbConnections['sso'].read._push([{ id: '7355' }]);
      // get destination orgId by destinationApplicationId
      serviceContext.dbConnections['sso'].read._push([{ id: '20224' }]);
      // get source tdos
      serviceContext.dbConnections['core'].write._push([
        {
          id: 12345,
          startDateTime: start,
          stopDateTime: stop
        }
      ]);

      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [{ details: { numSegments: 1 } }],
        false
      );

      //--- Begin getAssets by tdo ---//
      // getFakeMediaAsset
      // getTDOSourceData
      serviceContext.dbConnections['core'].read._push([{}]);
      // getMediaInitAssets
      serviceContext.dbConnections['core'].read._push([
        {
          assetId: '123_456',
          content_type: 'test/test'
        }
      ]);
      // get assets
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '9453821_wAjmVP2ekI',
            container_id: '12345',
            assetType: 'transcript',
            contentType: 'application/ttml',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`,
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        false
      );
      //-- End getAssets by tdo

      //--- Begin createTDO ---//

      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );

      // insert into media table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '123',
          created_date_time: dateStr,
          modified_date_time: dateStr
        }
      ]);

      // upsert media metadata
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // this is the insert to recording and recording_metadata
      serviceContext.dbConnections['core'].read._push([], true, [
        start,
        stop // verifies that times were converted correctly
      ]);
      // this is the final getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          start_date_time: start,
          stop_date_time: stop,
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          json: {
            'veritone-clone': {
              newAssetIdsToOldAssetIds: {}
            }
          }
        }
      ]);

      // get source content templates
      serviceContext.dbConnections['media_platform'].read._push([]);
      // scheduled job content templates
      serviceContext.dbConnections['media_platform'].read._push([]);

      //--- End createTDO ---//
      //--- Begin clone Asset ---//
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '123-original',
            containerId: '123',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '123-cloned',
            containerId: '12345',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      //--- End cloneAsset ---//
      //--- Begin cloneJobs---//

      // get Jobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('1234_job1')
        },
        {
          id: mockUtil.toTaskId('1234_job2')
        }
      ]);
      // getTasks  for 1234_job1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: mockUtil.toTaskId('1234_job1_task1'),
            engine_id: 'e123',
            status: 'complete'
          }
        ],
        false
      );

      // ---- create job 1 ---//
      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: 'ce721828-e54f-4508-91d5-a630e4e8e4ca' }
      ]);
      // getDeployedBuild for engine e123
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'e123',
          id: 'e1a60c52-3e04-41d5-8cde-8ba5c64eed8d',
          status: 'deployed'
        }
      ]);
      // getEngine in job model validation
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: 'ce721828-e54f-4508-91d5-a630e4e8e4ca' }
      ]);
      // getEngines in populateTaskWithEngineBuildInfo function
      serviceContext.dbConnections['core'].read._push([
        { id: 'e123', category_id: 'ce721828-e54f-4508-91d5-a630e4e8e4ca' }
      ]);
      // getEngineBuilds in populateTaskWithEngineBuildInfo function
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e1a60c52-3e04-41d5-8cde-8ba5c64eed8d',
          engine_id: 'e123',
          status: 'deployed'
        }
      ]);
      // getEngineCategory in populateTaskWithEngineBuildInfo function
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'ce721828-e54f-4508-91d5-a630e4e8e4ca',
            engine_ids: ['e123'],
            engine_alias_ids: ['e123']
          }
        ],
        false
      );
      // createJobDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: '20114610_n0j3WkV4v9',
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          recording_id: '12345',
          organization_id: 7682,
          job_config: { isReprocessJob: false }
        }
      ]);
      // createTaskDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        {
          id: '20114610_n0j3WkV4v9ueWxJE',
          task_id: '20114610_n0j3WkV4v9ueWxJE',
          job_id: '20114610_n0j3WkV4v9',
          engine_id: 'e123',
          status: 'pending'
        }
      ]);
      // updateJobStatus in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([]);
      // -- End create job 1 ---//

      //---- Create insert into index and generate mention job ----//
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          is_public: false
        }
      ]);
      // mock value for getEngines in createJobImpl function
      serviceContext.dbConnections['core'].read._push([
        { id: 'insert-into-index' },
        { id: 'mention-generate' }
      ]);
      // _getDeployedBuild in createJobImpl function 2 engines
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'insert-into-index',
          id: '1ffdf818-bb7e-453c-8d8a-569db5a7685b',
          status: 'deployed'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'mention-generate',
          id: '3406f866-8580-47bb-a23d-103ae87d0bb4',
          status: 'deployed'
        }
      ]);
      // getEngine in job model validation 2 engines
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'insert-into-index',
          category_id: '2b6140a3-447d-4a12-8f36-a16c078ab95b'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'mention-generate',
          category_id: 'a3d2be02-5fe2-4811-aa91-088e717a75dc'
        }
      ]);
      // getEngine in populateTaskWithEngineBuildInfo function 2 engines
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'insert-into-index',
          category_id: '2b6140a3-447d-4a12-8f36-a16c078ab95b'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'mention-generate',
          category_id: 'a3d2be02-5fe2-4811-aa91-088e717a75dc'
        }
      ]);
      // getEngineBuilds in populateTaskWithEngineBuildInfo function 2 engines
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'insert-into-index',
          id: '1ffdf818-bb7e-453c-8d8a-569db5a7685b',
          status: 'deployed'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'mention-generate',
          id: '3406f866-8580-47bb-a23d-103ae87d0bb4',
          status: 'deployed'
        }
      ]);
      // get engine category in populateTaskWithEngineBuildInfo function 2 engines
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '2b6140a3-447d-4a12-8f36-a16c078ab95b',
            engine_ids: ['insert-into-index'],
            engine_alias_ids: ['insert-into-index']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a3d2be02-5fe2-4811-aa91-088e717a75dc',
            engine_ids: ['mention-generate'],
            engine_alias_ids: ['mention-generate']
          }
        ],
        false
      );
      // createJobDb in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('1234_job2'),
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          recording_id: '12345',
          organization_id: 7682,
          job_config: { isReprocess: false },
          retries: 0
        }
      ]);
      // createTaskDb in serviceContext.dal.task.createTasksDb
      serviceContext.dbConnections['core'].write._push([
        { id: mockUtil.toTaskId('1234_job2_task1') },
        { id: mockUtil.toTaskId('1234_job2_task2') }
      ]);
      // updateJobStatus in _createJobAndTaskAsync function
      serviceContext.dbConnections['core'].write._push([]);
      //--- End cloneJobs ---//

      //--- Begin doUpdateTDO ---//
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf()
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      //--- End doUpdateTDO ---//

      serviceContext.dbConnections['core'].read._push([{ clone_id: '123' }]);
      serviceContext.dbConnections['core'].read._push([{ clone_id: '123' }]);
      //incrementCompletedRecordingsInClone (query must return status: running per runProcessClone)
      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '123',
          status: 'running',
          number_of_completed_recordings: 1
        }
      ]);
      // updateNumberOfRecordingsInClone
      serviceContext.dbConnections['core'].write._push([
        { clone_id: '123', number_of_recordings: 1 }
      ]);
      // updateClone (complete)
      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '123',
          status: 'success',
          request: {},
          response: {
            recordings: [{ id: '12345' }]
          }
        }
      ]);
      try {
        const cloneRequest = {
          id: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          cloneId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          request: {
            cloneBlobs: false
          }
        };
        res = await dalTdo.runProcessClone(context, 'full', cloneRequest, {});
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error).toBeDefined();
        expect(error.name).toEqual('service_failure');
        expect(String(error?.message || '')).toContain('Failed to process clone');
      }
      expect(err).toBeDefined();
    });
  });

  describe('#shouldCloneAssetBasedOnFilters', function () {
    const context = mockUtil.makeContext({ authType: 'api_internal' });

    it('should return true when no filters provided', async function () {
      const asset = { type: 'transcript', sourceData: {} };
      const result = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, []);
      expect(result).toBe(true);
      const resultNull = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, null);
      expect(resultNull).toBe(true);
    });

    it('should return true when filter matches by assetType and engineId', async function () {
      const asset = {
        type: 'transcript',
        sourceData: { schemaId: 'schema-1', engineId: 'engine-1' }
      };
      const filters = [
        { assetType: 'transcript', engineId: 'engine-1' }
      ];
      const result = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, filters);
      expect(result).toBe(true);
    });

    it('should return false when engineId does not match', async function () {
      const asset = {
        type: 'transcript',
        sourceData: { schemaId: 'schema-1', engineId: 'engine-1' }
      };
      const filters = [
        { assetType: 'transcript', engineId: 'engine-other' }
      ];
      const result = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, filters);
      expect(result).toBe(false);
    });

    it('should return true when filter matches by assetType and engineCategoryId', async function () {
      const categoryId = 'cat-123';
      const asset = {
        type: 'transcript',
        sourceData: { schemaId: 'schema-1', engineId: 'engine-1' }
      };
      const filters = [
        { assetType: 'transcript', engineCategoryId: categoryId }
      ];
      serviceContext.dal.engine.getEngineCategoryId = jest.fn().mockResolvedValue(categoryId);
      const result = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, filters);
      expect(result).toBe(true);
      expect(serviceContext.dal.engine.getEngineCategoryId).toHaveBeenCalledWith(context, 'engine-1');
    });

    it('should return false when engineCategoryId does not match', async function () {
      const asset = {
        type: 'transcript',
        sourceData: { engineId: 'engine-1' }
      };
      const filters = [
        { assetType: 'transcript', engineCategoryId: 'other-category' }
      ];
      serviceContext.dal.engine.getEngineCategoryId = jest.fn().mockResolvedValue('actual-category');
      const result = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, filters);
      expect(result).toBe(false);
    });

    it('should return false when filter has engineCategoryId but asset has no engineId', async function () {
      const asset = {
        type: 'transcript',
        sourceData: { schemaId: 'schema-1' }
      };
      const filters = [
        { assetType: 'transcript', engineCategoryId: 'cat-123' }
      ];
      serviceContext.dal.engine.getEngineCategoryId = jest.fn();
      const result = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset, filters);
      expect(result).toBe(false);
      expect(serviceContext.dal.engine.getEngineCategoryId).not.toHaveBeenCalled();
    });

    it('should cache engineId to categoryId in context for repeated lookups', async function () {
      const categoryId = 'cat-cached';
      const asset1 = {
        type: 'transcript',
        sourceData: { engineId: 'engine-same' }
      };
      const asset2 = {
        type: 'transcript',
        sourceData: { engineId: 'engine-same' }
      };
      const filters = [
        { assetType: 'transcript', engineCategoryId: categoryId }
      ];
      const getEngineCategoryIdMock = jest.fn().mockResolvedValue(categoryId);
      serviceContext.dal.engine.getEngineCategoryId = getEngineCategoryIdMock;
      const result1 = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset1, filters);
      const result2 = await dalTdo.shouldCloneAssetBasedOnFilters(context, asset2, filters);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(getEngineCategoryIdMock).toHaveBeenCalledTimes(1);
      expect(getEngineCategoryIdMock).toHaveBeenCalledWith(context, 'engine-same');
    });
  });

  describe('#requestClone', function () {
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const dateStr = moment().toISOString();
    const now = moment();
    const start = moment().subtract(2, 'hour').toISOString();
    const stop = moment().subtract(1, 'hour').toISOString();

    beforeAll(function () {
      if (!serviceContext.dal.organization.getOrganization?.mockImplementation) {
        _.merge(serviceContext, {
          dal: {
            organization: {
              getOrganization: jest.fn()
            }
          }
        });
      }
    });

    it('should process request clone', async function () {
      let err, res;
      serviceContext.dal.organization.getOrganization
        .mockResolvedValueOnce({
          organizationGuid: '39677772-8da3-42e9-ac9e-361b9079e6bf'
        })
        .mockResolvedValueOnce({
          organizationGuid: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
        });
      // createClone
      serviceContext.dbConnections['core'].write._push([{ clone_id: '123' }]);
      // get source orgId by sourceApplicationId (consumed by getOrgIdFromAppId if used)
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7355'
        }
      ]);
      // get destination orgId by destinationApplicationId
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '20224'
        }
      ]);
      // get source tdos
      serviceContext.dbConnections['core'].write._push([
        {
          id: 1234,
          startDateTime: start,
          stopDateTime: stop
        }
      ]);

      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [{ details: { numSegments: 1 } }],
        false
      );

      //--- Begin getAssets by tdo ---//
      // getFakeMediaAsset
      // getTDOSourceData
      serviceContext.dbConnections['core'].read._push([{}]);
      // getMediaInitAssets
      serviceContext.dbConnections['core'].read._push([
        {
          assetId: '123_456',
          content_type: 'test/test'
        }
      ]);
      // get assets
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '9453821_wAjmVP2ekI',
            container_id: '12345',
            assetType: 'transcript',
            contentType: 'application/ttml',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`,
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        false
      );
      //-- End getAssets by tdo

      //--- Begin createTDO ---//

      serviceContext.dbConnections['sso'].read._push(
        [{ group_id: 'c0455964-c72f-4f17-a740-110bb7cfabf0' }],
        false
      );

      // insert into media table
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '123',
          created_date_time: dateStr,
          modified_date_time: dateStr
        }
      ]);

      // upsert media metadata
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // this is the insert to recording and recording_metadata
      serviceContext.dbConnections['core'].read._push([], true, [
        start,
        stop // verifies that times were converted correctly
      ]);
      // this is the final getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1234',
          start_date_time: start,
          stop_date_time: stop,
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          json: {
            'veritone-clone': {
              newAssetIdsToOldAssetIds: {}
            }
          }
        }
      ]);

      // get source content templates
      serviceContext.dbConnections['media_platform'].read._push([]);
      // scheduled job content templates
      serviceContext.dbConnections['media_platform'].read._push([]);

      //--- End createTDO ---//
      //--- Begin clone Asset ---//
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '123-original',
            containerId: '123',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '123-cloned',
            containerId: '1234',
            assetType: 'media',
            contentType: 'video/mp4',
            uri: `https://dev.inspirent.s3.amazonaws.com/assets/123/123-cloned1`
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      //--- End cloneAsset ---//
      //--- Begin cloneJobs---//

      // get Jobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('1234_job1')
        },
        {
          id: mockUtil.toTaskId('1234_job2')
        }
      ]);
      // getTasks  for 1234_job1
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: mockUtil.toTaskId('1234_job1_task1'),
            engine_id: 'e123',
            status: 'complete'
          }
        ],
        false
      );
      // create job 1
      // mock database result to TDO query
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          organization_id: '20224',
          is_public: false
        }
      ]);
      // mock return value from core-job-server
      // note that rp is mocked out in serviceContext.mock.js
      require('request-promise').mockReset();
      require('request-promise').mockResolvedValueOnce({
        jobId: mockUtil.toTaskId('newJob_123'),
        recordingId: '12345',
        applicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
        status: 'pending'
      });
      // create insert into index and generate mention job
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12345',
          application_id: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          is_public: false
        }
      ]);
      require('request-promise').mockResolvedValueOnce({
        jobId: mockUtil.toTaskId('newJob_1234'),
        recordingId: '12345',
        applicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
        status: 'complete'
      });
      //--- End cloneJobs ---//

      //--- Begin doUpdateTDO ---//
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: '123',
          metadata: { str: 'test' }
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123',
          media_start_time: now.valueOf(),
          media_stop_time: now.add(5, 'minute').valueOf()
        }
      ]);

      // get org by app
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      //--- End doUpdateTDO ---//

      //incrementCompletedRecordingsInClone (query must return status: running per runProcessClone)
      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '123',
          status: 'running',
          number_of_completed_recordings: 1
        }
      ]);
      // updateNumberOfRecordingsInClone
      serviceContext.dbConnections['core'].write._push([
        { clone_id: '123', number_of_recordings: 1 }
      ]);
      // updateClone (complete)
      serviceContext.dbConnections['core'].write._push([
        {
          clone_id: '123',
          status: 'success',
          request: {},
          response: {
            recordings: [{ id: '12345' }]
          }
        }
      ]);
      try {
        const args = {
          input: {
            sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
            destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
            applicationIds: [
              '39677772-8da3-42e9-ac9e-361b9079e6bf',
              'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
            ],
            cloneBlobs: false
          }
        };
        res = await dalTdo.requestClone(context, args);
        await res.exec.catch(() => {}); // wait for background clone; swallow rejection
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.clone).toBeDefined();
      expect(res.clone.id).toEqual('123');
    });

    it('should reject invalid tdoIds before creating a clone job', async function () {
      serviceContext.dal.organization.getOrganization
        .mockResolvedValueOnce({
          organizationGuid: '39677772-8da3-42e9-ac9e-361b9079e6bf'
        })
        .mockResolvedValueOnce({
          organizationGuid: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
        });

      await expect(
        dalTdo.requestClone(context, {
          input: {
            sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
            destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
            applicationIds: [
              '39677772-8da3-42e9-ac9e-361b9079e6bf',
              'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
            ],
            tdoIds: ['not-a-valid-recording-id']
          }
        })
      ).rejects.toThrow(
        'Each tdoIds entry must be a valid recording ID (UUID or integer).'
      );
    });

    it('should reject empty tdoIds array when provided', async function () {
      serviceContext.dal.organization.getOrganization
        .mockResolvedValueOnce({
          organizationGuid: '39677772-8da3-42e9-ac9e-361b9079e6bf'
        })
        .mockResolvedValueOnce({
          organizationGuid: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
        });

      await expect(
        dalTdo.requestClone(context, {
          input: {
            sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
            destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
            applicationIds: [
              '39677772-8da3-42e9-ac9e-361b9079e6bf',
              'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
            ],
            tdoIds: []
          }
        })
      ).rejects.toThrow(
        'tdoIds must contain at least one recording ID when provided'
      );
    });

    it('should reject tdoIds list over the maximum allowed size', async function () {
      serviceContext.dal.organization.getOrganization
        .mockResolvedValueOnce({
          organizationGuid: '39677772-8da3-42e9-ac9e-361b9079e6bf'
        })
        .mockResolvedValueOnce({
          organizationGuid: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
        });

      const tooMany = Array.from({ length: 1001 }, () => '1');

      await expect(
        dalTdo.requestClone(context, {
          input: {
            sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
            destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
            applicationIds: [
              '39677772-8da3-42e9-ac9e-361b9079e6bf',
              'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa'
            ],
            tdoIds: tooMany
          }
        })
      ).rejects.toThrow('tdoIds cannot contain more than 1000 entries');
    });
  });

  describe('#cancelClone', function () {
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const sourceAppId = '39677772-8da3-42e9-ac9e-361b9079e6bf';
    const destinationAppId = 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa';
    const cloneId = '11111111-2222-3333-4444-555555555555';

    function pushCloneRequestRow(status) {
      // getCloneRequest -> getCloneRequests SELECT
      serviceContext.dbConnections['core'].read._push([
        {
          clone_id: cloneId,
          status,
          source_application_id: sourceAppId,
          destination_application_id: destinationAppId,
          number_of_recordings: 0,
          number_of_completed_recordings: 0,
          request: {}
        }
      ]);
    }

    it('should flip status from running to failed', async function () {
      pushCloneRequestRow('running');
      serviceContext.dbConnections['core'].write._push(
        [
          {
            clone_id: cloneId,
            status: 'failed',
            source_application_id: sourceAppId,
            destination_application_id: destinationAppId,
            number_of_recordings: 0,
            number_of_completed_recordings: 0,
            request: {},
            response: { cancelled: true, message: 'Clone request cancelled by user' }
          }
        ]
      );

      const res = await dalTdo.cancelClone(context, {
        cloneId,
        applicationIds: [sourceAppId]
      });

      expect(res).toBeDefined();
      expect(res.id).toEqual(cloneId);
      expect(res.status).toEqual('failed');
      expect(res.response?.cancelled).toEqual(true);
    });

    it('should throw NotFound when clone request does not exist', async function () {
      // empty result from getCloneRequest
      serviceContext.dbConnections['core'].read._push([]);

      await expect(
        dalTdo.cancelClone(context, {
          cloneId,
          applicationIds: [sourceAppId]
        })
      ).rejects.toThrow('Clone request not found');
    });

    it('should throw NotAllowed when caller is not the source app', async function () {
      pushCloneRequestRow('running');

      await expect(
        dalTdo.cancelClone(context, {
          cloneId,
          applicationIds: ['00000000-0000-0000-0000-000000000000']
        })
      ).rejects.toThrow('Access denied');
    });

    it('should throw InvalidInput when clone is not in running status', async function () {
      pushCloneRequestRow('complete');

      await expect(
        dalTdo.cancelClone(context, {
          cloneId,
          applicationIds: [sourceAppId]
        })
      ).rejects.toThrow(/must be in "running" status/);
    });

    it('should throw InvalidInput when the UPDATE matches no rows', async function () {
      // pre-check thinks status is 'running'...
      pushCloneRequestRow('running');
      // ...but UPDATE returns zero rows
      serviceContext.dbConnections['core'].write._push([]);

      await expect(
        dalTdo.cancelClone(context, {
          cloneId,
          applicationIds: [sourceAppId]
        })
      ).rejects.toThrow('Unable to update clone request');
    });

    it('should reject missing cloneId', async function () {
      await expect(
        dalTdo.cancelClone(context, {
          applicationIds: [sourceAppId]
        })
      ).rejects.toThrow('cloneId is required');
    });
  });

  describe('#newTdoSetup', function () {
    let context;
    it('should look up schedule job with given time and source', async function () {
      let res, err;
      const args = {
        input: {
          launchProgram: true,
          sourceId: 321,
          startDateTime: '2020-06-26T04:16:00.821Z'
        },
        applicationId: 'applicationId',
        organizationId: 7682
      };
      const tdo = { id: 123456 };

      // serviceContext.dal.scheduledJob.getScheduleJobForMediaSourceIdAndTime
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            is_active: true
          }
        ],
        false
      );
      // serviceContext.dal.jobPipeline.createAllScheduledJobs
      serviceContext.dal.jobPipeline.createAllScheduledJobs = jest
        .fn()
        .mockImplementation((context, args) => {
          return Promise.resolve([{ id: '19041617_2tLSStmCX9' }]);
        });
      serviceContext.bll.rbacAuth.addDefaultACEsToResources = jest
        .fn()
        .mockImplementation((arg1, arg2) => {
          expect(arg2.organizationId).toEqual(7682);
          expect(arg2.objectId).toEqual('123');
          expect(arg2.resourceType).toEqual('TDO');
          return Promise.resolve();
        }
      );

      try {
        res = await dalTdo.newTdoSetup(context, args, tdo, { id: 7682 });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined;
      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.jobPipeline.createAllScheduledJobs
      ).toHaveBeenCalled();
    });
    it('should not look up schedule job and get it from input', async function () {
      let res, err;
      const args = {
        input: {
          launchProgram: true,
          sourceId: 321,
          startDateTime: '2020-06-26T04:16:00.821Z',
          scheduledJob: { id: 123 }
        },
        applicationId: 'applicationId',
        organizationId: 7682
      };
      const tdo = { id: 123456 };

      // serviceContext.dal.jobPipeline.createAllScheduledJobs
      serviceContext.dal.jobPipeline.createAllScheduledJobs = jest
        .fn()
        .mockImplementation((context, args) => {
          return Promise.resolve([{ id: '19041617_2tLSStmCX9' }]);
        });

      serviceContext.bll.rbacAuth.addDefaultACEsToResources = jest
        .fn()
        .mockImplementation((arg1, arg2) => {
          expect(arg2.organizationId).toEqual(7682);
          expect(arg2.objectId).toEqual('123');
          expect(arg2.resourceType).toEqual('TDO');
          return Promise.resolve();
        }
      );

      try {
        res = await dalTdo.newTdoSetup(context, args, tdo, { id: 7682});
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined;
      expect(err).toBeUndefined();
      expect(
        serviceContext.dal.jobPipeline.createAllScheduledJobs
      ).not.toHaveBeenCalled();
    });
  });

  describe('#deleteMetadataByTDO', function () {
    it('should throw invalid input missing tdoId', async function () {
      let res, err;
      try {
        res = await dalTdo.deleteMetadataByTDO();
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should delete metadata', async function () {
      let res, err;
      try {
        serviceContext.dbConnections['core'].write._push([], false, [
          'recording_metadata',
          'recording_id'
        ]);
        res = await dalTdo.deleteMetadataByTDO('111111');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#deleteAssetsByTDO', function () {
    it('should throw invalid input missing tdoId', async function () {
      let res, err;
      try {
        res = await dalTdo.deleteAssetsByTDO(null, []);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should delete assets', async function () {
      let res, err;
      try {
        serviceContext.dbConnections['core'].write._push(
          [],
          false,
          ['recording_asset', 'recording_id', 'asset_id = ANY'],
          (sql, params) => {
            expect(params[0].length).toEqual(2);
            return true;
          }
        );
        res = await dalTdo.deleteAssetsByTDO('111111', [
          '111111_test1',
          '111111_test2'
        ]);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#_getAssetsToDeleteByTdoId', function () {
    let context;
    it('should throw invalid input if missing tdoId', async function () {
      let res, err;
      try {
        res = await dalTdo._getAssetsToDeleteByTdoId(context, null);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });
    it('should get assets by tdoId', async function () {
      let res, err;
      const assets = [
        {
          id: 'asset_id_001',
          uri: 'uri_001',
          type: 'media'
        },
        {
          id: 'asset_id_002',
          uri: 'uri_002',
          type: 'media'
        },
        {
          id: 'asset_id_003',
          uri: 'uri_003',
          type: 'media'
        }
      ];

      try {
        // page 1
        serviceContext.dbConnections['core'].read._push(
          [assets[0], assets[1]],
          false
        );
        // page 2
        serviceContext.dbConnections['core'].read._push([assets[2]], false);

        res = await dalTdo._getAssetsToDeleteByTdoId(context, 'test_tdo_id', 2);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(_.isArray(res)).toEqual(true);
      expect(res).toEqual(expect.arrayContaining(assets));
    });
  });

  describe('#addMediaSegmentsBulk — v-next behavioral changes', function () {
    let sc;   // local service context
    let dal;  // local dal instance
    let rutil;

    // Push the minimum set of DB responses needed for addMediaSegmentsBulk
    // to fetch the TDO and pass authentication checks.
    // Strategy: return an existing media-mdp asset from getMediaMdpAsset so that
    // getOrCreateMdpAsset skips createAssetAuthorized and its entire
    // SSO/platform/write DB chain.
    function pushTdoDbRows(now, opts = {}) {
      // Push 1: TDO row consumed by getAllRecordings in _getTDO.
      sc.dbConnections['core'].read._push([
        {
          id: '123',
          application_id: 'a123',
          source_id: opts.sourceId || null,
          organization_id: '7682',
          start_date_time: now.valueOf(),
          stop_date_time: now.valueOf(),
          json: {
            startDateTime: now.unix(),
            stopDateTime: now.unix(),
            segmented: opts.segmented || false
          }
        }
      ]);
      // Push 2: existing media-mdp asset returned by getMediaMdpAsset.
      // Returning a non-null asset causes getOrCreateMdpAsset to skip
      // createAssetAuthorized, avoiding the 4+ SSO/platform/write queries.
      sc.dbConnections['core'].read._push([
        {
          asset_id: 'mdp-asset-1',
          recording_id: '123',
          type: 'media-mdp',
          content_type: 'application/json',
          uri: opts.mdpUri || 's3://bucket/mdp.json',
          user_edited: false
        }
      ]);
    }

    // One segment payload — segmentStopTimeMs > TDO stopDateTime so that
    // updateTDOCache is triggered.
    function singleSegment(groupId = 'grp-1') {
      return {
        url: `s3://bucket/${groupId}-seg1.ts`,
        details: {
          segmentDurationMs: 6000, segmentGroupId: groupId,
          segmentIndex: 1, segmentStartTimeMs: 0, segmentStopTimeMs: 6000
        }
      };
    }

    // Flush the microtask queue so fire-and-forget async side effects complete.
    async function flushMicrotasks(n = 15) {
      for (let i = 0; i < n; i++) await Promise.resolve();
    }

    beforeAll(function () {
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => ({
        getSignedUrl: (uri) => Promise.resolve(`signed:${uri}`)
      }));
      sc = initializeServiceContext();
      dal = require('./tdo.js')(sc);
    });

    afterAll(() => {
      jest.resetModules();
    });

    beforeEach(() => {
      sc.redisClient._clear();
      sc.redisCache.get.mockReset();
      sc.redisCache.get.mockResolvedValue(null);
      sc.redisCache.asyncSet.mockReset();
      sc.redisCache.set.mockReset();
      // Restore any spies created by previous tests so they don't bleed
      // through into the next test (e.g. dal.source.getSource spies).
      jest.restoreAllMocks();
    });

    // ── Test 1 ────────────────────────────────────────────────────────────────
    it('should NOT call setLastAssetUpdatedDate when adding segments', async function () {
      const now = moment();
      pushTdoDbRows(now);

      sc.dal.organization.setLastAssetUpdatedDate = jest.fn();

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('no-org-update')]
      });
      await flushMicrotasks();

      expect(sc.dal.organization.setLastAssetUpdatedDate)
        .not.toHaveBeenCalled();
    });

    // ── Test 2 ────────────────────────────────────────────────────────────────
    it('should call updateTDOCache (retryCount=3) and NOT call updateTDOStopTime_Locked (retryCount=30 twice)', async function () {
      const now = moment();
      pushTdoDbRows(now);

      // Capture every createRedisLock settings object.
      const lockSettings = [];
      const origCreate = sc.createRedisLock;
      sc.createRedisLock = jest.fn((opts) => {
        lockSettings.push({ ...opts });
        return origCreate(opts);
      });

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('stop-time-check')]
      });
      await flushMicrotasks();

      // updateTDOCache lock: retryCount=3, retryDelay=5000
      const cacheCall = lockSettings.find(
        (s) => s.retryCount === 3 && s.retryDelay === 5000
      );
      expect(cacheCall).toBeDefined();

      // getOrCreateMdpAsset uses retryCount=30. If updateTDOStopTime_Locked
      // were running it would also use retryCount=30 — total would be 2+.
      const thirtyRetryCalls = lockSettings.filter(
        (s) => s.retryCount === 30 && s.retryDelay === 1000
      );
      // Only one such call is expected (from getOrCreateMdpAsset), not two.
      expect(thirtyRetryCalls.length).toBeLessThanOrEqual(1);

      sc.createRedisLock = origCreate;
    });

    // ── Test 3 ────────────────────────────────────────────────────────────────
    it('should acquire updateTDOCache lock with retryCount=3, retryDelay=5000, TTL=10000ms', async function () {
      const now = moment();
      pushTdoDbRows(now);

      const lockCalls = []; // { settings, key, ttl }
      const origCreate = sc.createRedisLock;
      sc.createRedisLock = jest.fn((settings) => {
        const inst = origCreate(settings);
        const origLock = inst.lock.bind(inst);
        inst.lock = jest.fn((key, ttl) => {
          lockCalls.push({ settings: { ...settings }, key, ttl });
          return origLock(key, ttl);
        });
        return inst;
      });

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('lock-params')]
      });
      await flushMicrotasks();

      const cacheLock = lockCalls.find(
        (c) => c.key && c.key.endsWith('-lock_cache')
      );
      expect(cacheLock).toBeDefined();
      expect(cacheLock.settings.retryCount).toBe(3);
      expect(cacheLock.settings.retryDelay).toBe(5000);
      expect(cacheLock.ttl).toBe(10000);

      sc.createRedisLock = origCreate;
    });

    // ── Test 4 ────────────────────────────────────────────────────────────────
    it('should log updateTDOCache lock failure at debug level, not error', async function () {
      const now = moment();
      pushTdoDbRows(now);

      // Make the updateTDOCache lock (retryCount=3) always fail.
      const origCreate = sc.createRedisLock;
      sc.createRedisLock = jest.fn((settings) => {
        if (settings.retryCount === 3) {
          return {
            lock: jest.fn().mockRejectedValue(
              new Error('MOCK_LOCK: cache lock busy')
            )
          };
        }
        return origCreate(settings);
      });

      const debugSpy = jest.fn();
      const errorSpy = jest.fn();
      sc.logger.debug = debugSpy;
      sc.logger.error = errorSpy;

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('lock-log-level')]
      });
      await flushMicrotasks();

      // Must log at debug for the cache-lock failure.
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('updateTDOCache: Failed to obtain cache lock'),
        expect.any(Object)
      );

      // Must NOT log this specific message at error level.
      const errLockCalls = errorSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('Failed to obtain cache lock')
      );
      expect(errLockCalls.length).toBe(0);

      sc.createRedisLock = origCreate;
    });

    // ── Test 5 ────────────────────────────────────────────────────────────────
    it('should correctly read mediaMdpAsset from Redis for multi-segment bulk calls (redisLPush index fix)', async function () {
      const now = moment();
      pushTdoDbRows(now);
      // No DB asset write — the asset should be found in Redis (not via DB).

      const groupId = 'grp-multi';
      const redisKey =
        'TemporalDataObject:ManifestMDPList:123:' + groupId;
      const cachedAsset = {
        id: 'mdp-from-cache',
        uri: 's3://bucket/mdp-from-cache.json'
      };
      // Pre-seed the key+'-asset' entry that redisLPush reads.
      sc.redisClient.set(redisKey + '-asset', JSON.stringify(cachedAsset));

      // Spy on sadd to capture the syncHash argument.
      const saddSpy = jest.spyOn(sc.redisClient, 'sadd');

      const threeSegments = [1, 2, 3].map((i) => ({
        url: `s3://bucket/${groupId}-seg${i}.ts`,
        details: {
          segmentDurationMs: 6000,
          segmentGroupId: groupId,
          segmentIndex: i,
          segmentStartTimeMs: (i - 1) * 6000,
          segmentStopTimeMs: i * 6000
        }
      }));

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: threeSegments
      });

      // Flush microtasks for updateTDOCache side-effect.
      await flushMicrotasks();

      // redisSADD is called with '|'-joined syncHash: tdoId|redisKey|uri|assetId.
      expect(saddSpy).toHaveBeenCalled();
      const syncHashArg = saddSpy.mock.calls[0][1];
      expect(syncHashArg).toContain('s3://bucket/mdp-from-cache.json');
      expect(syncHashArg).not.toContain('undefined');
      // 4th field carries the assetId so core-eventing can skip the lookup.
      const syncHashParts = syncHashArg.split('|');
      expect(syncHashParts).toHaveLength(4);
      expect(syncHashParts[3]).toEqual('mdp-from-cache');

      saddSpy.mockRestore();
    });

    // ── Test 6 ────────────────────────────────────────────────────────────────
    it('should write signed segment URLs to Redis HASH for a live source TDO', async function () {
      const now = moment();
      // TDO with sourceId on a live source.
      pushTdoDbRows(now, { sourceId: '42' });

      // Stub isSourceLive dependencies.
      const getSourceSpy = jest
        .spyOn(sc.dal.source, 'getSource')
        .mockResolvedValueOnce({ id: '42', sourceTypeId: 'st-live' });
      const getSourceTypeSpy = jest
        .spyOn(sc.dal.sourceType, 'getSourceType')
        .mockResolvedValueOnce({ id: 'st-live', isLive: true });

      // Patch multi() to include hset so we can capture HSET calls.
      const hsetCalls = [];
      const origMulti = sc.redisClient.multi.bind(sc.redisClient);
      sc.redisClient.multi = () => {
        const m = origMulti();
        m.hset = (key, field, value) => {
          hsetCalls.push({ key, field, value });
          return m;
        };
        return m;
      };

      const groupId = 'grp-live';
      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [
          {
            url: 's3://bucket/live-seg1.ts',
            details: {
              segmentDurationMs: 6000,
              segmentGroupId: groupId,
              segmentIndex: 1,
              segmentStartTimeMs: 0,
              segmentStopTimeMs: 6000
            }
          }
        ]
      });
      await flushMicrotasks();

      // At least one HSET call must target the SignedSegmentURIs key.
      const signedHashKey = `SignedSegmentURIs:123:${groupId}`;
      const hsetForSignedKey = hsetCalls.filter(
        (c) => c.key === signedHashKey
      );
      expect(hsetForSignedKey.length).toBeGreaterThan(0);

      // The field should be the raw segment URL.
      expect(hsetForSignedKey[0].field).toBe('s3://bucket/live-seg1.ts');
      // The value should be the signed URL (via mocked getSignedUrl).
      expect(hsetForSignedKey[0].value).toBe(
        'signed:s3://bucket/live-seg1.ts'
      );

      // Restore
      getSourceSpy.mockRestore();
      getSourceTypeSpy.mockRestore();
      sc.redisClient.multi = origMulti;
    });

    // ── Test 7 ────────────────────────────────────────────────────────────────
    it('should cache isSourceLive result in redisCache after first lookup', async function () {
      const now = moment();
      pushTdoDbRows(now, { sourceId: '99', segmented: true });

      jest
        .spyOn(sc.dal.source, 'getSource')
        .mockResolvedValue({ id: '99', sourceTypeId: 'st-vod' });
      jest
        .spyOn(sc.dal.sourceType, 'getSourceType')
        .mockResolvedValue({ id: 'st-vod', isLive: false });

      const origMulti = sc.redisClient.multi.bind(sc.redisClient);
      sc.redisClient.multi = () => {
        const m = origMulti();
        m.hset = () => m; // no-op for non-live source
        return m;
      };

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('cache-test')]
      });
      await flushMicrotasks();

      // redisCache.set should have been called to store the isSourceLive result.
      expect(sc.redisCache.set).toHaveBeenCalledWith(
        'SourceIsLive',
        expect.any(String),
        false
      );

      sc.redisClient.multi = origMulti;
    });

    // ── Test 8 ────────────────────────────────────────────────────────────────
    it('should NOT call dal.source.getSource when TDO has no sourceId', async function () {
      const now = moment();
      // No sourceId in the TDO row.
      pushTdoDbRows(now, { segmented: true });

      const getSourceSpy = jest
        .spyOn(sc.dal.source, 'getSource')
        .mockResolvedValue({ id: '0', sourceTypeId: 'st-x' });

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('no-source')]
      });
      await flushMicrotasks();

      expect(getSourceSpy).not.toHaveBeenCalled();
      getSourceSpy.mockRestore();
    });

    // ── Test 9 ────────────────────────────────────────────────────────────────
    it('should use redisCache to short-circuit isSourceLive lookup on repeated calls', async function () {
      const now = moment();
      pushTdoDbRows(now, { sourceId: '77', segmented: true });

      // Simulate a cache HIT for SourceIsLive.
      sc.redisCache.get.mockImplementation((type, key) => {
        if (type === 'SourceIsLive') return Promise.resolve(true);
        return Promise.resolve(null);
      });

      const getSourceSpy = jest
        .spyOn(sc.dal.source, 'getSource')
        .mockResolvedValue({ id: '77', sourceTypeId: 'st-live' });

      const origMulti = sc.redisClient.multi.bind(sc.redisClient);
      const hsetCalls = [];
      sc.redisClient.multi = () => {
        const m = origMulti();
        m.hset = (key, field, value) => {
          hsetCalls.push({ key, field, value });
          return m;
        };
        return m;
      };

      await dal.addMediaSegmentsBulk(mockUtil.makeContext(), {
        containerId: '123',
        organizationId: '7682',
        segments: [singleSegment('cached-live')]
      });
      await flushMicrotasks();

      // Since the cache returned true, getSource should NOT have been called.
      expect(getSourceSpy).not.toHaveBeenCalled();
      // But the signed URL HASH should still be populated (source IS live from cache).
      const signedHashKey = 'SignedSegmentURIs:123:cached-live';
      expect(hsetCalls.some((c) => c.key === signedHashKey)).toBe(true);

      getSourceSpy.mockRestore();
      sc.redisClient.multi = origMulti;
    });
  });

  /**
   * #getStreamManifest — signed URL fixup block
   *
   * Covers:
   *  - After building a manifest, freshly-signed URLs are written to the
   *    SignedSegmentURIs HASH in Redis (self-healing when HASH already exists).
   *  - The fixup is skipped when the HASH does not already exist in Redis.
   */
  describe('#getStreamManifest — signed URL fixup (v-next)', function () {
    let localSc;
    let localDal;
    let rutil;
    const SEG_GROUP_ID = 'abcdefg'; // matches mockMdpData's segmentGroupId
    const mdp = mockMdpData(2);     // 1 init segment + 2 media segments

    beforeAll(function () {
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => ({
        // getSignedUrl is called by setupStreamManifest for each segment URL.
        getSignedUrl: (uri) => Promise.resolve(`signed:${uri}`)
      }));
      localSc = initializeServiceContext();
      localDal = require('./tdo.js')(localSc);
    });

    afterAll(() => {
      jest.resetModules();
    });

    beforeEach(() => {
      localSc.redisClient._clear();
    });

    /**
     * Push the DB row for getLongestMdpAssetWithCache.
     * segmentGroupId drives which Redis LIST key the fixup writes to.
     */
    function pushAssetDb(tdoId, segmentGroupId) {
      localSc.dbConnections['core'].read._push([
        {
          id: String(tdoId) + '_asset',
          assetId: String(tdoId) + '_asset',
          uri: 'http://localhost:3000/mdp-fixup',
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: segmentGroupId ? { segmentGroupId } : {},
          containerId: String(tdoId),
          recordingId: String(tdoId),
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        }
      ]);
    }

    /**
     * Seed the Redis segment LIST for a given TDO+group so that
     * getStreamManifest takes the cachedList path (avoiding extra DB reads).
     */
    function seedRedisList(tdoId, segmentGroupId) {
      const redisKey =
        'TemporalDataObject:ManifestMDPList:' +
        tdoId +
        (segmentGroupId ? ':' + segmentGroupId : '');
      // The mock Redis stores whatever value we set; lrange returns cache[key].
      // cleanRawStreamManifest expects an array of JSON strings.
      localSc.redisClient.set(
        redisKey,
        mdp.segments.map((s) => JSON.stringify(s))
      );
    }

    it('should write signed segment URLs to Redis HASH after building a manifest when HASH already exists', async function () {
      const tdoId = 555;
      const tdo = { id: tdoId };

      // Pre-seed the SignedSegmentURIs HASH so that the exists check passes
      // (simulates addMediaSegmentsBulk having previously seeded it).
      // The mock's exists() returns cache[key], so set to 1 to match
      // the real Redis EXISTS return value.
      const signedHashKey = `SignedSegmentURIs:${tdoId}:${SEG_GROUP_ID}`;
      localSc.redisClient.set(signedHashKey, 1);

      // Patch multi() to capture HSET calls.
      const hsetCalls = [];
      const origMulti = localSc.redisClient.multi.bind(localSc.redisClient);
      localSc.redisClient.multi = () => {
        const m = origMulti();
        m.hset = (key, field, value) => {
          hsetCalls.push({ key, field, value });
          return m;
        };
        return m;
      };

      // 1. DB response for getLongestMdpAssetWithCache.
      pushAssetDb(tdoId, SEG_GROUP_ID);
      // 2. Pre-seed Redis LIST so the cachedList path is taken
      //    (avoids a second DB read from getStreamManifestFromAssets).
      seedRedisList(tdoId, SEG_GROUP_ID);

      // getStreamManifest(context, tdo) — second arg IS the tdo object.
      const res = await localDal.getStreamManifest(mockUtil.makeContext(), tdo);

      expect(res).toBeDefined();
      expect(Array.isArray(res.segments)).toBe(true);
      expect(res.segments.length).toBeGreaterThan(0);

      // Fixup should have populated SignedSegmentURIs:{tdoId}:{segGroupId}
      const hsetForHash = hsetCalls.filter((c) => c.key === signedHashKey);
      expect(hsetForHash.length).toBeGreaterThan(0);
      hsetForHash.forEach((call) => {
        expect(call.value).toMatch(/^signed:/);
      });

      localSc.redisClient.multi = origMulti;
    });

    it('should skip signed URL HASH fixup when HASH does not exist in Redis', async function () {
      const tdoId = 556;
      const tdo = { id: tdoId };

      // Patch multi() to capture HSET calls.
      const hsetCalls = [];
      const origMulti = localSc.redisClient.multi.bind(localSc.redisClient);
      localSc.redisClient.multi = () => {
        const m = origMulti();
        m.hset = (key, field, value) => {
          hsetCalls.push({ key, field, value });
          return m;
        };
        return m;
      };

      // DB response for getLongestMdpAssetWithCache.
      pushAssetDb(tdoId, null); // no segmentGroupId

      // Pre-seed the Redis MANIFEST CACHE so getStreamManifest takes the
      // cachedManifest path and never calls getStreamManifestFromAssets
      // (which would need an extra DB push).
      const mdpCacheKey =
        'core-graphql-server:TemporalDataObject:ManifestMDPFile:' + tdoId;
      localSc.redisClient.set(
        mdpCacheKey,
        JSON.stringify({
          segments: [
            { url: 'http://seg/1', signedUrl: 'signed:http://seg/1' }
          ]
        })
      );

      await localDal.getStreamManifest(mockUtil.makeContext(), tdo);

      // No HSET calls should target any SignedSegmentURIs key.
      const hsetForSignedKey = hsetCalls.filter(
        (c) => c.key && c.key.startsWith('SignedSegmentURIs:')
      );
      expect(hsetForSignedKey.length).toBe(0);

      localSc.redisClient.multi = origMulti;
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * VE-27877 — init-segment stamping and identification.
   *
   * Write side: addMediaSegmentsBulk stamps details.initializationSegment=true
   * on segments whose details carry the codecs key (existence only, any
   * value), before the Redis LPUSH.
   * Read side: setupStreamManifest (exercised via getStreamManifest's
   * cachedList path) identifies the init segment by
   * initializationSegment === true || 'codecs' in details, first match wins,
   * duplicates are dropped (never leaked into the playable segment list).
   */
  describe('#initializationSegment stamping and identification (VE-27877)', function () {
    let localSc;
    let localDal;
    let rutil;

    beforeAll(function () {
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => ({
        getSignedUrl: (uri) => Promise.resolve(`signed:${uri}`)
      }));
      localSc = initializeServiceContext();
      localDal = require('./tdo.js')(localSc);
    });

    afterAll(() => {
      jest.resetModules();
    });

    beforeEach(() => {
      localSc.redisClient._clear();
      localSc.redisCache.get.mockReset();
      localSc.redisCache.get.mockResolvedValue(null);
    });

    function makeInitSegment(details) {
      return {
        url: 's3://bucket/init.mp4',
        details: { targetSegmentDurationMs: 6000, ...details }
      };
    }

    function makeMediaSegment(index) {
      return {
        url: `s3://bucket/seg-${index}.m4s`,
        details: {
          segmentDurationMs: 6000,
          segmentIndex: index,
          segmentStartTimeMs: index * 6000,
          segmentStopTimeMs: (index + 1) * 6000
        }
      };
    }

    // ── Write side: stamping in addMediaSegmentsBulk ─────────────────────

    // Same minimal DB strategy as the addMediaSegmentsBulk suite above:
    // a TDO row for _getTDO and an existing media-mdp asset so that
    // getOrCreateMdpAsset skips the createAssetAuthorized DB chain.
    function pushTdoDbRows(tdoId) {
      const now = moment();
      localSc.dbConnections['core'].read._push([
        {
          id: tdoId,
          application_id: 'a123',
          source_id: null,
          organization_id: '7682',
          start_date_time: now.valueOf(),
          stop_date_time: now.valueOf(),
          json: {
            startDateTime: now.unix(),
            stopDateTime: now.unix(),
            segmented: false
          }
        }
      ]);
      localSc.dbConnections['core'].read._push([
        {
          asset_id: 'mdp-asset-1',
          recording_id: tdoId,
          type: 'media-mdp',
          content_type: 'application/json',
          uri: 's3://bucket/mdp.json',
          metadata: {},
          user_edited: false
        }
      ]);
    }

    function captureLpush() {
      const lpushed = [];
      const origMulti = localSc.redisClient.multi.bind(localSc.redisClient);
      localSc.redisClient.multi = () => {
        const m = origMulti();
        const origLpush = m.lpush ? m.lpush.bind(m) : null;
        m.lpush = (key, value) => {
          lpushed.push({ key, value });
          return origLpush ? origLpush(key, value) : m;
        };
        return m;
      };
      return {
        lpushed,
        restore: () => {
          localSc.redisClient.multi = origMulti;
        }
      };
    }

    it('stamps initializationSegment on codecs-bearing segments in the LPUSHed payload', async function () {
      pushTdoDbRows('801');
      const capture = captureLpush();

      try {
        await localDal.addMediaSegmentsBulk(mockUtil.makeContext(), {
          containerId: '801',
          organizationId: '7682',
          segments: [
            makeInitSegment({ codecs: 'avc1.42E01E,mp4a.40.2' }),
            makeMediaSegment(0)
          ]
        });
      } finally {
        capture.restore();
      }

      const payloads = capture.lpushed.map((c) => JSON.parse(c.value));
      const init = payloads.find((p) => p.details.codecs);
      const media = payloads.find((p) => !p.details.codecs);
      expect(init.details.initializationSegment).toBe(true);
      expect(media.details.initializationSegment).toBeUndefined();
    });

    it('stamps initializationSegment on segments whose codecs is empty (existence-only check)', async function () {
      pushTdoDbRows('802');
      const capture = captureLpush();

      try {
        await localDal.addMediaSegmentsBulk(mockUtil.makeContext(), {
          containerId: '802',
          organizationId: '7682',
          segments: [
            makeInitSegment({ codecs: '' }),
            makeMediaSegment(0)
          ]
        });
      } finally {
        capture.restore();
      }

      const payloads = capture.lpushed.map((c) => JSON.parse(c.value));
      const init = payloads.find((p) => 'codecs' in p.details);
      expect(init.details.initializationSegment).toBe(true);
    });

    it('stamps nothing for MPEG-TS style batches (timing only, no codecs key)', async function () {
      pushTdoDbRows('803');
      const capture = captureLpush();

      try {
        await localDal.addMediaSegmentsBulk(mockUtil.makeContext(), {
          containerId: '803',
          organizationId: '7682',
          segments: [makeMediaSegment(0), makeMediaSegment(1)]
        });
      } finally {
        capture.restore();
      }

      const payloads = capture.lpushed.map((c) => JSON.parse(c.value));
      expect(payloads.length).toBe(2);
      payloads.forEach((p) => {
        expect(p.details.initializationSegment).toBeUndefined();
      });
    });

    it('stamps via the single addMediaSegment mutation (delegates to bulk)', async function () {
      pushTdoDbRows('804');
      const capture = captureLpush();

      try {
        await localDal.addMediaSegment(mockUtil.makeContext(), {
          input: {
            containerId: '804',
            url: 's3://bucket/init.mp4',
            details: { codecs: 'mp4a.40.2', targetSegmentDurationMs: 6000 }
          }
        });
      } finally {
        capture.restore();
      }

      const payloads = capture.lpushed.map((c) => JSON.parse(c.value));
      expect(payloads.length).toBe(1);
      expect(payloads[0].details.initializationSegment).toBe(true);
    });

    // ── Read side: identification in setupStreamManifest ─────────────────

    function pushAssetDb(tdoId) {
      localSc.dbConnections['core'].read._push([
        {
          id: `${tdoId}_asset`,
          assetId: `${tdoId}_asset`,
          uri: 'http://localhost:3000/mdp-ve27877',
          contentType: 'application/json',
          type: 'media-mdp',
          metadata: {},
          containerId: String(tdoId),
          recordingId: String(tdoId),
          createdDateTime: moment.utc().toISOString(),
          modifiedDateTime: moment.utc().toISOString(),
          userEdited: false
        }
      ]);
    }

    function seedRedisList(tdoId, segments) {
      const redisKey = 'TemporalDataObject:ManifestMDPList:' + tdoId;
      localSc.redisClient.set(
        redisKey,
        segments.map((s) => JSON.stringify(s))
      );
    }

    // One case per marker combination: [name, initDetails]
    const identificationCases = [
      ['stamped-only', { initializationSegment: true }],
      ['codecs-only', { codecs: 'avc1.42E01E' }],
      ['empty-codecs', { codecs: '' }]
    ];

    identificationCases.forEach(([name, initDetails], idx) => {
      it(`identifies the init segment by ${name}`, async function () {
        const tdoId = 900 + idx;
        pushAssetDb(tdoId);
        seedRedisList(tdoId, [
          makeInitSegment(initDetails),
          makeMediaSegment(0),
          makeMediaSegment(1)
        ]);

        const res = await localDal.getStreamManifest(mockUtil.makeContext(), {
          id: tdoId
        });

        expect(res.initSegment).toBeDefined();
        expect(res.initSegment.url).toEqual('s3://bucket/init.mp4');
        expect(res.segments.length).toEqual(2);
      });
    });

    it('never selects a media segment carrying segmentIndex/timing but no marker', async function () {
      const tdoId = 910;
      pushAssetDb(tdoId);
      seedRedisList(tdoId, [makeMediaSegment(0), makeMediaSegment(1)]);

      const res = await localDal.getStreamManifest(mockUtil.makeContext(), {
        id: tdoId
      });

      expect(res.initSegment).toBeUndefined();
      expect(res.segments.length).toEqual(2);
    });

    it('uses the first init-class segment and drops duplicates from the segment list', async function () {
      const tdoId = 911;
      pushAssetDb(tdoId);
      const duplicateInit = {
        url: 's3://bucket/init-resent.mp4',
        details: { codecs: 'avc1.42E01E', targetSegmentDurationMs: 6000 }
      };
      seedRedisList(tdoId, [
        makeInitSegment({ codecs: 'avc1.42E01E' }),
        duplicateInit,
        makeMediaSegment(0)
      ]);

      const res = await localDal.getStreamManifest(mockUtil.makeContext(), {
        id: tdoId
      });

      expect(res.initSegment.url).toEqual('s3://bucket/init.mp4');
      // The re-sent init must not appear as a playable media segment.
      expect(res.segments.length).toEqual(1);
      expect(res.segments[0].url).toEqual('s3://bucket/seg-0.m4s');
    });

    // fps is NOT an init marker (only the codecs key and the stamped
    // initializationSegment flag are). These pin that fps on a segment
    // neither promotes it to init nor drops it from the playable list.

    it('keeps an fps-bearing media segment in the playable list (fps is not an init marker)', async function () {
      const tdoId = 912;
      pushAssetDb(tdoId);
      const fpsMedia = makeMediaSegment(0);
      fpsMedia.details.fps = 29.97;
      seedRedisList(tdoId, [
        makeInitSegment({ codecs: 'avc1.42E01E' }),
        fpsMedia,
        makeMediaSegment(1)
      ]);

      const res = await localDal.getStreamManifest(mockUtil.makeContext(), {
        id: tdoId
      });

      expect(res.initSegment.url).toEqual('s3://bucket/init.mp4');
      expect(res.segments.length).toEqual(2);
      expect(res.segments.map((s) => s.url)).toEqual([
        's3://bucket/seg-0.m4s',
        's3://bucket/seg-1.m4s'
      ]);
    });

    it('does not treat an fps-bearing segment as the init when no real init exists', async function () {
      const tdoId = 913;
      pushAssetDb(tdoId);
      const fpsMedia = makeMediaSegment(0);
      fpsMedia.details.fps = 29.97;
      seedRedisList(tdoId, [fpsMedia, makeMediaSegment(1)]);

      const res = await localDal.getStreamManifest(mockUtil.makeContext(), {
        id: tdoId
      });

      expect(res.initSegment).toBeUndefined();
      expect(res.segments.length).toEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('#handleDeleteAssets', function () {
    let context;
    let tdoId;
    let rutil;
    beforeAll(function () {
      jest.mock('../util/presigner.s3.buckets', () => ({
        init: jest.fn(),
        getInstance: jest.fn(() => ({
          getDeletableUris: jest.fn((uri) => Promise.resolve({ primaryUri: uri, fallbackUri: null }))
        }))
      }));
      jest.mock('../resolvers/util.js');
      rutil = require('../resolvers/util.js');
      rutil.mockImplementation(() => {
        return {
          isOurBucket: (uri) => Promise.resolve(true)
        };
      });

      serviceContext = initializeServiceContext();
      dalTdo = require('./tdo.js')(serviceContext);
    });

    beforeEach(() => {
      context = mockUtil.makeContext();
    });

    afterAll(() => {
      jest.resetModules();
    });

    it('should throw an error if missing assets', async function () {
      let res, err;
      try {
        res = await dalTdo.handleDeleteAssets(context, tdoId, true, true);
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(
        'the assets is required. It should be an array'
      );
      expect(res).toBeUndefined();
    });
    it('should not do nothing if assets is empty', async function () {
      let res, err;
      try {
        res = await dalTdo.handleDeleteAssets(context, tdoId, true, true, []);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeUndefined();
    });
    it('should success to handle the asset deletion', async function () {
      let res, err;
      const assets = [
        {
          id: 'asset_id_001',
          uri: 'uri_001',
          type: 'media'
        },
        {
          id: 'asset_id_002',
          uri: 'uri_002',
          type: 'media'
        },
        {
          id: 'asset_id_003',
          uri: 'uri_003',
          type: 'media'
        }
      ];

      // getTDODetails
      serviceContext.dbConnections['core'].read._push(
        [
          {
            details: {
              veritoneProgram: {
                foo: 'bar'
              },
              veritoneFile: {
                foo: 'bar'
              },
              veritoneClone: {
                cloneBlobs: false,
                // tests that we don't delete a cloned asset's content.
                // ID should match one that we add to the assets list below.
                newAssetIdsToOldAssetIds: {
                  '123-cloned1': '45600002_cloned1'
                }
              }
            }
          }
        ],
        false
      );
      // deleteAssetsByTDO
      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].write._push([]);
      try {
        res = await dalTdo.handleDeleteAssets(
          context,
          'test_tdo_id',
          true,
          true,
          assets
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });
});

function expectFunction(obj, key) {
  expect(typeof obj[key]).toEqual('function');
}

// for each suite, a new clean context is created
function initializeServiceContext() {
  const {
    initializeServiceContext: initializeV3ServiceContext
  } = require('../test/initializeServiceContext');
  const serviceContext = initializeV3ServiceContext('v3DataModel');

  // const serviceContext = global.serviceContexts.v2;
  serviceContext.redisCache = {
    isCacheDirty: () => true,
    markCacheDirty: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    asyncSet: jest.fn(),
    clear: jest.fn(),
    incr: jest.fn(),
    incrBy: jest.fn(),
    incrByFloat: jest.fn(),
    decr: jest.fn(),
    multiExec: jest.fn(),
    markResourceToBeDeleted: jest.fn()
  };
  // instance dalTdo with a clean context created for each suite
  return serviceContext;
}

function mockMdpData(count) {
  const url = 'http://segment/';
  const segments = [];

  // create init segment
  segments.push({
    url: url + '0',
    details: {
      codecs: 'mp4a.40.2',
      segmentGroupId: 'abcdefg',
      targetSegmentDurationMs: 6000
    }
  });

  let time = 0;
  for (let i = 0; i < count; i++) {
    segments.push({
      url: url + (i + 1),
      details: {
        segmentDurationMs: 6000,
        segmentGroupId: 'abcdefg',
        segmentIndex: i + 1,
        segmentStartTimeMs: time,
        segmentStopTimeMs: time + 6000
      }
    });
    time += 6000;
  }
  return { segments };
}
