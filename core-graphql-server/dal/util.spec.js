const mockContext = {
  config: {
    recordingIdParser: {
      prefix: 'mri-',
      baseUri: 'https://api.aws-dev.veritone.com/media-streamer'
    },
    recordingAssetTablePartitionActiveDate: '2018-10-22T00:00:00.000Z',
    recordingWeekConfig: {
      weeklyIdsDateActive: '2018-10-22T00:00:00.000Z',
      weekOffset: 20
    }
  },
  dal: {
    library: {
      getLibraries: jest.fn().mockImplementation((options) => {
        if (options.type == 'libraryTypesError') {
          return Promise.reject('error');
        }

        return Promise.resolve({
          records: [{ libraryTypeId: 'libraryTypes1', id: 'libraryId' }]
        });
      }),
      getLibraryEngineModels: jest.fn().mockImplementation((options) => {
        return Promise.resolve({
          records: [{ engineId: 'engineId', id: 'libraryEngineModelId' }]
        });
      })
    },
    engine: {
      getEngine: jest.fn()
    },
    tdo: {
      getTDOSourceTaskData: jest.fn().mockImplementation((options) => {
        return Promise.resolve({});
      })
    }
  },
  dbConnections: {
    core: {
      read: {}
    }
  }
};

const util = require('./util.js')(mockContext.config, mockContext);
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();

const InvalidInput = require('../error')({}).InvalidInput;
const magicIdUtil =
  require('@veritone/core-server-base/parser.recording-id.js')(mockContext);

function sec(str) {
  return moment(str).unix();
}

