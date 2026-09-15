// VE-24940: coverage for the Build type resolver factory (resolvers/Build.js). Exercises the
// pure, obj-only field resolvers via the standard factory pattern (build the factory with the
// shared serviceContext mock, then invoke each field resolver with a plain `obj`). Mutation-checked:
// dropping the `* 1000` on the date resolvers, or a `supportedSourceTypes` fallback branch, fails these.

const serviceContext = require('../test/serviceContext.mock.js')({ throwOnNoResultInQueue: false });
const build = require('./Build.js')(serviceContext);

describe('#Build resolver — pure field resolvers', () => {
	describe('outputFormats', () => {
		it('returns manifest.outputFormats when present', () => {
			expect(build.outputFormats({ manifest: { outputFormats: ['mp4', 'json'] } })).toEqual(['mp4', 'json']);
		});
		it('returns null when manifest.outputFormats is absent', () => {
			expect(build.outputFormats({ manifest: {} })).toBeNull();
		});
	});

	describe('supportedSourceTypes', () => {
		it('prefers manifest.ingestion.supportedSourceTypes when present', () => {
			const obj = { manifest: { ingestion: { supportedSourceTypes: ['stream'] }, supportedSourceTypes: ['file'] } };
			expect(build.supportedSourceTypes(obj)).toEqual(['stream']);
		});
		it('falls back to manifest.supportedSourceTypes when the ingestion path is absent', () => {
			expect(build.supportedSourceTypes({ manifest: { supportedSourceTypes: ['file'] } })).toEqual(['file']);
		});
		it('returns null when neither source-types path is present', () => {
			expect(build.supportedSourceTypes({ manifest: {} })).toBeNull();
		});
	});

	describe('createdDateTime', () => {
		it('converts numeric epoch seconds to milliseconds', () => {
			expect(build.createdDateTime({ createdDateTime: 1500 })).toBe(1500000);
		});
		it('passes a non-numeric value through unchanged', () => {
			expect(build.createdDateTime({ createdDateTime: '2020-01-01T00:00:00Z' })).toBe('2020-01-01T00:00:00Z');
		});
	});

	describe('modifiedDateTime', () => {
		it('converts numeric epoch seconds to milliseconds', () => {
			expect(build.modifiedDateTime({ modifiedDateTime: 42 })).toBe(42000);
		});
		it('passes a non-numeric value through unchanged', () => {
			expect(build.modifiedDateTime({ modifiedDateTime: '2020-01-01T00:00:00Z' })).toBe('2020-01-01T00:00:00Z');
		});
	});

	describe('releaseNotes', () => {
		it('returns obj.releaseNotes', () => {
			expect(build.releaseNotes({ releaseNotes: 'v1 notes' })).toBe('v1 notes');
		});
	});
});
