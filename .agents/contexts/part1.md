# Architecture & Domain Report: `mutations_part1.html`

## Executive Context
Despite the file being named `mutations.html`, **Part 1** (`mutations_part1.html`, lines 1–1682) contains **63 root query & resource access operations** from the **Veritone aiWARE GraphQL API**. 

These operations define the read-side querying, resource fetching, and signed-upload mechanisms for an enterprise AI operating system spanning media ingestion, cognitive engine execution, custom library training, and multi-tenant access control.

---

## 1. Main Topics Breakdown

We can group all 63 operations into **9 core architectural domains**:

```
                               ┌────────────────────────────────┐
                               │   Multi-Tenant IAM & Auth      │
                               │  (Org, User, Token, RBAC, SSO) │
                               └───────────────┬────────────────┘
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               ▼                               ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
  │   Media & Asset Core    │     │   Cognitive AI Engine   │     │  Knowledge & Libraries  │
  │   - TDO / Asset / S3    │◄───►│   - Engines, Builds     │◄───►│  - Libraries, Models    │
  │   - Folders, Watchlists │     │   - Jobs & Tasks        │     │  - Entities, Biometrics │
  └────────────┬────────────┘     └─────────────────────────┘     └─────────────────────────┘
               │
               ├───────────────────────────────┬───────────────────────────────┐
               ▼                               ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
  │  Search & Mentions      │     │  Structured Data        │     │  Apps & Diagnostics     │
  │  - searchMedia          │     │  - Schemas, Properties  │     │  - Custom Apps, Widgets │
  │  - searchMentions       │     │  - Ingestion Payloads   │     │  - Platform Info, Audit │
  └─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

### Domain 1: Temporal Data Objects (TDO) & Media Assets (Core Ingestion)
* **Operations:** `temporalDataObjects`, `temporalDataObject`, `asset`, `assets`, `getSignedWritableUrl`, `getSignedWritableAssetUrl`
* **Architectural Role:** TDOs represent the core time-correlated media objects (video, audio, streams). Assets are binary or text payloads (transcripts, thumbnails, raw media) stored in S3. Signed URLs allow direct, authenticated chunked PUT uploads to S3 bypassing the GraphQL server.

### Domain 2: Cognitive Engines & Distributed Compute (aiWARE Pipeline)
* **Operations:** `engineOverview`, `engines`, `engine`, `engineBuild`, `engineCategories`, `engineCategory`, `recentBuilds`, `cloneRequests`, `jobs`, `job`, `task`
* **Architectural Role:** Manages AI containerized cognitive engines (transcription, face detection, translation, OCR). Tracks build status, docker container deployments, and the execution of asynchronous compute graphs (`Job` broken down into dependent `Task` nodes).

### Domain 3: Domain Knowledge, Libraries & Custom Entities
* **Operations:** `libraryTypes`, `libraryType`, `libraries`, `library`, `libraryEngineModel`, `entityIdentifierTypes`, `entityIdentifierType`, `entity`, `entities`, `libraryConfiguration`
* **Architectural Role:** Custom training datasets and facial/biometric/logo recognition catalogs. Enables customers to link proprietary entity databases with cognitive engine models.

### Domain 4: Multi-Tenant IAM, RBAC & Authentication
* **Operations:** `organizations`, `organization`, `myOrganizations`, `users`, `user`, `me`, `tokens`, `groups`, `permissions`, `loginConfiguration`, `instanceLoginConfigurations`, `registrationConfiguration`, `registrationConfigurationInfo`
* **Architectural Role:** Multi-tier tenancy (Instance → Organization → Group → User). Covers API key issuance, OAuth / SAML SSO configurations, self-service registration flows, and fine-grained permissions.

### Domain 5: Search, Discovery & Hit Highlights
* **Operations:** `searchMedia`, `searchMentions`, `mention`, `sharedMention`
* **Architectural Role:** Elasticsearch-backed cognitive queries across indexed audio, video text, and detected entities. Mentions represent timestamped occurrences found inside processed media.

### Domain 6: Hierarchical File Organization & Navigation
* **Operations:** `rootFolders`, `folder`, `folderOverview`, `folderSummaryDetails`
* **Architectural Role:** Virtual filesystem organizing media and TDOs into hierarchical folders, access watchlists, and summarized rollups.

### Domain 7: App Framework & UI Customization
* **Operations:** `applications`, `application`, `applicationConfig`, `applicationConfigDefinition`, `applicationHeaderbar`, `widget`
* **Architectural Role:** Pluggable web apps running within the aiWARE portal. Manages per-app scoped key-value configuration definitions and custom headerbars.

### Domain 8: Structured Data & Schema Ingestion Engine
* **Operations:** `schemas`, `schema`, `schemaProperties`, `structuredData`, `structuredDataObject`, `structuredDataObjects`
* **Architectural Role:** Schema validation registry and query engine for structured tabular/JSON records associated with media items.

### Domain 9: System Observability & Audit Trail
* **Operations:** `platformInfo`, `graphqlServiceInfo`, `auditEvents`
* **Architectural Role:** Cluster diagnostics, GraphQL service introspection, and tenant compliance audit logging.

---

## 2. Recommended Engineering Strategy to Master Them

To efficiently master these operations without getting overwhelmed by 60+ individual field signatures, execute the following **4-phase strategy**:

### Phase 1: Build the Entity-Relationship Mental Model
Before reading syntax details, establish the primary object lifecycle:
1. **Tenancy:** `Organization` owns `User`, `Group`, `Application`, and `Library`.
2. **Media:** `Organization` owns `TDO`, which holds multiple `Asset` items.
3. **Execution:** An incoming asset triggers a `Job`, which schedules `Task`s onto `Engine`s.
4. **Intelligence:** Cognitive output produces `Mention`s and `StructuredData` linked back to the `TDO`.

### Phase 2: Trace End-to-End Operational Workflows
Do not read endpoints alphabetically or sequentially. Instead, trace real-world workflows:
* **Workflow A: Media Upload & Processing**
  `getSignedWritableUrl` *(get S3 upload path)* ➔ HTTP PUT to S3 ➔ Query `temporalDataObject` ➔ Inspect processing `job` and `task` progress.
* **Workflow B: Custom AI Recognition**
  Query `libraryTypes` ➔ Fetch `library` ➔ Retrieve `entities` ➔ Check `libraryEngineModel` deployment status.
* **Workflow C: Cognitive Search**
  Execute `searchMedia` / `searchMentions` with query filters ➔ Resolve matched `mention` time offsets ➔ Fetch the corresponding `asset` transcript/stream.

### Phase 3: Identify Standard Schema Conventions & Patterns
Note the recurring design patterns across this API:
* **Pagination:** Standard cursor/offset convention: `(offset: Int = 0, limit: Int = 30)`.
* **Identification:** Dual lookup pattern: singular lookup `id: ID!` vs bulk query `ids: [ID!]`.
* **Security Scopes:** Distinguish between public queries, user-token queries (`searchMedia`, `me`), and internal service token endpoints (`getSignedWritableAssetUrl`).

### Phase 4: Correlate Part 1 (Read-Side) with Parts 2 & 3 (Write-Side)
Because `mutations_part1.html` provides the **Query/Read contracts** (the data structures and getters), study these models first to serve as the reference types when analyzing the state-modifying mutations in [mutations_part2.html](file:///home/huycao/Coding/Examples/mutations_part2.html) and [mutations_part3.html](file:///home/huycao/Coding/Examples/mutations_part3.html) (which define `createTDO`, `createJob`, `updateEntity`, etc.).

Viewed mutations_part1.html:1680-1682