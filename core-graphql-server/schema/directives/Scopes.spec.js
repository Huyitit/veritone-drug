const _ = require('lodash');
const serviceContext = require('../../test/serviceContext.mock.js')();
const serviceContext1 = require('../../test/serviceContext.mock.js')();

const dir = require('./Scopes.js')(serviceContext);

_.set(serviceContext1, 'appConfig.featureFlags.enableRBACFeature', true);
serviceContext1.bll.rbacAuth = {
  hasOrganizationAuthRole: jest.fn()
};
const dir1 = require('./Scopes.js')(serviceContext1);
const errors = require('../../error')(serviceContext1.config);

describe('#Scopes', function () {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('#name', function () {
    it('should return name', function () {
      expect(dir.name).toEqual('scopes');
      expect(dir.before).toEqual(true);
    });
  });
  describe('#resolver', function () {
    it('should error if not authenticated', async function () {
      try {
        await dir.resolver({}, {}, {}, {});
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('authentication_error');
      }
    });
    it('should error if no permissions', async function () {
      try {
        await dir.resolver({ scopes: ['task:update'] }, {}, {}, {});
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('authentication_error');
      }
    });
    it('should allow with permissions', async function () {
      await dir.resolver(
        { scopes: ['task:update'] },
        {},
        {
          _authInfo: {
            tokenInfo: {
              json: {
                rights: ['task:update']
              }
            }
          }
        },
        {}
      );
    });
    it('should allow with Any permissions', async function () {
      await dir.resolver(
        { scopes: ['task:update', 'job.create'], require: 'Any' },
        {},
        {
          _authInfo: {
            tokenInfo: {
              json: {
                rights: ['task:update']
              }
            }
          }
        },
        {}
      );
    });
    it('should require All permissions', async function () {
      try {
        await dir.resolver(
          { scopes: ['task:update', 'job.create'], require: 'All' },
          {},
          {
            _authInfo: {
              tokenInfo: {
                json: {
                  rights: ['task:update']
                }
              }
            }
          },
          {}
        );

        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });

    it('should allow with permissions when RBAC feature flag is disabled', async function () {
      await dir1.resolver(
        { scopes: ['task:update'] },
        {},
        {
          _authInfo: {
            organization: {
              kvp: {
                features: {
                  enableRBACFeature: 'disabled'
                }
              }
            },
            tokenInfo: {
              json: {
                rights: ['task:update']
              }
            }
          }
        },
        {}
      );
    });

    describe('OLP is enabled', () => {
      it('should use legacy verify when cannot correctly mapped rights to permission enums', async function () {
        try {
          await dir1.resolver(
            { scopes: ['job.create', 'invalid.create'] },
            {},
            {
              _authInfo: {
                permissionMasks: [],
                organization: {
                  kvp: {
                    features: {
                      enableRBACFeature: 'enabled'
                    }
                  }
                }
              },
              tokenInfo: {
                json: {
                  rights: ['task:update']
                }
              }
            },
            {
              parentType: {}
            }
          );

          throw new Error('no throw');
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
          expect(err.data.rightsRequired).toBeDefined();
          expect(
            serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
          ).not.toHaveBeenCalled();
        }
      });
      it('should use legacy verify when the "scopes" directive argument includes one of the recording.* permissions - require all', async function () {
        try {
          await dir1.resolver(
            { scopes: ['job.create', 'recording.create'], require: 'all' },
            {},
            {
              _authInfo: {
                permissionMasks: [],
                organization: {
                  kvp: {
                    features: {
                      enableRBACFeature: 'enabled'
                    }
                  }
                }
              },
              tokenInfo: {
                json: {
                  rights: ['task:update']
                }
              }
            },
            {
              parentType: {}
            }
          );

          throw new Error('no throw');
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
          expect(err.data.rightsRequired).toBeDefined();
          expect(
            serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
          ).not.toHaveBeenCalled();
        }
      });
      it('should use legacy verify when errors are encountered during an orgRole lookup - mismatch Org ACLs or context AGs', async function () {
        serviceContext1.bll.rbacAuth.hasOrganizationAuthRole.mockRejectedValue(
          new errors.NotFound({ message: 'Missing error' })
        );
        try {
          await dir1.resolver(
            { scopes: ['job.create'] },
            {},
            {
              _authInfo: {
                permissionMasks: [],
                organization: {
                  kvp: {
                    features: {
                      enableRBACFeature: 'enabled'
                    }
                  }
                }
              },
              tokenInfo: {
                json: {
                  rights: ['task:update']
                }
              }
            },
            {
              parentType: {}
            }
          );

          throw new Error('no throw');
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
          expect(err.data.rightsRequired).toBeDefined();
          expect(
            serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
          ).toHaveBeenCalled();
        }
      });
      it('should use legacy verify when errors are encountered during an orgRole lookup - other errors', async function () {
        serviceContext1.bll.rbacAuth.hasOrganizationAuthRole.mockRejectedValue(
          new errors.InternalServerError()
        );
        try {
          await dir1.resolver(
            { scopes: ['job.create'] },
            {},
            {
              _authInfo: {
                permissionMasks: [],
                organization: {
                  kvp: {
                    features: {
                      enableRBACFeature: 'enabled'
                    }
                  }
                }
              },
              tokenInfo: {
                json: {
                  rights: ['task:update']
                }
              }
            },
            {
              parentType: {}
            }
          );

          throw new Error('no throw');
        } catch (err) {
          expect(err.name).toEqual('internal_error');
          expect(err.data.rightsRequired).not.toBeDefined();
          expect(
            serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
          ).toHaveBeenCalled();
        }
      });
      it('should throw error with no matching organization roles', async function () {
        serviceContext1.bll.rbacAuth.hasOrganizationAuthRole.mockResolvedValue(
          false
        );
        try {
          await dir1.resolver(
            { scopes: ['job.create'] },
            {},
            {
              _authInfo: {
                permissionMasks: [],
                organization: {
                  kvp: {
                    features: {
                      enableRBACFeature: 'enabled'
                    }
                  }
                }
              }
            },
            {
              parentType: {}
            }
          );

          throw new Error('no throw');
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
          expect(err.data.rightsRequired).not.toBeDefined();
          expect(
            serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
          ).toHaveBeenCalled();
        }
      });
      it('should allow', async function () {
        serviceContext1.bll.rbacAuth.hasOrganizationAuthRole.mockResolvedValue(
          true
        );
        await dir1.resolver(
          { scopes: ['job.create'] },
          {},
          {
            _authInfo: {
              permissionMasks: [],
              organization: {
                kvp: {
                  features: {
                    enableRBACFeature: 'enabled'
                  }
                }
              }
            }
          },
          {
            parentType: {}
          }
        );
        expect(
          serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
        ).toHaveBeenCalledWith(
          expect.any(Object),
          expect.arrayContaining(['JOB_CREATE']),
          expect.objectContaining({
            requireAll: false,
            throwMismatchOrgRole: true
          })
        );
      });
      it('should allow with one of the recording.* permissions and require any', async function () {
        serviceContext1.bll.rbacAuth.hasOrganizationAuthRole.mockResolvedValue(
          true
        );
        await dir1.resolver(
          { scopes: ['job.create', 'recording.read'], require: 'any' },
          {},
          {
            _authInfo: {
              permissionMasks: [],
              organization: {
                kvp: {
                  features: {
                    enableRBACFeature: 'enabled'
                  }
                }
              }
            }
          },
          {
            parentType: {}
          }
        );
        expect(
          serviceContext1.bll.rbacAuth.hasOrganizationAuthRole
        ).toHaveBeenCalledWith(
          expect.any(Object),
          expect.arrayContaining([
            'JOB_CREATE',
            'RECORDING_READ',
            'AIWARE_TDO_READ'
          ]),
          expect.objectContaining({
            requireAll: false,
            throwMismatchOrgRole: true
          })
        );
      });
    });
  });
});