describe('util', () => {
  describe('magic ID stuff', () => {
    const idData = {
      recordingId: '400001663',
      assetIdWhitelist: ['assetId'],
      generativeAssetParamList: [
        { startDateTime: 12345, endDateTime: 12346 }
        //{ assetId: 123456, startDateTime: 12345, endDateTime: 12346 }
      ]
    };
    const id = magicIdUtil.createRecordingId(
      idData.recordingId,
      idData.assetIdWhitelist,
      idData.generativeAssetParamList
    );
    const obj = magicIdUtil.parseRecordingId(id);
    it('should produce ID', () => {
      expect(id).toBeDefined();
      expect(obj).toBeDefined();
    });
    it('should get magic asset', async () => {
      const asset = await util.getMagicAsset(obj);
      expect(asset).toBeDefined();
    });
  });
  describe('#validateTDOTimes()', () => {
    it('should throw on invalid', () => {
      expect(function foo() {
        // stop time less than start
        util.validateTDOTimes(
          sec('2018-02-13T04:58:09.000Z'),
          sec('2018-02-13T03:58:09.000Z')
        );
      }).toThrow(InvalidInput);
      expect(function foo() {
        // duration too long
        util.validateTDOTimes(
          sec('2018-02-13T04:58:09.000Z'),
          sec('2019-03-13T03:58:09.000Z')
        );
      }).toThrow(InvalidInput);
      expect(function foo() {
        // start time in future
        util.validateTDOTimes(
          sec('3118-02-13T04:58:09.000Z'),
          sec('2017-03-13T03:58:09.000Z')
        );
      }).toThrow(InvalidInput);
      expect(function foo() {
        // stop time in future
        util.validateTDOTimes(
          sec('2017-02-13T04:58:09.000Z'),
          sec('3017-03-13T03:58:09.000Z')
        );
      }).toThrow(InvalidInput);
      expect(function foo() {
        // start time in past
        util.validateTDOTimes(
          sec('1960-02-13T04:58:09.000Z'),
          sec('2017-03-13T03:58:09.000Z')
        );
      }).toThrow(InvalidInput);
      expect(function foo() {
        // stop time in future
        util.validateTDOTimes(
          sec('2017-02-13T04:58:09.000Z'),
          sec('1960-03-13T03:58:09.000Z')
        );
      }).toThrow(InvalidInput);
    });
  });
  it('should accept valid', () => {
    expect(function foo() {
      // equal
      util.validateTDOTimes(
        sec('2018-02-13T04:58:09.000Z'),
        sec('2018-02-13T04:58:09.000Z')
      );
    }).not.toThrow();
    expect(function foo() {
      // equal
      util.validateTDOTimes(
        sec('2018-02-13T04:58:09.000Z'),
        sec('2018-02-13T05:58:09.000Z')
      );
    }).not.toThrow();
  });

  describe('splitTrim', () => {
    it('should return empty array if source is invalid', () => {
      const results = util.splitTrim(null, '#');
      expect(results.length).toBe(0);
    });

    it('should return empty array if separater is invalid', () => {
      const results = util.splitTrim('', null);
      expect(results.length).toBe(0);
    });

    it('should return source if separator does not exist', () => {
      const results = util.splitTrim('hello world', '#');
      expect(results[0]).toBe('hello world');
    });

    it('should return trimmed values split by separator', () => {
      const results = util.splitTrim(' 1# 2 #3 # ###', '#');
      expect(results[0]).toBe('1');
      expect(results[1]).toBe('2');
      expect(results[2]).toBe('3');
    });
  });

  describe('#engineLibraryTaskGenerator', () => {
    it('should throw error if job is undefined', async () => {
      let res, err;

      try {
        res = await util.engineLibraryTaskGenerator();
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toBe('A job is required');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
    });

    it('should throw error if libraryTypes is empty', async () => {
      let res, err;
      const job = { tasks: [{}, { taskPayload: { libraryTypes: [] } }] };
      const organizationId = '7682';

      try {
        res = await util.engineLibraryTaskGenerator(job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toBe('invalid libraryTypes');
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(err.data.objectType).toBe('taskPayload.libraryTypes');
      expect(err.data.objectData.length).toBe(0);
    });

    it('should generate engine library task', async () => {
      let err;
      const job = {
        tasks: [
          {
            taskPayload: { libraryTypes: ['libraryTypes1', 'libraryTypes2'] },
            engineId: 'engineId'
          }
        ]
      };
      const organizationId = '7682';

      try {
        await util.engineLibraryTaskGenerator(job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(job.tasks.length).toBe(1);
      expect(job.tasks[0].taskPayload.libraryId).toBe('libraryId');
      expect(job.tasks[0].taskPayload.libraryEngineModelId).toBe(
        'libraryEngineModelId'
      );
    });

    it('should throw error if have internal exception', async () => {
      let err;
      const job = {
        tasks: [
          {
            taskPayload: { libraryTypes: ['libraryTypesError'] },
            engineId: 'engineId'
          }
        ]
      };
      const organizationId = '7682';

      try {
        await util.engineLibraryTaskGenerator(job, organizationId);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        expect(error.message).toBe('Failed to generate tasks: error');
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
    });
  });

  describe('#generateRecordingAssetPartition', () => {
    it('should generate recording_asset partition for single tdoId', () => {
      let res, err;
      const tdoIds = 1310000880;

      try {
        res = util.generateRecordingAssetPartition(tdoIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBe('recording.recording_asset_2020_12_50');
    });

    it('should generate the default table if input multi tdoIds in difference partition', () => {
      let res, err;
      const tdoIds = [1310000880, 1300000000];

      try {
        res = util.generateRecordingAssetPartition(tdoIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBe('recording.recording_asset');
    });

    it('should generate the partition if input multi tdoIds in tha same partition', () => {
      let res, err;
      const tdoIds = [1310000880, 1310000881];

      try {
        res = util.generateRecordingAssetPartition(tdoIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBe('recording.recording_asset_2020_12_50');
    });
  });

  describe('#generateBuildManifestFromEngine', () => {
    it('should generate build manifest from engine id', async () => {
      let res, err;
      const buildManifest = {};
      const engineId = '0a6af757-9e01-4daa-8004-7e2a50d908b1';

      mockContext.dal.engine.getEngine.mockImplementation((context, args) => {
        return Promise.resolve({
          id: '0a6af757-9e01-4daa-8004-7e2a50d908b1',
          manifest: { foo: 'bar' }
        });
      });

      try {
        res = await util.generateBuildManifestFromEngine(
          mockUtil.makeContext(),
          buildManifest,
          null,
          engineId
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual({ foo: 'bar' });
    });
  });

  describe('#coreAdminTokensResponseMapper', () => {
    it('should throw an error if the input is missed', () => {
      let res, err;

      try {
        res = util.coreAdminTokensResponseMapper();
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(res).toBeFalsy();
      expect(`${err}`).toContain(`the token is required`);
    });

    it('should work in case create new token', () => {
      let res, err;
      const input = {
        tokenHash: 'token-hash',
        tokenId: '7ed40584-c738-43c7-bef9-59fcb171e098',
        json: { tokenLabel: 'test-token', isRevoked: true, rights: [] }
      };
      const expectedResult = [
        {
          id: '7ed40584-c738-43c7-bef9-59fcb171e098',
          details: {
            hash: 'token-hash',
            name: 'test-token',
            revoked: true,
            rights: []
          }
        }
      ];

      try {
        res = util.coreAdminTokensResponseMapper(input, true);
      } catch (error) {
        err = error;
      }

      expect(res).toBeDefined();
      expect(err).toBeFalsy();
      expect(res).toEqual(expectedResult);
    });

    it('should work in case create new token (the input is an array)', () => {
      let res, err;
      const input = {
        tokenHash: 'token-hash',
        tokenId: '7ed40584-c738-43c7-bef9-59fcb171e098',
        json: { tokenLabel: 'test-token', isRevoked: true, rights: [] }
      };
      const expectedResult = [
        {
          id: '7ed40584-c738-43c7-bef9-59fcb171e098',
          details: {
            hash: 'token-hash',
            name: 'test-token',
            revoked: true,
            rights: []
          }
        }
      ];

      try {
        res = util.coreAdminTokensResponseMapper([input], true);
      } catch (error) {
        err = error;
      }

      expect(res).toBeDefined();
      expect(err).toBeFalsy();
      expect(res).toEqual(expectedResult);
    });

    it('should work in case update token', () => {
      let res, err;
      const input = {
        tokenHash: 'token-hash',
        tokenId: '7ed40584-c738-43c7-bef9-59fcb171e098',
        json: { tokenLabel: 'test-token', isRevoked: true, rights: [] }
      };
      const expectedResult = [
        {
          hash: 'token-hash',
          name: 'test-token',
          revoked: true,
          rights: []
        }
      ];

      try {
        res = util.coreAdminTokensResponseMapper(input, false);
      } catch (error) {
        err = error;
      }

      expect(res).toBeDefined();
      expect(err).toBeFalsy();
      expect(res).toEqual(expectedResult);
    });

    it('should work in case update token (the input is an array)', () => {
      let res, err;
      const input = {
        tokenHash: 'token-hash',
        tokenId: '7ed40584-c738-43c7-bef9-59fcb171e098',
        json: { tokenLabel: 'test-token', isRevoked: true, rights: [] }
      };
      const expectedResult = [
        {
          hash: 'token-hash',
          name: 'test-token',
          revoked: true,
          rights: []
        }
      ];

      try {
        res = util.coreAdminTokensResponseMapper([input], false);
      } catch (error) {
        err = error;
      }

      expect(res).toBeDefined();
      expect(err).toBeFalsy();
      expect(res).toEqual(expectedResult);
    });
  });

  describe('#parseDateFromPartitionTable', () => {
    it('should return null if partition name is invalid', () => {
      let res, err;

      try {
        res = util.parseDateFromPartitionTable(
          'recording.recording_asset',
          'recording_asset'
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeNull();
    });

    it('should return moment date', () => {
      let res, err;

      try {
        res = util.parseDateFromPartitionTable(
          'recording.recording_asset_2020_12_50',
          'recording_asset'
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(moment.isMoment(res)).toBe(true);
    });
  });

  describe('#getPartitionTables', () => {
    const serviceContext = require('../test/serviceContext.mock.js')();
    let util = require('./util.js')(mockContext.config, serviceContext);
    beforeEach(() => {
      serviceContext._clearAll();
      util = require('./util.js')(mockContext.config, serviceContext);
    });
    it('the table name prefix is required', async () => {
      let res, err;

      try {
        res = await util.getPartitionTables();
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`invalid_input`);
      expect(`${err}`).toContain(`the table name prefix is required`);
    });
    it('the db name does not exist', async () => {
      let res, err;

      try {
        res = await util.getPartitionTables('test_prefix', null, 'db_test');
      } catch (error) {
        err = error;
      }

      expect(err).toBeDefined();
      expect(`${err}`).toContain(`invalid_input`);
      expect(`${err}`).toContain(`the db client for db_test does not exist`);
    });
    it('missing db mock for the query', async () => {
      let res, err;

      try {
        res = await util.getPartitionTables('test_prefix', null, 'core');
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual(new Set());
    });
    it('should get data from db client', async () => {
      let res, err;
      serviceContext.dbConnections['core'].read._push([
        {
          schema: 'job_new',
          relname: 'testprefix_2024_01_01'
        },
        {
          schema: 'job_new',
          relname: 'testprefix_2024_01_02'
        }
      ]);
      try {
        res = await util.getPartitionTables('testprefix_', null, 'core');
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();

      const setExpected = new Set();
      setExpected.add('testprefix_2024_01_01');
      setExpected.add('testprefix_2024_01_02');
      expect(res).toEqual(setExpected);
    });
  });

  describe('#validateRoles', () => {
    // current user session info
    mockContext._authInfo = {
      organization: {
        organizationId: 1
      }
    };
    const serviceContext = require('../test/serviceContext.mock.js')();
    // flyway config for the root org
    serviceContext.config.flyway = {
      rootOrgId: 1
    };

    // roles for only the root org
    serviceContext.config.system.rootOrg.roleIds = [
      '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', // Customer Service
      '37b18322-74bf-4ae4-a46f-2cc407a9966c' // Finance Admin
    ];

    let util = require('./util.js')(mockContext.config, serviceContext);
    it('the context input is null', async () => {
      const res = await util.validateRoles(null, []);
      expect(res).toBeDefined();
      expect(res).toEqual([]);
    });
    it('getting roles are under the root org', async () => {
      mockContext._authInfo = {
        organization: {
          organizationId: 2
        }
      };
      serviceContext.config.flyway = {
        rootOrgId: 2
      };

      const res = await util.validateRoles(mockContext, [
        { roleId: '1' },
        { roleId: '3459c3de-493f-443a-8ad0-ddb9f3f6c76d' }, // Customer Service
        { roleId: '37b18322-74bf-4ae4-a46f-2cc407a9966c' } // Finance Admin
      ]);

      expect(res).toBeDefined();
      expect(res).toEqual([
        { roleId: '1' },
        { roleId: '3459c3de-493f-443a-8ad0-ddb9f3f6c76d' }, // Customer Service
        { roleId: '37b18322-74bf-4ae4-a46f-2cc407a9966c' } // Finance Admin
      ]);
    });
    it('getting roles are not under the root org - 1', async () => {
      mockContext._authInfo = {
        organization: {
          organizationId: 2
        }
      };
      serviceContext.config.flyway = {
        rootOrgId: 1
      };

      const res = await util.validateRoles(mockContext, [
        { roleId: '2' },
        { roleId: '3459c3de-493f-443a-8ad0-ddb9f3f6c76d' }, // Customer Service
        { roleId: '37b18322-74bf-4ae4-a46f-2cc407a9966c' } // Finance Admin
      ]);
      expect(res).toBeDefined();
      expect(res).toEqual([{ roleId: '2' }]);
    });
    it('getting roles are not under the root org - 2: with orgId in the input', async () => {
      mockContext._authInfo = {
        organization: {
          organizationId: 1
        }
      };
      serviceContext.config.flyway = {
        rootOrgId: 1
      };
      const orgId = 2;

      const res = await util.validateRoles(
        mockContext,
        [
          { roleId: '2' },
          { roleId: '3459c3de-493f-443a-8ad0-ddb9f3f6c76d' }, // Customer Service
          { roleId: '37b18322-74bf-4ae4-a46f-2cc407a9966c' } // Finance Admin
        ],
        orgId
      );
      expect(res).toBeDefined();
      expect(res).toEqual([{ roleId: '2' }]);
    });
  });

  describe('dateTimeToISOString', () => {
    const serviceContext = require('../test/serviceContext.mock.js')();
    let util = require('./util.js')(mockContext.config, serviceContext);

    it('should convert valid Unix timestamp (in seconds) to ISO string', () => {
      const input = 1717718400;
      expect(util.dateTimeToISOString(input)).toBe('2024-06-07T00:00:00.000Z');
    });

    it('should return undefined for null input', () => {
      expect(util.dateTimeToISOString(null)).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(util.dateTimeToISOString(undefined)).toBeUndefined();
    });

    it('should return null for non-numeric string', () => {
      expect(util.dateTimeToISOString('abc')).toBeNull();
    });

    it('should return null for object input', () => {
      expect(util.dateTimeToISOString({})).toBeNull();
    });

    it('should convert numeric string input if casted', () => {
      const input = '1717718400';
      const result = util.dateTimeToISOString(Number(input));
      expect(result).toBe('2024-06-07T00:00:00.000Z');
    });
  });

  describe('#validatePagination', () => {
    it('should return default limit 30 and offset 0 when args omit them', () => {
      const args = {};
      const result = util.validatePagination(args);
      expect(result.limit).toBe(30);
      expect(result.offset).toBe(0);
    });

    it('should use provided limit and offset from args', () => {
      const args = { limit: 10, offset: 5 };
      const result = util.validatePagination(args);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it('should throw InvalidInput when limit exceeds 1000', () => {
      const args = { limit: 1001, offset: 0 };
      expect(() => util.validatePagination(args)).toThrow(InvalidInput);
      try {
        util.validatePagination(args);
      } catch (err) {
        expect(err.message).toContain('Limit cannot exceed 1000');
        expect(err.data).toEqual({
          objectType: 'Pagination',
          field: 'limit',
          value: 1001
        });
      }
    });

    it('should allow limit 1000', () => {
      const args = { limit: 1000, offset: 0 };
      const result = util.validatePagination(args);
      expect(result.limit).toBe(1000);
      expect(result.offset).toBe(0);
    });
  });

  describe('#mapPaginationSql', () => {
    it('should append limit and offset to sqlValues and return paging SQL', () => {
      const sqlValues = [];
      const result = util.mapPaginationSql(30, 0, sqlValues);
      expect(sqlValues).toEqual([30, 0]);
      expect(result.pagingSql).toBe('LIMIT $1 OFFSET $2');
      expect(result.pagingRaw).toBe('LIMIT 30 OFFSET 0');
      expect(result.sqlValues).toBe(sqlValues);
    });

    it('should use correct placeholders when sqlValues has existing entries', () => {
      const sqlValues = ['existing'];
      const result = util.mapPaginationSql(10, 5, sqlValues);
      expect(sqlValues).toEqual(['existing', 10, 5]);
      expect(result.pagingSql).toBe('LIMIT $2 OFFSET $3');
      expect(result.pagingRaw).toBe('LIMIT 10 OFFSET 5');
    });
  });

  describe('validateAndMergeInputIds', () => {
    const serviceContext = require('../test/serviceContext.mock.js')();
    let util = require('./util.js')(mockContext.config, serviceContext);
    const validId1 = '42cccf92-c3d0-461d-8e15-be539985028e';
    const validId2 = 'e1f8c7ab-2f44-4d9e-b1f2-123456789abc';
    const validId3 = 'd6a7f13b-3c2d-4aee-9b4f-abcdef123456';

    it('should merge ids array and single id, removing duplicates', () => {
      const args = {
        ids: [validId1, validId2, validId3],
        id: validId2
      };
      const result = util.validateAndMergeInputIds(args);
      expect(result).toEqual([validId1, validId2, validId3]);
    });

    it('should return only ids array if no single id', () => {
      const args = { ids: [validId1, validId2] };
      const result = util.validateAndMergeInputIds(args);
      expect(result).toEqual([validId1, validId2]);
    });

    it('should return only single id if no ids array', () => {
      const args = { id: validId1 };
      const result = util.validateAndMergeInputIds(args);
      expect(result).toEqual([validId1]);
    });

    it('should return empty array if no ids provided', () => {
      const args = {};
      const result = util.validateAndMergeInputIds(args);
      expect(result).toEqual([]);
    });

    it('should throw error for invalid id in array', () => {
      const args = { ids: [validId1, 'invalid-id'] };
      expect(() => util.validateAndMergeInputIds(args)).toThrow(
        'Invalid ID format'
      );
    });

    it('should throw error for invalid single id', () => {
      const args = { id: 'invalid-id' };
      expect(() => util.validateAndMergeInputIds(args)).toThrow(
        'Invalid ID format'
      );
    });

    it('should remove duplicate ids', () => {
      const args = { ids: [validId1, validId2], id: validId1 };
      const result = util.validateAndMergeInputIds(args);
      expect(result).toEqual([validId1, validId2]);
    });

    it('should handle null and undefined ids array', () => {
      const args1 = { ids: null, id: validId1 };
      const args2 = { ids: undefined, id: validId1 };

      expect(util.validateAndMergeInputIds(args1)).toEqual([validId1]);
      expect(util.validateAndMergeInputIds(args2)).toEqual([validId1]);
    });

    it('should handle non-array ids gracefully', () => {
      const args = {
        ids: 'not-an-array',
        id: validId1
      };

      expect(util.validateAndMergeInputIds(args)).toEqual([validId1]);
    });

    it('should handle empty ids array', () => {
      const args = {
        ids: [],
        id: validId1
      };

      expect(util.validateAndMergeInputIds(args)).toEqual([validId1]);
    });
  });

  describe('#defineTaskOutputFailure', () => {
    const serviceContext = require('../test/serviceContext.mock.js')();
    const util = require('./util.js')(mockContext.config, serviceContext);
    const CANNED = `The failureReason doesn't match with any of taskFailureEnum values.`;

    // Nobody reported a reason, so Core must not invent one.
    describe('no failure info supplied', () => {
      it.each([
        ['both undefined', undefined, undefined],
        ['both null', null, null],
        ['both empty strings', '', ''],
        ['reason empty string, message undefined', '', undefined],
        ['reason null, message empty string', null, '']
      ])('returns null when %s', (_label, reason, message) => {
        expect(util.defineTaskOutputFailure(reason, message)).toBeNull();
      });
    });

    describe('a recognized failureReason', () => {
      it('keeps the caller message when one is given', () => {
        expect(
          util.defineTaskOutputFailure('unknown', 'chunk 6 of 6 failed')
        ).toEqual({
          failureReason: 'unknown',
          failureMessage: 'chunk 6 of 6 failed',
          isUnknownFailureType: false
        });
      });

      it('falls back to the enum message when no message is given', () => {
        expect(util.defineTaskOutputFailure('resources', undefined)).toEqual({
          failureReason: 'resources',
          failureMessage: 'The engine encountered an resource-level error.',
          isUnknownFailureType: false
        });
      });

      it('keeps the enum message rather than blanking it on an empty message', () => {
        expect(util.defineTaskOutputFailure('resources', '')).toEqual({
          failureReason: 'resources',
          failureMessage: 'The engine encountered an resource-level error.',
          isUnknownFailureType: false
        });
      });
    });

    // `other` is documented for exactly this, so the caller's detail is kept.
    it('maps a message with no reason to `other`, preserving the message', () => {
      expect(
        util.defineTaskOutputFailure(undefined, 'engine died: OOM killed')
      ).toEqual({
        failureReason: 'other',
        failureMessage: 'engine died: OOM killed',
        isUnknownFailureType: false
      });
    });

    // The unserializable reason code is replaced and flagged, keeping sender drift visible; the
    // caller's message is kept because it is the only account of what went wrong.
    it('flags a failureReason outside the enum as task_validation', () => {
      expect(
        util.defineTaskOutputFailure('parent-task-failed', 'some detail')
      ).toEqual({
        failureReason: 'task_validation',
        failureMessage: 'some detail',
        isUnknownFailureType: true
      });
    });

    it('falls back to the canned text when an unknown reason carries no message', () => {
      expect(util.defineTaskOutputFailure('parent-task-failed')).toEqual({
        failureReason: 'task_validation',
        failureMessage: CANNED,
        isUnknownFailureType: true
      });
    });

    // `none` is edge's own enum member for "no failure reason" and is the literal value edge
    // stores for a task aborted because another task failed, so it must not produce a reason.
    it('treats the edge sentinel "none" as no reason at all', () => {
      expect(util.defineTaskOutputFailure('none', undefined)).toBeNull();
    });

    it('keeps the detail when "none" arrives with a message', () => {
      expect(
        util.defineTaskOutputFailure('none', 'parent-task-failed')
      ).toEqual({
        failureReason: 'other',
        failureMessage: 'parent-task-failed',
        isUnknownFailureType: false
      });
    });

    // failureReason arrives as a free-form string on several paths, so an inherited property
    // name must not be mistaken for a known reason and stored as a reason-less failure.
    it.each(['constructor', 'toString', '__proto__', 'valueOf'])(
      'does not accept the inherited property %s as a reason',
      (key) => {
        expect(util.defineTaskOutputFailure(key, 'attacker detail')).toEqual({
          failureReason: 'task_validation',
          // the supplied message is kept, but the reason is never the inherited name
          failureMessage: 'attacker detail',
          isUnknownFailureType: true
        });
      }
    );

    // A value present only in the map is persisted verbatim and then fails enum serialization on
    // every later read; a value only in the schema is accepted on write and coerced away. Both
    // directions have shipped before, hence the two-way comparison below.
    it('covers exactly the values in the TaskFailureReason schema enum', () => {
      const fs = require('fs');
      const path = require('path');

      const schema = fs.readFileSync(
        path.join(__dirname, '../schema/schema.graphql'),
        'utf8'
      );
      const enumBlock = schema.match(/enum TaskFailureReason \{[\s\S]*?\n\}/);
      expect(enumBlock).not.toBeNull();
      const schemaValues = [...enumBlock[0].matchAll(/^ {2}([a-z_]+)$/gm)].map(
        (m) => m[1]
      );
      expect(schemaValues.length).toBeGreaterThan(30);

      // Probing the function only detects schema values missing from the map; the drift that
      // actually shipped was the other direction — a reason left in the map with no enum value —
      // so compare the map's own keys.
      const mapKeys = Object.keys(require('./taskFailureEnum.js'));
      expect(mapKeys.length).toBeGreaterThan(30);

      expect(mapKeys.filter((k) => !schemaValues.includes(k))).toEqual([]);
      expect(schemaValues.filter((v) => !mapKeys.includes(v))).toEqual([]);

      // and every value must resolve to itself rather than the unknown-value fallback
      const unmapped = schemaValues.filter((value) => {
        const res = util.defineTaskOutputFailure(value, undefined);
        return !res || res.failureReason !== value;
      });
      expect(unmapped).toEqual([]);
    });
  });
});
