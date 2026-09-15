const { gql } = require('apollo-server-express');
const { makeExecutableSchema, forEachField } = require('graphql-tools');
const _ = require('lodash');

module.exports = function createModule(_serviceContext) {
  const serviceContext = require('./context.js')(_serviceContext);
  const config = serviceContext.config;
  const logger = serviceContext.logger;

  const util = require('../util.js')(serviceContext);
  const resolverUtil = require('../resolvers/index.js')(serviceContext);
  const schemaConfig = require('./config.js');
  const directives = require('./directives')(
    schemaConfig,
    config,
    logger,
    serviceContext
  );
  const attachDirectives = directives.attachDirectives;

  function createSchema(schemaName) {
    logger.debug('Loading modules for schema ' + schemaName);

    const directiveContext = {
      schemaConfig: schemaConfig,
      appConfig: config,
      config,
      logger: logger,
      serviceContext: serviceContext
    };

    /**
     * Each directive configuration imported in this list must have three fields:
     * - resolver: the resolver function
     * - before:  a boolean. if true, directive resolver executes before the
     *   field resolver. otherwise, after.
     * - name:  the directive name
     * - validator:  optional. a function that validates each directive usage.
     * Note that each directive must also be declared in the schema itself,
     * imported as typeDefs above.
     */
    const customDirectives = [
      require('./directives/Auth.js')(directiveContext),
      require('./directives/NoAuth.js')(directiveContext),
      require('./directives/Log.js')(directiveContext),
      require('./directives/NoLog.js')(directiveContext),
      require('./directives/FeatureFlag.js')(directiveContext),
      require('./directives/Audit.js')(directiveContext),
      require('./directives/TokenType.js')(directiveContext),
      require('./directives/Limit.js')(directiveContext),
      require('./directives/Deprecated.js')(directiveContext),
      require('./directives/Length.js')(directiveContext)
    ];

    const modules = loadModules(
      schemaName,
      schemaConfig.schemas[schemaName],
      serviceContext
    );

    // the directives using rbacBll inside should be initialized after loadModules.
    customDirectives.push(require('./directives/Scopes.js')(directiveContext));

    // rbac uses rbac.bll which is initialized by loadModules
    // only the public schema includes the rbac module, which loads rbac.bll
    // that is dependency of the directive.
    // TODO: find the way to access the bll in other schemas.
    if (schemaName === 'public') {
      const rbacDirectives = require('./directives/RBAC.js')(serviceContext);
      customDirectives.push(
        rbacDirectives.requireAuthRole,
        rbacDirectives.verifyAuthRoleAccess,
        rbacDirectives.authListFilter,
        rbacDirectives.authInherit
      );
    }

    modules.typeDefs.forEach(function (typeDef, index, array) {
      array[index] = gql(typeDef);
    });
    modules.resolverValidationOptions = {
      requireResolversForArgs: true
    };
    const schema = makeExecutableSchema(modules);
    listAndSetTypes(schema, serviceContext);
    attachDirectives(schema, customDirectives);

    return schema;
  }

  function listAndSetTypes(schema, serviceContext) {
    if (!serviceContext._schemaTypeList) {
      serviceContext._schemaTypeList = [];
    }
    forEachField(schema, (field, typeName, fieldName) => {
      if (!serviceContext._schemaTypeList.includes(typeName)) {
        serviceContext._schemaTypeList.push(typeName);
      }
    });
  }

  function loadModules(schemaName, schemaConfig, context) {
    let typeDefs = [];
    let resolvers = {};

    schemaConfig.modules.forEach((moduleConfig) => {
      // if this module is optional / guarded by a feature flag,
      // check context config to see if it should be loaded.
      if (_.get(moduleConfig, 'optional', false)) {
        // if the schema config section isn't in the server.json config
        // file, this will simply not enable the module.
        // this prevents server startup error when datacenter-config
        // hasn't been updated.
        if (
          _.get(
            context.config,
            'schemas.' + schemaName + '.enabledModules',
            []
          ).includes(moduleConfig.name)
        ) {
          logger.debug('schema module ' + moduleConfig.name + ' is enabled');
        } else {
          logger.debug(
            'schema module ' + moduleConfig.name + ' is NOT enabled'
          );
          return;
        }
      }

      const module = loadModule(context, moduleConfig);

      // append typeDefs. by intention, this is not recursive.
      // we don't want to allow the same type to be defined twice.
      // instead, the later module should extend the type.
      typeDefs = typeDefs.concat(module.typeDefs);

      // recursively merge resolvers
      resolvers = _.merge(resolvers, module.resolvers);
      logger.debug(
        module.typeDefs.length +
          ' typedefs and ' +
          Object.keys(module.resolvers).length +
          ' resolvers loaded for ' +
          moduleConfig.name
      );
    });
    return { typeDefs, resolvers };
  }

  function loadModule(context, moduleConfig) {
    // first load the module.
    // should return a map of { typeDefs, resolvers }
    const module = moduleConfig.module(context);

    // now transform all resolver functions
    // resolvers will always be object of structure:
    // { typeName: { fieldName: function, fieldName: function }, typeName...}

    let resolvers = {};

    // resolvers some modules will not be wrapped.
    // by default, they are. but if not then just use the original map.
    if (moduleConfig.doNotWrap) {
      resolvers = module.resolvers;
    } else {
      Object.keys(module.resolvers).forEach((typeName) => {
        let op = 'field';
        if (typeName === 'Query') op = 'query';
        else if (typeName === 'Mutation') op = 'mutation';
        else if (typeName === 'SubscriptionService') op = 'subscription';

        resolvers[typeName] = resolverUtil.wrapResolverMap(
          module.resolvers[typeName],
          op
        );
      });
    }

    // by default, all queries are mutations are imported from each module.
    // that behavior can be overridden so that a given schema can use
    // types from other modules without exposing all the queries and mutations.

    // TODO this code is fragile in that it assumes consistent single-spacing
    // in the Query and Mutation type definitions.
    // at some point it needs to be made whitespace-tolerant.
    function stripType(type, typeDef) {
      const extendStr = `extend type ${type} {`;
      const typeStr = `type ${type} {`;

      // first strip extend type, if present
      let res = util.stripSectionFromString(extendStr, '}', typeDef);
      // now strip base type
      res = util.stripSectionFromString(typeStr, '}', res);
      return res;
    }

    // if this module was configured to not import queries, clear them here.
    if (_.get(moduleConfig, 'importQuery', true) === false) {
      module.typeDefs = module.typeDefs.map((typeDef) =>
        stripType('Query', typeDef)
      );
      delete resolvers['Query'];
      logger.debug('removed Query from ' + moduleConfig.name);
    }
    // if this module was configured to not import mutations, clear them here.
    if (_.get(moduleConfig, 'importMutation', true) === false) {
      module.typeDefs = module.typeDefs.map((typeDef) =>
        stripType('Mutation', typeDef)
      );
      delete resolvers['Mutation'];
      logger.debug('removed Mutation from ' + moduleConfig.name);
    }

    // if this module was configured to not import typeDefs, clear them here.
    if (_.get(moduleConfig, 'importTypeDefs', true) === false) {
      module.typeDefs = [];
      logger.debug('removed typeDefs from ' + moduleConfig.name);
    }

    // if this module was configured to not import resolvers, clear them here.
    if (_.get(moduleConfig, 'importResolvers', true) === false) {
      resolvers = {};
      logger.debug('removed resolvers from ' + moduleConfig.name);
    }

    // return it back out.
    return {
      typeDefs: module.typeDefs,
      resolvers: resolvers
    };
  }

  return {
    createSchema
  };
};
