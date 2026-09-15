const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');

const uuid = require('uuid');
const config = helpers.config;

const env = config.env.toLowerCase();
const isValidEnv = env === 'local';

const _ = require('lodash');
let gqlClient, userId;
const versions = [];
const installedVersions = [];

const manifestUrl =
  'https://s3.example.com/aiware/versions/1.2.0/manifest.yaml';
const changeLogUrl =
  'https://s3.example.com/aiware/versions/1.2.0/changelog.txt';
const highlightsUrl =
  'https://s3.example.com/aiware/versions/1.2.0/highlights.txt';

const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

// only run this CI test in the aws dev environment
describe(`citest_platform: platform testing in the ${env} environment`, () => {
  beforeAll(async () => {
    // getting gql client
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // getting userId to evaluate installedBy field
    result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    userId = _.get(result, 'me.id');

    if (isValidEnv) {
      // getting platform info to generate a new platform version and set it as current version
      result = await gqlClient.query(platformInfo, {});
      expect(result).toBeDefined();
      expect(
        result.platformInfo.aiWAREVersion.currentVersion.version
      ).toBeDefined();

      for (let versionIdx = 1; versionIdx < 10; versionIdx++) {
        const version = uuid.v4();
        versions.push(version);
      }
      // sort the versions array descending
      versions.sort((a, b) => b.localeCompare(a));

      // Get existing installed versions (if any).
      // These will be used to 'put back' the prior versions
      const versionHistoryQuery = getVersionHistoryQuery();
      result = await gqlClient.query(versionHistoryQuery, {});
      for (const historyRecord of result.platformInfo.aiWAREVersionHistory) {
        installedVersions.push(historyRecord.platformVersion.version);
      }
    }
  });

  itif(isValidEnv, '#add platform versions', async () => {
    for (let version of versions) {
      let query = getMutationAddPlatformVersion(version, null);
      let result = await gqlClient.query(query, {});
      expect(result).toBeDefined();
      expect(result.addPlatformVersion.version).toEqual(version);
      expect(result.addPlatformVersion.manifestUrl).toEqual(manifestUrl);
      expect(result.addPlatformVersion.changeLogUrl).toEqual(changeLogUrl);
      expect(result.addPlatformVersion.highlightsUrl).toEqual(highlightsUrl);
    }
  });

  itif(isValidEnv, '#set current platform version', async () => {
    for (let version of versions) {
      const query = getMutationSetCurrentPlatformVersion(version);
      let result = await gqlClient.query(query, {});
      expect(result).toBeDefined();
      expect(result.setCurrentPlatformVersion.version).toEqual(version);
      expect(result.setCurrentPlatformVersion.manifestUrl).toEqual(manifestUrl);
      expect(result.setCurrentPlatformVersion.changeLogUrl).toEqual(
        changeLogUrl
      );
      expect(result.setCurrentPlatformVersion.highlightsUrl).toEqual(
        highlightsUrl
      );
      expect(result.setCurrentPlatformVersion.installedAt).toBeDefined();
      expect(result.setCurrentPlatformVersion.installedBy).toEqual(userId);
    }
  });

  itif(isValidEnv, '#get version history', async () => {
    const versionHistoryQuery = getVersionHistoryQuery();

    let result = await gqlClient.query(versionHistoryQuery, {});
    expect(result).toBeDefined();
    expect(result.platformInfo.aiWAREVersionHistory).toBeDefined();
    let actualIdx = 0;
    for (let targetIdx = versions.length - 1; targetIdx >= 0; targetIdx--) {
      const version = versions[targetIdx];
      expect(
        result.platformInfo.aiWAREVersionHistory[actualIdx].platformVersion
          .version
      ).toEqual(version);
      actualIdx++;
    }
  });

  itif(isValidEnv, '#should restore prior platform versions', async () => {
    for (let idx = installedVersions.length - 1; idx >= 0; idx--) {
      const version = installedVersions[idx];
      const query = getMutationSetCurrentPlatformVersion(version);
      let result = await gqlClient.query(query, {});
      expect(result).toBeDefined();
      expect(result.setCurrentPlatformVersion.version).toEqual(version);
    }
  });

  itif(isValidEnv, '#trying to set invalid platform version', async () => {
    try {
      const query = getMutationSetCurrentPlatformVersion('invalid_version');
      let result = await gqlClient.query(query, {});
    } catch (e) {
      expect(e.message).toBeDefined();
      expect(e.message).toContain(
        `The input version, 'invalid_version' does not exist`
      );
    }
  });

  itif(
    isValidEnv,
    '#trying to add platform version with invalid id',
    async () => {
      try {
        const query = getMutationAddPlatformVersion('1.2.0', 'invalid_id');
        let result = await gqlClient.query(query, {});
      } catch (e) {
        expect(e.message).toBeDefined();
        expect(e.message).toContain(
          `Invalid ID format 'invalid_id'. ID must be in the UUID format.`
        );
      }
    }
  );

  it('#should add platform properties using the setPlatform properties mutation', async () => {
    const mutation = `mutation {
      setPlatformProperties(
        properties: { Environment: "US West", ClusterSize: "small" }
      )
    }`;

    let result = await gqlClient.query(mutation, {});
    expect(result).toBeDefined();
    expect(result.setPlatformProperties.properties).toBeDefined();
    expect(result.setPlatformProperties.properties.Environment).toEqual(
      'US West'
    );
    expect(result.setPlatformProperties.properties.ClusterSize).toEqual(
      'small'
    );
  });

  it('#should fail setting platform properties using the setPlatformProperties mutation with no properties input', async () => {
    const mutation = `mutation {
    setPlatformProperties(
      properties: 3.0
    )
  }`;

    try {
      let result = await gqlClient.query(mutation, {});
    } catch (e) {
      expect(e.message).toBeDefined();
      expect(e.message).toContain(`The properties field must be an object.`);
    }
  });

  it('#should get platform properties using the platformInfo query', async () => {
    const query = `query {
      platformInfo {
        properties
        aiWAREVersion {
          currentVersion {
            version
          }
          previousVersion {
            version
          }
          nextVersion {
            version
          }
        }
      }
    }`;

    let result = await gqlClient.query(query, {});
    expect(result).toBeDefined();
    expect(result.platformInfo.properties).toBeDefined();
    expect(result.platformInfo.properties.Environment).toEqual('US West');
    expect(result.platformInfo.properties.ClusterSize).toEqual('small');
  });
});

