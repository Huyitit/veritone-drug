const { get } = require('lodash');

async function helpCreateDagTemplate(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation createDagTemplate ($input: CreateDagTemplate!) {
    createDagTemplate (input: $input) {
      id
      name
      tags
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'createDagTemplate');
}

async function helpDeleteDagTemplate(client, { id }) {
  const { gqlClient, options } = client;

  const query = `mutation {
      deleteDagTemplate(id: "${id}") {
        id
      }
    }`;

  const result = await gqlClient.query(query, {}, options);
  return get(result, 'deleteDagTemplate');
}

async function helpLaunchDagTemplate(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation launchDAGTemplate ($input: LaunchDAGTemplateInput!) {
    launchDAGTemplate (input: $input) {
      id
      targetId
      tasks {
        count
        records {
          id
          engine {
            id
            name
          }
          payload
          executionPreferences {
            priority
          }
        }
      }
      routes {
        parentIoFolderReferenceId
        childIoFolderReferenceId
        endpoint
        options
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'launchDAGTemplate');
}

async function helpGetDagTemplates(client, input) {
  const { gqlClient, options } = client;

  const query = `query dagTemplates (
    $id: [ID], $name: String, $cognitiveCategoryId: ID, $mimeType: String, $offset: Int, $limit: Int, 
    $tags: [String!], $tagMatch: StringMatch = startsWith
  ) {
    dagTemplates(
      id: $id, name: $name, cognitiveCategoryId: $cognitiveCategoryId, mimeType: $mimeType, offset: $offset, 
      limit: $limit, tags: $tags, tagMatch: $tagMatch
    ) {
      records {
        id
        name
      }
    }
  }`;

  const result = await gqlClient.query(query, input, options);
  return get(result, 'dagTemplates');
}

module.exports = {
  helpCreateDagTemplate,
  helpDeleteDagTemplate,
  helpLaunchDagTemplate,
  helpGetDagTemplates
};
