/// <reference lib="ES2017" />

declare const process: { env: { [key: string]: string | undefined } };

/**
 * TDO permissions integration test suite.
 *
 * Covers TDO creation, asset management, folder operations, and permissions
 * validation across different user roles within an organization.
 */

import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';
import { helpers } from '../../src/helpers/index';

import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import type { ServerFeatureFlags } from '../helpers/featureFlags';
import {
  CREATE_TDO,
  CREATE_TDO_WITH_ASSET,
  GET_TDO,
  GET_TDOS,
  UPDATE_TDO,
  CREATE_ASSET,
  UPDATE_ASSET,
  GET_ASSET,
  DELETE_ASSET,
  DELETE_TDO,
  GET_ENGINE_RESULTS,
  GET_SIGNED_WRITABLE_URL,
  GET_SIGNED_WRITABLE_URLS,
  GET_UPLOAD_STATUS,
  GET_CLONE_REQUESTS
} from '../../src/queries/extracted/tdo';
import {
  CREATE_ROOT_FOLDERS,
  CREATE_FOLDER,
  DELETE_FOLDER
} from '../../src/queries/extracted/folders';
import {
  FILE_TDO_IN_FOLDER,
  UNFILE_TDO_FROM_FOLDER,
  MOVE_TDO_BETWEEN_FOLDERS
} from '../../src/queries/extracted/media';
import {
  GET_ORGANIZATIONS,
  CREATE_ORGANIZATION
} from '../../src/queries/extracted/organizations';
import {
  CREATE_USER
} from '../../src/queries/extracted/users';
import {
  CREATE_APPLICATION
} from '../../src/queries/extracted/applications';
import {
  OrganizationStatus,
  OrganizationType,
  CreateTdo,
  CreateTdoWithAsset,
  UpdateTdo,
  CreateAsset as CreateAssetInput,
  UpdateAsset,
  CreateFolder,
  DeleteFolder,
  FileTemporalDataObject,
  UnfileTemporalDataObject,
  MoveTemporalDataObject,
  CreateOrganization,
  CreateUser as CreateUserInput,
  CreateApplicationInput
} from '../../src/gql/gql';

/**
 * Feature-flag globals: under jest (how the cirunner CI job runs these specs,
 * via `npm run citest`) they are published by citest/jest.global.setup.js
 * before any spec loads; under local `bun test` the preload in test/setup.ts
 * (wired via bunfig.toml) fetches the same live `graphqlServiceInfo.featureFlags`
 * and publishes identical globals. Reading them synchronously keeps this file free
 * of top-level await, which ts-jest (CommonJS) cannot compile.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const CITEST_MARKER = citestGlobals.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
].filter((roleId): roleId is string => roleId !== null);

/**
 * Helper to extract headers from request options object.
 * @param options - Request options with headers property
 */
const getRequestHeaders = (options: Record<string, any>): Record<string, string> =>
  _.get(options, 'headers', {});