function getVersionHistoryQuery() {
  const query = `query {
    platformInfo {
      aiWAREVersionHistory {
        platformVersion {
          id
          version
          installedAt
          installedBy
        }
        id
      }
      aiWAREVersion {
        currentVersion {
          version
        }
        previousVersion {
          version
        }
        nextVersion {
          version
        }
      }
    }
  }`;

  return query;
}

function getMutationAddPlatformVersion(version, id) {
  let input = `manifestUrl: "${manifestUrl}"
      changeLogUrl: "${changeLogUrl}"
      highlightsUrl: "${highlightsUrl}"
  `;

  if (!_.isNull(id)) {
    input = input + `id: "${id}" \n`;
  }

  if (!_.isNull(version)) {
    input = input + `version: "${version}" \n`;
  }

  return `
      mutation {
    addPlatformVersion(input: {
    ${input}
    }) {
      id
      version
      manifestUrl
      changeLogUrl
      highlightsUrl
      createdAt,
      createdBy
    }
  }
    `;
}

function getMutationSetCurrentPlatformVersion(version) {
  return `
  mutation {
    setCurrentPlatformVersion(version: "${version}") {
      id
      version
      manifestUrl
      changeLogUrl
      highlightsUrl
      createdAt,
      createdBy,
      installedAt,
      installedBy
    }
  }
  `;
}

const meGql = `
query {
  me {
    id
  }
}`;

const platformInfo = `
query {
    platformInfo {
      aiWAREVersion {
        currentVersion {
          version
        }
        previousVersion {
          version
        }
        nextVersion {
          version
        }
      }
    }
  }
`;

function getNewVersionValue(versionToIncrement) {
  const parts = versionToIncrement.split('.');
  let lastNumber = parseInt(parts[parts.length - 1]);
  lastNumber++;
  parts[parts.length - 1] = lastNumber.toString();
  return parts.join('.');
}
