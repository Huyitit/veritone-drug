const _ = require('lodash');

async function helpCreateApp(client, input) {
  const { gqlClient, options } = client;
  const query = `
    mutation createApp (
      $id: ID, $isPublic: Boolean, $name: String!, $details: JSONData,
      $category: String, $description: String, $iconUrl: String, $iconSvg: String
      $url: String, $eventSubscriptions: [EventSubscriptionInput]
      $metadataVersion: Int, $oauth2RedirectUrls: [String!], $checkPermissions: Boolean!
      $permissionsRequired: [String], $deploymentModel: DeploymentModel
      $contextMenuExtensions: AppCreateContextMenuExtensions
      $eventEndpoint: String, $packageDistributionType: EngineDistributionType
      $applicationRoles: [CreateApplicationRole!], $entityTags: [EntityTagInput]
      $headerbarEnabled: Boolean, $headerbar: ApplicationHeaderbarInput
      $applicationConfigDefinition: [ApplicationConfigDefinitionInput]
      $events: [CreateAppEventInput], $status: ApplicationStatus
      $disableAutoPackageCreation: Boolean
    ) {
      createApplication(
        input: {
          id: $id
          isPublic: $isPublic
          name: $name
          details: $details
          category: $category
          description: $description
          iconUrl: $iconUrl
          iconSvg: $iconSvg
          url: $url
          eventSubscriptions: $eventSubscriptions
          metadataVersion: $metadataVersion
          oauth2RedirectUrls: $oauth2RedirectUrls
          checkPermissions: $checkPermissions
          permissionsRequired: $permissionsRequired
          deploymentModel: $deploymentModel
          contextMenuExtensions: $contextMenuExtensions
          eventEndpoint: $eventEndpoint
          packageDistributionType: $packageDistributionType
          applicationRoles: $applicationRoles
          entityTags: $entityTags
          headerbarEnabled: $headerbarEnabled
          headerbar: $headerbar
          applicationConfigDefinition: $applicationConfigDefinition
          events: $events
          status: $status
          disableAutoPackageCreation: $disableAutoPackageCreation
        }
      ) {
        id 
        name 
        key
        description 
        url 
        oauth2RedirectUrls 
        iconUrl
        applicationRoles(ownedOnly: false) {
          id
          name
          permissions
          isPrivate
          isApplicationEventRole
        }
        applicationHeaderbar {
          name
          config {
            backgroundColor
            help
            notification
            logoSrc
          }
        }
        contextMenuExtensions {
          mentions{ id }
          tdos{ id }
          watchlists{ id }
          collections{ id }
        }
        applicationConfigDefinition {
          count
          records {
            applicationId
          }
        }
        entityTags {
          entityType
          tagKey
          tagValue
        }
      }
    }
  `;

  return gqlClient.query(query, input, options);
}

async function helpDeleteApp(client, input) {
  const { gqlClient, options } = client;
  const query = `
    mutation deleteTestApp {
      deleteApplication(id: "${input.id}") {
        id
        message
      }
    }
  `;
  return gqlClient.query(query, {}, options);
}

async function helpGetApplication(client, input) {
  const { gqlClient, options } = client;
  const { id, excludeViewOnly } = input;
  return gqlClient.query(
    `
    query ($id : ID!, $excludeViewOnly: Boolean) {
      application(id: $id, excludeViewOnly: $excludeViewOnly) {
        id
        name
        description
        url
        iconUrl
        oauth2RedirectUrls
        organizationId
        eventEndpoint
        deploymentModel
        ownerOrganizationId
        dailyTaskMetrics {
          records {
            date
            taskCount
            storageBytes
            mediaSecs
          }
        }
      }
    }
  `,
    { id, excludeViewOnly },
    options
  );
}

async function helpUpdateApplication(client, input) {
  const { gqlClient, options } = client;
  const cmeReturnFields = ['id', 'label', 'url', 'type'];
  const cmeAppReturnFields = `contextMenuExtensions {
     mentions {
       ${cmeReturnFields.join(' ')}
     }
     tdos {
       ${cmeReturnFields.join(' ')}
     }
     watchlists {
       ${cmeReturnFields.join(' ')}
     }
     collections {
       ${cmeReturnFields.join(' ')}
     }
  }`;

  return gqlClient.query(
    `
    mutation ($input: UpdateApplication) {
      updateApplication(input: $input) {
        id
        name
        iconUrl
        description
        signedIconUrl
        applicationHeaderbar {
          name
          config {
            backgroundColor
            help
            notification
            logoSrc
          }
        }
        applicationConfigDefinition {
          count
          records {
            applicationId
            configKey
            configType
            configLevel
            required
            secured
            description
          }
        }
        applicationRoles(ownedOnly: false) {
          id
          name
          description
          permissions
          isPrivate
          isApplicationEventRole
        }
        ${cmeAppReturnFields}  
      }
    }
  `,
    input,
    options
  );
}

async function helpDeleteApplication(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  return gqlClient.query(
    `
    mutation ($id: ID!) {
      deleteApplication(id: $id) {
        id
        message
      }
    }
    `,
    { id },
    options
  );
}

