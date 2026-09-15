# Deprecated V2 Engine Usage Audit and Migration Path (CITEST)

> Draft v2 — rescoped to match ticket [VE-21625](https://veritone.atlassian.net/browse/VE-21625) AC (test-only).
> Removed: non-test/SQL/config audit (old §4.2) and the production Track B remediation plan (old §5.1-B).
> Updated: §4.1/§7 to reflect that the code cleanup (VE-27025) is already merged, not a pending recommendation.

| **Team** | Data |
| --- | --- |
| **Document owner** | @Thai Hoang |
| **Reviewers** | @Stefan Minkov @Frank Ayars @Tyler Fedoris |
| **Ticket Link** | https://veritone.atlassian.net/browse/VE-21625 |
| **Status** | Draft for review |

## 1. Overview and Purpose

This document summarizes the investigation for ticket VE-21625.

The ticket's scope is to audit **citest and unit/spec test usage** of the 8 deprecated V2 engines and 3 associated engine build records seeded by `R__55__citest_job_new.engine.sql`, determine what each test is actually validating, and map out a test-side cleanup/migration path (replace with a random UUID, migrate to a V3/mockingjay engine, or delete the test).

This version intentionally **does not** propose or design a production code/config change. One of the 8 engines is also referenced outside of tests (see §4.2 note) — that is flagged so it isn't accidentally swept up in test cleanup, but the remediation for it is out of scope here and belongs to a separate, already-referenced follow-up (see §7, Track B tickets #3–6).

## 2. Scope of Investigation

The audit covers:

* The seed SQL file that creates the deprecated engine and engine build records.
* citest usage across the entire aiware-core repo (not limited to core-graphql-server).
  * Direct usage in CI test files.
  * Unit tests and spec files that reference deprecated engine IDs or build IDs.
  * Shared test helpers, fixtures, and mock data that indirectly depend on these records.
* Recommended cleanup/migration action for each finding.

Out of scope: production code, config, and SQL-migration usage of these IDs — noted only where it affects the safety of a test-side change (§4.2).

## 3. Deprecated Engine and Build Records

Seed file: `R__55__citest_job_new.engine.sql`. Note: the seed file actually creates **3** build records, not 2 as stated in the ticket description.

| Engine / Build | ID | Purpose |
| --- | --- | --- |
| Veritone - Object Tracker - V2F | `3f03e804-cab6-413f-805c-ec36b6e33f5b` | Video bounding box tracking |
| SFTP Adapter | `8e0f4cc4-9ff4-4814-8cae-91f0a81879d1` | Content ingestion from SFTP |
| Machine Box - Facebox Recognize - V2F | `dcef5300-5cc1-4fe3-bd8f-5c4d3a09b281` | Face detection/recognition |
| Speechmatics Transcription - English (US) | `transcribe-speechmatics-container-en-us` | Speech-to-text |
| Build record (`transcribe-speechmatics-container-en-us`) | `772f0867-5606-4111-8b84-5caa832d703a` | |
| Google - Translate - V2F | `c20ddcce-d52a-433f-81a9-32e56f34e062` | Translation |
| Benchmark Engines RT | `6181fd6e-c6e1-44e8-afd3-75b1a8babd08` | Benchmark multiple transcription engines |
| Build record (`Benchmark Engines RT`) | `e17bad9f-510a-4b7e-854b-cb86e1461a6a` | |
| Microsoft Cognitive Services - Translator Text | `translate-microsoft` | Microsoft translation |
| Build record (`translate-microsoft`) | `40bfd5c9-9e70-4f1d-b28a-ceb1cb1d2ebb` | |
| Speechmatics Transcription - English (US) v3 | `transcribe-speechmatics-container-v3-en-us` | Newer Speechmatics version |

## 4. Analysis and Findings

> **Status update:** the test-side cleanup described below (§4.1) was implemented and merged in
> [VE-27025](https://veritone.atlassian.net/browse/VE-27025) (commit `2a55105f82`, PR #4619,
> now **Release Ready**). This section is kept as the audit record of *what was found and changed*,
> not a pending recommendation — current `master` no longer contains most of these literal
> references. Where a reference still remains, it's called out explicitly below.

#### SUMMARY

| # | Engine / Build | Usage Type (at time of audit) | Current state | Priority |
| --- | --- | --- | --- | --- |
| 1 | Veritone - Object Tracker - V2F | Mock data in unit/spec tests | Replaced with random UUID in `dalAlwaysUpFlow.spec.js`, `dalFlowRevision.spec.js`, `job.spec.js` (VE-27025). Still present as a literal ID in `modules/internalAPI/dal/scheduledEvent.spec.js:168` — not touched by that PR. | Low |
| 2 | SFTP Adapter | Mock data in unit/spec tests | Removed from `job.spec.js` (VE-27025). No remaining literal references found. | Low |
| 3 | Machine Box - Facebox Recognize - V2F | Referenced in `citest/broken/engines.js`, `citest/rewrite/engineResult.js`, `citest/data/engine_result2.json` | All three removed/deleted in VE-27025. | Low |
| 4 | Speechmatics Transcription - English (US) | Referenced in `citest/obsolete/disney.js`, `citest/rewrite/engineResult.js` | Test-side references removed in VE-27025 (`disney.js` deleted). **Also referenced outside tests — see §4.2 note; not removed there, and shouldn't be as part of this ticket.** | Low (test) |
| 5 | Speechmatics — build | No hardcoded references found | Confirmed unused repo-wide (only the seed SQL). | Low |
| 6 | Google - Translate - V2F | Referenced in `citest/rewrite/engineResult.js` | Removed in VE-27025. | Low |
| 7 | Benchmark Engines RT | Referenced in `citest/obsolete/basicEngineReplacement.js`/`.spec.js`, `citest/data/engineAsset1.json` | Files deleted entirely in VE-27025. No remaining references. | Low |
| 8 | Benchmark Engines RT — build | No hardcoded references found | Confirmed unused repo-wide. | Low |
| 9 | Microsoft Cognitive Services - Translator Text | Referenced in `citest/broken/engines.js` | Removed in VE-27025. | Low |
| 10 | Microsoft Translator — build | No hardcoded references found | Confirmed unused repo-wide. | Low |
| 11 | Speechmatics v3 | Referenced in `citest/broken/engines.js`, `citest/obsolete/disney.js` | Removed in VE-27025 (`disney.js` deleted). | Low |

All test files referenced above (`citest/broken/`, `citest/obsolete/`, `citest/rewrite/`, `citest/sideEffect/`) are excluded from CI via `citest/jest.config.js`'s `testPathIgnorePatterns`, so none of this ever ran in the CI pipeline — confirmed cleanup here is risk-free from a CI standpoint.

### 4.1 Remaining Follow-up (Test-Side)

* **`scheduledEvent.spec.js`** still hardcodes the Object Tracker ID (`3f03e804-...`) — not touched by VE-27025. Low risk (mock data only, same pattern as the other 3 files that were already migrated to a random UUID), but should be swept up for consistency.
* **Data/fixture cleanup (not yet done):** a new Flyway migration to drop the now-fully-unused engine/build rows from `job_new.engine` — Facebox, Google Translate, Speechmatics build, Benchmark Engines RT + build, Microsoft Translator + build, Speechmatics v3, and (once DB-confirmed unused) Object Tracker / SFTP Adapter. Still open — no such migration exists on `master` as of this audit. See §7, ticket #2.
* Unit tests only ever used these legacy IDs as opaque mock data (never validated against a real engine record) — safe to replace with a random UUID wherever still present.
* No test in scope needs to move to a V3/mockingjay engine — none of the still-relevant test cases exercise engine-specific behavior; they only need *an* ID to satisfy a foreign key / mock shape.

### 4.2 Note: One Engine Is Also Referenced Outside Tests (Out of Scope Here)

`transcribe-speechmatics-container-en-us` (Speechmatics Transcription - English (US)) is also used in production code/config — `modules/v3DataModel/dal/scheduledJob.js`'s `legacyToRTEngineMap`, `config/service.yml`, and `test/testServer.json`. If that map lookup misses (e.g., if the ID were deleted from config with no replacement), the code doesn't error — it silently leaves the legacy engine ID unchanged on the task and moves on.

**This is why:** the future data-cleanup migration (§7, ticket #2) must exclude this one ID until it's resolved separately, and this ticket does not propose changing `scheduledJob.js`, `config/service.yml`, or `test/testServer.json`. That is tracked in the Track B tickets in §7 (already filed as a separate concern) — not part of this test-audit's deliverable.

## 5. Proposed Cleanup Steps (Test-Only)

* **Step 1 — Sweep remaining literal reference:** replace the Object Tracker ID in `scheduledEvent.spec.js` with a random UUID, matching what VE-27025 already did in the sibling spec files.
* **Step 2 — Data cleanup:** one new Flyway migration removing the 9 confirmed-unused engine/build rows (all except Speechmatics engine + its build, which stay until the production side is resolved). DB-check `engine`, `job`, `task`, `job_template`, `scheduled_job`, `program`, `task_replacement_engine` first to confirm no live data depends on them.
* **Step 3 — Verify:** run full CI + citest suite to confirm nothing regresses.

## 6. Conclusion

* All 8 engines' **test-side** usage has already been located, evaluated, and (for 7 of 8) cleaned up via VE-27025. Remaining test-side work is a single-file sweep (§4.1) plus the not-yet-filed data migration (§7 #2).
* No test in scope required migration to a V3/mockingjay engine — these were mock-only dependencies, not functional coverage of engine-specific behavior.
* One engine (Speechmatics) has a production dependency outside this ticket's scope — flagged in §4.2 so the eventual data migration doesn't touch it, with the actual remediation tracked separately (§7, Track B).

## 7. Follow-up Tickets

**A. Test-only cleanup**

| # | Title | Status |
| --- | --- | --- |
| 1 | Remove deprecated V2 engine references from citest/unit tests | [VE-27025](https://veritone.atlassian.net/browse/VE-27025) — **Release Ready** |
| 2 | New Flyway migration removing confirmed-unused engine/build rows (Facebox, Google Translate, Speechmatics build, Benchmark Engines RT + build, Microsoft Translator + build, Object Tracker, SFTP Adapter, Speechmatics v3) | Not yet filed |
| 3 | Sweep remaining Object Tracker ID in `scheduledEvent.spec.js` | Not yet filed |

**B. Speechmatics production dependency — tracked separately, not part of this ticket**

Referenced here only so the data migration (A2) doesn't remove the wrong row. See prior tickets/discussion for the production audit → backfill → monitor → remove plan; not reproduced in this test-audit doc.

## 8. Open Questions for Reviewers

1. For ticket #2 (data migration): should Object Tracker / SFTP Adapter rows be dropped in the same migration as the other 7, or held back pending their own DB-usage check (§5, Step 2)?
2. Is the single remaining `scheduledEvent.spec.js` reference (§4.1) worth its own ticket, or small enough to bundle into ticket #2's PR?
