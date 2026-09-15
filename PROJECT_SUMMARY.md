# Veritone aiWARE Core GraphQL Platform: Project Architecture & Domain Guide

**Target Audience:** New Software Engineers joining the engineering team  
**Role Context:** Senior Software Engineer Onboarding & Systems Guide  
**Knowledge Grounding:** Strictly grounded in system context specifications (`.agents/contexts`)  

---

## Executive Summary & System Identity

Welcome to the team! This project powers the **Veritone aiWARE Core GraphQL API Server** (`https://api.stage.us-1.veritone.com/v3/graphql`).

At its core, **aiWARE** is an enterprise-grade, distributed AI operating system and headless media intelligence platform. It coordinates the entire lifecycle of multi-modal media—from raw stream ingestion, cloud storage, and distributed cognitive AI execution (transcription, face detection, OCR, translation, object tracking) to custom model training, real-time surveillance watchlists, low-code workflow automation, and cross-platform syndication.

The GraphQL interface serves as the primary communication plane for both web frontends (e.g., aiWARE Portal, custom apps) and backend microservices/distributed worker nodes. The schema encompasses **190 Query operations** and **361 Mutation operations**, organized into multi-tenant, loosely coupled architectural tiers.

---

## 1. High-Level Architectural Topology

The aiWARE platform is structured into clear horizontal layers spanning infrastructure, media primitives, cognitive compute, and business workflows:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        1. Enterprise IAM, Governance & Tenancy                         │
│       - Multi-tier Tenancy: Instance -> Organization -> Group -> User                 │
│       - Federated SSO (OpenID Connect), Scoped JWTs (Engine/Source), Object ACLs (ACE) │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
│ 2. Ingestion & Storage    │   │ 3. Cognitive AI Compute   │   │ 4. AI Knowledge & Models  │
│ - Ingest Slugs & Sources  │   │ - Engines, Builds, Nodes  │   │ - Custom Libraries & Types│
│ - TDOs (Time-Correlated)  │◄─►│ - DAG Jobs & Tasks        │◄─►│ - Entities & Identifiers  │
│ - Assets (S3 Direct / MP) │   │ - Distributed Clusters    │   │ - Engine Training Models  │
└─────────────┬─────────────┘   └─────────────┬─────────────┘   └─────────────┬─────────────┘
              │                               │                               │
              └───────────────────────────────┼───────────────────────────────┘
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        5. Insights, Eventing & Continuous AI                           │
│       - Continuous Monitoring: Rules-based Watchlists & Real-Time Alerts               │
│       - Time-Series Intelligence: Mentions, Engine Results & Cognitive Search          │
│       - Reactive Event Bus: Subscriptions, Custom Rules & Action Templates             │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┴───────────────────────────────────┐
        ▼                                                                       ▼
