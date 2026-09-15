const _ = require('lodash');

async function helpCreateStructuredData(client, input) {
  const { gqlClient, options } = client;
  const { addAcesEntries, ...basicInput } = input;

  let addACEsString = '';
  if (!_.isEmpty(addAcesEntries)) {
    const entriesString = addAcesEntries.reduce((query, record) => {
      query += `
          {
            member: {
              id: "${record.member.id}"
              memberType: ${record.member.memberType}
            }
            permissionSetID: "${record.permissionSetID}"
          },`;

      return query;
    }, ``);

    addACEsString = `
      addACEs(
        entries: [${entriesString}]
      ) {
        records {
          id
          objectID
          objectType
        }
        count
      }`;
  }

  return gqlClient.query(
    `mutation createSDO ($id: ID, $schemaId: ID!, $data: JSONData, $dataString: String){
      createStructuredData(
        input: {
          id: $id
          data: $data
          schemaId: $schemaId
          dataString: $dataString
        }
      ) {
        id
        data
        schemaId
        modifiedDateTime
        createdDateTime
        ${addACEsString}
      }
    }`,
    basicInput,
    options
  );
}

async function helpUpdateStructuredData(client, input) {
  const { gqlClient, options } = client;
  const { id, schemaId, data, dataString } = input;

  return gqlClient.query(
    `mutation updateSDO ($id: ID!, $schemaId: ID!, $data: JSONData, $dataString: String) {
      updateStructuredData(
        input: {
          id: $id
          schemaId: $schemaId
          data: $data
          dataString: $dataString
        }
      ) {
        id
        schemaId
        data
        createdDateTime
        modifiedDateTime
      }
    }`,
    { id, schemaId, data, dataString },
    options
  );
}

async function helpDeleteStructuredData(client, input) {
  const { gqlClient, options } = client;
  const { id, schemaId } = input;

  return gqlClient.query(
    `mutation deleteStructuredData {
      deleteStructuredData(input: {
        id: "${id}"
        schemaId: "${schemaId}"
      }) {
        id
      }
    }`,
    {},
    options
  );
}

async function helpGetStructuredData(client, input) {
  const { gqlClient, options } = client;
  const { id, schemaId } = input;

  return gqlClient.query(
    `query getSDO {
      structuredData(
        id: "${id}"
        schemaId: "${schemaId}"
      ) {
        id
        data
        schemaId
      }
    }`,
    {},
    options
  );
}

async function helpGetStructuredDataObjects(client, input) {
  const { gqlClient, options } = client;
  return gqlClient.query(
    `query sdos (
      $id: ID, $ids: [ID!], $schemaId: ID!, $orderBy: [StructuredDataOrderBy!], 
      $limit: Int, $offset: Int, $owned: Boolean, $filter: JSONData, $dateTimeFilter: SdoDateTimeFilter
    ) {
      structuredDataObjects(
        id: $id
        ids: $ids
        schemaId: $schemaId
        offset: $offset
        limit: $limit
        orderBy: $orderBy
        owned: $owned
        filter: $filter
        dateTimeFilter: $dateTimeFilter
      ) {
        count
        records {
          id
          dataString
        }
      }
    }`,
    input,
    options
  );
}

async function helpGetStructuredDataObject(client, input) {
  const { gqlClient, options } = client;
  const { id, schemaId } = input;

  return gqlClient.query(
    `
    query ($id: ID!, $schemaId: ID!) {
      structuredDataObject(
        id: $id
        schemaId: $schemaId
      ) {
        id
        dataString
        foo: data(path: "foo")
        schema {
          structuredDataObjects(limit: 1) {
            count
            records {
              id
            }
          }
        }
      }
    }
    `,
    { id, schemaId },
    options
  );
}

module.exports = {
  helpCreateStructuredData,
  helpUpdateStructuredData,
  helpDeleteStructuredData,
  helpGetStructuredData,
  helpGetStructuredDataObjects,
  helpGetStructuredDataObject
};