describe('citest_tdo: AiwareTDOPermissions', () => {
  let gqlClient: GraphqlClient;
  let applicationOrgGUID: string | null = null;
  let aiwareOptions: Record<string, unknown> | null = null;
  let tdoId: string | null = null;
  let assetId: string | null = null;
  let tdoId1: string | null = null;
  let tdoId2: string | null = null;
  let superAdminOption: Record<string, unknown> | null = null;
  let applicationOrgId: string | null = null;
  let folderId: string | null = null;
  let folderId1: string | null = null;

  const uniqueId = Date.now().valueOf();
  const nameOrg = `${CITEST_MARKER}-application-${uuidv4()}`;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    /**
     * Build superadmin options from the current session token.
     */
    superAdminOption = helpers.requestOptions(gqlClient.sessionToken || '');

    const applicationOrganization = await getOrCreateOrganization(gqlClient, nameOrg);
    expect(applicationOrganization).toBeDefined();

    const adminUserId = await getOrCreateUser(
      gqlClient,
      applicationOrganization,
      uniqueId,
      true
    );
    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;

    const adminOptions = await impersonate(
      gqlClient,
      adminUserId,
      applicationOrgGUID
    );

    const application = await createApplication(gqlClient, getRequestHeaders(adminOptions));
    expect(application).toBeDefined();

    const applicationRole =
      _.find(application.applicationRoles, (role) =>
        role.name.includes('aiware')
      ) || application.applicationRoles[0];

    const aiwareUserId = await getOrCreateUser(
      gqlClient,
      applicationOrganization,
      uniqueId,
      false,
      applicationRole.id
    );
    aiwareOptions = await impersonate(
      gqlClient,
      aiwareUserId,
      applicationOrgGUID
    );
  });

  it('should create a TDO', async () => {
    expect(aiwareOptions).toBeDefined();
    const result = await gqlClient.sdk.createTDO(
      {
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    tdoId = _.get(result, 'data.createTDO.id', null);
    expect(tdoId).toBeDefined();
  });

  it('should create a TDO with an asset', async () => {
    const result = await gqlClient.sdk.createTDOWithAsset(
      {
        input: {
          name: 'tdo asset test',
          contentType: 'application',
          assetType: 'vtn-standard',
          uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
          startDateTime: '01/22/2025',
          stopDateTime: '01/22/2025'
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    tdoId1 = _.get(result, 'data.createTDOWithAsset.id', null);
    expect(tdoId1).toBeDefined();
  });

  it('should get a TDO by ID', async () => {
    expect(tdoId).toBeDefined();
    const result = await gqlClient.sdk.temporalDataObject(
      { id: tdoId! },
      getRequestHeaders(aiwareOptions!)
    );
    expect(_.get(result, 'data.temporalDataObject.id')).toEqual(tdoId);
  });

  it('should get a list of TDOs', async () => {
    const result = await gqlClient.sdk.temporalDataObjects(
      {},
      getRequestHeaders(aiwareOptions!)
    );
    const tdos = _.get(result, 'data.temporalDataObjects.records', []);
    const tdo = _.find(tdos, (t) => t.id === tdoId);
    expect(tdo).toBeDefined();
  });

  it('should update a TDO', async () => {
    expect(tdoId).toBeDefined();
    const result = await gqlClient.sdk.updateTDO(
      {
        input: {
          id: tdoId!,
          name: 'updated tdo name'
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    tdoId = _.get(result, 'data.updateTDO.id', null);
    const details = _.get(result, 'data.updateTDO.details', {});
    expect(tdoId).toBeDefined();
    expect(details).toHaveProperty('veritoneFile.fileName', 'updated tdo name');
  });

  it('should create an asset', async () => {
    expect(tdoId).toBeDefined();
    const result = await gqlClient.sdk.createAsset(
      {
        input: {
          containerId: tdoId!,
          contentType: 'application/json',
          assetType: 'vtn-standard',
          uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4'
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    assetId = _.get(result, 'data.createAsset.id', null);
    expect(_.get(result, 'data.createAsset.id')).toBeDefined();
  });

  it('should update the created asset', async () => {
    expect(assetId).toBeDefined();
    const result = await gqlClient.sdk.updateAsset(
      {
        input: {
          id: assetId!
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    assetId = _.get(result, 'data.updateAsset.id', null);
    expect(_.get(result, 'data.updateAsset.id')).toBeDefined();
  });

  it('should get the asset by ID', async () => {
    expect(assetId).toBeDefined();
    const result = await gqlClient.sdk.asset(
      { id: assetId! },
      getRequestHeaders(aiwareOptions!)
    );
    const returnedAssetId = _.get(result, 'data.asset.id', null);
    expect(returnedAssetId).toEqual(assetId);
  });

  it('should get engine result by source engineId', async () => {
    expect(tdoId).toBeDefined();
    const result = await gqlClient.sdk.engineResults(
      {
        tdoId: tdoId!,
        engineIds: ['insert-into-index']
      },
      getRequestHeaders(aiwareOptions!)
    );
    const engineResults = _.get(result, 'data.engineResults');
    expect(engineResults).toBeDefined();
  });

  it('should get a signed writable URL', async () => {
    const result = await gqlClient.sdk.getSignedWritableUrl(
      {},
      getRequestHeaders(aiwareOptions!)
    );
    const signedWritableUrl = _.get(result, 'data.getSignedWritableUrl');
    expect(_.get(signedWritableUrl, 'url')).toBeDefined();
    expect(_.get(signedWritableUrl, 'unsignedUrl')).toBeDefined();
    expect(_.get(signedWritableUrl, 'key')).toBeDefined();
    expect(signedWritableUrl).toBeDefined();
  });

  it('should get multiple signed writable URLs', async () => {
    const result = await gqlClient.sdk.getSignedWritableUrls(
      { number: 2, path: 'tdo_apitest', type: 'asset' },
      getRequestHeaders(aiwareOptions!)
    );
    const signedWritableUrl = _.get(result, 'data.getSignedWritableUrls');
    expect(signedWritableUrl).toBeDefined();
  });

  it('should get upload status of a key', async () => {
    const result = await gqlClient.sdk.getUploadStatus(
      { input: { key: '12' } },
      getRequestHeaders(aiwareOptions!)
    );
    const uploadStatus = _.get(result, 'data.getUploadStatus');
    expect(uploadStatus).toBeDefined();
  });

  it('should fetch clone requests', async () => {
    const result = await gqlClient.sdk.cloneRequests(
      {},
      getRequestHeaders(aiwareOptions!)
    );
    const cloneRequests = _.get(result, 'data.cloneRequests');
    expect(cloneRequests).toBeDefined();
  });

  it('should create a root folder', async () => {
    const rootFolderResult = await gqlClient.sdk.createRootFolders(
      { rootFolderType: 'cms' },
      getRequestHeaders(aiwareOptions!)
    );
    expect(_.get(rootFolderResult, 'data.createRootFolders')).toBeDefined();

    const rootFolders = _.get(rootFolderResult, 'data.createRootFolders', []);
    const treeObjectId = rootFolders[1]?.treeObjectId;

    const result = await gqlClient.sdk.createFolder(
      {
        input: {
          name: 'citest-should-delete-graphql-folders',
          description: 'citest-should-delete-graphql-folders-description',
          rootFolderType: 'cms',
          parentId: treeObjectId
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    folderId = _.get(result, 'data.createFolder.id');

    expect(_.get(result, 'data.createFolder.id')).toBeDefined();
    expect(_.get(result, 'data.createFolder.name')).toBeDefined();

    const result1 = await gqlClient.sdk.createFolder(
      {
        input: {
          name: 'citest-should-delete-graphql-folders1',
          description: 'citest-should-delete-graphql-folders1-description',
          rootFolderType: 'cms',
          parentId: treeObjectId
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    folderId1 = _.get(result1, 'data.createFolder.id');

    expect(_.get(result1, 'data.createFolder.id')).toBeDefined();
    expect(_.get(result1, 'data.createFolder.name')).toBeDefined();
  });

  it('should file a TDO into the folder', async () => {
    expect(tdoId).toBeDefined();
    expect(folderId).toBeDefined();
    const result = await gqlClient.sdk.fileTemporalDataObject(
      {
        input: {
          tdoId: tdoId!,
          folderId: folderId!
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    expect(_.get(result, 'data.fileTemporalDataObject.id')).toBeDefined();
  });

  it('should unfile the TDO from the folder', async () => {
    expect(tdoId).toBeDefined();
    expect(folderId).toBeDefined();
    const result = await gqlClient.sdk.unfileTemporalDataObject(
      {
        input: {
          tdoId: tdoId!,
          folderId: folderId!
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    const unfileTemporalDataObject = _.get(result, 'data.unfileTemporalDataObject');
    expect(unfileTemporalDataObject.id).toBeDefined();
    expect(unfileTemporalDataObject.folders).toEqual([]);
  });

  it('move tdo to new folder', async () => {
    expect(folderId).toBeDefined();
    expect(folderId1).toBeDefined();
    const resultTDO = await gqlClient.sdk.createTDO(
      {
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755,
          parentFolderId: folderId!
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    tdoId2 = _.get(resultTDO, 'data.createTDO.id', null);
    expect(tdoId2).toBeDefined();

    const result = await gqlClient.sdk.moveTemporalDataObject(
      {
        input: {
          tdoId: tdoId2!,
          oldFolderId: folderId!,
          newFolderId: folderId1!
        }
      },
      getRequestHeaders(aiwareOptions!)
    );
    expect(_.get(result, 'data.moveTemporalDataObject.id')).toEqual(tdoId2);
  });

  afterAll(async () => {
    const cleanupTasks: Array<() => Promise<void>> = [];

    if (assetId) {
      cleanupTasks.push(async () => {
        try {
          await gqlClient.sdk.deleteAsset(
            { id: assetId! },
            getRequestHeaders(aiwareOptions!)
          );
        } catch (error) {
          console.log(`Failed to delete asset ${assetId}:`, error);
        }
      });
    }

    const tdoIds = [tdoId, tdoId1, tdoId2].filter((id): id is string => !!id);
    for (const id of tdoIds) {
      cleanupTasks.push(async () => {
        try {
          await gqlClient.sdk.deleteTDO(
            { id },
            getRequestHeaders(aiwareOptions!)
          );
        } catch (error) {
          console.log(`Failed to delete TDO ${id}:`, error);
        }
      });
    }

    const folderIds = [folderId, folderId1].filter((id): id is string => !!id);
    for (const id of folderIds) {
      cleanupTasks.push(async () => {
        try {
          await gqlClient.sdk.deleteFolder(
            { input: { id, orderIndex: 0 } },
            getRequestHeaders(aiwareOptions!)
          );
        } catch (error) {
          console.log(`Failed to delete folder ${id}:`, error);
        }
      });
    }

    await Promise.all(cleanupTasks.map((task) => task()));
  });
});

/**
 * Retrieves an organization by name.
 * @param gqlClient - The GraphQL client instance
 * @param name - Organization name to search for
 * @param ignoreExpect - If true, don't assert the org exists
 */
async function getOrganization(
  gqlClient: GraphqlClient,
  name: string,
  ignoreExpect: boolean = false
): Promise<Record<string, unknown> | null> {
  const resultOrg = await gqlClient.sdk.organizations(
    {
      name,
      nameMatch: 'contains'
    }
  );
  const applicationOrg = _.get(resultOrg, 'data.organizations.records[0]');

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg?.name).toContain(name);
  }

  return applicationOrg || null;
}

/**
 * Creates a new test organization.
 * @param gqlClient - The GraphQL client instance
 * @param prefixName - Name prefix for the organization
 */
async function setupTestOrganization(
  gqlClient: GraphqlClient,
  prefixName: string
): Promise<Record<string, unknown> | null> {
  const resultOrg = await gqlClient.sdk.createOrganization({
    input: {
      name: `${prefixName}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'] as OrganizationType[],
      metadata: {
        test: 'value',
        features: {
          automaticPackageCreation: 'enabled'
        }
      },
      applications: []
    }
  });

  expect(resultOrg?.data?.createOrganization?.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg?.data?.createOrganization?.id).toBeDefined();
  expect(resultOrg?.data?.createOrganization?.guid).toBeDefined();

  return await getOrganization(gqlClient, prefixName);
}

/**
 * Gets or creates an organization.
 * @param gqlClient - The GraphQL client instance
 * @param nameOrg - Organization name
 */
async function getOrCreateOrganization(gqlClient: GraphqlClient, nameOrg: string): Promise<Record<string, unknown>> {
  let applicationOrganization = await getOrganization(gqlClient, nameOrg, true);

  if (!applicationOrganization) {
    applicationOrganization = await setupTestOrganization(gqlClient, nameOrg);
  }

  return applicationOrganization!;
}

/**
 * Creates an admin user with specified roles.
 * @param gqlClient - The GraphQL client instance
 * @param uniqueId - Unique identifier for the user
 * @param orgId - Organization ID
 */
async function createAdminUser(
  gqlClient: GraphqlClient,
  uniqueId: number,
  orgId: string
): Promise<string> {
  const result = await gqlClient.sdk.createUser({
    input: {
      name: `${uniqueId}-admin-user-${uuidv4()}@localhost`,
      organizationId: orgId,
      firstName: 'Flow-User',
      lastName: 'Admin',
      jsondata: {
        firstName: 'Flow-User',
        lastName: 'Admin'
      },
      roleIds: ROLES_IDS
    }
  });
  return _.get(result, 'data.createUser.id');
}

/**
 * Creates an aiWARE user with specific role.
 * @param gqlClient - The GraphQL client instance
 * @param uniqueId - Unique identifier for the user
 * @param orgId - Organization ID
 * @param aiwareRoleId - Application role ID
 */
async function createAiwareUser(
  gqlClient: GraphqlClient,
  uniqueId: number,
  orgId: string,
  aiwareRoleId: string
): Promise<string> {
  const result = await gqlClient.sdk.createUser({
    input: {
      name: `${uniqueId}-aiware-user-${uuidv4()}@localhost`,
      organizationId: orgId,
      firstName: 'User',
      lastName: 'Aiware',
      jsondata: {
        firstName: 'User',
        lastName: 'Aiware'
      },
      roleIds: [aiwareRoleId]
    }
  });
  return _.get(result, 'data.createUser.id');
}

/**
 * Gets or creates a user with appropriate roles.
 * @param gqlClient - The GraphQL client instance
 * @param applicationOrganization - Organization object
 * @param uniqueId - Unique identifier for the user
 * @param isAdmin - If true, create/get admin user; otherwise get aiware user
 * @param aiwareRoleId - Application role ID for aiware user
 */
async function getOrCreateUser(
  gqlClient: GraphqlClient,
  applicationOrganization: Record<string, unknown>,
  uniqueId: number,
  isAdmin: boolean = false,
  aiwareRoleId?: string
): Promise<string> {
  const users = (_.get(applicationOrganization, 'users.records', []) || []) as Array<Record<string, unknown>>;

  /**
   * Check if a user has all specified roles.
   */
  const hasAllRoles = (
    user: Record<string, unknown>,
    roleIds: string[]
  ): boolean =>
    _.every(
      roleIds,
      (roleId) =>
        (user.roles as Array<Record<string, unknown>>).some(
          (role) => role.id === roleId
        )
    );

  /**
   * Check if user is single org and active.
   */
  const isSingleOrgUser = (user: Record<string, unknown>): boolean =>
    user.status === 'active' &&
    (user.organizationGuids as string[]).length === 1;

  if (isAdmin) {
    const adminUsers = users.filter(
      (user) => isSingleOrgUser(user) && hasAllRoles(user, ROLES_IDS)
    );
    if (adminUsers.length === 0) {
      return await createAdminUser(gqlClient, uniqueId, applicationOrganization.id as string);
    }

    const adminUser =
      _.find(adminUsers, (user) => user.name.includes('admin')) ||
      adminUsers[0];
    return adminUser.id as string;
  }

  const aiwareRoleIds = [
    'AIWARE_TDO_CREATE',
    'AIWARE_TDO_DELETE',
    'AIWARE_TDO_READ',
    'AIWARE_TDO_UPDATE'
  ];

  const aiwareUsers = users.filter(
    (user) => isSingleOrgUser(user) && hasAllRoles(user, aiwareRoleIds)
  );
  if (aiwareUsers.length === 0) {
    return await createAiwareUser(
      gqlClient,
      uniqueId,
      applicationOrganization.id as string,
      aiwareRoleId || ''
    );
  }

  const aiwareUser =
    _.find(aiwareUsers, (user) => user.name.includes('aiware')) ||
    aiwareUsers[0];
  return aiwareUser.id as string;
}

/**
 * Creates an application with TDO permissions roles.
 * @param gqlClient - The GraphQL client instance
 * @param adminOptions - Authorization headers for the admin user
 */
async function createApplication(
  gqlClient: GraphqlClient,
  adminOptions: Record<string, string>
): Promise<Record<string, unknown>> {
  const result = await gqlClient.sdk.createApplication(
    {
      input: {
        name: `ci-test-app-role-${uuidv4()}`,
        description: 'ci-test-app-role',
        url: 'www.example.com',
        checkPermissions: true,
        status: 'active',
        applicationRoles: {
          id: uuidv4(),
          name: `ci-aiware-test-app-role-${uuidv4()}`,
          description: 'ci-aiware-test-app-role',
          isPrivate: false,
          isAppEventRole: false,
          permissions: [
            'AIWARE_TDO_CREATE',
            'AIWARE_TDO_DELETE',
            'AIWARE_TDO_READ',
            'AIWARE_TDO_UPDATE'
          ]
        }
      }
    },
    adminOptions
  );
  return _.get(result, 'data.createApplication');
}

/**
 * Impersonates a user to get their authorization token.
 * Calls the admin endpoint to generate an impersonation token.
 * @param gqlClient - The GraphQL client instance with superadmin session
 * @param userId - User ID to impersonate
 * @param applicationOrgGUID - Organization GUID
 */
async function impersonate(
  gqlClient: GraphqlClient,
  userId: string,
  applicationOrgGUID: string
): Promise<Record<string, Record<string, string>>> {
  const config = helpers.config;
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;

  const superadminOptions = helpers.requestOptions(gqlClient.sessionToken || '');
  const response = await fetch(url, {
    method: 'GET',
    headers: superadminOptions.headers
  });

  if (!response.ok) {
    throw new Error(`Failed to impersonate user ${userId}: ${response.statusText}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const impersonationToken = _.get(data, 'token');
  if (!impersonationToken) {
    throw new Error(`No token returned from impersonation endpoint for user ${userId}`);
  }

  return helpers.requestOptions(impersonationToken as string);
}