┌───────────────────────────┐                               ┌───────────────────────────┐
│ 6. Organization & Filing  │                               │ 7. Workflow & Automation  │
│ - Virtual Directory Trees │                               │ - aiWARE Automate (Flows) │
│ - Multi-Tenant Root Types │                               │ - Flow Revisions & Daemons│
│ - Dynamic Content Filing  │                               │ - Outbound Syndication    │
└───────────────────────────┘                               └───────────────────────────┘
```

---

## 2. Core Functional Domains Breakdown

The codebase and API are organized across **9 major functional domains**:

### 1. Ingestion & Media Lifecycle: Temporal Data Objects (TDO) & Assets
- **Key Concepts:**
  - **`TemporalDataObject` (TDO):** The fundamental media container representing a time-correlated stream or recorded file (audio, video, CCTV, broadcast).
  - **`Asset`:** Binary or text payloads associated with a TDO (e.g., original media renditions, subtitles, transcripts, thumbnails, engine JSON outputs) stored directly in Amazon S3.
  - **High-Throughput Ingestion:** Pre-signed S3 URLs (`getSignedWritableUrl`, `getSignedWritableUrls` generating up to 1,000 URLs per batch) and native chunked S3 multipart upload sessions (`initiateMultipartUpload`, `completeMultipartUpload`).
  - **Ingest Slugs & Sources:** Gateways mapping live streaming inputs (RTMP/RTSP, HLS) or FTP dropboxes to designated pipeline sources.
  - **Combined Creation:** Optimizations like `createTDOWithAsset` eliminate round-trip latency during rapid ingestion.

### 2. Cognitive AI Engine & Distributed Compute Pipeline
- **Key Concepts:**
  - **Engine Ecosystem:** Standardized Docker containers executing cognitive capabilities (speech-to-text, translation, facial recognition, OCR, object tracking).
  - **Build & Workflow Management:** Track container versions (`createEngineBuild`), submission reviews (`engineWorkflow(action: "submit")`), approvals, and cluster whitelists/blacklists.
  - **Asynchronous Execution Graphs (DAG Jobs & Tasks):** Processing work is scheduled as a `Job` composed of interdependent `Task` nodes. Jobs are instantiated manually (`createJob`), via blueprints (`launchJobTemplates`), or through recurring cron schedules (`createScheduledJob`).
  - **Dynamic Engine Routing:** Failed or deprecated engines can be hot-swapped in running pipelines using `addTaskReplacementEngine`.

### 3. Distributed Compute Clusters & Node Topology
- **Key Concepts:**
  - **Hybrid Infrastructure:** Supports execution across public clouds (AWS, Azure) and private on-premise appliances (`ClusterNode`).
  - **Node Lifecycle:** Nodes register and establish trust via pairing protocols (`pairClusterNode`), report heartbeat liveness (`pingClusterNode`), and support non-disruptive maintenance drains (`pauseClusterNode`).
  - **Dedicated Tenant Affinity:** Workload isolation using `updateOrganizationCluster`.

### 4. AI Knowledge Bases, Custom Catalogs & Biometric Training
- **Key Concepts:**
  - **Hierarchical Catalogs:** `LibraryType` -> `Library` -> `Entity` -> `EntityIdentifier`.
  - **Custom Recognition:** Enables customers to train proprietary facial recognition databases, voiceprints, license plates, and brand logos.
  - **Model Training Integration:** Publishes version-controlled libraries (`publishLibrary`) and couples them directly with cognitive engine models (`createLibraryEngineModel`).

### 5. Continuous Intelligence: Watchlists, Cognitive Search & Mentions
- **Key Concepts:**
  - **Watchlists:** Rules-based monitoring engines continuously scanning live media feeds for specific keyword transcripts, faces, or objects. Supports enterprise bulk updates (`bulkCreateWatchlist`, `bulkUpdateWatchlist`).
  - **Mentions:** Time-indexed occurrences of cognitive hits inside media (with second-level time offsets, confidence scores, and bounding boxes).
  - **Collaborative Review:** Human-in-the-loop validation including operator accuracy ratings (`createMentionRating`) and collaborative review discussions (`createMentionComment`).
  - **Cognitive Search:** Multi-modal Elasticsearch queries across processed media (`searchMedia`, `searchMentions`, `cognitiveSearch`).

### 6. Reactive Event Bus & Notification Subsystem
- **Key Concepts:**
  - **Event Bus:** Decoupled Pub/Sub event backbone allowing microservices to emit (`emitEvent`, `emitAuditEvent`) and subscribe to platform events (`eventSubscriptions`).
  - **Automation Rules:** Declarative `eventCustomRules` triggering pre-configured `eventActionTemplates` when specific system or media conditions occur.
  - **Enterprise Mailbox:** In-app notification center architecture managing user notification mailboxes, unread/seen states, and outbound transactional email integrations (SMTP/SES).

### 7. Virtual Filesystem Hierarchy & Asset Filing
- **Key Concepts:**
  - **Acyclic Virtual Tree:** Rather than rigid POSIX directories, aiWARE organizes digital assets into a virtual directory hierarchy anchored by domain-specific root nodes.
  - **Domain Root Types:** Segregated by `RootFolderType`: `cms`, `watchlist`, `collection`, `application`, and `resource`.
  - **Virtual Filing Architecture:** Entities (`TDO`, `Watchlist`, `Application`, `Collection`) are filed into folders via multi-tag associations (`fileTemporalDataObject`, `fileWatchlist`). Entities can be unfiled or moved between folders without altering underlying media storage.
  - **Optimistic Concurrency Control:** Tree relocations (`moveFolder`) require `fromFolderId` and `toFolderId` to guarantee that concurrent edits do not corrupt directory structures. Bulk migrations (`moveFolders`) feature structured partial-success payloads (`validFolderIds` vs `invalidFolderIds`).

### 8. Low-Code Workflow Runtime (aiWARE Automate)
- **Key Concepts:**
  - **Visual Flow Orchestrator:** Integrated Node-RED style asynchronous flow engine.
  - **Immutable Revisions:** Git-like version control (`createFlowRevision`, `updateFlowRevisionHead`, `deployFlowRevision`).
  - **"Always-Up" Daemons:** Long-running daemonized flows (`alwaysUpFlowCreate`) listening for webhook callbacks or streaming feeds.
  - **Workflow Runtime Storage:** Dedicated stateful key-value storage (`setWorkflowRuntimeStorageData`) maintaining session memory across execution graphs.

### 9. Multi-Tenant IAM, Security Governance & Syndication
- **Key Concepts:**
  - **Multi-Tenant Boundary:** Strict tenant isolation (`Organization` -> `User`).
  - **Federated SSO:** OpenID Connect (OIDC) provider registration and per-tenant policy enforcement.
  - **Least-Privilege Scoped JWTs:** Fine-grained token minting: `getEngineJWT` scopes execution tokens exclusively to the runtime container, while `getSourceJWT` isolates media collectors.
  - **Fine-Grained Object ACLs:** Beyond coarse roles (Admin, Contributor), Access Control Entries (`addACEsToResources`) attach specific `authPermissionSet` permissions directly to individual resources.
  - **Outbound Syndication (Destinations):** Multi-channel publishing pipelines (YouTube, social media, external cloud buckets) using OAuth-connected destinations (`completeDestinationConnection`, `distributeAsset`).
  - **Compliance Auditing:** Cryptographically verifiable audit logging (`instanceAuditLogConfig`, `auditLogExportRequest`) supporting SOC-2, HIPAA, and GDPR exports.

---

## 3. End-to-End Operational Lifecycle

To understand how data flows across the platform, follow this primary ingestion-to-insight pipeline:

```
[1. Ingest Gateway] ──► Ingest Slugs & Multipart S3 Uploads (Part 3)
         │
         ▼
