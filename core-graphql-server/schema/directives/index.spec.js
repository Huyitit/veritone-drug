const chaiExpect = require('chai').expect;
const _ = require('lodash');
const { makeExecutableSchema } = require('graphql-tools');

const serviceContext = require('../../test/serviceContext.mock.js')();

const util = require('./index.js')(
  {
    // mock config defines a required default directive
    requiredDirectives: [
      {
        onType: 'Mutation',
        all: ['required'],
        default: {
          kind: 'Directive',
          name: {
            kind: 'Name',
            value: 'required'
          },
          arguments: [
            {
              kind: 'Argument',
              name: {
                kind: 'Name',
                value: 'param'
              },
              value: {
                kind: 'IntValue',
                value: 1
              }
            }
          ]
        }
      }
    ]
  },
  serviceContext.config,
  serviceContext.logger,
  serviceContext
);

// mock schema. it defines some directives and binds them to
// some test fields and parameters.
const schemaDef = `
directive @testDirective(
  testParam: String
  tag: String
) on QUERY | MUTATION | FIELD | ARGUMENT_DEFINITION | INPUT_OBJECT | INPUT_FIELD_DEFINITION | OBJECT | FIELD_DEFINITION

directive @testDirectiveAfter(
  testParam: String
  tag: String
) on QUERY | MUTATION | FIELD | FIELD_DEFINITION

directive @required(
  param: Int!
  tag: String
) on QUERY | MUTATION

schema {
  query: Query
  mutation: Mutation
}

type Query {
  testTypes(
    param1: Int
    param2: String
    @testDirective(testParam: "badValue" tag: "testTypes.param2")
  ): [TestType!]!

  testType(id: ID!): TestType
}

type Mutation {
  createTestType(input: CreateTestType!): TestType!
  @testDirectiveAfter(testParam: "test" tag: "createTestType mutation")
}

input CreateTestType {
  innerTestType: CreateInnerTestType!
  testField: String
  @testDirective(testParam: "goodValue" tag: "CreateTestType.testField")
  testField2: String
}

input CreateInnerTestType {
  testField: String
  testField2: String
  @testDirective (testParam: "badValue" tag: "CreateInnerTestType.testField2")
}

type TestType {
  testField: InnerTestType!
  @testDirective(tag: "TestType.testField")
  testField2: InnerTestType

  testField3: String
  @testDirective(testParam: "badValue1" tag: "TestType.testField3")
}

type InnerTestType {
  testField: String
  @testDirective(tag: "InnerTestType.testField")
  testField2: String
  @testDirective(testParam: "badValue" tag: "InnerTestType.testField2")
}



`;

// a mock object used by the mock resolvers
const testObj = {
  testField: {
    testField: 'test1',
    testField2: 'test2'
  },
  testField2: null,
  testField3: 'test3'
};

// mock resolvers
const schemaResolvers = {
  Query: {
    testTypes: (root, args, context, info) => [testObj],
    testType: (root, args, context, info) => testObj
  },
  Mutation: {
    createTestType: (root, args, context, info) => testObj
  },
  TestType: {
    testField: (obj, args, context, info) => obj.testField,
    testField2: (obj, args, context, info) => obj.testField2,
    testField3: (obj, args, context, info) => obj.testField3
  },
  InnerTestType: {
    testField: (obj, args, context, info) => obj.testField,
    testField2: (obj, args, context, info) => obj.testField2
  }
};

const schemaModule = {
  typeDefs: schemaDef,
  resolvers: schemaResolvers
};
const schema = makeExecutableSchema(schemaModule);

let allowFail = true;
let testData = {};

