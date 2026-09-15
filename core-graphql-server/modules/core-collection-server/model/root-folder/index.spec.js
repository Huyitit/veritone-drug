'use strict';

var indexExport = require('./index');
var RootFolder = require('./root-folder');

describe('index.js re-exports (row #3)', () => {
	it('re-exports RootFolder as the default export', () => {
		expect(indexExport).toBe(RootFolder);
	});
});
