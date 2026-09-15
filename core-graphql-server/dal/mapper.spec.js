const moment = require('moment');

const mapper = require('./mapper.js');

function cloneRow(overrides) {
  return {
    clone_id: 'clone-1',
    status: 'running',
    request: {},
    response: null,
    created_date_time: null,
    modified_date_time: null,
    number_of_recordings: 0,
    number_of_completed_recordings: 0,
    ...overrides
  };
}

describe('mapper', function () {
  describe('#mapAsset', function () {
    it('should handle weird date/time', function () {
      const dateStr = '2020-07-22T14:24:15.000Z';
      const dateMs = moment(dateStr).valueOf();
      const dateS = moment(dateStr).unix();
      let a = mapper.mapAsset({
        createdDateTime: dateMs,
        modifiedDateTime: dateMs
      });
      expect(a.createdDateTime).toBe(dateMs);
      expect(a.modifiedDateTime).toBe(dateMs);
      a = mapper.mapAsset({ createdDateTime: dateS, modifiedDateTime: dateS });
      expect(a.createdDateTime).toBe(dateMs);
      expect(a.modifiedDateTime).toBe(dateMs);
      expect(
        mapper.mapAsset({ createdDateTime: dateS }).modifiedDateTime
      ).toBeUndefined();
      expect(
        mapper.mapAsset({ modifiedDateTime: dateS }).createdDateTime
      ).toBeUndefined();
    });
  });
  describe('#mapBuildStatus', function () {
    it('should map deploy-failed', function () {
      expect(mapper.mapBuildStatus('deploy-failed')).toBe('deployFailed');
      expect(mapper.mapBuildStatus('deployed')).toBe('deployed');
    });
  });
  describe('#mapBuildStatusToDb', function () {
    it('should map deployFailed', function () {
      expect(mapper.mapBuildStatusToDb('deployFailed')).toBe('deploy-failed');
      expect(mapper.mapBuildStatusToDb('deployed')).toBe('deployed');
    });
  });
  describe('#mapEngineFieldType', function () {
    it('should accept normal key', function () {
      expect(
        mapper.mapEngineFieldType(
          'multi-picklist',
          { type: 'multi-picklist' },
          'foo'
        )
      ).toBe('MultiPicklist');
      expect(
        mapper.mapEngineFieldType('picklist', { type: 'picklist' }, 'foo')
      ).toBe('Picklist');
      expect(
        mapper.mapEngineFieldType('text', { type: 'Text' }, 'foo')
      ).toBe('Text');
      expect(
        mapper.mapEngineFieldType('number', { type: 'Number' }, 'foo')
      ).toBe('Number');
    });
    it('should accept inverse key', function () {
      expect(
        mapper.mapEngineFieldType(
          'MultiPicklist',
          { type: 'multi-picklist' },
          'foo'
        )
      ).toBe('MultiPicklist');
      expect(
        mapper.mapEngineFieldType('Picklist', { type: 'picklist' }, 'foo')
      ).toBe('Picklist');
      expect(
        mapper.mapEngineFieldType('Text', { type: 'Text' }, 'foo')
      ).toBe('Text');
      expect(
        mapper.mapEngineFieldType('Number', { type: 'Number' }, 'foo')
      ).toBe('Number');
    });
    it('should throw on unknown key', function () {
      expect(() =>
        mapper.mapEngineFieldType('whatever', { type: 'whatever' }, 'foo')
      ).toThrow(/not a recognized type/);
    });
  });

  describe('#mapProcessTemplate', function () {
    it('should map processTemplate correctly', function () {
      const processTemplateDb = {
        process_template_id: 392,
        organization_id: 7682,
        process_template_name: 'processTemplateName',
        task_list: 'taskList'
      };

      const res = mapper.mapProcessTemplate(processTemplateDb);

      expect(res).toBeDefined();
      expect(typeof res).toBe('object');
      expect(res.id).toBe(392);
      expect(res.organizationId).toBe(7682);
      expect(res.name).toBe('processTemplateName');
      expect(res.taskList).toBe('taskList');
      expect(res.processTemplateId).toBeUndefined();
      expect(res.processTemplateName).toBeUndefined();
    });
  });

  describe('#mapEngineJwtRights', function () {
    it('should map jwtRights correctly', function () {
      const jwtRights = {
        roles: [
          {
            roleName: 'adapter',
            taskRights: ['developer.engine.read'],
            assetRights: ['recording:create'],
            foo: ['bar']
          }
        ]
      };

      const res = mapper.mapEngineJwtRights(jwtRights);

      expect(res).toBeDefined();
      expect(typeof res).toBe('object');
      expect(res.roles).toHaveLength(1);
      expect(res.roles[0]).toEqual({
        roleName: 'adapter',
        taskRights: ['developer.engine.read'],
        assetRights: ['recording:create']
      });
    });
  });

  describe('#mapNotification', function () {
    let row;

    beforeEach(() => {
      row = {
        _id: '3jX3jHkBV-Bsq50JIVR_',
        flags: [null, undefined, 'seen']
      };
    });

    it('should map notification - include null/undefined in flags', function () {
      const res = mapper.mapNotification(row);

      expect(res).toBeDefined();
      expect(typeof res).toBe('object');
      expect(res.id).toBe(row._id);
      expect(res.flags).toHaveLength(1);
    });
  });

  describe('#mapEngine', function () {
    it('should map engine', function () {
      const res = mapper.mapEngine({
        deployment_model: 1,
        engine_id: 'a4635e98-e751-43fe-ab55-2a91cd93d79a',
        engine_name: 'Test engine',
        engine_state: 'active',
        description: 'Test engine description',
        currency: 'USD',
        category_id: '8dc51c0c-9c8d-494f-8de7-51fc48414851',
        created_date: '2021-10-19T03:59:39.718Z',
        updated_date: '2021-10-19T03:59:39.718Z',
        engine_manifest: { foo: 'bar' }
      });

      expect(res).toBeDefined();
      expect(res.deploymentModelNum).toBe(1);
      expect(res.deploymentModel).toBe('MostlyNetworkIsolated');
      expect(res.id).toBe('a4635e98-e751-43fe-ab55-2a91cd93d79a');
      expect(res.name).toBe('Test engine');
      expect(res.state).toBe('active');
      expect(res.description).toBe('Test engine description');
      expect(res.currency).toBe('USD');
      expect(res.categoryId).toBe('8dc51c0c-9c8d-494f-8de7-51fc48414851');
      expect(res.createdDateTime).toBe('2021-10-19T03:59:39.718Z');
      expect(res.modifiedDateTime).toBe('2021-10-19T03:59:39.718Z');
      expect(res.internalId).toBe('a4635e98-e751-43fe-ab55-2a91cd93d79a');
      expect(res.manifest.foo).toBe('bar');
    });
  });

  describe('#mapApplicationConfig', function () {
    it('should map from appId - configKey', function () {
      const row = {
        applicationId: 'appId',
        configKey: 'configKey',
        configJSON: 'configJSON',
        default_value_json: 'defaultValueJSON',
        configType: 'configType',
        configLevel: 'configLevel',
        isRequired: 'isRequired',
        isSecured: 'isSecured'
      };

      const res = mapper.mapApplicationConfig(row);

      expect(res.id).toBe('appId#configKey');
      expect(res.applicationId).toBe('appId');
      expect(res.configKey).toBe('configKey');
      expect(res.packageId).toBeUndefined();
      expect(res.organizationId).toBeUndefined();
    });
    it('should map from appId - packageId - configKey', function () {
      const row = {
        applicationId: 'appId',
        configKey: 'configKey',
        configJSON: 'configJSON',
        default_value_json: 'defaultValueJSON',
        configType: 'configType',
        configLevel: 'configLevel',
        isRequired: 'isRequired',
        isSecured: 'isSecured',
        packageId: 'packageId'
      };

      const res = mapper.mapApplicationConfig(row);

      expect(res.id).toBe('appId#p:packageId#configKey');
      expect(res.applicationId).toBe('appId');
      expect(res.configKey).toBe('configKey');
      expect(res.packageId).toBe('packageId');
      expect(res.organizationId).toBeUndefined();
    });
    it('should map from appId - organizationId - configKey', function () {
      const row = {
        applicationId: 'appId',
        configKey: 'configKey',
        configJSON: 'configJSON',
        default_value_json: 'defaultValueJSON',
        configType: 'configType',
        configLevel: 'configLevel',
        isRequired: 'isRequired',
        isSecured: 'isSecured',
        packageId: 'packageId',
        organizationGuid: 'orgId'
      };

      const res = mapper.mapApplicationConfig(row);

      expect(res.id).toBe('appId#o:orgId#configKey');
      expect(res.applicationId).toBe('appId');
      expect(res.configKey).toBe('configKey');
      expect(res.packageId).toBe('packageId');
      expect(res.organizationGuid).toBe('orgId');
    });
  });

  describe('#mapApplicationConfigFromId', function () {
    it('should map from appId - configKey', function () {
      const options = {
        id: 'appId#configKey'
      };

      mapper.mapApplicationConfigFromId(options);

      expect(options.id).toBe('appId#configKey');
      expect(options.appId).toBe('appId');
      expect(options.configKey).toBe('configKey');
      expect(options.packageId).toBeUndefined();
      expect(options.organizationId).toBeUndefined();
    });
    it('should map from appId - packageId - configKey', function () {
      const options = {
        id: 'appId#p:packageId#configKey'
      };

      mapper.mapApplicationConfigFromId(options);

      expect(options.id).toBe('appId#p:packageId#configKey');
      expect(options.appId).toBe('appId');
      expect(options.configKey).toBe('configKey');
      expect(options.packageId).toBe('packageId');
      expect(options.organizationId).toBeUndefined();
    });
    it('should map from appId - organizationId - configKey', function () {
      const options = {
        id: 'appId#o:organizationId#configKey'
      };

      mapper.mapApplicationConfigFromId(options);

      expect(options.id).toBe('appId#o:organizationId#configKey');
      expect(options.appId).toBe('appId');
      expect(options.configKey).toBe('configKey');
      expect(options.organizationId).toBe('organizationId');
      expect(options.packageId).toBeUndefined();
    });
    it('should not map from invalid id', function () {
      const options = {
        id: 'appId'
      };

      mapper.mapApplicationConfigFromId(options);

      expect(options.id).toBe('appId');
      expect(options.appId).toBeUndefined();
      expect(options.configKey).toBeUndefined();
      expect(options.packageId).toBeUndefined();
      expect(options.organizationId).toBeUndefined();

      options.id = 'appId#o:organizationId#configKey#other';

      mapper.mapApplicationConfigFromId(options);

      expect(options.id).toBe('appId#o:organizationId#configKey#other');
      expect(options.appId).toBeUndefined();
      expect(options.configKey).toBeUndefined();
      expect(options.packageId).toBeUndefined();
      expect(options.organizationId).toBeUndefined();
    });
  });

  describe('#mapCloneToDb', function () {
    it('should decamelize and keep only cloneRequestModel keys', function () {
      const out = mapper.mapCloneToDb({
        cloneId: 'a-clone-id',
        status: 'failed',
        response: { err: 'x' },
        extraIgnored: 'drop-me'
      });
      expect(out).not.toHaveProperty('extra_ignored');
      expect(out.clone_id).toBe('a-clone-id');
      expect(out.status).toBe('failed');
      expect(out.response).toEqual({ err: 'x' });
    });
    it('should strip fields not in cloneRequestModel', function () {
      const out = mapper.mapCloneToDb({
        cloneId: 'id',
        notInCloneRequestModel: 5
      });
      expect(out).not.toHaveProperty('not_in_clone_request_model');
      expect(out.clone_id).toBe('id');
    });
    it('should convert created/modified DateTime ms to unix seconds for DB integer columns', function () {
      const ms = 1776274997000;
      const out = mapper.mapCloneToDb({
        cloneId: 'x',
        createdDateTime: ms,
        modifiedDateTime: ms + 5000
      });
      expect(out.created_date_time).toBe(Math.floor(ms / 1000));
      expect(out.modified_date_time).toBe(Math.floor((ms + 5000) / 1000));
    });
    it('should leave created/modified already in seconds unchanged (floor)', function () {
      const sec = 1776274997;
      const out = mapper.mapCloneToDb({
        cloneId: 'x',
        createdDateTime: sec,
        modifiedDateTime: sec
      });
      expect(out.created_date_time).toBe(sec);
      expect(out.modified_date_time).toBe(sec);
    });
  });

  describe('#mapCloneJob', function () {
    it('should return percentage 0 when number_of_recordings is 0 (no divide-by-zero)', function () {
      const out = mapper.mapCloneJob(
        cloneRow({
          number_of_recordings: 0,
          number_of_completed_recordings: 3
        })
      );
      expect(out.percentage).toBe(0);
      expect(Number.isNaN(out.percentage)).toBe(false);
    });

    it('should return percentage 0 when number_of_recordings is missing and status is running', function () {
      const row = cloneRow({ status: 'running' });
      row.number_of_recordings = undefined;
      const out = mapper.mapCloneJob(row);
      expect(out.percentage).toBe(0);
      expect(Number.isNaN(out.percentage)).toBe(false);
    });

    it('should map created_date_time and modified_date_time from unix seconds to ms for DateTime', function () {
      const unixSec = 1775660232;
      const out = mapper.mapCloneJob(
        cloneRow({
          created_date_time: unixSec,
          modified_date_time: unixSec
        })
      );
      expect(out.createdDateTime).toBe(unixSec * 1000);
      expect(out.modifiedDateTime).toBe(unixSec * 1000);
    });

    it('should surface tdoIds from request JSON on the clone job', function () {
      const out = mapper.mapCloneJob(
        cloneRow({
          request: {
            tdoIds: [
              '123456789',
              '123456790'
            ]
          }
        })
      );
      expect(out.tdoIds).toEqual([
        '123456789',
        '123456790'
      ]);
    });

    it('should cap percentage at 100 when completed exceeds total (race / drift)', function () {
      const out = mapper.mapCloneJob(
        cloneRow({
          number_of_recordings: 100,
          number_of_completed_recordings: 112
        })
      );
      expect(out.percentage).toBe(100);
      expect(Number.isInteger(out.percentage)).toBe(true);
    });

    it('should return GraphQL Int-safe percentage (integer, no float noise)', function () {
      const out = mapper.mapCloneJob(
        cloneRow({
          number_of_recordings: 200,
          number_of_completed_recordings: 133
        })
      );
      expect(out.percentage).toBe(67);
      expect(Number.isInteger(out.percentage)).toBe(true);
    });
  });

  describe('#mapProcessingProject', function () {
    it('should preserve Date timestamp columns for DateTime serialization', function () {
      const createdAt = new Date('2026-04-30T13:43:32.233Z');
      const updatedAt = new Date('2026-04-30T14:15:10.123Z');

      const out = mapper.mapProcessingProject({
        processing_project_id: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        application_id: 'app-123',
        name: 'Test Project',
        created_at: createdAt,
        updated_at: updatedAt
      });

      expect(out.createdAt).toBeInstanceOf(Date);
      expect(out.updatedAt).toBeInstanceOf(Date);
      expect(out.createdAt.getTime()).toBe(createdAt.getTime());
      expect(out.updatedAt.getTime()).toBe(updatedAt.getTime());
    });
  });

  describe('#mapProcessingDeliverable', function () {
    it('should preserve Date timestamp columns for DateTime serialization', function () {
      const createdAt = new Date('2026-04-30T13:43:32.233Z');
      const updatedAt = new Date('2026-04-30T14:15:10.123Z');

      const out = mapper.mapProcessingDeliverable({
        processing_deliverable_id: 'del-1',
        processing_project_id: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        recording_id: '123',
        status: 'incomplete',
        created_at: createdAt,
        updated_at: updatedAt
      });

      expect(out.createdAt).toBeInstanceOf(Date);
      expect(out.updatedAt).toBeInstanceOf(Date);
      expect(out.createdAt.getTime()).toBe(createdAt.getTime());
      expect(out.updatedAt.getTime()).toBe(updatedAt.getTime());
    });
  });

  describe('mapLoginConfiguration', () => {
    it('should correctly map a login configuration', () => {
      const loginConfiguration = {
        name: 'test_login_config',
        slug: 'test_slug',
        logo: 'test_base64',
        login_button_style: {
          buttonColor: '#ffffff',
          buttonTextColor: '#000000'
        },
        organization_id: 1234,
        enabled: true,
        hide_veritone_branding: true,
        organization_guid: '03d7c903-a52f-4cee-ab32-26ff88c64c81',
        organization_name: 'test_org',
        kvp: '{}'
      };

      const result = mapper.mapLoginConfiguration(loginConfiguration);

      expect(result.enabled).toBe(true);
      expect(result.organizationInfo).toEqual({
        name: 'test_org',
        id: 1234,
        guid: '03d7c903-a52f-4cee-ab32-26ff88c64c81'
      });
      expect(result.name).toBe('test_login_config');
      expect(result.slug).toBe('test_slug');
      expect(result.logo).toBe('test_base64');
      expect(result.buttonColor).toBe('#ffffff');
      expect(result.buttonTextColor).toBe('#000000');
      expect(result.hideVeritoneBranding).toBe(true);
    });
  });
});