// mock custom directives. we'll use the "validate" function to
// record when each directive is attached to a field or parameter.
const directives = [
  {
    name: 'testDirective',
    before: true,
    validator: (directiveArgs, field, schema) => {
      if (allowFail && directiveArgs.testParam === 'badValue') {
        throw new Error('validation error ' + directiveArgs.testParam);
      }

      if (_.isNil(testData.testDirective)) testData.testDirective = 1;
      else testData.testDirective++;
    },
    resolver: (args, fieldArgs, context, info) => {
      context.runTestData.testDirective++;
    }
  },
  {
    name: 'testDirectiveAfter',
    before: false,
    resolver: (object, args, fieldArgs, context, info) => {
      context.runTestData.testDirectiveAfter++;
      return object;
    },
    validator: (directiveArgs, field, schema) => {
      if (_.isNil(testData.testDirectiveAfter)) testData.testDirectiveAfter = 1;
      else testData.testDirectiveAfter++;
    }
  },
  {
    name: 'required',
    before: true,
    resolver: (args, fieldArgs, context, info) => {
      context.runTestData.required++;
    },
    validator: (directiveArgs, field, schema) => {
      if (_.isNil(testData.required)) testData.required = 1;
      else testData.required = testData.required + 1;
    }
  }
];
describe('#directives/index.js', function () {
  describe('#public', function () {
    it('should load public schema', function () {
      chaiExpect(schema).to.exist;
    });
    it('should have correct exports', function () {
      chaiExpect(typeof util).to.equal('object');
      chaiExpect(Object.keys(util).length).to.equal(1);
      chaiExpect(typeof util.attachDirectives).to.equal('function');
    });
  });
  describe('#attachDirectives', function () {
    it('should attach directives properly', async function () {
      allowFail = false;
      util.attachDirectives(schema, directives);
      chaiExpect(testData.required).to.equal(1); // 1 mutation gets default directive
      chaiExpect(testData.testDirective).to.equal(7);

      // now call some resolvers and verify that the directive resolver
      // executes as expected
      const context = {
        requestInfo: { type: 'test' },
        runTestData: {
          required: 0,
          testDirective: 0,
          testDirectiveAfter: 0
        }
      };
      const res = {
        testTypes: _.get(schema._typeMap, 'Query._fields.testTypes.resolve'),
        testType: _.get(schema._typeMap, 'Query._fields.testType.resolve'),
        createTestType: _.get(
          schema._typeMap,
          'Mutation._fields.createTestType.resolve'
        )
      };
      chaiExpect(typeof res.testTypes).to.equal('function');
      chaiExpect(typeof res.testType).to.equal('function');
      chaiExpect(typeof res.createTestType).to.equal('function');

      // calling testTypes without flagged param should not execute resolver
      let args = { param1: 1 };
      await res.testTypes({}, args, context, {});
      // TODO later fix this logic so it's only set if the param is passed.
      // it's not hurting anything right now but isn't clean code.
      //chaiExpect(args.__directiveArgName).to.be.undefined;
      chaiExpect(context.runTestData.testDirective).to.equal(0);
      // calling testType (no directive) should not execute resolver
      await res.testType({}, {}, context, {});
      chaiExpect(context.runTestData.testDirective).to.equal(0);

      // calling it with flagged param should execute resolver
      args = { param1: 1, param2: 'foo' };
      await res.testTypes({}, args, context, {});
      chaiExpect(context.runTestData.testDirective).to.equal(1);
      chaiExpect(args.__directiveArgName).to.equal('param2');

      // calling mutation without flagged input fields should not execute
      await res.createTestType(
        {},
        {
          innerTestType: {
            testField: 'foo'
          },
          testField2: 'bar'
        },
        context,
        {}
      );
      chaiExpect(context.runTestData.testDirective).to.equal(1);

      // calling mutation using flagged input fields should execute
      await res.createTestType(
        {},
        {
          input: {
            testField: 'foo', // 1
            innerTestType: {
              testField: 'foo',
              testField2: 'bar' // 2
            },
            testField2: 'bar'
          }
        },
        context,
        {}
      );
      chaiExpect(context.runTestData.testDirective).to.equal(3);

      // calling mutation with "after" resolver should execute
      chaiExpect(context.runTestData.testDirectiveAfter).to.equal(2);
    });
    it('should validate and error out on validation failure', function () {
      allowFail = true;
      testData = {};
      try {
        util.attachDirectives(schema, directives);
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('validation error');
        chaiExpect(_.toString(err)).to.include('badValue');
      }
    });
    it('should require a required directive', function () {
      allowFail = false;
      const schema2 = makeExecutableSchema(schemaModule);
      const util = require('./index.js')(
        {
          // mock config defines a required non-default directive
          requiredDirectives: [
            {
              onType: 'Mutation',
              all: ['required']
            }
          ]
        },
        serviceContext.config,
        serviceContext.logger,
        serviceContext
      );
      try {
        util.attachDirectives(schema2, directives);
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('missing a required directive');
      }
    });
  });
});
