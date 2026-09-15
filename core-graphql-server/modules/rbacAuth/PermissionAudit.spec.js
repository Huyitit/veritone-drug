'use strict';

const serviceContext = require('../../test/serviceContext.mock.js')();
serviceContext.bll = serviceContext.bll || {};
serviceContext.bll.rbacAuth = serviceContext.bll.rbacAuth || {};

const resolvers = require('./PermissionAudit.js')(serviceContext);

describe('rbacAuth PermissionAudit resolvers', () => {
  it('resource projects only resourceType and resourceId', () => {
    expect(resolvers.resource({ resourceType: 'folder', resourceId: 'f1', extra: 'x' })).toEqual({
      resourceType: 'folder',
      resourceId: 'f1'
    });
  });

  it('userId returns the audit userId', () => {
    expect(resolvers.userId({ userId: 'u1' })).toBe('u1');
  });

  it('effectivePermissions returns the list when present', () => {
    expect(resolvers.effectivePermissions({ effectivePermissions: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('effectivePermissions defaults to an empty array', () => {
    expect(resolvers.effectivePermissions({})).toEqual([]);
  });

  it('permissionDetails returns the list when present', () => {
    expect(resolvers.permissionDetails({ permissionDetails: [{ grant: 1 }] })).toEqual([{ grant: 1 }]);
  });

  it('permissionDetails defaults to an empty array', () => {
    expect(resolvers.permissionDetails({})).toEqual([]);
  });
});
