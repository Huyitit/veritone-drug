import { helpers } from '../../src/helpers/index';
import * as _ from 'lodash';
import * as uuid from 'uuid';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ApplicationStatus,
  ApplicationWorkflowAction,
  AuthPermissionType,
  ContextMenuExtensionType,
  DeploymentModel,
  OrganizationType,
  UserStatus,
  UserLoginMutation
} from '../../src/gql';
import { getCitestMarker } from '../helpers/citestGlobals';

const config = helpers.config;

var token: string;
var apiToken: string;
var env = config.env;
var url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
var userId: string;
var orgId: string;
var newAppId: string;
var roleId: string;
var createdContextMenuId: string;
var newUserId: string, newUserIdCreatedByApiToken: string;

/**
 * Groups the logged-in user belongs to, as returned by the userLogin mutation.
 * The generated type has no top-level named export, so it is derived by indexed
 * access; both the array and its members are nullable in the schema.
 */
type LoginGroups = NonNullable<
  NonNullable<UserLoginMutation['userLogin']>['groups']
>;
let arrGroups: LoginGroups = [];

var userName: string;
var appKey = Date.now();

var debug = config.debug && config.debug === true;

const userAgent = config.userAgent || 'core-graphql-server test';

let bucketPrefix = env;
/** Shape of the `{ headers }` objects produced by `helpers.requestOptions`. */
type RequestOptions = { headers?: Record<string, string> };
let userTokenAuthorization: RequestOptions = {};
let citestApiTokenId: string;
let citestApiTokenHash: string;
switch (env) {
  case 'dev':
  case 'aws-dev':
    bucketPrefix = 'dev';
    break;
  case 'prod':
  case 'aws-prod':
    bucketPrefix = 'prod';
    break;
  case 'stage':
  case 'aws-stage':
    bucketPrefix = 'stage';
    break;
}

const imageUrl = `https://${bucketPrefix}-veritone-ugc.s3.amazonaws.com/dCJqaM5ZQ2y9eFpWIpUB_Veritone-stacked-logo-300x300.jpg`;
/**
 * Application/organization lifecycle tests are gated off on local environments.
 *
 * They depend on infrastructure the local compose stack does not provide (app
 * approval/deploy workflows, MFA verification, org provisioning), so they run
 * only against dev/stage/prod where that backend exists. Inherited verbatim
 * from the legacy citest/auth/admin.spec.js.
 */
const isCurrentEnvLocal = () => (env.includes('local') ? xit : it);
const citestMarker = getCitestMarker();
let sdkClient: GraphqlClient;
let sdkClientWithApiToken: GraphqlClient;
const getRequestHeaders = (
  options: RequestOptions
): Record<string, string> | undefined => options.headers ?? undefined;

