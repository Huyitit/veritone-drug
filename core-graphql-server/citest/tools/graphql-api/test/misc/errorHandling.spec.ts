import supertest from 'supertest';

import config from '../../src/config';

/**
 * Transport-level error handling, converted from the legacy
 * citest/errorHandling.spec.js. Deliberately does NOT go through the generated
 * SDK: the point is to post a body the GraphQL server must reject before it ever
 * parses a query, which the typed client cannot express.
 */
const url = config.graphql_url || `https://api.${config.env}.veritone.com/v1`;

/** The subset of the error envelope this spec asserts on. */
interface GraphqlErrorEnvelope {
  errors?: Array<{
    name?: string | null;
    message?: string | null;
  }> | null;
}

describe('citest_misc: Miscellaneous tests', () => {
  describe('bad request', () => {
    it('return error on invalid content type', async () => {
      const result = await supertest(url)
        .post('')
        .send(`{ "query": "query { me { id }}"}`)
        .set({ 'Content-Type': 'application/octet-stream' })
        .expect(400);

      const body: GraphqlErrorEnvelope = result.body ?? {};
      const firstError = body.errors?.[0] ?? null;
      expect(firstError).not.toBeNull();
      expect(firstError?.name).toEqual('invalid_input');
      expect(firstError?.message).toBeDefined();

      expect(result.headers).toHaveProperty('veritone-correlation-id');
      expect(result.headers).toHaveProperty('veritone-request-id');
      expect(result.headers).toHaveProperty('veritone-service-ip');
      expect(result.headers).toHaveProperty('veritone-build-info');
    });
  });
});
