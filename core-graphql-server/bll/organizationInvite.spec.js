const _ = require('lodash');
const { eventsMap } = require('@veritone/core-server-base/events-map.js');

jest.mock('request-promise');
require('request-promise').mockImplementation((uri) =>
  Promise.resolve({
    user_id: '0000000-0000-1111-0000-00000000000',
    email: 'test',
    organization_id: '123e4567-e89b-12d3-a456-426655440000',
    password: 'test',
    user_name: 'name'
  })
);

const mockUtil = require('../test/mockUtil.js')();
const createMockServiceContext = require('../modules/v3DataModel/test/serviceContext.mock.js');
const createBll = require('./organizationInvite');
jest.mock('../dal/util.js');
const dalUtil = require('../dal/util.js');

const httpCallMock = jest.fn();
dalUtil.mockImplementation(() => {
  return {
    httpCall: httpCallMock,
    getUserFullName: jest.fn()
  };
});

const globalServiceContext = createMockServiceContext();
let context;
let bll = createBll(globalServiceContext);

beforeAll(function () {
  globalServiceContext.bll.notification = {
    post: jest.fn()
  };
  globalServiceContext.dal.notification = {
    sendEmailTemplate: jest.fn()
  };
  globalServiceContext.dal.organization = {
    getOrganization: jest.fn()
  };
  globalServiceContext.dal.application = {
    getApplication: jest.fn(),
    getAppIdFromOrgId: jest.fn()
  };
});

beforeEach(function () {
  context = mockUtil.makeContext();
  globalServiceContext._clearAll();
  jest.clearAllMocks();
});

afterAll(function () {
  jest.resetModules();
});

