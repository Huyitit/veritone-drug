var FolderSummary = require("./folder-summary");

describe("FolderSummary model (rows #4-#5)", () => {
	describe("stringToInt converter (row #4)", () => {
		it("coerces a numeric string to an integer for childFolders", () => {
			var instance = new FolderSummary({ childFolders: "7" });

			expect(instance.childFolders).toBe(7);
		});

		it("sets null when value is undefined", () => {
			var instance = new FolderSummary({});

			expect(instance.childFolders).toBeNull();
		});
	});

	describe("dbKey mappings (row #5)", () => {
		it("maps all five DB column names to their camelCase field keys", () => {
			var fieldByKey = {};
			FolderSummary.allFields.forEach((f) => {
				fieldByKey[f.key] = f;
			});

			expect(fieldByKey.treeObjectIds.dbKey).toBe("tree_object_ids");
			expect(fieldByKey.childFolders.dbKey).toBe("child_folders");
			expect(fieldByKey.childNonFolderObjects.dbKey).toBe(
				"child_none_folder_objects",
			);
			expect(fieldByKey.treeObjectId.dbKey).toBe("tree_object_id");
			expect(fieldByKey.mentionCount.dbKey).toBe("mention_count");
		});
	});
});
