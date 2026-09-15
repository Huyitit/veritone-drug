const _ = require('lodash');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();
const errors = require('../../error')(serviceContext.config);

jest.mock('../../resolvers/util.js', () => () => {
  return {
    ...jest.requireActual('../../resolvers/util.js')(serviceContext),
    getDirectivesFromInfo: jest.fn().mockImplementation(() => [
      {
        name: 'scopes',
        args: { scopes: ['discovery.access'], require: 'Any' }
      }
    ])
  };
});

let dir, rbacAuthBll, organizationDal;
beforeAll(() => {
  rbacAuthBll = {
    populateAuthContext: jest.fn(),
    hasResourceAuthRole: jest.fn(),
    hasOrganizationAuthRole: jest.fn(),
    emitAuthSuccessViaOrgRole: jest.fn(),
    emitAuthFailure: jest.fn(),
    inheritResourceACEs: jest.fn(),
    buildAuthFilter: jest.fn(),
    useRBACFeatureForResourceType: jest.fn(),
  };
  organizationDal = {
    getOrganization: jest.fn()
  };
  serviceContext.bll.rbacAuth = rbacAuthBll;
  serviceContext.dal.organization = organizationDal;
  _.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
  dir = require('./RBAC.js')(serviceContext);
});

// Helper functions for context creation
const createRBACContext = (enabled = true, enabledForSDO = true) => {
  const context = mockUtil.makeContext();
  _.set(
    context,
    '_authInfo.organization.kvp.features.enableRBACFeature',
    enabled ? 'enabled' : 'disabled'
  );
  _.set(
    context,
    '_authInfo.organization.kvp.features.enableRBACFeatureForSDO',
    enabledForSDO ? 'enabled' : 'disabled'
  );
  _.set(context, '_authInfo.authGroups', ['ag_1', 'ag_2']);
  _.set(context, 'requestContext.userInfo', {
    permissionMasks: [],
    organization: {
      kvp: {
        features: {
          enableRBACFeature: enabled ? 'enabled' : 'disabled',
          enableRBACFeatureForSDO: enabledForSDO ? 'enabled' : 'disabled'
        }
      }
    }
  });
  return context;
};

const createDisabledRBACContext = () => createRBACContext(false, false);
const createEnabledRBACContext = () => createRBACContext(true, true);

const testRBACFeatureDisabled = async (
  resolverFunction,
  isFourArgsFunc = true,
  source = {},
  directiveArgs = {},
  fieldArgs = {}
) => {
  const newContext = createDisabledRBACContext();
  let err;
  try {
    if (isFourArgsFunc) {
      await resolverFunction(directiveArgs, fieldArgs, newContext, {
        parentType: 'Test',
        fieldName: 'test'
      });
    } else {
      await resolverFunction(source, directiveArgs, fieldArgs, newContext, {
        parentType: 'Test',
        fieldName: 'test'
      });
    }
  } catch (error) {
    err = error;
  }
  expect(err).toBeUndefined();
};

