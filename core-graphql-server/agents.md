# core-graphql-server — Agent Rules

> **Purpose**: Self-contained context for AI agents (GitHub Copilot, Claude, Codex, etc.) working in this service.
>
> **What this is**: [`knowledge/services/core-graphql-server.md`](../../../knowledge/services/core-graphql-server.md) — purpose, dependencies, consumers, and what this
> component explicitly does *not* do. That file **describes**; this file **instructs**. Keep facts
> there and rules here.
>
> **Data**: [`knowledge/data/postgres.md`](../../../knowledge/data/postgres.md) — it owns every Flyway migration in the repo.

---

## 1. Service Overview

`core-graphql-server` is the **primary public-facing GraphQL API** for the Veritone aiWARE platform. All client applications — UI, SDK, and third-party integrations — communicate with the platform through this service. It exposes queries, mutations, and subscriptions over a single GraphQL endpoint backed by Apollo Server on Express.

- **Runtime**: Node.js 20.x (CommonJS, ES2016 target)
- **Framework**: Express + Apollo Server 2.x
- **Language**: JavaScript (not TypeScript)
- **Port**: 8081 (local dev)
- **Entry point**: `server.js`
- **Package manager**: pnpm 9.12.x (workspace member of monorepo root)
- **Build**: `ncc build server.js -o dist`

---

## 2. Architecture

The service follows **Clean Architecture / DDD layering**:

```
Request → Express middleware (auth, logging, rate-limit)
       → Apollo Server (schema validation)
       → Resolvers (transport only — marshalling, delegation)
       → BLL (business logic layer — orchestration, domain rules)
       → DAL (data access layer — parameterized SQL, DB-only ops)
```

### Key rules

| Layer | Allowed | Forbidden |
|-------|---------|-----------|
| **Resolvers** (`resolvers/`) | Delegate to BLL/DAL, marshal response shapes | Business logic, direct DB queries, external HTTP calls |
| **BLL** (`bll/`) | Domain logic, orchestration, call DAL and external services | Direct DB queries, transport concerns |
| **DAL** (`dal/`) | Parameterized SQL via `pg` / `pg-promise`, DB-only | Business logic, HTTP calls, message publishing |

Dependencies **point inward**: resolvers → BLL → DAL. Never the reverse.

---

## 3. Directory Structure

| Path | Purpose |
|------|---------|
| `server.js` | Express app root, Apollo setup, startup |
| `schema/` | GraphQL schema definition (`schema.graphql`), directives, context |
| `resolvers/` | Per-type and per-operation resolvers (`Query.js`, `Mutation.js`, `Subscription.js`, type resolvers) |
| `bll/` | Business logic layer — domain orchestration |
| `dal/` | Data access layer — Postgres queries, mappers |
| `loaders/` | DataLoader instances (batching to prevent N+1) |
| `modules/` | **Legacy feature modules** absorbed from former microservices (each bundles own schema extensions + resolvers + BLL + DAL). Includes: `core-job-server`, `core-media-server`, `core-collection-server`, `workflow`, `structureddata`, `rbacAuth`, `webhooks`, `batchActionsAPI`, `internalAPI`, `v3DataModel`, etc. |
| `routes/` | Express route handlers — `middlewareAuth.js`, admin endpoints, streaming, signed URLs |
| `config/` | Convict-based config (`config.js`), feature flags (`featureFlags.js`), `service.yml` |
| `flyway/` | **Flyway DB migrations** — `migrations/` (SQL), `conf/`, `db/`, `test/`, `utils/` |
| `error/` | Custom error types |
| `util/` | Shared utilities |
| `validator/` | Input validation |
| `sdoAdapter/` | Structured data object adapters |
| `test/` | API-level functional / integration tests |
| `citest/` | CI integration test suite (Jest, run with `--runInBand`) |
| `docker/` | Docker build files — **docker/Dockerfile is the active Dockerfile** (root Dockerfile is deprecated) |
| `keys/` | Key material (local dev) |
| `graphiql/` | GraphiQL playground assets |

