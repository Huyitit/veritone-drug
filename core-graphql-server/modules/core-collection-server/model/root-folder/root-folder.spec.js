'use strict';

var RootFolder = require('./root-folder');

describe('RootFolder model schema (row #2)', () => {
	it('maps DB column names to their camelCase field keys via dbKey', () => {
		var fieldByKey = {};
		RootFolder.allFields.forEach((f) => {
			fieldByKey[f.key] = f;
		});

		expect(fieldByKey.rootFolderId.dbKey).toBe('root_folder_id');
		expect(fieldByKey.organizationId.dbKey).toBe('organization_id');
		expect(fieldByKey.rootFolderTypeId.dbKey).toBe('root_folder_type_id');
		expect(fieldByKey.userId.dbKey).toBe('user_id');
		expect(fieldByKey.maxDepth.dbKey).toBe('max_depth');
		expect(fieldByKey.hasSubFolder.dbKey).toBe('has_sub_folder');
	});

	it('declares treeObjectId as a string field without a dbKey override', () => {
		var fieldByKey = {};
		RootFolder.allFields.forEach((f) => {
			fieldByKey[f.key] = f;
		});

		expect(fieldByKey.treeObjectId.type).toBe('string');
		expect(fieldByKey.treeObjectId.dbKey).toBeUndefined();
	});
});
