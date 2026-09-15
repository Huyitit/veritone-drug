# Distribution Center — testing the pre-flight media-constraint check (VE-26450)

How to exercise the `distributeAsset` duration check against the local Docker stack, and what that does and does
not prove. See [distribution-center-destinations.md](distribution-center-destinations.md) for the surrounding
destination behaviours.

## The short version

**You do not need the Ayrshare engine.** The check runs entirely inside `core-graphql-server` and throws
*before* `dal.job.createJob`, so a rejection never reaches a Job, a task, a queue or a vendor. The
`distribute-ayrshare` engine lives in a separate repo and is not involved; only the OAuth *adapter*
(`social/vendor/ayrshareAdapter.js`) is in this one, and `distributeAsset` never calls it.

| Path | What runs | Needs the engine? |
|---|---|---|
| **Rejection** | Entirely in-process, before Job creation | No |
| **Allow** | Job created, task queued for an engine that isn't running — sits pending | No |

A pending task is the correct local outcome, not a failure. "A Job row exists" versus "no Job row exists" is
exactly the observable the acceptance criterion asks for.

## 1. Stand up the stack

From the repo root:

```bash
make compose-build      # docker buildx bake — builds all images
make compose-up         # docker compose -f local.yml up
```

Migrations run inside the container, so the `flyway.path` mismatch that bites a native Apple Silicon run does not
apply here.

Published ports (from `ci-common-services.yml`):

| Service | Host |
|---|---|
| graphql | `3000` (plus `9229` for the inspector) |
| postgres | `5432` |
| nginx | `8080` → 80, `443` |

Useful companions:

```bash
make compose-watch-up          # nodemon + file watching; use this while iterating on the check itself
SERVICE=graphql make compose-logs-t
SERVICE=graphql make compose-attach-t
make compose-up-config         # print the resolved manifest if you need to confirm what your variant publishes
make compose-down              # tear down
```

Those wrap plain `docker exec` / `docker logs` against `aiware-core-<service>-1` — so where a Make target does
not fit, address the container directly (`aiware-core-graphql-1`, `aiware-core-postgres-1`) rather than going
back through `docker compose -f local.yml`, which only needs the `-f` to resolve service names.

Confirm this ticket's migrations landed:

```bash
psql "postgres://postgres:postgres@localhost:5432/platform?sslmode=disable" \
  -c "SELECT post_type,
             constraint_schema #>> '{properties,durationMs,minimum}' AS min_ms,
             constraint_schema #>> '{properties,durationMs,maximum}' AS max_ms
      FROM public.destination_media_constraint;"
# expect 4 rows; instagram/reels is 3000 – 900000, youtube/video is both NULL
```

The same limits are served to clients as a JSON Schema, which is what the Distribute modal runs to warn before
a publish is submitted. Confirm the API agrees with the row:

```graphql
query { destinationTypes { records { platform mediaConstraints {
  postType enforcedConstraints constraintSchema recommendedMedia
} } } }
```

Instagram should return `["DURATION"]` and a document whose `properties.durationMs` is `{minimum: 3000,
maximum: 900000}`. YouTube should return `[]` and `{"properties":{}}` — declared, enforcing nothing.

`recommendedMedia` is guidance only (`{"widthPx":1080,…}` for Instagram) and can never reject a publish. It is a
flat map of targets, not a JSON Schema — if it ever comes back shaped like one (`{"widthPx":{"const":1080}}`),
that is a seed defect worth raising, not a new rule to test against.

If ports aren't published in your variant, go through the container instead — the repo's own convention, and
what `make compose-attach-t` / `compose-logs-t` use:

```bash
docker exec -i aiware-core-postgres-1 psql -U postgres -d platform -c "SELECT 1;"
```

Note also `runall/seeds/SEEDS_README.md` — optional seeds for org registration and signup, run after Flyway has
migrated `sso` and `media_platform`. Not required for this check, but it is what makes a usable local org.

### Prerequisite: configure the platform encryption key

**Do this before anything else, or §2 and §3 will fail with an opaque `internal_error`.**

`distributeAsset` reads an encrypted destination field, so without this key the mutation fails before reaching
any of its own logic. It is unset in the checked-in local config.

Add a top-level key to `runall/config/graphql.json` (mounted into the container, so no rebuild):

```json
"decryptKeyDefault": "local-dev-decrypt-key"
```

Any string works. Restart the container to pick it up:

```bash
docker restart aiware-core-graphql-1
```

Confirm it resolves:

```bash
docker exec -i aiware-core-graphql-1 node <<'NODE'
const cfg = require('/config/graphql.json');
const key = process.env.CORE_GRAPHQL_DECRYPT_KEY || (cfg.s3 || {}).fileId || cfg.decryptKeyDefault;
console.log(key ? 'key resolves' : 'NO KEY — §2 and §3 will fail');
NODE
```

- `runall/config/graphql.json` is tracked — keep the edit out of any PR.
- Generate §2's ciphertext *after* the restart, using this same key.

## 2. Fake the two things you'd otherwise need real infrastructure for

### A CONNECTED destination

Normally requires a real Ayrshare OAuth handshake, but the row can be inserted directly.

**`vendor_profile_id` must be valid ciphertext** — it is decrypted on read, so a plaintext placeholder fails the
mutation with `internal_error`. `NOT NULL`, so NULL is not an option either.

#### Generate a valid ciphertext

Run this anywhere with plain node, substituting the key you set in §1:

```bash
node <<'NODE'
const crypto = require('crypto');
const SECRET = 'local-dev-decrypt-key';          // must match decryptKeyDefault from §1
const VALUE  = 'local-dummy-profile-key';        // arbitrary — the mutation never uses the decrypted value

const key = crypto.createHash('sha256').update(SECRET).digest();
const iv  = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
let out = cipher.update(JSON.stringify(VALUE), 'utf8', 'base64');
out += cipher.final('base64');
console.log(`${iv.toString('base64')}::${out}`);
NODE
```

Output looks like `eJxl2f8DTaljza3yzLKBoA==::9eBKNJbDQxqpXJWX9HyEPXsXpvXQeVLhVScHb+DUoxA=`. Run it on the host,
not in the container — the graphql image has no resolvable `node_modules`.

Alternative, using the real helper, from `services/api/core-graphql-server` on the host:

```bash
node -e "console.log(require('@veritone/core-server-base/util.js')().encryptObject('local-dummy-profile-key','local-dev-decrypt-key','aes-256-cbc'))"
```

#### Insert the row

```sql
INSERT INTO public.destination
  (organization_id, destination_type_id, label, vendor_profile_id, status, created_by_user_id)
VALUES
  (<your org id>, 'b0cc0c8e-409b-44d5-9d0f-389144aa53e0', 'local test',
   '<ciphertext from above>', 'CONNECTED', gen_random_uuid());
```

`b0cc0c8e-…` is the Instagram (Ayrshare) destination type, seeded by `V3_295`. `organization_id` must match your
token's org — a mismatch gives `not_found` with `objectType: "Destination"`, since the lookup is org-scoped.
`vendor_profile_id_hmac` can stay null; it only backs the uniqueness index.

The decrypted value is never used by this mutation — it deliberately keeps the profile key out of the task
payload — but it still has to decrypt cleanly on the way through.

### A TDO with a media asset carrying a duration

The check reads `metadata.mediaDuration` — a float in **seconds** — from the TDO's primary media asset.

> **Heads up:** `SetAssetFileData.mediaDurationMs` is scope-gated —
> `@scopes(["task_type:internal", "superadmin"])`. An ordinary user token **cannot** set it through GraphQL. Use
> the SQL step below unless you're holding a superadmin or internal task token.

#### Step 1 — create a TDO

Both timestamps are required. Note the returned `id`.

```graphql
mutation CreateTDO {
  createTDO(input: {
    startDateTime: 1756000000
    stopDateTime: 1756003600
    name: "VE-26450 local test"
  }) {
    id
  }
}
```

#### Step 2 — attach a media asset, marked primary

`setAsPrimary: true` is required — without it the check cannot resolve the asset and will allow the publish.
Note the returned asset `id`.

```graphql
mutation CreateAsset {
  createAsset(input: {
    containerId: "<tdo id from step 1>"
    assetType: "media"
    contentType: "video/mp4"
    uri: "https://example.com/fake.mp4"
    setAsPrimary: true
  }) {
    id
  }
}
```

The URI does not need to resolve — nothing in the pre-flight path fetches it.

#### Step 3 — stamp the duration

Use a superadmin token — this field is scope-gated.

```graphql
mutation UpdateAsset {
  updateAsset(input: {
    id: "<asset id from step 2>"
    fileData: {
      mediaDurationMs: 3197060
    }
  }) {
    id
  }
}
```

`3197060` ms is 3197.06 s — comfortably over Instagram's 900 000 ms limit. Note the API takes **milliseconds**
here while the underlying column stores **seconds**; the DAL divides by 1000 on write, so pass the ms value and
let it convert.

