// Unit tests for loadModules / loadModule behaviors in schema/index.js.
// All mocks must be registered before require('./index.js') is called.
// No babel transform in this project — jest.mock calls run in order, not hoisted.

jest.mock("apollo-server-express", () => ({ gql: (x) => x }));

const makeExecutableSchemaMock = jest.fn(() => ({ _typeMap: {} }));
jest.mock("graphql-tools", () => ({
	makeExecutableSchema: (...args) => makeExecutableSchemaMock(...args),
	forEachField: () => {},
}));

const attachDirectivesMock = jest.fn();
jest.mock("./directives", () => () => ({
	attachDirectives: attachDirectivesMock,
}));
jest.mock("./directives/Auth.js", () => () => ({}));
jest.mock("./directives/NoAuth.js", () => () => ({}));
jest.mock("./directives/Log.js", () => () => ({}));
jest.mock("./directives/NoLog.js", () => () => ({}));
jest.mock("./directives/FeatureFlag.js", () => () => ({}));
jest.mock("./directives/Audit.js", () => () => ({}));
jest.mock("./directives/TokenType.js", () => () => ({}));
jest.mock("./directives/Limit.js", () => () => ({}));
jest.mock("./directives/Deprecated.js", () => () => ({}));
jest.mock("./directives/Length.js", () => () => ({}));
jest.mock("./directives/Scopes.js", () => () => ({}));
const rbacFactoryMock = jest.fn(() => ({
	requireAuthRole: {},
	verifyAuthRoleAccess: {},
	authListFilter: {},
	authInherit: {},
}));
jest.mock("./directives/RBAC.js", () => (...args) => rbacFactoryMock(...args));

jest.mock("./context.js", () => (sc) => sc);

jest.mock("../util.js", () => () => ({
	stripSectionFromString(startToken, endToken, text) {
		const start = text.indexOf(startToken);
		if (start >= 0) {
			const end = text.indexOf(endToken, start);
			if (end >= 0) return text.substring(0, start) + text.substring(end + 1);
		}
		return text;
	},
}));

const wrapResolverMapMock = jest.fn((resolvers) => resolvers);
jest.mock("../resolvers/index.js", () => () => ({
	wrapResolverMap: wrapResolverMapMock,
}));

// Per-test-schema module stubs
const optionalModuleFn = jest.fn(() => ({
	typeDefs: ["type Query { _opt: String }"],
	resolvers: {},
}));

const doNotWrapModuleFn = jest.fn(() => ({
	typeDefs: ["type Query { d: String }"],
	resolvers: { Query: { d: () => "d" } },
}));

const importQueryFalseFn = jest.fn(() => ({
	typeDefs: ["extend type Query { c: String } type Other { id: ID }"],
	resolvers: { Query: { c: () => "c" }, Other: { id: () => "1" } },
}));

const importTypeDefsFalseFn = jest.fn(() => ({
	typeDefs: ["type Query { t: String }"],
	resolvers: { Query: { t: () => "t" } },
}));

const importMutationFalseFn = jest.fn(() => ({
	typeDefs: ["extend type Mutation { m: String } type Other2 { id: ID }"],
	resolvers: { Mutation: { m: () => "m" }, Other2: { id: () => "2" } },
}));

const importResolversFalseFn = jest.fn(() => ({
	typeDefs: ["type Query { r: String }"],
	resolvers: { Query: { r: () => "r" } },
}));

const queryOpResolvers = { q: () => "q" };
const mutationOpResolvers = { m: () => "m" };
const subscriptionOpResolvers = { s: () => "s" };
const fieldOpResolvers = { w: () => "w" };
const opCheckModuleFn = jest.fn(() => ({
	typeDefs: [],
	resolvers: {
		Query: queryOpResolvers,
		Mutation: mutationOpResolvers,
		SubscriptionService: subscriptionOpResolvers,
		Weird: fieldOpResolvers,
	},
}));

const modAFn = jest.fn(() => ({
	typeDefs: [],
	resolvers: { Query: { a: () => "a" } },
}));
const modBFn = jest.fn(() => ({
	typeDefs: [],
	resolvers: { Query: { b: () => "b" } },
}));

// Inject a minimal config so index.js never touches the real modules
jest.mock("./config.js", () => ({
	schemas: {
		schemaOptional: {
			modules: [{ name: "optMod", module: optionalModuleFn, optional: true }],
		},
		schemaDoNotWrap: {
			modules: [
				{ name: "nowrapMod", module: doNotWrapModuleFn, doNotWrap: true },
			],
		},
		schemaNoQuery: {
			modules: [
				{ name: "noQueryMod", module: importQueryFalseFn, importQuery: false },
			],
		},
		schemaNoTypeDefs: {
			modules: [
				{
					name: "noTypeDefsMod",
					module: importTypeDefsFalseFn,
					importTypeDefs: false,
				},
			],
		},
		schemaNoMutation: {
			modules: [
				{
					name: "noMutationMod",
					module: importMutationFalseFn,
					importMutation: false,
				},
			],
		},
		schemaNoResolvers: {
			modules: [
				{
					name: "noResolversMod",
					module: importResolversFalseFn,
					importResolvers: false,
				},
			],
		},
		schemaOpCheck: {
			modules: [{ name: "opCheckMod", module: opCheckModuleFn }],
		},
		schemaMultiModule: {
			modules: [
				{ name: "modA", module: modAFn },
				{ name: "modB", module: modBFn },
			],
		},
		public: {
			modules: [],
		},
	},
	directiveValidation: { scopes: { additionalRights: [] } },
	requiredDirectives: [],
}));

