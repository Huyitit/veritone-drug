# TODO_TESTS — core-job-server/model

## Coverage map

29 source files, 4 specs. **~25 model files untested.**

Models in this dir are typically thin data-classes from `create-model`-style factories. The high-value targets below are flagged for priority; the rest may be deferred or batched once a pattern is established.

## Gaps (high-value subset)

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `_job.js / _task.js — raw DB shapes` | A regression in the raw-DB row shape would silently break every model that consumes these. Verify the documented field shape + required-fields. File one combined spec covering both. | _job.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 2 | implemented | medium | `build.js / build-create.js / build-upload.js` | A regression in the engine-build models would surface as broken engine-build admin UI. File one combined spec for the build-model family. | build.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 3 | implemented | medium | `cluster.js — Cluster model` | A regression in Cluster schema (cross-cluster scoping field) would silently leak cross-cluster data. | cluster.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 4 | implemented | medium | `engine-category.js / engine-create.js / engine-update.js` | A regression in engine-model schemas would break admin UI's engine management. | engine-category.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 5 | implemented | medium | `job-bundle-create.js / job-bundle-results.js / job-bundle-schedule-definition.js / job-bundle-select-detail.js / job-bundle-status.js / job-bundle.js` | A regression in the job-bundle model family would silently break batch job execution. File one combined spec. | job-bundle.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 6 | implemented | medium | `node-create.js / node-metrics.js / node-pair.js / node-update.js / node.js` | A regression in the cluster-node models would surface as broken node-management UI. | node.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 7 | implemented | medium | `recording.js — Recording model` | A regression in the recording schema (TDO-related fields) would silently break media workflows. | recording.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 8 | implemented | medium | `task.js / task-update.js — Task models` | A regression in task schema would silently break engine-task tracking. | task.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
| 9 | implemented | low | `asset.js / ami-node-create.js` | Lower-frequency models; verify documented schema. | asset.spec.js | [#3938](https://github.com/veritone/aiware-core/pull/3938) |
