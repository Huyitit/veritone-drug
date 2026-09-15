const createAuditHelpers = require('./auditHelpers.js');

jest.mock('@veritone/core-server-base/events-map.js', () => ({
  eventsMap: {
    AuthGroupCreate: {
      event: 'auth_group_create',
      type: 'olp',
      targetType: 21
    },
    AuthGroupUpdate: {
      event: 'auth_group_update',
      type: 'olp',
      targetType: 21
    },
    AuthGroupDelete: {
      event: 'auth_group_delete',
      type: 'olp',
      targetType: 21
    },
    AuthGroupMemberAdd: {
      event: 'auth_group_member_add',
      type: 'olp',
      targetType: 21
    },
    AuthGroupMemberRemove: {
      event: 'auth_group_member_remove',
      type: 'olp',
      targetType: 21
    },
    AuthPermissionSetCreate: {
      event: 'auth_permission_set_create',
      type: 'olp',
      targetType: 22
    },
    AuthPermissionSetUpdate: {
      event: 'auth_permission_set_update',
      type: 'olp',
      targetType: 22
    },
    AuthPermissionSetDelete: {
      event: 'auth_permission_set_delete',
      type: 'olp',
      targetType: 22
    },
    ACEGrant: {
      event: 'ace_grant',
      action: 'create',
      type: 'olp',
      targetType: 23
    },
    ACERevoke: {
      event: 'ace_revoke',
      action: 'delete',
      type: 'olp',
      targetType: 23
    },
    DefaultACEPolicyUpdate: {
      event: 'default_ace_policy_update',
      action: 'update',
      type: 'olp',
      targetType: 23
    },
    ACEQuery: {
      event: 'ace_query',
      action: 'read',
      type: 'olp',
      targetType: 23
    },
    AuthorizationDenied: {
      event: 'authorization_denied',
      action: 'read',
      type: 'olp',
      targetType: 23
    }
  },
  supportedEvents: {
    AuthGroupCreate: 'AuthGroupCreate',
    AuthGroupUpdate: 'AuthGroupUpdate',
    AuthGroupDelete: 'AuthGroupDelete',
    AuthGroupMemberAdd: 'AuthGroupMemberAdd',
    AuthGroupMemberRemove: 'AuthGroupMemberRemove',
    AuthPermissionSetCreate: 'AuthPermissionSetCreate',
    AuthPermissionSetUpdate: 'AuthPermissionSetUpdate',
    AuthPermissionSetDelete: 'AuthPermissionSetDelete',
    ACEGrant: 'ACEGrant',
    ACERevoke: 'ACERevoke',
    DefaultACEPolicyUpdate: 'DefaultACEPolicyUpdate',
    ACEQuery: 'ACEQuery',
    AuthorizationDenied: 'AuthorizationDenied'
  }
}));

