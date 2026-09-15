import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers/index';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationStatus } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const config = helpers.config;
const env = config.env.toLowerCase();
const isValidEnv = env.includes('local');

const versions: string[] = [];
const installedVersions: string[] = [];

const manifestUrl =
  'https://s3.example.com/aiware/versions/1.2.0/manifest.yaml';
const changeLogUrl =
  'https://s3.example.com/aiware/versions/1.2.0/changelog.txt';
const highlightsUrl =
  'https://s3.example.com/aiware/versions/1.2.0/highlights.txt';

const itif = (condition: boolean, name: string, fn: () => Promise<void>) =>
  condition ? it(name, fn) : it.skip(name, fn);

describe(`citest_platform: platform testing in the ${env} environment`, () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let userId: string;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    userId = isolatedSuperadmin.userId;

    if (isValidEnv) {
      // getting platform info to generate a new platform version and set it as current version
      let result = await gqlClient.sdk.platformInfo();
      expect(result).toBeDefined();
      expect(
        result.data.platformInfo.aiWAREVersion.currentVersion.version
      ).toBeDefined();

      for (let versionIdx = 1; versionIdx < 10; versionIdx++) {
        versions.push(uuidv4());
      }
      // sort the versions array descending
      versions.sort((a, b) => b.localeCompare(a));

      // Get existing installed versions (if any).
      // These will be used to 'put back' the prior versions
      result = await gqlClient.sdk.platformInfo();
      for (const historyRecord of result.data.platformInfo.aiWAREVersionHistory!
        .records!) {
        installedVersions.push(historyRecord!.platformVersion.version);
      }
    }
  });

  afterAll(async () => {
    await safe('delete isolated superadmin org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization({
        input: {
          id: isolatedSuperadmin.orgId,
          status: OrganizationStatus.Deleted
        }
      })
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  itif(isValidEnv, '#add platform versions', async () => {
    for (const version of versions) {
      const result = await gqlClient.sdk.addPlatformVersion({
        input: { version, manifestUrl, changeLogUrl, highlightsUrl }
      });
      expect(result).toBeDefined();
      expect(result.data.addPlatformVersion!.version).toEqual(version);
      expect(result.data.addPlatformVersion!.manifestUrl).toEqual(manifestUrl);
      expect(result.data.addPlatformVersion!.changeLogUrl).toEqual(
        changeLogUrl
      );
      expect(result.data.addPlatformVersion!.highlightsUrl).toEqual(
        highlightsUrl
      );
    }
  });

  itif(isValidEnv, '#set current platform version', async () => {
    for (const version of versions) {
      const result = await gqlClient.sdk.setCurrentPlatformVersion({
        version
      });
      expect(result).toBeDefined();
      expect(result.data.setCurrentPlatformVersion!.version).toEqual(version);
      expect(result.data.setCurrentPlatformVersion!.manifestUrl).toEqual(
        manifestUrl
      );
      expect(result.data.setCurrentPlatformVersion!.changeLogUrl).toEqual(
        changeLogUrl
      );
      expect(result.data.setCurrentPlatformVersion!.highlightsUrl).toEqual(
        highlightsUrl
      );
      expect(result.data.setCurrentPlatformVersion!.installedAt).toBeDefined();
      expect(result.data.setCurrentPlatformVersion!.installedBy).toEqual(
        userId
      );
    }
  });

  itif(isValidEnv, '#get version history', async () => {
    const result = await gqlClient.sdk.platformInfo();
    expect(result).toBeDefined();
    expect(result.data.platformInfo.aiWAREVersionHistory).toBeDefined();
    let actualIdx = 0;
    for (let targetIdx = versions.length - 1; targetIdx >= 0; targetIdx--) {
      const version = versions[targetIdx];
      expect(
        result.data.platformInfo.aiWAREVersionHistory!.records![actualIdx]!
          .platformVersion.version
      ).toEqual(version);
      actualIdx++;
    }
  });

  itif(isValidEnv, '#should restore prior platform versions', async () => {
    for (let idx = installedVersions.length - 1; idx >= 0; idx--) {
      const version = installedVersions[idx];
      const result = await gqlClient.sdk.setCurrentPlatformVersion({
        version
      });
      expect(result).toBeDefined();
      expect(result.data.setCurrentPlatformVersion!.version).toEqual(version);
    }
  });

  itif(isValidEnv, '#trying to set invalid platform version', async () => {
    try {
      await gqlClient.sdk.setCurrentPlatformVersion({
        version: 'invalid_version'
      });
    } catch (e: any) {
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
        await gqlClient.sdk.addPlatformVersion({
          input: {
            id: 'invalid_id',
            version: '1.2.0',
            manifestUrl,
            changeLogUrl,
            highlightsUrl
          }
        });
      } catch (e: any) {
        expect(e.message).toBeDefined();
        expect(e.message).toContain(
          `Invalid ID format 'invalid_id'. ID must be in the UUID format.`
        );
      }
    }
  );

  it('#should add platform properties using the setPlatform properties mutation', async () => {
    const result = await gqlClient.sdk.setPlatformProperties({
      properties: { Environment: 'US West', ClusterSize: 'small' }
    });
    expect(result).toBeDefined();
    expect(result.data.setPlatformProperties.properties).toBeDefined();
    expect(result.data.setPlatformProperties.properties.Environment).toEqual(
      'US West'
    );
    expect(result.data.setPlatformProperties.properties.ClusterSize).toEqual(
      'small'
    );
  });

  it('#should fail setting platform properties using the setPlatformProperties mutation with no properties input', async () => {
    try {
      await gqlClient.sdk.setPlatformProperties({ properties: 3.0 });
    } catch (e: any) {
      expect(e.message).toBeDefined();
      expect(e.message).toContain(`The properties field must be an object.`);
    }
  });

  it('#should get platform properties using the platformInfo query', async () => {
    const result = await gqlClient.sdk.platformInfo();
    expect(result).toBeDefined();
    expect(result.data.platformInfo.properties).toBeDefined();
    expect(result.data.platformInfo.properties.Environment).toEqual('US West');
    expect(result.data.platformInfo.properties.ClusterSize).toEqual('small');
  });
});