const serviceContext = {
	config: {
		schemas: {
			schemaOptional: { enabledModules: [] },
			schemaDoNotWrap: { enabledModules: [] },
			schemaNoQuery: { enabledModules: [] },
			schemaNoTypeDefs: { enabledModules: [] },
		},
	},
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
	metricsCounters: {},
};

const mod = require("./index.js")(serviceContext);

describe("#schema/index.js unit — loadModules / loadModule", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		makeExecutableSchemaMock.mockReturnValue({ _typeMap: {} });
		serviceContext.config.schemas.schemaOptional.enabledModules = [];
	});

	describe("loadModules — optional module exclusion (TODO_TESTS #3)", () => {
		it("skips an optional module whose name is not in config enabledModules", () => {
			mod.createSchema("schemaOptional");
			expect(optionalModuleFn).not.toHaveBeenCalled();
		});

		it("loads an optional module whose name IS present in config enabledModules", () => {
			serviceContext.config.schemas.schemaOptional.enabledModules = ["optMod"];
			mod.createSchema("schemaOptional");
			expect(optionalModuleFn).toHaveBeenCalledTimes(1);
		});
	});

	describe("loadModule — doNotWrap=true skips resolver wrapping (TODO_TESTS #4)", () => {
		it("does NOT invoke wrapResolverMap for a doNotWrap module", () => {
			mod.createSchema("schemaDoNotWrap");
			expect(wrapResolverMapMock).not.toHaveBeenCalled();
		});

		it("DOES invoke wrapResolverMap for a module without doNotWrap", () => {
			mod.createSchema("schemaNoQuery");
			expect(wrapResolverMapMock).toHaveBeenCalled();
		});
	});

	describe("loadModule — importQuery=false strips Query block (TODO_TESTS #5)", () => {
		it('removes "type Query" and "extend type Query" from typeDefs', () => {
			mod.createSchema("schemaNoQuery");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			const joinedTypeDefs = args.typeDefs.join("\n");
			expect(joinedTypeDefs).not.toMatch(
				/\btype Query\b|\bextend type Query\b/,
			);
		});

		it("removes the Query key from the resolver map", () => {
			mod.createSchema("schemaNoQuery");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			expect(args.resolvers).not.toHaveProperty("Query");
		});
	});

	describe("loadModule — importTypeDefs=false clears typeDefs (TODO_TESTS #6)", () => {
		it("passes an empty typeDefs array to makeExecutableSchema", () => {
			mod.createSchema("schemaNoTypeDefs");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			expect(args.typeDefs).toHaveLength(0);
		});
	});

	describe("createSchema — RBAC directives attached only for the public schema (TODO_TESTS #7)", () => {
		it("does NOT load the RBAC directives for a non-public schema", () => {
			mod.createSchema("schemaNoTypeDefs");
			expect(rbacFactoryMock).not.toHaveBeenCalled();
		});

		it("loads the RBAC directives when schemaName is 'public'", () => {
			mod.createSchema("public");
			expect(rbacFactoryMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("loadModule — importMutation=false strips Mutation block (TODO_TESTS #8)", () => {
		it('removes "type Mutation" and "extend type Mutation" from typeDefs', () => {
			mod.createSchema("schemaNoMutation");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			const joinedTypeDefs = args.typeDefs.join("\n");
			expect(joinedTypeDefs).not.toMatch(
				/\btype Mutation\b|\bextend type Mutation\b/,
			);
		});

		it("removes the Mutation key from the resolver map", () => {
			mod.createSchema("schemaNoMutation");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			expect(args.resolvers).not.toHaveProperty("Mutation");
		});
	});

	describe("loadModule — importResolvers=false clears the resolver map (TODO_TESTS #9)", () => {
		it("returns an empty resolver map even though the module defines resolvers", () => {
			mod.createSchema("schemaNoResolvers");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			expect(args.resolvers).toEqual({});
		});

		it("still keeps the module's typeDefs (only resolvers are cleared)", () => {
			mod.createSchema("schemaNoResolvers");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			expect(args.typeDefs.join("\n")).toContain("type Query { r: String }");
		});
	});

	describe("loadModule — wrapResolverMap invoked with the correct op per typeName (TODO_TESTS #10)", () => {
		it("wraps Query/Mutation/SubscriptionService/other resolver maps with query/mutation/subscription/field respectively", () => {
			mod.createSchema("schemaOpCheck");
			const opForResolverMap = (resolverMap) =>
				wrapResolverMapMock.mock.calls.find((call) => call[0] === resolverMap)?.[1];

			expect(opForResolverMap(queryOpResolvers)).toBe("query");
			expect(opForResolverMap(mutationOpResolvers)).toBe("mutation");
			expect(opForResolverMap(subscriptionOpResolvers)).toBe("subscription");
			expect(opForResolverMap(fieldOpResolvers)).toBe("field");
		});
	});

	describe("loadModules — resolvers from multiple modules are recursively merged via _.merge (TODO_TESTS #11)", () => {
		it("combines both modules' Query resolvers instead of the second module overwriting the first", () => {
			mod.createSchema("schemaMultiModule");
			const args = makeExecutableSchemaMock.mock.calls[0][0];
			expect(Object.keys(args.resolvers.Query).sort()).toEqual(["a", "b"]);
		});
	});
});