describe('bll organization invite tests', function () {
  describe('#updateOrganizationInvite - verify access controls', () => {
    let mockServiceContext;
    let bll;
    beforeAll(() => {
      mockServiceContext = createMockServiceContext();
      _.set(mockServiceContext, 'dal.organizationInvite', {
        updateOrganizationInvite: jest.fn(),
        getOrganizationInvites: jest.fn(),
        getApplicationAndRoleIds: jest.fn(),
        updateOrgInviteWithNewUserId: jest.fn(),
        validateOrganization: jest.fn(),
        validateApplicationRolesExist: jest.fn().mockResolvedValue()
      });
      _.set(mockServiceContext, 'dal.organization', {
        getOrganization: jest.fn()
      });
      _.set(mockServiceContext, 'dal.application', {
        getAppIdFromOrgId: jest.fn()
      });
      _.set(mockServiceContext, 'dal.admin', {
        getUserBasicInfo: jest.fn(),
        getOrganizationGuidsForUser: jest.fn(),
        addUserToOrganization: jest.fn()
      });
      _.set(mockServiceContext, 'bll.notification', {
        post: jest.fn()
      });
      bll = createBll(mockServiceContext);
      expect(Object.keys(bll).length).toEqual(6);
    });

    it.each(['submit', 'approve', 'reject'])(
      'require admin access for action %s',
      async (action) => {
        mockServiceContext._authInfo = {
          organization: {
            organizationId: 123,
            organizationName: 'test org'
          }
        };
        await expect(
          bll.updateOrganizationInvite(mockServiceContext, {
            input: {
              action: 'submit'
            }
          })
        ).rejects.toEqual(
          expect.objectContaining({
            name: 'not_allowed'
          })
        );
        expect(mockServiceContext.messageUtil._counter()).toEqual(1);
        const event = mockServiceContext.messageUtil._messages()[0];
        expect(event.actionInfo.actionDetails).toEqual(
          'Unsupported Event Emitted'
        );
        mockServiceContext.messageUtil._clearCounter();
      }
    );

    it.each([
      ['submitted', 'accept'],
      ['submitted', 'submit'],
      ['submitted', 'request'],
      ['approved', 'submit'],
      ['approved', 'reject'],
      ['approved', 'request'],
      ['completed', 'submit'],
      ['completed', 'approve'],
      ['completed', 'accept'],
      ['completed', 'reject'],
      ['rejected', 'approve'],
      ['rejected', 'reject'],
      ['rejected', 'approve'],
      ['rejected', 'reject'],
      ['rejected', 'accept'],
      ['expired', 'approve'],
      ['expired', 'reject'],
      ['expired', 'submit'],
      ['expired', 'request'],
      ['expired', 'accept']
    ])('invalid status %s for action %s', async (status, action) => {
      mockServiceContext.dal.organizationInvite.getApplicationAndRoleIds.mockResolvedValue(
        []
      );
      mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue(
        [
          {
            status
          }
        ]
      );
      await expect(
        bll.updateOrganizationInvite(context, {
          input: {
            action,
            organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d',
            email: 'test@abc.com'
          }
        })
      ).rejects.toEqual(
        expect.objectContaining({
          name: 'invalid_input'
        })
      );
      expect(mockServiceContext.messageUtil._counter()).toEqual(1);
      const event = mockServiceContext.messageUtil._messages()[0];
      if (['approve', 'reject'].includes(action)) {
        mockServiceContext.messageUtil._clearCounter();
        if (action === 'approve') {
          expect(event.actionInfo.actionDetails).toEqual(
            `Failed to accept an organization request from test@abc.com`
          );
        } else {
          expect(event.actionInfo.actionDetails).toEqual(
            `Failed to reject an organization request from test@abc.com`
          );
        }
      } else {
        mockServiceContext.messageUtil._clearCounter();
        expect(event.actionInfo.actionDetails).toEqual(
          `Unsupported Event Emitted`
        );
      }
    });

    it.each([
      ['submitted', 'approve', null],
      ['submitted', 'reject', null],
      ['approved', 'complete', null]
    ])(
      'valid status %s for action %s',
      async (status, action, expectedException) => {
        httpCallMock.mockResolvedValueOnce({
          isValid: true,
          seatLimit: 100
        });

        mockServiceContext.dal.organizationInvite.getApplicationAndRoleIds.mockResolvedValue(
          [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ]
        );
        mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue(
          [
            {
              status,
              userId: context._authInfo.userId,
              expirationDate: 1657739341
            }
          ]
        );
        mockServiceContext.dal.admin.getUserBasicInfo.mockResolvedValue([
          {
            id: '0000000-0000-1111-0000-00000000000',
            firstName: 'First',
            lastName: 'Last'
          }
        ]);
        if (action === 'approve') {
          mockServiceContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
            [
              {
                organizationGuid: '0000000-guid-0000-0000-00000000000'
              }
            ]
          );
        }
        if (action === 'complete') {
          mockServiceContext.dal.organizationInvite.updateOrgInviteWithNewUserId.mockResolvedValue(
            [
              {
                organizationInviteId: '0000000-0000-0000-0000-00000000000',
                userId: '0000000-0000-1111-0000-00000000000',
                organizationId: '1000',
                status: 'approved',
                email: 'test@abc.com',
                message: 'Invite a new user',
                expirationDate: '',
                createBy: '0000000-0000-1111-0000-00000000000'
              }
            ]
          );
          mockServiceContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue(
            ['1000']
          );
        }
        mockServiceContext.dal.organizationInvite.updateOrganizationInvite.mockImplementation(
          (_ctx, input) => {
            return Promise.resolve({
              organizationInviteId: '0000000-0000-0000-0000-00000000000',
              userId: '0000000-0000-1111-0000-00000000000',
              organizationId: '1000',
              status: 'approved',
              email: 'test@abc.com',
              message: 'Invite a new user',
              expirationDate: '',
              createBy: '0000000-0000-1111-0000-00000000000'
            });
          }
        );
        // serviceContext.bll.notification.post
        mockServiceContext.dal.organization.getOrganization.mockImplementation(
          (ctx, options) => {
            return Promise.resolve({
              userId: '0000000-0000-1111-0000-00000000000',
              organizationName: 'Test Org'
            });
          }
        );
        mockServiceContext.bll.notification.post.mockImplementation(
          (_ctx, options) => Promise.resolve(options)
        );
        if (expectedException) {
          await expect(
            bll.updateOrganizationInvite(context, {
              input: {
                action,
                organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d'
              }
            })
          ).rejects.toEqual(
            expect.objectContaining({
              name: expectedException
            })
          );
        } else {
          await bll.updateOrganizationInvite(context, {
            input: {
              action,
              organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d'
            }
          });
        }
      }
    );

    it.each(['approved', 'rejected', 'completed', 'expired'])(
      'should ignore updates to message and appRoles when status=%s',
      async (status) => {
        mockServiceContext.dal.organizationInvite.getApplicationAndRoleIds.mockResolvedValue(
          [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ]
        );
        mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue(
          [
            {
              status,
              message: 'old_message',
              userId: context._authInfo.userId
            }
          ]
        );

        mockServiceContext.dal.organizationInvite.updateOrganizationInvite.mockImplementation(
          (_ctx, input) => Promise.resolve(input)
        );

        mockServiceContext.dal.organization.getOrganization.mockImplementation(
          (ctx, options) => {
            return Promise.resolve({
              organizationName: 'Test Org',
              organizationGuid: '123'
            });
          }
        );

        const params = await bll.updateOrganizationInvite(context, {
          input: {
            organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d',
            message: 'new_message',
            applicationRoles: [
              {
                applicationId: '123',
                roleId: '345'
              }
            ]
          }
        });
        expect(params.input).toEqual(
          expect.objectContaining({
            applicationRoles: [
              {
                applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
                roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
              }
            ],
            organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d',
            message: 'old_message'
          })
        );
      }
    );

    it.each(['submitted', 'requested'])(
      'should allow updates to message and appRoles when status=%s',
      async (status) => {
        mockServiceContext.dal.organizationInvite.getApplicationAndRoleIds.mockResolvedValue(
          [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ]
        );
        mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue(
          [
            {
              status,
              message: 'old_message',
              userId: context._authInfo.userId
            }
          ]
        );

        mockServiceContext.dal.organizationInvite.updateOrganizationInvite.mockImplementation(
          (_ctx, input) => Promise.resolve(input)
        );

        mockServiceContext.dal.organization.getOrganization.mockImplementation(
          (ctx, options) => {
            return Promise.resolve({
              organizationName: 'Test Org',
              organizationGuid: '123'
            });
          }
        );

        const params = await bll.updateOrganizationInvite(context, {
          input: {
            organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d',
            message: 'new_message',
            applicationRoles: [
              {
                applicationId: 'f3181c5e-ec5c-4b9a-ac56-452103ee07cf',
                roleId: 'f3181c5e-ec5c-4b9a-ac56-452103ee07cf'
              }
            ]
          }
        });
        expect(params.input).toEqual(
          expect.objectContaining({
            applicationRoles: [
              {
                applicationId: 'f3181c5e-ec5c-4b9a-ac56-452103ee07cf',
                roleId: 'f3181c5e-ec5c-4b9a-ac56-452103ee07cf'
              }
            ],
            organizationInviteId: 'b7e9e869-726f-4b33-9456-cd3c2153875d',
            message: 'new_message'
          })
        );
      }
    );
  });

  describe('#updateOrganizationInvite — self-service provisioning password', () => {
    let mockServiceContext;
    let bll;
    /** Well-formed bcrypt (60 chars); value is not used cryptographically in tests. */
    const validBcryptHash =
      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const organizationInviteId = 'b7e9e869-726f-4b33-9456-cd3c2153875d';

    beforeAll(() => {
      mockServiceContext = createMockServiceContext();
      _.set(mockServiceContext, 'dal.organizationInvite', {
        updateOrganizationInvite: jest.fn(),
        getOrganizationInvites: jest.fn(),
        getApplicationAndRoleIds: jest.fn(),
        updateOrgInviteWithNewUserId: jest.fn().mockResolvedValue([]),
        validateOrganization: jest.fn(),
        validateApplicationRolesExist: jest.fn().mockResolvedValue()
      });
      _.set(mockServiceContext, 'dal.organization', {
        getOrganization: jest.fn().mockResolvedValue({
          userId: '0000000-0000-1111-0000-00000000000',
          organizationName: 'Test Org'
        })
      });
      _.set(mockServiceContext, 'dal.application', {
        getAppIdFromOrgId: jest.fn().mockResolvedValue([
          { organizationGuid: '0000000-guid-0000-0000-00000000000' }
        ])
      });
      _.set(mockServiceContext, 'dal.admin', {
        getUserBasicInfo: jest.fn().mockResolvedValue([
          { id: '0000000-0000-1111-0000-00000000000', firstName: 'First', lastName: 'Last' }
        ]),
        getOrganizationGuidsForUser: jest.fn().mockResolvedValue(['1000']),
        addUserToOrganization: jest.fn(),
        createUser: jest.fn().mockResolvedValue({
          userId: 'provisioned-user-id-1111-2222-3333-444444444444'
        })
      });
      _.set(mockServiceContext, 'bll.notification', {
        post: jest.fn().mockResolvedValue({})
      });
      _.set(mockServiceContext, 'dal.notification', {
        sendEmailTemplate: jest.fn().mockResolvedValue()
      });
      bll = createBll(mockServiceContext);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      httpCallMock.mockResolvedValue({ isValid: true, seatLimit: 100 });
      mockServiceContext.dal.organizationInvite.getApplicationAndRoleIds.mockResolvedValue([
        {
          applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
          roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
        }
      ]);
      mockServiceContext.dal.organizationInvite.updateOrganizationInvite.mockImplementation(
        (_ctx, args) =>
          Promise.resolve({
            organizationInviteId: args.input.organizationInviteId,
            userId: 'provisioned-user-id-1111-2222-3333-444444444444',
            organizationId: '1000',
            status: 'approved',
            email: 'joiner@veritone.com',
            message: 'Invite',
            expirationDate: '',
            inviteType: 'self_signup',
            userDetails: args.input.userDetails
          })
      );
    });

    it('on approve, self-service invite does not create user; sends verification email only', async () => {
      mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        {
          organizationInviteId,
          organizationId: '1000',
          status: 'submitted',
          userId: null,
          inviteType: 'self_signup',
          email: 'joiner@veritone.com',
          expirationDate: 1657739341,
          userDetails: JSON.stringify({
            hashedPassword: validBcryptHash,
            firstName: 'Jane',
            lastName: 'Joiner'
          })
        }
      ]);

      await bll.updateOrganizationInvite(context, {
        input: {
          action: 'approve',
          organizationInviteId
        }
      });

      expect(mockServiceContext.dal.admin.createUser).not.toHaveBeenCalled();
      expect(mockServiceContext.dal.organizationInvite.updateOrgInviteWithNewUserId).not.toHaveBeenCalled();
      expect(mockServiceContext.dal.application.getAppIdFromOrgId).not.toHaveBeenCalled();
      expect(mockServiceContext.dal.notification.sendEmailTemplate).toHaveBeenCalledWith(
        context,
        expect.objectContaining({
          templateName: 'self-service-org-invite-email-verification'
        })
      );
    });

    it('on approve, self-service invite with invalid hashedPassword shape does not provision or issue password-reset token', async () => {
      mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        {
          organizationInviteId,
          organizationId: '1000',
          status: 'submitted',
          userId: null,
          inviteType: 'self_signup',
          email: 'joiner@veritone.com',
          expirationDate: 1657739341,
          userDetails: JSON.stringify({
            hashedPassword: 'not-a-valid-bcrypt-string'
          })
        }
      ]);

      await bll.updateOrganizationInvite(context, {
        input: {
          action: 'approve',
          organizationInviteId
        }
      });

      expect(mockServiceContext.dal.admin.createUser).not.toHaveBeenCalled();
      expect(mockServiceContext.dal.application.getAppIdFromOrgId).not.toHaveBeenCalled();
    });

    it('on complete, passes passwordHash to createUser when invite is approved with stored bcrypt and no userId', async () => {
      mockServiceContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        {
          organizationInviteId,
          organizationId: '1000',
          status: 'approved',
          userId: null,
          inviteType: 'self_signup',
          email: 'joiner@veritone.com',
          expirationDate: 1657739341,
          userDetails: {
            hashedPassword: validBcryptHash,
            firstName: 'Jane',
            lastName: 'Joiner'
          }
        }
      ]);
      mockServiceContext.dal.organizationInvite.updateOrgInviteWithNewUserId.mockResolvedValue([
        {
          organizationInviteId,
          userId: 'provisioned-user-id-1111-2222-3333-444444444444',
          email: 'joiner@veritone.com'
        }
      ]);

      await bll.updateOrganizationInvite(context, {
        input: {
          action: 'complete',
          organizationInviteId
        }
      });

      expect(mockServiceContext.dal.admin.createUser).toHaveBeenCalledTimes(1);
      expect(mockServiceContext.dal.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            passwordHash: validBcryptHash,
            email: 'joiner@veritone.com'
          })
        }),
        context
      );
    });
  });

  describe('#updateOrganizationInvite add invitee to org', function () {
    beforeEach(function () {
      globalServiceContext._clearAll();
      jest.clearAllMocks();
      if (!globalServiceContext.dal.organizationInvite) globalServiceContext.dal.organizationInvite = {};
      globalServiceContext.dal.organizationInvite.validateApplicationRolesExist = jest.fn().mockResolvedValue();
    });
    it('should throw error if an normal user add an invitee to the organization', async function () {
      let err, res;
      // mock value
      globalServiceContext.dbConnections['sso'].read._push([
        {
          count: 1,
          status: 'approved',
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com'
        }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          applicationId: '0981e79f-de99-489e-a2c4-366c4b466321',
          roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);

      // update organization invite
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com',
          status: 'complete'
        }
      ]);
      // creat organization invite audit
      globalServiceContext.dbConnections['sso'].write._push([]);

      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'complete',
        message: 'new message',
        applicationRoles: [
          {
            roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
          }
        ]
      };

      context._authInfo = {
        organization: {
          organizationId: 123,
          organizationName: 'test org'
        }
      };
      context._authInfo.permissionMasks = [];
      _.set(
        context,
        '_authInfo.userId',
        '00000000-0000-0000-0000-000000000000'
      );

      try {
        res = await bll.updateOrganizationInvite(context, {
          input
        });
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toMatch('Complete action is only allowed by Invitee');
      expect(globalServiceContext.messageUtil._counter()).toEqual(1);
      const event = globalServiceContext.messageUtil._messages()[0];
      expect(event.actionInfo.actionDetails).toEqual(
        'Failed to accept an invitation to organization test org (123)'
      );
      globalServiceContext.messageUtil._clearCounter();
    });

    it('should add user to the organization when organization invite is complete', async function () {
      let err, res;

      // Mock validateSeatLimit
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: 100
      });

      // mock value
      globalServiceContext.dbConnections['sso'].read._push([
        {
          count: 1,
          status: 'approved',
          user_id: '00000000-3333-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          applicationId: '0981e79f-de99-489e-a2c4-366c4b466321',
          roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // update organization invite
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com',
          status: 'complete'
        }
      ]);
      // creat organization invite audit
      globalServiceContext.dbConnections['sso'].write._push([]);
      // serviceContext.dal.admin.getOrganizationGuidsForUser (uses trans/write)
      globalServiceContext.dbConnections['sso'].write._push([], false);
      // Check group_id (inside addUserToOrganization tx, uses write)
      globalServiceContext.dbConnections['sso'].write._push([
        {
          group_id: '00000000-1234-0000-0000-000000000000'
        }
      ]);
      // Insert group and role
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([]);

      // get User for mutation return
      globalServiceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-3333-0000-0000-000000000000',
            user_name: 'user1@veritone.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false
      );

      // sendOrganizationInviteEmail
      globalServiceContext.dal.notification.sendEmailTemplate.mockImplementation(
        (ctx, options) => {
          expect(options.mergeKvp.url_acceptable_invitation).toEqual(
            expect.stringMatching(/\?panel=invite-requests/)
          );
          return Promise.resolve();
        }
      );

      globalServiceContext.dal.organization.getOrganization.mockImplementation(
        (ctx, options) => {
          return Promise.resolve({
            organizationName: 'Test Org',
            organizationGuid: '123',
            organizationId: '1000'
          });
        }
      );

      globalServiceContext.dal.application.getAppIdFromOrgId.mockResolvedValueOnce(
        '00000000-4444-0000-0000-000000000000'
      );

      globalServiceContext.bll.notification.post.mockImplementation(
        (_ctx, options) => {
          Promise.resolve(options);
        }
      );

      globalServiceContext.dbConnections['sso'].read._push(
        [
          {
            email: 'unittest@veritone.com'
          }
        ],
        false
      );

      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'complete',
        message: 'new message',
        applicationRoles: [
          {
            roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
          }
        ]
      };

      context._authInfo = {
        organization: { organizationId: 1000, organizationName: 'Test Org' }
      };
      context._authInfo.permissionMasks = [];
      _.set(
        context,
        '_authInfo.userId',
        '00000000-3333-0000-0000-000000000000'
      );

      res = await bll.updateOrganizationInvite(context, {
        input
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(globalServiceContext.messageUtil._counter()).toEqual(2);
      const event = globalServiceContext.messageUtil._messages()[1];
      expect(event.actionInfo.actionDetails).toEqual(
        'Accepted an invitation to organization Test Org (1000)'
      );
      expect(event.actionInfo.targetId).toEqual(
        '00000000-3333-0000-0000-000000000000'
      );
      globalServiceContext.messageUtil._clearCounter();
    });

    it('does not call validateApplicationRolesExist when enableStrictRoleValidation is off (default)', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: 100
      });

      globalServiceContext.dbConnections['sso'].read._push([
        {
          count: 1,
          status: 'approved',
          user_id: '00000000-3333-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          applicationId: '0981e79f-de99-489e-a2c4-366c4b466321',
          roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com',
          status: 'complete'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([], false);
      globalServiceContext.dbConnections['sso'].write._push([
        {
          group_id: '00000000-1234-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-3333-0000-0000-000000000000',
            user_name: 'user1@veritone.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false
      );
      globalServiceContext.dal.notification.sendEmailTemplate.mockImplementation(
        () => Promise.resolve()
      );
      globalServiceContext.dal.organization.getOrganization.mockImplementation(
        () =>
          Promise.resolve({
            organizationName: 'Test Org',
            organizationGuid: '123',
            organizationId: '1000'
          })
      );
      globalServiceContext.dal.application.getAppIdFromOrgId.mockResolvedValueOnce(
        '00000000-4444-0000-0000-000000000000'
      );
      globalServiceContext.bll.notification.post.mockImplementation(() => {});
      globalServiceContext.dbConnections['sso'].read._push(
        [{ email: 'unittest@veritone.com' }],
        false
      );

      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'complete',
        message: 'new message',
        applicationRoles: [
          {
            roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
          }
        ]
      };

      context._authInfo = {
        organization: { organizationId: 1000, organizationName: 'Test Org' }
      };
      context._authInfo.permissionMasks = [];
      _.set(
        context,
        '_authInfo.userId',
        '00000000-3333-0000-0000-000000000000'
      );

      const res = await bll.updateOrganizationInvite(context, { input });

      expect(res).toBeDefined();
      expect(
        globalServiceContext.dal.organizationInvite.validateApplicationRolesExist
      ).not.toHaveBeenCalled();
      globalServiceContext.messageUtil._clearCounter();
    });

    it('calls validateApplicationRolesExist when enableStrictRoleValidation is on', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: 100
      });

      globalServiceContext.dbConnections['sso'].read._push([
        {
          count: 1,
          status: 'approved',
          user_id: '00000000-3333-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          applicationId: '0981e79f-de99-489e-a2c4-366c4b466321',
          roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com',
          status: 'complete'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([], false);
      globalServiceContext.dbConnections['sso'].write._push([
        {
          group_id: '00000000-1234-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-3333-0000-0000-000000000000',
            user_name: 'user1@veritone.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false
      );
      globalServiceContext.dal.notification.sendEmailTemplate.mockImplementation(
        () => Promise.resolve()
      );
      globalServiceContext.dal.organization.getOrganization.mockImplementation(
        () =>
          Promise.resolve({
            organizationName: 'Test Org',
            organizationGuid: '123',
            organizationId: '1000'
          })
      );
      globalServiceContext.dal.application.getAppIdFromOrgId.mockResolvedValueOnce(
        '00000000-4444-0000-0000-000000000000'
      );
      globalServiceContext.bll.notification.post.mockImplementation(() => {});
      globalServiceContext.dbConnections['sso'].read._push(
        [{ email: 'unittest@veritone.com' }],
        false
      );

      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'complete',
        message: 'new message',
        applicationRoles: [
          {
            roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
          }
        ]
      };

      context._authInfo = {
        organization: { organizationId: 1000, organizationName: 'Test Org' }
      };
      context._authInfo.permissionMasks = [];
      _.set(
        context,
        '_authInfo.userId',
        '00000000-3333-0000-0000-000000000000'
      );

      const flaggedContext = {
        ...globalServiceContext,
        config: {
          ...globalServiceContext.config,
          featureFlags: {
            ...globalServiceContext.config.featureFlags,
            enableStrictRoleValidation: true
          }
        }
      };
      const flaggedBll = createBll(flaggedContext);

      const res = await flaggedBll.updateOrganizationInvite(context, { input });

      expect(res).toBeDefined();
      expect(
        globalServiceContext.dal.organizationInvite.validateApplicationRolesExist
      ).toHaveBeenCalled();
      globalServiceContext.messageUtil._clearCounter();
    });

    it('should trigger invite event and notification for invitee when organization invite is approved by an organization admin', async function () {
      let err, res;
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: 100
      });

      // mock value
      globalServiceContext.dbConnections['sso'].read._push([
        {
          count: 1,
          status: 'submitted',
          user_id: context._authInfo.userId,
          organizationId: 1000,
          expirationDate: 1657739341
        }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          userId: '00000000-user-0000-0000-000000000000',
          email: 'unittest@veritone.com',
          organizationId: 1000,
          applicationId: '0981e79f-de99-489e-a2c4-366c4b466321',
          roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      globalServiceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-4444-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com',
          status: 'approved'
        }
      ]);
      // create organization invite audit
      globalServiceContext.dbConnections['sso'].write._push([]);
      // _triggerInviteEventAndNotiForInvitee
      // serviceContext.dal.organization.getOrganization
      globalServiceContext.dbConnections['media_platform'].read._push([{}]);
      globalServiceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682, organization_name: 'Test Org' }
      ]);
      // serviceContext.bll.notification.post
      globalServiceContext.bll.notification.post.mockImplementation(
        (ctx, options) => {
          expect(options.input.mailboxIds.length).toEqual(1);
          expect(options.input.mailboxIds[0]).toEqual(
            '00000000-3333-0000-0000-000000000000'
          );
          expect(options.input.eventName).toEqual('OrganizationInvitation');
          return Promise.resolve();
        }
      );
      // sendOrganizationInviteEmail
      // serviceContext.dal.organization.getOrganization
      globalServiceContext.dbConnections['media_platform'].read._push([{}]);
      globalServiceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682, organization_name: 'Test Org' }
      ]);
      globalServiceContext.dal.notification.sendEmailTemplate.mockImplementation(
        (ctx, options) => {
          return Promise.resolve();
        }
      );
      globalServiceContext.dal.organization.getOrganization.mockImplementation(
        (ctx, options) => {
          return Promise.resolve({
            organizationName: 'Test Org'
          });
        }
      );

      globalServiceContext.bll.notification.post.mockImplementation(
        (_ctx, options) => {
          Promise.resolve(options);
        }
      );

      globalServiceContext.dbConnections['sso'].read._push([
        {
          email: 'unittest@veritone.com'
        }
      ]);
      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'approve',
        message: 'new message',
        applicationRoles: [
          {
            roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
          }
        ]
      };
      try {
        res = await bll.updateOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(globalServiceContext.messageUtil._counter()).toEqual(1);
      const event = globalServiceContext.messageUtil._messages()[0];
      expect(event.actionInfo.actionDetails).toEqual(
        `Accepted an organization request from unittest@veritone.com`
      );
      expect(event.actionInfo.targetId).toEqual(
        '00000000-user-0000-0000-000000000000'
      );
      globalServiceContext.messageUtil._clearCounter();
    });

    // New test for resend action
    it('should resend an approved invitation and update expiration date', async function () {
      let err, res;
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: null
      });
      // Mock db reads/writes used by the flow
      globalServiceContext.dbConnections['sso'].read._push([
        {
          count: 1,
          status: 'approved',
          user_id: '00000000-3333-0000-0000-000000000000',
          organization_id: 1000,
          expiration_date: 1657739341
        }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          application_id: '0981e79f-de99-489e-a2c4-366c4b466321',
          role_id: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);

      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '1000',
          user_id: '00000000-3333-0000-0000-000000000000',
          email: 'user1@veritone.com',
          status: 'approved'
        }
      ]);

      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].read._push(
        [
          {
            email: 'user1@veritone.com'
          }
        ],
        false
      );

      globalServiceContext.dal.organization.getOrganization.mockResolvedValue({
        organizationName: 'Test Org',
        organizationGuid: '123'
      });
      globalServiceContext.dal.notification.sendEmailTemplate.mockResolvedValue();
      globalServiceContext.bll.notification.post.mockResolvedValue();

      globalServiceContext.dal.application.getApplication = jest
        .fn()
        .mockResolvedValue({
          applicationId: '00000000-4444-0000-0000-000000000000',
          applicationUrl: 'test-resend-app.veritone.com'
        });

      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'resend'
      };

      context._authInfo = {
        organization: { organizationId: 1000, organizationName: 'test org' },
        permissionMasks: [8188],
        userId: '00000000-admin-0000-0000-000000000000'
      };

      try {
        res = await bll.updateOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.status).toEqual('approved');
    });
  });

  describe('#updateOrganizationInvite terms-of-service acceptance on completion', function () {
    const INVITE_ID = '00000000-1111-0000-0000-000000000000';
    const USER_ID = '00000000-3333-0000-0000-000000000000';
    const ORG_GUID = '00000000-4444-0000-0000-000000000000';
    const TOS_FILE_ID = '00000000-5555-0000-0000-000000000000';
    const REG_CONFIG_ID = '00000000-6666-0000-0000-000000000000';

    let originals;

    beforeEach(function () {
      globalServiceContext._clearAll();
      jest.clearAllMocks();
      if (!globalServiceContext.dal.organizationInvite)
        globalServiceContext.dal.organizationInvite = {};
      globalServiceContext.dal.organizationInvite.validateApplicationRolesExist = jest
        .fn()
        .mockResolvedValue();

      // Spy the three provisioning writes so the assertions are about which of them happen and how
      // their failures behave. Everything before them runs for real against the SQL mock queue.
      originals = {
        addUserCustomProfile: globalServiceContext.dal.admin.addUserCustomProfile,
        setUserSetting: globalServiceContext.dal.admin.setUserSetting,
        upsertUserSetting: globalServiceContext.dal.admin.upsertUserSetting
      };
      globalServiceContext.dal.admin.addUserCustomProfile = jest.fn().mockResolvedValue({});
      globalServiceContext.dal.admin.setUserSetting = jest.fn().mockResolvedValue({});
      globalServiceContext.dal.admin.upsertUserSetting = jest.fn().mockResolvedValue({});
    });

    afterEach(function () {
      globalServiceContext.dal.admin.addUserCustomProfile = originals.addUserCustomProfile;
      globalServiceContext.dal.admin.setUserSetting = originals.setUserSetting;
      globalServiceContext.dal.admin.upsertUserSetting = originals.upsertUserSetting;
    });

    /**
     * Mirrors the mock queue of "should add user to the organization when organization invite is
     * complete", with
     * user_details on the invite row so the provisioning branch is reached.
     */
    function arrangeCompletion(userDetails) {
      httpCallMock.mockResolvedValueOnce({ isValid: true, seatLimit: 100 });

      // invite lookup
      globalServiceContext.dbConnections['sso'].read._push([
        { count: 1, status: 'approved', user_id: USER_ID }
      ]);
      // invite application roles
      globalServiceContext.dbConnections['sso'].read._push([
        {
          organization_invite_id: INVITE_ID,
          applicationId: '0981e79f-de99-489e-a2c4-366c4b466321',
          roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956'
        }
      ]);
      // updateOrganizationInvite — user_details drives the provisioning branch
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: INVITE_ID,
          organization_id: '1000',
          user_id: USER_ID,
          email: 'user1@veritone.com',
          status: 'complete',
          user_details: userDetails
        }
      ]);
      // invite audit
      globalServiceContext.dbConnections['sso'].write._push([]);
      // getOrganizationGuidsForUser (uses trans/write)
      globalServiceContext.dbConnections['sso'].write._push([], false);
      // addUserToOrganization: group_id check, then group + role inserts
      globalServiceContext.dbConnections['sso'].write._push([
        { group_id: '00000000-1234-0000-0000-000000000000' }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      // getUser for the mutation return value
      globalServiceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: USER_ID,
            user_name: 'user1@veritone.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false
      );
      globalServiceContext.dbConnections['sso'].read._push(
        [{ email: 'unittest@veritone.com' }],
        false
      );

      globalServiceContext.dal.application.getAppIdFromOrgId.mockResolvedValue(ORG_GUID);
      globalServiceContext.dal.organization.getOrganization.mockResolvedValue({
        organizationName: 'Test Org',
        organizationGuid: '123',
        organizationId: '1000'
      });
      globalServiceContext.dal.notification.sendEmailTemplate.mockResolvedValue();
      globalServiceContext.bll.notification.post.mockResolvedValue();

      context._authInfo = {
        organization: { organizationId: 1000, organizationName: 'Test Org' }
      };
      context._authInfo.permissionMasks = [];
      _.set(context, '_authInfo.userId', USER_ID);

      return {
        organizationInviteId: INVITE_ID,
        action: 'complete',
        message: 'complete',
        applicationRoles: [
          {
            roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
            applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
          }
        ]
      };
    }

    async function run(input) {
      let err;
      try {
        await bll.updateOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }
      globalServiceContext.messageUtil._clearCounter();
      return err;
    }

    it('should record the acceptance keyed by the accepted document id, inside the transaction', async function () {
      const input = arrangeCompletion({
        firstName: 'Jane',
        customRegistrationId: REG_CONFIG_ID,
        acceptedTermsFileId: TOS_FILE_ID
      });

      const err = await run(input);

      expect(err).toBeUndefined();
      expect(globalServiceContext.dal.admin.upsertUserSetting).toHaveBeenCalledTimes(1);
      const [options, trans] =
        globalServiceContext.dal.admin.upsertUserSetting.mock.calls[0];
      expect(options.userId).toEqual(USER_ID);
      // The key IS the document id — the shape the first-login terms check reads.
      expect(options.key).toEqual(TOS_FILE_ID);
      expect(options.value).toBeDefined();
      expect(trans).toBeDefined();
    });

    it('should also record customRegistrationId, which the first-login check needs before it looks at terms', async function () {
      // Without this marker the first-login check short-circuits and never evaluates terms at all —
      // which would look like success while no acceptance had been recorded.
      const input = arrangeCompletion({
        customRegistrationId: REG_CONFIG_ID,
        acceptedTermsFileId: TOS_FILE_ID
      });

      await run(input);

      const keys = globalServiceContext.dal.admin.setUserSetting.mock.calls.map((call) =>
        _.get(call, '[1].input.key')
      );
      expect(keys).toContain('customRegistrationId');
    });

    it('should fail the whole completion when the acceptance write fails', async function () {
      const input = arrangeCompletion({
        customRegistrationId: REG_CONFIG_ID,
        acceptedTermsFileId: TOS_FILE_ID
      });
      globalServiceContext.dal.admin.upsertUserSetting = jest
        .fn()
        .mockRejectedValue(new Error('write failed'));

      const err = await run(input);

      // A user must not end up created with no acceptance on record.
      expect(err).toBeDefined();
    });

    it('should not record anything when the configuration had no active terms document', async function () {
      const input = arrangeCompletion({
        firstName: 'Jane',
        customRegistrationId: REG_CONFIG_ID
      });

      const err = await run(input);

      expect(err).toBeUndefined();
      expect(globalServiceContext.dal.admin.upsertUserSetting).not.toHaveBeenCalled();
    });

    it('should still tolerate failure of the two pre-existing writes', async function () {
      // The custom-profile and customRegistrationId writes tolerate failure; only the acceptance
      // write is allowed to fail the completion.
      const input = arrangeCompletion({
        customRegistrationId: REG_CONFIG_ID,
        acceptedTermsFileId: TOS_FILE_ID
      });
      globalServiceContext.dal.admin.addUserCustomProfile = jest
        .fn()
        .mockRejectedValue(new Error('profile write failed'));
      globalServiceContext.dal.admin.setUserSetting = jest
        .fn()
        .mockRejectedValue(new Error('setting write failed'));

      const err = await run(input);

      expect(err).toBeUndefined();
      expect(globalServiceContext.dal.admin.upsertUserSetting).toHaveBeenCalledTimes(1);
    });
  });

  describe('#createOrganizationInvite - validateOrganization', () => {
    const mockContext = createMockServiceContext();
    mockContext.dal.application.getAppIdFromOrgId = jest.fn();
    mockContext.dal.admin.allowedToUpdateOrganization = jest.fn();
    mockContext.dal.admin.getUsersByEmail = jest.fn();
    mockContext.dal.admin.getOrganizationGuidsForUser = jest.fn();
    mockContext.dal.organizationInvite.cleanExpiredInvites = jest.fn();
    mockContext.dal.organizationInvite.cleanExpiredInvites.mockResolvedValue();
    mockContext.dal.organizationInvite.validateApplicationRolesExist = jest.fn().mockResolvedValue();
    const bll = createBll(mockContext);
    const args = {
      input: {
        email: 'test@abc.com',
        organizationId: 1000
      }
    };
    it('check organizationId resolves to guid', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(null);
      await expect(async () =>
        bll.createOrganizationInvite({}, args)
      ).rejects.toThrow('Invalid organizationId');
    });

    it('check if caller has access to org', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        false
      );
      await expect(async () =>
        bll.createOrganizationInvite({}, args)
      ).rejects.toThrow('Access denied');
      expect(mockContext.dal.application.getAppIdFromOrgId).toHaveBeenCalled();
      expect(
        mockContext.dal.admin.allowedToUpdateOrganization
      ).toHaveBeenCalled();
    });

    it('check if invitee is already a member', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(true);
      mockContext.dal.admin.getUsersByEmail.mockResolvedValue([
        { userId: 'ce26fc54-211b-4b16-807b-18fbd4769814' }
      ]);
      mockContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue([
        '--org-guid--'
      ]);
      await expect(async () =>
        bll.createOrganizationInvite({}, args)
      ).rejects.toThrow('This user is already a member of this organization');
      expect(
        mockContext.dal.admin.getOrganizationGuidsForUser
      ).toHaveBeenCalled();
    });

    it('should not throw an error if the validation is success', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(true);
      mockContext.dal.admin.getUsersByEmail.mockResolvedValue([
        { userId: 'ce26fc54-211b-4b16-807b-18fbd4769814' }
      ]);
      mockContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue([
        '--another-org-guid--'
      ]);

      let result, err;
      try {
        result = await bll.validateOrganization(
          args.input.organizationId,
          args.input.email,
          {}
        );
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.organizationGuid).toBe('--org-guid--');

      expect(
        mockContext.dal.admin.getOrganizationGuidsForUser
      ).toHaveBeenCalled();
    });

    it('check if authGroupId is a valid UUID', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(true);
      mockContext.dal.admin.getUsersByEmail.mockResolvedValue([
        { userId: 'ce26fc54-211b-4b16-807b-18fbd4769814' }
      ]);
      mockContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue([
        '--another-org-guid--'
      ]);
      httpCallMock.mockResolvedValueOnce({ isValid: true, seatLimit: 100 });

      const argsWithInvalidAuthGroupId = {
        input: {
          ...args.input,
          applicationRoles: [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ],
          authGroupIds: ['invalid-uuid']
        }
      };

      await expect(async () =>
        bll.createOrganizationInvite({}, argsWithInvalidAuthGroupId)
      ).rejects.toThrow('bll.createOrganizationInvite: Invalid authGroupId');
    });

    it('check if authGroupIds exist in the organization', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(true);
      mockContext.dal.admin.getUsersByEmail.mockResolvedValue([
        { userId: 'ce26fc54-211b-4b16-807b-18fbd4769814' }
      ]);
      mockContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue([
        '--another-org-guid--'
      ]);
      httpCallMock.mockResolvedValueOnce({ isValid: true, seatLimit: 100 });
      _.set(
        mockContext,
        'bll.rbacAuth.getAuthGroups',
        jest.fn().mockResolvedValue({
          records: []
        })
      );

      const argsWithNonexistentAuthGroupId = {
        input: {
          ...args.input,
          applicationRoles: [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ],
          authGroupIds: ['6017d062-252f-4ec2-82e1-79066f7d35e4']
        }
      };

      await expect(async () =>
        bll.createOrganizationInvite({}, argsWithNonexistentAuthGroupId)
      ).rejects.toThrow(
        'bll.createOrganizationInvite: One or more authGroupIds do not exist in the organization'
      );
    });

    it('does not call validateApplicationRolesExist when enableStrictRoleValidation is off (default)', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(true);
      mockContext.dal.admin.getUsersByEmail.mockResolvedValue([
        { userId: 'ce26fc54-211b-4b16-807b-18fbd4769814' }
      ]);
      mockContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue([
        '--another-org-guid--'
      ]);
      httpCallMock.mockResolvedValueOnce({ isValid: true, seatLimit: 100 });

      const argsWithInvalidAuthGroupId = {
        input: {
          ...args.input,
          applicationRoles: [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ],
          authGroupIds: ['invalid-uuid']
        }
      };

      await expect(async () =>
        bll.createOrganizationInvite({}, argsWithInvalidAuthGroupId)
      ).rejects.toThrow('bll.createOrganizationInvite: Invalid authGroupId');

      expect(
        mockContext.dal.organizationInvite.validateApplicationRolesExist
      ).not.toHaveBeenCalled();
    });

    it('calls validateApplicationRolesExist when enableStrictRoleValidation is on', async () => {
      mockContext.dal.application.getAppIdFromOrgId.mockResolvedValue(
        '--org-guid--'
      );
      mockContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(true);
      mockContext.dal.admin.getUsersByEmail.mockResolvedValue([
        { userId: 'ce26fc54-211b-4b16-807b-18fbd4769814' }
      ]);
      mockContext.dal.admin.getOrganizationGuidsForUser.mockResolvedValue([
        '--another-org-guid--'
      ]);
      httpCallMock.mockResolvedValueOnce({ isValid: true, seatLimit: 100 });

      const flaggedContext = {
        ...mockContext,
        config: {
          ...mockContext.config,
          featureFlags: {
            ...mockContext.config.featureFlags,
            enableStrictRoleValidation: true
          }
        }
      };
      const flaggedBll = createBll(flaggedContext);

      const argsWithInvalidAuthGroupId = {
        input: {
          ...args.input,
          applicationRoles: [
            {
              applicationId: '6017d062-252f-4ec2-82e1-79066f7d35e3',
              roleId: '6017d062-252f-4ec2-82e1-79066f7d35e3'
            }
          ],
          authGroupIds: ['invalid-uuid']
        }
      };

      await expect(async () =>
        flaggedBll.createOrganizationInvite({}, argsWithInvalidAuthGroupId)
      ).rejects.toThrow('bll.createOrganizationInvite: Invalid authGroupId');

      expect(
        mockContext.dal.organizationInvite.validateApplicationRolesExist
      ).toHaveBeenCalledWith(
        expect.anything(),
        argsWithInvalidAuthGroupId.input.applicationRoles,
        argsWithInvalidAuthGroupId.input.organizationId
      );
    });
  });

  describe('#createOrganizationInvite trigger invite', () => {
    // Built once and reused across tests (full serviceContext construction is
    // expensive - ~35 DAL/BLL modules + caches). This previously couldn't be
    // hoisted out of beforeEach because _clearAll() crashes once messageUtil
    // has been replaced by the bespoke mock below (_clearAll calls
    // messageUtil._clearCounter(), which the bespoke object lacks) - restoring
    // the pristine messageUtil before _clearAll() runs each test fixes that.
    let mockSvcContext, bll, defaultMessageUtil;
    beforeAll(() => {
      mockSvcContext = createMockServiceContext();
      defaultMessageUtil = mockSvcContext.messageUtil;
    });
    beforeEach(() => {
      mockSvcContext.messageUtil = defaultMessageUtil;
      mockSvcContext._clearAll();
      mockSvcContext.bll.notification = {
        post: jest.fn()
      };
      mockSvcContext.dal.notification = {
        sendEmailTemplate: jest.fn()
      };
      mockSvcContext.messageUtil = {
        emitPublicEvent: jest.fn(),
        buildActionInfo: jest.fn()
      };
      mockSvcContext.dal.organizationInvite.cleanExpiredInvites = jest.fn();
      mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest.fn();
      mockSvcContext.dal.organizationInvite.validateApplicationRolesExist = jest.fn().mockResolvedValue();

      mockSvcContext.dal.organizationInvite.cleanExpiredInvites.mockResolvedValue();

      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue(
        [
          {
            status: 'submitted',
            organizationInviteId: '0000000-0000-1111-0000-00000000000'
          }
        ]
      );
      bll = createBll(mockSvcContext);
    });

    it('should trigger invite request event and notification for org admins when a non-admin creates a new invite request for a user', async function () {
      let res;

      const args = {
        input: {
          email: 'test@abc.com',
          organizationId: 1000,
          applicationRoles: [
            {
              roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
              applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
            }
          ],
          message: 'Invite a new user'
        }
      };

      // validate organizationId
      /// getAppIdFromOrgId
      mockSvcContext.dbConnections['sso'].read._push(
        [{ application_id: '0000000-0000-2222-0000-00000000000' }],
        false
      );
      /// allowedToUpdateOrganization
      mockSvcContext.dbConnections['sso'].read._push(
        [{ application_id: '0000000-0000-2222-0000-00000000000' }],
        false
      );
      /// Get userId using email.
      mockSvcContext.dbConnections['sso'].read._push(
        [{ user_id: '0000000-0000-1111-0000-00000000000' }],
        false
      );

      /// serviceContext.dal.admin.allowedToUpdateOrganization
      mockSvcContext.dbConnections['sso'].read._push([], false);

      // validate SeatLimit
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: null
      });

      // serviceContext.dal.organizationInvite.getOrganizationInvites
      mockSvcContext.dbConnections['sso'].read._push(
        [
          {
            organization_invite_id: '0000000-0000-1111-0000-00000000000'
          }
        ],
        false
      );

      // serviceContext.dal.organizationInvite.updateOrganizationInvite
      mockSvcContext.dbConnections['sso'].write._push(
        [
          {
            organization_invite_id: '0000000-0000-1111-0000-00000000000'
          }
        ],
        false
      );

      // serviceContext.dal.organizationInvite.createOrganizationInvite
      mockSvcContext.dbConnections['sso'].write._push(
        [
          {
            organization_invite_id: '0000000-0000-0000-0000-00000000000',
            user_id: 'ce26fc54-211b-4b16-807b-18fbd4769814',
            organization_id: '1000',
            status: 'submitted',
            email: 'test@abc.com',
            message: 'Invite a new user',
            expiration_date: '',
            password_reset_token: null
          }
        ],
        false,
        [],
        (sql, vars) => {
          if (vars.length != 12) throw new Error('wrong number of vars');

          return true;
        }
      );

      // create organization invite application roles and audits
      mockSvcContext.dbConnections['sso'].write._push([]);
      mockSvcContext.dbConnections['sso'].write._push([], false, [], (sql, vars) => {
        return true;
      });

      // _triggerInviteRequestEventAndNotiForOrgAdmins
      // serviceContext.dal.organization.getOrganization
      mockSvcContext.dbConnections['media_platform'].read._push([{}]);
      mockSvcContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Test Org',
          kvp: {
            features: {
              defaultApplication: '0000000-0000-2222-0000-00000000000'
            }
          }
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers - get appId from orgId
      mockSvcContext.dbConnections['sso'].read._push(
        [
          {
            organization_id: 7682,
            application_id: 'c1989a40-de8f-4e68-811b-ae7474602499'
          }
        ],
        false
      );
      // serviceContext.dal.user.getOrgAdminUsers
      mockSvcContext.dbConnections['sso'].read._push(
        [{ user_id: '0000000-0000-2222-0000-00000000000' }],
        false
      );
      // serviceContext.bll.notification.post
      mockSvcContext.bll.notification.post.mockImplementation(
        (ctx, options) => {
          expect(options.input.mailboxIds.length).toEqual(1);
          expect(options.input.mailboxIds[0]).toEqual(
            '0000000-0000-2222-0000-00000000000'
          );
          expect(options.input.eventName).toEqual('OrganizationRequest');

          return Promise.resolve();
        }
      );
      // serviceContext.dal.application.getApplication
      mockSvcContext.dbConnections['sso'].read._push(
        [
          {
            application_id: '0000000-0000-2222-0000-00000000000',
            application_url: 'https://abc.com/'
          }
        ],
        false
      );
      // serviceContext.dal.organizationInvite.getOrganizationInvites
      mockSvcContext.dbConnections['sso'].read._push(
        [
          {
            organization_invite_id: '0000000-0000-2222-0000-00000000000',
            status: 'submitted'
          }
        ],
        false
      );

      // sendOrganizationInviteEmail
      mockSvcContext.dal.notification.sendEmailTemplate.mockImplementation(
        (ctx, options) => {
          expect(options.mergeKvp.user_count).toEqual(1);
          expect(options.mergeKvp.url_view_requests).toBeDefined();
          return Promise.resolve();
        }
      );

      context._authInfo = {
        organization: { organizationId: 1000, organizationName: 'Test Org' }
      };
      context._authInfo.permissionMasks = [];
      context.messageUtil = {
        emitPublicEvent: jest.fn(),
        buildActionInfo: jest.fn()
      };
      _.set(
        context,
        '_authInfo.userId',
        '00000000-3333-0000-0000-000000000000'
      );
      _.set(context, '_authInfo.organization.organizationId', 1000);

      res = await bll.createOrganizationInvite(context, args);
      expect(mockSvcContext.messageUtil.emitPublicEvent).toHaveBeenCalled();
      const [eventName, emitter, eventContext] =
        mockSvcContext.messageUtil.emitPublicEvent.mock.calls[0];
      expect(mockSvcContext.messageUtil.buildActionInfo).toHaveBeenCalledWith(
        'ce26fc54-211b-4b16-807b-18fbd4769814',
        undefined,
        null,
        null,
        `Sent an organization invitation request for Test Org (${args.input.organizationId}) to ${args.input.email}`
      );
      expect(eventName).toBe(eventsMap.OrganizationRequest.name);
      expect(emitter).toBe('system');
      expect(eventContext).toBe(context);
      expect(res).toBeDefined();
      expect(res).toEqual({
        organizationInviteId: '0000000-0000-0000-0000-00000000000',
        userId: 'ce26fc54-211b-4b16-807b-18fbd4769814',
        organizationId: '1000',
        status: 'submitted',
        email: 'test@abc.com',
        message: 'Invite a new user',
        expirationDate: '',
        passwordResetToken: null
      });
      expect(
        mockSvcContext.dal.organizationInvite.cleanExpiredInvites
      ).toHaveBeenCalledWith(
        context,
        {
          email: args.input.email,
          organizationId: args.input.organizationId
        },
        expect.anything()
      );
    });

    it('should throw an error if there is duplicate data', async function () {
      const args = {
        input: {
          email: 'test@abc.com',
          organizationId: 1000,
          applicationRoles: [
            {
              roleId: 'a0359273-ecc6-4934-aa6b-092fbed49956',
              applicationId: '0981e79f-de99-489e-a2c4-366c4b466321'
            }
          ],
          message: 'Invite a new user'
        }
      };

      // validate organizationId
      /// getAppIdFromOrgId
      mockSvcContext.dbConnections['sso'].read._push(
        [{ application_id: '0000000-0000-2222-0000-00000000000' }],
        false
      );
      /// allowedToUpdateOrganization
      mockSvcContext.dbConnections['sso'].read._push(
        [{ application_id: '0000000-0000-2222-0000-00000000000' }],
        false
      );
      /// Get userId using email.
      mockSvcContext.dbConnections['sso'].read._push(
        [{ user_id: '0000000-0000-1111-0000-00000000000' }],
        false
      );

      /// serviceContext.dal.admin.allowedToUpdateOrganization
      mockSvcContext.dbConnections['sso'].read._push([], false);

      // validate SeatLimit
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: null
      });
      //  serviceContext.dal.organizationInvite.getOrganizationInvites
      mockSvcContext.dbConnections['sso'].read._push([], false);
      // serviceContext.dal.organizationInvite.createOrganizationInvite
      mockSvcContext.dbConnections['sso'].write._push([], false);

      let error;
      try {
        await bll.createOrganizationInvite(context, args);
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.name).toBe('resource_conflict');
      expect(mockSvcContext.messageUtil.buildActionInfo).toHaveBeenCalledWith(
        'test@abc.com',
        expect.anything(),
        null,
        null,
        `Failed to invite ${args.input.email} to organization Veritone, Inc. (${args.input.organizationId})`
      );
    });
  });

  describe('#createOrganizationInvite - Handling existing invites', () => {
    // Built once and reused across tests (full serviceContext construction is
    // expensive - ~35 DAL/BLL modules + caches). Every field these tests touch
    // (dbConnections, messageUtil, bll.notification, and each dal.* used
    // below) is unconditionally reassigned fresh in beforeEach regardless, so
    // sharing the base context introduces no cross-test leakage.
    const mockSvcContext = createMockServiceContext();
    let bll;
    const args = {
      input: {
        email: 'test@abc.com',
        organizationId: 1000,
        applicationRoles: [
          { applicationId: 'c6aeb2eb-816f-46de-b57c-4704716d3080', roleId: 'c6aeb2eb-816f-46de-b57c-4704716d3080' }
        ],
        message: 'Invite'
      }
    };

    beforeEach(() => {

      mockSvcContext.dbConnections = {
          sso: {
              write: {
                  tx: jest.fn(async (name, cb) => await cb({}))
              }
          }
      };

      mockSvcContext.bll.notification = { post: jest.fn().mockResolvedValue() };
      mockSvcContext.dal.notification = { sendEmailTemplate: jest.fn().mockResolvedValue() };
      mockSvcContext.messageUtil = {
        emitPublicEvent: jest.fn(),
        buildActionInfo: jest.fn()
      };

      mockSvcContext.dal.organizationInvite.cleanExpiredInvites = jest.fn().mockResolvedValue();
      mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest.fn().mockResolvedValue([]);
      mockSvcContext.dal.organizationInvite.updateOrganizationInvite = jest.fn().mockResolvedValue({});
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest.fn().mockResolvedValue({
          organizationInviteId: 'new-invite-id',
          organizationId: 1000,
          status: 'submitted',
          email: args.input.email
      });
      mockSvcContext.dal.organizationInvite.validateApplicationRolesExist = jest.fn().mockResolvedValue();
      
      mockSvcContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue('org-guid');
      mockSvcContext.dal.admin.allowedToUpdateOrganization = jest.fn().mockResolvedValue(true);
      mockSvcContext.dal.admin.getUsersByEmail = jest.fn().mockResolvedValue([]); 
      mockSvcContext.dal.admin.getOrganizationGuidsForUser = jest.fn().mockResolvedValue([]);
      mockSvcContext.dal.admin.getOrgAdminUsers = jest.fn().mockResolvedValue([]);
      
      mockSvcContext.dal.organization = {
        getOrganization: jest.fn().mockResolvedValue({ organizationName: 'Test Org' })
      };
      // Check if dal.user is needed
      mockSvcContext.dal.user = {
        getOrgAdminUsers: jest.fn().mockResolvedValue([])
      };

      httpCallMock.mockResolvedValue({ isValid: true });

      bll = createBll(mockSvcContext);
    });

    it('should throw NotAllowed if latest invite is rejected and requestor is not admin', async () => {
      const nonAdminContext = mockUtil.makeContext();
      nonAdminContext._authInfo.permissionMasks = [];
      nonAdminContext._authInfo.organization.organizationId = 999; 
      
      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        { organizationInviteId: 'old-rejected', status: 'rejected' }
      ]);

      await expect(bll.createOrganizationInvite(nonAdminContext, args))
        .rejects.toThrow("This user's invitation was previously rejected by an administrator. Please contact an administrator for assistance.");
    });

    it('should proceed if latest invite is rejected and requestor IS admin', async () => {
      const adminContext = mockUtil.makeContext();
      
      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        { organizationInviteId: 'old-rejected', status: 'rejected' }
      ]);

      await bll.createOrganizationInvite(adminContext, args);

      // Verify correct orderBy options are passed to get the latest invite first
      expect(mockSvcContext.dal.organizationInvite.getOrganizationInvites).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: args.input.organizationId }),
        expect.objectContaining({ email: args.input.email }),
        expect.anything(),
        expect.objectContaining({
          orderBy: {
            field: 'expiration_date',
            direction: 'DESC'
          }
        }),
        expect.anything()
      );
      
      expect(mockSvcContext.dal.organizationInvite.createOrganizationInvite).toHaveBeenCalled();
    });

    it('should reject active submitted invite before creating new one', async () => {
      const adminContext = mockUtil.makeContext();
      
      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        { organizationInviteId: 'active-submitted', status: 'submitted' }
      ]);

      await bll.createOrganizationInvite(adminContext, args);

      expect(mockSvcContext.dal.organizationInvite.updateOrganizationInvite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: {
            organizationInviteId: 'active-submitted',
            action: 'reject'
          }
        }),
        expect.anything()
      );
      expect(mockSvcContext.dal.organizationInvite.createOrganizationInvite).toHaveBeenCalled();
    });
    
    it('should delete active approved invite before creating new one', async () => {
      const adminContext = mockUtil.makeContext();
      
      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([
        { organizationInviteId: 'active-approved', status: 'approved' }
      ]);

      await bll.createOrganizationInvite(adminContext, args);

      expect(mockSvcContext.dal.organizationInvite.updateOrganizationInvite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: {
            organizationInviteId: 'active-approved',
            action: 'delete'
          }
        }),
        expect.anything()
      );
      expect(mockSvcContext.dal.organizationInvite.createOrganizationInvite).toHaveBeenCalled();
    });

    it('should pass transaction to getOrganizationInvites to see uncommitted deletes', async () => {
      const adminContext = mockUtil.makeContext();

      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockResolvedValue([]);
      mockSvcContext.dal.organizationInvite.createOrganizationInvite.mockResolvedValue({
        organizationInviteId: 'new-invite-id',
        status: 'submitted',
        organizationId: args.input.organizationId,
        email: args.input.email
      });

      await bll.createOrganizationInvite(adminContext, args);

      // Verify trans parameter (5th argument) is passed to getOrganizationInvites
      const callArgs = mockSvcContext.dal.organizationInvite.getOrganizationInvites.mock.calls[0];
      expect(callArgs).toHaveLength(5);
      expect(callArgs[4]).toBeDefined(); // trans parameter should exist
    });

    it('should successfully create new invite when expired one exists (race condition fix)', async () => {
      const adminContext = mockUtil.makeContext();
      
      // Mock getOrganizationInvites to return empty when called with trans (inside tx)
      // and return expired when called without trans (read replica - simulating race condition)
      mockSvcContext.dal.organizationInvite.getOrganizationInvites.mockImplementation(
        (obj, args, ctx, opts, trans) => {
          if (trans) {
            // Inside transaction after cleanExpiredInvites - should be empty
            return Promise.resolve([]);
          }
          // Without transaction - would see expired invite (old behavior)
          return Promise.resolve([
            { 
              organizationInviteId: 'expired-id', 
              status: 'submitted', 
              email: args.email,
              expirationDate: Math.floor(Date.now() / 1000) - 86400 // expired
            }
          ]);
        }
      );

      mockSvcContext.dal.organizationInvite.cleanExpiredInvites.mockResolvedValue();
      mockSvcContext.dal.organizationInvite.createOrganizationInvite.mockResolvedValue({
        organizationInviteId: 'new-invite-id',
        status: 'submitted',
        organizationId: args.input.organizationId,
        email: args.input.email
      });

      const result = await bll.createOrganizationInvite(adminContext, args);

      // Should NOT call updateOrganizationInvite for expired invite (it's already deleted in tx)
      expect(mockSvcContext.dal.organizationInvite.updateOrganizationInvite).not.toHaveBeenCalled();
      
      // Should create new invite successfully
      expect(mockSvcContext.dal.organizationInvite.createOrganizationInvite).toHaveBeenCalled();
      expect(result.organizationInviteId).toBe('new-invite-id');
    });
  });

  describe('#createOrganizationInvite — existing user request-to-join pending approval', () => {
    // Regression guard: an existing user submitting a request-to-join with disableAutoApproval:true
    // must trigger BOTH the admin approval email AND the invitee under-review email.
    // Previously, adminActionToken was gated on !userExistsAndIsAvailable, so the admin email was
    // silently skipped while the invitee was still told their request was under review.
    // Built once and reused across tests (full serviceContext construction is
    // expensive - ~35 DAL/BLL modules + caches). Every field this test touches
    // (dbConnections, messageUtil, bll.notification, and each dal.* used
    // below) is unconditionally reassigned fresh in beforeEach regardless, so
    // sharing the base context introduces no cross-test leakage.
    const mockSvcContext = createMockServiceContext();
    let bll;
    const existingUser = { userId: 'existing-user-id', status: 'active', userName: 'existing@test.com' };
    const adminUser = { userId: 'admin-user-id', userName: 'admin@org.com' };

    const args = {
      input: {
        email: 'existing@test.com',
        organizationId: 1000,
        requestToJoinOrganization: true,
        disableAutoApproval: true,
        applicationRoles: [
          { applicationId: 'c6aeb2eb-816f-46de-b57c-4704716d3080', roleId: 'c6aeb2eb-816f-46de-b57c-4704716d3080' }
        ]
      }
    };

    beforeEach(() => {
      mockSvcContext.dbConnections = {
        sso: {
          write: {
            tx: jest.fn(async (name, cb) => await cb({}))
          }
        }
      };

      mockSvcContext.bll.notification = { post: jest.fn().mockResolvedValue() };
      mockSvcContext.dal.notification = { sendEmailTemplate: jest.fn().mockResolvedValue() };
      mockSvcContext.messageUtil = {
        emitPublicEvent: jest.fn(),
        buildActionInfo: jest.fn()
      };

      mockSvcContext.dal.organizationInvite.cleanExpiredInvites = jest.fn().mockResolvedValue();
      mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest.fn().mockResolvedValue([]);
      mockSvcContext.dal.organizationInvite.updateOrganizationInvite = jest.fn().mockResolvedValue({});
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest.fn().mockResolvedValue({
        organizationInviteId: 'new-invite-id',
        organizationId: 1000,
        status: 'submitted',
        email: args.input.email
      });
      mockSvcContext.dal.organizationInvite.validateApplicationRolesExist = jest.fn().mockResolvedValue();

      mockSvcContext.dal.application.getAppIdFromOrgId = jest.fn().mockResolvedValue('org-guid');
      mockSvcContext.dal.admin.allowedToUpdateOrganization = jest.fn().mockResolvedValue(true);
      // Existing user — _validateUser returns true, so userExistsAndIsAvailable is true
      mockSvcContext.dal.admin.getUsersByEmail = jest.fn().mockResolvedValue([existingUser]);
      // User is not already a member of the target org
      mockSvcContext.dal.admin.getOrganizationGuidsForUser = jest.fn().mockResolvedValue([]);

      mockSvcContext.dal.organization = {
        getOrganization: jest.fn().mockResolvedValue({ organizationName: 'Test Org' })
      };
      // At least one admin must exist for the admin email to be sent
      mockSvcContext.dal.user = {
        getOrgAdminUsers: jest.fn().mockResolvedValue([adminUser])
      };

      httpCallMock.mockResolvedValue({ isValid: true });

      bll = createBll(mockSvcContext);
    });

    it('sends admin approval email AND invitee under-review email', async () => {
      const ctx = mockUtil.makeContext();

      await bll.createOrganizationInvite(ctx, args);

      const sentTemplates = mockSvcContext.dal.notification.sendEmailTemplate.mock.calls.map(
        ([, opts]) => opts.templateName
      );
      expect(sentTemplates).toContain('self-service-org-invite-admin-action');
      expect(sentTemplates).toContain('self-service-org-invite-under-review');
    });
  });

  describe('get the invitation link', () => {
    let args = {
      applicationId: '',
      userId: '',
      isRequestEmail: false,
      email: '',
      passwordResetToken: '',
      organizationInviteId: ''
    };

    it('Send to Admin - Get default App - Not found', async () => {
      args = {
        applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
        userId: '',
        isRequestEmail: true,
        email: 'test@abc.com',
        passwordResetToken: 'xxxxxxx',
        organizationInviteId: ''
      };
      globalServiceContext.dal.application.getApplication.mockResolvedValue(
        null
      );
      const btnLink = await bll.getInvitationLink(args);
      expect(
        globalServiceContext.dal.application.getApplication
      ).toHaveBeenCalled();
      expect(btnLink).toBeDefined();
      expect(btnLink).not.toContain('redirect');
    });

    it('Send to Admin - Get default App - Found', async () => {
      args = {
        applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
        userId: '',
        isRequestEmail: true,
        email: 'test@abc.com',
        passwordResetToken: 'xxxxxxx',
        organizationInviteId: ''
      };
      globalServiceContext.dal.application.getApplication.mockResolvedValue({
        applicationId: args.applicationId,
        applicationUrl: 'test-app.veritone.com'
      });
      const btnLink = await bll.getInvitationLink(args);
      expect(
        globalServiceContext.dal.application.getApplication
      ).toHaveBeenCalled();
      expect(btnLink).toBeDefined();
      expect(btnLink).toContain('redirect=test-app.veritone.com');
    });

    it('Send to Admin - Should redirect to login page', async () => {
      args = {
        applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
        userId: '',
        isRequestEmail: true,
        email: 'test@abc.com',
        passwordResetToken: 'xxxxxxx',
        organizationInviteId: ''
      };
      globalServiceContext.dal.application.getApplication.mockResolvedValue({
        applicationId: args.applicationId,
        applicationUrl: 'test-app.veritone.com'
      });
      const btnLink = await bll.getInvitationLink(args);
      expect(
        globalServiceContext.dal.application.getApplication
      ).toHaveBeenCalled();
      expect(btnLink).toBeDefined();
      expect(btnLink).toContain('https://login.');
      expect(btnLink).toContain('redirect=test-app.veritone.com');
      expect(btnLink).toContain('panel%3Dinvite-requests');
      expect(btnLink).not.toContain('reset-password');
    });

    it('Send to existing user (has userId) - Should redirect to login page', async () => {
      args = {
        applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
        userId: 'fdbc23d5-d5d0-4236-ac5f-f201b86300cd',
        isRequestEmail: false,
        email: 'test@abc.com',
        passwordResetToken: 'xxxxxxx',
        organizationInviteId: ''
      };
      globalServiceContext.dal.application.getApplication.mockResolvedValue({
        applicationId: args.applicationId,
        applicationUrl: 'test-app.veritone.com'
      });
      const btnLink = await bll.getInvitationLink(args);
      expect(
        globalServiceContext.dal.application.getApplication
      ).toHaveBeenCalled();
      expect(btnLink).toBeDefined();
      expect(btnLink).toContain('https://login.');
      expect(btnLink).toContain('redirect=test-app.veritone.com');
      expect(btnLink).toContain('panel%3Dinvite-requests');
      expect(btnLink).not.toContain('reset-password');
    });

    // Should redirect to the reset-password page to compelete the invitation and create a new account
    it('Send to new email - Should redirect to the reset-password page', async () => {
      args = {
        applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
        userId: '',
        isRequestEmail: false,
        email: 'test@abc.com',
        passwordResetToken: 'e0f4cfc8-5249-46a1-af89-7e966c9caf84',
        organizationInviteId: '63225b3e-8197-4a89-a883-8cd9a2cf93e8'
      };
      globalServiceContext.dal.application.getApplication.mockResolvedValue({
        applicationId: args.applicationId,
        applicationUrl: 'test-app.veritone.com'
      });
      const btnLink = await bll.getInvitationLink(args);
      expect(
        globalServiceContext.dal.application.getApplication
      ).toHaveBeenCalled();
      expect(btnLink).toBeDefined();
      expect(btnLink).toContain('redirect=test-app.veritone.com');
      expect(btnLink).toContain('panel%3Dinvite-requests');
      expect(btnLink).toContain('reset-password');
      expect(btnLink).toContain(`username=test%40abc.com`);
      expect(btnLink).toContain(`resettoken=${args.passwordResetToken}`);
      expect(btnLink).toContain(
        `organizationinviteid=${args.organizationInviteId}`
      );
    });


    describe('when pageUris login/reset-password URIs are configured', () => {
      const makeBll = ({ loginUri, resetPasswordUri }) =>

        createBll({
          ...globalServiceContext,
          config: {
            ...globalServiceContext.config,
            pageUris: {
              ...globalServiceContext.config.pageUris,
              loginUri,
              resetPasswordUri
            }
          }
        });
      const configuredUris = {
        loginUri: 'https://desktop.test-domain.com:443/ui/auth/login',
        resetPasswordUri:
          'https://desktop.test-domain.com:443/ui/auth/reset-password'
      };


      beforeEach(() => {
        globalServiceContext.dal.application.getApplication.mockResolvedValue({
          applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
          applicationUrl: 'https://desktop.test-domain.com:443'
        });
      });


      it('builds the login link from pageUris.loginUri', async () => {
        const btnLink = await makeBll(configuredUris).getInvitationLink({
          applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
          userId: 'fdbc23d5-d5d0-4236-ac5f-f201b86300cd',
          isRequestEmail: false,
          email: 'test@abc.com',
          passwordResetToken: 'xxxxxxx',
          organizationInviteId: ''
        });
        expect(
          btnLink.startsWith(
            'https://desktop.test-domain.com:443/ui/auth/login/?redirect='
          )
        ).toBe(true);
        expect(btnLink).not.toContain('https://login.');
        expect(btnLink).toContain('panel%3Dinvite-requests');
      });

      it('builds the reset-password link from pageUris.resetPasswordUri', async () => {
        const btnLink = await makeBll(configuredUris).getInvitationLink({
          applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
          userId: '',
          isRequestEmail: false,
          email: 'test@abc.com',
          passwordResetToken: 'e0f4cfc8-5249-46a1-af89-7e966c9caf84',
          organizationInviteId: '63225b3e-8197-4a89-a883-8cd9a2cf93e8'
        });
        expect(
          btnLink.startsWith(
            'https://desktop.test-domain.com:443/ui/auth/reset-password/?resettoken='
          )
        ).toBe(true);
        expect(btnLink).not.toContain('https://login.');
      });

      it('falls back to legacy login links when the URIs are empty', async () => {
        const btnLink = await makeBll({
          loginUri: '',
          resetPasswordUri: ''
        }).getInvitationLink({
          applicationId: '984886ab-23f3-4d65-80ea-0729338d745e',
          userId: 'fdbc23d5-d5d0-4236-ac5f-f201b86300cd',
          isRequestEmail: false,
          email: 'test@abc.com',
          passwordResetToken: 'xxxxxxx',
          organizationInviteId: ''
        });
        expect(btnLink).toMatch(/^https:\/\/login\.[^/]+\/\?redirect=/);
      });
    });

  });

  describe('#deleteOrganizationInvite', function () {
    it('should throw error if invalid organizationInviteId.', async function () {
      let err, res;
      const input = {
        organizationInviteId: 'InvalidId'
      };

      try {
        res = await bll.deleteOrganizationInvite(context, input);
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should throw error if no record for invitation.', async function () {
      let err, res;

      // getOrganizationInvite
      globalServiceContext.dbConnections['sso'].read._push([]);

      const input = {
        organizationInviteId: '00000000-3333-0000-0000-000000000000'
      };

      try {
        res = await bll.deleteOrganizationInvite(context, input);
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should pass and return correct delete message.', async function () {
      let err, res;

      // getOrganizationInvite
      globalServiceContext.dbConnections['sso'].read._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: '00000000-0000-0000-0000-000000000000',
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      // delete application roles
      globalServiceContext.dbConnections['sso'].read._push([]);
      // delete invitation
      globalServiceContext.dbConnections['sso'].write._push([
        {
          organization_invite_id: '00000000-3333-0000-0000-000000000000',
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_id: 7682
        }
      ]);
      // record audit
      globalServiceContext.dbConnections['sso'].read._push([]);
      // remove SCIM connection
      globalServiceContext.dbConnections['sso'].read._push([
        { application_id: '00000000-3333-0000-0000-000000000000' }
      ]);
      globalServiceContext.dbConnections['sso'].read._push([
        {
          id: '00000000-2222-0000-0000-000000000000'
        }
      ]);
      globalServiceContext.dbConnections['sso'].write._push([]);
      globalServiceContext.dbConnections['sso'].write._push([]);

      const input = {
        organizationInviteId: '00000000-3333-0000-0000-000000000000'
      };

      try {
        res = await bll.deleteOrganizationInvite(context, input);
      } catch (e) {
        err = e;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(res.id).toEqual('00000000-3333-0000-0000-000000000000');
      expect(res.message).toEqual('Invitation deleted');
    });
  });

  describe('#validateSeatLimit', function () {
    let context = {};
    let mockServiceContext;
    let bll;

    beforeAll(() => {
      mockServiceContext = createMockServiceContext();
      bll = createBll(mockServiceContext);
    });

    const email = 'test@veritone.com';
    it('should not throw if isValid is true', async function () {
      const orgId = '7682';
      httpCallMock.mockResolvedValueOnce({
        isValid: true,
        seatLimit: 5
      });

      await expect(
        bll.validateSeatLimit(orgId, email, context, '123')
      ).resolves.not.toThrow();
    });

    it('should throw when isValid is false', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: false,
        seatLimit: 2
      });

      await expect(bll.validateSeatLimit(7682, email, context)).rejects.toThrow(
        /seat limit exceeded/i
      );
    });

    it('should throw when false to check seat limit', async function () {
      httpCallMock.mockRejectedValue(new Error('Email not found: undefined'));

      await expect(bll.validateSeatLimit(7682, '', context)).rejects.toThrow(
        /Email not found/i
      );
    });

    it('should throw with approve-specific message when action is approve', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: false,
        seatLimit: 2
      });

      await expect(
        bll.validateSeatLimit(7682, email, context, 'approve')
      ).rejects.toThrow(/Cannot approve this invitation/i);
    });

    it('should throw with invite-specific message when action is invite', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: false,
        seatLimit: 2
      });

      await expect(
        bll.validateSeatLimit(7682, email, context, 'invite')
      ).rejects.toThrow(/Cannot invite new users/i);
    });

    it('should default to invite message for unknown actions', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: false,
        seatLimit: 2
      });

      await expect(
        bll.validateSeatLimit(7682, email, context, 'unknown-action')
      ).rejects.toThrow(/Cannot invite new users/i);
    });

    it('should throw with resend-specific message when action is resend', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: false,
        seatLimit: 2
      });

      await expect(
        bll.validateSeatLimit(7682, email, context, 'resend')
      ).rejects.toThrow(/Cannot resend this invitation/i);
    });

    it('should default to invite message for unknown actions', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: false,
        seatLimit: 2
      });

      await expect(
        bll.validateSeatLimit(7682, email, context, 'unknown-action')
      ).rejects.toThrow(/Cannot invite new users/i);
    });
  });
});
