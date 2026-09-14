# Architecture & Domain Report: `mutations_part2.html`

## Executive Context
Following [mutations_part1.html](file:///home/huycao/Coding/Examples/mutations_part1.html) (which established foundational primitives like Tenants, TDOs, Assets, and AI Engines), **Part 2** (`mutations_part2.html`, items 64–126) advances into the **Platform Services, Eventing, Collaboration, and Workflow Automation** layer of the Veritone aiWARE ecosystem.

All 63 operations in Part 2 continue the GraphQL Query surface and can be structured into **8 major functional domains**:

```
                              ┌────────────────────────────────────────────────────────┐
                              │                 Enterprise Services                    │
                              │   - OpenID SSO, API Tokens, Rights, Packaging/Grants   │
                              └───────────────────────────┬────────────────────────────┘
                                                          │
          ┌───────────────────────────────┬───────────────┴───────────────┬───────────────────────────────┐
          ▼                               ▼                               ▼                               ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│ Media Workflows & │           │ Continuous Intel  │           │ Event Bus, Rules  │           │ Structured Data & │
│ Sharing           │           │ & Search          │           │ & Notifications   │           │ Datasets          │
│ - Bulk S3 Upload  │           │ - Watchlists      │           │ - Event / Sub     │           │ - DataRegistries  │
│ - Collections     │           │ - CognitiveSearch │           │ - ActionTemplates │           │ - Datasets        │
│ - Media Shares    │           │ - EngineResults   │           │ - Mailbox / Email │           │ - DataQueries     │
└─────────┬─────────┘           └─────────┬─────────┘           └─────────┬─────────┘           └─────────┬─────────┘
          │                               │                               │                               │
          └───────────────────────────────┴───────────────┬───────────────┴───────────────────────────────┘
                                                          ▼
                                        ┌───────────────────────────────────┐
                                        │ Pipeline Automation & Analytics   │
                                        │ - ProcessTemplates (Automate Flow)│
                                        │ - ExportRequests, Dashboards, BI  │
                                        └───────────────────────────────────┘
```

---

## 1. Main Topics Breakdown

### Domain 1: High-Throughput Ingestion & Storage Pipeline
* **Operations:** `getSignedWritableUrls`, `getUploadStatus`
* **Architectural Purpose:** Bulk generation of pre-signed S3 upload URLs (up to 1,000 URLs per call) and asynchronous polling for HTTP PUT status/error reporting. Essential for large batch ingestion (e.g., CCTV feeds, high-volume broadcast dumps).

### Domain 2: Collaboration, Collections & Cross-Tenant Media Sharing
* **Operations:** `collections`, `collection`, `collectionMention`, `collectionMentions`, `sharedFolders`, `mediaShare`, `sharedCollection`, `sharedCollectionHistory`
* **Architectural Purpose:** Content aggregation and curation. Collections group TDOs and timestamped mentions for editorial or investigative workflows. Provides tokenized, expiring external share links (`mediaShare`, `sharedCollection`) with full audit histories.

### Domain 3: Continuous Intelligence, Surveillance & Cognitive Querying
* **Operations:** `watchlists`, `watchlist`, `mentions`, `mentionStatusOptions`, `cognitiveSearch`, `savedSearches`, `engineResults`
* **Architectural Purpose:**
  * **Watchlists:** Rules-based monitoring pipelines continuously scanning live streams or ingestion feeds for specific hits (faces, keywords, vehicle plates).
  * **Engine Results:** Low-level extraction of raw AI engine telemetry (time-series bounding boxes, transcription confidence scores, OCR coordinates).
  * **Cognitive Search:** Complex multi-modal querying, with persistence via `savedSearches`.

### Domain 4: Event-Driven Automation, Webhooks & Triggers
* **Operations:** `events`, `event`, `eventSubscriptions`, `eventSubscription`, `eventActionTemplates`, `eventActionTemplate`, `eventCustomRules`, `eventCustomRule`, `trigger`, `triggers`, `subscription`
* **Architectural Purpose:** aiWARE’s internal reactive event bus. Allows external systems to register webhooks (`eventSubscription`), listen for state changes (e.g., job completed, watchlist trigger fired), evaluate custom conditional rules (`eventCustomRules`), and dispatch pre-configured actions (`eventActionTemplates`).

### Domain 5: Process Orchestration & Workflow Templates (aiWARE Automate / Flow)
* **Operations:** `processTemplates`, `processTemplate`, `automatePackage`
* **Architectural Purpose:** Managing complex, multi-engine DAG (Directed Acyclic Graph) pipeline workflows. Links engine combinations into reusable process templates orchestrated via aiWARE Automate.

### Domain 6: Structured Datasets & High-Performance Data Queries
* **Operations:** `dataRegistries`, `dataRegistry`, `dataset`, `datasets`, `datasetDataQuery`
* **Architectural Purpose:** Custom columnar/relational datasets managed within the platform. Allows executing SQL-like filtered and paginated queries (`datasetDataQuery`) against ingested business data.

### Domain 7: Enterprise Notifications & Communications
* **Operations:** `notificationMailboxes`, `notificationTemplates`, `notificationActions`, `platformEmailProvider`, `emailTemplateGet`
* **Architectural Purpose:** End-to-end alerting subsystem. Configures outbound email transports (SMTP/SES), rich templating with variable substitution, and recipient mailbox routing.

### Domain 8: Enterprise Security, Packaging, Monetization & Governance
* **Operations:** 
  * **IAM & Federation:** `openIdProvider`, `openIdProviders`, `basicUserInfo`, `apiTokens`, `myRights`
  * **Monetization & Licensing:** `packages`, `packageGrants`
  * **Analytics & Usage:** `customDashboards`, `customDashboard`, `getUsageByTaskType`, `taskReplacementEngines`, `exportRequests`, `exportRequest`
  * **Application Config & Personalization:** `getUserSettings`, `getUserSettingDefinitions`, `staticAppConfig`, `applicationViewers`, `timeZones`, `matchEntityTags`, `creative`
* **Architectural Purpose:**
  * **Federation:** OpenID Connect (OIDC) identity provider configuration for enterprise SSO.
  * **App Marketplace / Licensing:** Packages bundle engines and applications; `packageGrants` govern enterprise license entitlements and usage limits.
  * **Observability:** Metric tracking via `getUsageByTaskType` for billing and engine replacement strategies (`taskReplacementEngines`).

---

## 2. Senior Engineering Synthesis: Progression from Part 1 to Part 2

| Dimension | Part 1 ([mutations_part1.html](file:///home/huycao/Coding/Examples/mutations_part1.html)) | Part 2 ([mutations_part2.html](file:///home/huycao/Coding/Examples/mutations_part2.html)) |
| :--- | :--- | :--- |
| **System Layer** | Infrastructure & Primitives | Platform Services & Integrations |
| **Core Entities** | Single TDOs, Assets, Engines, IAM | Collections, Watchlists, Events, Datasets |
| **Execution Model** | Direct Job/Task lookup | Automated Process Templates & Event-Triggered Rules |
| **Data Scope** | Primary media & engine builds | Analytics, Dashboards, Usage Billing, & Exports |
| **Integration** | S3 single-file signed upload | Batch S3 upload (1,000 URLs), OIDC SSO, Webhook Bus |

### Recommended Focus for Investigation
If building or integrating against this service layer, prioritize:
1. **Eventing & Webhooks (`eventSubscriptions`):** Crucial for building asynchronous event-driven integrations without polling.
2. **Process Templates (`processTemplates`):** Essential for orchestrating chained cognitive pipelines (e.g., Transcribe ➔ Translate ➔ Summarize).
3. **Collections & Sharing (`collections`, `mediaShare`):** Core for user-facing collaborative workflows and media asset management.