---

## 4. Key Files

| File | Why it matters |
|------|---------------|
| `server.js` | App entry point — Express setup, Apollo init, middleware chain |
| `schema/schema.graphql` | The full GraphQL schema definition |
| `schema/context.js` | Builds the per-request Apollo context (auth, loaders, config) |
| `resolvers/Query.js` | Root query resolvers |
| `resolvers/Mutation.js` | Root mutation resolvers |
| `resolvers/Subscription.js` | Subscription resolvers (NSQ-backed) |
| `loaders/index.js` | DataLoader registry — **one per request** |
| `routes/middlewareAuth.js` | Auth middleware (token parsing, context inflation) — delegates to `core-server-base` |
| `config/config.js` | Convict config schema — all env-based settings |
| `config/featureFlags.js` | Feature flag definitions (including RBAC enablement) |
| `redisCache.js` | Redis caching layer (objects, rate-limiting, sessions) |
| `localCache.js` | In-memory LRU cache |
| `oktaAuth.js` | Okta OAuth parallel auth flow |
| `rateLimit.js` | Rate limiting logic |
| `dbMigrator.js` | Flyway migration runner |
| `serviceInit.js` | Service initialization / bootstrapping |

---

## 5. Tech Stack & Dependencies

### Internal workspace libraries

| Package | Purpose |
|---------|---------|
| `@veritone/core-server-base` | Shared Express server base, middleware (including `middlewareAuth.js` which parses/inflates auth context) |
| `@veritone/core-logger` | Structured logging |
| `@veritone/core-messages` | Message type definitions |
| `@veritone/ts-messaging-lib` | NSQ messaging client |
| `@veritone/graphql-nsq-subscriptions` | GraphQL subscriptions backed by NSQ |
| `@veritone/functional-permissions-lib` | RBAC / functional permissions enforcement |
| `@veritone/ts-config-lib` | Shared configuration utilities |

### Key external dependencies

| Package | Purpose |
|---------|---------|
| `apollo-server-express` | GraphQL server |
| `graphql` (v15) | GraphQL execution |
| `dataloader` | N+1 prevention via batching |
| `pg` / `pg-promise` | PostgreSQL client |
| `redis` (v3) / `redlock` | Redis caching, distributed locks |
| `express` | HTTP framework |
| `axios` / `request` / `request-promise` | HTTP clients for inter-service calls |
| `jsonwebtoken` | JWT validation |
| `aws-sdk` / `@aws-sdk/*` | S3 / MinIO integration |
| `prom-client` | Prometheus metrics |
| `@sentry/node` | Error tracking |

---

## 6. Database

- **Engine**: PostgreSQL
- **Ownership**: This service **owns its database schema and migrations** via Flyway (`flyway/migrations/`)
- **Shared namespace**: Provisions and shares the SSO namespace with `core-admin-server`
- **Migration format**: `V{version}__{description}.sql` (Flyway convention)
- **Migration runner**: `dbMigrator.js`

### Database rules (strict)

- **Parameterized queries only** — no string concatenation in SQL
- **No `SELECT *`** in production code
- **No external calls inside transactions**
- Transactions required for multi-step operations
- Respect connection pool sizes
- Index columns used in `WHERE` / `JOIN` clauses
- Prevent N+1 via DataLoader batching in `loaders/`
- All DB objects must have `COMMENT ON` documentation
- Use `CREATE INDEX CONCURRENTLY` (in separate migration file from `ALTER TABLE`)
- No foreign keys (project-wide performance policy)

### ⚠️ Flyway migration — critical rule

> **Never make backwards-incompatible changes in `flyway/migrations/`.** Migrations are append-only and must be backward-compatible. Once a migration is merged, it must not be modified. New changes require a new migration file with the next version number.

---

## 7. Inter-Service Communication

