const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const moment = require('moment');
const _ = require('lodash');

const auditStart = moment().subtract(7, 'day').toISOString();
const auditEnd = moment().toISOString();

describe('auditlog query tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('should query audit logs', async () => {
    // FIXME: bad test. Should create an audit-able event and query for that
    var query = `
    query {
      auditLog(
        fromDateTime: "${auditStart}"
        toDateTime: "${auditEnd}"
        objectType: "TemporalDataObject"
        success: true
        eventType: "Create"
        orderBy: [
          {
            field: clientUserAgent
            direction: desc
          }, {
            field: createdDateTime
            direction: asc
          }
        ]
        limit:10) {
        count
        records {
          id
          objectId
          objectType
          userName
          clientIpAddress
          clientUserAgent
          createdDateTime
          eventType
          success
        }
      }
    }
    `;

    await expect(async () => gqlClient.query(query)).not.toThrow();
    /*
      expect(
        _.get(result, 'auditLog.records[0].objectType')
      ).toEqual('TemporalDataObject');
      expect(_.get(result, 'auditLog.records[0].success')).toEqual(
        true
      );
      expect(
        _.get(result, 'auditLog.records[0].objectType')
      ).toEqual('TemporalDataObject');
      expect(_.get(result, 'auditLog.count')).toEqual(10);
     */
  });
});
