const helpers = require('./helpers/index');
const GraphqlClient = require('./helpers/gql.js');

const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const magicConfig = {
  config: require('../server.json')
};



const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const invalidKey = 'abcdefg';
let jwtToken;
let invalidJwtToken;
let error;

let testJwtToken;
let testPayload;
let engineId;
let jwtPayload = {};

describe('Setup JWT for testing', () => {
  

  let options, userOptions;

  beforeAll(done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, appId }) => {
        options = helpers.requestOptions(apiToken);
        userOptions = helpers.requestOptions(token);
        done();
      })
      .catch(err => done(err));
  });

  describe('Create a TDO and a job using TDO as target and including citest engine', () => {
    it('should create a TDO into folder', () => {
      const curDateTime = Math.floor(Date.now() / 1000);
      const query = `mutation {
        createTDO(input: {
          status: "uploaded"
          isPublic: true
          startDateTime: ${curDateTime}
          stopDateTime: ${curDateTime + 300}
        }) {
            id
        }
      }`;

      const result = await gqlClient.query(query);
        const createTDO = _.get(result, 'createTDO');

        
        
        expect(createTDO).toBeDefined();
        expect(createTDO.id).toBeDefined();

        jwtPayload.tdoId = createTDO.id;
      });
    });

    it('should get citest engine', () => {
      const query = `query {
        engines(createsTDO:false, state: [active], limit:1, name: "CITest Engine 20221219") {
          records {
            id
          }
        }
      }`;

      const result = await gqlClient.query(query);
        const engine = _.get(result, 'engines.records[0]');

        
        
        expect(engine).toBeDefined();
        expect(engine.id).toBeDefined();

        engineId = engine.id;
      });
    });

    it('should create a job', () => {
      const query = `
        mutation {
          createJob(input: {
            retries: 1
            targetId: "${jwtPayload.tdoId}"
            tasks: [
              {
                engineId: "${engineId}"
                payload: {
                  target: "it"
                }
              }
            ]
          }) {
            id
            targetId
            tasks {
              records {
                id
              }
            }
          }
        }`;

      const result = await gqlClient.query(query);
        const createJob = _.get(result, 'createJob');

        
        
        expect(createJob).toBeDefined();
        expect(createJob.id).toBeDefined();
        expect(createJob.targetId).toEqual(
          jwtPayload.tdoId
        );
        expect(_.get(createJob, 'tasks.records[0].id')).toBeDefined();

        jwtPayload.jobId = createJob.id;
        jwtPayload.taskId = _.get(createJob, 'tasks.records[0].id');
      });
    });
  });

  describe('Sign a jwt to test verifyJWT.', () => {
    it('should get the jwtToken', () => {
      const query = `mutation($engineId: ID!, $resource: GetEngineJWTResource!) {
        getEngineJWT(input: {
          engineId: $engineId
          resource: $resource
        }) {
          token
        }
      }`;
      const variables = {
        engineId,
        resource: jwtPayload
      };
      return chakram
        .post(url, { query, variables }, userOptions)
        .then(response => {
          const getEngineJWT = _.get(result, 'getEngineJWT');

          
          
          expect(getEngineJWT).toBeDefined();
          expect(getEngineJWT.token).toBeDefined();

          jwtToken = getEngineJWT.token;
        });
    });
  });

  describe('Verify the JWT', () => {
    

    it('JWT should verify', () => {
      const query = `mutation {
        verifyJWT(jwtToken: "${jwtToken}") {
          jwtToken
          payload
        }
      }`;

      const result = await gqlClient.query(query);
        
        expect(response.body.errors).to.be.undefined;
        testJwtToken = _.get(result, 'verifyJWT.jwtToken');
        testPayload = _.get(result, 'verifyJWT.payload');
        expect(testJwtToken).toBeDefined();
        expect(testPayload).toBeDefined();
        expect(testJwtToken).toEqual(jwtToken);
      });
    });
  });

  describe('Handles invalid JWTs', () => {
    

    beforeAll(done => {
      try {
        invalidJwtToken = jwt.sign(jwtPayload, invalidKey);
      } catch (err) {
        error = err;
      }
      done();
    });

    it('Should sign an invalid JWT', () => {
      expect(invalidJwtToken, invalidJwtToken).toBeDefined();
      expect(error, error).to.be.undefined;
    });

    it('JWT should handle error', () => {
      const query = `mutation {
        verifyJWT(jwtToken: "${invalidJwtToken}") {
          jwtToken
          payload
        }
      }`;

      const result = await gqlClient.query(query);
        
        expect(_.get(result, 'verifyJWT')).to.be.null;
        expect(_.get(response, 'body.errors')).toBeDefined();
      });
    });
  });

  describe('delete artifacts created during the test', () => {
    it('should delete tdo', () => {
      const query = `mutation {
        deleteTDO(id: "${jwtPayload.tdoId}") {
          id
          message
        }
      }`;

      const result = await gqlClient.query(query);
        const deleteTDO = _.get(result, 'deleteTDO');

        
        
        expect(deleteTDO).toBeDefined();
        expect(deleteTDO.id).toEqual(jwtPayload.tdoId);
      });
    });
  });
});
