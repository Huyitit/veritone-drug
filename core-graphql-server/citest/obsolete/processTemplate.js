const helpers = require('../helpers/index');

const config = helpers.config;
const env = config.env;

const url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
const authUrl = `https://api.${env}.veritone.com/v1`;
let variables = {
  testName: 'test_process_template_intergration_' + Date.now(),
  taskList: [],
  taskUpdateList: []
};

let options;
let processTemplateId;

describe('authenicate', () => {
  it('sign in', done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, userId, organizationId }) => {
        options = helpers.requestOptions(token);
        expect(token).is.exist;
        done();
      })
      .catch(err => done(err));
  });
});

describe('Get engines to assign to taskList and taskListUpdate', () => {
  let errors;

  beforeAll(() => {
    const query = `
      {
        engines (limit: 2) {
          records {
            id
            category {
              id
              name
            }
            fields {
              name
              options {
                key
                value
              }
              info
              min
              max
              step
              label
              defaultValue
              defaultValues
              type
            }
            outputFormats
          }
        }
      }
    `;

    console.log('Getting engines...');
    recResult = chakram.post(url, { query }, options);

    return recResult.then(response => {
      let body = response.body;

      if (body) {
        errors = body.errors;
      }

      let records;
      if (body.data && body.data.engines.records) {
        records = body.data.engines.records;
        if (records && records.length >= 2) {
          variables.taskList.push(records[0]);
          variables.taskUpdateList.push(records[1]);
        }
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return helpers.expect(errors, 'errors').to.be.undefined;
  });
});

describe('Create a Process Template', () => {
  let recResult;
  let taskListResult;
  let errors;

  beforeAll(() => {
    const query = `
        mutation($testName: String!, $taskList: JSONData!) {
            createProcessTemplate(input: {
                name: $testName
                taskList: $taskList
            }) {
                id
                organizationId
                name
                taskList
            }
        }
    `;

    console.log('Creating Process Template....');
    recResult = chakram.post(
      url,
      {
        query: query,
        variables: {
          testName: variables.testName,
          taskList: JSON.stringify(variables.taskList)
        }
      },
      options
    );
    return recResult.then(response => {
      //
      let body = response.body;

      if (body) {
        errors = body.errors;
      }

      if (body.data && body.data.createProcessTemplate) {
        processTemplateId = body.data.createProcessTemplate.id;
        taskListResult = body.data.createProcessTemplate.taskList;
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return helpers.expect(errors, 'errors').to.be.undefined;
  });
  it('has processTemplateId', () => {
    return expect(processTemplateId).toBeDefined();
  });
  it('has a correct taskList', () => {
    if (taskListResult) {
      return expect(taskListResult.length).toEqual(variables.taskList.length);
    }
  });
});

describe('Update a Process Template', () => {
  let recResult;
  let taskListResult;
  let errors;

  beforeAll(() => {
    const query = `
        mutation($processTemplateId: ID!, $taskUpdateList: JSONData!) {
            updateProcessTemplate(input: {
                id: $processTemplateId
                taskList: $taskUpdateList
            }) {
                id
                organizationId
                name
                taskList
            }
        }
    `;

    console.log('Updating Process Template....');
    recResult = chakram.post(
      url,
      {
        query: query,
        variables: {
          processTemplateId,
          taskUpdateList: JSON.stringify(variables.taskUpdateList)
        }
      },
      options
    );
    return recResult.then(response => {
      //
      let body = response.body;

      if (body) {
        errors = body.errors;
      }

      if (body.data && body.data.updateProcessTemplate) {
        taskListResult = body.data.updateProcessTemplate.taskList;
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return helpers.expect(errors, 'errors').to.be.undefined;
  });
  it('has a correct taskListUpdate', () => {
    if (taskListResult) {
      return expect(taskListResult.length).toEqual(
        variables.taskUpdateList.length
      );
    }
  });
});

describe('Get a Process Template', () => {
  let recResult;
  let processTemplateData = null;
  let errors = null;

  beforeAll(() => {
    const query = `query {
      processTemplate(id: ${processTemplateId}) {
        id
        organizationId
        name
        taskList
      }
    }`;

    console.log('Get Process Template....');
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(response => {
      //
      let body = response.body;

      if (body && errors) {
        errors = body.errors;
      }

      if (body.data && body.data.processTemplate) {
        processTemplateData = body.data.processTemplate;
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return expect(errors).to.be.null;
  });
  it('list has length upper than 0', () => {
    return expect(processTemplateData.id).toEqual(processTemplateId.toString());
  });
});

describe('Get List Process Template', () => {
  let recResult;
  let processTemplateDataList = null;
  let errors = null;

  beforeAll(() => {
    const query = `query {
        processTemplates (
                limit: 30
                offset: 0
            ) {
                records {
                    id
                    organizationId
                    name
                    taskList
                }
            }
        }`;

    console.log('Listing Process Template....');
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(response => {
      //
      let body = response.body;

      if (body && errors) {
        errors = body.errors;
      }

      if (body.data && body.data.processTemplates.records) {
        processTemplateDataList = body.data.processTemplates.records;
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return expect(errors).to.be.null;
  });
  it('list has length upper than 0', () => {
    return expect(processTemplateDataList).to.have.length.above(0);
  });
});

describe('Delete Process Template', () => {
  let recResult;
  let deletePayload;
  let errors;

  beforeAll(() => {
    const query = `
      mutation {
        deleteProcessTemplate(id: ${processTemplateId}) {
          id
          message
        }
      }
    `;

    console.log('Deleting Process Template....');
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(response => {
      let body = response.body;

      if (body) {
        errors = body.errors;
      }

      if (body.data && body.data.deleteProcessTemplate) {
        deletePayload = body.data.deleteProcessTemplate;
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return helpers.expect(errors, 'errors').to.be.undefined;
  });
  it('has a correct taskListUpdate', () => {
    return expect(deletePayload.id).toEqual(processTemplateId.toString());
  });
});
