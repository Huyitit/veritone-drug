const helpers = require('./helpers/index');
const GraphqlClient = require('./helpers/gql.js');
const config = helpers.config;
const moment = require('moment');

describe('citest_emailTemplate: email template tests', () => {
  let gqlClient;
  let emailTemplateId;
  let emailTemplateWithOrgId;

  const orgGuid = 'ed075985-bc94-406b-8639-44d1da42c3fb';

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  describe('no organizationGuid (global template)', () => {
    const templateCode = 'Hello {{firstName}}';
    const templateDefaultArgs = { firstName: 'World' };
    const updatedCode = 'Hello {{firstName}}, welcome to {{productName}}';
    const updatedDefaultArgs = { firstName: 'World', productName: 'aiWARE' };

    it('creates an email template', async () => {
      emailTemplateId = 'email-template-' + moment().unix();
      // defaultArgs is a JSONData scalar; pass it as a variable rather than inlining
      // JSON.stringify output, which emits quoted object keys ({"firstName":...}) that
      // are not valid GraphQL input-object syntax and get rejected as a 400.
      const result = await gqlClient.query(
        `
        mutation ($defaultArgs: JSONData) {
          emailTemplateCreate(input: {
            id: "${emailTemplateId}"
            code: "${templateCode}"
            lang: Handlebars
            defaultSubject: "Welcome"
            defaultFromName: "aiWARE"
            defaultArgs: $defaultArgs
          }) {
            id
            code
            lang
            defaultSubject
            defaultFromName
            organizationGuid
          }
        }
      `,
        { defaultArgs: templateDefaultArgs }
      );
      expect(result.emailTemplateCreate.id).toEqual(emailTemplateId);
      expect(result.emailTemplateCreate.code).toEqual(templateCode);
      expect(result.emailTemplateCreate.lang).toEqual('Handlebars');
      expect(result.emailTemplateCreate.organizationGuid).toBeNull();
    });

    it('updates an email template', async () => {
      const result = await gqlClient.query(
        `
        mutation ($defaultArgs: JSONData) {
          emailTemplateUpdate(input: {
            id: "${emailTemplateId}"
            code: "${updatedCode}"
            lang: Handlebars
            defaultSubject: "Updated Welcome"
            defaultFromName: "aiWARE"
            defaultArgs: $defaultArgs
          }) {
            id
            code
            defaultSubject
            organizationGuid
          }
        }
      `,
        { defaultArgs: updatedDefaultArgs }
      );
      expect(result.emailTemplateUpdate.id).toEqual(emailTemplateId);
      expect(result.emailTemplateUpdate.code).toEqual(updatedCode);
      expect(result.emailTemplateUpdate.defaultSubject).toEqual('Updated Welcome');
      expect(result.emailTemplateUpdate.organizationGuid).toBeNull();
    });

    it('fetches an email template', async () => {
      const result = await gqlClient.query(`
        query {
          emailTemplateGet(id: "${emailTemplateId}") {
            id
            code
            defaultSubject
            organizationGuid
          }
        }
      `);
      expect(result.emailTemplateGet.id).toEqual(emailTemplateId);
      expect(result.emailTemplateGet.code).toEqual(updatedCode);
      expect(result.emailTemplateGet.organizationGuid).toBeNull();
    });

    it('cannot be deleted because deletion requires an organizationGuid', async () => {
      // A global template has a null organization_guid. emailTemplateDelete requires a
      // non-null organizationGuid and matches the row on it, so a global template can
      // never be matched and therefore never deleted through this mutation. This test
      // documents that limitation. See the emailTemplateDelete schema doc comment.
      await expect(() =>
        gqlClient.query(`
          mutation {
            emailTemplateDelete(id: "${emailTemplateId}", organizationGuid: "${orgGuid}") {
              id
            }
          }
        `)
      ).rejects.toThrow('deletion was not successful');
    });
  });

  describe('happy path — with organizationGuid', () => {
    const templateCode = 'Hello {{firstName}}';
    const templateDefaultArgs = { firstName: 'World' };
    const updatedCode = 'Hello {{firstName}}, welcome to {{productName}}';
    const updatedDefaultArgs = { firstName: 'World', productName: 'aiWARE' };

    it('creates an email template scoped to an organization', async () => {
      emailTemplateWithOrgId = 'email-template-org-' + moment().unix();
      const result = await gqlClient.query(
        `
        mutation ($defaultArgs: JSONData) {
          emailTemplateCreate(input: {
            id: "${emailTemplateWithOrgId}"
            code: "${templateCode}"
            lang: Handlebars
            defaultSubject: "Welcome"
            defaultFromName: "aiWARE"
            defaultArgs: $defaultArgs
            organizationGuid: "${orgGuid}"
          }) {
            id
            code
            organizationGuid
          }
        }
      `,
        { defaultArgs: templateDefaultArgs }
      );
      expect(result.emailTemplateCreate.id).toEqual(emailTemplateWithOrgId);
      expect(result.emailTemplateCreate.organizationGuid).toEqual(orgGuid);
    });

    it('updates an org-scoped email template', async () => {
      // Exercises the org-scoped update path (WHERE ... AND organization_guid = $N).
      // organizationGuid must be supplied so the update resolves the right row.
      const result = await gqlClient.query(
        `
        mutation ($defaultArgs: JSONData) {
          emailTemplateUpdate(input: {
            id: "${emailTemplateWithOrgId}"
            code: "${updatedCode}"
            lang: Handlebars
            defaultSubject: "Updated Welcome"
            defaultFromName: "aiWARE"
            defaultArgs: $defaultArgs
            organizationGuid: "${orgGuid}"
          }) {
            id
            code
            defaultSubject
            organizationGuid
          }
        }
      `,
        { defaultArgs: updatedDefaultArgs }
      );
      expect(result.emailTemplateUpdate.id).toEqual(emailTemplateWithOrgId);
      expect(result.emailTemplateUpdate.code).toEqual(updatedCode);
      expect(result.emailTemplateUpdate.defaultSubject).toEqual('Updated Welcome');
      expect(result.emailTemplateUpdate.organizationGuid).toEqual(orgGuid);
    });

    it('fetches an email template by organizationGuid', async () => {
      const result = await gqlClient.query(`
        query {
          emailTemplateGet(id: "${emailTemplateWithOrgId}", organizationGuid: "${orgGuid}") {
            id
            organizationGuid
          }
        }
      `);
      expect(result.emailTemplateGet.id).toEqual(emailTemplateWithOrgId);
      expect(result.emailTemplateGet.organizationGuid).toEqual(orgGuid);
    });

    it('deletes an org-scoped email template', async () => {
      const result = await gqlClient.query(`
        mutation {
          emailTemplateDelete(id: "${emailTemplateWithOrgId}", organizationGuid: "${orgGuid}") {
            id
          }
        }
      `);
      expect(result.emailTemplateDelete.id).toBeDefined();
    });
  });

  describe('validation errors', () => {
    it('rejects a Handlebars template with invalid syntax', async () => {
      const id = 'test-invalid-syntax-' + moment().unix();
      await expect(() =>
        gqlClient.query(`
          mutation {
            emailTemplateCreate(input: {
              id: "${id}"
              code: "{{#if user}} Hello {{user.name}}"
              lang: Handlebars
              defaultSubject: "test"
              defaultFromName: "test"
              defaultArgs: {user: {name: "Test"}}
            }) { id }
          }
        `)
      ).rejects.toThrow('Invalid Handlebars template');
    });

    it('rejects a Handlebars template that has a variable missing from defaultArgs', async () => {
      const id = 'test-missing-default-' + moment().unix();
      await expect(() =>
        gqlClient.query(`
          mutation {
            emailTemplateCreate(input: {
              id: "${id}"
              code: "Hello {{firstName}}"
              lang: Handlebars
              defaultSubject: "test"
              defaultFromName: "test"
            }) { id }
          }
        `)
      ).rejects.toThrow('All template variables must have a corresponding defaultArg');
    });
  });
});
