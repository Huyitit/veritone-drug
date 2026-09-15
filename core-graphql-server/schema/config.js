module.exports = {
  schemas: {
    public: {
      modules: [
        {
          name: 'customScalars',
          module: require('../modules/customScalars/index.js'),
          doNotWrap: true
        },
        {
          name: 'root',
          module: require('../modules/root/index.js'),
          doNotWrap: true
        },
        {
          name: 'core',
          module: require('../modules/core/index.js')
        },
        {
          name: 'v3DataModel',
          module: require('../modules/v3DataModel/index.js')
        },
        {
          name: 'workflow',
          module: require('../modules/workflow/index.js')
        },
        {
          name: 'rbacAuth',
          module: require('../modules/rbacAuth/index.js')
        },
        {
          name: 'batchActionsAPI',
          module: require('../modules/batchActionsAPI/index.js')
        },
        {
          name: 'instanceAuditLog',
          module: require('../modules/instanceAuditLog/index.js')
        }
      ]
    },
    internal: {
      modules: [
        {
          name: 'customScalars',
          module: require('../modules/customScalars/index.js'),
          doNotWrap: true
        },
        {
          name: 'root',
          module: require('../modules/root/index.js'),
          doNotWrap: true
        },
        {
          name: 'core',
          module: require('../modules/core/index.js'),
          importTypeDefs: false,
          importResolvers: false
        },
        {
          name: 'internalAPI',
          module: require('../modules/internalAPI/index.js')
        },
        {
          name: 'v3DataModel',
          module: require('../modules/v3DataModel/index.js'),
          importTypeDefs: false,
          importResolvers: false
        }
      ]
    }
  },
  directiveValidation: {
    scopes: {
      additionalRights: [
        'task_type.internal',
        'devops.querymonitor',
        'task_type:org_system',
        'source_type:update',
        'schema:update',
        'schema:read',
        'master',
        'user:create'
      ]
    }
  },
  requiredDirectives: [
    {
      onType: 'Mutation',
      all: ['limit'],
      default: {
        kind: 'Directive',
        name: {
          kind: 'Name',
          value: 'limit'
        },
        arguments: [
          {
            kind: 'Argument',
            name: {
              kind: 'Name',
              value: 'cost'
            },
            value: {
              kind: 'IntValue',
              value: '3'
            }
          }
        ]
      },
      description: 'Apply default cost limit of 3 to all mutations.'
    },
    {
      onType: 'Query',
      all: ['limit'],
      default: {
        kind: 'Directive',
        name: {
          kind: 'Name',
          value: 'limit'
        },
        arguments: [
          {
            kind: 'Argument',
            name: {
              kind: 'Name',
              value: 'cost'
            },
            value: {
              kind: 'IntValue',
              value: '1'
            }
          }
        ]
      },
      description: 'Apply default cost limit of 1 to all queries.'
    },
    {
      onType: 'Query',
      any: ['auth', 'noAuth'],
      default: {
        kind: 'Directive',
        name: {
          kind: 'Name',
          value: 'auth'
        },
        arguments: []
      },
      description:
        'Require one of auth or noAuth on every query. auth will be applied as the default.'
    },
    {
      ofType: 'EngineBlacklist',
      all: [
        {
          name: 'permissions',
          args: [
            {
              name: 'perms',
              any: 'superadmin'
            }
          ]
        }
      ],
      description:
        'EngineBlacklist objects are accessible only to Veritone admins'
    },

    {
      onType: 'Mutation',
      any: ['auth', 'noAuth'],
      description:
        'All mutations must have authentication and permissions directive',
      default: {
        kind: 'Directive',
        name: {
          kind: 'Name',
          value: 'auth'
        },
        arguments: []
      }
    }
  ]
};