async function helpApplicationWorkflow(client, input) {
  const { gqlClient, options } = client;
  const { id, action } = input;

  return gqlClient.query(
    `
      mutation ($id: ID!, $action: ApplicationWorkflowAction!) {
        applicationWorkflow(input: {
          id: $id
          action: $action
        }) {
          id
          status
        }
      }
    `,
    { id, action },
    options
  );
}

async function helpUpdateApplicationEventEndpoint(client, input) {
  const { gqlClient, options } = client;
  const { id, eventEndpoint } = input;

  return gqlClient.query(
    `
      mutation ($id: ID!, $eventEndpoint: String!) {
        updateApplicationEventEndpoint(input: {
          id: $id
          eventEndpoint: $eventEndpoint
        }) {
          id
          eventEndpoint
        }
      }
    `,
    { id, eventEndpoint },
    options
  );
}

async function helpRemoveApplicationEventEndpoint(client, input) {
  const { gqlClient, options } = client;
  const { appId } = input;

  return gqlClient.query(
    `
      mutation ($appId: ID!) {
        removeApplicationEventEndpoint(id: $appId) {
          id
          message
        }
      }
    `,
    { appId },
    options
  );
}

async function helpUpdateApplicationRole(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `
    mutation updateApplicationRole(
      $id: ID!
      $name: String
      $permissions: [AuthPermissionType]
      $isPrivate: Boolean
      $isAppEventRole: Boolean
    ) {
      updateApplicationRole(
        input: {
          $id: id
          $name: name
          $permissions: permissions
          $isPrivate: isPrivate
          $isAppEventRole: isAppEventRole
        }
      ) {
        id
        name
        description
        application
        permissions
        organization
        isPrivate
        isApplicationEventRole
      }
    }
    `,
    input,
    options
  );
}

async function helpgGetApplications(client, input) {
  const { gqlClient, options } = client;
  const cmeReturnFields = ['id', 'label', 'url', 'type'];
  const cmeAppReturnFields = `contextMenuExtensions {
       mentions {
         ${cmeReturnFields.join(' ')}
       }
       tdos {
         ${cmeReturnFields.join(' ')}
       }
       watchlists {
         ${cmeReturnFields.join(' ')}
       }
       collections {
         ${cmeReturnFields.join(' ')}
       }
     }`;
  return gqlClient.query(
    `
    mutation applications(
      $id: ID, $status: ApplicationStatus, $orgId: ID, $isPublic: Boolean, $excludeViewOnly: Boolean
      $filter: ApplicationFilter
      $offset: Int, $limit: Int, $orderBy: [ApplicationSortField], $accessScope: [AccessScope!]
    ) {
      {
        records {
          id
          name
          key
          description
          url
          oauth2RedirectUrls
          status
          ${cmeAppReturnFields}
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
          }
          applicationHeaderbar {
            name
            config {
              backgroundColor
              help
              notification
              logoSrc
            }
          }
          applicationConfigDefinition {
            count
            records {
              applicationId
              configKey
              configType
              configLevel
              required
              secured
              description
            }
          }
        }
        count
        offset
        limit

      }
    }
    `,
    input,
    options
  );
}

async function helpCreateApplicationConfigDefinition(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `
      mutation (
        $input: [ApplicationConfigDefinitionCreate]
      ) {
        applicationConfigDefinitionCreate(
          input: $input
        ) {
          records {
            applicationId
            organizationGuid
            packageId
          }
        }
      }
    `,
    { input },
    options
  );
}

async function helpUpdateApplicationConfigDefinition(client, input) {
  const { gqlClient, options } = client;
  const { appId, configKey } = input;

  return gqlClient.query(
    `
      mutation ($appId: ID!, $configKey: String!) {
        applicationConfigDefinitionUpdate(input: [{
          filter: {
            appId: $appId
            configKey: $configKey
          }
          update: {
            configType: String
          }
        }]) {
          records {
            configType
          }
        }
      }
    `,
    { appId, configKey },
    options
  );
}

async function helpSetApplicationConfig(client, input) {
  const { gqlClient, options } = client;
  const { appId, orgId, configs } = input;

  return gqlClient.query(
    `
      mutation (
        $appId: ID!
        $orgId: ID
        $configs: [ApplicationConfigValueInput!]!
      ) {
        applicationConfigSet(
          input: {
            appId: $appId
            orgId: $orgId
            configs: $configs
          }
        ) {
          records {
            configKey
            value
          }
        }
      }
    `,
    { appId, orgId, configs },
    options
  );
}

async function helpDeleteApplicationConfig(client, input) {
  const { gqlClient, options } = client;
  const { appId, orgId, configKey } = input;

  return gqlClient.query(
    `
      mutation ($appId: ID!, $orgId: ID, $configKey: String!) {
        applicationConfigDelete(
          input: {
            appId: $appId
            orgId: $orgId
            configKey: $configKey
          }
        ) {
          success
        }
      }
    `,
    { appId, orgId, configKey },
    options
  );
}

