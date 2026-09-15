var converter = require("./converter");

describe("converter.convert (rows #1-#3)", () => {
	it("sets folderSummaryObject with maxDepth and hasSubFolder when src has treeFolderId", () => {
		var src = { treeFolderId: "abc-123", maxDepth: 3, hasSubFolder: true };
		var dst = {};

		converter.convert(src, dst);

		expect(dst.folderSummaryObject).toEqual({
			maxDepth: 3,
			hasSubFolder: true,
		});
	});

	it("does not set folderSummaryObject when src.treeFolderId is falsy", () => {
		var dstNull = {};
		converter.convert(
			{ treeFolderId: null, maxDepth: 3, hasSubFolder: false },
			dstNull,
		);
		expect(dstNull.folderSummaryObject).toBeUndefined();

		var dstMissing = {};
		converter.convert({ maxDepth: 3 }, dstMissing);
		expect(dstMissing.folderSummaryObject).toBeUndefined();
	});

	it("does not throw when dst or src is null", () => {
		expect(() => {
			converter.convert(null, null);
		}).not.toThrow();
		expect(() => {
			converter.convert(null, {});
		}).not.toThrow();
		expect(() => {
			converter.convert({ treeFolderId: "x" }, null);
		}).not.toThrow();
	});
});
