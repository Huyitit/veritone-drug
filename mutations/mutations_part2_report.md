# Architecture & Domain Report: `mutations_part2.html`

## Executive Context
[mutations_part2.html](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html) covers **120 root GraphQL mutation operations** (Operations 121–240 of 361) from the **Veritone aiWARE GraphQL API**.

Building upon the foundational primitives established in [mutations_part1.html](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html) (TDOs, Assets, AI Engine Builds, DAG Jobs, and Core IAM), **Part 2** transitions into the **Enterprise Platform Services, Event-Driven Automation, Notification Bus, Continuous Intelligence, and Federated Single Sign-On (SSO)** tier of the architecture.

---

## 1. Architectural System Overview

```
                              ┌────────────────────────────────────────────────────────┐
                              │            Enterprise Identity & Access (SSO)          │
                              │   - OpenID Providers, Scoped JWTs, Session Lifecycle   │
                              │   - Instance Login & Tenant Registration Configs       │
                              └───────────────────────────┬────────────────────────────┘
                                                          │
          ┌───────────────────────────────┬───────────────┴───────────────┬───────────────────────────────┐
          ▼                               ▼                               ▼                               ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│ Event Bus & Rules │           │  Notifications &  │           │   Continuous AI   │           │ Virtual Hierarchy │
│ - Pub/Sub Events  │           │  In-App Mailboxes │           │   & Search        │           │ & Filing          │
│ - Custom Rules    │◄─────────►│ - Mailbox State   │           │ - Watchlists      │           │ - Nested Folders  │
│ - ActionTemplates │           │ - Event Templates │           │ - Cognitive Search│           │ - File/Unfile TDO │
│ - Subscriptions   │           │ - Outbound Email  │           │ - Saved Searches  │           │ - Folder Sharing  │
└─────────┬─────────┘           └───────────────────┘           └─────────┬─────────┘           └───────────────────┘
          │                                                               │
          └───────────────────────────────┬───────────────────────────────┘
                                          ▼
                        ┌───────────────────────────────────┐
                        │      Collaborative Insights       │
                        │ - Mentions & Bulk Creation        │
                        │ - Comments, Ratings, Shares       │
                        │ - Async Export Pipelines (TDO/Zip)│
                        │ - Datasets & Dynamic Routing      │
                        └───────────────────────────────────┘
```

---

## 2. Main Topics Breakdown (10 Architectural Domains)

The 120 operations in Part 2 decompose into **10 cohesive enterprise domains**:

### Domain 1: Enterprise Identity, Scoped JWTs & Federated SSO (OpenID)
* **Operations:**
  * **Session Lifecycle:** `userLogin`, `userLogout`, `refreshToken`, `extendToken`, `validateToken`
  * **Scoped Least-Privilege Tokens:** `getEngineJWT`, `getSourceJWT`, `verifyJWT`
  * **OpenID Connect SSO:** `createOpenIdProvider`, `updateOpenIdProvider`, `deleteOpenIdProvider`, `enableOpenIdProviderForOrg`, `disableOpenIdProviderForOrg`
  * **Tenant Login & Onboarding Policies:** `createInstanceLoginConfiguration`, `updateInstanceLoginConfiguration`, `deleteLoginConfiguration`, `deleteInstanceLoginConfiguration`, `createRegistrationConfiguration`, `updateRegistrationConfiguration`, `deleteRegistrationConfiguration`
  * **Account Lifecycle:** `updateUserStatus`
* **Architectural Role:**
  - Manages session token verification, token refresh, and cross-service validation.
  - Issues bounded, short-lived JWTs scoped specifically to engine execution containers (`getEngineJWT`) or media ingestion sources (`getSourceJWT`), minimizing blast radius.
  - Implements enterprise Single Sign-On (SSO) via OpenID Connect, supporting global provider definition and per-organization enablement.
  - Controls instance-level vanity login domains, SAML/OAuth redirect configurations, and self-service user onboarding rules.

### Domain 2: Event Bus, Reactive Subscriptions & Custom Rule Automation
* **Operations:**
  * **Event Management:** `createEvent`, `updateEvent`, `subscribeEvent`, `unsubscribeEvent`, `emitEvent`, `emitSystemEvent`, `emitAuditEvent`
  * **Triggers & Action Templates:** `createTriggers`, `deleteTrigger`, `createEventActionTemplate`, `updateEventActionTemplate`
  * **Automation Rules:** `createEventCustomRule`, `updateEventCustomRule`, `deleteEventCustomRule`
  * **Subscriptions:** `createSubscription`, `updateSubscription`, `deleteSubscription`