async function helpDeleteApplicationConfigDefinition(client, input) {
  const { gqlClient, options } = client;
  const { appId, orgId, configKey } = input;

  return gqlClient.query(
    `
      mutation ($appId: ID!, $orgId: ID, $configKey: String!) {
        applicationConfigDefinitionDelete(
          input: {
            appId: $appId
            orgId: $orgId
            configKey: $configKey
          }
        ) {
          success
        }
      }
    `,
    { appId, orgId, configKey },
    options
  );
}

async function helpGetApplicationConfig(client, input) {
  const { gqlClient, options } = client;
  const { orgId, appId, configKeyRegexp } = input;

  return gqlClient.query(
    `
      query ($orgId: ID!, $appId: ID!, $configKeyRegexp: String) {
        applicationConfig(
          orgId: $orgId
          appId: $appId
          configKeyRegexp: $configKeyRegexp
        ) {
          records {
            userId
            configKey
            value
          }
        }
      }
    `,
    { orgId, appId, configKeyRegexp },
    options
  );
}

async function helpGetApplicationJWT(client, input) {
  const { gqlClient, options } = client;
  const { appId, orgId, roleIds } = input;

  return gqlClient.query(
    `
      mutation ($appId: ID!, $orgId: ID!, $roleIds: [ID]) {
        getApplicationJWT(
          input: {
            appId: $appId
            orgId: $orgId
            roleIds: $roleIds
          }
        ) {
          applicationId
          organizationId
          token
        }
      }
    `,
    { appId, orgId, roleIds },
    options
  );
}

async function helpApplicationAddToOrg(client, input) {
  const { gqlClient, options } = client;
  const { orgId, appId, configs } = input;

  return gqlClient.query(
    `
      mutation ($orgId: ID!, $appId: ID!, $configs: [ApplicationConfigInput!]) {
        applicationAddToOrg(
          orgId: $orgId
          appId: $appId
          configs: $configs
        ) {
          id
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
            isApplicationEventRole
            organization {
              id
            }
          }
        }
      }
    `,
    { orgId, appId, configs },
    options
  );
}

async function helpUpdateApplicationComponent(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `
      mutation ($input: UpdateApplicationComponent!) {
        updateApplicationComponent(input: $input) {
          engines {
            records {
              id
            }
          }
          dataRegistries {
            records {
              id
            }
          }
        }
      }
    `,
    { input },
    options
  );
}

async function helpCreateContextMenuExtension(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation ($input: CreateContextMenuExtension!) {
      createContextMenuExtension(input: $input) {
        id
        label
        url
        type
      }
    }
  `;

  return gqlClient.query(query, { input }, options);
}

async function helpDeleteContextMenuExtension(client, input) {
  const { gqlClient, options } = client;

  const query = `
    mutation ($input: DeleteContextMenuExtension!) {
      deleteContextMenuExtension(input: $input) {
        id
      }
    }
  `;

  return gqlClient.query(query, { input }, options);
}

async function helpGetApplications(client, input) {
  const { gqlClient, options } = client;

  const query = ` query (
        $id: ID, $status: ApplicationStatus, $orgId: ID, $isPublic: Boolean, $excludeViewOnly: Boolean = true, $filter: ApplicationFilter, 
        $offset: Int = 0, $limit: Int = 30, $orderBy: [ApplicationSortField], $accessScope: [AccessScope!]
      ) {
        applications(
          id: $id, status: $status, orgId: $orgId, isPublic: $isPublic, excludeViewOnly: $excludeViewOnly, filter: $filter, 
          offset: $offset, limit: $limit, orderBy: $orderBy, accessScope: $accessScope
        ) {
          count
          records {
            id
            name
            key
            description
          }
        }
      }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'applications');
}

async function helpFileApplication(client, input) {
  const { gqlClient, options } = client;
  const query = `
  mutation fileAppToFolder ($input: FileApplication!) {
    fileApplication (input: $input) {
      id
      name
      description
    }
  }
  `;

  const result = await gqlClient.query(query, { input }, options);

  return _.get(result, 'fileApplication');
}

async function helpUnfileAppToFolder(client, input) {
  const { gqlClient, options } = client;

  const query = `
  mutation unfileApp ($input: UnfileApplication!) {
    unfileApplication (input: $input) {
      id
      name
      description
    }
  }
  `;

  const result = await gqlClient.query(query, { input }, options);

  return _.get(result, 'unfileApplication');
}

module.exports = {
  helpCreateApp,
  helpDeleteApp,
  helpGetApplication,
  helpUpdateApplication,
  helpDeleteApplication,
  helpApplicationWorkflow,
  helpUpdateApplicationEventEndpoint,
  helpRemoveApplicationEventEndpoint,
  helpUpdateApplicationRole,
  helpgGetApplications,
  helpCreateApplicationConfigDefinition,
  helpUpdateApplicationConfigDefinition,
  helpSetApplicationConfig,
  helpDeleteApplicationConfig,
  helpDeleteApplicationConfigDefinition,
  helpGetApplicationConfig,
  helpGetApplicationJWT,
  helpApplicationAddToOrg,
  helpUpdateApplicationComponent,
  helpCreateContextMenuExtension,
  helpDeleteContextMenuExtension,
  helpGetApplications,
  helpUnfileAppToFolder,
  helpFileApplication
};