| Target | Protocol | Purpose |
|--------|----------|---------|
| `core-admin-server` | HTTP/REST | Authentication validation, admin APIs, org management |
| `core-search-server` | HTTP/REST | Search queries and indexing |
| NSQ (publish) | NSQ via `ts-messaging-lib` | Event publishing (job updates, notifications, etc.) |
| NSQ (subscribe) | NSQ via `graphql-nsq-subscriptions` | GraphQL subscription delivery |

### Messaging rules

- Use `@veritone/ts-messaging-lib` for publishing
- Use `@veritone/graphql-nsq-subscriptions` for subscription resolvers
- Message types defined in `@veritone/core-messages`

---

## 8. Authentication & Authorization

### Authentication (AuthN)

Two parallel flows:

1. **Username + password → Bearer token**: Primary flow. Token parsed and context inflated by `core-server-base`'s `middlewareAuth.js`
2. **Okta OAuth**: Parallel OAuth flow via `oktaAuth.js`

The middleware injects `UserInfo` and auth context into the Express request, which is passed into Apollo's per-request context.

### Authorization (AuthZ)

- **RBAC** via `@veritone/functional-permissions-lib` and `modules/rbacAuth/`
- RBAC enforcement is applied to **selected** GraphQL queries and mutations
- RBAC requires a **feature flag enablement per organization** — not all orgs have RBAC active
- Auth directives should be enforced on resolvers
- Always check permissions **before** data access

---

## 9. Redis Usage

Redis is used for **multiple purposes** in this service:

| Use case | Details |
|----------|---------|
| **Object caching** | Frequently queried entities — engines, sources, etc. |
| **Session caching** | Auth session data |
| **Rate limiting** | Request throttling via `rateLimit.js` |
| **Distributed locks** | Via `redlock` — set expiration, release in `finally` |
| **Query result caching** | Avoid repeated expensive queries |

### Redis rules

- TTL required on all keys (or document explicit rationale)
- Namespaced keys: `entity:id:field`
- Consistent serialization
- Handle reconnect jitter (MOVED/ASK)
- Set lock expiration, always release in `finally`
- Invalidate/version caches on writes
- Stampede protection on cache invalidation
- No sensitive data in Redis unless encrypted

---

## 10. GraphQL Rules

- **Auth directives enforced** on all resolvers
- **No business logic in resolvers** — delegate to BLL, then DAL
- **DataLoader per request** — instantiated in `loaders/index.js`, must preserve key order
- **Paginate** collection results; cap query depth and complexity (`resolvers/costLimit.js`)
- Input validation before processing
- Non-null where appropriate in schema
- Redact sensitive info in error responses
- Keep `schema.graphql` and documentation in sync
- Structured GraphQL errors with actionable codes — no internal stack traces leaked to clients

---

## 11. Modules (Legacy Feature Domains)

The `modules/` directory contains **feature modules absorbed from formerly separate microservices**. Each module may bundle its own schema extensions, resolvers, BLL, and DAL:

| Module | Domain |
|--------|--------|
| `core` | Core platform entities |
| `core-job-server` | Job management |
| `core-media-server` | Media / TDO management |
| `core-collection-server` | Collections |
| `workflow` | Workflow / flow execution |
| `structureddata` | Structured data objects |
| `rbacAuth` | RBAC authorization module |
| `webhooks` | Webhook delivery |
| `batchActionsAPI` | Batch operations |
| `internalAPI` | Internal-only endpoints |
| `v3DataModel` | V3 data model entities |
| `instanceAuditLog` | Audit logging |
| `customScalars` | Custom GraphQL scalar types |
| `shortcuts` | Convenience query shortcuts |
| `root` | Root schema stitching |

When modifying a module, follow the same layering rules (resolvers → BLL → DAL).

---

## 12. Testing

| Type | Location | Runner | Command |
|------|----------|--------|---------|
| **Unit tests** | `*.spec.js` co-located with source | Jest | `pnpm test` |
| **Integration tests** | `citest/` | Jest (`--runInBand`) | `pnpm citest` |
| **Flyway tests** | `flyway/test/` | Shell | `pnpm test_flyway` |