* **Architectural Role:**
  - Serves as the real-time event-driven backbone connecting decoupled microservices.
  - Allows services and users to declare reactive subscriptions to platform events.
  - Powers low-code event triggers: executing predefined action templates or custom filter rules when matching media/system events fire.
  - Guarantees compliance via immutable audit event emission (`emitAuditEvent`).

### Domain 3: Enterprise Notification Infrastructure & Mailbox Management
* **Operations:**
  * **Mailbox State:** `notificationMailboxCreate`, `notificationMailboxPause`, `notificationMailboxUnpause`, `notificationMailboxDelete`
  * **Posting & Read States:** `notificationPost`, `markAllNotificationsRead`, `markAllNotificationsSeen`, `setNotificationFlag`
  * **Notification Templates & Handlers:** `addNotificationTemplate`, `removeNotificationTemplate`, `addNotificationAction`, `removeNotificationAction`
  * **Outbound Communications:** `sendEmail`
* **Architectural Role:**
  - Complete in-app notification center architecture.
  - Manages logical mailboxes that can be individually paused/resumed or filtered.
  - Maps system event streams to formatted user notifications via templates and actions.
  - Handles high-volume read/seen state updates and outbound transactional emails.

### Domain 4: Virtual Filesystem Hierarchy & Media Filing
* **Operations:**
  * **Folder Structure:** `createRootFolders`, `updateFolder`, `moveFolder`, `moveFolders`, `deleteFolder`, `shareFolder`
  * **TDO Association:** `fileTemporalDataObject`, `unfileTemporalDataObject`, `moveTemporalDataObject`
  * **Folder Content Templates:** `createFolderContentTemplate`, `updateFolderContentTemplate`, `deleteFolderContentTemplate`
* **Architectural Role:**
  - Emulates an enterprise virtual filesystem over unorganized media buckets.
  - Allows many-to-many filing: filing, unfiling, or moving TDOs across folder hierarchies.
  - Supports bulk folder migrations (`moveFolders`) and cross-organization folder sharing (`shareFolder`).
  - Standardizes directory setup using reusable folder content templates.

### Domain 5: Continuous Intelligence, Search & Watchlists
* **Operations:**
  * **Watchlists:** `createWatchlist`, `bulkCreateWatchlist`, `updateWatchlist`, `deleteWatchlist`, `bulkUpdateWatchlist`, `fileWatchlist`, `unfileWatchlist`
  * **Cognitive Search:** `createCognitiveSearch`, `updateCognitiveSearch`, `deleteCognitiveSearch`
  * **Saved Searches:** `createSavedSearch`, `replaceSavedSearch`, `deleteSavedSearch`
* **Architectural Role:**
  - Real-time stream monitoring: watchlists continuously evaluate incoming audio/video transcripts and entity detections for hits.
  - Provides enterprise bulk management (`bulkCreateWatchlist`, `bulkUpdateWatchlist`) to support enterprise operations tracking thousands of keywords/entities.
  - Manages persistent cognitive search queries and profile replacements.

### Domain 6: Mention Lifecycle, Collaborative Review & Sharing
* **Operations:**
  * **Mentions:** `createMention`, `createMentions` (bulk array ingestion), `updateMention`, `updateMentions`
  * **Social Annotations:** `createMentionComment`, `updateMentionComment`, `deleteMentionComment`, `createMentionRating`, `updateMentionRating`, `deleteMentionRating`
  * **External Sharing:** `createMediaShare`
* **Architectural Role:**
  - Granular write-access to timestamped cognitive hits ("mentions") inside processed media.
  - Human-in-the-loop review pipeline: allows operators to rate cognitive engine accuracy (e.g. OCR/facial recognition accuracy) and add collaborative review comments.
  - Generates tokenized, time-bounded public or partner media share links (`createMediaShare`).

### Domain 7: Asynchronous Media & Mention Export Pipelines
* **Operations:**
  * **TDO Exports:** `createExportRequest`, `updateExportRequest`
  * **Mention Exports:** `createMentionExportRequest`, `updateMentionExportRequest`
* **Architectural Role:**
  - Triggers asynchronous background rendering and compilation jobs.
  - Packages media clips, burned-in subtitles, redaction masks, and structured metadata reports into export packages (e.g., MP4, ZIP, CSV/JSON) stored on S3.

