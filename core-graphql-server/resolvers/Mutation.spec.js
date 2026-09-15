const jestExpect = globalThis.expect;
const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();

jest.mock('../dal/util.js');
const dalUtil = require('../dal/util.js');

const httpCallMock = jest.fn();
dalUtil.mockImplementation(() => {
  return {
    httpCall: httpCallMock
  };
});

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

_.set(serviceContext.config, 'services.coreAdminUri', '/');
_.set(serviceContext.config, 'nodeEnv', 'local');
_.set(serviceContext.config, 'auth', {
  domain: '.test.com',
  userTokenCookieName: 'ima cookie',
  adminTokenCookieName: 'admin_cookie'
});

const query = require('./Mutation.js')(serviceContext);

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config,
    tracer: {
      startSpan: function () {
        return {
          setTag: function () {
            return;
          },
          finish: function () {
            return;
          }
        };
      }
    },
    response: {
      cookie: jest.fn()
    }
  };
});

describe('#Mutation', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(276);
      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    serviceContext.dal.structuredData.createSchemaMetadata = jest.fn();
    serviceContext.dal.structuredData.updateSchemaMetadata = jest.fn();
    serviceContext.dal.structuredData.createSchema = jest.fn();
    serviceContext.dal.structuredData.upsertSchemaDraft = jest.fn();
    serviceContext.dal.structuredData.updateSchemaState = jest.fn();
    serviceContext.dal.structuredData.createStructuredData = jest.fn();
    serviceContext.dal.structuredData.updateStructuredData = jest.fn();
    serviceContext.dal.structuredData.deleteStructuredData = jest.fn();

    it('should call all resolver functions', async function () {
      const asyncExecutors = ['requestClone'];
      const keys = Object.keys(query);
      for (const key of keys) {
        if (
          typeof query[key] === 'function' &&
          !_.includes(asyncExecutors, key)
        ) {
          // it's a resolver function. call it.
          try {
            await query[key]({}, { id: '1' }, context);
          } catch (err) {
            // Ignore known mock-related TypeErrors when exercising resolvers
            if (err.name)
              serviceContext.logger.debug('ignoring error ' + err.name);
            else throw err;
          }
        }
      }
    });
  });

  describe('#requestClone', function () {
    it('should return clone from dal.tdo.requestClone', async function () {
      const clone = { id: 'clone-123', status: 'pending' };
      serviceContext.dal.tdo.requestClone = jest.fn().mockResolvedValue({
        clone,
        exec: Promise.resolve()
      });
      const requestClone = query['requestClone'];
      const args = {
        input: {
          sourceApplicationId: '39677772-8da3-42e9-ac9e-361b9079e6bf',
          destinationApplicationId: 'b1f49f5c-dd80-42a7-8d9f-4d83a2fdd9fa',
          cloneBlobs: false
        }
      };
      const result = await requestClone({}, args, context);
      jestExpect(serviceContext.dal.tdo.requestClone).toHaveBeenCalledWith(
        context,
        args
      );
      jestExpect(result).toEqual(clone);
    });
  });

  describe('#cloneRequestCancel', function () {
    it('should delegate to dal.tdo.cancelClone and return the cancelled clone', async function () {
      const cancelled = { id: 'clone-123', status: 'failed' };
      serviceContext.dal.tdo.cancelClone = jest
        .fn()
        .mockResolvedValue(cancelled);
      const cloneRequestCancel = query['cloneRequestCancel'];
      const args = {
        cloneId: 'clone-123',
        applicationIds: ['39677772-8da3-42e9-ac9e-361b9079e6bf']
      };
      const result = await cloneRequestCancel({}, args, context);
      jestExpect(serviceContext.dal.tdo.cancelClone).toHaveBeenCalledWith(
        context,
        args
      );
      jestExpect(result).toEqual(cancelled);
    });
  });

  describe('#createJobV3', function () {
    it('should call different createJob implementations based on input params', async function () {
      const createJob = query['createJob'];

      jest
        .spyOn(serviceContext.dal.v3Job, 'createJob')
        .mockImplementation(function () {
          return Promise.resolve();
        });

      jest
        .spyOn(serviceContext.dal.job, 'createJob')
        .mockImplementation(function () {
          return Promise.resolve();
        });

      await createJob({}, { input: { routes: [{}] } }, context);
      jestExpect(serviceContext.dal.v3Job.createJob).toHaveBeenCalled();
      jestExpect(serviceContext.dal.job.createJob).not.toHaveBeenCalled();

      serviceContext.dal.v3Job.createJob.mockClear();
      serviceContext.dal.job.createJob.mockClear();

      await createJob({}, { input: {} }, context);
      jestExpect(serviceContext.dal.v3Job.createJob).not.toHaveBeenCalled();
      jestExpect(serviceContext.dal.job.createJob).toHaveBeenCalled();
    });
  });

  describe('#userLogin', function () {
    const testPassword = 'test'; // NOSONAR test fixture only
    it('should call setCookie without allowVanityDomain', async function () {
      httpCallMock.mockResolvedValueOnce({
        token: '00000000-0000-0000-0000-000000000000'
      });
      const userLogin = query['userLogin'];
      await userLogin(
        {},
        {
          input: { userName: 'test', password: testPassword }
        },
        context
      );
      jestExpect(httpCallMock).toHaveBeenCalled();
      jestExpect(context.response.cookie).toBeCalledWith(
        context.config.auth.userTokenCookieName,
        jestExpect.any(String),
        jestExpect.objectContaining({
          expires: jestExpect.any(Date),
          domain: context.config.auth.domain,
          path: '/',
          secure: true,
          httpOnly: true
        })
      );
    });
    it('should call setCookie with allowVanityDomain=true', async function () {
      httpCallMock.mockResolvedValueOnce({
        token: '00000000-0000-0000-0000-000000000000'
      });
      const userLogin = query['userLogin'];
      await userLogin(
        {},
        {
          input: {
            userName: 'test',
            password: testPassword,
            allowVanityDomain: true
          }
        },
        context
      );
      jestExpect(httpCallMock).toHaveBeenCalled();

      let cookieDomainForVanity = [
        'api.{{env}}',
        _.trim(context.config.auth.domain, '.')
      ].join('.');
      cookieDomainForVanity = _.replace(
        cookieDomainForVanity,
        '{{env}}',
        context.config.nodeEnv
      );
      jestExpect(context.response.cookie).toHaveBeenCalledWith(
        context.config.auth.userTokenCookieName,
        jestExpect.any(String),
        jestExpect.objectContaining({
          expires: jestExpect.any(Date),
          domain: cookieDomainForVanity,
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'None'
        })
      );
    });
  });

  describe('#updateStructuredData', function () {
    it('should call dal.updateStructuredData', async function () {
      const updateStructuredData = query['updateStructuredData'];

      serviceContext.dal.structuredData.updateStructuredData = jest
        .fn()
        .mockResolvedValue({
          id: 'test-sdo-id',
          schemaId: 'test-schema-id',
          data: { test: 'updated' }
        });

      const result = await updateStructuredData(
        {},
        {
          input: {
            id: 'test-sdo-id',
            schemaId: 'test-schema-id',
            dataRegistryId: 'test-registry-id',
            data: { test: 'updated' }
          }
        },
        context
      );

      jestExpect(
        serviceContext.dal.structuredData.updateStructuredData
      ).toHaveBeenCalledWith(
        {
          input: {
            id: 'test-sdo-id',
            schemaId: 'test-schema-id',
            dataRegistryId: 'test-registry-id',
            data: { test: 'updated' }
          }
        },
        context
      );
      jestExpect(result).toMatchObject({
        id: 'test-sdo-id',
        schemaId: 'test-schema-id'
      });
    });
  });

  describe('#processingProjectCreate', function () {
    it('should call dal.processingDeliverables.createProject', async function () {
      const processingProjectCreate = query['processingProjectCreate'];

      serviceContext.dal.processingDeliverables.createProject = jest
        .fn()
        .mockResolvedValue({
          id: 'test-project-id',
          name: 'Test Project',
          organizationId: 'test-org-id'
        });

      const result = await processingProjectCreate(
        {},
        {
          input: {
            name: 'Test Project',
            organizationId: 'test-org-id'
          }
        },
        context
      );

      jestExpect(
        serviceContext.dal.processingDeliverables.createProject
      ).toHaveBeenCalledWith(context, {
        input: {
          name: 'Test Project',
          organizationId: 'test-org-id'
        }
      });
      jestExpect(result).toMatchObject({
        id: 'test-project-id',
        name: 'Test Project',
        organizationId: 'test-org-id'
      });
    });
  });

  describe('#processingProjectDelete', function () {
    it('should call dal.processingDeliverables.deleteProject', async function () {
      const processingProjectDelete = query['processingProjectDelete'];

      serviceContext.dal.processingDeliverables.deleteProject = jest
        .fn()
        .mockResolvedValue({
          id: 'test-project-id',
          deleted: true
        });

      const result = await processingProjectDelete(
        {},
        {
          id: 'test-project-id'
        },
        context
      );

      jestExpect(
        serviceContext.dal.processingDeliverables.deleteProject
      ).toHaveBeenCalledWith(context, {
        id: 'test-project-id'
      });
      jestExpect(result).toMatchObject({
        id: 'test-project-id',
        deleted: true
      });
    });
  });

  describe('#processingDeliverableCreate', function () {
    it('should call dal.processingDeliverables.createDeliverable', async function () {
      const processingDeliverableCreate = query['processingDeliverableCreate'];

      serviceContext.dal.processingDeliverables.createDeliverable = jest
        .fn()
        .mockResolvedValue({
          id: 'test-deliverable-id',
          projectId: 'test-project-id',
          tdoId: 'test-tdo-id',
          status: 'incomplete'
        });

      const result = await processingDeliverableCreate(
        {},
        {
          input: {
            projectId: 'test-project-id',
            tdoId: 'test-tdo-id',
            requirements: [
              { deliverableType: 'AssetType', value: 'transcript' }
            ]
          }
        },
        context
      );

      jestExpect(
        serviceContext.dal.processingDeliverables.createDeliverable
      ).toHaveBeenCalledWith(context, {
        input: {
          projectId: 'test-project-id',
          tdoId: 'test-tdo-id',
          requirements: [{ deliverableType: 'AssetType', value: 'transcript' }]
        }
      });
      jestExpect(result).toMatchObject({
        id: 'test-deliverable-id',
        projectId: 'test-project-id',
        tdoId: 'test-tdo-id',
        status: 'incomplete'
      });
    });
  });

  describe('#processingDeliverableCancel', function () {
    it('should call dal.processingDeliverables.cancelDeliverable', async function () {
      const processingDeliverableCancel = query['processingDeliverableCancel'];

      serviceContext.dal.processingDeliverables.cancelDeliverable = jest
        .fn()
        .mockResolvedValue({
          id: 'test-deliverable-id',
          projectId: 'test-project-id',
          tdoId: 'test-tdo-id',
          status: 'canceled'
        });

      const result = await processingDeliverableCancel(
        {},
        {
          id: 'test-deliverable-id',
          projectId: 'test-project-id'
        },
        context
      );

      jestExpect(
        serviceContext.dal.processingDeliverables.cancelDeliverable
      ).toHaveBeenCalledWith(context, {
        id: 'test-deliverable-id',
        projectId: 'test-project-id'
      });
      jestExpect(result).toMatchObject({
        id: 'test-deliverable-id',
        projectId: 'test-project-id',
        tdoId: 'test-tdo-id',
        status: 'canceled'
      });
    });

    it('should pass message parameter when provided', async function () {
      const processingDeliverableCancel = query['processingDeliverableCancel'];

      serviceContext.dal.processingDeliverables.cancelDeliverable = jest
        .fn()
        .mockResolvedValue({
          id: 'test-deliverable-id',
          projectId: 'test-project-id',
          tdoId: 'test-tdo-id',
          status: 'canceled',
          statusMessage: 'Cancelled by user'
        });

      const result = await processingDeliverableCancel(
        {},
        {
          id: 'test-deliverable-id',
          projectId: 'test-project-id',
          message: 'Cancelled by user'
        },
        context
      );

      jestExpect(
        serviceContext.dal.processingDeliverables.cancelDeliverable
      ).toHaveBeenCalledWith(context, {
        id: 'test-deliverable-id',
        projectId: 'test-project-id',
        message: 'Cancelled by user'
      });
      jestExpect(result).toMatchObject({
        id: 'test-deliverable-id',
        projectId: 'test-project-id',
        tdoId: 'test-tdo-id',
        status: 'canceled',
        statusMessage: 'Cancelled by user'
      });
    });
  });
});
