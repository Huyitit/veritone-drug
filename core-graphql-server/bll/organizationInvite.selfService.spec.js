const { eventsMap } = require('@veritone/core-server-base/events-map.js');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const {
  JWT_ISSUER_CORE_GRAPHQL_SERVER,
  JWT_AUDIENCE_CORE_ADMIN_SERVER,
  JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_REGISTRATION_REVIEW,
  JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_EMAIL_VERIFICATION
} = require('@veritone/functional-permissions-lib/shared-jwt.js');

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

const APP_ROLE = {
  applicationId: 'c6aeb2eb-816f-46de-b57c-4704716d3080',
  roleId: 'c6aeb2eb-816f-46de-b57c-4704716d3080'
};

function buildSelfServiceArgs(overrides = {}) {
  return {
    input: {
      email: 'selfservice@example.com',
      organizationId: 1000,
      applicationRoles: [APP_ROLE],
      message: 'Request to join',
      requestToJoinOrganization: true,
      ...overrides
    }
  };
}

function tokenQueryParam(urlString) {
  return new URL(urlString).searchParams.get('token');
}

describe('organizationInvite BLL — createOrganizationInvite (self-service / request-to-join)', () => {
  // Built once and reused across tests (full serviceContext construction is
  // expensive - ~35 DAL/BLL modules + caches). Every field these tests touch
  // (dbConnections, messageUtil, bll.notification, and each dal.* used below)
  // is unconditionally reassigned fresh in beforeEach regardless, so sharing
  // the base context introduces no cross-test leakage.
  const mockSvcContext = createMockServiceContext();
  let bll;

  beforeEach(() => {
    mockSvcContext.dbConnections = {
      sso: {
        write: {
          tx: jest.fn(async (_name, cb) => await cb({}))
        }
      }
    };

    mockSvcContext.bll.notification = { post: jest.fn().mockResolvedValue() };
    mockSvcContext.dal.notification = {
      sendEmailTemplate: jest.fn().mockResolvedValue()
    };
    mockSvcContext.messageUtil = {
      emitPublicEvent: jest.fn().mockResolvedValue(),
      buildActionInfo: jest.fn().mockReturnValue({ actionDetails: 'test' })
    };

    mockSvcContext.dal.organizationInvite.cleanExpiredInvites = jest
      .fn()
      .mockResolvedValue();
    mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest
      .fn()
      .mockResolvedValue([]);
    mockSvcContext.dal.organizationInvite.updateOrganizationInvite = jest
      .fn()
      .mockResolvedValue({});
    mockSvcContext.dal.organizationInvite.validateApplicationRolesExist = jest
      .fn()
      .mockResolvedValue();

    mockSvcContext.dal.application.getAppIdFromOrgId = jest
      .fn()
      .mockResolvedValue('org-guid');
    mockSvcContext.dal.admin.allowedToUpdateOrganization = jest
      .fn()
      .mockResolvedValue(true);
    mockSvcContext.dal.admin.getUsersByEmail = jest.fn().mockResolvedValue([]);
    mockSvcContext.dal.admin.getOrganizationGuidsForUser = jest
      .fn()
      .mockResolvedValue([]);

    mockSvcContext.dal.organization = {
      getOrganization: jest
        .fn()
        .mockResolvedValue({ organizationName: 'Test Org' })
    };

    mockSvcContext.dal.user = {
      getOrgAdminUsers: jest.fn().mockResolvedValue([])
    };

    httpCallMock.mockResolvedValue({ isValid: true });

    bll = createBll(mockSvcContext);
  });

  describe('needsConfirmation and DAL input', () => {
    beforeEach(() => {
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'new-invite-id',
          organizationId: 1000,
          status: 'submitted',
          email: 'selfservice@example.com',
          userId: 'placeholder-user-id'
        });
    });

    it('passes needsConfirmation false when disableAutoApproval is omitted (open registration)', async () => {
      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(ctx, buildSelfServiceArgs());

      expect(
        mockSvcContext.dal.organizationInvite.createOrganizationInvite
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            needsConfirmation: false,
            inviteType: 'selfSignup'
          })
        }),
        expect.anything()
      );
    });

    it('passes needsConfirmation true when disableAutoApproval is true', async () => {
      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({ disableAutoApproval: true })
      );

      expect(
        mockSvcContext.dal.organizationInvite.createOrganizationInvite
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            needsConfirmation: true,
            inviteType: 'selfSignup'
          })
        }),
        expect.anything()
      );
    });

    it('passes needsConfirmation false when disableAutoApproval is explicitly false', async () => {
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'auto-approved-id',
          organizationId: 1000,
          status: 'approved',
          email: 'selfservice@example.com',
          userId: 'placeholder-user-id'
        });

      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({ disableAutoApproval: false })
      );

      expect(
        mockSvcContext.dal.organizationInvite.createOrganizationInvite
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            needsConfirmation: false,
            inviteType: 'selfSignup'
          })
        }),
        expect.anything()
      );
    });
  });

  describe('notifications when invite is submitted (pending admin approval)', () => {
    beforeEach(() => {
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'pending-invite-id',
          organizationId: 1000,
          status: 'submitted',
          email: 'selfservice@example.com',
          userId: 'new-user-id'
        });
    });

    it('emails each org admin with admin-action template and invitee with under-review template', async () => {
      mockSvcContext.dal.user.getOrgAdminUsers = jest.fn().mockResolvedValue([
        { userName: 'admin-one@test.com', userId: 'admin-1' },
        { userName: 'admin-two@test.com', userId: 'admin-2' }
      ]);

      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({ disableAutoApproval: true })
      );

      const sends =
        mockSvcContext.dal.notification.sendEmailTemplate.mock.calls;
      const adminSends = sends.filter(
        (c) =>
          c[1].templateName === 'self-service-org-invite-admin-action'
      );
      expect(adminSends).toHaveLength(2);
      adminSends.forEach((call) => {
        expect(call[1].mergeLanguage).toBe('handlebars');
        const { mergeKvp } = call[1];
        expect(mergeKvp.organization_name).toBe('Test Org');
        expect(mergeKvp.url_privacy_policy).toEqual(expect.any(String));
        expect(mergeKvp.url_term_service).toEqual(expect.any(String));
        expect(mergeKvp.admin_action_token).toEqual(expect.any(String));
        expect(mergeKvp.invitee_email).toBe('selfservice@example.com');
        const approveUrl = mergeKvp.desktop_url_approve;
        const denyUrl = mergeKvp.desktop_url_deny;
        expect(approveUrl).toMatch(/^https:\/\//);
        expect(approveUrl).not.toMatch(/^https:\/\/login\./);
        expect(approveUrl).toContain('ui/auth/signup/review');
        expect(approveUrl).toMatch(/[?&]action=approve(&|$)/);
        expect(tokenQueryParam(approveUrl)).toBe(mergeKvp.admin_action_token);
        expect(denyUrl).toMatch(/^https:\/\//);
        expect(denyUrl).not.toMatch(/^https:\/\/login\./);
        expect(denyUrl).toContain('ui/auth/signup/review');
        expect(denyUrl).toMatch(/[?&]action=deny(&|$)/);
        expect(tokenQueryParam(denyUrl)).toBe(mergeKvp.admin_action_token);
      });

      const underReview = sends.find(
        (c) =>
          c[1].templateName === 'self-service-org-invite-under-review'
      );
      expect(underReview).toBeDefined();
      expect(underReview[1].mergeLanguage).toBe('handlebars');
      expect(underReview[1].mergeKvp).toMatchObject({
        organization_name: 'Test Org',
        invitee_email: 'selfservice@example.com',
        url_privacy_policy: expect.any(String),
        url_term_service: expect.any(String)
      });
      expect(underReview[1].toEmailAddress).toBe('selfservice@example.com');

      expect(mockSvcContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        eventsMap.OrganizationRequest.name,
        'system',
        ctx,
        expect.objectContaining({
          organizationId: 1000,
          requestEmail: 'selfservice@example.com'
        })
      );
    });

    it('skips admin-action emails when there are no org admins but still emails invitee and emits event', async () => {
      mockSvcContext.dal.user.getOrgAdminUsers = jest.fn().mockResolvedValue([]);

      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({ disableAutoApproval: true })
      );

      const sends =
        mockSvcContext.dal.notification.sendEmailTemplate.mock.calls;
      expect(
        sends.some(
          (c) => c[1].templateName === 'self-service-org-invite-admin-action'
        )
      ).toBe(false);

      const underReview = sends.find(
        (c) =>
          c[1].templateName === 'self-service-org-invite-under-review'
      );
      expect(underReview).toBeDefined();
      expect(underReview[1].mergeLanguage).toBe('handlebars');
      expect(underReview[1].mergeKvp).toMatchObject({
        organization_name: 'Test Org',
        invitee_email: 'selfservice@example.com',
        url_privacy_policy: expect.any(String),
        url_term_service: expect.any(String)
      });

      expect(mockSvcContext.messageUtil.emitPublicEvent).toHaveBeenCalledWith(
        eventsMap.OrganizationRequest.name,
        'system',
        ctx,
        expect.anything()
      );
    });

  });

  describe('notifications when invite is auto-approved (disableAutoApproval false)', () => {
    beforeEach(() => {
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'approved-invite-id',
          organizationId: 1000,
          status: 'approved',
          email: 'selfservice@example.com',
          userId: 'new-user-id'
        });
    });

    it('sends self-service email verification with verify_url (JWT in query) and legal merge fields', async () => {
      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({ disableAutoApproval: false })
      );

      const verification = mockSvcContext.dal.notification.sendEmailTemplate.mock.calls.find(
        (c) =>
          c[1].templateName === 'self-service-org-invite-email-verification'
      );
      expect(verification).toBeDefined();
      expect(verification[1].mergeLanguage).toBe('handlebars');
      const { mergeKvp } = verification[1];
      expect(mergeKvp.organization_name).toBe('Test Org');
      expect(mergeKvp.url_privacy_policy).toEqual(expect.any(String));
      expect(mergeKvp.url_term_service).toEqual(expect.any(String));
      expect(mergeKvp.email_verification_token).toBeUndefined();
      const verifyUrl = mergeKvp.verify_url;
      expect(verifyUrl).toMatch(/^https:\/\//);
      expect(verifyUrl).not.toMatch(/^https:\/\/login\./);
      expect(verifyUrl).toContain('ui/auth/signup/verify');
      const verifyToken = tokenQueryParam(verifyUrl);
      expect(verifyToken).toEqual(expect.any(String));
      expect(verifyToken.length).toBeGreaterThan(0);
      expect(verification[1].toEmailAddress).toBe('selfservice@example.com');

      expect(mockSvcContext.messageUtil.emitPublicEvent).not.toHaveBeenCalled();
    });

    it('omitting disableAutoApproval uses email verification path same as explicit false', async () => {
      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(ctx, buildSelfServiceArgs());

      const verification = mockSvcContext.dal.notification.sendEmailTemplate.mock.calls.find(
        (c) =>
          c[1].templateName === 'self-service-org-invite-email-verification'
      );
      expect(verification).toBeDefined();
      expect(verification[1].mergeLanguage).toBe('handlebars');
      expect(verification[1].mergeKvp.email_verification_token).toBeUndefined();
      expect(verification[1].mergeKvp.organization_name).toBe('Test Org');
      const verifyUrl = verification[1].mergeKvp.verify_url;
      expect(verifyUrl).toMatch(/^https:\/\//);
      expect(verifyUrl).toContain('ui/auth/signup/verify');
      expect(tokenQueryParam(verifyUrl)).toEqual(expect.any(String));
    });
  });

  describe('prior invite rejection (self-service)', () => {
    beforeEach(() => {
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'new-id',
          organizationId: 1000,
          status: 'submitted'
        });
    });

    it('throws NotAllowed when the latest invite was rejected and the requestor is not privileged', async () => {
      const nonAdminContext = mockUtil.makeContext();
      nonAdminContext._authInfo.permissionMasks = [];
      nonAdminContext._authInfo.organization.organizationId = 999;

      mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest
        .fn()
        .mockResolvedValue([
          { organizationInviteId: 'old-rejected', status: 'rejected' }
        ]);

      await expect(
        bll.createOrganizationInvite(
          nonAdminContext,
          buildSelfServiceArgs()
        )
      ).rejects.toThrow(
        "This user's invitation was previously rejected by an administrator. Please contact an administrator for assistance."
      );
    });
  });

  describe('request-to-join idempotent replay (same registration + pending invite)', () => {
    const REG_ID = '11111111-1111-1111-1111-111111111111';
    const existingSubmitted = {
      organizationInviteId: 'existing-invite-id',
      organizationId: 1000,
      status: 'submitted',
      email: 'selfservice@example.com',
      userDetails: JSON.stringify({ customRegistrationId: REG_ID })
    };

    it('returns the latest pending invite without create, update, or email', async () => {
      mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest
        .fn()
        .mockResolvedValue([existingSubmitted]);
      const createSpy = jest.fn();
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = createSpy;
      const updateSpy = jest.fn();
      mockSvcContext.dal.organizationInvite.updateOrganizationInvite = updateSpy;

      const ctx = mockUtil.makeContext();
      const result = await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({
          disableAutoApproval: true,
          userDetails: {
            customRegistrationId: REG_ID,
            firstName: 'A',
            lastName: 'B',
            hashedPassword: '$2a$hash'
          }
        })
      );

      expect(result.organizationInviteId).toBe('existing-invite-id');
      expect(createSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
      expect(
        mockSvcContext.dal.notification.sendEmailTemplate
      ).not.toHaveBeenCalled();
    });

    it('when customRegistrationId differs, rejects prior submitted invite and creates a new one', async () => {
      mockSvcContext.dal.organizationInvite.getOrganizationInvites = jest
        .fn()
        .mockResolvedValue([existingSubmitted]);
      mockSvcContext.dal.organizationInvite.updateOrganizationInvite = jest
        .fn()
        .mockResolvedValue({});
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'new-invite-id',
          organizationId: 1000,
          status: 'submitted',
          email: 'selfservice@example.com'
        });

      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({
          disableAutoApproval: true,
          userDetails: {
            customRegistrationId: '22222222-2222-2222-2222-222222222222',
            firstName: 'A',
            lastName: 'B',
            hashedPassword: '$2a$hash'
          }
        })
      );

      expect(
        mockSvcContext.dal.organizationInvite.updateOrganizationInvite
      ).toHaveBeenCalled();
      expect(
        mockSvcContext.dal.organizationInvite.createOrganizationInvite
      ).toHaveBeenCalled();
    });
  });

  describe('JWT expiresIn matches organizationInvite config', () => {
    let jwtSignSpy;

    beforeEach(() => {
      _.merge(mockSvcContext.config, {
        organizationInvite: {
          expirationDate: 14,
          adminActionTokenExpirationHours: 72,
          emailVerificationTokenExpirationHours: 48
        }
      });
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'jwt-test-invite',
          organizationId: 1000,
          status: 'submitted',
          email: 'selfservice@example.com',
          userId: 'new-user-id'
        });
      jwtSignSpy = jest.spyOn(jwt, 'sign').mockReturnValue('mock-jwt');
    });

    afterEach(() => {
      jwtSignSpy.mockRestore();
    });

    it('uses adminActionTokenExpirationHours for registration-review tokens', async () => {
      mockSvcContext.dal.user.getOrgAdminUsers = jest.fn().mockResolvedValue([
        { userName: 'admin@test.com', userId: 'admin-1' }
      ]);
      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(
        ctx,
        buildSelfServiceArgs({ disableAutoApproval: true })
      );
      const adminSign = jwtSignSpy.mock.calls.find(
        (c) => c[0] && c[0].purpose === JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_REGISTRATION_REVIEW
      );
      expect(adminSign).toBeDefined();
      expect(adminSign[0].purpose).toBe(JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_REGISTRATION_REVIEW);
      expect(adminSign[2].subject).toBeDefined();
      expect(adminSign[2].issuer).toBe(JWT_ISSUER_CORE_GRAPHQL_SERVER);
      expect(adminSign[2].audience).toBe(JWT_AUDIENCE_CORE_ADMIN_SERVER);
      expect(adminSign[2].expiresIn).toBe('72h');
    });

    it('uses emailVerificationTokenExpirationHours for email-verification tokens', async () => {
      mockSvcContext.dal.organizationInvite.createOrganizationInvite = jest
        .fn()
        .mockResolvedValue({
          organizationInviteId: 'approved-invite-id',
          organizationId: 1000,
          status: 'approved',
          email: 'selfservice@example.com',
          userId: 'new-user-id'
        });
      const ctx = mockUtil.makeContext();
      await bll.createOrganizationInvite(ctx, buildSelfServiceArgs());

      const verifySign = jwtSignSpy.mock.calls.find(
        (c) => c[0] && c[0].purpose === JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_EMAIL_VERIFICATION
      );
      expect(verifySign).toBeDefined();
      expect(verifySign[0].purpose).toBe(JWT_PURPOSE_SELF_SERVICE_ORG_INVITE_EMAIL_VERIFICATION);
      expect(verifySign[2].issuer).toBe(JWT_ISSUER_CORE_GRAPHQL_SERVER);
      expect(verifySign[2].audience).toBe(JWT_AUDIENCE_CORE_ADMIN_SERVER);
      expect(verifySign[2].expiresIn).toBe('48h');
    });
  });
});
