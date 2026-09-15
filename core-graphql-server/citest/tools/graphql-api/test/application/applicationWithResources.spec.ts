import * as _ from 'lodash';
import * as uuid from 'uuid';
import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ApplicationComponentType,
  ApplicationConfigLevelEnum,
  ApplicationConfigValueEnum,
  ApplicationWorkflowAction,
  ContextMenuExtensionType,
  CreateContextMenuExtension as CreateContextMenuExtensionInput,
  EntityTagType,
  OrganizationStatus,
  UpdateApplicationComponentAction
} from '../../src/gql/gql';
import type { ServerFeatureFlags } from '../helpers/featureFlags';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';
import {
  buildApplicationTestRoleIds,
  getOrCreateOrganization,
  getOrCreateUser,
  getRequestHeaders,
  impersonate,
  RequestOptions
} from '../helpers/application.helper';

/**
 * Feature-flag globals: under jest (how the cirunner CI job runs these specs,
 * via `npm run citest`) they are published by citest/jest.global.setup.js
 * before any spec loads; under local `bun test` the preload in test/setup.ts
 * (wired via bunfig.toml) publishes the same live flags. Reading them
 * synchronously keeps this file free of top-level await, which ts-jest
 * (CommonJS) cannot compile; the gate still resolves before test registration
 * in both runners.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;

const nameOrg = `${citestMarker}-application-resources`;

const ROLES_IDS = buildApplicationTestRoleIds(isDesktopAppEnabled);

const COMPONENT_TYPES: Record<'engines' | 'dataRegistries', ApplicationComponentType> = {
  engines: ApplicationComponentType.Engines,
  dataRegistries: ApplicationComponentType.DataRegistries
};

const WORKFLOW_CYCLE: Array<[ApplicationWorkflowAction, string]> = [
  [ApplicationWorkflowAction.Submit, 'pending'],
  [ApplicationWorkflowAction.Approve, 'approved'],
  [ApplicationWorkflowAction.Deploy, 'active'],
  [ApplicationWorkflowAction.Disable, 'disabled']
];

describe('citest_application: Application with resources', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: IsolatedSuperadmin;
  let superAdminOptions: RequestOptions;
  let adminOptions: RequestOptions;
  let applicationOrgId: string;
  let applicationOrgGUID: string;
  let appPackageId: string;
  let userId: string;
  const uniqueId = Date.now().valueOf();
  const componentIds: Record<'engines' | 'dataRegistries', string[]> = {
    engines: ['00f5fcf8-1ad5-4a24-9f56-877d398d5050', '002818f8-2ebd-44ba-9c46-d8e15eb21710'],
    dataRegistries: ['489a54a0-f594-4f99-b497-7c97652b14bd']
  };

  beforeAll(async () => {
    /**
     * Create the test org via an ISOLATED throwaway superadmin instead of the
     * shared CI superadmin session, so this spec's org lifecycle can never
     * enroll — nor collaterally log out — the session shared by every other
     * spec (see test/helpers/superadminSession.ts and PR #4238).
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    expect(gqlClient.sessionToken).toBeDefined();
    superAdminOptions = isolatedSuperadmin.options;

    const applicationOrganization = await getOrCreateOrganization(
      gqlClient,
      nameOrg,
      { isDesktopAppEnabled }
    );
    userId = await getOrCreateUser(
      gqlClient,
      applicationOrganization,
      uniqueId,
      ROLES_IDS
    );

    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid ?? '';

    adminOptions = await impersonate(
      userId,
      applicationOrgGUID,
      isolatedSuperadmin.token
    );
  });

  describe('Application Lifecycle Approved with resources added at create', () => {
    let contextMenuExtensionPayload: {
      mentions: Array<{ id: string; label: string; url: string; type: ContextMenuExtensionType }>;
      tdos: Array<{ id: string; label: string; url: string; type: ContextMenuExtensionType }>;
      watchlists: Array<{ id: string; label: string; url: string; type: ContextMenuExtensionType }>;
      collections: Array<{ id: string; label: string; url: string; type: ContextMenuExtensionType }>;
    };
    let applicationConfigDefinitionPayload: Array<{
      configKey: string;
      configType: ApplicationConfigValueEnum;
      configLevel: ApplicationConfigLevelEnum;
      required: boolean;
      secured: boolean;
      description: string;
    }>;
    let headerBarPayload: {
      name: string;
      config: {
        help: boolean;
        backgroundColor: string;
        notification: boolean;
        logoSrc: string;
      };
    };
    let applicationId: string;

    it('Prepare application context menu extension', async () => {
      contextMenuExtensionPayload = {
        mentions: [
          {
            id: uuid.v4(),
            label: `${citestMarker} citest mention`,
            url: 'http://www.example.com/${mentionId}',
            type: ContextMenuExtensionType.Mention
          }
        ],
        tdos: [
          {
            id: uuid.v4(),
            label: `${citestMarker} citest tdos`,
            url: 'http://www.example.com/${tdoId}',
            type: ContextMenuExtensionType.Tdo
          }
        ],
        watchlists: [
          {
            id: uuid.v4(),
            label: `${citestMarker} citest watchlists`,
            url: 'http://www.example.com/${watchlistId}',
            type: ContextMenuExtensionType.Watchlist
          }
        ],
        collections: [
          {
            id: uuid.v4(),
            label: `${citestMarker} citest collections`,
            url: 'http://www.example.com/${collectionId}',
            type: ContextMenuExtensionType.Collection
          }
        ]
      };
    });

    it('Prepare application config definition', async () => {
      applicationConfigDefinitionPayload = [
        {
          configKey: `${citestMarker} Hub Test ApplicationConfigDefinition - ${uuid.v4()}-org-key`,
          configType: ApplicationConfigValueEnum.String,
          configLevel: ApplicationConfigLevelEnum.Organization,
          required: false,
          secured: false,
          description: 'Tests org-level config definition for Hub.'
        },
        {
          configKey: `${citestMarker} Hub Test ApplicationConfigDefinition - ${uuid.v4()}-org-key`,
          configType: ApplicationConfigValueEnum.String,
          configLevel: ApplicationConfigLevelEnum.User,
          required: false,
          secured: false,
          description: 'Tests user-level config definition for Hub.'
        }
      ];
    });

    it('Prepare application header bar data', async () => {
      headerBarPayload = {
        name: `${citestMarker}-headerbar data`,
        config: {
          help: true,
          backgroundColor: '#0000FF',
          notification: false,
          logoSrc: 'www.example.com'
        }
      };
    });

    it('Create an application with multiple resources', async () => {
      const result = await gqlClient.sdk.createApplication(
        {
          input: {
            name: `${citestMarker} all resources application - ${uniqueId} id`,
            description: `${citestMarker} all resources application - ${uniqueId} id`,
            url: 'www.example.com',
            oauth2RedirectUrls: ['www.example.com/callback'],
            checkPermissions: true,
            iconUrl: 'http://abc.com/link-icon.png',
            contextMenuExtensions: contextMenuExtensionPayload,
            headerbarEnabled: true,
            headerbar: headerBarPayload,
            entityTags: [
              {
                tagKey: `${citestMarker} citest application tag key`,
                tagValue: `${citestMarker} citest application tag value`,
                entityType: EntityTagType.App
              }
            ],
            applicationConfigDefinition: applicationConfigDefinitionPayload
          }
        },
        getRequestHeaders(adminOptions)
      );

      const created = result.data.createApplication;
      applicationId = created?.id ?? '';
      expect(applicationId).toBeDefined();
      expect(created?.contextMenuExtensions).toBeDefined();
      expect(created?.applicationConfigDefinition?.count ?? 0).toBeGreaterThan(0);
      expect(created?.applicationHeaderbar).toBeDefined();
      expect(created?.entityTags?.[0]?.entityType).toBe(EntityTagType.App);
    });

    it('Query application', async () => {
      const result = await gqlClient.sdk.application(
        { id: applicationId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.application?.id).toBeDefined();
    });

    it('Workflow application through cycle submit -> approve -> deploy', async () => {
      for (const [action, status] of WORKFLOW_CYCLE) {
        const result = await gqlClient.sdk.applicationWorkflow(
          { input: { id: applicationId, action } },
          getRequestHeaders(adminOptions)
        );
        expect(result.data.applicationWorkflow?.id).toEqual(applicationId);
        expect(result.data.applicationWorkflow?.status).toEqual(status);
      }
    });

    it('Delete application', async () => {
      const result = await gqlClient.sdk.deleteApplication(
        { id: applicationId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.deleteApplication?.id).toEqual(applicationId);
    });
  }); // Testing

  describe('Application Lifecycle Approved with resources added each update', () => {
    let applicationId: string;
    let contextMenuExtensionPayload: {
      mentions: Array<{ id: string; label: string; url: string }>;
      tdos: Array<{ id: string; label: string; url: string }>;
    };
    let headerBarPayload: {
      name: string;
      config: {
        help: boolean;
        backgroundColor: string;
        notification: boolean;
        logoSrc: string;
      };
    };
    const applicationData = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: ['www.example.com/callback'],
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };

    it('Create a basic application', async () => {
      const result = await gqlClient.sdk.createApplication(
        {
          input: {
            name: applicationData.name,
            description: applicationData.description,
            url: applicationData.url,
            oauth2RedirectUrls: applicationData.oauth2RedirectUrls,
            checkPermissions: applicationData.checkPermissions,
            iconUrl: applicationData.iconUrl
          }
        },
        getRequestHeaders(adminOptions)
      );

      const created = result.data.createApplication;
      applicationId = created?.id ?? '';
      expect(applicationId).toBeDefined();
      expect(created?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Prepare application context menu extension', async () => {
      contextMenuExtensionPayload = {
        mentions: [
          {
            id: uuid.v4(),
            label: `${citestMarker} citest mention`,
            url: 'http://www.example.com/${mentionId}'
          }
        ],
        tdos: [
          {
            id: uuid.v4(),
            label: `${citestMarker} citest tdos`,
            url: 'http://www.example.com/${tdoId}'
          }
        ]
      };
    });

    it('Update application with context menu extension', async () => {
      const result = await gqlClient.sdk.updateApplication(
        {
          input: {
            id: applicationId,
            contextMenuExtensions: contextMenuExtensionPayload
          }
        },
        getRequestHeaders(superAdminOptions)
      );
      expect(result.data.updateApplication?.id).toEqual(applicationId);
      expect(result.data.updateApplication?.contextMenuExtensions).toBeDefined();
    });

    it('Prepare application header bar data', async () => {
      headerBarPayload = {
        name: `${citestMarker}-headerbar data`,
        config: {
          help: true,
          backgroundColor: '#0000FF',
          notification: false,
          logoSrc: 'www.example.com'
        }
      };
    });

    it('Update application with header bar', async () => {
      const result = await gqlClient.sdk.updateApplication(
        {
          input: {
            id: applicationId,
            headerbarEnabled: true,
            headerbar: headerBarPayload
          }
        },
        getRequestHeaders(superAdminOptions)
      );
      expect(result.data.updateApplication?.id).toEqual(applicationId);
    });

    it.each(['engines', 'dataRegistries'] as const)(
      'Add %s application component',
      async (componentType) => {
        const localComponentIds: Record<'engines' | 'dataRegistries', string[]> = {
          engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55', 'ea0ada2a-7571-4aa5-9172-b5a7d989b041'],
          dataRegistries: ['0b3ddb59-3252-4251-8c22-ea833984e60b']
        };
        const result = await gqlClient.sdk.updateApplicationComponent(
          {
            input: {
              id: applicationId,
              type: COMPONENT_TYPES[componentType],
              componentIds: localComponentIds[componentType],
              action: UpdateApplicationComponentAction.Add
            }
          },
          getRequestHeaders(adminOptions)
        );

        const records = result.data.updateApplicationComponent[componentType]?.records ?? [];
        expect(records.map((r) => r?.id).sort()).toEqual(
          [...localComponentIds[componentType]].sort()
        );
      }
    );

    it('Cycle application by status pending -> approved -> active', async () => {
      for (const [action, status] of WORKFLOW_CYCLE) {
        const result = await gqlClient.sdk.applicationWorkflow(
          { input: { id: applicationId, action } },
          getRequestHeaders(adminOptions)
        );
        expect(result.data.applicationWorkflow?.id).toEqual(applicationId);
        expect(result.data.applicationWorkflow?.status).toEqual(status);
      }
    });

    it('Delete application', async () => {
      const result = await gqlClient.sdk.deleteApplication(
        { id: applicationId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.deleteApplication?.id).toEqual(applicationId);
    });
  });

  describe('Application Components', () => {
    let acApplicationId: string;
    const applicationComponentTypes = ['engines', 'dataRegistries'] as const;

    it('create application for application components', async () => {
      const result = await gqlClient.sdk.createApplication(
        {
          input: {
            name: `${citestMarker} Citest App 3 - ${uniqueId}`,
            description: `${citestMarker} Citest App 3`,
            url: 'www.example.com',
            oauth2RedirectUrls: ['www.example.com/callback'],
            checkPermissions: false
          }
        },
        getRequestHeaders(adminOptions)
      );

      const created = result.data.createApplication;
      acApplicationId = created?.id ?? '';
      expect(acApplicationId).toBeDefined();
      expect(created?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it.each(applicationComponentTypes)(
      'add %s application component',
      async (componentType) => {
        const localComponentIds: Record<'engines' | 'dataRegistries', string[]> = {
          engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55', 'ea0ada2a-7571-4aa5-9172-b5a7d989b041'],
          dataRegistries: ['0b3ddb59-3252-4251-8c22-ea833984e60b']
        };
        const result = await gqlClient.sdk.updateApplicationComponent(
          {
            input: {
              id: acApplicationId,
              type: COMPONENT_TYPES[componentType],
              componentIds: localComponentIds[componentType],
              action: UpdateApplicationComponentAction.Add
            }
          },
          getRequestHeaders(adminOptions)
        );
        const records = result.data.updateApplicationComponent[componentType]?.records ?? [];
        expect(records.map((r) => r?.id).sort()).toEqual(
          [...localComponentIds[componentType]].sort()
        );
      }
    );

    it.each(applicationComponentTypes)(
      'remove app component %s',
      async (componentType) => {
        const result = await gqlClient.sdk.updateApplicationComponent(
          {
            input: {
              id: acApplicationId,
              type: COMPONENT_TYPES[componentType],
              componentIds: componentIds[componentType],
              action: UpdateApplicationComponentAction.Remove
            }
          },
          getRequestHeaders(adminOptions)
        );

        const recordIds = (result.data.updateApplicationComponent[componentType]?.records ?? []).map(
          (r) => r?.id
        );
        expect(recordIds).toEqual(expect.not.arrayContaining(componentIds[componentType]));
      }
    );

    it('cleanup application component application', async () => {
      const result = await gqlClient.sdk.deleteApplication(
        { id: acApplicationId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.deleteApplication?.id).toEqual(acApplicationId);
    });
  });

  describe('Application Automatic Package', () => {
    let apApplicationId: string;

    it('create application for application package', async () => {
      const result = await gqlClient.sdk.createApplication(
        {
          input: {
            name: `${citestMarker} Citest App 5 - ${uniqueId}`,
            description: `${citestMarker} Citest App 5`,
            url: 'www.example.com',
            oauth2RedirectUrls: ['www.example.com/callback'],
            checkPermissions: false
          }
        },
        getRequestHeaders(adminOptions)
      );

      const created = result.data.createApplication;
      apApplicationId = created?.id ?? '';
      expect(apApplicationId).toBeDefined();
      expect(created?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('creates an application package when creating an application', async () => {
      const result = await gqlClient.sdk.queryPackages(
        { primaryResourceId: apApplicationId },
        getRequestHeaders(adminOptions)
      );

      const packages = result.data.packages;
      expect(packages).toBeDefined();
      expect(packages.records).toBeDefined();
      expect(packages.records.length).toBeGreaterThan(0);
      expect(packages.records[0]?.id).toBeDefined();
      expect(packages.records[0]?.primaryResource).toBeDefined();
      expect(packages.records[0]?.primaryResource?.resourceId).toEqual(apApplicationId);
      expect(packages.records[0]?.primaryResource?.resourceType).toEqual('application');

      appPackageId = packages.records[0]?.id ?? '';
    });

    it('delete application package', async () => {
      const result = await gqlClient.sdk.packageDelete(
        { id: appPackageId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.packageDelete).toBeDefined();
      expect(result.data.packageDelete?.success).toEqual(true);
    });

    it('cleanup application package application', async () => {
      const result = await gqlClient.sdk.deleteApplication(
        { id: apApplicationId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.deleteApplication?.id).toEqual(apApplicationId);
    });
  });

  describe('Application Context Menu Extension', () => {
    let cmeApplicationId: string;
    let contextMenuExtensionId: string;

    it('create application for context menu extension', async () => {
      const result = await gqlClient.sdk.createApplication(
        {
          input: {
            name: `${citestMarker} Citest App 2 - ${uniqueId}`,
            description: `${citestMarker} Citest App 2`,
            url: 'www.example.com',
            oauth2RedirectUrls: ['www.example.com/callback'],
            checkPermissions: false
          }
        },
        getRequestHeaders(adminOptions)
      );

      const created = result.data.createApplication;
      cmeApplicationId = created?.id ?? '';
      expect(cmeApplicationId).toBeDefined();
      expect(created?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('create context menu extension', async () => {
      const payload = {
        id: cmeApplicationId,
        label: 'Foo Mention',
        url: 'http://www.example.com/${mentionId}',
        type: ContextMenuExtensionType.Mention
      };

      const result = await gqlClient.sdk.createContextMenuExtension(
        { input: payload },
        getRequestHeaders(adminOptions)
      );

      expect(result.data.createContextMenuExtension).toEqual(
        expect.objectContaining(_.omit(payload, 'id'))
      );
      expect(result.data.createContextMenuExtension?.id).toBeDefined();
      expect(result.data.createContextMenuExtension?.id).not.toEqual(cmeApplicationId);

      contextMenuExtensionId = result.data.createContextMenuExtension?.id ?? '';
    });

    it('delete context menu extension', async () => {
      const result = await gqlClient.sdk.deleteContextMenuExtension(
        { input: { id: contextMenuExtensionId } },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.deleteContextMenuExtension).toEqual(
        expect.objectContaining({ id: contextMenuExtensionId })
      );
    });

    /**
     * Schema note: `url` on CreateContextMenuExtension is nullable in the current
     * schema, so only `id`, `label` and `type` are actually required.
     */
    it.each(['id', 'label', 'type'] as const)(
      'createContextMenuExtension throws if %s is missing',
      async (field) => {
        const payload: CreateContextMenuExtensionInput = {
          id: cmeApplicationId,
          label: 'Foo Mention',
          url: 'http://www.example.com/${mentionId}',
          type: ContextMenuExtensionType.Mention
        };

        const incompletePayload = _.omit(
          payload,
          field
        ) as unknown as CreateContextMenuExtensionInput;

        await expect(
          gqlClient.sdk.createContextMenuExtension(
            { input: incompletePayload },
            getRequestHeaders(adminOptions)
          )
        ).rejects.toThrow(field);
      }
    );

    it('cleanup application context menu application', async () => {
      const result = await gqlClient.sdk.deleteApplication(
        { id: cmeApplicationId },
        getRequestHeaders(adminOptions)
      );
      expect(result.data.deleteApplication?.id).toEqual(cmeApplicationId);
    });
  });

  afterAll(async () => {
    try {
      if (userId) {
        await gqlClient.sdk.deleteUser({ id: userId });
      }
    } catch (error) {
      console.error('Error deleting user in afterAll:', error);
    }

    try {
      if (applicationOrgId) {
        await gqlClient.sdk.updateOrganization({
          input: {
            id: applicationOrgId,
            status: OrganizationStatus.Deleted
          }
        });
      }
    } catch (error) {
      console.error('Error deleting organization in afterAll:', error);
    }

    /**
     * Tear down the throwaway superadmin org/user last — it uses the shared
     * bootstrap session internally, so it works even after the spec's own
     * teardown; failures are swallowed and logged by the helper.
     */
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });
});
