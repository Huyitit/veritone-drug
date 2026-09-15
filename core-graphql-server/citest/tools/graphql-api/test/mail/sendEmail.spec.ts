import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { OrganizationStatus } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

describe('citest_email: sendEmail', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
  });

  afterAll(async () => {
    await safe('delete isolated superadmin org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization({
        input: {
          id: isolatedSuperadmin.orgId,
          status: OrganizationStatus.Deleted
        }
      })
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('should send email with valid input', async () => {
    const res = await gqlClient.sdk.sendEmail({
      input: {
        from: 'example@veritone.com',
        to: 'example@veritone.com',
        subject: 'example',
        message: 'email body',
        replyTo: 'example@veritone.com'
      }
    });

    expect(res.data.sendEmail).toBe(true);
  });

  it('should reject missing "to" field', async () => {
    try {
      const res = await gqlClient.sdk.sendEmail({
        input: {
          from: 'example@veritone.com',
          to: '',
          subject: 'example',
          message: 'email body',
          replyTo: 'example@veritone.com'
        }
      });
      expect(res).toBeUndefined();
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.message).toContain('all input parameters cannot not be empty');
    }
  });

  it('should reject missing "subject"', async () => {
    try {
      const res = await gqlClient.sdk.sendEmail({
        input: {
          from: 'example@veritone.com',
          to: 'example@veritone.com',
          subject: '',
          message: 'email body',
          replyTo: 'example@veritone.com'
        }
      });

      expect(res).toBeUndefined();
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.message).toContain('all input parameters cannot not be empty');
    }
  });

  it('should reject missing "message"', async () => {
    try {
      const res = await gqlClient.sdk.sendEmail({
        input: {
          from: 'example@veritone.com',
          to: 'example@veritone.com',
          subject: 'example',
          message: '',
          replyTo: 'example@veritone.com'
        }
      });

      expect(res).toBeUndefined();
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.message).toContain('all input parameters cannot not be empty');
    }
  });

  it('should fallback to mandrillEmailFromNoReply if replyTo is not provided', async () => {
    const res = await gqlClient.sdk.sendEmail({
      input: {
        from: 'example@veritone.com',
        to: 'example@veritone.com',
        subject: 'example',
        message: 'email body',
        replyTo: ''
      }
    });

    expect(res.data.sendEmail).toBe(true);
  });

  it('should reject if replyTo domain is invalid', async () => {
    try {
      const res = await gqlClient.sdk.sendEmail({
        input: {
          from: 'example@veritone.com',
          to: 'example@veritone.com',
          subject: 'example',
          message: 'email body',
          replyTo: 'spoof@bad-domain.com'
        }
      });

      expect(res).toBeUndefined();
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.message).toContain('replyTo should have veritone.com domain');
    }
  });
});