#### Step 4 — verify it took

Run any one of these. Verifying through a different mechanism than you wrote with is the point — the Postgres
option in particular shows both facts at once.

##### Query it — curl

```bash
curl -s http://localhost:3000/graphql \
  -H "Authorization: Bearer <your token>" \
  -H 'Content-Type: application/json' \
  -d '{"query":"query TemporalDataObject { temporalDataObject(id:\"<tdo id from step 1>\") { id primaryAsset(assetType:\"media\") { id fileData { mediaDurationMs } } } }"}' \
  | python3 -m json.tool
```

Expected:

```json
{
  "data": {
    "temporalDataObject": {
      "id": "<tdo id from step 1>",
      "primaryAsset": { "id": "<asset id>", "fileData": { "mediaDurationMs": 3197060 } }
    }
  }
}
```

##### Query it — GraphQL Playground

The service serves a playground at `http://localhost:3000/graphql` in a browser.

Paste into the **HTTP Headers** pane (bottom-left):

```json
{ "Authorization": "Bearer <your token>" }
```

Paste into the query pane:

```graphql
query TemporalDataObject {
  temporalDataObject(id: "<tdo id from step 1>") {
    id
    primaryAsset(assetType: "media") {
      id
      fileData {
        mediaDurationMs
      }
    }
  }
}
```

##### Query it — straight from Postgres

Bypasses auth entirely, and is the quickest way to see both facts at once:

```bash
psql "postgres://postgres:postgres@localhost:5432/media_platform?sslmode=disable" -c "
  SELECT asset_id, type, metadata->>'mediaDuration' AS media_duration_seconds
  FROM recording.recording_asset
  WHERE recording_id = '<tdo id>';"
```

And to confirm the primary-asset pointer was written (this lives on the TDO, in the `platform` database):

```bash
psql "postgres://postgres:postgres@localhost:5432/platform?sslmode=disable" -c "
  SELECT json->'mediaAsset' AS primary_media_asset
  FROM recording.recording WHERE recording_id = '<tdo id>';"
```

##### Reading the result

| Symptom | Cause | Consequence for the test |
|---|---|---|
| `primaryAsset` is `null` | Step 2's `setAsPrimary` did not take | The check falls back to scanning; on a multi-asset TDO it declines to guess and **allows** the publish |
| `mediaDurationMs` is `null` | Step 3 did not take | The check fails open (`duration_unknown`) and **allows** the publish |
| `mediaDurationMs: 3197060` | Correct | Ready for §3 |

A publish that succeeds in any of the first three rows is the fail-open path working as designed, **not** a
broken check. Confirm this step before concluding anything from §3.

##### If §3 returns `internal_error`

That is a masked wrapper — the real error is server-side, keyed by `errors[0].data.errorId`:

```bash
docker logs aiware-core-graphql-1 2>&1 | grep -A 30 "<errorId>"
```

Look for `errorData.internalData.originalStack`. The most likely cause in this setup is
`profileKeyCrypto.decrypt: failed to decrypt Profile-Key`, which means `vendor_profile_id` on the destination
row is not valid ciphertext — see §2.

#### Values worth testing

| `mediaDurationMs` | Expected |
|---|---|
| `3197060` | rejected — `MEDIA_DURATION_MAX` (the VE-26208 asset) |
| `1500` | rejected — `MEDIA_DURATION_MIN` |
| `900000` | allowed — bounds are inclusive |
| `3000` | allowed — inclusive |
| `13145` | allowed — the real VE-26202 asset's duration |
| `0` | allowed — degenerate probe result, treated as unknown |
| *(never set)* | allowed — `duration_unknown` fail-open |

Note the write path guards on a falsy value, so passing `0` through `updateAsset` leaves the field unset rather
than storing a zero — the last two rows collapse to the same state via GraphQL. To exercise a stored `0`
specifically you would have to write `metadata.mediaDuration` directly.

#### The realistic alternative

`eventing` is in the compose stack, so ingesting real media with a resolvable URI lets its ffprobe pass stamp the
duration for you. Slower and less deterministic (the probe skips segments, fails silently, times out at 60s), but
it exercises the real ingest path.

## 3. Run the mutation

`distributeAsset` is scoped `aiware.destination.read`. Instagram's publish schema declares no required fields
(only TikTok requires `options.visibility`), so an empty payload validates:

```graphql
mutation DistributeAsset {
  distributeAsset(input: {
    tdoIds: ["<tdo id from step 1>"]
    destinationId: "<the destination row you inserted>"
    platformPayload: {}
  }) {
    id
    status
  }
}
```

