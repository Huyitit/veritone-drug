'use strict';

var converter = require('./converter');

describe('converter.convert (row #1)', () => {
	it('sets dst.folderObject with name, description, and treeFolderId from src', () => {
		var src = { treeFolderId: 'rf-1', treeFolderName: 'My Folder', treeFolderDescription: 'desc' };
		var dst = {};

		converter.convert(src, dst);

		expect(dst.folderObject).toEqual({
			name: 'My Folder',
			description: 'desc',
			treeFolderId: 'rf-1',
		});
	});

	it('does not set dst.folderObject when src.treeFolderId is falsy', () => {
		var dstNull = {};
		converter.convert({ treeFolderId: null, treeFolderName: 'x' }, dstNull);
		expect(dstNull.folderObject).toBeUndefined();

		var dstMissing = {};
		converter.convert({ treeFolderName: 'x' }, dstMissing);
		expect(dstMissing.folderObject).toBeUndefined();
	});

	it('does not throw when dst or src is null', () => {
		expect(() => {
			converter.convert(null, null);
		}).not.toThrow();
		expect(() => {
			converter.convert(null, {});
		}).not.toThrow();
		expect(() => {
			converter.convert({ treeFolderId: 'x' }, null);
		}).not.toThrow();
	});
});
