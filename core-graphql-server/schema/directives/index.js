'use strict';

const { getArgumentValues } = require('graphql/execution/values');
const { SchemaDirectiveVisitor, forEachField } = require('graphql-tools');
const _ = require('lodash');

module.exports = function create(config, appConfig, logger, serviceContext) {
  const mainUtil = require('../../util.js')();

  function checkRequiredDirectives(field, typeName, fieldName) {
    const directives = field.astNode.directives;
    const names = directives.map((dir) => dir.name.value);
    const name = field.name;
    const type = field.type;
    const kind = field.astNode.kind;
    const requiredDirectives = config.requiredDirectives;

    requiredDirectives.forEach((requiredDirective) => {
      if (requiredDirective.onType && requiredDirective.ofType) {
        throw new Error(
          'Misconfiguration in server schema validation. ' +
            'Only one of ofType and onType can be defined on a required directive. ' +
            requiredDirective.description
        );
      }

      // directives are required on the field
      if (
        requiredDirective.onType === typeName ||
        requiredDirective.ofType === field.type ||
        requiredDirective.global
      ) {
        // get list of "any" and "all" directives
        const any = requiredDirective.any || [];
        const all = requiredDirective.all || [];

        // first apply default if there is one
        if (requiredDirective.default) {
          const requiredDirs = _.union(any, all);
          // apply the default if none of the referenced directives have
          // already been applied
          if (_.intersection(requiredDirs, names).length < 1) {
            // default directives are always added first
            directives.push(requiredDirective.default);
            // logger.debug(
            //   'Default directive ' +
            //     requiredDirective.default.name.value +
            //     ' has been applied to ' +
            //     typeName +
            //     '.' +
            //     fieldName
            // );
          }
        }
        verifyRequiredDirectives(any, all, field, typeName, fieldName);
      }
    });
  }

  function verifyRequiredDirectives(any, all, field, typeName, fieldName) {
    let pass = any.length < 1; // start at true if there are not "any"
    // otherwise following loop will set to true.
    for (let i = 0; i < any.length; i++) {
      if (verifyRequiredDirective(any[i], field)) {
        pass = true;
        continue;
      }
    }
    for (let i = 0; pass && i < all.length; i++) {
      if (!verifyRequiredDirective(all[i], field)) {
        pass = false;
      }
    }
    if (!pass) {
      throw new Error(
        typeName +
          '.' +
          fieldName +
          ' is missing a required directive. ' +
          'Any of [' +
          any +
          '] and all of [' +
          all +
          '] are required on this field.'
      );
    }
  }

  function verifyRequiredDirective(requiredDirectiveName, field) {
    const names = field.astNode.directives.map((dir) => dir.name.value);
    return names.includes(requiredDirectiveName);
  }

  const scalarTypes = [
    'ID',
    'Int',
    'Float',
    'Boolean',
    'String',
    'DateTime',
    'JSON',
    'JSONData',
    'Time'
  ];

  const argsProcessed = [];

  // if the type of the specified argument is an object (input type), applies
  // directives to all of its fields.
  function attachDirectivesToInputType(
    schema,
    directiveResolvers,
    field,
    typeName,
    fieldName,
    arg, // e.g. scheduleId
    inputTypeName,
    directiveValidators,
    argPath // e.g. input.scheduleId
  ) {
    let type = mainUtil.stringReplace(_.toString(inputTypeName), '\\!', '');
    type = mainUtil.stringReplace(type, '\\[', '');
    type = mainUtil.stringReplace(type, '\\]', '');

    // if this is a scalar field (not an input type), just skip it
    if (scalarTypes.includes(type)) return;

    const typeDef = schema._typeMap[type];
    if (!typeDef)
      throw new Error('schema or code error:  no typedef found for ' + type);

    const inputTypeFields = typeDef.astNode.fields || [];
    inputTypeFields.forEach((inputTypeField) => {
      // the actual type name will be at a different level depending on
      // whether it's an array or required.
      // field: Type, field: [Type], field: [Type!], or field: [Type!]!
      const inputType = _.get(
        inputTypeField,
        'type.type.type.type.name.value',
        _.get(
          inputTypeField,
          'type.type.type.name.value',
          _.get(
            inputTypeField,
            'type.type.name.value',
            _.get(inputTypeField, 'type.name.value')
          )
        )
      );
      const inputName = _.get(inputTypeField, 'name.value');

      // get the def for the input type / arg
      const inputTypeDef = schema._typeMap[inputType];

      // do not process the same field more than once.
      // this prevents infinite recursion and wasted processing.
      const key =
        typeName +
        '.' +
        fieldName +
        '.' +
        type +
        '.' +
        inputName +
        '.' +
        inputType;

      if (argsProcessed.includes(key)) return;
      argsProcessed.push(key);

      // attach directives to this argument
      attachArgDirectives(
        schema,
        directiveResolvers,
        typeName,
        fieldName,
        field,
        inputTypeField,
        directiveValidators,
        argPath + '.' + inputName
      );

      // recursively apply to nested input types
      attachDirectivesToInputType(
        schema,
        directiveResolvers,
        field,
        typeName,
        fieldName,
        inputTypeField,
        inputType,
        directiveValidators,
        argPath + '.' + inputName
      );
    });
  }

  function attachArgDirectives(
    schema,
    directiveResolvers,
    typeName,
    fieldName,
    field,
    arg,
    directiveValidators,
    argPath
  ) {
    const directives = arg.directives || arg.astNode.directives;
    const argName = _.get(arg, 'name.value', arg.name);

    directives.forEach((directive) => {
      const directiveName = directive.name.value;

      // directive resolvers can be configured to execute either before or
      // after the "real" resolver. These two cases require slightly different
      // handling.
      const { isBefore, resolver } = getAndCheckResolver(
        schema,
        directiveResolvers,
        directiveName,
        typeName,
        fieldName
      );

      // an "after" resolver can't be attached to a parameter since parameters
      // must be validated and handled BEFORE the field resolver runs.
      if (!isBefore) {
        throw new Error(
          'The custom directive ' +
            directiveName +
            ' can run cannot be attached to a parameter argument because ' +
            'it is implemented to run after a resolver.'
        );
      }
      const Directive = schema.getDirective(directiveName);
      const directiveArgs = getDirectiveArgumentValues(
        Directive,
        directive,
        directiveName,
        typeName,
        fieldName + '.' + argName
      );
      const validator = directiveValidators[directiveName];
      if (validator) {
        // should throw out with a useful error if the validation fails.
        validator(directiveArgs, field, schema);
      }

      attachBeforeResolver(
        field,
        directiveArgs,
        resolver,
        typeName,
        argName,
        argPath
      );
    });
  }

  function attachArgsDirectives(
    schema,
    directiveResolvers,
    field,
    typeName,
    fieldName,
    directiveValidators
  ) {
    const args = field.args || [];

    args.forEach((arg) => {
      // handle input types
      attachDirectivesToInputType(
        schema,
        directiveResolvers,
        field,
        typeName,
        fieldName,
        arg,
        arg.type,
        directiveValidators,
        arg.name // argPath
      );
      // attach directives for this argument
      attachArgDirectives(
        schema,
        directiveResolvers,
        typeName,
        fieldName,
        field,
        arg,
        directiveValidators,
        arg.name
      );
    });
  }

  function getDirectiveArgumentValues(
    Directive,
    directive,
    directiveName,
    typeName,
    fieldName
  ) {
    try {
      return getArgumentValues(Directive, directive);
    } catch (err) {
      throw new Error(
        'Directive configuration error for ' +
          directiveName +
          ' on ' +
          typeName +
          '.' +
          JSON.stringify(fieldName) +
          ':  ' +
          err
      );
    }
  }

  function getAndCheckResolver(
    schema,
    directiveResolvers,
    directiveName,
    typeName,
    fieldName
  ) {
    // directive resolvers can be configured to execute either before or
    // after the "real" resolver. These two cases require slightly different
    // handling.
    const beforeResolver = directiveResolvers.before[directiveName];
    const afterResolver = directiveResolvers.after[directiveName];
    const typeResolver = directiveResolvers.type[directiveName];
    if (beforeResolver && afterResolver) {
      throw new Error(
        'The custom directive ' +
          directiveName +
          ' can run either ' +
          'before or after the field resolvers, not both. Fix this in the directive ' +
          'source files'
      );
    }
    if (!(beforeResolver || afterResolver)) {
      throw new Error(
        'Directive ' +
          directiveName +
          ' is used on ' +
          typeName +
          '.' +
          fieldName +
          ' but not defined. Check ' +
          ' typedefs and resolvers'
      );
    }
    const theResolver = beforeResolver || afterResolver;
    const Directive = schema.getDirective(directiveName);
    if (!Directive) {
      throw new Error(
        'Directive ' +
          directiveName +
          ' not defined. Check ' +
          ' typedefs and resolvers'
      );
    }

    const isBefore = !_.isNil(beforeResolver);
    const isTypeDirective = !_.isNil(typeResolver);
    return { isBefore, isTypeDirective, resolver: theResolver, typeResolver };
  }

  // Credit for this technique: agonbina https://github.com/apollographql/graphql-tools/issues/212
  function attachDirectives(schema, customDirectives, typeResolvers) {
    const directiveResolvers = {
      before: {},
      after: {},
      type: {}
    };
    const directiveValidators = {};

    const dirDefs = [];

    customDirectives.forEach((dirDef) => {
      // verify has name, before, resolver
      if (!dirDef.name) {
        throw new Error(
          'a custom directive definition is missing the name attribute'
        );
      }
      if (!Object.prototype.hasOwnProperty.call(dirDef, 'before')) {
        throw new Error(
          'a custom directive definition is missing the before attribute. it is required and must be true or false'
        );
      }
      if (!(dirDef.resolver && _.isFunction(dirDef.resolver))) {
        throw new Error(
          'a custom directive definition is missing the resolver attribute. it is required and must be a function'
        );
      }
      // verify that if validator exists it is a function
      if (dirDef.validator && !_.isFunction(dirDef.validator)) {
        throw new Error(
          'a custom directive definition has a validator attribute, but the value is not a function.'
        );
      }
      // add resolver function to the right map
      if (dirDef.before) {
        directiveResolvers.before[dirDef.name] = dirDef.resolver;
      } else {
        directiveResolvers.after[dirDef.name] = dirDef.resolver;
      }
      if (dirDef.validator) {
        directiveValidators[dirDef.name] = dirDef.validator;
      }
      if (dirDef.typeResolver) {
        directiveResolvers.type[dirDef.name] = dirDef.typeResolver;
      }
    });

    // for each type, look for directive
    const allTypes = schema.getTypeMap();
    for (const gqlType in allTypes) {
      if (Object.hasOwnProperty.call(allTypes, gqlType)) {
        const typeDefinition = allTypes[gqlType];
        if (!typeDefinition.astNode) {
          continue;
        }
        checkRequiredDirectives(typeDefinition, gqlType, gqlType);
        attachTypeDirective(
          schema,
          typeDefinition,
          gqlType,
          directiveResolvers,
          directiveValidators,
          typeResolvers
        );
      }
    }

    // for each field on every type in the schema, we'll look for directives (@directiveName)
    forEachField(schema, (field, typeName, fieldName) => {
      checkRequiredDirectives(field, typeName, fieldName);
      attachArgsDirectives(
        schema,
        directiveResolvers,
        field,
        typeName,
        fieldName,
        directiveValidators
      );

      const directives = field.astNode.directives;

      // for every directive attached to the field, we need to create a resolver
      // wrapper function and chain it to the "real" resolver.
      directives.forEach((directive) => {
        const directiveName = directive.name.value;
        const { isBefore, resolver } = getAndCheckResolver(
          schema,
          directiveResolvers,
          directiveName,
          typeName,
          fieldName
        );

        const oldResolve = field.resolve;
        const Directive = schema.getDirective(directiveName);

        const args = getDirectiveArgumentValues(
          Directive,
          directive,
          directiveName,
          typeName,
          fieldName
        );
        // each use of a directive might have parameters. optionally,
        // a directive can have a validator function that verifies that
        // the paremeters are valid. this occurs DURING SERVER STARTUP.
        // if the directive has a validator, we run it now.
        const validator = directiveValidators[directiveName];
        if (validator) {
          // should throw out with a useful error if the validation fails.
          validator(args, field, schema);
        }

        if (!isBefore) {
          field.resolve = function (resultObject, fieldArgs, context, info) {
            const _arguments = [resultObject, fieldArgs, context, info];
            // if there is no resolver function for this field, just
            // invoke the "after" resolver function with the result.
            if (!oldResolve) {
              return resolver(
                resultObject,
                args,
                fieldArgs,
                context,
                info,
                resultObject[fieldName]
              );
            }
            // otherwise we need to call its resolver function
            let promise = oldResolve.call(field, ..._arguments);

            const isPrimitive = !(promise instanceof Promise);
            if (isPrimitive) {
              promise = Promise.resolve(promise);
            }

            return promise
              .then((result) =>
                resolver(
                  resultObject,
                  args,
                  fieldArgs,
                  context,
                  info,
                  result,
                  null
                )
              )
              .catch((err) =>
                resolver(
                  resultObject,
                  args,
                  fieldArgs,
                  context,
                  info,
                  null,
                  err
                )
              );
          };
        } else {
          // run before main resolver
          attachBeforeResolver(field, args, resolver, typeName);
        }
      });
    });
  }

  function attachTypeDirective(
    schema,
    typeDef,
    typeName,
    directiveResolvers,
    directiveValidators,
    typeResolvers
  ) {
    if (!typeDef.astNode) {
      return;
    }
    const ignoredDefinitions = {
      EnumTypeDefinition: 1,
      ScalarTypeDefinition: 1
    };
    if (ignoredDefinitions[typeDef.astNode.kind]) {
      return;
    }
    const directives = typeDef.astNode.directives;
    if (!directives || !directives.length) {
      return;
    }

    // for every directive attached to the type, we need to create a resolver
    // wrapper function and chain it to the "real" resolver.
    directives.forEach((directive) => {
      const directiveName = directive.name.value;
      const { typeResolver, isTypeDirective } = getAndCheckResolver(
        schema,
        directiveResolvers,
        directiveName,
        typeName,
        typeName
      );
      if (!isTypeDirective || !typeResolver) {
        // ignore all other directives, since the current implementation skip these
        return;
      }
      const Directive = schema.getDirective(directiveName);

      const directiveArgs = getDirectiveArgumentValues(
        Directive,
        directive,
        directiveName,
        typeName,
        typeName
      );
      // each use of a directive might have parameters. optionally,
      // a directive can have a validator function that verifies that
      // the paremeters are valid. this occurs DURING SERVER STARTUP.
      // if the directive has a validator, we run it now.
      const validator = directiveValidators[directiveName];
      if (validator) {
        // should throw out with a useful error if the validation fails.
        validator(directiveArgs, typeDef, schema);
      }

      // this looks horribly bad, but it seems to be the common solution (see graphql-tools/compose-resolver)
      // basically wrap every resolver field of the type with our directive func
      const fields = typeDef.getFields();
      Object.keys(fields).forEach((fieldName) => {
        const field = fields[fieldName];
        const originalResolve =
          field.resolve || ((object) => object[field.name]);

        field.resolve = async function (...args) {
          // see postRequestAuthResolver
          let promise = typeResolver.call(
            field,
            typeDef,
            directiveArgs,
            args[1], // field args
            args[2], // context
            args[3], // ast info
            args[0] // result
          );
          const isPrimitive = !(promise instanceof Promise);
          let val = promise;
          if (isPrimitive) {
            promise = Promise.resolve(val);
          }
          await promise;
          const data = await originalResolve.apply(this, args);
          return data;
        };
      });
    });
  }

  function attachBeforeResolver(
    field,
    directiveArgs,
    beforeResolver,
    typeName,
    argName,
    argPath
  ) {
    let oldResolve = field.resolve;
    if (!oldResolve) {
      if (typeName !== 'Mutation' && typeName !== 'Query') {
        // for normal fields, we'll create a simple placeholder resolver
        // if one does not exist so that the wrapper code below doesn't
        // interfere with normal function
        oldResolve = (object) => object[field.name];
      } /* TODO enable when schema cleaned up else {
        throw new Error('No resolver function defined for '+typeName+'.'+field.name+
        '. Every Query and Mutation field must have a resolver.');
      } */
    }
    field.resolve = function (what, fieldArgs, context, info) {
      if (argName) fieldArgs.__directiveArgName = argName;
      const _arguments = [what, fieldArgs, context, info];
      // handling directives on parameters is tricky. we'll enter this code
      // if the field in question has a parameter with a directive. but
      // we don't want to execute the directive resolver unless the parameter
      // is actually set in the query. so we keep track of the "path" to
      // the parameter value and only execute the resolver if the parameter
      // is bound to a value. otherwise we just execute the real field resolver.
      if (argPath && !_.get(fieldArgs, argPath, null)) {
        return _.isFunction(oldResolve)
          ? oldResolve.call(field, ..._arguments)
          : null;
      }

      let promise = beforeResolver.call(
        field,
        directiveArgs,
        fieldArgs,
        context,
        info
      );

      const isPrimitive = !(promise instanceof Promise);

      // note that for a "before" directive the return value from the
      // directive resolver will typically be undefined
      let val = promise;
      if (isPrimitive) {
        promise = Promise.resolve(val);
      }

      return promise.then((input) =>
        _.isFunction(oldResolve) ? oldResolve.call(field, ..._arguments) : val
      );
    };
  }

  return {
    attachDirectives
  };
};