[2. Container Setup] ─► createTDO / createTDOWithAsset / createAsset (Part 1 & 2)
         │
         ▼
[3. Compute Pipeline] ─► launchDAGTemplate / launchScheduledJobs to ClusterNode (Part 1 & 3)
         │
         ▼
[4. AI Processing] ───► Cognitive Engines produce Task Logs, Mentions & Structured Data (Part 1 & 2)
         │
         ▼
[5. Eventing & Alert] ─► Event Bus matches Watchlists & triggers Notification Mailbox (Part 2)
         │
         ▼
[6. Flow Automation] ─► Low-code Automate Flow compiles Highlights & Curates Collections (Part 1 & 3)
         │
         ▼
[7. Syndication] ─────► distributeAsset pushes deliverable to External Destination (Part 3)
         │
         ▼
[8. Governance] ──────► emitAuditEvent records actions for Compliance Audit Export (Part 2 & 3)
```

---

## 4. Engineering Standards & Testing Strategy

From an architectural standpoint, testing an enterprise multi-tenant GraphQL API requires strict separation of concerns:

### 1. Test Architecture Layers
- **Test Cases:** Focus purely on asserting business behavior (e.g., `"returns a folder belonging to the tenant"`).
- **GraphQL Test Client:** A reusable helper (`client.query()`, `client.mutate()`) that abstracts HTTP plumbing (`supertest` / `fetch`).
- **Test Data Factories:** Modular data builders following the Object Mother pattern. Keep `buildFolder()` (in-memory object generation) distinct from `createFolder()` (database persistence).
- **Authentication & Tenant Context:** Handled entirely inside test helpers (e.g., wrapping `userLogin` or injecting `x-tenant-id` headers) rather than repeated in test cases.

### 2. Testing Pyramid
- **Unit Tests (Resolvers / Services):** Fast, mocked dependencies, high volume.
- **GraphQL API / Integration Tests:** Testing full GraphQL operations against realistic application contexts.
- **E2E Tests:** Selective end-to-end verification of critical paths (e.g., login -> ingest -> process).

### 3. Feature-Centric Organization
Organize tests by business capability rather than technical layers:
```
tests/
├── setup.ts                    # Minimal global setup
├── helpers/
│   ├── graphql-client.ts       # Reusable execute/query/mutate helper
│   └── auth-context.ts         # Authentication & tenant fixture
├── factories/
│   ├── tenant.factory.ts
│   ├── user.factory.ts
│   └── folder.factory.ts
└── folder/
    ├── folder.query.test.ts
    ├── folder.mutation.test.ts
    └── folder.tenant-isolation.test.ts
```

---

## 5. Summary Cheat Sheet for New Developers

| Requirement / Task | Primary Area | Key Operations to Explore |
| :--- | :--- | :--- |
| **Media Upload & Streams** | Media & Assets | `getSignedWritableUrls`, `initiateMultipartUpload`, `createTDOWithAsset`, `createAsset` |
| **Running AI Models** | Engines & Jobs | `createEngineBuild`, `launchSingleEngineJob`, `launchDAGTemplate`, `createJob` |
| **Watchlists & Mentions** | Continuous AI | `createWatchlist`, `bulkCreateWatchlist`, `searchMentions`, `createMentionRating` |
| **Directory Management** | Virtual Folders | `createRootFolders`, `createFolder`, `updateFolder`, `moveFolder`, `fileTemporalDataObject` |
| **Event-Driven Hooks** | Event Bus & Alerts | `createEvent`, `eventSubscriptions`, `createEventCustomRule`, `notificationPost` |
| **Visual Workflows** | aiWARE Automate | `createFlow`, `createFlowRevision`, `deployFlowRevision`, `alwaysUpFlowCreate` |
| **Auth & Tenant Isolation** | IAM & Security | `userLogin`, `getEngineJWT`, `createOpenIdProvider`, `addACEsToResources` |
| **Publishing Content** | Syndication | `createDestination`, `completeDestinationConnection`, `distributeAsset` |

---

*Report compiled from core platform specifications in `.agents/contexts/`.*
