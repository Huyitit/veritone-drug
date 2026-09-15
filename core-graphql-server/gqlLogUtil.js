const _ = require('lodash');
const { visit, print, separateOperations } = require('graphql');

// algorithm from: https://github.com/apollographql/apollo-tooling/blob/master/packages/apollo-graphql/src/operationId.ts
module.exports = function createModule() {
  function sorted(items, fields) {
    if (items) {
      return _.sortBy(items, fields);
    }
    return undefined;
  }

  function _sortAST(ast) {
    return visit(ast, {
      Document: (node) => {
        return {
          ...node,
          definitions: _.sortBy(node.definitions, ['kind', 'name.value'])
        };
      },
      OperationDefinition: (node) => {
        return {
          ...node,
          variableDefinitions: sorted(node.variableDefinitions, [
            'variable.name.value'
          ])
        };
      },
      SelectionSet: (node) => {
        return {
          ...node,
          // Define an ordering for field names in a SelectionSet.  Field first,
          // then FragmentSpread, then InlineFragment.  By a lovely coincidence,
          // the order we want them to appear in is alphabetical by node.kind.
          // Use sortBy instead of sorted because 'selections' is not optional.
          selections: _.sortBy(node.selections, ['kind', 'name.value'])
        };
      },
      Field: (node) => {
        return {
          ...node,
          arguments: sorted(node.arguments, ['name.value'])
        };
      },
      FragmentSpread: (node) => {
        return {
          ...node,
          directives: sorted(node.directives, ['name.value'])
        };
      },
      InlineFragment: (node) => {
        return {
          ...node,
          directives: sorted(node.directives, ['name.value'])
        };
      },
      FragmentDefinition: (node) => {
        return {
          ...node,
          directives: sorted(node.directives, ['name.value']),
          variableDefinitions: sorted(node.variableDefinitions, [
            'variable.name.value'
          ])
        };
      },
      Directive: (node) => {
        return {
          ...node,
          arguments: sorted(node.arguments, ['name.value'])
        };
      }
    });
  }

  function _hideLiterals(ast) {
    return visit(ast, {
      IntValue: (node) => {
        return {
          ...node,
          value: '0'
        };
      },
      FloatValue: (node) => {
        return {
          ...node,
          value: '0'
        };
      },
      StringValue: (node) => {
        return {
          ...node,
          value: '',
          block: false
        };
      },
      ListValue: (node) => {
        return {
          ...node,
          values: []
        };
      },
      ObjectValue: (node) => {
        return {
          ...node,
          fields: []
        };
      }
    });
  }

  function _removeAliases(ast) {
    return visit(ast, {
      Field: (node) => {
        return {
          ...node,
          alias: undefined
        };
      }
    });
  }

  function _dropUnusedDefinitions(ast, operationName) {
    if (operationName) {
      const separated = separateOperations(ast)[operationName];
      if (separated) {
        return separated;
      }
    }
    return ast;
  }

  function _printWithReducedWhitespace(ast) {
    const sanitizedAST = visit(ast, {
      StringValue: (node) => {
        return {
          ...node,
          value: Buffer.from(node.value, 'utf8').toString('hex'),
          block: false
        };
      }
    });
    const withWhitespace = print(sanitizedAST);
    const minimizedButStillHex = withWhitespace
      .replace(/\s+/g, ' ')
      .replace(/([^_a-zA-Z0-9]) /g, (_, c) => c)
      .replace(/ ([^_a-zA-Z0-9])/g, (_, c) => c);
    return minimizedButStillHex.replace(/"([a-f0-9]+)"/g, (_, hex) =>
      JSON.stringify(Buffer.from(hex, 'hex').toString('utf8'))
    );
  }

  function printGraphqlRequestDoc(doc, operationName) {
    if (operationName === 'IntrospectionQuery') {
      return '';
    }
    return _printWithReducedWhitespace(
      _sortAST(
        _removeAliases(
          _hideLiterals(_dropUnusedDefinitions(doc, operationName))
        )
      )
    );
  }

  return {
    printGraphqlRequestDoc
  };
};
