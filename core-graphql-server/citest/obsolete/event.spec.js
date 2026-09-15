const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const uuid = require('uuid');

const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const moment = require('moment');
const util = require('../../util.js')({});
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_eventing: eventing tests', () => {
  let eventId;
  let eventSubscriptionId;
  const eventName = citestMarker + '-' + uuid.v4();
  const inputEventId = uuid.v4();
  const inputEventName = citestMarker + '-' + uuid.v4();
  const tdoId = _.toString(moment().unix());
  let auditEventId;

  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('create an event', async () => {
    const query = `
      mutation {
        createEvent(input:{
    	  eventName:"${eventName}",
    	  eventType:"Test",
    	  application:"8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5",
    	  public:true,
    	  description:"Test Event",
    	  schemaData: "{test}",
        }){
          id
          eventName
          eventType
          application
          public
          description
          schemaData
          schemaHash
          createdDateTime
          createdDateTime
	    }
	  }
	`;
    const result = await gqlClient.query(query);
    eventId = _.get(result, 'createEvent.id');
    expect(eventId).toBeDefined();
  });

  it('update an event', async () => {
    const query = `
      mutation {
        updateEvent(input:{
          id:"${eventId}"
          description:"This is an edit"
        }){
          id
          description
          eventType
          application
          schemaData
        }
      }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'updateEvent.description')).toEqual('This is an edit');
  });

  it('get the event', async () => {
    const query = `
      query {
        event(id:"${eventId}"){
          id
          description
          eventType
          application
          schemaData
        }
      }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'event.id')).toEqual(eventId);
  });

  it('get events by appId', async () => {
    const query = `
      query {
        events(application:"system"){
          offset
          limit
          count
          records{
            id
            description
            eventType
            application
            schemaData
          }
        }
      }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'events.records.length')).toBeGreaterThan(0);
  });

  it('subscribe to an event', async () => {
    const query = `
      mutation {
        subscribeEvent(input:{
          eventName:"${eventName}"
          eventType:"Test"
          application:"8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5"
          delivery:{
            name:Webhook
            params:{
              url:"https://webhook.site/17ca6555-bc97-4e87-816a-2814ff28c197",
              encoding:"protobuf_64"
            }
          }
        })
      }
    `;
    const result = await gqlClient.query(query);

    eventSubscriptionId = _.get(result, 'subscribeEvent');
    expect(eventSubscriptionId).toBeDefined();
  });

  it('unsubscribe from eventy', async () => {
    const query = `
      mutation {
        unsubscribeEvent(id:"${eventSubscriptionId}"){
          id
          message
        }
      }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'unsubscribeEvent.id')).toEqual(eventSubscriptionId);
  });

  it('emit audit log event', async () => {
    const query = `
      mutation ($payload: JSONData!, $application: String){
        emitAuditEvent (input: {
          payload: $payload
          application: $application
        }) {
          id
        }
      }
    `;
    const payload = {
      action: 'redacted',
      tdoId: tdoId,
      userId: 'ad19d9cd-50e5-42e0-9e3a-c901e931a13b',
      timestampMs: moment().valueOf()
    };
    const result = await gqlClient.query(query, {
      payload,
      application: 'a1'
    });
    auditEventId = _.get(result, 'emitAuditEvent.id');
    expect(auditEventId).toBeDefined();
  });

  // FIXME: message":"Unable to retrieve audit events. Please review your query and try again.","name":"internal_error"
  xit('get audit log event', async () => {
    await util.sleep(5000);
    const query = `
      query ($query: JSONData!, $application: String, $terms: [JSONData!]) {
        auditEvents(query: $query) {
          records {
            id
            payload
            organizationId
            userId
          }
        }
        appTermsFilter: auditEvents(application: $application, terms: $terms) {
          records {
            id
            payload
            application
          }
        }
      }
    `;
    const searchQuery = {
      query: {
        bool: {
          filter: [
            {
              term: {
                'payload.tdoId': tdoId
              }
            }
          ]
        }
      },
      terms: [
        {
          tdoId
        }
      ],
      application: 'a1'
    };

    const result = gqlClient.query(query, {
      query: searchQuery
    });
    expect(_.get(result, 'auditEvents.records[0].id')).toEqual(auditEventId);
    expect(_.get(result, 'appTermsFilter.records[0].id')).toEqual(auditEventId);
    expect(_.get(result, 'appTermsFilter.records[0].application')).toEqual(
      'a1'
    );
  });

  it('subscribe to an event having conditions', async () => {
    const query = `
      mutation {
        subscribeEvent(input:{
          eventName:"${eventName}"
          eventType:"Test"
          application:"8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5"
          delivery:{
            name:Webhook
            params:{
              url:"https://webhook.site/17ca6555-bc97-4e87-816a-2814ff28c197",
              encoding:"protobuf_64"
            }
          }
          conditions: {
            operator: "and",
            conditions: [
              {
                field: "watchlistId",
                operator: "eq",
                value: 1
              }
            ]
          }
        })
      }
    `;
    let result = await gqlClient.query(query);
    eventSubscriptionId = _.get(result, 'subscribeEvent');
    expect(eventSubscriptionId).toBeDefined();
  });

  // TODO: check how an orgless token can be created
  it('create an event with specified ID using Hub token', async () => {
    const query = `
      mutation {
        createEvent(input:{
          id: "${inputEventId}"
          eventName:"${inputEventName}",
          eventType:"Test",
          application:"8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5",
          public:true,
          description:"Test Event",
          schemaData: "{test}",
          }){
            id
            eventName
            eventType
            application
            public
            description
            schemaData
            schemaHash
            createdDateTime
            createdDateTime
          }
        }
      `;
    const result = await gqlClient.queryByInternalOrglessToken(query);
    const createdEventId = _.get(result, 'createEvent.id');
    expect(createdEventId).toEqual(inputEventId);
  });

  it('get events by appId using Hub token', async () => {
    const query = `
      query {
        events(application: "8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5"){
          offset
          limit
          count
          records{
            id
            description
            eventType
            application
            schemaData
          }
        }
      }
    `;
    const result = await gqlClient.queryByInternalOrglessToken(query);

    expect(_.get(result, 'events.records.length')).toBeGreaterThan(0);
  });

  it('get event subscriptions using Hub token', async () => {
    const query = `
      query {
        eventSubscriptions(limit: 100){
          offset
          limit
          count
          records {
            id
            eventName
          }
        }
      }
    `;
    const result = await gqlClient.queryByInternalOrglessToken(query);

    expect(_.get(result, 'eventSubscriptions.records.length')).toBeGreaterThan(
      0
    );
  });

  it('get event subscription by ID using Hub token', async () => {
    const query = `
      query {
        eventSubscription(id: "${eventSubscriptionId}"){
          id
          eventName
        }
      }
    `;
    const result = await gqlClient.queryByInternalOrglessToken(query);

    expect(_.get(result, 'eventSubscription.id')).toEqual(eventSubscriptionId);
    expect(_.get(result, 'eventSubscription.eventName')).toEqual(eventName);
  });

  it('should unsubscribe from remaining test event successfully', async () => {
    const query = `
      mutation {
        unsubscribeEvent(id:"${eventSubscriptionId}"){
          id
          message
        }
      }
    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'unsubscribeEvent.id')).toEqual(eventSubscriptionId);
  });
});
