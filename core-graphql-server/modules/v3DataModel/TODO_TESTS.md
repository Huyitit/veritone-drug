# TODO_TESTS — v3DataModel module

22 source files. Substantial untested surface. Model + resolver classes for the v3 data model.

## Gaps (high-value subset)

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `Mutation.js / Query.js — resolver entry points` | A regression in the v3 data-model resolvers (e.g. mis-wired BLL call) would silently break v3 API consumers. Verify each documented top-level resolver. | `Mutation.spec.js`, `Query.spec.js` | [#3986](https://github.com/veritone/aiware-core/pull/3986) |
| 2 | implemented | medium | `Job.js / JobTemplate.js / TaskTemplate.js / ScheduledJobContentTemplate.js / ScheduledJobCollaborator.js` | Job-orchestration model family. Verify documented field shape + required-fields. | `Job.spec.js`, `JobTemplate.spec.js`, `TaskTemplate.spec.js`, `ScheduledJobContentTemplate.spec.js`, `ScheduledJobCollaborator.spec.js` | [#3986](https://github.com/veritone/aiware-core/pull/3986) |
| 3 | implemented | medium | `Source.js / SourceContentTemplate.js / SourceType.js / SourceCollaborator.js / TDOSourceData.js` | Source-ingestion model family. | `Source.spec.js`, `SourceContentTemplate.spec.js`, `SourceType.spec.js`, `SourceCollaborator.spec.js`, `TDOSourceData.spec.js` | VE-23840 |
| 4 | implemented | medium | `ClusterCollaborator.js / ExecutionLocation.js / EngineConfiguration.js` | Engine-execution model family. | `ClusterCollaborator.spec.js`, `ExecutionLocation.spec.js`, `EngineConfiguration.spec.js` | VE-23840 |
| 5 | implemented | medium | `ExternalCredential.js — credentials model` | Verify schema; flag if credential fields should be redacted on serialize. | `ExternalCredential.spec.js` | VE-23840 |
| 6 | implemented | low | `ProgramAffiliate.js / Watchlist.js` | Minor data-model classes. | `ProgramAffiliate.spec.js`, `Watchlist.spec.js` | VE-23840, [VE-24823](https://veritone.atlassian.net/browse/VE-24823) |
| 6a | implemented | low | `Watchlist.js` | `dal.scheduledJob` absent from serviceContext mock — resolved in VE-24823 by providing the mock in the spec via `makeDal()`. | `Watchlist.spec.js` | [#4328](https://github.com/veritone/aiware-core/pull/4328) |
| 7 | blocked | low | `index.js — module factory` | Wires all v3DataModel DALs at load time; requires fully-wired service context with dal.sourceType, dal.scheduledJob, dal.watchlist, dal.creative. |  |  |