describe('auditHelpers', () => {
  let serviceContext;
  let helpers;
  let context;

  beforeEach(() => {
    context = {
      _authInfo: {
        userId: 'requestor-user-id',
        applicationId: 'org-guid'
      }
    };

    serviceContext = {
      logger: {
        error: jest.fn()
      },
      messageUtil: {
        buildActionInfo: jest.fn(
          (targetId, error, action, ignored, actionDetails, targetType) => ({
            targetId,
            error,
            actionName: action,
            actionDetails,
            targetType
          })
        ),
        emitPublicEvent: jest.fn()
      }
    };

    helpers = createAuditHelpers(serviceContext);
  });

  describe('AuthGroup helper functions', () => {
    it('should normalize audit users', () => {
      expect(
        helpers.normalizeAuditUser({
          id: 'user-id-1',
          memberType: 'User',
          firstName: 'Test',
          lastName: 'User',
          scimConnectId: 'scim-connect-id'
        })
      ).toEqual({
        memberId: 'user-id-1',
        memberType: 'User',
        firstName: 'Test',
        lastName: 'User',
        userId: 'user-id-1',
        connectId: 'scim-connect-id'
      });
    });

    it('should build private user AuthGroup create action details', () => {
      const payload = {
        id: 'auth-group-id-1',
        audit: {
          isPrivateUserAuthGroup: true,
          users: [
            {
              memberId: 'user-id-1',
              memberType: 'user',
              userId: 'user-id-1',
              firstName: 'Test',
              lastName: 'User'
            }
          ]
        }
      };

      expect(
        helpers.buildAuthGroupActionDetails(payload, null, 'create')
      ).toEqual(
        'Automatically created private user AuthGroup auth-group-id-1 for Test User'
      );

      expect(
        helpers.buildAuthGroupActionDetails(
          payload,
          new Error('create failed'),
          'create'
        )
      ).toEqual(
        'Failed to automatically create private user AuthGroup for Test User'
      );
    });

    it('should build AuthGroup member add action details with users', () => {
      const payload = {
        id: 'auth-group-id-1',
        audit: {
          users: [
            {
              memberId: 'user-id-1',
              memberType: 'user',
              userId: 'user-id-1',
              firstName: 'Test',
              lastName: 'User'
            }
          ]
        }
      };

      expect(
        helpers.buildAuthGroupActionDetails(payload, null, 'addMember')
      ).toEqual('Added to AuthGroup auth-group-id-1 the users: Test User');

      expect(
        helpers.buildAuthGroupActionDetails(
          payload,
          new Error('add failed'),
          'addMember'
        )
      ).toEqual(
        'Failed to add to AuthGroup auth-group-id-1 the users: Test User'
      );
    });

    it('should build AuthGroup update, delete, removeMember, and unknown-action details', () => {
      const payload = { id: 'auth-group-id-1' };

      expect(
        helpers.buildAuthGroupActionDetails(payload, null, 'update')
      ).toEqual('Updated AuthGroup auth-group-id-1');
      expect(
        helpers.buildAuthGroupActionDetails(payload, new Error('x'), 'update')
      ).toEqual('Failed to update AuthGroup auth-group-id-1');

      expect(
        helpers.buildAuthGroupActionDetails(payload, null, 'delete')
      ).toEqual('Deleted AuthGroup auth-group-id-1');
      expect(
        helpers.buildAuthGroupActionDetails(payload, new Error('x'), 'delete')
      ).toEqual('Failed to delete AuthGroup auth-group-id-1');

      const removeMemberPayload = {
        id: 'auth-group-id-1',
        audit: {
          users: [
            {
              memberId: 'user-id-1',
              memberType: 'user',
              firstName: 'Test',
              lastName: 'User'
            }
          ]
        }
      };
      expect(
        helpers.buildAuthGroupActionDetails(
          removeMemberPayload,
          null,
          'removeMember'
        )
      ).toEqual('Removed from AuthGroup auth-group-id-1 the users: Test User');

      expect(
        helpers.buildAuthGroupActionDetails(payload, null, 'not-a-real-action')
      ).toEqual('');
    });

    it('should normalize audit users via jsondata/member fallback paths and omit userId for non-user members', () => {
      expect(
        helpers.normalizeAuditUser({
          userId: 'user-id-1',
          memberType: 'user',
          jsondata: { firstName: 'Jason', lastName: 'Data' },
          connectId: 'connect-id-1'
        })
      ).toEqual({
        memberId: 'user-id-1',
        memberType: 'User',
        firstName: 'Jason',
        lastName: 'Data',
        userId: 'user-id-1',
        connectId: 'connect-id-1'
      });

      expect(
        helpers.normalizeAuditUser({
          userId: 'user-id-2',
          member: { jsondata: { firstName: 'Member', lastName: 'Nested' } }
        })
      ).toEqual({
        memberId: 'user-id-2',
        memberType: 'User',
        firstName: 'Member',
        lastName: 'Nested',
        userId: 'user-id-2'
      });

      expect(
        helpers.normalizeAuditUser({
          id: 'group-id-1',
          memberType: 'group'
        })
      ).toEqual({
        memberId: 'group-id-1',
        memberType: 'Group'
      });
    });

    it('should compute audit user display names for empty, multi-user, and fallback-only inputs', () => {
      expect(helpers.getAuditUserDisplayNames({})).toEqual('unknown user');
      expect(
        helpers.getAuditUserDisplayNames({ audit: { users: [] } })
      ).toEqual('unknown user');

      expect(
        helpers.getAuditUserDisplayNames({
          audit: {
            users: [
              { userId: 'user-id-1', firstName: 'First', lastName: 'User' },
              { userId: 'user-id-2', firstName: 'Second', lastName: 'User' }
            ]
          }
        })
      ).toEqual('First User, Second User');

      expect(
        helpers.getAuditUserDisplayName({ memberId: 'member-id-1' })
      ).toEqual('member-id-1');

      expect(
        helpers.getAuditUserDisplayName({
          userId: 'user-id-3',
          connectId: 'connect-id-3'
        })
      ).toEqual('connect-id-3');
    });
  });

  describe('emitAuthGroupEvent', () => {
    it('should emit private user AuthGroup create audit event', () => {
      const payload = {
        id: 'auth-group-id-1',
        audit: {
          isPrivateUserAuthGroup: true,
          users: [
            {
              memberId: 'user-id-1',
              memberType: 'user',
              userId: 'user-id-1',
              firstName: 'Test',
              lastName: 'User'
            }
          ]
        }
      };

      helpers.emitAuthGroupEvent(context, payload, null, 'create');

      expect(serviceContext.messageUtil.buildActionInfo).toHaveBeenCalledWith(
        'auth-group-id-1',
        null,
        'create',
        null,
        'Automatically created private user AuthGroup auth-group-id-1 for Test User',
        21
      );

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthGroupCreate',
        'system',
        context,
        expect.objectContaining({
          serviceName: 'core-graphql-server',
          event: 'auth_group_create',
          type: 'olp',
          authGroupId: 'auth-group-id-1',
          isPrivateUserAuthGroup: true,
          success: true,
          user: expect.objectContaining({
            memberId: 'user-id-1',
            memberType: 'User',
            userId: 'user-id-1',
            firstName: 'Test',
            lastName: 'User'
          }),
          actionInfo: expect.objectContaining({
            targetId: 'auth-group-id-1',
            actionName: 'create',
            actionDetails:
              'Automatically created private user AuthGroup auth-group-id-1 for Test User',
            targetType: 21
          })
        })
      );
    });

    it('should emit failed AuthGroup member add audit event', () => {
      const error = new Error('member add failed');
      const payload = {
        id: 'auth-group-id-1',
        audit: {
          users: [
            {
              memberId: 'user-id-1',
              memberType: 'user',
              userId: 'user-id-1',
              firstName: 'Test',
              lastName: 'User'
            }
          ]
        }
      };

      helpers.emitAuthGroupEvent(context, payload, error, 'addMember');

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthGroupMemberAdd',
        'system',
        context,
        expect.objectContaining({
          event: 'auth_group_member_add',
          authGroupId: 'auth-group-id-1',
          success: false,
          users: [
            expect.objectContaining({
              memberId: 'user-id-1',
              memberType: 'User',
              userId: 'user-id-1',
              firstName: 'Test',
              lastName: 'User'
            })
          ],
          actionInfo: expect.objectContaining({
            actionDetails:
              'Failed to add to AuthGroup auth-group-id-1 the users: Test User'
          })
        })
      );
    });

    it('should log and skip invalid AuthGroup audit payload', () => {
      helpers.emitAuthGroupEvent(context, null, null, 'create');

      expect(serviceContext.logger.error).toHaveBeenCalledWith(
        'Invalid AuthGroup audit payload',
        {
          payload: null
        }
      );
      expect(serviceContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
    });

    it('should emit AuthGroup update, delete, and removeMember audit events', () => {
      const payload = { id: 'auth-group-id-1' };

      helpers.emitAuthGroupEvent(context, payload, null, 'update');
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthGroupUpdate',
        'system',
        context,
        expect.objectContaining({
          event: 'auth_group_update',
          authGroupId: 'auth-group-id-1',
          success: true,
          actionInfo: expect.objectContaining({
            actionDetails: 'Updated AuthGroup auth-group-id-1'
          })
        })
      );

      const deleteError = new Error('delete failed');
      helpers.emitAuthGroupEvent(context, payload, deleteError, 'delete');
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthGroupDelete',
        'system',
        context,
        expect.objectContaining({
          event: 'auth_group_delete',
          authGroupId: 'auth-group-id-1',
          success: false,
          actionInfo: expect.objectContaining({
            actionDetails: 'Failed to delete AuthGroup auth-group-id-1'
          })
        })
      );

      const removeMemberPayload = {
        id: 'auth-group-id-1',
        audit: {
          users: [
            {
              memberId: 'user-id-1',
              memberType: 'user',
              userId: 'user-id-1',
              firstName: 'Test',
              lastName: 'User'
            }
          ]
        }
      };
      helpers.emitAuthGroupEvent(
        context,
        removeMemberPayload,
        null,
        'removeMember'
      );
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthGroupMemberRemove',
        'system',
        context,
        expect.objectContaining({
          event: 'auth_group_member_remove',
          authGroupId: 'auth-group-id-1',
          success: true,
          users: [
            expect.objectContaining({
              memberId: 'user-id-1'
            })
          ],
          actionInfo: expect.objectContaining({
            actionDetails:
              'Removed from AuthGroup auth-group-id-1 the users: Test User'
          })
        })
      );
    });
  });

  describe('AuthPermissionSet helper functions', () => {
    it('should build permission set action details', () => {
      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          null,
          'update'
        )
      ).toEqual('Updated AuthPermissionSet permission-set-id-1');

      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          new Error('update failed'),
          'update'
        )
      ).toEqual('Failed to update AuthPermissionSet permission-set-id-1');
    });

    it('should build AuthPermissionSet create, delete, and unknown-action details', () => {
      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          null,
          'create'
        )
      ).toEqual('Created AuthPermissionSet permission-set-id-1');
      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          new Error('x'),
          'create'
        )
      ).toEqual('Failed to create AuthPermissionSet');

      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          null,
          'delete'
        )
      ).toEqual('Deleted AuthPermissionSet permission-set-id-1');
      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          new Error('x'),
          'delete'
        )
      ).toEqual('Failed to delete AuthPermissionSet permission-set-id-1');

      expect(
        helpers.buildPermissionSetActionDetails(
          { id: 'permission-set-id-1' },
          null,
          'not-a-real-action'
        )
      ).toEqual('');
    });
  });

  describe('emitAuthPermissionSetEvent', () => {
    it('should emit failed AuthPermissionSet delete audit event', () => {
      const error = new Error('delete failed');

      helpers.emitAuthPermissionSetEvent(
        context,
        { id: 'permission-set-id-1' },
        error,
        'delete'
      );

      expect(serviceContext.messageUtil.buildActionInfo).toHaveBeenCalledWith(
        'permission-set-id-1',
        error,
        'delete',
        null,
        'Failed to delete AuthPermissionSet permission-set-id-1',
        22
      );

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthPermissionSetDelete',
        'system',
        context,
        expect.objectContaining({
          serviceName: 'core-graphql-server',
          event: 'auth_permission_set_delete',
          type: 'olp',
          authPermissionSetId: 'permission-set-id-1',
          success: false,
          actionInfo: expect.objectContaining({
            targetId: 'permission-set-id-1',
            actionName: 'delete',
            actionDetails:
              'Failed to delete AuthPermissionSet permission-set-id-1',
            targetType: 22
          })
        })
      );
    });

    it('should emit AuthPermissionSet create and update audit events', () => {
      helpers.emitAuthPermissionSetEvent(
        context,
        { id: 'permission-set-id-1' },
        null,
        'create'
      );
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthPermissionSetCreate',
        'system',
        context,
        expect.objectContaining({
          event: 'auth_permission_set_create',
          authPermissionSetId: 'permission-set-id-1',
          success: true,
          actionInfo: expect.objectContaining({
            actionDetails: 'Created AuthPermissionSet permission-set-id-1'
          })
        })
      );

      const updateError = new Error('update failed');
      helpers.emitAuthPermissionSetEvent(
        context,
        { id: 'permission-set-id-1' },
        updateError,
        'update'
      );
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthPermissionSetUpdate',
        'system',
        context,
        expect.objectContaining({
          event: 'auth_permission_set_update',
          authPermissionSetId: 'permission-set-id-1',
          success: false,
          actionInfo: expect.objectContaining({
            actionDetails:
              'Failed to update AuthPermissionSet permission-set-id-1'
          })
        })
      );
    });
  });

  describe('unmapped-action no-op guard', () => {
    it('should no-op without throwing for an unrecognized AuthGroup action', () => {
      expect(() =>
        helpers.emitAuthGroupEvent(
          context,
          { id: 'auth-group-id-1' },
          null,
          'not-a-real-action'
        )
      ).not.toThrow();
      expect(serviceContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
    });

    it('should no-op without throwing for an unrecognized AuthPermissionSet action', () => {
      expect(() =>
        helpers.emitAuthPermissionSetEvent(
          context,
          { id: 'permission-set-id-1' },
          null,
          'not-a-real-action'
        )
      ).not.toThrow();
      expect(serviceContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
    });
  });

  describe('audit-emission failures are caught, not propagated', () => {
    it('should catch a synchronous throw from emitPublicEvent and log it (AuthGroup)', () => {
      const emitError = new Error('emit boom');
      serviceContext.messageUtil.emitPublicEvent.mockImplementationOnce(() => {
        throw emitError;
      });

      expect(() =>
        helpers.emitAuthGroupEvent(
          context,
          { id: 'auth-group-id-1' },
          null,
          'update'
        )
      ).not.toThrow();

      expect(serviceContext.logger.error).toHaveBeenCalledWith(
        'Failed to emit AuthGroup audit event',
        emitError
      );
    });

    it('should catch a rejected promise from emitPublicEvent and log it (AuthPermissionSet)', async () => {
      const emitError = new Error('emit rejected');
      serviceContext.messageUtil.emitPublicEvent.mockReturnValueOnce(
        Promise.reject(emitError)
      );

      helpers.emitAuthPermissionSetEvent(
        context,
        { id: 'permission-set-id-1' },
        null,
        'update'
      );

      await Promise.resolve();

      expect(serviceContext.logger.error).toHaveBeenCalledWith(
        'Failed to emit AuthPermissionSet audit event',
        emitError
      );
    });
  });

  describe('ACE helper functions', () => {
    const acePayload = {
      authPermissionSetId: 'ps-1',
      memberId: 'member-1',
      memberType: 'group',
      resourceType: 'TDO',
      resourceId: 'resource-1'
    };

    it('should build ACEGrant success action details (exact string)', () => {
      expect(helpers.buildACEGrantActionDetails(acePayload, null)).toBe(
        'Granted ps-1 to member-1 (Group) on TDO resource-1'
      );
    });

    it('should build ACEGrant failure action details (exact string)', () => {
      expect(
        helpers.buildACEGrantActionDetails(acePayload, new Error('boom'))
      ).toBe('Failed to grant ps-1 to member-1 (Group) on TDO resource-1');
    });

    it('should build ACERevoke success action details (exact string)', () => {
      expect(helpers.buildACERevokeActionDetails(acePayload, null)).toBe(
        'Revoked ps-1 from member-1 (Group) on TDO resource-1'
      );
    });

    it('should build ACERevoke failure action details (exact string)', () => {
      expect(
        helpers.buildACERevokeActionDetails(acePayload, new Error('boom'))
      ).toBe('Failed to revoke ps-1 from member-1 (Group) on TDO resource-1');
    });

    it('should route buildACEActionDetails by action and return empty for unknown', () => {
      expect(helpers.buildACEActionDetails(acePayload, null, 'grant')).toBe(
        'Granted ps-1 to member-1 (Group) on TDO resource-1'
      );
      expect(helpers.buildACEActionDetails(acePayload, null, 'revoke')).toBe(
        'Revoked ps-1 from member-1 (Group) on TDO resource-1'
      );
      expect(helpers.buildACEActionDetails(acePayload, null, 'nope')).toBe('');
    });

    it('should normalize ACE payload with member/permissionSet field fallbacks', () => {
      expect(
        helpers.normalizeACEPayload({
          permissionSetID: 'ps-2',
          member: { id: 'm-2', memberType: 'user' },
          resourceType: 'Folder',
          resourceId: 'r-2'
        })
      ).toEqual({
        authPermissionSetId: 'ps-2',
        memberId: 'm-2',
        memberType: 'User',
        resourceType: 'Folder',
        resourceId: 'r-2'
      });
    });
  });

  describe('emitACEGrantEvent', () => {
    it('should emit a successful ACEGrant audit event', () => {
      helpers.emitACEGrantEvent(context, {
        authPermissionSetId: 'ps-1',
        memberId: 'member-1',
        memberType: 'user',
        resourceType: 'TDO',
        resourceId: 'resource-1'
      });

      expect(serviceContext.messageUtil.buildActionInfo).toHaveBeenCalledWith(
        'resource-1',
        null,
        'create',
        null,
        'Granted ps-1 to member-1 (User) on TDO resource-1',
        23
      );

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACEGrant',
        'system',
        context,
        expect.objectContaining({
          serviceName: 'core-graphql-server',
          event: 'ace_grant',
          type: 'olp',
          authPermissionSetId: 'ps-1',
          member: { memberId: 'member-1', memberType: 'User' },
          resourceId: 'resource-1',
          resourceType: 'TDO',
          success: true,
          actionInfo: expect.objectContaining({
            targetId: 'resource-1',
            actionName: 'create',
            actionDetails: 'Granted ps-1 to member-1 (User) on TDO resource-1',
            targetType: 23
          })
        })
      );
    });

    it('should emit a failed ACEGrant audit event without throwing', () => {
      const error = new Error('grant failed');

      helpers.emitACEGrantEvent(
        context,
        {
          authPermissionSetId: 'ps-1',
          memberId: 'member-1',
          memberType: 'group',
          resourceType: 'TDO',
          resourceId: 'resource-1'
        },
        error
      );

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACEGrant',
        'system',
        context,
        expect.objectContaining({
          success: false,
          actionInfo: expect.objectContaining({
            actionDetails:
              'Failed to grant ps-1 to member-1 (Group) on TDO resource-1',
            error
          })
        })
      );
    });
  });

  describe('emitACERevokeEvent', () => {
    it('should emit a successful ACERevoke audit event', () => {
      helpers.emitACERevokeEvent(context, {
        authPermissionSetId: 'ps-1',
        memberId: 'member-1',
        memberType: 'group',
        resourceType: 'TDO',
        resourceId: 'resource-1'
      });

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACERevoke',
        'system',
        context,
        expect.objectContaining({
          event: 'ace_revoke',
          success: true,
          actionInfo: expect.objectContaining({
            actionName: 'delete',
            actionDetails: 'Revoked ps-1 from member-1 (Group) on TDO resource-1',
            targetType: 23
          })
        })
      );
    });

    it('should emit a failed ACERevoke audit event', () => {
      const error = new Error('revoke failed');

      helpers.emitACERevokeEvent(
        context,
        {
          authPermissionSetId: 'ps-1',
          memberId: 'member-1',
          memberType: 'group',
          resourceType: 'TDO',
          resourceId: 'resource-1'
        },
        error
      );

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACERevoke',
        'system',
        context,
        expect.objectContaining({
          success: false,
          actionInfo: expect.objectContaining({
            actionDetails:
              'Failed to revoke ps-1 from member-1 (Group) on TDO resource-1',
            error
          })
        })
      );
    });

    it('should log and skip invalid ACE audit payload', () => {
      helpers.emitACEGrantEvent(context, null);
      expect(serviceContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
  });

  describe('emitDefaultACEPolicyUpdateEvent', () => {
    it('should build success/failure action details (exact strings)', () => {
      const payload = {
        organizationId: 12345,
        organizationGuid: 'org-guid',
        organizationName: 'org-name',
        resourceType: 'SDO',
        resourceId: 'sdo-1'
      };
      expect(
        helpers.buildDefaultACEPolicyUpdateActionDetails(payload, null)
      ).toBe(
        'Updated default ACE policy on SDO sdo-1 for organization org-name (12345)'
      );
      expect(
        helpers.buildDefaultACEPolicyUpdateActionDetails(
          payload,
          new Error('boom')
        )
      ).toBe(
        'Failed to update default ACE policy on SDO sdo-1 for organization org-name (12345)'
      );
    });

    it('falls the name back to n/a for a nameless org without gating the event', () => {
      const payload = {
        organizationId: 12345,
        organizationGuid: 'org-guid',
        resourceType: 'SDO',
        resourceId: 'sdo-1'
      };
      // createOrganization permits empty-string names; the event must still fire
      // and read cleanly rather than dropping the name or the whole event.
      expect(
        helpers.buildDefaultACEPolicyUpdateActionDetails(payload, null)
      ).toBe(
        'Updated default ACE policy on SDO sdo-1 for organization n/a (12345)'
      );
    });

    it('falls both name and id back to n/a when neither resolves', () => {
      const payload = { resourceType: 'SDO', resourceId: 'sdo-1' };
      expect(
        helpers.buildDefaultACEPolicyUpdateActionDetails(payload, null)
      ).toBe(
        'Updated default ACE policy on SDO sdo-1 for organization n/a (n/a)'
      );
      // still emits a well-formed event (no gate on missing org info)
      helpers.emitDefaultACEPolicyUpdateEvent(context, payload);
      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'DefaultACEPolicyUpdate',
        'system',
        context,
        expect.objectContaining({
          actionInfo: expect.objectContaining({
            actionDetails:
              'Updated default ACE policy on SDO sdo-1 for organization n/a (n/a)'
          })
        })
      );
    });

    it('should emit a successful DefaultACEPolicyUpdate audit event', () => {
      helpers.emitDefaultACEPolicyUpdateEvent(context, {
        organizationId: 12345,
        organizationGuid: 'org-guid',
        organizationName: 'org-name',
        resourceType: 'SDO',
        resourceId: 'sdo-1'
      });

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'DefaultACEPolicyUpdate',
        'system',
        context,
        expect.objectContaining({
          event: 'default_ace_policy_update',
          type: 'olp',
          organizationId: '12345',
          organizationGuid: 'org-guid',
          organizationName: 'org-name',
          resourceType: 'SDO',
          resourceId: 'sdo-1',
          success: true,
          actionInfo: expect.objectContaining({
            actionName: 'update',
            actionDetails:
              'Updated default ACE policy on SDO sdo-1 for organization org-name (12345)',
            targetType: 23
          })
        })
      );
    });

    it('should emit a failed DefaultACEPolicyUpdate audit event', () => {
      const error = new Error('provisioning failed');
      helpers.emitDefaultACEPolicyUpdateEvent(
        context,
        {
          organizationId: 12345,
          organizationGuid: 'org-guid',
          organizationName: 'org-name',
          resourceType: 'SDO',
          resourceId: 'sdo-1'
        },
        error
      );

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'DefaultACEPolicyUpdate',
        'system',
        context,
        expect.objectContaining({
          success: false,
          actionInfo: expect.objectContaining({
            actionDetails:
              'Failed to update default ACE policy on SDO sdo-1 for organization org-name (12345)',
            error
          })
        })
      );
    });

    it('should log and skip invalid DefaultACEPolicyUpdate payload', () => {
      helpers.emitDefaultACEPolicyUpdateEvent(context, null);
      expect(serviceContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
  });

  describe('emitACEQueryEvent', () => {
    it('should build success/failure action details (exact strings)', () => {
      const base = {
        memberId: 'member-1',
        memberType: 'User',
        resourceType: 'TDO',
        resourceId: 'resource-1'
      };
      // The access decision lives on the structured event field, not the
      // human-readable detail — the string is identical for grant and deny.
      expect(
        helpers.buildACEQueryActionDetails(
          { ...base, accessGranted: true },
          null
        )
      ).toBe('Checked permissions for member-1 (User) on TDO resource-1');
      expect(
        helpers.buildACEQueryActionDetails(
          { ...base, accessGranted: false },
          null
        )
      ).toBe('Checked permissions for member-1 (User) on TDO resource-1');
      expect(
        helpers.buildACEQueryActionDetails(base, new Error('boom'))
      ).toBe(
        'Failed to check permissions for member-1 (User) on TDO resource-1'
      );
    });

    it('should list all resources when a batch is provided', () => {
      const base = {
        memberId: 'member-1',
        memberType: 'User',
        resources: [
          { resourceType: 'TDO', resourceId: 'r1' },
          { resourceType: 'TDO', resourceId: 'r2' },
          { resourceType: 'TDO', resourceId: 'r3' }
        ]
      };
      expect(helpers.buildACEQueryActionDetails(base, null)).toBe(
        'Checked permissions for member-1 (User) on TDO r1, TDO r2 and TDO r3'
      );
      expect(
        helpers.buildACEQueryActionDetails(base, new Error('boom'))
      ).toBe(
        'Failed to check permissions for member-1 (User) on TDO r1, TDO r2 and TDO r3'
      );
    });

    it('should emit a batched ACEQuery listing every id in actionDetails with a null structured resourceId', () => {
      helpers.emitACEQueryEvent(context, {
        member: { id: 'member-1', memberType: 'User' },
        resources: [
          { resourceType: 'TDO', resourceId: 'r1' },
          { resourceType: 'TDO', resourceId: 'r2' }
        ],
        accessGranted: true
      });

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACEQuery',
        'system',
        context,
        expect.objectContaining({
          event: 'ace_query',
          member: { memberId: 'member-1', memberType: 'User' },
          // single-valued envelope: a batch has no single structured resource
          resourceId: null,
          resourceType: null,
          accessGranted: true,
          actionInfo: expect.objectContaining({
            // no single structured target for a batch (runtime getActionInfo
            // maps this null to "N/A")
            targetId: null,
            // ...but every id is still reported in actionDetails
            actionDetails:
              'Checked permissions for member-1 (User) on TDO r1 and TDO r2'
          })
        })
      );
    });

    it('should emit an ACEQuery event carrying the access decision', () => {
      helpers.emitACEQueryEvent(context, {
        member: { id: 'member-1', memberType: 'User' },
        resourceType: 'TDO',
        resourceId: 'resource-1',
        accessGranted: true
      });

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACEQuery',
        'system',
        context,
        expect.objectContaining({
          event: 'ace_query',
          member: { memberId: 'member-1', memberType: 'User' },
          resourceId: 'resource-1',
          resourceType: 'TDO',
          accessGranted: true,
          success: true,
          actionInfo: expect.objectContaining({
            actionName: 'read',
            actionDetails:
              'Checked permissions for member-1 (User) on TDO resource-1',
            targetType: 23
          })
        })
      );
    });

    it('should default accessGranted to false when absent', () => {
      helpers.emitACEQueryEvent(context, {
        member: { id: 'member-1', memberType: 'User' },
        resourceType: 'TDO',
        resourceId: 'resource-1'
      });

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'ACEQuery',
        'system',
        context,
        expect.objectContaining({
          accessGranted: false,
          actionInfo: expect.objectContaining({
            actionDetails:
              'Checked permissions for member-1 (User) on TDO resource-1'
          })
        })
      );
    });
  });

  describe('emitAuthorizationDeniedEvent', () => {
    it('should build denial action details with and without a reason', () => {
      const base = {
        member: { id: 'member-1', memberType: 'User' },
        resourceType: 'TDO',
        resourceId: 'resource-1'
      };
      expect(
        helpers.buildAuthorizationDeniedActionDetails({
          ...base,
          reason: 'Access denied to one or more of the provided ids'
        })
      ).toBe(
        'Denied access for member-1 (User) on TDO resource-1 because Access denied to one or more of the provided ids'
      );
      // No failure variant: a denial is always recorded as-is (single template).
      expect(
        helpers.buildAuthorizationDeniedActionDetails(base)
      ).toBe('Denied access for member-1 (User) on TDO resource-1');
    });

    it('omits the object-target clause for org-role-only denials (no resource)', () => {
      // Denials on org-role-gated fields carry no object target; the ` on
      // <type> <id>` clause is dropped rather than rendering `on null null`.
      expect(
        helpers.buildAuthorizationDeniedActionDetails({
          member: { id: 'member-1', memberType: 'User' },
          reason: 'No authorization access role found'
        })
      ).toBe(
        'Denied access for member-1 (User) because No authorization access role found'
      );
      expect(
        helpers.buildAuthorizationDeniedActionDetails({
          member: { id: 'member-1', memberType: 'User' }
        })
      ).toBe('Denied access for member-1 (User)');
    });

    it('should emit an AuthorizationDenied event with the reason', () => {
      helpers.emitAuthorizationDeniedEvent(context, {
        member: { id: 'member-1', memberType: 'User' },
        resourceType: 'TDO',
        resourceId: 'resource-1',
        reason: 'Access denied to one or more of the provided ids'
      });

      expect(serviceContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        'AuthorizationDenied',
        'system',
        context,
        expect.objectContaining({
          event: 'authorization_denied',
          member: { memberId: 'member-1', memberType: 'User' },
          resourceId: 'resource-1',
          resourceType: 'TDO',
          reason: 'Access denied to one or more of the provided ids',
          success: true,
          actionInfo: expect.objectContaining({
            actionName: 'read',
            actionDetails:
              'Denied access for member-1 (User) on TDO resource-1 because Access denied to one or more of the provided ids',
            targetType: 23
          })
        })
      );
    });

    it('should log and skip invalid AuthorizationDenied payload', () => {
      helpers.emitAuthorizationDeniedEvent(context, null);
      expect(serviceContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
  });
});