describe('citest_auth: admin tests', () => {
  let options = {
    headers: {
      'User-Agent': userAgent,
      Accept: '*/*'
    }
  };

  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    sdkClientWithApiToken = await createGraphqlClient(AuthType.API_KEY, env);
    expect(sdkClient.sessionToken).toBeDefined();
    const result = await sdkClient.sdk.userLogin({
      input: {
        password: config.password,
        userName: config.userName
      }
    });
    const loginData = _.get(result, 'data.userLogin');
    token = _.get(loginData, 'token', '')!;
    userTokenAuthorization = {
      headers: { Authorization: `Bearer ${token}` }
    };
    apiToken = _.get(loginData, 'apiToken') || config.apiToken || token;
    userId = _.get(loginData, 'user.id', '');
    // the following assumes that user belongs to the same org as the test API token
    const torg = _.get(loginData, 'organization.id');
    const roles = _.get(loginData, 'user.roles', []);
    if (Array.isArray(roles) && roles.length > 0) {
      roleId = roles[0].id;
    }
    if (torg) orgId = torg.toString();
    userName = _.get(loginData, 'user.name', '');
    arrGroups = _.get(loginData, 'groups', []);
    const billingUpdatedDatetime = _.get(
      loginData,
      'organization.billingUpdatedDatetime'
    );
    let cookie = _.get(result, '_response.headers.set-cookie', []);

    expect(apiToken).toBeDefined();
    expect(token).toBeDefined();
    expect(userId).toBeDefined();
    expect(arrGroups).toBeDefined();
    expect(cookie).toBeDefined();
    expect(billingUpdatedDatetime).toBeDefined();

    switch (env) {
      case 'stage': {
        expect(cookie?.some((c: string) => c?.includes('Domain='))).toEqual(
          true
        );
        expect(
          cookie?.some((c: string) => c?.includes('stage-veritone-session-id='))
        ).toEqual(true);
        break;
      }

      case 'dev': {
        expect(cookie?.some((c: string) => c?.includes('Domain='))).toEqual(
          true
        );
        expect(
          cookie?.some((c: string) => c?.includes('dev-veritone-session-id='))
        ).toEqual(true);
        break;
      }

      default: {
        cookie?.some((c: string) => c?.includes('veritone-session-id'));
      }
    }
  });

  it('should validate token', async () => {
    const result = await sdkClient.sdk.validateToken({ token });

    expect(_.get(result, 'data.validateToken.token')).toEqual(token);
    expect(_.get(result, 'data.validateToken.apiToken')).toBeFalsy();
    expect(_.get(result, 'data.validateToken.user.name')).toEqual(userName);
  });

  it('should refresh token', async () => {
    let refreshToken = {};

    const result = await sdkClient.sdk.refreshToken({ token });
    refreshToken = _.get(result, 'data.refreshToken', {});
    expect(_.get(refreshToken, 'token')).toEqual(token);
    expect(_.get(refreshToken, 'apiToken')).toBeFalsy();
    expect(_.get(refreshToken, 'user.name')).toEqual(userName);
  });

  it('should get org api tokens', async () => {
    const result = await sdkClient.sdk.tokens();
    expect(_.get(result, 'data.tokens[0].id')).toBeDefined();
  });

  it('get user by id', async () => {
    const result = await sdkClient.sdk.usersWithRoles({ id: userId });
    expect(_.get(result, 'data.users.records')).toHaveLength(1);
    expect(
      _.get(result, 'data.users.records[0].organization.status')
    ).toBeDefined();
  });

  it('get user with convenience function', async () => {
    const result = await sdkClient.sdk.user({ id: userId });
    expect(_.get(result, 'data.user.id')).toEqual(userId);
    expect(_.get(result, 'data.user.organization.status')).toBeDefined();
    expect(_.get(result, 'data.user.passwordUpdatedDateTime')).toBeDefined();
    expect(_.get(result, 'data.user.createdDateTime')).toBeDefined();
    expect(_.get(result, 'data.user.modifiedDateTime')).toBeDefined();
    expect(_.get(result, 'data.user.rootFolder.id')).toBeDefined();
  });

  it('get user with invalid id', async () => {
    await expect(sdkClient.sdk.user({ id: 'not a uuid' })).rejects.toThrow(
      'not_found'
    );
  });

  it('get current user', async () => {
    const result = await sdkClient.sdk.me();
    expect(_.get(result, 'data.me.id')).toEqual(userId);
    expect(_.get(result, 'data.me.organizationId')).toBeDefined();
    expect(_.get(result, 'data.me.organization.id')).toBeDefined();
    expect(
      _.get(result, 'data.me.organization.internalApplicationId')
    ).toBeDefined();
  });

  it('get current user - api token', async () => {
    var query = `query {
      me  {
          id
          name
          roles {

              name
              id
              permissions {
                records {
                  name
                  id
                }
              }

          }
        }

    }

    `;

    const optionsWithApiToken = helpers.requestOptions(apiToken);
    const result = await sdkClientWithApiToken.query(
      query,
      null,
      getRequestHeaders(optionsWithApiToken)
    );

    expect(_.get(result, 'me.name')).toEqual(
      expect.stringContaining('API key for')
    );
  });

  it('get current user with org - api token', async () => {
    const result = await sdkClient.sdk.me();

    expect(_.get(result, 'data.me.id')).toBeDefined();
    expect(_.get(result, 'data.me.organization')).toBeTruthy();
  });

  it('get user by name', async () => {
    const result = await sdkClient.sdk.usersByName({ name: userName });
    expect(_.get(result, 'data.users.records')).toHaveLength(1);
  });

  it('get orgs by id', async () => {
    const result = await sdkClient.sdk.organizations({ id: orgId });
    expect(_.get(result, 'data.organizations.records')).toHaveLength(1);
  });

  it('get org by id', async () => {
    const result = await sdkClient.sdk.organizationDetails({ id: orgId });

    expect(_.get(result, 'data.organization.id')).toEqual(orgId);
    expect(_.get(result, 'data.organization.jsondata')).toBeDefined();
    expect(_.get(result, 'data.organization.rootFolder')).toBeDefined();
  });

  //FIXME: validate that the returned org has the requested kvp
  it('get org by feature', async () => {
    const result = await sdkClient.sdk.organizations({
      kvpProperty: 'features.mentionListing.comments',
      kvpValue: 'true'
    });
    expect(_.get(result, 'data.organizations.records.length')).toBeGreaterThan(
      1
    );
  });

  isCurrentEnvLocal()('create an organization', async () => {

    const variables = {
      kvp: {
        test: 'value'
      },
      apps: [
        {
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          applicationName: 'CMS',
          applicationKey: 'cms',
          applicationStatus: 'active',
          applicationDescription:
            'With Veritone CMS, you can create, share, run cognitive engines, and keep all your files together to share with your organization.',
          applicationIconUrl:
            'https://static.veritone.com/veritone-ui/appicons-2/cms.png',
          applicationIconSvg:
            'https://static.veritone.com/veritone-ui/app-icons-svg/cms-app.svg',
          applicationUrl: 'https://cms.aws-dev.veritone.com',
          oauth2RedirectUrls: null,
          permissionsRequired: null,
          createdDate: '2017-05-23T01:55:05.000Z',
          updatedDate: '2018-06-07T20:29:03.000Z',
          deploymentModel: 0,
          applicationCheckPermissions: true,
          validStateActions: ['edit', 'delete', 'disable'],
          signedApplicationIconUrl:
            'https://static.veritone.com/veritone-ui/appicons-2/cms.png'
        },
        {
          applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
          applicationKey: 'admin'
        },
        {
          applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
          applicationKey: 'developer'
        },
        {
          applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
          applicationKey: 'discovery'
        }
      ]
    };
    const result = await sdkClient.sdk.createOrganization({
      input: {
        name: `${citestMarker}-${uuid.v4()}`,
        businessUnit: 'Legal',
        types: [OrganizationType.Agency, OrganizationType.Broadcaster],
        metadata: variables.kvp,
        applications: variables.apps
      }
    });

    expect(_.get(result, 'data.createOrganization.type')).toEqual(
      expect.arrayContaining([
        OrganizationType.Agency,
        OrganizationType.Broadcaster
      ])
    );
    expect(_.get(result, 'data.createOrganization.jsondata')).toHaveProperty(
      'value'
    );
    // input CMS + adminApp + cmsApp (GUID)
    expect(
      _.get(result, 'data.createOrganization.jsondata.applicationIds')
    ).toHaveLength(3);
    // newFilePicker flag should be enabled in the new organization

    const useNewFilePickerFeature = _.get(
      result,
      'data.createOrganization.jsondata.features.newFilePicker'
    );
    expect(useNewFilePickerFeature).toEqual('enabled');
  });

  it('get all permissions', async () => {
    const result = await sdkClient.sdk.getPermissions({ limit: 5 });
    expect(_.get(result, 'data.permissions.records')).toHaveLength(5);
  });

  /**
   * FIXME: skipped. The context-menu extension URLs below interpolate mentionId,
   * tdoId, watchlistId and collectionId, none of which this spec ever defines —
   * so the template variables are sent through literally.
   */
  isCurrentEnvLocal()('create an application', async () => {
    const mentionQuery = 'mentionId=${mentionId}';
    const tdoQuery = 'tdoId=${tdoId}';
    const watchlistQuery = 'watchlistId=${watchlistId}';
    const collectionQuery = 'collectionId=${collectionId}';

    const result = await sdkClient.sdk.createApplication({
      input: {
        name: `${citestMarker}-testapp_${appKey}`,
        // key: `${citestMarker}-testapp_${appKey}`,
        deploymentModel: DeploymentModel.FullyNetworkIsolated,
        description: 'test application',
        iconUrl: imageUrl,
        iconSvg: imageUrl,
        url: 'http://localhost/app',
        checkPermissions: true,
        contextMenuExtensions: {
          mentions: [
            {
              type: ContextMenuExtensionType.Mention,
              label: `${citestMarker}-testMentions`,
              url: `https://www.google.com?${mentionQuery}`
            }
          ],
          tdos: [
            {
              type: ContextMenuExtensionType.Tdo,
              label: `${citestMarker}-testTdos`,
              url: `https://www.google.com?${tdoQuery}`
            }
          ],
          watchlists: [
            {
              type: ContextMenuExtensionType.Watchlist,
              label: `${citestMarker}-testWatchlists`,
              url: `https://www.google.com?${watchlistQuery}`
            }
          ],
          collections: [
            {
              type: ContextMenuExtensionType.Collection,
              label: `${citestMarker}-testCollections`,
              url: `https://www.google.com?${collectionQuery}`
            }
          ]
        }
      }
    });
    newAppId = _.get(result, 'data.createApplication.id', '');
    createdContextMenuId = _.get(
      result,
      'data.createApplication.contextMenuExtensions.mentions[0].id',
      ''
    );
    expect(_.get(result, 'data.createApplication.id')).toBeDefined();
    expect(
      _.get(result, 'data.createApplication.iconUrl', '').length
    ).toBeGreaterThanOrEqual(imageUrl.length);
    expect(
      _.get(result, 'data.createApplication.iconSvg', '').length
    ).toBeGreaterThanOrEqual(imageUrl.length);
  });

  isCurrentEnvLocal()(
    'should error when creating a context menu extension without containing a template string variable',
    async () => {
      await expect(
        sdkClient.sdk.createApplication({
          input: {
            name: `${citestMarker}-testapp_${appKey}123`,
            // key: `${citestMarker}-testapp_${appKey}123`,
            deploymentModel: DeploymentModel.FullyNetworkIsolated,
            description: 'test application',
            url: 'http://localhost/app',
            checkPermissions: true,
            contextMenuExtensions: {
              mentions: [
                {
                  type: ContextMenuExtensionType.Mention,
                  label: `${citestMarker}-testMentions`,
                  url: 'https://www.google.com'
                }
              ]
            }
          }
        })
      ).rejects.toThrow('${mentionId} is required');
    }
  );

  //FIXME:
  isCurrentEnvLocal()(
    'should error when creating an application /w a duplicate name/key',
    function () {
      return expect(
        sdkClient.sdk.createApplication({
          input: {
            name: `${citestMarker}-testapp_${appKey}`,
            // key: `${citestMarker}-testapp_${appKey}`,
            deploymentModel: DeploymentModel.FullyNetworkIsolated,
            description: 'test application',
            url: 'http://localhost/app',
            checkPermissions: true
          }
        })
      ).rejects.toThrow('An application with this name already exists');
    }
  );

  //FIXME:
  isCurrentEnvLocal()('get an application', async () => {
    var theAppId;

    const result = await sdkClient.sdk.applications({
      id: newAppId,
      status: ApplicationStatus.Draft
    });
    theAppId =
      _.get(result, 'data.applications.count', 0) > 0
        ? _.get(result, 'data.applications.records[0].id')
        : null;
    expect(theAppId).toEqual(newAppId);
    expect(
      _.get(result, 'data.applications.records[0].validStateActions', [])
    ).toEqual(expect.arrayContaining(['edit', 'delete']));
    expect(
      // result.applications.records[0].clientSecret
      _.get(result, 'data.applications.records[0].clientSecret')
    ).toEqual(null);
    expect(
      _.get(
        result,
        'data.applications.records[0].contextMenuExtensions.mentions[0].url'
      )
    ).toEqual('https://www.google.com?mentionId=${mentionId}');
    expect(
      _.get(
        result,
        'data.applications.records[0].contextMenuExtensions.tdos[0].url'
      )
    ).toEqual('https://www.google.com?tdoId=${tdoId}');
    expect(
      _.get(
        result,
        'data.applications.records[0].contextMenuExtensions.watchlists[0].url'
      )
    ).toEqual('https://www.google.com?watchlistId=${watchlistId}');
    expect(
      _.get(
        result,
        'data.applications.records[0].contextMenuExtensions.collections[0].url'
      )
    ).toEqual('https://www.google.com?collectionId=${collectionId}');
  });

  isCurrentEnvLocal()('get an application - convenience function', async () => {
    var application = null;
    var theAppId;

    const result = await sdkClient.sdk.application({ id: newAppId });
    application = _.get(result, 'data.application', null);
    theAppId = _.get(result, 'data.application.id', null);

    expect(theAppId).toEqual(newAppId);
    expect(application?.clientSecret).toBeDefined();
    expect(
      _.get(application, 'contextMenuExtensions.mentions[0].url')
    ).toEqual('https://www.google.com?mentionId=${mentionId}');
    expect(
      _.get(application, 'contextMenuExtensions.tdos[0].url')
    ).toEqual('https://www.google.com?tdoId=${tdoId}');
    expect(
      _.get(application, 'contextMenuExtensions.watchlists[0].url')
    ).toEqual('https://www.google.com?watchlistId=${watchlistId}');
    expect(
      _.get(application, 'contextMenuExtensions.collections[0].url')
    ).toEqual('https://www.google.com?collectionId=${collectionId}');
  });

  isCurrentEnvLocal()('submit an application', async () => {
    const result = await sdkClient.sdk.applicationWorkflow({
      input: {
        id: newAppId,
        action: ApplicationWorkflowAction.Submit
      }
    });
    expect(
      _.get(result, 'data.applicationWorkflow.id')
    ).toEqual(newAppId);
    expect(
      _.get(result, 'data.applicationWorkflow.status')
    ).toEqual('pending');
  });

  //FIXME:
  isCurrentEnvLocal()('reject an application', async () => {
    const result = await sdkClient.sdk.applicationWorkflow({
      input: {
        id: newAppId,
        action: ApplicationWorkflowAction.Reject
      }
    });
    expect(_.get(result, 'data.applicationWorkflow.id')).toEqual(newAppId);
    expect(_.get(result, 'data.applicationWorkflow.status')).toEqual(
      'rejected'
    );
  });

  //FIXME:
  isCurrentEnvLocal()('update an application', async () => {
    const mentionQuery = 'mentionId=${mentionId}';

    const result = await sdkClient.sdk.updateApplication({
      input: {
        id: newAppId,
        description: 'updated description',
        checkPermissions: false,
        contextMenuExtensions: {
          mentions: [
            {
              id: createdContextMenuId,
              label: citestMarker + '-testMentions2',
              url: 'https://www.google.com?mentionId=${mentionId}'
            }
          ]
        }
      }
    });
    expect(_.get(result, 'data.updateApplication.id')).toEqual(newAppId);
    expect(_.get(result, 'data.updateApplication.description')).toEqual(
      'updated description'
    );
    expect(
      _.get(
        result,
        'data.updateApplication.contextMenuExtensions.mentions[0].label'
      )
    ).toEqual(citestMarker + '-testMentions2');
    expect(_.get(result, 'data.updateApplication.url')).toEqual(
      'http://localhost/app'
    );
  });

  isCurrentEnvLocal()('bulk delete context menu extensions', async () => {
    var theDeletedId;

    const result = await sdkClient.sdk.bulkDeleteContextMenuExtensions({
      input: { ids: [createdContextMenuId] }
    });

    theDeletedId = _.get(
      result,
      'data.bulkDeleteContextMenuExtensions.mentions[0].id'
    );
    expect(theDeletedId).toEqual(createdContextMenuId);
  });

  isCurrentEnvLocal()('approve an application', async () => {
    const result = await sdkClient.sdk.applicationWorkflow({
      input: {
        id: newAppId,
        action: ApplicationWorkflowAction.Approve
      }
    });
    expect(_.get(result, 'data.applicationWorkflow.id')).toEqual(newAppId);
    expect(_.get(result, 'data.applicationWorkflow.status')).toEqual(
      'approved'
    );
  });

  isCurrentEnvLocal()('deploy an application', async () => {
    const result = await sdkClient.sdk.applicationWorkflow({
      input: {
        id: newAppId,
        action: ApplicationWorkflowAction.Deploy
      }
    });
    expect(_.get(result, 'data.applicationWorkflow.id')).toEqual(newAppId);
    expect(_.get(result, 'data.applicationWorkflow.status')).toEqual('active');
  });

  isCurrentEnvLocal()('disable an application', async () => {
    const result = await sdkClient.sdk.applicationWorkflow({
      input: {
        id: newAppId,
        action: ApplicationWorkflowAction.Disable
      }
    });

    expect(_.get(result, 'data.applicationWorkflow.id')).toEqual(newAppId);
    expect(_.get(result, 'data.applicationWorkflow.status')).toEqual(
      'disabled'
    );
  });

  isCurrentEnvLocal()('delete an application', async () => {
    const result = await sdkClient.sdk.deleteApplication({ id: newAppId });
    expect(_.get(result, 'data.deleteApplication.id')).toEqual(newAppId);
  });

  it('create a user', async () => {
    const result = await sdkClient.sdk.createUser({
      input: {
        name: `${citestMarker}-user_${appKey}@localhost`,
        organizationId: orgId,
        roleIds: ['912e377e-f4a4-4184-8db1-baa9670d8081'],
        firstName: 'First',
        lastName: 'Last',
        jsondata: {
          foo: 'bar'
        }
      }
    });
    newUserId = _.get(result, 'data.createUser.id', '');
    expect(newUserId).toBeDefined();
    expect(_.get(result, 'data.createUser.firstName')).toEqual('First');
    expect(_.get(result, 'data.createUser.lastName')).toEqual('Last');
    expect(_.get(result, 'data.createUser.jsondata.lastName')).toEqual('Last');
    expect(_.get(result, 'data.createUser.jsondata.firstName')).toEqual(
      'First'
    );
    expect(_.get(result, 'data.createUser.jsondata.foo')).toEqual('bar');
  });

  it('create a user using API Token', async () => {
    const apiTokenResult = await sdkClient.sdk.apiTokenCreate(
      {
        name: `${citestMarker}-test-api-token-${new Date().getTime()}`,
        rights: [
          AuthPermissionType.AdminUserCreate,
          AuthPermissionType.AdminUserDelete
        ]
      },
      getRequestHeaders(userTokenAuthorization)
    );

    citestApiTokenId = _.get(apiTokenResult, 'data.apiTokenCreate.id', '');
    citestApiTokenHash = _.get(
      apiTokenResult,
      'data.apiTokenCreate.details.hash',
      ''
    );
    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_api_token_${appKey}@localhost"
        organizationId: "${orgId}"
        roleIds: ["912e377e-f4a4-4184-8db1-baa9670d8081"]
        firstName: "First"
        lastName: "Last"
        jsondata: {
          foo: "bar"
        }
      })  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }
    `;
    const result = await sdkClient.query(
      query,
      null,
      getRequestHeaders(helpers.requestOptions(citestApiTokenId))
    );

    const createUser = _.get(result, 'createUser');

    expect(createUser).toBeDefined();
    newUserIdCreatedByApiToken = createUser?.id || '';
    expect(createUser?.name).toEqual(
      `${citestMarker}-user_api_token_${appKey}@localhost`
    );
  });

  it('update a user', async () => {
    const result = await sdkClient.sdk.updateUser({
      input: {
        id: newUserId,
        jsondata: { test: 'value', image: imageUrl },
        roleIds: [
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
          '555033d1-508c-49c0-8127-66c2dc129828'
        ],
        firstName: 'Second',
        lastName: 'Second Last',
        email: 'user@localhost',
        title: 'test title',
        developerType: 'test developerType',
        imageUrl: 'http://localhost'
      }
    });

    const updateUser = _.get(result, 'data.updateUser');
    expect(updateUser?.roleIds).toEqual(
      expect.arrayContaining([
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
        '555033d1-508c-49c0-8127-66c2dc129828'
      ])
    );
    expect(updateUser?.jsondata).toHaveProperty('image');
    expect(updateUser?.jsondata.image).toContain('http://localhost');
    expect(updateUser?.jsondata).toHaveProperty('test', 'value');
    expect(updateUser?.imageUrl).toBeDefined();
    expect(updateUser?.firstName).toEqual('Second');
    expect(updateUser?.lastName).toEqual('Second Last');
    expect(updateUser?.email).toEqual('user@localhost');
    expect(updateUser?.title).toEqual('test title');
    expect(updateUser?.developerType).toEqual('test developerType');
    expect(updateUser?.imageUrl).toContain('http://localhost');
  });

  it('update a user status', async () => {
    const result = await sdkClient.sdk.updateUserStatus({
      input: {
        id: userId,
        status: UserStatus.Active
      }
    });
    expect(_.get(result, 'data.updateUserStatus.status')).toEqual('active');
  });

  isCurrentEnvLocal()('create a password update request', async () => {
    const result = await sdkClient.sdk.createPasswordUpdateRequest({
      input: {
        id: newUserId,
        skipPasswordResetEmail: true
      }
    });
    expect(_.get(result, 'data.createPasswordUpdateRequest.id')).toEqual(
      newUserId
    );
  });

  it('create a password update request - invalid id', async () => {
    await expect(
      sdkClient.sdk.createPasswordUpdateRequest({
        input: {
          id: 'not an id',
          skipPasswordResetEmail: true
        }
      })
    ).rejects.toThrow('not_found');
  });

  isCurrentEnvLocal()('update mfa current user', async () => {
    let passwordToken = '';

    let result = await sdkClient.sdk.getCurrentUserPasswordToken({
      input: {
        password: config.password
      }
    });

    passwordToken = _.get(
      result,
      'data.getCurrentUserPasswordToken.passwordToken',
      ''
    );

    await expect(
      sdkClient.sdk.updateCurrentUser({
        input: {
          passwordToken,
          mfaInfo: {
            phoneNumber: '09509504454'
          },
          userSetting: {
            key: 'test setting key',
            value: 'test setting value'
          }
        }
      })
    ).rejects.toThrow('invalid_input');
    // TODO this always fails on an "MFA not verified" error from
  });

  it('delete a user', async () => {
    const result = await sdkClient.sdk.deleteUser({ id: newUserId });
    expect(_.get(result, 'data.deleteUser.id')).toEqual(newUserId);
  });

  /** Undelete is currently benched, please see VE-11707. */
  xit('undelete an application', async () => {
    await sdkClient.sdk.applicationWorkflow({
      input: {
        id: newAppId,
        action: ApplicationWorkflowAction.Undelete
      }
    });
  });

  /**
   * Benched alongside the undelete test above (VE-11707): this exists to hard
   * delete the application that undelete was supposed to restore, so it is
   * meaningless while undelete stays disabled.
   */
  xit('delete an application for real', async () => {
    await sdkClient.sdk.deleteApplication({ id: newAppId });
  });

  it('get password token current user', async () => {
    const result = await sdkClient.sdk.getCurrentUserPasswordToken({
      input: {
        password: config.password
      }
    });
    expect(
      _.get(result, 'data.getCurrentUserPasswordToken.passwordToken')
    ).toBeDefined();
  });

  it('get user by list params ids', async () => {
    const result = await sdkClient.sdk.usersWithRoles({ ids: [userId] });
    expect(_.get(result, 'data.users.records')).toHaveLength(1);
    expect(
      _.get(result, 'data.users.records[0].organization.status')
    ).toBeDefined();
  });

  it('get users by role id', async () => {
    const result = await sdkClient.sdk.usersWithRoles({ roleIds: [roleId] });
    const records = result.data.users?.records ?? null;
    expect(records).toBeDefined();
    // see all users have the role id that we used for filtering
    expect(
      (records ?? []).every((user) =>
        (user?.roles ?? []).some((role) => role.id === roleId)
      )
    ).toBeTruthy();
  });

  it('get the basic user information by admin user', async () => {
    const result = await sdkClient.sdk.basicUserInfo({ id: newUserId });
    expect(_.get(result, 'data.basicUserInfo')).toEqual(
      expect.objectContaining({
        id: newUserId,
        name: expect.any(String),
        firstName: expect.any(String),
        lastName: expect.any(String),
        email: expect.any(String),
        imageUrl: expect.any(String)
      })
    );
  });

  it('get group by list param groupIds', async () => {
    const result = await sdkClient.sdk.groups({
      ids: arrGroups
        .map((rec) => rec?.id ?? null)
        .filter((id): id is string => id !== null)
    });
    expect(_.get(result, 'data.groups.records')).toHaveLength(1);
    expect(
      _.get(result, 'data.groups.records[0].organization.id')
    ).toBeDefined();
  });

  it('should create a user and filter html tag', async () => {
    const result = await sdkClient.sdk.createUser({
      input: {
        name: `${citestMarker}-user_${uuid.v4()}@localhost`,
        organizationId: orgId,
        roleIds: ['912e377e-f4a4-4184-8db1-baa9670d8081'],
        firstName: 'First',
        lastName: 'Last',
        jsondata: {
          foo: 'bar'
        }
      }
    });

    newUserId = _.get(result, 'data.createUser.id', '');

    expect(newUserId).toBeDefined();
    expect(_.get(result, 'data.createUser.firstName')).toEqual('First');
    expect(_.get(result, 'data.createUser.lastName')).toEqual('Last');
    expect(_.get(result, 'data.createUser.jsondata.lastName')).toEqual('Last');
    expect(_.get(result, 'data.createUser.jsondata.firstName')).toEqual(
      'First'
    );
    expect(_.get(result, 'data.createUser.jsondata.foo')).toEqual('bar');
  });

  //FIXME:
  isCurrentEnvLocal()('should update a user and filter html tag', async () => {
    const result = await sdkClient.sdk.updateUser({
      input: {
        id: newUserId,
        firstName: '<div>The </div>Second',
        lastName: '<body>LastName</body>'
      }
    });
    expect(_.get(result, 'data.updateUser.firstName')).toEqual('The Second');
    expect(_.get(result, 'data.updateUser.lastName')).toEqual('LastName');
  });

  it('delete a user', async () => {
    const result = await sdkClient.sdk.deleteUser({ id: newUserId });
    expect(_.get(result, 'data.deleteUser.id')).toEqual(newUserId);
  });

  it('delete a user created by API Token', async () => {
    const result = await sdkClient.sdk.deleteUser(
      {
        id: newUserIdCreatedByApiToken
      },
      getRequestHeaders(userTokenAuthorization)
    );
    expect(_.get(result, 'data.deleteUser.id')).toEqual(
      newUserIdCreatedByApiToken
    );
  });

  it('should revoke API token', async () => {
    const result = await sdkClient.sdk.apiTokenUpdate(
      {
        hash: citestApiTokenHash,
        input: { isRevoked: true }
      },
      getRequestHeaders(userTokenAuthorization)
    );
    expect(_.get(result, 'data.apiTokenUpdate.revoked')).toEqual(true);
  });

  it('should logout user', async () => {
    await sdkClient.sdk.userLogout({ token });
  });
});
