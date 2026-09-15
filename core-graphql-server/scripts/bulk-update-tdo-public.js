require('dotenv').config();
const _ = require('lodash');
const request = require('request-promise');
const devGraphiqlToken = 'USE SUPER TOKEN';
const env = 'aws-prod'; // aws-dev | aws-stage | aws-prod
// aws-prod's real hostname has no "aws-" prefix (api.us-1.veritone.com); aws-dev/aws-stage route correctly as-is.
const graphqlUrl =
  env === 'aws-prod'
    ? 'https://api.us-1.veritone.com/v3/graphql?'
    : `https://api.${env}.veritone.com/v3/graphql?`;
const config = require('../server.json');
const pgp = require('pg-promise')({ promiseLib: Promise });
const dbConfig = require('pg-connection-string').parse(
  config.db.media_platform.read
);
dbConfig.max = 1;
const db = pgp(dbConfig);

async function updateTDO(id, isPublic) {
  console.log(`Updating TDO ${id}`);
  const query = `
  mutation($id: ID!, $isPublic: Boolean) {
    updateTDO(input: {
      id: $id,
      isPublic: $isPublic
    }) {
      id
      security {
        global
      }
    }
  }
`;
  const variables = { id, isPublic };
  const options = {
    method: 'POST',
    uri: graphqlUrl,
    headers: {
      authorization: `Bearer ${devGraphiqlToken}`,
      'content-type': 'application/json'
    },
    body: {
      query,
      variables
    },
    json: true
  };
  const response = await request(options);
  if (response.errors) {
    throw Error(JSON.stringify(response.errors));
  }
  return _.get(response, 'data.updateTDO');
}

async function getTDOs(sourceId) {
  const startDate = new Date('2018-10-18');
  let offset = 0;
  let sql = `SELECT media_id FROM media WHERE
   media_source_id = $1 AND media_start_time > $2 AND is_public = false LIMIT 10 OFFSET $3`;
  let rows = await db.map(
    sql,
    [sourceId, startDate, offset],
    row => row.media_id
  );
  const results = rows;
  while (rows.length === 10) {
    offset += 10;
    rows = await db.map(
      sql,
      [sourceId, startDate, offset],
      row => row.media_id
    );
    results.push(...rows);
  }
  return results;
}

const sources = ['19116'];

sources.map(async sourceId => {
  try {
    const tdos = await getTDOs(sourceId);
    for (const tdoId of tdos) {
      await updateTDO(tdoId, true);
    }
    console.log(`Updated ${tdos.length} tdos for source: ${sourceId}`);
  } catch (e) {
    console.log(`Failed to update all tdos for source: ${sourceId}`, e);
  }
});
