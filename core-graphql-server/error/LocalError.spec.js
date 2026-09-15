// ErrorCodes.js does not exist on disk — virtual mock required (imported by LocalError.js)
jest.mock(
	'./ErrorCodes.js',
	() => ({
		internal_error: { code: 'internal_error', message: 'Internal error' },
		not_allowed: { code: 'not_allowed' },
		not_found: { code: 'not_found' },
		invalid_input: { code: 'invalid_input' },
		authentication_error: { code: 'authentication_error', message: 'Auth error' },
		service_failure: { code: 'service_failure' },
		service_unavailable: { code: 'service_unavailable', message: 'Service unavailable' },
	}),
	{ virtual: true },
);

const { LocalError } = require('./LocalError.js');
const { StatusCodeError } = require('request-promise/errors');

describe('LocalError — constructor shape (TODO_TESTS #1)', () => {
	it('sets name to "Error" and inherits from Error', () => {
		// prototype.constructor is not reset after Object.create(Error.prototype),
		// so this.constructor.name resolves to "Error" — not "LocalError".
		const err = new LocalError({ code: 'test_code', message: 'test message' });

		expect(err.name).toBe('Error');
		expect(err).toBeInstanceOf(Error);
	});

	it('sets errorCode and message from the provided errorType', () => {
		const errorType = { code: 'custom_code', message: 'custom message' };
		const err = new LocalError(errorType);

		expect(err.errorCode).toBe('custom_code');
		expect(err.message).toBe('custom message');
	});

	it('uses the explicit message argument when provided instead of errorType.message', () => {
		const err = new LocalError({ code: 'some_code', message: 'default' }, 'override message');

		expect(err.message).toBe('override message');
	});
});

describe('LocalError — extractFromError HTTP status mapping (TODO_TESTS #3)', () => {
	it('maps status 403 to not_allowed errorCode', () => {
		const original = new StatusCodeError(403, 'Forbidden', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toBe('not_allowed');
	});

	it('maps status 404 to not_found errorCode', () => {
		const original = new StatusCodeError(404, 'Not Found', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toBe('not_found');
	});

	it('maps status 400 to invalid_input errorCode', () => {
		const original = new StatusCodeError(400, 'Bad Request', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toBe('invalid_input');
	});

	it('maps status 401 to authentication_error errorCode', () => {
		const original = new StatusCodeError(401, 'Unauthorized', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toBe('authentication_error');
	});

	it('maps status 500 — errorCode is the service_failure object (not .code)', () => {
		// Production code sets self.errorCode = ErrorCodes.service_failure (the object, not .code)
		const original = new StatusCodeError(500, 'Server Error', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toEqual({ code: 'service_failure' });
	});

	it('maps status 502 to service_unavailable errorCode', () => {
		const original = new StatusCodeError(502, 'Bad Gateway', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toBe('service_unavailable');
	});

	it('maps status 503 to service_unavailable errorCode', () => {
		const original = new StatusCodeError(503, 'Service Unavailable', {}, {});
		const err = new LocalError({ code: 'initial', message: 'initial' }, null, {}, original);

		expect(err.errorCode).toBe('service_unavailable');
	});
});