### Testing rules

- Tests cover business logic and critical paths
- Include error paths, DB interactions, DataLoader batching
- Coverage thresholds (aspirational, not blocking CI): statements 74%, branches 65%, lines 74%, functions 73%
- No Biome/lint errors in production code
- Test files use `.spec.js` suffix, co-located with source
- `jest.setup.js` configures the test environment
- createMockServiceContext and jest.resetModules should not be called per individual test (i.e. multiple times per test suite)

---

## 13. Linting & Formatting

- **Biome** (2.0.5): Primary monorepo linter (local `biome.json` extends root)
- **ESLint**: Per-service config via `eslint.config.mjs` extending `@veritone/eslint-config`
- **Prettier**: Single quotes, no trailing commas, 80-char lines, arrow-parens avoid
- Run `pnpm lint` for ESLint, `pnpm lintfast` from repo root for Biome

---

## 14. Configuration

- All config is **environment-based** via `config/config.js` (Convict)
- Feature flags in `config/featureFlags.js`
- No hardcoded secrets, keys, or tokens
- Local dev config: `server.json`, `local_ci_server.json`
- Docker config: `docker/`, `docker-compose.yaml`

---

## 15. Security & Compliance

- **AuthN/AuthZ** required on all endpoints, resolvers, jobs, and message handlers
- Check permissions **before** data access
- No hardcoded secrets/keys/tokens anywhere
- No PII/PHI in logs, errors, comments, or repo
- Mask/redact secrets and PII in logs, traces, and metrics
- SQL injection prevention: parameterized queries only
- Rate limiting on external-facing endpoints (`rateLimit.js`)
- Dependencies should be checked for CVEs and licensing issues
- Respect GDPR/CCPA/HIPAA: consent, retention, deletion paths

---

## 16. Defensive Coding & Resilience

- Timeouts on all external calls (admin server, search server, S3)
- Retries with backoff where safe; ensure idempotency for retried operations
- Graceful degradation if DB, Redis, or external services are unavailable
- Handle null/undefined, empty collections, and race conditions
- Resource cleanup: return DB connections, release Redis locks in `finally`, clear listeners/timers
- Graceful shutdown and back-pressure for workers

---

## 17. Common Pitfalls & Gotchas

1. **Flyway migrations are append-only** — never modify a merged migration. Always create a new `V{next}__{desc}.sql` file.
2. **No business logic in resolvers** — if you find yourself writing conditionals or data transformation in a resolver, move it to `bll/`.
3. **DataLoader must be per-request** — instantiate via `loaders/index.js` in the Apollo context. Never share a DataLoader across requests.
4. **Modules are legacy absorptions** — the `modules/` directory contains formerly separate microservices. Understand the module boundaries before cross-cutting changes.
5. **RBAC is feature-flagged per org** — not all organizations have RBAC active. Code must handle both RBAC-enabled and RBAC-disabled paths.
6. **SSO namespace shared with core-admin-server** — changes to SSO-related tables or logic may require coordination with the admin service.
7. **`SELECT *` is forbidden** in production code — always specify columns explicitly.
8. **No external calls inside database transactions** — keep transactions tight and fast.
9. **Redis keys must be namespaced** — use the pattern `entity:id:field`.
10. **No PII in logs or errors** — audit any new logging for sensitive data exposure.
11. **The root `Dockerfile` is deprecated** — always use `docker/Dockerfile` for builds.

---

## 18. Review Priority

When reviewing changes to this service, apply this priority order:

1. **Security** — auth, injection, secrets, PII
2. **Architecture** — layer violations, dependency direction
3. **Data integrity** — migrations backward-compatibility, transaction safety
4. **Performance** — N+1 queries, missing DataLoader usage, pool exhaustion
5. **Error handling** — structured errors, no internal leaks
6. **Code quality** — naming, testing, linting
