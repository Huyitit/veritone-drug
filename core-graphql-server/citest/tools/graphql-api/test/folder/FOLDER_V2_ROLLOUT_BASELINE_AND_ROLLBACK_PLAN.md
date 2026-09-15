# Folder V2 — PubSec Rollout: Baseline & Rollback Plan

**Ticket**: [VP-1262](https://veritone.atlassian.net/browse/VP-1262) — Folders V2 PubSec Rollout for Nested Folders
**Not this doc**: functional/correctness testing of nested folders — see
[`FOLDER_V2_NESTED_TEST_PLAN.md`](./FOLDER_V2_NESTED_TEST_PLAN.md) for that. This doc covers only the
two gaps the automated Analytics checklist review raised on VP-1262 that no existing plan addresses:
**pre-migration baselines** and **rollback criteria** for the per-org PubSec migration.

## Why this plan exists

VP-1262 migrates each PubSec org (Azure Stage, Gov-1 ✓, Gov-2, US-3, CA) from folders V1 to V2,
one org at a time. Two things are true about that migration that make this doc time-sensitive:

1. **The V1 baseline for an org disappears the moment that org is migrated.** Gov-1 is already
   migrated — its V1 folder-count/latency baseline is very likely already gone. Azure Stage, Gov-2,
   US-3, and CA are the last chance to capture it.
2. **The migration has no defined rollback threshold.** Nothing in VP-1262 says what "this
   migration failed" looks like for an org, or what triggers pausing the rollout to the remaining
   orgs. Without that, an in-flight problem in org N doesn't visibly stop org N+1 from starting.

## What we're covering

- **Pre-migration baseline** — folder count and folder-operation latency (list/query/create) per
  org, captured while that org is still on V1
- **Post-migration comparison** — the same measurements on V2, to confirm the "scale/performance"
  improvement claimed in VP-1262's acceptance criteria is real, not assumed
- **Rollback criteria** — a concrete, checkable definition of "this org's migration failed" and
  what happens next (pause vs. proceed to the next org)
- **Migration-event tracking** — a minimal per-org migration-state record, so "which orgs are
  migrated, when, and with what baseline" isn't only a manually-updated progress note in Jira

## What we're NOT covering

- Nested-folder functional/security correctness — see `FOLDER_V2_NESTED_TEST_PLAN.md`
- General V1↔V2 migration parity — see the signed-off Confluence
  ["Folder v2 test plan"](https://veritone.atlassian.net/wiki/spaces/~7120202827129119ca4dc8af70ab0828421d8c/pages/4408573956/Folder+v2+test+plan)
- Dashboards/stakeholder visibility (Analytics checklist rows 3.4.\*, 3.5.\*) — deferred; out of
  scope for a test-tooling doc
- Legal/DPIA/audit-log requirements (Security & Legal checklist rows on VP-1262) — separate,
  already answered N/A by the Legal review on that ticket

## How we'll measure it

1. Add a small baseline-capture helper (`captureBaseline(org)`) that records, per org: total
   folder count, p50/p95 latency for `folder(id)`, `folderSummaryDetails`, and `createFolder`.
   Reuse the existing k6 load-test harness (`runall/load-citest/src/nestedV2Folders.js`) as the
   load generator; this doc only adds the measurement/recording step around it.
2. Run the capture **before** each remaining org's migration (Azure Stage, Gov-2, US-3, CA), and
   again **after**, so before/after numbers exist for the same org.
3. Record each org's baseline + rollback decision in a simple per-org migration log (see "Test
   cases" below) rather than only the manual Jira progress counter.
4. For Gov-1 (already migrated): capture what post-migration numbers we can now, and note the
   pre-migration baseline as **Unavailable** rather than leaving it blank — that gap is itself a
   finding worth recording.

## Where we'll test it

- Each org's **own environment** (Azure Stage, Gov-2, US-3, CA) — baseline must be captured in the
  same environment being migrated, not a stand-in, since folder counts/latency are
  environment-specific.
- Gov-1's post-migration-only capture can run wherever Gov-1's V2 data now lives.

## Test cases

Flat `NFD-RB-` numbering, separate from the `NFD-` series in `FOLDER_V2_NESTED_TEST_PLAN.md`.

### Pre-migration baseline

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-RB-1 | Capture V1 baseline for Azure Stage before migration | P0 | Not Tested | Azure Stage still on V1 | 1. Run `captureBaseline` against Azure Stage.<br>2. Record folder count and p50/p95 latency for list/query/create. | Baseline numbers recorded and attached to the org's migration log entry, before any V2 cutover work begins |
| NFD-RB-2 | Capture V1 baseline for Gov-2 before migration | P0 | Not Tested | Gov-2 still on V1 | Same as NFD-RB-1, targeting Gov-2 | Baseline recorded |
| NFD-RB-3 | Capture V1 baseline for US-3 before migration | P0 | Not Tested | US-3 still on V1 | Same as NFD-RB-1, targeting US-3 | Baseline recorded |
| NFD-RB-4 | Capture V1 baseline for CA before migration | P0 | Not Tested | CA still on V1 | Same as NFD-RB-1, targeting CA | Baseline recorded |
| NFD-RB-5 | Record Gov-1's baseline as unavailable | P2 | Not Tested | Gov-1 already migrated to V2 | 1. Check for any pre-migration measurement for Gov-1.<br>2. If none exists, record status explicitly. | Gov-1's migration log entry shows baseline = **Unavailable (migrated before this plan existed)**, not blank |

### Post-migration comparison

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-RB-6 | Post-migration measurement matches or improves baseline (per org) | P0 | Not Tested | Org has completed migration and has a recorded pre-migration baseline (NFD-RB-1–4) | 1. Run `captureBaseline` again against the same org, post-migration.<br>2. Compare folder count (should match) and latency (should meet or beat V1 baseline). | Folder count matches; latency meets or improves on V1 baseline. If it regresses, that's a finding to report before migrating the next org |
| NFD-RB-7 | Post-migration measurement for Gov-1 | P2 | Not Tested | Gov-1 already migrated | 1. Run `captureBaseline` against Gov-1 now. | Recorded for reference, with no pre-migration comparison available (see NFD-RB-5) |

### Rollback criteria

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-RB-8 | Rollback threshold is defined and documented before the next migration | P0 | Not Tested | None | 1. Confirm a written definition exists for what counts as a failed migration for an org (e.g. folder-count mismatch, error rate above X%, latency regression beyond Y%, data-integrity check failure).<br>2. Confirm it states what happens next: pause remaining orgs, or proceed. | **Open item — no threshold exists today.** This case fails until product/architecture signs off on one; track it as the actual deliverable of this doc, not just a test to run |
| NFD-RB-9 | Migration-failure runbook step actually pauses the rollout | P1 | Not Tested | NFD-RB-8's threshold is defined | 1. Simulate (in a non-prod org) a migration that trips the defined threshold.<br>2. Confirm the documented next step (pause) is actually followed, not just written down. | Rollout to the next org does not proceed until the tripped condition is resolved or explicitly waived |

## Done when

- NFD-RB-1 through NFD-RB-4 are complete **before** their respective org's migration starts —
  these are the time-boxed items; once an org is migrated, its V1 baseline is gone for good.
- NFD-RB-8 has an actual answer from product/architecture, not just a proposed threshold in this
  doc.
- Every remaining org (Azure Stage, Gov-2, US-3, CA) has a migration log entry with: baseline,
  post-migration numbers, and a pass/fail against the rollback threshold — before VP-1262 is
  closed.

## Details (for whoever implements this)

No baseline-capture helper or migration log currently exists in
`citest/tools/graphql-api/src/` or elsewhere in this repo — this is new tooling, not a wrapper
around something existing. The load-generation half should reuse
`runall/load-citest/src/nestedV2Folders.js` rather than duplicating it.
