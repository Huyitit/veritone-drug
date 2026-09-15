const createErrors = require('./index.js');

describe('error/index.js — exported error constructors (TODO_TESTS #2)', () => {
	it('returns all expected error constructors when called with empty config', () => {
		const errors = createErrors({});

		expect(errors.NotFound).toBeDefined();
		expect(errors.ServiceFailure).toBeDefined();
		expect(errors.ServiceUnavailable).toBeDefined();
		expect(errors.InternalServerError).toBeDefined();
		expect(errors.NotAllowed).toBeDefined();
		expect(errors.AuthenticationError).toBeDefined();
		expect(errors.InvalidInput).toBeDefined();
		expect(errors.newErrorId).toBeInstanceOf(Function);
	});
});

describe('error/index.js — AuthenticationError loginUri interpolation (TODO_TESTS #4)', () => {
	it('includes loginUri in AuthenticationError message when configured', () => {
		const loginUri = 'https://login.example.com';
		const errors = createErrors({ services: { loginPageUri: loginUri } });

		const instance = new errors.AuthenticationError();

		expect(instance.message).toContain(loginUri);
	});
});
