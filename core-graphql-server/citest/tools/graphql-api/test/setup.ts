import { fetchServerFeatureFlags } from './helpers/featureFlags';

// Bun-only counterpart of the legacy harness's citest/jest.global.setup.js.
//
// Under jest (how CI runs these specs, via citest/jest.config.js + ts-jest)
// the feature-flag globals are populated by jest.global.setup.js before any
// spec loads. Under `bun test` nothing did that, so every spec gating tests
// on `(global as any).enableAppEventFeature` etc. read `undefined` and
// silently skipped those tests regardless of the server's real flags.
//
// This file is wired as a test preload in bunfig.toml, so it runs before the
// spec modules are imported — the top-level await below completes before test
// collection, exactly like jest's globalSetup. Keep the keys in sync with
// jest.global.setup.js.
const flags = await fetchServerFeatureFlags();

Object.assign(globalThis, {
  enablePackageGrantLogic: flags.enablePackageGrantLogic ?? false,
  enableAppEventFeature: flags.enableAppEventFeature ?? false,
  v2FoldersAvailable: flags.v2FoldersAvailable ?? false,
  enableRBACFeature: flags.enableRBACFeature ?? false,
  enableBatchActionsAPI: flags.enableBatchActionsAPI ?? false,
  citestMarker: 'citest-should-delete',
  signedWritableUrlOverride: flags.signedWritableUrlOverride ?? false,
  orgMarker: { package: 'citest-should-delete-package-org' },
  enableDefaultDesktopApp: flags.enableDefaultDesktopApp ?? true,
  virtualAssetEnabled: flags.virtualAssetEnabled ?? false,
  enableStrictRoleValidation: flags.enableStrictRoleValidation ?? false
});
