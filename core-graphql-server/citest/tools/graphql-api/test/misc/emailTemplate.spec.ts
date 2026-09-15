import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { TemplateLanguage } from '../../src/gql';

/**
 * Email template CRUD + validation, converted from the legacy
 * citest/emailTemplate.spec.js. Every operation here is superadmin-scoped.
 */

/** The shared citest superadmin's own organization guid (Veritone, Inc.). */
const orgGuid = 'ed075985-bc94-406b-8639-44d1da42c3fb';
const unixStamp = Math.floor(Date.now() / 1000);

const templateCode = 'Hello {{firstName}}';
const templateDefaultArgs = { firstName: 'World' };
const updatedCode = 'Hello {{firstName}}, welcome to {{productName}}';
const updatedDefaultArgs = { firstName: 'World', productName: 'aiWARE' };

describe('citest_emailTemplate: email template tests', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
  });

  describe('no organizationGuid (global template)', () => {
    const emailTemplateId = `email-template-${unixStamp}`;

    it('creates an email template', async () => {
      const result = await gqlClient.sdk.emailTemplateCreate({
        input: {
          id: emailTemplateId,
          code: templateCode,
          lang: TemplateLanguage.Handlebars,
          defaultSubject: 'Welcome',
          defaultFromName: 'aiWARE',
          defaultArgs: templateDefaultArgs
        }
      });
      const created = result?.data?.emailTemplateCreate ?? null;

      expect(created?.id).toEqual(emailTemplateId);
      expect(created?.code).toEqual(templateCode);
      expect(created?.lang).toEqual(TemplateLanguage.Handlebars);
      expect(created?.organizationGuid).toBeNull();
    });

    it('updates an email template', async () => {
      const result = await gqlClient.sdk.emailTemplateUpdate({
        input: {
          id: emailTemplateId,
          code: updatedCode,
          lang: TemplateLanguage.Handlebars,
          defaultSubject: 'Updated Welcome',
          defaultFromName: 'aiWARE',
          defaultArgs: updatedDefaultArgs
        }
      });
      const updated = result?.data?.emailTemplateUpdate ?? null;

      expect(updated?.id).toEqual(emailTemplateId);
      expect(updated?.code).toEqual(updatedCode);
      expect(updated?.defaultSubject).toEqual('Updated Welcome');
      expect(updated?.organizationGuid).toBeNull();
    });

    it('fetches an email template', async () => {
      const result = await gqlClient.sdk.emailTemplateGet({
        id: emailTemplateId
      });
      const fetched = result?.data?.emailTemplateGet ?? null;

      expect(fetched?.id).toEqual(emailTemplateId);
      expect(fetched?.code).toEqual(updatedCode);
      expect(fetched?.organizationGuid).toBeNull();
    });

    it('cannot be deleted because deletion requires an organizationGuid', async () => {
      /**
       * A global template has a null organization_guid. emailTemplateDelete
       * requires a non-null organizationGuid and matches the row on it, so a
       * global template can never be matched and therefore never deleted through
       * this mutation. This test documents that limitation. See the
       * emailTemplateDelete schema doc comment.
       */
      await expect(
        gqlClient.sdk.emailTemplateDelete({
          id: emailTemplateId,
          organizationGuid: orgGuid
        })
      ).rejects.toThrow('deletion was not successful');
    });
  });

  describe('happy path — with organizationGuid', () => {
    const emailTemplateWithOrgId = `email-template-org-${unixStamp}`;

    it('creates an email template scoped to an organization', async () => {
      const result = await gqlClient.sdk.emailTemplateCreate({
        input: {
          id: emailTemplateWithOrgId,
          code: templateCode,
          lang: TemplateLanguage.Handlebars,
          defaultSubject: 'Welcome',
          defaultFromName: 'aiWARE',
          defaultArgs: templateDefaultArgs,
          organizationGuid: orgGuid
        }
      });
      const created = result?.data?.emailTemplateCreate ?? null;

      expect(created?.id).toEqual(emailTemplateWithOrgId);
      expect(created?.organizationGuid).toEqual(orgGuid);
    });

    it('updates an org-scoped email template', async () => {
      /**
       * Exercises the org-scoped update path
       * (WHERE ... AND organization_guid = $N). organizationGuid must be supplied
       * so the update resolves the right row.
       */
      const result = await gqlClient.sdk.emailTemplateUpdate({
        input: {
          id: emailTemplateWithOrgId,
          code: updatedCode,
          lang: TemplateLanguage.Handlebars,
          defaultSubject: 'Updated Welcome',
          defaultFromName: 'aiWARE',
          defaultArgs: updatedDefaultArgs,
          organizationGuid: orgGuid
        }
      });
      const updated = result?.data?.emailTemplateUpdate ?? null;

      expect(updated?.id).toEqual(emailTemplateWithOrgId);
      expect(updated?.code).toEqual(updatedCode);
      expect(updated?.defaultSubject).toEqual('Updated Welcome');
      expect(updated?.organizationGuid).toEqual(orgGuid);
    });

    it('fetches an email template by organizationGuid', async () => {
      const result = await gqlClient.sdk.emailTemplateGet({
        id: emailTemplateWithOrgId,
        organizationGuid: orgGuid
      });
      const fetched = result?.data?.emailTemplateGet ?? null;

      expect(fetched?.id).toEqual(emailTemplateWithOrgId);
      expect(fetched?.organizationGuid).toEqual(orgGuid);
    });

    it('deletes an org-scoped email template', async () => {
      const result = await gqlClient.sdk.emailTemplateDelete({
        id: emailTemplateWithOrgId,
        organizationGuid: orgGuid
      });

      expect(result?.data?.emailTemplateDelete?.id).toBeDefined();
    });
  });

  describe('validation errors', () => {
    it('rejects a Handlebars template with invalid syntax', async () => {
      await expect(
        gqlClient.sdk.emailTemplateCreate({
          input: {
            id: `test-invalid-syntax-${unixStamp}`,
            code: '{{#if user}} Hello {{user.name}}',
            lang: TemplateLanguage.Handlebars,
            defaultSubject: 'test',
            defaultFromName: 'test',
            defaultArgs: { user: { name: 'Test' } }
          }
        })
      ).rejects.toThrow('Invalid Handlebars template');
    });

    it('rejects a Handlebars template that has a variable missing from defaultArgs', async () => {
      await expect(
        gqlClient.sdk.emailTemplateCreate({
          input: {
            id: `test-missing-default-${unixStamp}`,
            code: 'Hello {{firstName}}',
            lang: TemplateLanguage.Handlebars,
            defaultSubject: 'test',
            defaultFromName: 'test'
          }
        })
      ).rejects.toThrow(
        'All template variables must have a corresponding defaultArg'
      );
    });
  });
});
