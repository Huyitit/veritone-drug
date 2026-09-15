# TODO_TESTS — v3DataModel/social/bll

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

Test framework: Mocha + Chai, matching `distributeAsset.spec.js` / `destinationOAuth.spec.js` in this directory —
next-to-source `*.spec.js`, service context via `mockUtil`/`serviceContext.mock.js` fixtures.

`destinationConnectPolicy.js` is fully covered by `destinationConnectPolicy.spec.js` — no gap.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | high [security-coverage] | `distributeAsset.js:40-42 — createDistributeAsset` | A context with no organization (nil `orgId`) would fall through to the TDO/destination lookup instead of throwing `NotAllowed`, since no test in `distributeAsset.spec.js` exercises a missing-org context. | distributeAsset.spec.js | (pending — framework will open PR) |
| 2 | implemented | high [security-coverage] | `destinationOAuth.js:32-35 — createDestination` | A context with no organization (nil `orgId`) would fall through to minting an Ayrshare Profile instead of throwing `NotAllowed` before any vendor call, since no test in `destinationOAuth.spec.js` exercises a missing-org context. | destinationOAuth.spec.js | (pending — framework will open PR) |