The token must be **org-scoped** — the mutation resolves the organization from the auth context and rejects
without one:

```bash
curl -s http://localhost:3000/graphql \
  -H "Authorization: Bearer <your token>" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation DistributeAsset { distributeAsset(input:{ tdoIds:[\"<tdo id from step 1>\"], destinationId:\"<destination id>\", platformPayload:{} }) { id status } }"}' \
  | python3 -m json.tool
```

On a rejection the interesting part is `errors[0].data`, not the message:

```json
{
  "errors": [{
    "message": "Instagram accepts videos up to 900 seconds; this asset is 3198 seconds.",
    "data": {
      "i18nKey": "DISTRIBUTE.ERROR.MEDIA_DURATION_MAX",
      "i18nParams": { "platform": "instagram", "limitSeconds": 900, "actualSeconds": 3198,
                      "limitMs": 900000, "actualMs": 3197060 },
      "constraint": "duration",
      "destinationId": "…", "tdoId": "…"
    }
  }]
}
```

## 4. What to expect

| Scenario | Expected result |
|---|---|
| Duration > 900 000 ms | `InvalidInput`, `data.i18nKey = DISTRIBUTE.ERROR.MEDIA_DURATION_MAX`, **no Job row** |
| Duration < 3 000 ms | `InvalidInput`, `…MEDIA_DURATION_MIN`, **no Job row** |
| Exactly 3 000 or 900 000 ms | Allowed — bounds are inclusive |
| Duration in range | Job created; task stays pending (no engine locally) |
| No duration stamped | Job created — deliberate fail-open |
| Duration of `0` | Job created — a stored `0` is a degenerate probe result, not a measurement |

The rejection payload carries `i18nKey`, `i18nParams` (`platform`, `limitSeconds`, `actualSeconds`, `limitMs`,
`actualMs`), `constraint`, `destinationId` and `tdoId`. The English `message` is a developer fallback, not
user-facing copy — DMH renders from the key.

### Declared is not the same as enforced

`constraintSchema` carries the vendor's documented `widthPx`, `heightPx` and `aspectRatio` limits alongside
`durationMs`, but **only duration is checked**. A 200x200 asset publishing successfully against Instagram's
declared 320px floor is correct behaviour, not a missed rejection.

The published asset is a downscaled preview rendition, so a dimension check would reject masters that publish
fine; enforcement waits on VE-26886. `enforcedConstraints` is the authority on what is actually verified — it
returns `["DURATION"]` and nothing else. A client gating on a property absent from that list would block
publishes the server allows.

To confirm rather than assume, compare the two fields: every property in `constraintSchema` outside the classes
named by `enforcedConstraints` is inert by design.

### Confirming no Job was created

The local stand-in for "no task appears in Processing Center". Jobs live in the partitioned `job_new.job`:

```sql
SELECT job_id, created_date_time FROM job_new.job
WHERE recording_id = '<tdo id from step 1>'
ORDER BY created_date_time DESC LIMIT 5;
```

Nothing new after a rejection is the pass condition.

### Watching the counters

If a publish you expected to be blocked was allowed, `…_fallthrough{reason}` says why. Reasons:
`duration_unknown`, `ambiguous_media_asset`, `magic_id_scope`, `ambiguous_post_type`, `duration_unreadable`,
`constraints_unreadable`. Also emitted: `…_evaluated` (denominator) and `…_rejection{platform,constraint}`.

`constraints_unreadable` has two causes needing different fixes: the constraint row could not be read (a DB or
timeout problem), or it was read and its `constraint_schema` would not compile (a seed problem — check the
graphql logs for `could not be evaluated` and the offending `constraintId`). A malformed document allows the
publish rather than blocking it, on the same reasoning as unreadable metadata.

## 5. What this does NOT prove

Worth being explicit, because it is the gap that matters:

- **It exercises the check, not the prediction.** It confirms we reject what we said we would. It cannot confirm
  that what we declared matches what Ayrshare and the platforms actually enforce. Only a real publish on stage
  does that, and it remains the outstanding manual verification on this ticket.
- **Instagram and TikTok are the only platforms meaningfully covered.** Facebook and YouTube are seeded at
  permissive limits (4 hours / no limit) pending a post-type decision, so a local test against those will
  correctly allow almost anything.
- **The engine's own behaviour is untested here.** Nothing verifies that the Job we create is one the engine can
  act on — that path is unchanged by this ticket, but it is also unexercised locally.
