const fs = require('fs');
const helpers = require('./helpers/index');

const config = helpers.config;

const env = config.env;



describe('Search', () => {

  let options;
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;

  beforeAll(done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken }) => {
        options = helpers.requestOptions(token);
        done();
      })
      .catch(err => done(err));
  });

  it('should error if index is not provided', () => {
    const query = `{ searchMedia(search: {
      offset: 0,
      limit: 25,
      query: {},
      select: ["transcript"]
      }) {
      jsondata
    }}`;

    const result = await gqlClient.query(query);
      
      expect(response.body.data.searchMedia).to.be.null;
      expect(response.body.errors).to.not.be.null;
    });
  });

  it('should error if query is empty', () => {
    const query = `{ searchMedia(search: {
      offset: 0,
      limit: 25,
      index: ["global", "mine"],
      query: {},
      select: ["transcript"]
      }) {
      jsondata
    }}`;

    const result = await gqlClient.query(query);
      
      expect(response.body.data.searchMedia).to.be.null;
      expect(response.body.errors).to.not.be.null;
    });
  });

  it('should return search media results successfully', () => {
    const query = `{ searchMedia(search: {
      offset: 0,
      limit: 25,
      index: ["global", "mine"],
      query: {
          operator: "and",
          conditions: [
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "lakers"
              },
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "kobe"
              }
          ]
      },
      select: ["transcript"]
      }) {
      jsondata
    }}`;

    const result = await gqlClient.query(query);
      
      expect(response.error).to.be.null;
      expect(response.body.data.searchMedia).to.have.property('jsondata');
    });
  });

  it('should return aggregate search media results successfully', () => {
    const query = `{ searchMedia(search: {
      offset: 0,
      limit: 25,
      index: ["global", "mine"],
      query: {
          operator: "and",
          conditions: [
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "lakers"
              },
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "kobe"
              }
          ]
      },
      aggregate: [
        {
          operator: "sum",
          field: "impressions"
        },
      ],
      select: ["transcript"]
      }) {
      jsondata
    }}`;

    const result = await gqlClient.query(query);
      
      expect(response.error).to.be.null;
      expect(response.body.data.searchMedia).to.have.property('jsondata');
    });
  });

  it('should return search mentions results successfully', () => {
    const query = `{ searchMentions(search: {
      offset: 0,
      limit: 25,
      index: ["global", "mine"],
      query: {
          operator: "and",
          conditions: [
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "lakers"
              },
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "kobe"
              }
          ]
      },
      select: ["transcript"]
      }) {
      jsondata
    }}`;

    const result = await gqlClient.query(query);
      
      expect(response.error).to.be.null;
      expect(response.body.data.searchMentions).to.have.property('jsondata');
    });
  });

  it('should return aggregate search mentions results successfully', () => {
    const query = `{ searchMentions(search: {
      offset: 0,
      limit: 25,
      index: ["global", "mine"],
      query: {
          operator: "and",
          conditions: [
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "lakers"
              },
            {
                  operator: "query_string",
                  field: "transcript.transcript",
                  value: "kobe"
              }
          ]
      },
      aggregate: [
        {
          operator: "sum",
          field: "impressions"
        },
      ],
      select: ["transcript"]
      }) {
      jsondata
    }}`;

    const result = await gqlClient.query(query);
      
      expect(response.error).to.be.null;
      expect(response.body.data.searchMentions).to.have.property('jsondata');
    });
  });
});
