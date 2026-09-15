const _ = require('lodash');
const request = require('request-promise');
const { v4: uuidv4 } = require('uuid');

// TODO replace this token
const token = 'Replace with internal token';
const env = 'aws-dev';

const sourceId = null;
const startDate = '2019-01-09';
const stopDate = '2019-01-10';

const graphqlUrl = `https://api.${env}.veritone.com/v3/graphql`;

async function getTDOs(sourceId, startDateTime, stopDateTime) {
  console.log(
    `Getting tdos for ${sourceId} from ${startDateTime} to ${stopDateTime}`
  );
  const query = `query ($sourceId: ID!, $startDateTime: DateTime!, $stopDateTime: DateTime!) {
  temporalDataObjects(
    sourceId: $sourceId,
    dateTimeFilter: [{
    	fromDateTime: $startDateTime,
    	toDateTime: $stopDateTime,
    	field: startDateTime
  	}, {
    	fromDateTime: $startDateTime,
    	toDateTime: $stopDateTime,
    	field: stopDateTime
  	}],
    limit: 100) {
    records {
      id
      startDateTime
      stopDateTime
    }
  }
}`;
  const variables = {
    sourceId,
    startDateTime,
    stopDateTime
  };

  const response = await makeGQLRequest(query, variables);

  return _.get(response, 'data.temporalDataObjects.records');
}

async function makeGQLRequest(query, variables) {
  const params = {
    headers: {
      authorization: `Bearer ${token}`
    },
    method: 'POST',
    url: graphqlUrl,
    json: {
      query,
      variables
    }
  };

  return request(params);
}

async function emitCorrelationEvent(tdoId, sourceId) {
  const query = `mutation {
  emitSystemEvent(input: {
    topic: "events",
    payload: {
      event: "correlate_tdo",
      type: "correlation"
      sender: "graphql-recorrelate-script",
      tdoId: "${tdoId}",
      sourceId: ${sourceId}
    }
  }) {
    id
  }
}`;

  const response = await makeGQLRequest(query, null);

  return _.get(response, 'data.emitSystemEvent.id');
}

async function emitLocalEvent(tdoId, sourceId) {
  return request({
    url: 'http://localhost:4151/pub?topic=CorrelationTopic',
    method: 'POST',
    json: {
      correlationId: uuidv4(),
      event: 'correlate_tdo',
      sourceTypeId: '1',
      sourceId: sourceId,
      tdoId: tdoId,
      timestampMs: Date.now(),
      type: 'correlation'
    }
  });
}

async function run1() {
  if (!sourceId) {
    console.log('Set a valid sourceId to trigger correlation');
    process.exit(0);
  }
  const tdos = await getTDOs(sourceId, startDate, stopDate);
  console.log(`Found ${tdos.length} tdos`);
  for (const tdo of tdos) {
    await emitLocalEvent(tdo.id, sourceId);
  }
}

run1()
  .then(done => {
    console.log('Completed triggering correlation');
  })
  .catch(console.log);
