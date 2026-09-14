# Architecture & Domain Report: `mutations_part1.html`

## Executive Context
[mutations_part1.html](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html) covers **120 root GraphQL mutation operations** (Items 1–120 of 361) from the **Veritone aiWARE GraphQL API**.

While `queries.html` defined the read-side getters and data shapes, `mutations_part1.html` represents the **write-side state modification plane** for:
- Core media ingestion and temporal data management
- Distributed cognitive engine registration, builds, and DAG job execution
- AI knowledge bases, custom entity training catalogs, and biometric identifiers
- Tenant administration, user lifecycle, and role-based access control (RBAC)
- Custom application ecosystems, configuration hierarchies, and UI extensions
- Structured schema governance, collections, and cross-tenant mention collaboration

---

## 1. Architectural System Overview

```
                               ┌────────────────────────────────────────────────────────┐
                               │           Multi-Tenant IAM & Organization              │
                               │   (createOrg, createUser, updateUserRoles, switchOrg)  │
                               └───────────────────────────┬────────────────────────────┘
                                                           │
               ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
               ▼                                           ▼                                           ▼
  ┌─────────────────────────┐                 ┌─────────────────────────┐                 ┌─────────────────────────┐
  │   Media & Ingestion     │                 │   Cognitive AI Engine   │                 │   Knowledge Catalogs    │
  │   - TDO Lifecycle       │                 │   - Engine / Builds     │                 │   - Libraries / Models  │
  │   - Asset / S3 Ingestion│◄───────────────►│   - Workflow Approvals  │◄───────────────►│   - Entities / Biometrics│
  │   - Media Segments      │                 │   - DAG Jobs & Tasks    │                 │   - Dataset Integration │
  │   - TDO Cloning         │                 │   - Engine Whitelisting │                 │   - Collaborators       │
  └────────────┬────────────┘                 └─────────────────────────┘                 └─────────────────────────┘
               │
               ├───────────────────────────────────────────┬───────────────────────────────────────────┐
               ▼                                           ▼                                           ▼
  ┌─────────────────────────┐                 ┌─────────────────────────┐                 ┌─────────────────────────┐
  │  Application Framework  │                 │  Structured Data Engine │                 │  Collaboration & Share  │
  │  - Apps, Viewers, Builds│                 │  - Schemas & Drafts     │                 │  - Curated Collections  │
  │  - App Config Hierarchy │                 │  - Data Registries      │                 │  - Mention Bookmarking  │
  │  - Headerbars & Widgets │                 │  - Structured Ingestion │                 │  - Cross-Tenant Sharing │
  └─────────────────────────┘                 └─────────────────────────┘                 └─────────────────────────┘
```

---

## 2. Main Topics Breakdown (9 Architectural Domains)

The 120 operations decompose into **9 cohesive functional domains**:

### Domain 1: Temporal Data Objects (TDO) & Media Assets (Core Ingestion)
* **Operations:** `createTDO`, `updateTDO`, `deleteTDO`, `cleanupTDO`, `createAsset`, `deleteAsset`, `updateAsset`, `addMediaSegment`, `addMediaSegments`
* **Architectural Role:**
  - Manages the primary time-series media container (`TemporalDataObject`) across its complete lifecycle.
  - Controls individual binary/text assets (audio tracks, video renditions, transcripts, thumbnails, engine outputs).
  - Handles multipart form POST uploads (`createAsset`).
  - Coordinates streaming media segments (`addMediaSegment`, `addMediaSegments`) for continuous live or chunked ingestion.
  - Provides data retention cleanup (`cleanupTDO`) to strip partial metadata/assets while preserving records.

### Domain 2: Cognitive AI Engine, Builds & Distributed DAG Orchestration
* **Operations:**
  - **Logging & Tasks:** `createTaskLog`, `updateTask`, `appendWarningToTask`
  - **Engine Lifecycle:** `createEngine`, `updateEngine`, `deleteEngine`, `engineWorkflow`, `createAutomateFlow`
  - **Build Deployments:** `createEngineBuild`, `updateEngineBuild`, `deleteEngineBuild`
  - **Execution Governance:** `addToEngineWhitelist`, `addToEngineBlacklist`, `deleteFromEngineBlacklist`, `deleteFromEngineWhitelist`
  - **Job Execution:** `createJob`, `cancelJob`, `retryJob`, `launchSingleEngineJob`, `launchDAGTemplate`, `addTasksToJobs`, `updateJobs`
* **Architectural Role:**
  - Powers aiWARE's core compute pipeline.
  - Registers Docker-based cognitive engines (speech-to-text, computer vision, translation, NLP) and manages build releases.
  - Applies formal approval state transitions via `engineWorkflow` (e.g. submit for review, approve, deploy).
  - Orchestrates asynchronous compute graphs: jobs composed of interconnected tasks scheduled onto distributed worker nodes.
  - Offers high-level abstractions like `launchSingleEngineJob` and `launchDAGTemplate` alongside granular task updates.

