const config = require("./config.js");

describe("#schema/config.js — shape regression guard (TODO_TESTS #1)", () => {
	it("exports a public schema with a non-empty modules array", () => {
		expect(Array.isArray(config.schemas.public.modules)).toBe(true);
		expect(config.schemas.public.modules.length).toBeGreaterThan(0);
	});

	it("every public module has a string name and a function module", () => {
		config.schemas.public.modules.forEach((m) => {
			expect(typeof m.name).toBe("string");
			expect(typeof m.module).toBe("function");
		});
	});

	it("exports an internal schema with a non-empty modules array", () => {
		expect(Array.isArray(config.schemas.internal.modules)).toBe(true);
		expect(config.schemas.internal.modules.length).toBeGreaterThan(0);
	});

	it("every internal module has a string name and a function module", () => {
		config.schemas.internal.modules.forEach((m) => {
			expect(typeof m.name).toBe("string");
			expect(typeof m.module).toBe("function");
		});
	});

	it("exports directiveValidation.scopes.additionalRights as a non-empty array", () => {
		const { additionalRights } = config.directiveValidation.scopes;
		expect(Array.isArray(additionalRights)).toBe(true);
		expect(additionalRights.length).toBeGreaterThan(0);
		additionalRights.forEach((right) => {
			expect(typeof right).toBe("string");
		});
	});

	it("exports requiredDirectives as a non-empty array", () => {
		expect(Array.isArray(config.requiredDirectives)).toBe(true);
		expect(config.requiredDirectives.length).toBeGreaterThan(0);
	});

	it("every requiredDirective.default, when present, is a valid Directive AST node", () => {
		config.requiredDirectives.forEach((directive) => {
			if (directive.default) {
				expect(directive.default.kind).toBe("Directive");
				expect(typeof directive.default.name.value).toBe("string");
			}
		});
	});
});
