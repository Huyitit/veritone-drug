const GraphQLJSON = require('graphql-type-json');
const Kind = require('graphql/language').Kind;
const GraphQLScalarType = require('graphql').GraphQLScalarType;
const GraphQLBigInt = require('apollo-type-bigint').default;
const moment = require('moment');
const fs = require('fs');
const timeFormat = 'HH:mm:ssZ';
const LocalTime = require('js-joda').LocalTime;

module.exports = function createModule(serviceContext) {
  const errors = require('../../error/index.js')({});
  const util = require('../../util.js')(serviceContext);

  function parseJSONLiteral(ast) {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.OBJECT: {
        const value = Object.create(null);
        ast.fields.forEach((field) => {
          value[field.name.value] = parseJSONLiteral(field.value);
        });
        return value;
      }
      case Kind.LIST:
        return ast.values.map(parseJSONLiteral);
      default:
        return null;
    }
  }

  const resolvers = {
    UploadedFile: {
      __parseLiteral: parseJSONLiteral,
      __serialize: (value) => value,
      __parseValue: (value) => value
    },

    JSONData: GraphQLJSON,

    BigInt: class SafeGraphQLBigInt extends GraphQLBigInt {
      constructor() {
        super('safe');
      }
    },

    DateTime: new GraphQLScalarType({
      name: 'DateTime',
      description:
        'Date/time scalar value in RFC-3339 format (preferred) or epoch-seconds',
      parseValue(value) {
        if (Number.isNaN(value)) {
          return moment(value).unix() * 1000; // parse RFC 2822 date string
        } else if (value < 10000000000) {
          return value * 1000; // convert s to ms
        }
        return value; // otherwise, looks like ms timestamp
      },
      serialize(value) {
        if (typeof value === 'number') {
          return moment(value).toISOString();
        } else if (typeof value === 'string') {
          // a string might be in a different format than our standard
          return moment(value).toISOString();
        }
        return value.toISOString(); // value sent to the client
      },
      parseLiteral(ast) {
        let res = null;
        if (ast.kind === Kind.STRING) {
          res = moment(ast.value).unix() * 1000; // ast value is always in string format
        } else if (ast.kind === Kind.INT) {
          if (ast.value < 100000000000) {
            res = ast.value * 1000; // looks like sec. convert to ms.
          } else {
            res = ast.value;
          }
        }
        return res;
      }
    }),

    // the "Time" type uses the object format returned by
    // core-graphql-server/util.js::parseTimeOnly, which includes
    // time zone information.
    Time: new GraphQLScalarType({
      name: 'Time',
      description: 'Time-only scalar value in RFC-3339 format',
      parseValue(value) {
        return util.parseTimeOnly(value);
      },
      serialize(value) {
        try {
          return util.timeOnlyToString(util.parseTimeOnly(value));
        } catch (err) {
          console.log(err);
          // if we can't properly serialize the value, just return what
          // we have rather than erroring out.
          return value;
        }
      },
      parseLiteral(ast) {
        return util.parseTimeOnly(ast.value);
      }
    })
  };

  const typeDefs = [
    fs.readFileSync('./modules/customScalars/customScalars.graphql', 'utf8')
  ];

  return {
    typeDefs,
    resolvers
  };
};