### Domain 3: Data Replication & TDO Cloning
* **Operations:** `requestClone`, `refreshClone`, `cloneRequestCancel`
* **Architectural Role:**
  - Enables cross-organization or cross-environment cloning of media items without duplicating raw storage.
  - Supports differential synchronization (`refreshClone`) to propagate newly generated assets/metadata from source to clone.
  - Allows atomic cancellation of pending or running clone requests.

### Domain 4: AI Knowledge Bases, Custom Libraries & Recognition Catalogs
* **Operations:**
  - **Type Definitions:** `createEntityIdentifierType`, `updateEntityIdentifierType`, `createLibraryType`, `updateLibraryType`
  - **Libraries:** `createLibrary`, `updateLibrary`, `deleteLibrary`, `publishLibrary`
  - **Entities & Identifiers:** `createEntity`, `updateEntity`, `deleteEntity`, `createEntityIdentifier`, `updateEntityIdentifier`, `deleteEntityIdentifier`
  - **Models & Training:** `createLibraryEngineModel`, `updateLibraryEngineModel`, `deleteLibraryEngineModel`, `createLibraryConfiguration`, `updateLibraryConfiguration`, `deleteLibraryConfiguration`, `addLibraryDataset`, `deleteLibraryDataset`
  - **Collaboration:** `createLibraryCollaborator`, `updateLibraryCollaborator`, `deleteLibraryCollaborator`
* **Architectural Role:**
  - Manages proprietary entity recognition catalogs (e.g. facial recognition databases, audio voiceprints, brand logos, license plates).
  - Hierarchical structure: `LibraryType` → `Library` → `Entity` → `EntityIdentifier` (with vector/image multipart uploads).
  - Version-controlled publication (`publishLibrary`) to freeze library states for cognitive model inference.
  - Links custom training datasets with specific engine models (`createLibraryEngineModel`, `addLibraryDataset`).

### Domain 5: Custom Application Framework, Config & Extension Ecosystem
* **Operations:**
  - **Application Management:** `createApplication`, `updateApplication`, `deleteApplication`, `applicationAddToOrg`, `applicationRemoveFromOrg`, `applicationWorkflow`
  - **Hierarchical Configuration:** `applicationConfigDefinitionCreate`, `applicationConfigDefinitionUpdate`, `applicationConfigDefinitionDelete`, `applicationConfigSet`, `applicationConfigDelete`
  - **Micro-frontends & UI Extensions:** `createApplicationViewer`, `createApplicationViewerBuild`, `createWidget`, `updateWidget`, `createApplicationHeaderbar`, `updateApplicationHeaderbar`, `bulkDeleteContextMenuExtensions`, `fileApplication`, `unfileApplication`
  - **Billing & Deprecations:** `updateApplicationBillingPlanId`, `updateApplicationBillingDirty`, `updateApplicationComponent` *(deprecated)*
* **Architectural Role:**
  - Extensibility layer for 3rd-party and internal SaaS applications inside the aiWARE portal.
  - Provides a 3-tier scoped configuration engine (App → Organization → User overrides).
  - Supports viewer builds (custom cognitive output visualizers) and contextual UI extensions.

### Domain 6: Identity and Access Management (IAM), Tenant Administration & Auth
* **Operations:**
  - **Tenancy:** `createOrganization`, `updateOrganization`, `updateOrganizationBilling`
  - **User Lifecycle:** `createUser`, `updateUser`, `deleteUser`, `addUserToOrganization`, `removeUserFromOrganization`, `switchUserToOrganization`
  - **RBAC:** `updateUserRoles`
  - **Authentication & Security:** `updateCurrentUser`, `createPasswordUpdateRequest`, `createPasswordResetRequest`, `getCurrentUserPasswordToken`, `changePassword`
* **Architectural Role:**
  - Multi-tenant boundary isolation and organizational account governance.
  - Fine-grained role binding (`updateUserRoles`) and contextual tenant switching (`switchUserToOrganization`).
  - Credential lifecycle management: self-service password changes, admin-initiated password resets, and forced password updates upon next login.

### Domain 7: Structured Data, Dynamic Schemas & Data Registries
* **Operations:** `createDataRegistry`, `updateDataRegistry`, `createSchema`, `upsertSchemaDraft`, `updateSchemaState`, `createStructuredData`, `updateStructuredData`, `deleteStructuredData`
* **Architectural Role:**
  - Metadata governance framework for arbitrary structured tabular and JSON records associated with media.
  - Schema lifecycle: registry definition → draft schema iteration (`upsertSchemaDraft`) → state transition to active/published (`updateSchemaState`).
  - High-throughput ingestion of typed structured data records (`createStructuredData`).

