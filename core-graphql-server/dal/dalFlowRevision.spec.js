const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
serviceContext.dal.flow = {
  validateReadAccess: () => jest.fn(),
};
const dal = require('./dalFlowRevision.js')(serviceContext);
const engineId = '0ac1fb8d-cca1-4e78-b01d-0c26d9d4adbe';

const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

function makeContext(options) {
  return mockUtil.makeContext(options);
}

describe('dalFlowRevision.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(17);
      expect(typeof test.getFlowRevisions).toEqual('function');
      expect(typeof test.getFlowRevision).toEqual('function');
      expect(typeof test.deployFlowRevision).toEqual('function');
      expect(typeof test.createAutomatePackage).toEqual('function');
      expect(typeof test.createFlowRevision).toEqual('function');
      expect(typeof test.updateFlowRevision).toEqual('function');
      expect(typeof test.getRevisionsDb).toEqual('function');
      expect(typeof test.getRevisionDb).toEqual('function');
      expect(typeof test.getControllerNodeRedImage).toEqual('function');
      expect(typeof test.validateFlowRevisionRuntime).toEqual('function');
      expect(typeof test.getControllerNodeRedUrl).toEqual('function');
      expect(typeof test.applyCurrentImageVersions).toEqual('function');
    });
  });

  describe('#getRevisions()', function () {
    it('should get all revisions for organization', async function () {
      coreDbRead._push([]);

      const res = await dal.getFlowRevisions(makeContext(), {
        limit: 1,
        offset: 0,
        createOnEmpty: false
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
  });

  describe('#getRevisionsDb()', function () {
    it('should get all revisions for organization - is_head', async function () {
      coreDbRead._push([]);

      const res = await dal.getRevisionsDb(makeContext(), {
        limit: 1,
        offset: 0,
        isHead: true,
        createOnEmpty: false
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
  });

  describe('#getRevisionsDb()', function () {
    it('should get all revisions for organization - is_deployed', async function () {
      coreDbRead._push([]);

      const res = await dal.getRevisionsDb(makeContext(), {
        limit: 1,
        offset: 0,
        isDeployed: true,
        createOnEmpty: false
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
  });

  describe('#getRevisionsDb()', function () {
    it('should get all revisions for organization - engine_id', async function () {
      coreDbRead._push([]);

      const res = await dal.getRevisionsDb(makeContext(), {
        limit: 1,
        offset: 0,
        engineId: engineId,
        createOnEmpty: false
      });
      expect(res).toBeDefined();
      expect(res.count).toBeDefined();
    });
  });

  describe('#getRevisionsDb()', function () {
    it('should get 1 revision for engine_id', async function () {
      coreDbRead._push([
        {
          flow_revision_id: '00000000-0000-0000-0000-000000000001'
        }
      ]);

      const res = await dal.getRevisionsDb(makeContext(), {
        limit: 1,
        offset: 0,
        engineId: engineId
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
    });

    it('should get 0 revision for engine_id - offset 1000', async function () {
      coreDbRead._push([]);

      const res = await dal.getRevisionsDb(makeContext(), {
        limit: 1,
        offset: 1000,
        engineId: engineId
      });
      expect(res).toBeDefined();
      expect(res.count).toEqual(0);
    });
  });

  describe('#getRevision', function () {
    it('should get flow revision by ID', async function () {
      coreDbRead._push([
        {
          flow_revision_id: '00000000-0000-0000-0000-000000000001'
        }
      ]);

      const res = await dal.getFlowRevision(makeContext(), {
        id: '00000000-0000-0000-0000-000000000001'
      });

      expect(res.flowRevisionId).toEqual(
        '00000000-0000-0000-0000-000000000001'
      );
    });

    it('should not return any results', async function () {
      coreDbRead._push([]);
      const res = await dal.getFlowRevision(makeContext(), {
        id: '00000000-0000-0000-0000-000000000001'
      });
      expect(res).toEqual(null);
    });
  });

  describe('#createAutomatePackage', function () {
    it('should create an automate package', async function () {
      const testPackageId = '13277a7a-8a2f-45c3-a232-3891edd866d7';
      coreDbRead._push([
        {
          packageId: '65977a7a-8a2f-45c3-a232-3891edd866d7',
          sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
        }
      ]);

      coreDbRead._push([
        {
          packageName: 'Test Package',
          packageId: testPackageId,
          distributionType: 'private',
          packageVersion: '1.0',
          primaryResourceId: '00000000-0000-0000-0000-000000000001',
          sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
        }
      ]);
      coreDbRead._push([
        {
          packageName: 'Test Package',
          packageId: testPackageId,
          distributionType: 'private',
          packageVersion: '1.0',
          primaryResourceId: '00000000-0000-0000-0000-000000000001',
          sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
        }
      ]);

      coreDbRead._push(
        [
          {
            resourceId: '61177a7a-8a2f-45c3-a232-3891edd866d7',
            resourceType: 'package'
          },
          {
            resourceId: '11677a7a-8a2f-45c3-a232-3891edd866d7',
            resourceType: 'automate_flow_revision'
          }
        ],
        false
      );
      coreDbRead._push(
        [
          {
            packageId: '13477a7a-8a2f-45c3-a232-3891edd866d7',
            organizationId: 7682,
            packageVersion: '1.0',
            primaryResourceId: '00000000-0000-0000-0000-000000000001',
            sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
          }
        ],
        false
      );
      // verifyAllowedToEditPackage
      coreDbRead._push(
        [
          {
            packageId: '13477a7a-8a2f-45c3-a232-3891edd866d7',
            organizationId: 7682,
            packageVersion: '1.0',
            primaryResourceId: '00000000-0000-0000-0000-000000000001',
            sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
          }
        ],
        false
      );
      // getLatestPackages
      coreDbRead._push(
        [
          {
            packageId: '13477a7a-8a2f-45c3-a232-3891edd866d7',
            organizationId: 7682,
            packageVersion: '1.0',
            primaryResourceId: '00000000-0000-0000-0000-000000000001',
            sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
          }
        ],
        false
      );

      // No circular reference expect
      coreDbRead._push([], false);

      // getPackageResources
      coreDbRead._push(
        [
          {
            resourceId: '61177a7a-8a2f-45c3-a232-3891edd866d7',
            resourceType: 'package'
          },
          {
            resourceId: '11677a7a-8a2f-45c3-a232-3891edd866d7',
            resourceType: 'automate_flow_revision'
          }
        ],
        false
      );
      // validate package resources - (package)
      serviceContext.dbConnections['core'].read._push(
        [{ packageId: testPackageId }],
        false
      );
      // validate package resources - (flow revision)
      serviceContext.dbConnections['core'].read._push(
        [{ flowRevisionId: '98765432-cab6-413f-805c-ec36b6e33f5b' }],
        false,
      );
      // validate primary resource
      serviceContext.dbConnections['core'].read._push([], false);
      // creating new package from doPackageCreate
      coreDbRead._push(
        [
          {
            packageId: '13477a7a-8a2f-45c3-a232-3891edd866d7',
            packageName: 'new package name',
            organizationId: 7682,
            packageVersion: '1.0',
            status: 'draft'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[8]).toEqual('draft');
          return true;
        }
      );

      // No circular reference expect
      coreDbRead._push([], false);

      coreDbRead._push(
        [
          {
            packageId: '13477a7a-8a2f-45c3-a232-3891edd866d7',
            organizationId: 7682,
            packageVersion: '1.0'
          }
        ],
        false
      );
      coreDbWrite._push([
        {
          package_id: '13477a7a-8a2f-45c3-a232-3891edd866d7'
        }
      ]);
      coreDbWrite._push([
        {
          package_id: '13477a7a-8a2f-45c3-a232-3891edd866d7'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([], false);
      const res = await dal.createAutomatePackage(makeContext(), {
        engine_id: '00000000-0000-0000-0000-000000000001',
        build_id: '1234e804-cab6-413f-805c-ec36b6e33f5b',
        flow_revision_id: '98765432-cab6-413f-805c-ec36b6e33f5b'
      });

      expect(res.packageId).toEqual('13477a7a-8a2f-45c3-a232-3891edd866d7');
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(1);
      expect(messages[0].packageId).toBe(
        '13477a7a-8a2f-45c3-a232-3891edd866d7'
      ); //public event for creating automate package
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });
  });

  describe('#getAutomatePackage', function () {
    it('should get an automate package', async function () {
      coreDbRead._push([
        {
          packageId: '13277a7a-8a2f-45c3-a232-3891edd866d7',
          sourceOriginId: '65977a7a-8a2f-45c3-a232-3891edd866d7'
        }
      ]);
      coreDbRead._push([
        {
          packageName: 'Test Package',
          packageId: '13277a7a-8a2f-45c3-a232-3891edd866d7',
          distributionType: 'private',
          packageVersion: '1.0',
          primaryResourceId: '00000000-0000-0000-0000-000000000001'
        }
      ]);

      const res = await dal.getLatestAutomatePackageFromEngineId(
        makeContext(),
        {
          engine_id: '00000000-0000-0000-0000-000000000001'
        }
      );

      expect(res.packageId).toEqual('13277a7a-8a2f-45c3-a232-3891edd866d7');
    });

    it('should fail to get an automate package', async function () {
      let res, err;
      try {
        res = await dal.getLatestAutomatePackageFromEngineId(makeContext(), {
          engine_id: '00000000-0000-0000-0000-000000000001'
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });
  });

  describe('#validateFlowRevisionRuntime', function () {
    let runtime = '';
    it('should no throw error', function () {
      runtime =
        '{\n  "flows": [],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  }\n}';
      expect(() => dal.validateFlowRevisionRuntime(runtime)).not.toThrow(Error);
    });

    it('should throw error with invalid runtime json', async function () {
      runtime = 'abc';
      try {
        await dal.validateFlowRevisionRuntime(runtime);
      } catch (error) {
        const err = error
          ? JSON.parse(JSON.stringify(error, null, 2))
          : undefined;
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(error.message).toEqual('Invalid runtime json.');
      }
    });

    it('should throw error when missing runtime flows', async function () {
      runtime =
        '{\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  }\n}';
      try {
        await dal.validateFlowRevisionRuntime(runtime);
      } catch (error) {
        const err = error
          ? JSON.parse(JSON.stringify(error, null, 2))
          : undefined;
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(error.message).toEqual('Invalid runtimeObject');
      }
    });

    it('should throw error when missing runtime package', async function () {
      runtime =
        '{\n  "flows": [],\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  }\n}';
      try {
        await dal.validateFlowRevisionRuntime(runtime);
      } catch (error) {
        const err = error
          ? JSON.parse(JSON.stringify(error, null, 2))
          : undefined;
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(error.message).toEqual('Invalid runtimeObject');
      }
    });

    it('should throw error when missing runtime version', async function () {
      runtime =
        '{\n  "flows": [],\n  "package": {\n    "dependencies": {}\n  }\n}';
      try {
        await dal.validateFlowRevisionRuntime(runtime);
      } catch (error) {
        const err = error
          ? JSON.parse(JSON.stringify(error, null, 2))
          : undefined;
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(error.message).toEqual('Invalid runtimeObject');
      }
    });

    it('should throw error when missing studio version in runtime', async function () {
      runtime =
        '{\n  "flows": [],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev"\n  }\n}';
      try {
        await dal.validateFlowRevisionRuntime(runtime);
      } catch (error) {
        const err = error
          ? JSON.parse(JSON.stringify(error, null, 2))
          : undefined;
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(error.message).toEqual('Invalid runtimeObject');
      }
    });

    it('should throw error when missing runner version in runtime', async function () {
      runtime =
        '{\n  "flows": [],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  }\n}';
      try {
        await dal.validateFlowRevisionRuntime(runtime);
      } catch (error) {
        const err = error
          ? JSON.parse(JSON.stringify(error, null, 2))
          : undefined;
        expect(err).toBeDefined();
        expect(err.name).toEqual('invalid_input');
        expect(error.message).toEqual('Invalid runtimeObject');
      }
    });
  });

  describe('#getControllerNodeRedUrl', function () {
    const staticConfig = {
      automateControllerUrl: 'https://fallback-url.example.com'
    };

    beforeEach(() => {
      delete process.env.AIWARE_CONTROLLER_URI; // Clear the environment variable before each test
    });

    it('should return the controller URL from the database when clusterId is valid', async function () {
      const clusterId = 'cluster_id_000001';
      const expected_controller_url = 'http://localhost:9000/edge/v1';

      coreDbRead._push([
        {
          cluster_id: clusterId,
          controller_url: expected_controller_url
        }
      ]);

      const res = await dal.getControllerNodeRedUrl(staticConfig, clusterId);

      expect(res).toBeDefined();
      expect(res).toEqual(expected_controller_url);
    });

    it('should return the environment controller URL if clusterId is not provided', async () => {
      process.env.AIWARE_CONTROLLER_URI = 'https://env-url.example.com';

      const res = await dal.getControllerNodeRedUrl(staticConfig, null);

      expect(res).toBe('https://env-url.example.com');
    });

    it('should return the static configuration URL if clusterId is not provided and environment URL is not set', async () => {
      const result = await dal.getControllerNodeRedUrl(staticConfig);
      expect(result).toBe(staticConfig.automateControllerUrl);
    });

    it('should return the default URL if clusterId is not provided and no valid URLs are set', async () => {
      const result = await dal.getControllerNodeRedUrl({});
      expect(result).toBe(
        'https://automate-controller-v3f.aws-prod-rt.veritone.com'
      );
    });
  });

  // VE-25953: flow-revision reads must report the image Studio will actually run, and must never
  // fail (or rewrite a non-Node-RED image) because the Edge Controller lookup did.
  describe('#applyCurrentImageVersions', function () {
    const CURRENT_STUDIO = 'registry.central.aiware.com/node-red-v3:abc1234';
    const CURRENT_RUNNER =
      'registry.central.aiware.com/node-red-runner-v3:abc1234';
    const HISTORIC_STUDIO = 'registry.central.aiware.com/node-red-v3:old0001';
    const HISTORIC_RUNNER =
      'registry.central.aiware.com/node-red-runner-v3:old0001';
    const NOTEBOOK_IMAGE = 'registry.central.aiware.com/automate-notebook:prod';

    const originalFetch = global.fetch;
    const originalControllerUri = process.env.AIWARE_CONTROLLER_URI;
    // logger.error is a plain arrow function in the mock, not a jest.fn(), so it needs a spy.
    let errorSpy;

    function historicRuntime() {
      return {
        flows: [],
        package: { dependencies: {} },
        version: { studio: HISTORIC_STUDIO, runner: HISTORIC_RUNNER }
      };
    }

    function mockLookupOk(version) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          version: version || { studio: CURRENT_STUDIO, runner: CURRENT_RUNNER }
        })
      });
      return global.fetch;
    }

    beforeEach(() => {
      // Pin the controller URL so the cache key is deterministic across cases.
      process.env.AIWARE_CONTROLLER_URI = 'https://automate-ctl.test.invalid';
      dal._resetNodeRedImageVersionCache();
      // The logger mock is created once at module load and is never cleared between tests, so
      // earlier suites (validateFlowRevisionRuntime performs a real fetch) leave calls on it.
      // Without this, any toHaveBeenCalled() assertion below would pass vacuously.
      serviceContext.logger.warn.mockClear();
      errorSpy = jest.spyOn(serviceContext.logger, 'error').mockImplementation();
      mockLookupOk();
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    afterAll(() => {
      global.fetch = originalFetch;
      if (originalControllerUri === undefined) {
        delete process.env.AIWARE_CONTROLLER_URI;
      } else {
        process.env.AIWARE_CONTROLLER_URI = originalControllerUri;
      }
    });

    it('should replace historic image versions with the configured ones', async function () {
      const res = await dal.applyCurrentImageVersions(historicRuntime());

      expect(res.version.studio).toEqual(CURRENT_STUDIO);
      expect(res.version.runner).toEqual(CURRENT_RUNNER);
    });

    it('should not mutate the runtime it was given', async function () {
      const runtime = historicRuntime();

      const res = await dal.applyCurrentImageVersions(runtime);

      expect(runtime.version.studio).toEqual(HISTORIC_STUDIO);
      expect(res).not.toBe(runtime);
      expect(res.flows).toBe(runtime.flows);
    });

    it('should keep the stored versions when the image lookup fails', async function () {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await dal.applyCurrentImageVersions(historicRuntime());

      expect(res.version.studio).toEqual(HISTORIC_STUDIO);
      expect(res.version.runner).toEqual(HISTORIC_RUNNER);
      expect(serviceContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Node-RED image lookup failed')
      );
    });

    it('should keep the stored versions when the controller returns a non-ok status', async function () {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      const res = await dal.applyCurrentImageVersions(historicRuntime());

      expect(res.version.studio).toEqual(HISTORIC_STUDIO);
      expect(res.version.runner).toEqual(HISTORIC_RUNNER);
    });

    it('should leave notebook runtimes untouched', async function () {
      const runtime = {
        flows: [],
        version: { studio: NOTEBOOK_IMAGE, runner: NOTEBOOK_IMAGE }
      };

      const res = await dal.applyCurrentImageVersions(runtime);

      expect(res).toBe(runtime);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should leave a runtime with no stored version untouched', async function () {
      const runtime = { flows: [], package: {} };

      const res = await dal.applyCurrentImageVersions(runtime);

      expect(res).toBe(runtime);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return non-object runtimes unchanged', async function () {
      expect(await dal.applyCurrentImageVersions(null)).toEqual(null);
      expect(await dal.applyCurrentImageVersions(undefined)).toEqual(undefined);
      expect(await dal.applyCurrentImageVersions('not-json')).toEqual(
        'not-json'
      );
    });

    it('should reuse a cached lookup within the TTL and refresh after it expires', async function () {
      const fetchMock = mockLookupOk();

      await dal.applyCurrentImageVersions(historicRuntime());
      await dal.applyCurrentImageVersions(historicRuntime());
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 61 * 1000);
      try {
        await dal.applyCurrentImageVersions(historicRuntime());
      } finally {
        nowSpy.mockRestore();
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should use the shorter error TTL (not the success TTL) when the lookup fails, refreshing sooner (VE-27857 row 14)', async function () {
      const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = fetchMock;

      await dal.applyCurrentImageVersions(historicRuntime());
      await dal.applyCurrentImageVersions(historicRuntime());
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const withinErrorTtl = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 9 * 1000);
      try {
        await dal.applyCurrentImageVersions(historicRuntime());
      } finally {
        withinErrorTtl.mockRestore();
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const pastErrorTtl = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 11 * 1000);
      let res;
      try {
        res = await dal.applyCurrentImageVersions(historicRuntime());
      } finally {
        pastErrorTtl.mockRestore();
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.version.studio).toEqual(HISTORIC_STUDIO);
    });

    it('should collapse concurrent lookups into a single upstream call', async function () {
      let release;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      const fetchMock = jest.fn().mockReturnValue(
        pending.then(() => ({
          ok: true,
          status: 200,
          json: async () => ({
            version: { studio: CURRENT_STUDIO, runner: CURRENT_RUNNER }
          })
        }))
      );
      global.fetch = fetchMock;

      const inFlight = Promise.all([
        dal.applyCurrentImageVersions(historicRuntime()),
        dal.applyCurrentImageVersions(historicRuntime()),
        dal.applyCurrentImageVersions(historicRuntime())
      ]);
      release();
      const results = await inFlight;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      results.forEach((res) => {
        expect(res.version.studio).toEqual(CURRENT_STUDIO);
      });
    });

    it('should bound the lookup with an abort signal', async function () {
      const fetchMock = mockLookupOk();

      await dal.applyCurrentImageVersions(historicRuntime());

      const [, options] = fetchMock.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should keep the stored versions when the lookup never settles', async function () {
      // Behavioural counterpart to the assertion above: a hung controller must degrade, not hang.
      global.fetch = jest.fn().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(options.signal.reason)
            );
          })
      );

      const res = await dal.applyCurrentImageVersions(historicRuntime());

      expect(res.version.studio).toEqual(HISTORIC_STUDIO);
      expect(res.version.runner).toEqual(HISTORIC_RUNNER);
    });

    // Regression guard: the abort deadline must stay off the write path. A deadline here would
    // abort a slow-but-healthy controller and make createFlow persist the config-default mutable
    // tag into a new flow — the stale-image bug this ticket removes. Jira: VE-25953
    it('should NOT bound getControllerNodeRedImageVersion with an abort signal', async function () {
      const fetchMock = mockLookupOk();

      await dal.getControllerNodeRedImageVersion(serviceContext);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.signal).toBeUndefined();
    });

    describe('Edge Controller response validation', function () {
      // aiware-core owns job_new.flow_revisions.runtime; a value from another service does not get
      // written there unchecked. Each of these must degrade to the stored version.
      const rejected = [
        ['a non-string', { studio: { evil: true }, runner: { evil: true } }],
        ['an empty string', { studio: '', runner: '' }],
        [
          'a foreign registry',
          {
            studio: 'evil.example/backdoor:latest',
            runner: 'evil.example/backdoor:latest'
          }
        ],
        [
          'a different repository on the expected registry',
          {
            studio: 'registry.central.aiware.com/not-node-red:abc1234',
            runner: 'registry.central.aiware.com/not-node-red:abc1234'
          }
        ],
        [
          'an oversized reference',
          {
            studio: `registry.central.aiware.com/node-red-v3:${'a'.repeat(600)}`,
            runner: `registry.central.aiware.com/node-red-runner-v3:${'a'.repeat(
              600
            )}`
          }
        ],
        [
          'a malformed reference with whitespace',
          {
            studio: 'registry.central.aiware.com/node-red-v3:a b',
            runner: 'registry.central.aiware.com/node-red-runner-v3:a b'
          }
        ]
      ];

      rejected.forEach(([label, version]) => {
        it(`should keep the stored versions when the controller returns ${label}`, async function () {
          mockLookupOk(version);

          const res = await dal.applyCurrentImageVersions(historicRuntime());

          expect(res.version.studio).toEqual(HISTORIC_STUDIO);
          expect(res.version.runner).toEqual(HISTORIC_RUNNER);
          expect(errorSpy).toHaveBeenCalled();
        });
      });

      it('should accept a new tag on the expected repository', async function () {
        mockLookupOk({
          studio: 'registry.central.aiware.com/node-red-v3:deadbee',
          runner: 'registry.central.aiware.com/node-red-runner-v3:deadbee'
        });

        const res = await dal.applyCurrentImageVersions(historicRuntime());

        expect(res.version.studio).toEqual(
          'registry.central.aiware.com/node-red-v3:deadbee'
        );
        expect(res.version.runner).toEqual(
          'registry.central.aiware.com/node-red-runner-v3:deadbee'
        );
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('should keep only the invalid half when one slot fails validation', async function () {
        mockLookupOk({
          studio: 'registry.central.aiware.com/node-red-v3:deadbee',
          runner: 'evil.example/backdoor:latest'
        });

        const res = await dal.applyCurrentImageVersions(historicRuntime());

        expect(res.version.studio).toEqual(
          'registry.central.aiware.com/node-red-v3:deadbee'
        );
        expect(res.version.runner).toEqual(HISTORIC_RUNNER);
      });
    });

    it('should redact credentials embedded in the controller URL before logging', async function () {
      process.env.AIWARE_CONTROLLER_URI =
        'https://svc:sup3rs3cret@automate-ctl.test.invalid';
      dal._resetNodeRedImageVersionCache();
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await dal.applyCurrentImageVersions(historicRuntime());

      const logged = serviceContext.logger.warn.mock.calls.flat().join('\n');
      expect(logged).not.toContain('sup3rs3cret');
      expect(logged).not.toContain('svc:');
      // Host is still present for diagnosability (minus the `automate-` prefix the image endpoint
      // strips), only the userinfo is removed.
      expect(logged).toContain('ctl.test.invalid');
    });

    it('should substitute versions on the getFlowRevision read path', async function () {
      coreDbRead._push([
        {
          flow_revision_id: '00000000-0000-0000-0000-000000000001',
          runtime: historicRuntime()
        }
      ]);

      const res = await dal.getFlowRevision(makeContext(), {
        id: '00000000-0000-0000-0000-000000000001'
      });

      expect(res.runtime.version.studio).toEqual(CURRENT_STUDIO);
      expect(res.runtime.version.runner).toEqual(CURRENT_RUNNER);
    });

    it('should substitute versions for every record on the list read path with one lookup', async function () {
      const fetchMock = mockLookupOk();
      coreDbRead._push([
        {
          flow_revision_id: '00000000-0000-0000-0000-000000000001',
          runtime: historicRuntime()
        },
        {
          flow_revision_id: '4f03e804-cab6-413f-805c-ec36b6e33f5c',
          runtime: historicRuntime()
        }
      ]);

      const res = await dal.getRevisionsDb(makeContext(), {
        limit: 10,
        offset: 0,
        engineId: engineId
      });

      expect(res.count).toEqual(2);
      res.records.forEach((record) => {
        expect(record.runtime.version.studio).toEqual(CURRENT_STUDIO);
        expect(record.runtime.version.runner).toEqual(CURRENT_RUNNER);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should substitute versions for every record on the getFlowRevisionsByIds read path with one lookup (VE-27857 row 12)', async function () {
      const fetchMock = mockLookupOk();
      coreDbRead._push([
        {
          flow_revision_id: '00000000-0000-0000-0000-000000000001',
          runtime: historicRuntime()
        },
        {
          flow_revision_id: '4f03e804-cab6-413f-805c-ec36b6e33f5c',
          runtime: historicRuntime()
        }
      ]);

      const res = await dal.getFlowRevisionsByIds(makeContext(), {
        ids: [
          '00000000-0000-0000-0000-000000000001',
          '4f03e804-cab6-413f-805c-ec36b6e33f5c'
        ],
        limit: 10,
        offset: 0
      });

      expect(res.count).toEqual(2);
      res.records.forEach((record) => {
        expect(record.runtime.version.studio).toEqual(CURRENT_STUDIO);
        expect(record.runtime.version.runner).toEqual(CURRENT_RUNNER);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should not fail the read path when the lookup fails', async function () {
      global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      coreDbRead._push([
        {
          flow_revision_id: '00000000-0000-0000-0000-000000000001',
          runtime: historicRuntime()
        }
      ]);

      const res = await dal.getFlowRevision(makeContext(), {
        id: '00000000-0000-0000-0000-000000000001'
      });

      expect(res.flowRevisionId).toEqual(
        '00000000-0000-0000-0000-000000000001'
      );
      expect(res.runtime.version.studio).toEqual(HISTORIC_STUDIO);
    });
  });
});
