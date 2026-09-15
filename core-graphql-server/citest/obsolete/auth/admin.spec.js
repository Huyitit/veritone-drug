const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const jestConfig = require('../jest.config.js');

var token;
var apiToken;
var env = config.env;
var url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
var userId;
var userJsonData;
var orgId;
var newAppId;
var roleId;
var createdContextMenuId;
var orgMetadata;
var orgSeatlimit;
var newUserId, newUserIdCreatedByApiToken;
var arrGroups;

var userName;
var appKey = Date.now();

var debug = config.debug && config.debug === true;

const userAgent = config.userAgent || 'core-graphql-server test';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let bucketPrefix = env;
let userTokenAuthorization;
let citestApiTokenId;
let citestApiTokenHash;
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
const isCurrentEnvLocal = () => (env.includes('local') ? xit : it);
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_auth: admin tests', () => {
  let options = {
    headers: {
      'User-Agent': userAgent,
      Accept: '*/*'
    }
  };
  let gqlClient;
  beforeAll(async () => {
    const query = `mutation {
        userLogin(input: {
          userName: "${config.userName}"
          password: "${config.password}"
        }) {
          apiToken
          token
          user {
            id
            name
            jsondata
            roles {
              id
            }
          }
          organization {
            billingUpdatedDatetime
            id
          }
          groups {
            id
          }
        }
      }`;
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();
    const result = await gqlClient.query(query, null, options);
    token = result.userLogin.token;
    userTokenAuthorization = {
      headers: { Authorization: `Bearer ${token}` }
    };
    apiToken = result.apiToken || config.apiToken || token;
    userId = result.userLogin.user.id;
    userJsonData = result.userLogin.user.jsondata;
    // the following assumes that user belongs to the same org as the test API token
    const torg = result.userLogin.organization.id;
    const roles = result.userLogin.user.roles;
    if (Array.isArray(roles) && roles.length > 0) {
      roleId = roles[0].id;
    }
    if (torg) orgId = torg.toString();
    userName = result.userLogin.user.name;
    arrGroups = _.get(result, 'userLogin.groups');
    const billingUpdatedDatetime = _.get(
      result,
      'userLogin.organization.billingUpdatedDatetime'
    );
    let cookie = _.get(result._response, 'headers.set-cookie');

    expect(apiToken).toBeDefined();
    expect(token).toBeDefined();
    expect(userId).toBeDefined();
    expect(arrGroups).toBeDefined();
    expect(cookie).toBeDefined();
    expect(billingUpdatedDatetime).toBeDefined();

    switch (env) {
      case 'stage': {
        expect(cookie.some((c) => c.includes('Domain='))).toEqual(true);
        expect(
          cookie.some((c) => c.includes('stage-veritone-session-id='))
        ).toEqual(true);
        break;
      }

      case 'dev': {
        expect(cookie.some((c) => c.includes('Domain='))).toEqual(true);
        expect(
          cookie.some((c) => c.includes('dev-veritone-session-id='))
        ).toEqual(true);
        break;
      }

      default: {
        cookie.some((c) => c.includes('veritone-session-id'));
      }
    }
  });

  it('should validate token', async () => {
    const query = `mutation {
      validateToken(token: "${token}") {
        apiToken
        token
        user {
          name
        }
      }
     }`;
    const result = await gqlClient.query(query);

    expect(result.validateToken.token).toEqual(token);
    expect(result.validateToken.apiToken).toBeFalsy();
    expect(result.validateToken.user.name).toEqual(userName);
  });

  it('should refresh token', async () => {
    let refreshToken = {};
    const query = `mutation {
      refreshToken(token: "${token}") {
        apiToken
        token
        user {
          name
        }
      }
     }`;
    const result = await gqlClient.query(query);
    refreshToken = _.get(result, 'refreshToken');
    expect(refreshToken.token).toEqual(token);
    expect(refreshToken.apiToken).toBeFalsy();
    expect(refreshToken.user.name).toEqual(userName);
  });

  it('should get org api tokens', async () => {
    const query = `query {
      tokens {
        id
        applicationId
        groupId
        json {
          rights
        }
      }
     }`;
    const result = await gqlClient.query(query);
    expect(result.tokens[0].id).toBeDefined();
  });

  it('get user by id', async () => {
    const query = `query {
      users(id:"${userId}")  {
        records {
          id
          name
          organization {
            id
            name
            status
          }
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
          mfaInfo {
            phoneNumber
            smsVoiceVerifiedDateTime
            gaVerifiedDateTime
            defaultOption
          }
        }
        count
        limit
        offset
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.users.records).toHaveLength(1);
    expect(_.get(result, 'users.records[0].organization.status')).toBeDefined();
  });

  it('get user with convenience function', async () => {
    const query = `query {
      user(id:"${userId}")  {
          id
          name
          passwordUpdatedDateTime
          modifiedDateTime
          createdDateTime
          organization {
            id
            name
            status
          }
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
          rootFolder(type: watchlist) {
            id
          }
        }
    }`;
    const result = await gqlClient.query(query);
    expect(result.user.id).toEqual(userId);
    expect(_.get(result.user, 'organization.status')).toBeDefined();
    expect(_.get(result.user, 'passwordUpdatedDateTime')).toBeDefined();
    expect(_.get(result.user, 'createdDateTime')).toBeDefined();
    expect(_.get(result.user, 'modifiedDateTime')).toBeDefined();
    expect(_.get(result.user, 'rootFolder.id')).toBeDefined();
  });

  it('get user with invalid id', async () => {
    const query = `query {
      user(id:"not a uuid") {
          id
      }
    }

    `;
    expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
  });

  it('get current user', async () => {
    const query = `query {
      me  {
          id
          name
          organizationId
          organization {
            id
            name
            internalApplicationId
          }
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
          mfaInfo {
            phoneNumber
            smsVoiceVerifiedDateTime
            gaVerifiedDateTime
            defaultOption
          }
          userSettings {
            key
            value
          }
        }
      }`;
    const result = await gqlClient.query(query);
    expect(result.me.id).toEqual(userId);
    expect(_.get(result, 'me.organizationId')).toBeDefined();
    expect(_.get(result, 'me.organization.id')).toBeDefined();
    expect(
      _.get(result, 'me.organization.internalApplicationId')
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
    const result = await gqlClient.query(query, null, true);
    expect(result.me.name).toEqual(expect.stringContaining('API key for'));
  });

  it('get current user with org - api token', async () => {
    const query = `query {
      me  {
          id
          name
          organization {
            id
            name
          }
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
    const result = await gqlClient.query(query, null);

    expect(_.get(result, 'me.id')).toBeDefined();
    expect(_.get(result, 'me.organization')).toBeTruthy();
  });

  it('get user by name', async () => {
    const query = `query {
      users(name:"${userName}")  {
        records {
          id
          name
          organization {
            id
            name
          }
        }
        count
        limit
        offset
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.users.records).toHaveLength(1);
  });

  it('get orgs by id', async () => {
    const query = `query {
      organizations(id:"${orgId}")  {
        records {
          id
          name
          applications {
            records {
              name
              id
            }
          }
          users {
            records {
              id
              name
            }
          }
        }
        count
        limit
        offset
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.organizations.records).toHaveLength(1);
  });

  it('get org by id', async () => {
    const query = `query {
      organization(id:"${orgId}")  {
          id
          name
          jsondata
          seatLimit
          applications (limit:5){
            records {
              name
              id
            }
          }
          users (limit:5){
            records {
              id
              name
            }
          }
          rootFolder(type:cms){
            id
          }
          dashboards {
            index
            title
            description
            active
            filters
            type
            thumbnail
          }
          seats
        }
    }`;
    const result = await gqlClient.query(query);
    expect(result.organization.id).toEqual(orgId);
    expect(result.organization.jsondata).toBeDefined();
    expect(result.organization.rootFolder).toBeDefined();
  });

  //FIXME: validate that the returned org has the requested kvp
  it('get org by feature', async () => {
    const query = `query {
      organizations(kvpProperty:"features.mentionListing.comments", kvpValue:"true")  {
        records {
          id
          name
        }
        count
        limit
        offset
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.organizations.records.length).toBeGreaterThan(1);
  });

  isCurrentEnvLocal()('create an organization', async () => {
    let errors = null;
    let createOrganization = null;
    let newSeatlimit = orgSeatlimit + 1;
    var query = `mutation ($kvp: JSONData!, $apps: JSONData) {
        createOrganization (input: {
          name: "${citestMarker}-${uuid.v4()}"
          businessUnit: "Legal"
          types: [agency, broadcaster]
          metadata: $kvp
          applications: $apps
        }) {
          id
          name
          type
          jsondata
        }
      }`;

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
        isDesktopAppEnabled
          ? null
          : {
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
      ].filter((app) => app)
    };
    const result = await gqlClient.query(query, variables);
    expect(result.createOrganization.type).toEqual(
      expect.arrayContaining(['Agency', 'Broadcaster'])
    );
    expect(result.createOrganization.jsondata).toHaveProperty('test', 'value');
    // input CMS + adminApp + cmsApp (GUID)
    expect(result.createOrganization.jsondata.applicationIds).toHaveLength(3);
    // newFilePicker flag should be enabled in the new organization
    const useNewFilePickerFeature = _.get(
      result.createOrganization,
      'jsondata.features.newFilePicker'
    );
    expect(useNewFilePickerFeature).toEqual('enabled');
  });

  it('get all permissions', async () => {
    const query = `query {
      permissions(limit: 5)  {
        records {
          id
          name
          description
          }
          count
          limit
          offset
        }

    }

    `;
    const result = await gqlClient.query(query);
    expect(result.permissions.records).toHaveLength(5);
  });

  // FIXME: skipped.
  // Following ids are not defined: mentionId, tdoId, watchlistId and collectionId;
  isCurrentEnvLocal()('create an application', async () => {
    const mentionQuery = 'mentionId=${mentionId}';
    const tdoQuery = 'tdoId=${tdoId}';
    const watchlistQuery = 'watchlistId=${watchlistId}';
    const collectionQuery = 'collectionId=${collectionId}';

    var query = `mutation {
      createApplication(input: {
        name: "${citestMarker}-testapp_${appKey}"
        key: "${citestMarker}-testapp_${appKey}"
        deploymentModel: FullyNetworkIsolated
        description: "test application"
        iconUrl: "${imageUrl}",
        iconSvg: "${imageUrl}",
        url: "http://localhost/app"
        checkPermissions: true
        contextMenuExtensions: {
          mentions: [{
            type: mention
            label: "${citestMarker}-testMentions"
            url: "https://www.google.com?${mentionQuery}"
          }]
          tdos: [{
            type: tdo
            label: "${citestMarker}-testTdos"
            url: "https://www.google.com?${tdoQuery}"
          }]
          watchlists: [{
            type: watchlist
            label: "${citestMarker}-testWatchlists"
            url: "https://www.google.com?${watchlistQuery}"
          }]
          collections: [{
            type: collection
            label: "${citestMarker}-testCollections"
            url: "https://www.google.com?${collectionQuery}"
          }]
    		}
      })  {
        id
        contextMenuExtensions {
          mentions {
            id
            label
            url
          }
          tdos {
            id
            label
            url
          }
          watchlists {
            id
            label
            url
          }
          collections {
            id
            label
            url
          }
        }
        iconUrl
        iconSvg
      }
    }

    `;
    const result = await gqlClient.query(query);
    newAppId = result.createApplication.id;
    createdContextMenuId = _.get(
      result.createApplication,
      'contextMenuExtensions.mentions[0].id'
    );
    expect(result.createApplication.id).toBeDefined();
    expect(result.createApplication.iconUrl.length).toBeGreaterThanOrEqual(
      imageUrl.length
    );
    expect(result.createApplication.iconSvg.length).toBeGreaterThanOrEqual(
      imageUrl.length
    );
  });

  isCurrentEnvLocal()(
    'should error when creating a context menu extension without containing a template string variable',
    async () => {
      const query = `mutation {
      createApplication(input: {
        name: "${citestMarker}-testapp_${appKey}123"
        key: "${citestMarker}-testapp_${appKey}123"
        deploymentModel: FullyNetworkIsolated
        description: "test application"
        url: "http://localhost/app"
        checkPermissions: true
        contextMenuExtensions: {
          mentions: [{
            type: mention
            label: "${citestMarker}-testMentions"
            url: "https://www.google.com"
          }]
    		}
      })  {
        id
        contextMenuExtensions {
          mentions {
            id
            label
            url
          }
        }
      }
    }

    `;
      await expect(async () => gqlClient.query(query)).rejects.toThrow(
        '${mentionId} is required'
      );
    }
  );

  //FIXME:
  isCurrentEnvLocal()(
    'should error when creating an application /w a duplicate name/key',
    function () {
      const query = `mutation {
      createApplication(input: {
        name: "${citestMarker}-testapp_${appKey}"
        key: "${citestMarker}-testapp_${appKey}"
        deploymentModel: FullyNetworkIsolated
        description: "test application"
        url: "http://localhost/app"
        checkPermissions: true
      })  {
        id
      }
    }`;

      expect(async () => gqlClient.query(query)).rejects.toThrow(
        'An application with this name already exists'
      );
    }
  );

  //FIXME:
  isCurrentEnvLocal()('get an application', async () => {
    var theAppId;
    const query = `query {

  applications(id: "${newAppId}", status: draft) {
    records {
      id
      name
      description
      deploymentModel
      createdDateTime
      modifiedDateTime
      iconSvg
      iconUrl
      organizationId
      clientSecret
      category
      url
      validStateActions
      contextMenuExtensions {
        mentions {
          id
          label
          url
        }
        tdos {
          id
          label
          url
        }
        watchlists {
          id
          label
          url
        }
        collections {
          id
          label
          url
        }
      }
    }
    count
  }
}
    `;
    const result = await gqlClient.query(query);
    theAppId =
      result.applications.count > 0 ? result.applications.records[0].id : null;
    expect(theAppId).toEqual(newAppId);
    expect(result.applications.records[0].validStateActions).toEqual(
      expect.arrayContaining(['edit', 'delete'])
    );
    expect(result.applications.records[0].clientSecret).toEqual(null);
    expect(
      result.applications.records[0].contextMenuExtensions.mentions[0].url
    ).toEqual('https://www.google.com?mentionId=${mentionId}');
    expect(
      result.applications.records[0].contextMenuExtensions.tdos[0].url
    ).toEqual('https://www.google.com?tdoId=${tdoId}');
    expect(
      result.applications.records[0].contextMenuExtensions.watchlists[0].url
    ).toEqual('https://www.google.com?watchlistId=${watchlistId}');
    expect(
      result.applications.records[0].contextMenuExtensions.collections[0].url
    ).toEqual('https://www.google.com?collectionId=${collectionId}');
  });

  isCurrentEnvLocal()('get an application - convenience function', async () => {
    var application = null;
    var theAppId;
    const query = `query {
      application(id: "${newAppId}") {
          id
          name
          description
          deploymentModel
          createdDateTime
          modifiedDateTime
          iconSvg
          iconUrl
          organizationId
          clientSecret (password: "${config.password}")
          category
          url
          contextMenuExtensions {
            mentions {
              id
              label
              url
            }
            tdos {
              id
              label
              url
            }
            watchlists {
              id
              label
              url
            }
            collections {
              id
              label
              url
            }
          }
        }
      }
    `;
    const result = await gqlClient.query(query);
    application = result.application;
    theAppId = result.application.id;

    expect(theAppId).toEqual(newAppId);
    expect(application.clientSecret).toBeDefined();
    expect(application.contextMenuExtensions.mentions[0].url).toEqual(
      'https://www.google.com?mentionId=${mentionId}'
    );
    expect(application.contextMenuExtensions.tdos[0].url).toEqual(
      'https://www.google.com?tdoId=${tdoId}'
    );
    expect(application.contextMenuExtensions.watchlists[0].url).toEqual(
      'https://www.google.com?watchlistId=${watchlistId}'
    );
    expect(application.contextMenuExtensions.collections[0].url).toEqual(
      'https://www.google.com?collectionId=${collectionId}'
    );
  });

  isCurrentEnvLocal()('submit an application', async () => {
    const query = `mutation {
      applicationWorkflow(input: {
        id: "${newAppId}"
        action: submit
      })  {
        id
        description
        url
        deploymentModel
        status
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.applicationWorkflow.id).toEqual(newAppId);
    expect(result.applicationWorkflow.status).toEqual('pending');
  });

  //FIXME:
  isCurrentEnvLocal()('reject an application', async () => {
    var theAppId;
    var theStatus;
    const query = `mutation {
      applicationWorkflow(input: {
        id: "${newAppId}"
        action: reject
      })  {
        id
        description
        url
        deploymentModel
        status
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.applicationWorkflow.id).toEqual(newAppId);
    expect(result.applicationWorkflow.status).toEqual('rejected');
  });

  //FIXME:
  isCurrentEnvLocal()('update an application', async () => {
    var descUpdate;
    var theAppId;
    var theUrl;
    var theDepModel;
    const mentionQuery = 'mentionId=${mentionId}';

    var query = `mutation updateApplication($input: UpdateApplication!) {
      updateApplication(input: $input)  {
        id
        description
        url
        deploymentModel
        contextMenuExtensions {
          mentions {
            id
            label
            url
          }
        }
      }
    }`;

    const variables = {
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
    };
    const result = await gqlClient.query(query, variables);
    expect(result.updateApplication.id).toEqual(newAppId);
    expect(result.updateApplication.description).toEqual('updated description');
    expect(
      result.updateApplication.contextMenuExtensions.mentions[0].label
    ).toEqual(citestMarker + '-testMentions2');
    expect(result.updateApplication.url).toEqual('http://localhost/app');
  });

  isCurrentEnvLocal()('bulk delete context menu extensions', async () => {
    var theDeletedId;
    const query = `mutation bulkDelete($input: BulkDeleteContextMenuExtensions!) {
      bulkDeleteContextMenuExtensions(input: $input) {
        mentions {
          id
        }
        tdos {
          id
        }
        watchlists {
          id
        }
        collections {
          id
        }
      }
    }
    `;

    const result = await gqlClient.query(query, {
      input: { ids: [createdContextMenuId] }
    });
    theDeletedId = _.get(
      result.bulkDeleteContextMenuExtensions,
      'mentions[0].id'
    );
    expect(theDeletedId).toEqual(createdContextMenuId);
  });

  isCurrentEnvLocal()('approve an application', async () => {
    const query = `mutation {
      applicationWorkflow(input: {
        id: "${newAppId}"
        action: approve
      })  {
        id
        description
        url
        deploymentModel
        status
      }
    }
    `;
    const result = await gqlClient.query(query);
    expect(result.applicationWorkflow.id).toEqual(newAppId);
    expect(result.applicationWorkflow.status).toEqual('approved');
  });

  isCurrentEnvLocal()('deploy an application', async () => {
    const query = `mutation {
      applicationWorkflow(input: {
        id: "${newAppId}"
        action: deploy
      })  {
        id
        description
        url
        deploymentModel
        status
      }
    }
    `;
    const result = await gqlClient.query(query);
    expect(result.applicationWorkflow.id).toEqual(newAppId);
    expect(result.applicationWorkflow.status).toEqual('active');
  });

  isCurrentEnvLocal()('disable an application', async () => {
    const query = `mutation {
      applicationWorkflow(input: {
        id: "${newAppId}"
        action: disable
      })  {
        id
        description
        url
        deploymentModel
        status
      }
    }
    `;
    const result = await gqlClient.query(query);
    expect(result.applicationWorkflow.id).toEqual(newAppId);
    expect(result.applicationWorkflow.status).toEqual('disabled');
  });

  isCurrentEnvLocal()('delete an application', async () => {
    const query = `mutation {
      deleteApplication(id: "${newAppId}")  {
        id
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.deleteApplication.id).toEqual(newAppId);
  });

  it('create a user', async () => {
    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_${appKey}@localhost"
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
    const result = await gqlClient.query(query);
    newUserId = _.get(result, 'createUser.id');
    expect(newUserId).toBeDefined();
    expect(_.get(result, 'createUser.firstName')).toEqual('First');
    expect(_.get(result, 'createUser.lastName')).toEqual('Last');
    expect(_.get(result, 'createUser.jsondata.lastName')).toEqual('Last');
    expect(_.get(result, 'createUser.jsondata.firstName')).toEqual('First');
    expect(_.get(result, 'createUser.jsondata.foo'));
  });

  it('create a user using API Token', async () => {
    const createApiTokenMutation = `mutation {
      apiTokenCreate(name: "${citestMarker}-test-api-token-${new Date().getTime()}" rights: [ADMIN_USER_CREATE, ADMIN_USER_DELETE]) {
        id        
        details {
          hash
        }
      }
    }`;

    const apiTokenResult = await gqlClient.query(
      createApiTokenMutation,
      null,
      userTokenAuthorization
    );

    citestApiTokenId = _.get(apiTokenResult, 'apiTokenCreate.id');
    citestApiTokenHash = _.get(apiTokenResult, 'apiTokenCreate.details.hash');
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
    const result = await gqlClient.query(query, null, {
      headers: { Authorization: `Bearer ${citestApiTokenId}` }
    });
    const createUser = _.get(result, 'createUser');
    expect(createUser).toBeDefined();
    newUserIdCreatedByApiToken = createUser.id;
    expect(createUser.name).toEqual(
      `${citestMarker}-user_api_token_${appKey}@localhost`
    );
  });

  it('update a user', async () => {
    const query = `mutation {
      updateUser(input: {
        id: "${newUserId}"
        jsondata: {test:"value", image:"${imageUrl}"}
        roleIds: ["cf2ed945-176b-4dd9-943e-22fcb1cf684f",
                  "555033d1-508c-49c0-8127-66c2dc129828"]
        firstName: "Second"
        lastName: "Second Last"
        email: "user@localhost"
        title: "test title"
        developerType: "test developerType"
        imageUrl: "http://localhost"
        }
      )  {
        id
        name
        roleIds
        jsondata
        imageUrl
        firstName
        lastName
        email
        title
        developerType
        imageUrl
      }
    }
    `;
    const result = await gqlClient.query(query);

    expect(result.updateUser.roleIds).toEqual(
      expect.arrayContaining([
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
        '555033d1-508c-49c0-8127-66c2dc129828'
      ])
    );
    expect(result.updateUser.jsondata).toHaveProperty('image');
    expect(result.updateUser.jsondata.image).toContain('http://localhost');
    expect(result.updateUser.jsondata).toHaveProperty('test', 'value');
    expect(result.updateUser.imageUrl).toBeDefined();
    expect(_.get(result, 'updateUser.firstName')).toEqual('Second');
    expect(result.updateUser.lastName).toEqual('Second Last');
    expect(result.updateUser.email).toEqual('user@localhost');
    expect(result.updateUser.title).toEqual('test title');
    expect(result.updateUser.developerType).toEqual('test developerType');
    expect(result.updateUser.imageUrl).toContain('http://localhost');
  });

  it('update a user status', async () => {
    const query = `mutation {
      updateUserStatus(input: {
        id: "${userId}"
        status: active
        }
      )  {
        id
        status
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'updateUserStatus.status')).toEqual('active');
  });

  isCurrentEnvLocal()('create a password update request', async () => {
    let updatedUserId;

    const query = `mutation {
      createPasswordUpdateRequest(input:{id: "${newUserId}",
        skipPasswordResetEmail: true})  {
        id
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.createPasswordUpdateRequest.id).toEqual(newUserId);
  });

  it('create a password update request - invalid id', async () => {
    const query = `mutation {
      createPasswordUpdateRequest(input:{id: "not an id",
        skipPasswordResetEmail: true})  {
        id
      }
    }

    `;
    expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
  });

  isCurrentEnvLocal()('update mfa current user', async () => {
    let response2;
    let passwordToken = '';
    let updatedUserId = 0;
    let body;

    let query = `mutation {
      getCurrentUserPasswordToken(input: {
        password: "${config.password}"
      }) {
        passwordToken
      }
    }

  `;
    let result = await gqlClient.query(query);
    passwordToken = result.getCurrentUserPasswordToken.passwordToken;

    query = `mutation {
      updateCurrentUser(input: {
        passwordToken: "${passwordToken}"
        mfaInfo: {
          phoneNumber: "09509504454"
        }
        userSetting: {
          key: "test setting key"
          value: "test setting value"
        }
      }) {
        id
        name
        userSettings {
          key
          value
        }
      }
    }
  `;
    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'invalid_input'
    );
    // TODO this always fails on an "MFA not verified" error from
  });

  it('delete a user', async () => {
    const query = `mutation {
      deleteUser(id: "${newUserId}")  {
        id
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.deleteUser.id).toEqual(newUserId);
  });

  //Undelete is currently benched, please see VE-11707
  xit('undelete an application', async () => {
    const query = `mutation {
      applicationWorkflow(input: {
        id: "${newAppId}"
        action: undelete
      })  {
        id
        description
        url
        deploymentModel
        status
      }
    }

    `;
    const result = await gqlClient.query(query);
  });

  xit('delete an application for real', async () => {
    var delAppId;

    const query = `mutation {
      deleteApplication(id: "${newAppId}")  {
        id
      }
    }

    `;
    await gqlClient.query(query);
    // TODO undelete not working so the app is still deleted at this point
  });

  it('get password token current user', async () => {
    const query = `mutation {
      getCurrentUserPasswordToken(input: {
        password: "${config.password}"
      }) {
        passwordToken
      }
    }

  `;
    const result = await gqlClient.query(query);
    expect(result.getCurrentUserPasswordToken.passwordToken).toBeDefined();
  });

  it('get user by list params ids', async () => {
    const query = `query {
      users(ids:["${userId}"])  {
        records {
          id
          name
          organization {
            id
            name
            status
          }
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
          mfaInfo {
            phoneNumber
            smsVoiceVerifiedDateTime
            gaVerifiedDateTime
            defaultOption
          }
        }
        count
        limit
        offset
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.users.records).toHaveLength(1);
    expect(_.get(result.users, 'records[0].organization.status')).toBeDefined();
  });

  it('get users by role id', async () => {
    const query = `query {
      users(roleIds:["${roleId}"])  {
        records {
          id
          name
          roles {
              id
          }
        }
      }
    }
    `;

    const result = await gqlClient.query(query);
    expect(result.users.records).toBeDefined();
    // see all users have the role id that we used for filtering
    expect(
      result.users.records.every(({ roles }) =>
        roles.some((role) => role.id === roleId)
      )
    ).toBeTruthy();
  });

  it('get the basic user information by admin user', async () => {
    const query = `query {
        basicUserInfo(id:"${newUserId}") {
          id
          name
          firstName
          lastName
          email
          imageUrl
        }
      }
    `;
    const result = await gqlClient.query(query);
    expect(result.basicUserInfo).toEqual(
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
    const query = `query groups($arrGroups: [ID]) {
      groups (
        ids: $arrGroups
      ) {
        records{
          id
          name
          organization {
            id
          }
        }
      }
    }`;

    const result = await gqlClient.query(query, arrGroups);
    expect(result.groups.records).toHaveLength(1);
    expect(result.groups.records[0].organization.id).toBeDefined();
  });

  it('should create a user and filter html tag', async () => {
    const query = `mutation {
      createUser(input: {
        name: "${citestMarker}-user_${uuid.v4()}@localhost"
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
    const result = await gqlClient.query(query);

    newUserId = _.get(result, 'createUser.id');

    expect(newUserId).toBeDefined();
    expect(_.get(result, 'createUser.firstName')).toEqual('First');
    expect(_.get(result, 'createUser.lastName')).toEqual('Last');
    expect(_.get(result, 'createUser.jsondata.lastName')).toEqual('Last');
    expect(_.get(result, 'createUser.jsondata.firstName')).toEqual('First');
    expect(_.get(result, 'createUser.jsondata.foo')).toEqual('bar');
  });

  //FIXME:
  isCurrentEnvLocal()('should update a user and filter html tag', async () => {
    const query = `mutation {
      updateUser(input: {
        id:"${newUserId}"
        firstName: "<div>The </div>Second"
        lastName: "<body>LastName</body>"
      })  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'updateUser.firstName')).toEqual('The Second');
    expect(_.get(result, 'updateUser.lastName')).toEqual('LastName');
  });

  it('delete a user', async () => {
    const query = `mutation {
      deleteUser(id: "${newUserId}")  {
        id
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(result.deleteUser.id).toEqual(newUserId);
  });

  it('delete a user created by API Token', async () => {
    const query = `mutation {
      deleteUser(id: "${newUserIdCreatedByApiToken}")  {
        id
      }
    }

    `;
    const result = await gqlClient.query(query, null, userTokenAuthorization);
    expect(result.deleteUser.id).toEqual(newUserIdCreatedByApiToken);
  });

  it('should revoke API token', async () => {
    const query = `mutation {
      apiTokenUpdate( hash: "${citestApiTokenHash}" input: { isRevoked: true }) {
        revoked
      }
    }`;
    const result = await gqlClient.query(query, null, userTokenAuthorization);
    expect(_.get(result, 'apiTokenUpdate.revoked')).toEqual(true);
  });

  it('should logout user', async () => {
    const query = `mutation {
      userLogout(token: "${token}")
     }`;
    await gqlClient.query(query);
  });
});
