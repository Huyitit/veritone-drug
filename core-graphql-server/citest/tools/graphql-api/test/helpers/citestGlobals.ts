/**
 * Typed access to the citest globals that are injected before any spec module
 * loads — by `citest/jest.global.setup.js` under jest (how CI runs these specs)
 * and by `test/setup.ts` under `bun test`.
 *
 * Specs elsewhere in this tool read them as `(global as any).citestMarker`. The
 * ambient declaration below gives the same values a real type, so specs can read
 * them without an `any` cast. Existing `(global as any)` call sites keep working
 * unchanged — this only adds a declaration, it does not change the globals.
 */
declare global {
  /* eslint-disable-next-line no-var */
  var citestMarker: string | undefined;
}

/** Default used by both setup files when the server reports no override. */
export const DEFAULT_CITEST_MARKER = 'citest-should-delete';

/**
 * The prefix that marks a resource as citest-owned and therefore safe for the
 * cleanup sweep to delete. Falls back to the same default the setup files use, so
 * a spec run without either setup (e.g. a bare `bun test` of one file) still
 * produces correctly-marked resource names.
 */
export function getCitestMarker(): string {
  return globalThis.citestMarker ?? DEFAULT_CITEST_MARKER;
}