describe('#RBAC', function () {
  beforeEach(() => {
    jest.clearAllMocks();
    rbacAuthBll.useRBACFeatureForResourceType.mockResolvedValue(true);
  });
  describe('@requireAuthRole', function () {
    describe('#name', function () {
      it('should return name', function () {
        expect(dir.requireAuthRole.name).toEqual('requireAuthRole');
        expect(dir.requireAuthRole.before).toEqual(true);
      });
    });
    describe('#resolver', function () {
      let context;
      beforeEach(() => {
        serviceContext._clearAll();
        context = createEnabledRBACContext();
      });
      it('should allow when RBAC feature flag is disabled', async function () {
        await testRBACFeatureDisabled(dir.requireAuthRole.resolver);
      });
      it('should throw error with no directive args', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );
        try {
          await dir.requireAuthRole.resolver(
            {},
            {
              ids: ['id_text_1']
            },
            context,
            { parentType: 'Test', fieldName: 'test' }
          );
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
        }
        expect(rbacAuthBll.emitAuthFailure).toHaveBeenCalled();
      });
      it('should throw error with no matching resource roles', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );
        try {
          rbacAuthBll.hasResourceAuthRole.mockRejectedValueOnce();
          await dir.requireAuthRole.resolver(
            {
              roles: [
                {
                  resourceType: 'Folder',
                  resourceIdFieldPath: 'ids',
                  permissions: ['AIWARE_FOLDER_READ']
                }
              ]
            },
            {
              ids: ['id_text_1']
            },
            context,
            { parentType: 'Test', fieldName: 'test' }
          );
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
        }

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(rbacAuthBll.emitAuthFailure).toHaveBeenCalled();
      });
      it('should throw error with no matching organization auth roles', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );
        try {
          rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(false);
          await dir.requireAuthRole.resolver(
            {
              orgRole: ['AIWARE_FOLDER_READ']
            },
            {
              ids: ['id_text_1']
            },
            context,
            { parentType: 'Test', fieldName: 'test' }
          );
        } catch (err) {
          expect(err.name).toEqual('not_allowed');
        }

        expect(rbacAuthBll.hasOrganizationAuthRole).toHaveBeenCalled();
        expect(rbacAuthBll.emitAuthFailure).toHaveBeenCalled();
      });
      it('success with matching resource roles', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );
        let err;
        try {
          rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce([]);
          await dir.requireAuthRole.resolver(
            {
              roles: [
                {
                  resourceType: 'Folder',
                  resourceIdFieldPath: 'ids',
                  permissions: ['AIWARE_FOLDER_READ']
                }
              ],
              orgRole: ['AIWARE_FOLDER_READ']
            },
            {
              ids: ['id_text_1']
            },
            context,
            { parentType: 'Test', fieldName: 'test' }
          );
        } catch (error) {
          err = error;
        }

        expect(err).toBeUndefined();
        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(rbacAuthBll.emitAuthSuccessViaOrgRole).not.toHaveBeenCalled();
        expect(context._authGranted).toEqual(new Map());
      });
      it('success', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );
        rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(true);
        await dir.requireAuthRole.resolver(
          {
            orgRole: ['AIWARE_FOLDER_READ']
          },
          {
            ids: ['id_text_1']
          },
          context,
          { parentType: 'Test', fieldName: 'test' }
        );

        expect(rbacAuthBll.hasOrganizationAuthRole).toHaveBeenCalled();
        expect(rbacAuthBll.emitAuthSuccessViaOrgRole).toHaveBeenCalled();
      });
      it('should ignore parentPath and parentType if resource is matched', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['SDO', new Set(['sdo_id_1'])]])
        );

        await dir.requireAuthRole.resolver(
          {
            roles: [
              {
                resourceType: 'SDO',
                resourceIdFieldPath: 'id',
                parentType: 'SDOSchema',
                parentPath: 'schemaId',
                permissions: ['AIWARE_SDO_READ']
              }
            ]
          },
          {
            id: 'sdo_id_1',
            schemaId: 'schema_id_1'
          },
          context,
          { parentType: 'Query', fieldName: 'structuredData' }
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('SDO')).toBe(true);
        expect([...resourcesMap.get('SDO').ids]).toEqual(['sdo_id_1']);
        expect(resourcesMap.has('SDOSchema')).toBe(false);
        // expectation for context._authGranted
        expect(context._authGranted).toBeDefined();
        expect(context._authGranted.has('SDO')).toBe(true);
        expect([...context._authGranted.get('SDO').ids]).toEqual(['sdo_id_1']);
      });

      it('should handle parentPath and parentType correctly if resource is not matched', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        rbacAuthBll.hasResourceAuthRole
          .mockRejectedValueOnce(new Error('not_allowed'))
          .mockResolvedValueOnce(
            new Map([['SDOSchema', new Set(['schema_id_1'])]])
          );

        await dir.requireAuthRole.resolver(
          {
            roles: [
              {
                resourceType: 'SDO',
                resourceIdFieldPath: 'id',
                parentType: 'SDOSchema',
                parentPath: 'schemaId',
                permissions: ['AIWARE_SDO_READ']
              }
            ]
          },
          {
            id: 'sdo_id_1',
            schemaId: 'schema_id_1'
          },
          context,
          { parentType: 'Query', fieldName: 'structuredData' }
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('SDO')).toBe(true);
        expect([...resourcesMap.get('SDO').ids]).toEqual(['sdo_id_1']);
        const parentResourcesMap =
          rbacAuthBll.hasResourceAuthRole.mock.calls[1][1];
        expect(parentResourcesMap.has('SDOSchema')).toBe(true);
        expect([...parentResourcesMap.get('SDOSchema').ids]).toEqual([
          'schema_id_1'
        ]);
        // expectation for context._authGranted
        expect(context._authGranted).toBeDefined();
        expect(context._authGranted.has('SDO')).toBe(true);
        expect([...context._authGranted.get('SDO').ids]).toEqual(['sdo_id_1']);
      });

      it('should handle parentPath and parentType correctly if resource is not provided', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        rbacAuthBll.hasResourceAuthRole
          .mockResolvedValueOnce(
            new Map([['SDOSchema', new Set(['schema_id_1'])]])
          );

        await dir.requireAuthRole.resolver(
          {
            roles: [
              {
                resourceType: 'SDO',
                resourceIdFieldPath: 'id',
                parentType: 'SDOSchema',
                parentPath: 'schemaId',
                permissions: ['AIWARE_SDO_READ']
              }
            ]
          },
          {
            // id: 'sdo_id_1', no SDO id provided
            schemaId: 'schema_id_1'
          },
          context,
          { parentType: 'Query', fieldName: 'structuredData' }
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const parentResourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(parentResourcesMap.has('SDOSchema')).toBe(true);
        expect([...parentResourcesMap.get('SDOSchema').ids]).toEqual([
          'schema_id_1'
        ]);
        // expectation for context._authGranted
        expect(context._authGranted).toBeDefined();
        expect(context._authGranted.has('SDO')).toBe(false); // no SDO id provided
      });

      it('should fallback to orgRole if both resource and parent resource are not matched', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        // Mock primary resource authorization to fail
        rbacAuthBll.hasResourceAuthRole
          .mockRejectedValueOnce(new Error('not_allowed: SDO'))
          .mockRejectedValueOnce(new Error('not_allowed: SDOSchema'));

        rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(true);

        let err;
        try {
          await dir.requireAuthRole.resolver(
            {
              roles: [
                {
                  resourceType: 'SDO',
                  resourceIdFieldPath: 'id',
                  parentType: 'SDOSchema',
                  parentPath: 'schemaId',
                  permissions: ['AIWARE_SDO_READ']
                }
              ],
              orgRole: ['AIWARE_SDO_READ']
            },
            {
              id: 'sdo_id_1',
              schemaId: 'schema_id_1'
            },
            context,
            { parentType: 'Query', fieldName: 'structuredData' }
          );
        } catch (error) {
          err = error;
        }

        expect(err).toBeUndefined();
        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledTimes(2);
        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('SDO')).toBe(true);
        expect([...resourcesMap.get('SDO').ids]).toEqual(['sdo_id_1']);
        const parentResourcesMap =
          rbacAuthBll.hasResourceAuthRole.mock.calls[1][1];
        expect(parentResourcesMap.has('SDOSchema')).toBe(true);
        expect([...parentResourcesMap.get('SDOSchema').ids]).toEqual([
          'schema_id_1'
        ]);
        expect(rbacAuthBll.emitAuthFailure).not.toHaveBeenCalled();
        expect(rbacAuthBll.hasOrganizationAuthRole).toHaveBeenCalled();

        // expectation for context._authGranted
        expect(context._authGranted).toBeDefined();
        expect(context._authGranted.has('SDO')).toBe(true);
        expect([...context._authGranted.get('SDO').ids]).toEqual(['sdo_id_1']);
      });

      it('should handle parentPath without parentType (same as resourceType)', async function () {
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['SDO', new Set(['sdo_id_1', 'schema_id_1'])]])
        );

        await dir.requireAuthRole.resolver(
          {
            roles: [
              {
                resourceType: 'SDO',
                resourceIdFieldPath: 'id',
                parentPath: 'schemaId',
                permissions: ['AIWARE_SDO_READ']
              }
            ]
          },
          {
            id: 'sdo_id_1',
            schemaId: 'schema_id_1'
          },
          context,
          { parentType: 'Query', fieldName: 'structuredData' }
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('SDO')).toBe(true);
        expect([...resourcesMap.get('SDO').ids]).toEqual([
          'sdo_id_1',
          'schema_id_1'
        ]);
        expect(resourcesMap.has('SDOSchema')).not.toBe(true);
      });

      it('should handle resourceTypePath correctly', async function () {
        // simulate organization fetch
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        // mock RBAC hasResourceAuthRole to return a matching entry
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['DynamicType', new Set(['id_text_1'])]])
        );

        await dir.requireAuthRole.resolver(
          {
            roles: [
              {
                resourceIdFieldPath: 'ids',
                resourceTypePath: 'type',
                permissions: ['AIWARE_FOLDER_READ']
              }
            ]
          },
          {
            ids: ['id_text_1'],
            type: 'DynamicType'
          },
          context
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('DynamicType')).toBe(true);
        expect([...resourcesMap.get('DynamicType').ids]).toEqual(['id_text_1']);

        expect(rbacAuthBll.emitAuthSuccessViaOrgRole).not.toHaveBeenCalled();
        expect(context._authGranted).toBeDefined();
      });

      it('should handle aceIds', async function () {
        // simulate organization fetch
        serviceContext.dal.organization.getOrganization.mockResolvedValueOnce(
          _.get(mockUtil.makeContext(), '_authInfo.organization')
        );

        // mock RBAC hasResourceAuthRole to return a matching entry
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['DynamicType', new Set(['id_text_1'])]])
        );

        await dir.requireAuthRole.resolver(
          {
            roles: [
              {
                resourceIdFieldPath: 'ids',
                resourceTypePath: 'type',
                permissions: ['AIWARE_FOLDER_READ']
              }
            ]
          },
          {
            ids: [
              'DynamicType::id_text_1::ag_id::ps_id',
              '::id_text_2',
              'invalidAceId::'
            ],
            type: 'DynamicType'
          },
          context
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          context,
          expect.any(Map),
          true
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('DynamicType')).toBe(true);
        expect([...resourcesMap.get('DynamicType').ids]).toEqual([
          'id_text_1',
          'id_text_2',
          'invalidAceId::'
        ]);

        expect(rbacAuthBll.emitAuthSuccessViaOrgRole).not.toHaveBeenCalled();
        expect(context._authGranted).toBeDefined();
      });

      it.each([
        [{ resourceType: 'SDO' }],
        [{ resourceType: 'SDOSchema' }],
        [{ parentType: 'SDOSchema' }]
      ])(
        'should allow when RBAC is disabled for resource type %p',
        async function (roleDefinition) {
          const disabledForSDOContext = createRBACContext(true, false);
          rbacAuthBll.useRBACFeatureForResourceType.mockImplementation((ctx, orgObj, resourceType) => {
            expect(['SDO', 'SDOSchema']).toContain(resourceType);
            return Promise.resolve(false);
          });
          await dir.requireAuthRole.resolver(
            { roles: [roleDefinition] },
            {},
            disabledForSDOContext,
            {
              parentType: 'Test',
              fieldName: 'test'
            }
          );

          expect(rbacAuthBll.useRBACFeatureForResourceType).toHaveBeenCalled();
          expect(rbacAuthBll.hasResourceAuthRole).not.toHaveBeenCalled();
          expect(rbacAuthBll.hasOrganizationAuthRole).not.toHaveBeenCalled();
        }
      );
    });
  });
  describe('@verifyAuthRoleAccess', function () {
    describe('#name', function () {
      it('should return name', function () {
        expect(dir.verifyAuthRoleAccess.name).toEqual('verifyAuthRoleAccess');
        expect(dir.verifyAuthRoleAccess.before).toEqual(false);
      });
    });
    describe('#resolver', function () {
      let context;
      beforeEach(() => {
        serviceContext._clearAll();
        context = createEnabledRBACContext();
      });
      it('should allow when RBAC feature flag is disabled', async function () {
        await testRBACFeatureDisabled(dir.verifyAuthRoleAccess.resolver, false);
      });
      it('should rethrow error from a query', async function () {
        try {
          await dir.verifyAuthRoleAccess.resolver(
            {},
            {},
            {},
            context,
            {
              parentType: 'Test',
              fieldName: 'test'
            },
            [],
            new Error('error from a query')
          );
        } catch (err) {
          expect(err.message).toEqual('error from a query');
        }
      });
      it('result is array - should return empty array when resource roles are not matched', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(new Map());
        const directiveArgs = {
          roles: [
            {
              resourceType: 'Folder',
              resourceIdFieldPath: 'objectId',
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        };
        const result = [{ objectId: 'obj_id_1' }];
        const filteredResult = await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(filteredResult.length).toEqual(0);
      });
      it('result is array - should return new array filtered by resource roles', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['Folder', new Set(['obj_id_1'])]])
        );
        const directiveArgs = {
          roles: [
            {
              resourceType: 'Folder',
              resourceIdFieldPath: 'objectId',
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        };
        const result = [
          { objectId: 'obj_id_1' },
          { objectId: 'obj_id_2' },
          { objectId: 'obj_id_3' }
        ];
        const filteredResult = await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(filteredResult.length).toEqual(1);
      });
      it('result is paginated - should return empty records when resource roles are not matched', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(new Map());
        const directiveArgs = {
          roles: [
            {
              resourceType: 'Folder',
              resourceIdFieldPath: 'objectId',
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        };
        const result = {
          records: [{ objectId: 'obj_id_1' }],
          count: 1
        };
        const filteredResult = await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(filteredResult.records.length).toEqual(0);
        expect(filteredResult.count).toEqual(0);
      });
      it('result is paginated - should return new records filtered by resource roles', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['Folder', new Set(['obj_id_1'])]])
        );
        const directiveArgs = {
          roles: [
            {
              resourceType: 'Folder',
              resourceIdFieldPath: 'objectId',
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        };
        const result = {
          records: [
            { objectId: 'obj_id_1' },
            { objectId: 'obj_id_2' },
            { objectId: 'obj_id_3' }
          ],
          count: 1
        };
        const filteredResult = await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(filteredResult.records).toBeDefined();
        expect(filteredResult.records.length).toEqual(1);
        expect(filteredResult.count).toEqual(1);
      });
      it('result is object - should return empty object when resource roles are not matched', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(new Map());
        const directiveArgs = {
          roles: [
            {
              resourceType: 'Folder',
              resourceIdFieldPath: 'objectId',
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        };
        const result = { objectId: 'obj_id_1' };
        await expect(async () =>
          dir.verifyAuthRoleAccess.resolver(
            { name: 'tdo' },
            directiveArgs,
            {},
            context,
            {
              parentType: 'Test',
              fieldName: 'test'
            },
            result
          )
        ).rejects.toThrow('No authorization access role found for tdo');

        // The denial must be audited before the throw.
        expect(rbacAuthBll.emitAuthFailure).toHaveBeenCalledTimes(1);
        const deniedResources = rbacAuthBll.emitAuthFailure.mock.calls[0][1];
        expect(deniedResources.get('Folder').ids.has('obj_id_1')).toBe(true);
      });
      it('result is object - should return this result matched resource roles', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['Folder', new Set(['obj_id_1'])]])
        );
        const directiveArgs = {
          roles: [
            {
              resourceType: 'Folder',
              resourceIdFieldPath: 'objectId',
              permissions: ['AIWARE_FOLDER_READ']
            }
          ]
        };
        const result = { objectId: 'obj_id_1' };
        const filteredResult = await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
        expect(filteredResult).toEqual(expect.objectContaining(result));
      });
      it('should handle parentPath and parentType correctly', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([
            ['SDO', new Set(['sdo_id_1'])],
            ['SDOSchema', new Set(['schema_id_1'])]
          ])
        );
        const directiveArgs = {
          roles: [
            {
              resourceType: 'SDO',
              resourceIdFieldPath: 'objectId',
              parentType: 'SDOSchema',
              parentPath: 'schemaId',
              permissions: ['AIWARE_SDO_READ']
            }
          ]
        };
        const result = { objectId: 'sdo_id_1', schemaId: 'schema_id_1' };

        await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Map),
          false
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('SDO')).toBe(true);
        expect([...resourcesMap.get('SDO').ids]).toEqual(['sdo_id_1']);
        expect(resourcesMap.has('SDOSchema')).toBe(true);
        expect([...resourcesMap.get('SDOSchema').ids]).toEqual(['schema_id_1']);
      });

      it("should handle parentPath and parentType - fallback to parent access correctly", async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([["SDOSchema", new Set(["schema_id_1"])]])
        );
        const directiveArgs = {
          roles: [
            {
              resourceType: "SDO",
              resourceIdFieldPath: "objectId",
              parentType: "SDOSchema",
              parentPath: "schemaId",
              permissions: ["AIWARE_SDO_READ"],
            },
          ],
        };
        const result = { objectId: "sdo_id_1", schemaId: "schema_id_1" };

        const filteredResult = await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: "Test",
            fieldName: "test",
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Map),
          false
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has("SDO")).toBe(true);
        expect([...resourcesMap.get("SDO").ids]).toEqual(["sdo_id_1"]);
        expect(resourcesMap.has("SDOSchema")).toBe(true);
        expect([...resourcesMap.get("SDOSchema").ids]).toEqual(["schema_id_1"]);

        expect(filteredResult).toEqual(result);
      });

      it('should handle parentPath without parentType (same as resourceType)', async function () {
        rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(
          new Map([['SDO', new Set(['sdo_id_1', 'schema_id_1'])]])
        );

        const directiveArgs = {
          roles: [
            {
              resourceType: 'SDO',
              resourceIdFieldPath: 'objectId',
              parentPath: 'schemaId',
              permissions: ['AIWARE_SDO_READ']
            }
          ]
        };
        const result = { objectId: 'sdo_id_1', schemaId: 'schema_id_1' };

        await dir.verifyAuthRoleAccess.resolver(
          {},
          directiveArgs,
          {},
          context,
          {
            parentType: 'Test',
            fieldName: 'test'
          },
          result
        );

        expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Map),
          false
        );

        const resourcesMap = rbacAuthBll.hasResourceAuthRole.mock.calls[0][1];
        expect(resourcesMap.has('SDO')).toBe(true);
        expect([...resourcesMap.get('SDO').ids]).toEqual([
          'sdo_id_1',
          'schema_id_1'
        ]);
        expect(resourcesMap.has('SDOSchema')).not.toBe(true);
      });

      describe('should fallback to the org-level permissions check', function () {
        it('should error if no permissions when errors are encountered during an orgRole lookup - mismatch Org ACLs or context AGs', async () => {
          rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(new Map([]));
          rbacAuthBll.hasOrganizationAuthRole.mockRejectedValue(
            new errors.NotFound({ message: 'Missing error' })
          );
          const directiveArgs = {
            orgRole: ['AIWARE_FOLDER_READ'],
            throwErr: true
          };
          const result = [
            { objectId: 'obj_id_1' },
            { objectId: 'obj_id_2' },
            { objectId: 'obj_id_3' }
          ];

          const info = {
            parentType: 'Test',
            fieldName: 'test'
          };

          const mockContext = {
            requestContext: {
              userInfo: {
                permissionMasks: [],
                organization: {
                  kvp: {
                    features: {
                      enableRBACFeature: 'enabled'
                    }
                  }
                }
              }
            }
          };
          try {
            await dir.verifyAuthRoleAccess.resolver(
              {},
              directiveArgs,
              {},
              mockContext,
              info,
              result
            );
            throw new Error('no throw');
          } catch (err) {
            expect(err.name).toEqual('not_allowed');
          }

          expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
          expect(rbacAuthBll.hasOrganizationAuthRole).toHaveBeenCalled();
        });
        it('should allow with permissions and return this result', async () => {
          rbacAuthBll.hasResourceAuthRole.mockResolvedValueOnce(new Map([]));
          rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(true);
          const directiveArgs = {
            orgRole: ['AIWARE_FOLDER_READ'],
            throwErr: true
          };
          const info = {
            parentType: 'Test',
            fieldName: 'test',
            operation: {
              name: {
                value: 'rootName'
              }
            },
            schema: {
              getQueryType: () => ({
                getFields: () => ({
                  rootName: { directives: [] }
                })
              }),
              astNode: {}
            }
          };
          const result = [
            { objectId: 'obj_id_1' },
            { objectId: 'obj_id_2' },
            { objectId: 'obj_id_3' }
          ];
          const filteredResult = await dir.verifyAuthRoleAccess.resolver(
            {},
            directiveArgs,
            {},
            context,
            info,
            result
          );
          expect(rbacAuthBll.hasResourceAuthRole).toHaveBeenCalled();
          expect(rbacAuthBll.hasOrganizationAuthRole).toHaveBeenCalled();
          expect(filteredResult.length).toEqual(result.length);
        });
      });

      it.each([
        [{ resourceType: 'SDO' }],
        [{ resourceType: 'SDOSchema' }],
        [{ parentType: 'SDOSchema' }]
      ])(
        'should allow when RBAC is disabled for resource type %p',
        async function (roleDefinition) {
          const disabledForSDOContext = createRBACContext(true, false);
          rbacAuthBll.useRBACFeatureForResourceType.mockImplementation((ctx, orgObj, resourceType) => {
            expect(['SDO', 'SDOSchema']).toContain(resourceType);
            return Promise.resolve(false);
          });
          const directiveArgs = {
            roles: [roleDefinition]
          };
          const result = { objectId: 'sdo_id_1', schemaId: 'schema_id_1' };

          const filteredResult = await dir.verifyAuthRoleAccess.resolver(
            {},
            directiveArgs,
            {},
            disabledForSDOContext,
            {
              parentType: 'Test',
              fieldName: 'test'
            },
            result
          );
          expect(filteredResult).toEqual(result);

          expect(rbacAuthBll.hasResourceAuthRole).not.toHaveBeenCalled();
          expect(rbacAuthBll.hasOrganizationAuthRole).not.toHaveBeenCalled();
        }
      );
    });
  });

  describe('@authInherit', function () {
    describe('#name', function () {
      it('should return name', function () {
        expect(dir.authInherit.name).toEqual('authInherit');
        expect(dir.authInherit.before).toEqual(false);
      });
    });
    describe('#resolver', function () {
      let context;
      beforeEach(() => {
        serviceContext._clearAll();
        rbacAuthBll.inheritResourceACEs.mockClear();
        context = createEnabledRBACContext();
      });
      it('should allow when RBAC feature flag is disabled', async function () {
        await testRBACFeatureDisabled(dir.authInherit.resolver, false);
      });
      it('should rethrow error from a query', async function () {
        try {
          await dir.authInherit.resolver(
            {},
            {},
            {},
            context,
            {
              parentType: 'Test',
              fieldName: 'test'
            },
            [],
            new Error('error from a query')
          );
        } catch (err) {
          expect(err.message).toEqual('error from a query');
        }
      });
      it('should ignore propagation if source or target are not present', async function () {
        const directiveArgs = {
          source: {
            resourceType: 'Folder',
            resourceIdFieldPath: 'folderId'
          },
          target: [
            {
              resourceType: 'TDO',
              resourceIdFieldPath: 'result.tdoId'
            }
          ]
        };
        await dir.authInherit.resolver(
          {},
          directiveArgs,
          {},
          context,
          {},
          { objectId: 'obj_id_1' }
        );
        expect(rbacAuthBll.inheritResourceACEs).not.toHaveBeenCalled();
        await dir.authInherit.resolver(
          {},
          directiveArgs,
          {
            folderId: '123'
          },
          context,
          {},
          { objectId: 'obj_id_1' }
        );
        expect(rbacAuthBll.inheritResourceACEs).not.toHaveBeenCalled();
        await dir.authInherit.resolver(
          {},
          directiveArgs,
          {},
          context,
          {},
          { tdoId: '123' }
        );
        expect(rbacAuthBll.inheritResourceACEs).not.toHaveBeenCalled();
      });
      it('should call inheritResourceACEs', async function () {
        const directiveArgs = {
          source: {
            resourceType: 'Folder',
            resourceIdFieldPath: 'folderId'
          },
          target: [
            {
              resourceType: 'TDO',
              resourceIdFieldPath: 'result.tdoId'
            }
          ]
        };
        await dir.authInherit.resolver(
          {},
          directiveArgs,
          { folderId: 'f1' },
          context,
          {},
          { tdoId: 't1' }
        );
        expect(rbacAuthBll.inheritResourceACEs).toHaveBeenCalledWith(
          expect.any(Object),
          {
            source: {
              id: 'f1',
              type: 'Folder'
            },
            targets: [
              {
                id: 't1',
                type: 'TDO'
              }
            ]
          }
        );
      });
      it("should ignore propagation if the operation's selection has the addACEs field", async function () {
        const directiveArgs = {
          source: {
            resourceType: 'Folder',
            resourceIdFieldPath: 'folderId'
          },
          target: [
            {
              resourceType: 'TDO',
              resourceIdFieldPath: 'result.tdoId'
            }
          ]
        };
        const schemaInfo = {
          operation: {
            operation: 'mutation',
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  selectionSet: {
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'addACEs' }
                      }
                    ]
                  }
                }
              ]
            }
          }
        };
        await dir.authInherit.resolver(
          {},
          directiveArgs,
          {},
          context,
          schemaInfo,
          { objectId: 'obj_id_1' }
        );
        expect(rbacAuthBll.inheritResourceACEs).not.toHaveBeenCalled();
      });
    });
  });

  describe('@authListFilter', function () {
    describe('#name', function () {
      it('should return name', async function () {
        expect(dir.authListFilter.name).toEqual('authListFilter');
        expect(dir.authListFilter.before).toEqual(true);
      });
    });
    describe('#resolver', function () {
      let context;
      beforeEach(() => {
        serviceContext._clearAll();
        context = createEnabledRBACContext();
      });

      it('should allow when RBAC feature flag is disabled', async function () {
        await testRBACFeatureDisabled(dir.authListFilter.resolver, {}, {});
        expect(rbacAuthBll.buildAuthFilter).not.toHaveBeenCalled();
      });

      it('should not build auth filter when user has org-wide access', async function () {
        rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(true);
        const directiveArgs = {
          roles: ['AIWARE_SDO_READ'],
          orgRole: ['AIWARE_SDO_READ']
        };

        await dir.authListFilter.resolver(directiveArgs, {}, context, {
          parentType: 'Test',
          fieldName: 'test'
        });

        expect(
          rbacAuthBll.hasOrganizationAuthRole
        ).toHaveBeenCalledWith(context, ['AIWARE_SDO_READ']);
        expect(rbacAuthBll.buildAuthFilter).not.toHaveBeenCalled();
        expect(context._rbacAuthFilter).toBeUndefined();
      });

      it('should build auth filter when user does not have org-wide access', async function () {
        rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(false);
        rbacAuthBll.buildAuthFilter.mockResolvedValueOnce({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
        const directiveArgs = {
          roles: ['AIWARE_SDO_READ'],
          orgRole: ['AIWARE_SDO_READ']
        };

        await dir.authListFilter.resolver(directiveArgs, {}, context, {
          parentType: 'Test',
          fieldName: 'test'
        });

        expect(
          rbacAuthBll.hasOrganizationAuthRole
        ).toHaveBeenCalledWith(context, ['AIWARE_SDO_READ']);
        expect(rbacAuthBll.buildAuthFilter).toHaveBeenCalledWith(
          context,
          directiveArgs
        );
        expect(context._rbacAuthFilter).toEqual({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
      });

      it('should build auth filter when no orgRole is specified', async function () {
        rbacAuthBll.buildAuthFilter.mockResolvedValueOnce({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
        const directiveArgs = {
          roles: ['AIWARE_SDO_READ'],
        };

        await dir.authListFilter.resolver(directiveArgs, {}, context, {
          parentType: 'Test',
          fieldName: 'test'
        });

        expect(rbacAuthBll.hasOrganizationAuthRole).not.toHaveBeenCalled();
        expect(rbacAuthBll.buildAuthFilter).toHaveBeenCalledWith(
          context,
          directiveArgs
        );
        expect(context._rbacAuthFilter).toEqual({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
      });

      it('should handle multiple resource types', async function () {
        rbacAuthBll.hasOrganizationAuthRole.mockResolvedValueOnce(false);
        rbacAuthBll.buildAuthFilter.mockResolvedValueOnce({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
        const directiveArgs = {
          roles: ['AIWARE_SDO_READ'],
          orgRole: ['AIWARE_SDO_READ', 'AIWARE_SDO_WRITE']
        };

        await dir.authListFilter.resolver(directiveArgs, {}, context, {
          parentType: 'Test',
          fieldName: 'test'
        });

        expect(
          rbacAuthBll.hasOrganizationAuthRole
        ).toHaveBeenCalledWith(context, [
          'AIWARE_SDO_READ',
          'AIWARE_SDO_WRITE'
        ]);
        expect(rbacAuthBll.buildAuthFilter).toHaveBeenCalledWith(
          context,
          directiveArgs
        );
        expect(context._rbacAuthFilter).toEqual({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
      });

      it('should handle empty orgRole array', async function () {
        rbacAuthBll.buildAuthFilter.mockResolvedValueOnce({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
        const directiveArgs = {
          roles: ['AIWARE_SDO_READ'],
          orgRole: []
        };

        await dir.authListFilter.resolver(directiveArgs, {}, context, {
          parentType: 'Test',
          fieldName: 'test'
        });

        expect(rbacAuthBll.hasOrganizationAuthRole).not.toHaveBeenCalled();
        expect(rbacAuthBll.buildAuthFilter).toHaveBeenCalledWith(
          context,
          directiveArgs
        );
        expect(context._rbacAuthFilter).toEqual({
          args: ['arg_1', 'arg_2'],
          where: 'where_clause',
          join: 'sql_join'
        });
      });

      it.each([
        [{ resourceType: 'SDO' }],
        [{ resourceType: 'SDOSchema' }],
        [{ parentType: 'SDOSchema' }]
      ])(
        'should allow when RBAC is disabled for resource type %p',
        async function (directiveArgs) {
          const disabledForSDOContext = createRBACContext(true, false);
          rbacAuthBll.useRBACFeatureForResourceType.mockImplementation((ctx, orgObj, resourceType) => {
            expect(['SDO', 'SDOSchema']).toContain(resourceType);
            return Promise.resolve(false);
          });
          await dir.authListFilter.resolver(directiveArgs, {}, disabledForSDOContext, {
            parentType: 'Test',
            fieldName: 'test'
          });
          expect(rbacAuthBll.buildAuthFilter).not.toHaveBeenCalled();
          expect(disabledForSDOContext._rbacAuthFilter).toBeUndefined();
        }
      );
    });
  });
});
