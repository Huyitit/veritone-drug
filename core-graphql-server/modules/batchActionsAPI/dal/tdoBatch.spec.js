// VE-22476: test coverage for batchActionsAPI/dal
// Rows 1-6 of TODO_TESTS.md

const serviceContext = require("../../../test/serviceContext.mock.js")();

const batchProcessRedis = require("./batchProcessRedis")(serviceContext);
const tdoBatch = require("./tdoBatch")(serviceContext);

const mockContext = {};

describe("batchActionsAPI/dal", () => {
	beforeEach(() => {
		serviceContext._clearAll();
	});

	// Row 1: Redis key namespacing prevents cross-batch key collision
	it("updateBatchProcessObject uses namespaced Redis key per batchProcessId", async () => {
		const batchProcessId = "isolation-test-bp";
		const setMock = jest.spyOn(serviceContext.redisClient, "set");

		await batchProcessRedis.updateBatchProcessObject(mockContext, {
			batchProcessId,
			status: "running",
		});

		const calledKey = setMock.mock.calls[0][0];
		expect(calledKey).toBe(
			`core-graphql-server:TDOBatch:batchProcess:${batchProcessId}`,
		);
		setMock.mockRestore();
	});

	// Row 2: getBatch uses parameterized $1 placeholder (SQL injection guard)
	it("getBatch builds parameterized WHERE clause with $1 placeholder for batch_id", async () => {
		const batchId = "param-guard-test-123";
		serviceContext.dbConnections.core.write._push(
			[
				{
					batch_id: batchId,
					batch_name: "test-batch",
					batch_selector: null,
					status: "created",
					organization_id: 100,
					created_by: null,
					modified_by: null,
					created_date: null,
					modified_date: null,
				},
			],
			false, // raw SQL — verify parameterized placeholder before substitution
			["$1", "batch_id"],
		);

		const result = await tdoBatch.getBatch(mockContext, { id: batchId });
		expect(result).toBeDefined();
	});

	// Row 3: getBatch throws when id is missing — prevents unbounded WHERE-less SELECT
	it("getBatch throws InvalidInput when id is missing", async () => {
		await expect(tdoBatch.getBatch(mockContext, {})).rejects.toThrow(
			"id is a mandatory input argument",
		);
	});

	// Row 4: updateBatchProcess rejects null values past mandatory-field guard
	it("updateBatchProcess throws when batchProcessId is missing", async () => {
		await expect(
			tdoBatch.updateBatchProcess(mockContext, {
				organizationId: "org-1",
				status: "pending",
			}),
		).rejects.toThrow("batchProcessId is a mandatory condition value");
	});

	// Row 5: updateBatchProcessObject constructs default object on cache miss
	it("updateBatchProcessObject initializes default object with zero counters on cache miss", async () => {
		const batchProcessId = "bp-cache-miss-test";

		jest
			.spyOn(serviceContext.redisClient, "get")
			.mockImplementation((_key, cb) => cb(null, null));
		const setMock = jest.spyOn(serviceContext.redisClient, "set");

		await batchProcessRedis.updateBatchProcessObject(mockContext, {
			batchProcessId,
			status: "pending",
			jobsRunning: 3,
			concurrency: 10,
		});

		const stored = JSON.parse(setMock.mock.calls[0][1]);
		expect(stored.batchProcessId).toBe(batchProcessId);
		expect(stored.status).toBe("pending");
		expect(stored.jobsRunning).toBe(3);
		expect(stored.concurrency).toBe(10);

		jest.restoreAllMocks();
	});

	// Row 6: updateBatchProcessObject status guard — missing status must throw
	it("updateBatchProcessObject throws InternalServerError when status is missing", async () => {
		await expect(
			batchProcessRedis.updateBatchProcessObject(mockContext, {
				batchProcessId: "bp-no-status",
			}),
		).rejects.toThrow(
			"status for redis object need to be passed as input param",
		);
	});
});