### Domain 8: Managed Datasets & Schema-Driven Operations
* **Operations:** `createDataset`, `createDatasetSchema`, `updateDataset`, `deleteDataset`, `datasetDataOperation`
* **Architectural Role:**
  - Schema-backed tabular dataset management.
  - Provides batch operational endpoints (`datasetDataOperation`) for executing append, update, or purge operations against structured AI datasets.

### Domain 9: Engine Optimization, Output Validation & Dynamic Routing
* **Operations:**
  * **Optimized Ingestion:** `createTDOWithAsset` (combined single-call creation)
  * **Result Validation:** `uploadEngineResult`, `validateEngineOutput`
  * **Dynamic Engine Routing:** `addTaskReplacementEngine`, `removeTaskReplacementEngine`
  * **Process Templates:** `createProcessTemplate`, `updateProcessTemplate`, `deleteProcessTemplate`
* **Architectural Role:**
  - High-performance ingestion bypass: `createTDOWithAsset` eliminates roundtrip overhead by initializing the container and asset payload simultaneously.
  - Validates cognitive engine JSON outputs against strict platform schemas prior to storage.
  - Engine replacement routing: hot-swaps failing or deprecated cognitive engines in running DAGs without rebuilding job definitions.

### Domain 10: Personalization, Custom Dashboards & UI Extensions
* **Operations:**
  * **UI Extensions:** `createContextMenuExtension`, `updateContextMenuExtension`, `deleteContextMenuExtension`
  * **Custom Dashboards:** `createCustomDashboard`, `updateCustomDashboard`, `deleteCustomDashboard`
  * **Scoped User Settings:** `createUserSettingDefinition`, `deleteUserSettingDefinition`, `updateUserSetting`
  * **Advertising Creatives:** `createCreative`, `updateCreative`, `deleteCreative`
  * **Platform Properties:** `setCurrentPlatformVersion`, `setPlatformProperties`, `setOrganizationIntegrationConfig`, `deleteOrganizationIntegrationConfig`
* **Architectural Role:**
  - Micro-frontend extensibility: injects custom actions into the aiWARE portal's right-click context menus.
  - Configures customizable analytics dashboards and user-preference storage hierarchies.
  - Manages ad insertion creative assets and platform-level property flags.

---

## 3. Recommended Engineering Strategy to Master Them

To master the 120 mutations in Part 2 with senior-level efficiency, execute the following **4-phase strategy**:

### Phase 1: Understand the Event & Notification Flow
Trace the reactive notification lifecycle end-to-end:
1. An incoming stream triggers an engine detection ➔ Platform calls `emitEvent`.
2. A registered `createEventCustomRule` matches the event payload.
3. The rule triggers an `addNotificationAction` linked to an `addNotificationTemplate`.
4. The alert is delivered to a user's `NotificationMailbox`, which the frontend updates via `markAllNotificationsRead` or `markAllNotificationsSeen`.

### Phase 2: Analyze the Security & Token Scoping Architecture
Differentiate authentication layers:
* **Session Auth:** Standard user login flow (`userLogin` ➔ token returned ➔ `extendToken` / `refreshToken` ➔ `userLogout`).
* **Microservice / Worker Auth:** Containerized engines should **never** receive full user credentials. Study how `getEngineJWT` and `getSourceJWT` construct restricted, resource-specific tokens.
* **Enterprise SSO:** Study the relationship between `createOpenIdProvider` and `enableOpenIdProviderForOrg` for multi-tenant identity federation.

### Phase 3: Contrast High-Throughput Batch Operations vs Single Calls
Identify when to use batch mutations for performance:
* Use `createTDOWithAsset` instead of sequential `createTDO` + `createAsset`.
* Use `bulkCreateWatchlist` and `bulkUpdateWatchlist` when synchronizing large watchlist catalogs.
* Use `createMentions` (accepting an array) and `updateMentions` for cognitive engine ingestion rather than single-mention mutations.
* Use `moveFolders` for tree restructuring.

### Phase 4: Correlate Part 2 Mutations with Part 1 & Queries
* Pair `createWatchlist` and `createCognitiveSearch` with the `searchMedia` / `searchMentions` queries from Part 1.
* Pair `createExportRequest` with the asset download URLs.
* Pair `createOpenIdProvider` with `loginConfiguration` queries from Part 1.