### Domain 8: Media Collaboration, Collections & Cross-Tenant Sharing
* **Operations:**
  - **Collections:** `createCollection`, `updateCollection`, `deleteCollection`, `shareCollection`, `updateSharedCollectionMentions`, `updateSharedCollectionHistory`
  - **Mentions Management:** `createCollectionMention`, `createCollectionMentions`, `updateCollectionMention`, `deleteCollectionMention`
  - **Granular Sharing:** `shareMention`, `shareMentionInBulk`, `shareMentionFromCollection`
* **Architectural Role:**
  - Content curation layer: users assemble highlights, bookmarks, and timestamped cognitive hits ("mentions") into shared collections.
  - Secure cross-tenant federated sharing (`shareCollection`, `shareMentionInBulk`) granting read permissions to external partner organizations.

### Domain 9: Virtual Filesystem Organization & Platform Versioning
* **Operations:** `createFolder`, `addPlatformVersion`
* **Architectural Role:**
  - Hierarchical folder tree management (`createFolder`) for organizing TDOs and assets into user-facing directories.
  - Platform-level system version management (`addPlatformVersion`).

---

## 3. Recommended Engineering Strategy to Master Them

To efficiently master these 120 mutations without drowning in schema boilerplate, adopt this **5-phase engineering strategy**:

### Phase 1: Map the Mutation Topology to Read-Side Query Entities
GraphQL mutations modify entities that you query. Anchor each mutation group to the corresponding type definitions established in `queries.html`:
* `createTDO` / `updateTDO` ➔ Inspect `temporalDataObject` type definition.
* `createJob` / `launchDAGTemplate` ➔ Inspect `job` and `task` type graphs.
* `createLibrary` / `createEntity` ➔ Inspect `library` and `entity` schemas.
* `createUser` / `updateUserRoles` ➔ Inspect `user` and `organization` types.

### Phase 2: Trace Core Asynchronous & Stateful Lifecycles
Do not memorize individual field arguments. Focus on the state machines:
1. **The Ingestion & Processing Pipeline:**
   `createTDO` ➔ `createAsset` (upload media) ➔ `launchDAGTemplate` (kick off AI engines) ➔ Task execution triggers `createTaskLog` / `updateTask` ➔ AI engines output `createStructuredData` / `createCollectionMention`.
2. **The Cognitive Engine Publication Lifecycle:**
   `createEngine` ➔ `createEngineBuild` ➔ Submit via `engineWorkflow(action: "submit")` ➔ Approve via `engineWorkflow(action: "approve")` ➔ `addToEngineWhitelist`.
3. **The Knowledge Catalog & Model Training Lifecycle:**
   `createLibraryType` ➔ `createLibrary` ➔ `createEntity` ➔ `createEntityIdentifier` (biometric vector/image upload) ➔ `publishLibrary` ➔ `createLibraryEngineModel` (link to engine for inference).
4. **The Schema Governance Lifecycle:**
   `createDataRegistry` ➔ `createSchema` ➔ `upsertSchemaDraft` ➔ `updateSchemaState(state: "published")` ➔ `createStructuredData`.

### Phase 3: Identify Architectural Patterns & Execution Modes
Classify the mutations by their execution semantics:
* **Multipart / Binary Ingestion:** `createAsset`, `createTaskLog`, `createEntityIdentifier`. These mutations accept raw file buffers or multipart boundaries, not just JSON payloads.
* **Bulk & Batching Mutations:** `addMediaSegments`, `addTasksToJobs`, `updateJobs`, `shareMentionInBulk`, `createCollectionMentions`, `bulkDeleteContextMenuExtensions`. Use these for high-throughput batch operations instead of hammering individual mutations.
* **Administrative & Security Operations:** `updateOrganizationBilling`, `switchUserToOrganization`, `createPasswordUpdateRequest`. These require elevated scopes (`superadmin` or tenant admin).

### Phase 4: Focus by Engineering Persona
Prioritize deep-dive investigation based on functional responsibility:
* **Media & Ingestion Engineers:** Master Domains 1, 3, and 9 (TDO, Assets, Cloning, Folders).
* **AI / ML Platform Engineers:** Master Domains 2 and 4 (Engines, Builds, DAG Jobs, Libraries, Entity Models).
* **Identity & Security Engineers:** Master Domain 6 (Organizations, Users, RBAC, Passwords).
* **Platform / Full-Stack Engineers:** Master Domains 5, 7, and 8 (Applications, Configs, Schemas, Collections).

### Phase 5: Automated Contract Validation & Test Harness
Construct minimal GraphQL mutation test fixtures:
- Use GraphiQL or Postman with automated environment variables.
- Write smoke tests for each primary workflow: create ➔ read back with query ➔ update ➔ verify idempotency ➔ delete.
