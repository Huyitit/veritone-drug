const helpers = require('./helpers/index');
const GraphqlClient = require('./helpers/gql.js');

const config = helpers.config;
const env = config.env;



describe('WorkflowRuntimeStorage API', () => {

  let options;
  let data;
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;

  beforeAll(done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken }) => {
        options = helpers.requestOptions(token);
        data = [...Array(10)]
          .map(i => (~~(Math.random() * 36)).toString(36))
          .join('');
        done();
      })
      .catch(err => done(err));
  });

  it('should set workflow data', () => {
    const query = `mutation {
		setWorkflowRuntimeStorageData(
			workflowRuntimeId: "citest_runtime_org_7682",
			input: {
				storageKey: "library:entity:/rootfolder/childfolder/entity1"
				storageData: "{\\"foo\\": \\"${data}\\"}"
				storageMetadata: "test metadata"
		}){
			storageKey
			storageData
		}}`;

    const result = await gqlClient.query(query);
      
      expect(
        response.body.data.setWorkflowRuntimeStorageData,
        response
      ).to.not.be.null;
      expect(
        response.body.data.setWorkflowRuntimeStorageData.storageKey,
        response
      ).to.be.equal('library:entity:/rootfolder/childfolder/entity1');
      expect(
        response.body.data.setWorkflowRuntimeStorageData.storageData,
        response
      ).to.be.equal(`{"foo": "${data}"}`);

      const query = `query {
		workflowRuntimeStorageData(
			workflowRuntimeId: "citest_runtime_org_7682",
			storageKeyPrefix: "library:entity:/rootfolder"
		){
			records {
				storageKey
				storageData
				storageMetadata
			}
		}}`;
      const result = await gqlClient.query(query);
        
        expect(response.body.data.workflowRuntimeStorageData).to.not.be.null;
        expect(
          response.body.data.workflowRuntimeStorageData.records[0].storageKey
        ).to.be.equal('library:entity:/rootfolder/childfolder/entity1');
        expect(
          response.body.data.workflowRuntimeStorageData.records[0].storageData
        ).to.be.equal(`{"foo": "${data}"}`);
        expect(
          response.body.data.workflowRuntimeStorageData.records[0]
            .storageMetadata
        ).to.be.equal('test metadata');
      });
    });
  });
});
