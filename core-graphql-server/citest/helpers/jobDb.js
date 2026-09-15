// Direct postgres reads for citest assertions on columns that are not
// exposed via the public graphql schema. Use sparingly — prefer graphql
// when the field is queryable. The audit-log citests use the same `pg`
// client pattern (see citest/local-docker/helpers.auditLog.js).

const { Client } = require('pg');
const helpers = require('./index');
const config = helpers.config;

const POSTGRES_HOST = config.postgres_url || 'localhost';

async function withClient(database, fn) {
  const client = new Client({
    connectionString: `postgres://postgres:postgres@${POSTGRES_HOST}:5432/${database}?sslmode=disable`
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Returns content_application_id for a given job id, by querying
 * platform.job_new.job directly. Used by VE-21424 regression citest because
 * the Job graphql type does not expose contentApplicationId.
 */
async function getJobContentApplicationId(jobId) {
  return withClient('platform', async (client) => {
    const res = await client.query(
      'SELECT content_application_id FROM job_new.job WHERE job_id = $1',
      [jobId]
    );
    if (!res.rows.length) {
      throw new Error(`Job not found in job_new.job: ${jobId}`);
    }
    return res.rows[0].content_application_id;
  });
}

/**
 * Returns log for a given chat id, by querying
 * structured_data.public.llm_gateway_log_buffer directly.
 */
async function getLlmGatewayLogBuffer(chatId) {
  return withClient('structured_data', async (client) => {
    const res = await client.query(
      'SELECT * FROM public.llm_gateway_log_buffer WHERE log_data LIKE $1',
      [`%${chatId}%`]
    );
    if (!res.rows.length) {
      throw new Error(
        `Chat not found in structured_data.public.llm_gateway_log_buffer: ${chatId}`
      );
    }
    return res.rows[0];
  });
}

/**
 * Simulates a pre-migration ("legacy") OIDC provider by nulling out
 * external_credential_id directly in the DB. There is no GraphQL/admin
 * mutation for this — every provider created through the API already gets an
 * external_credential_id at creation time (VE-11385 / PR 2938) — so this is
 * the only way to reproduce the state the ciper-oidc eventing handler (PR
 * 2928) targets. Used by the "Bucket A - Item 6" citest in openid.spec.js.
 */
async function clearOpenIdExternalCredentialId(connectId) {
  return withClient('sso', async (client) => {
    await client.query(
      'UPDATE sso_openid_connect SET external_credential_id = NULL WHERE connect_id = $1',
      [connectId]
    );
  });
}

/**
 * Reads external_credential_id for a provider directly from the DB. The
 * GraphQL OpenIdProvider.externalCredentialId field could be used instead,
 * but a direct read avoids any doubt about resolver-level caching when
 * asserting the null -> populated transition right after emitting the event.
 */
async function getOpenIdExternalCredentialId(connectId) {
  return withClient('sso', async (client) => {
    const res = await client.query(
      'SELECT external_credential_id FROM sso_openid_connect WHERE connect_id = $1',
      [connectId]
    );
    if (!res.rows.length) {
      throw new Error(`OpenID connect not found: ${connectId}`);
    }
    return res.rows[0].external_credential_id;
  });
}

module.exports = {
  getJobContentApplicationId,
  getLlmGatewayLogBuffer,
  clearOpenIdExternalCredentialId,
  getOpenIdExternalCredentialId
};
