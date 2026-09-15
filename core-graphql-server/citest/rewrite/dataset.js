const helpers = require('../helpers/index');

const config = helpers.config;
const env = config.env;
const _ = require('lodash');

let options;
let datasetId;
let dataset1;



const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const maxJobWaitMs = 5 * 60 * 1000;


describe('dataset tests', async () => {
  let gqlClient;

  function expectDatasetToExist(response) {    
    expect(
      _.get(response, 'body.errors'),
      'body.errors'
    ).toBeUndefined();
    datasetId = _.get(result, 'createDataset.id');
    expect(datasetId).toBeDefined();
    return response;
  }

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;
  });

  beforeAll(() => {

    async function addRecordsToDataset(response) {
      const _datasetId = _.get(result, 'createDataset.id');

      const addRecords = `
             mutation  {
                datasetDataOperation(
                  datasetId:"${datasetId}",
                  actions: [
                    {
                    action:ADD
                    data:[
                        {
                        id:"1"
                        data: {
                          contentType:"jsondata"
                        }
                        storeUriContents:[
                          "https://prod-veritone-library.s3.amazonaws.com/13e6f4a3-0d5c-4e11-9a30-913e981cb9ad/26169882-d36c-4528-81e3-8d3bddee6526/b35855dd-e8c2-45b1-aecf-63dd3649950a.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20200804%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20200804T071745Z&X-Amz-Expires=10800&X-Amz-Signature=53cdc12808e5d27ad14a6cc4930192cad2591470ee2783b7e7aaa9f39c4c8604&X-Amz-SignedHeaders=host"
              
                        ]
                      },
                      {
                        id:"2"
                        data: {
                         contentType:"jsondata"
                         
                        }
                        storeUriContents:[
                          "https://prod-veritone-library.s3.amazonaws.com/13e6f4a3-0d5c-4e11-9a30-913e981cb9ad/7411413e-0a13-4afd-8a53-82e31fbd5bf7/9a6a82df-9d86-4c1b-932c-7c5e64b19254.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20200804%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20200804T071745Z&X-Amz-Expires=10800&X-Amz-Signature=a56aad3c90ad02452d7c9d53dab13e05b6f5bd2de06e2fc64625473b2b81aa4a&X-Amz-SignedHeaders=host"
                        ]
                      }
                    ]
                      }
                  ]
                ){
                  statusString
                  version
                  createdBy
                  createdByName
                  modifiedBy
                  modifiedByName
                  createdDateTime
                  modifiedDateTime
                }
              }
            `;
      let _addDataset = await chakram
        .post(url, { query: addRecords }, options)
        .then(response => {
          
         
    
          createdBy = _.get(
            response,
            'body.data.datasetDataOperation.createdBy'
          );
          expect(createdBy).toBeDefined();
        });

      return _datasetId;
    }

    const createDatasetMutation = `
            mutation {
                createDataset(
                    input: {
                    name: "Manual dataset"
                    description: "Manual dataset test"
                    features: [
                        {
                        name: "contentType"
                        dataType: text
                        isFilter: true
                        isRequired: true
                        defaultValue: ""
                        }
                    ]
                    tags: ["test", "dataset"]
                    categories: [
                        { name: "Transcription" }
                        { name: "Facial Detection" }
                        { name: "Object Detection" }
                    ]
                    class: [{ name: "biometrics" }]
                    }
                ) {
                    id
                    status {
                    version
                    createdBy
                    createdDateTime
                    }
                }
            }
        `;

    dataset1 = chakram
      .post(url, { query: createDatasetMutation }, options)
      .then(expectDatasetToExist)
      .then(addRecordsToDataset);

    return chakram.waitFor([dataset1]);
  });

  it('it created a datasets', async () => {
    results = await Promise.all([dataset1]);
    return expect(dataset1).toBeDefined();
  });

  it('get the datarow of the dataset', async () => {
    const getDatasetRowsByIdQuery = `
            query {
                datasetDataQuery(datasetId: "${datasetId}",pageSize: 30, offset: 0)
                {
                    rowcount
                    datasetId
                    data {
                        data
                    }
                }
            }
        `;
    let datasetrow = await chakram
      .post(url, { query: getDatasetRowsByIdQuery }, options)
      .then(response => {
        
        const _datasetId = _.get(
          response,
          'body.data.datasetDataQuery.datasetId'
        );

        expect(_datasetId).toBeDefined();
        return response;
      });
  });
});
