const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
describe('sendEmail', () => {
  let gqlClient;
  let apiToken;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;
  });

  it('should send email with valid input', async () => {
    const res = await gqlClient.query(`
      mutation sendEmail {
        sendEmail(input: {
          from: "example@veritone.com"
          to: "example@veritone.com"
          subject: "example"
          message: "email body"
          replyTo: "example@veritone.com"
        })
      }
    `);

    expect(res.sendEmail).toBe(true);
  });

  it('should reject missing "to" field', async () => {
    try {
      const res = await gqlClient.query(`
      mutation sendEmail {
        sendEmail(input: {
          from: "example@veritone.com"
          to: ""
          subject: "example"
          message: "email body"
          replyTo: "example@veritone.com"
        })
      }
    `);
      expect(res).toBeUndefined();
    } catch (err) {
      expect(err).toBeDefined();
      expect(err.message).toContain('all input parameters cannot not be empty');
    }
  });

  it('should reject missing "subject"', async () => {
    try {
      const res = await gqlClient.query(`
      mutation sendEmail {
        sendEmail(input: {
          from: "example@veritone.com"
          to: "example@veritone.com"
          subject: ""
          message: "email body"
          replyTo: "example@veritone.com"
        })
      }
    `);

      expect(res).toBeUndefined();
    } catch (err) {
      expect(err).toBeDefined();
      expect(err.message).toContain('all input parameters cannot not be empty');
    }
  });

  it('should reject missing "message"', async () => {
    try {
      const res = await gqlClient.query(`
      mutation sendEmail {
        sendEmail(input: {
          from: "example@veritone.com"
          to: "example@veritone.com",
          subject: "example",
          message: "",
          replyTo: "example@veritone.com"
        })
      }
    `);

      expect(res).toBeUndefined();
    } catch (err) {
      expect(err).toBeDefined();
      expect(err.message).toContain('all input parameters cannot not be empty');
    }
  });

  it('should fallback to mandrillEmailFromNoReply if replyTo is not provided', async () => {
    const res = await gqlClient.query(`
      mutation sendEmail {
        sendEmail(input: {
          from: "example@veritone.com"
          to: "example@veritone.com",
          subject: "example",
          message: "email body",
          replyTo: ""
        })
      }
    `);

    expect(res.sendEmail).toBe(true);
  });

  it('should reject if replyTo domain is invalid', async () => {
    try {
      const res = await gqlClient.query(`
      mutation sendEmail {
        sendEmail(input: {
          from: "example@veritone.com"
          to: "example@veritone.com",
          subject: "example",
          message: "email body",
          replyTo: "spoof@bad-domain.com"
        })
      }
    `);

      expect(res).toBeUndefined();
    } catch (err) {
      expect(err).toBeDefined();
      expect(err.message).toContain('replyTo should have veritone.com domain');
    }
  });
});
