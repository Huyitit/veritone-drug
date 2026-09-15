const _ = require('lodash');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

_.set(serviceContext, 'appConfig.featureFlags.foo', true);
_.set(serviceContext, 'appConfig.featureFlags.bar', false);
serviceContext.dal.organization = {
  getOrganization: jest.fn()
};
const dir = require('./FeatureFlag.js')(serviceContext);

describe('#FeatureFlag', function () {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('#name', function () {
    it('should return name', function () {
      expect(dir.name).toEqual('featureFlag');
      expect(dir.before).toEqual(true);
    });
  });
  describe('#resolver', function () {
    it('should run with no auth no config', async function () {
      try {
        await dir.resolver(
          { fieldName: 'test', parentType: 'Test' },
          {},
          {},
          { parentType: 'Test', fieldName: 'test' }
        );
      } catch (err) {
        expect(err.name).toEqual('not_implemented');
      }
    });
    it('should run with no auth no config arg on', async function () {
      await dir.resolver(
        { defaultValue: true, fieldName: 'test', parentType: 'Test' },
        {},
        {},
        { parentType: 'Test', fieldName: 'test' }
      );
    });
    it('should run with no auth config on', async function () {
      await dir.resolver(
        { name: 'foo', fieldName: 'test', parentType: 'Test' },
        {},
        {},
        { parentType: 'Test', fieldName: 'foo' }
      );
    });
    it('should run with context, feature on', async function () {
      const context = {
        _authInfo: {
          organization: {
            kvp: {
              features: {
                orgFeature: 'enabled'
              }
            }
          }
        }
      };
      await dir.resolver(
        { name: 'orgFeature', fieldName: 'orgFeature', parentType: 'Test' },
        {},
        context,
        { parentType: 'Test', fieldName: 'orgFeature' }
      );
    });
    it('should run with context, feature off', async function () {
      const context = {
        _authInfo: {
          organization: {
            kvp: {
              features: {
                orgFeature: 'disabled'
              }
            }
          }
        }
      };
      try {
        await dir.resolver(
          {
            defaultValue: true,
            name: 'orgFeature',
            fieldName: 'orgFeature',
            parentType: 'Test'
          },
          {},
          context,
          { parentType: 'Test', fieldName: 'orgFeature' }
        );
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_implemented');
      }
    });
    it.each(['internal token', 'superadmin'])(
      'should verify the feature flag of the provided ownerOrganization - feature on - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token'
            ? mockUtil.makeContext({ authType: 'api_internal' })
            : mockUtil.makeContext();

        // getOrganization
        serviceContext.dal.organization.getOrganization.mockImplementationOnce(
          (ctx, arg) => {
            expect(arg.id).toEqual(1);

            return Promise.resolve({
              organizationId: 1,
              kvp: {
                features: {
                  orgFeature: 'enabled'
                }
              }
            });
          }
        );

        let error;

        try {
          await dir.resolver(
            {
              defaultValue: true,
              name: 'orgFeature',
              fieldName: 'orgFeature',
              parentType: 'Test',
              ownerOrgFieldPath: 'input.ownerOrganization'
            },
            {
              input: {
                ownerOrganization: 1
              }
            },
            ctxByTokenType,
            { parentType: 'Test', fieldName: 'orgFeature' }
          );
        } catch (err) {
          error = err;
        }

        expect(error).toBeUndefined();
        expect(
          serviceContext.dal.organization.getOrganization
        ).toHaveBeenCalledTimes(1);
      }
    );
    it.each(['internal token', 'superadmin'])(
      'should verify the feature flag of the provided ownerOrganization - feature off - %s',
      async (tokenType) => {
        const ctxByTokenType =
          tokenType === 'internal token'
            ? mockUtil.makeContext({ authType: 'api_internal' })
            : mockUtil.makeContext();

        // getOrganization
        serviceContext.dal.organization.getOrganization.mockImplementationOnce(
          (ctx, arg) => {
            expect(arg.id).toEqual(1);

            return Promise.resolve({
              organizationId: 1,
              kvp: {
                features: {
                  orgFeature: 'disabled'
                }
              }
            });
          }
        );

        try {
          await dir.resolver(
            {
              defaultValue: true,
              name: 'orgFeature',
              fieldName: 'orgFeature',
              parentType: 'Test'
            },
            {
              ownerOrganization: 1
            },
            ctxByTokenType,
            { parentType: 'Test', fieldName: 'orgFeature' }
          );
          throw new Error('no throw');
        } catch (err) {
          expect(err.name).toEqual('not_implemented');
        }

        expect(
          serviceContext.dal.organization.getOrganization
        ).toHaveBeenCalledTimes(1);
      }
    );
  });
});
