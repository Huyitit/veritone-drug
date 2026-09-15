const mockLocalCacheInstance = { get: jest.fn(), set: jest.fn() };
jest.mock("../localCache.js", () => jest.fn(() => mockLocalCacheInstance));

const mockMetricsInstance = { increment: jest.fn() };
jest.mock("../metrics.js", () => jest.fn(() => mockMetricsInstance));

const mockUtilInstance = { stripSectionFromString: jest.fn() };
jest.mock("../util.js", () => jest.fn(() => mockUtilInstance));

const createModule = require("./context.js");

describe("#schema/context.js — serviceContext mutation (TODO_TESTS #2)", () => {
	let sc;

	beforeEach(() => {
		sc = {
			logger: { debug: jest.fn(), info: jest.fn() },
			metricsCounters: {},
			config: {},
		};
	});

	it("attaches localCache to serviceContext", () => {
		createModule(sc);
		expect(sc.localCache).toBe(mockLocalCacheInstance);
	});

	it("attaches metrics to serviceContext", () => {
		createModule(sc);
		expect(sc.metrics).toBe(mockMetricsInstance);
	});

	it("attaches util to serviceContext", () => {
		createModule(sc);
		expect(sc.util).toBe(mockUtilInstance);
	});

	it("returns the same serviceContext object it received", () => {
		const result = createModule(sc);
		expect(result).toBe(sc);
	});
});
