# GraphQL API — Topic Overview

**Audience**: this document is written for someone new to `core-graphql-server` who needs
a map of the whole public schema (`schema/schema.graphql`, ~26k lines, ~130 top-level
queries and ~270 top-level mutations). It complements [`graphql.md`](graphql.md), which
teaches GraphQL mechanics and how to query this API; this document explains **what exists**
and **why**, topic by topic, in plain language. See
[`graphql-topic-relationships.md`](graphql-topic-relationships.md) for how the topics
connect to each other end-to-end.

Every topic section below follows the same shape:

- **What it is** — a plain-English explanation, as if explaining it to a new hire
- **Why it exists** — the product/business reason this concept exists as its own topic
- **Key types**, **Key queries**, **Key mutations** — the actual schema names to search for
- **Good to know** — gotchas, naming quirks, or things that trip up newcomers

> The schema is assembled from several modules (see `schema/config.json`):
> `modules/core`, `modules/v3DataModel`, `modules/workflow`, `modules/rbacAuth`,
> `modules/batchActionsAPI`, `modules/instanceAuditLog`. Topics below group by *business
> concept*, not by module — most concepts (jobs, engines, clusters) span module boundaries.
> Field-level source of truth is always `schema/schema.graphql`, plus
> `modules/v3DataModel/v3DataModel.graphql` for `Cluster`/`Library`/`Entity`, which are
> defined there rather than in the main file.

---

## 1. Recordings & Media (TDOs, Assets, and uploading)

**What it is**: the core content model. A `TemporalDataObject` (**TDO**) is a record for one
piece of media — a video, an audio file, a document, even a live stream — anchored to a
time range (`startDateTime`/`stopDateTime`). A TDO is a metadata shell; the actual bytes and
derived data (thumbnails, transcripts, detections, cognitive-engine output) live as `Asset`
records attached to it via `containerId`.

**Why it exists**: everything else in the platform — jobs, engines, mentions, folders,
libraries — ultimately operates on or produces a TDO/Asset. If you're new, this is the
first topic worth understanding deeply, because most other topics reference it.

- **Key types**: `TemporalDataObject`, `Asset`, `AssetFileData`, `AssetSourceData`
- **Key queries**: `temporalDataObjects`, `temporalDataObject`, `asset`, `assets`
- **Key mutations**: `createTDO`, `createTDOWithAsset` (create both in one call — the
  common case for ingesting new media), `updateTDO`, `deleteTDO`, `cleanupTDO`,
  `createAsset`, `updateAsset`, `deleteAsset`, `addMediaSegment(s)`
- **Uploading media**: raw file bytes don't travel through the GraphQL mutation itself.
  Instead you request a pre-signed URL (`getSignedWritableUrl`,
  `getSignedWritableAssetUrl`, `getSignedWritableUrls` for batches), `PUT` the file bytes
  directly to that URL (usually S3), then create/point an `Asset` at it. For very large
  files, `initiateMultipartUpload` / `completeMultipartUpload` / `cancelMultipartUpload`
  do the same thing in chunks. `getUploadStatus` lets a client poll whether an
  upload finished processing.
- **Good to know**: `structuredData` (query) and `createStructuredData` (mutation, §8)
  are the mechanism for attaching arbitrary schema-validated JSON to a TDO/organization
  when a plain `Asset` isn't the right shape.

## 2. Media Cloning (Widgets & Clone Requests)

**What it is**: two smaller, easy-to-miss features that live alongside the media model.
A **Clone Request** copies TDOs (and optionally their assets/jobs) from one application to
another — e.g. duplicating demo content into a new customer's application. A **Widget** is
an embeddable, styled view of a `Collection` of mentions (for embedding a branded results
feed on a customer's own website).

- **Key types**: `CloneRequest`, `Widget`
- **Key queries**: `cloneRequests`, `widget`
- **Key mutations**: `requestClone`, `refreshClone`, `cloneRequestCancel`, `createWidget`,
  `updateWidget`
- **Good to know**: `Widget` is deliberately `@noAuth` on read — it's meant to be embedded
  in a public web page, so don't assume every query in the schema requires a token.

## 3. Jobs & Tasks (processing execution)

**What it is**: how work actually gets done. A `Job` is a unit of processing work aimed at
a `target` TDO; a `Job` contains one or more `Task`s, and each `Task` is "run this one
`Engine` against this one target." Task output typically comes back as new `Asset`s on the
TDO (transcripts, face detections, etc.).

**Why it exists**: this is the execution/orchestration layer that sits between "I have some
media" (§1) and "I have a capability that can process media" (§4, Engines). If someone says
"my transcription didn't run" or "why is this job stuck," this is the topic to look at.

- **Key types**: `Job`, `Task`, `TaskLog`, `Route`, `JobActionAuditList`
- **Key queries**: `jobs`, `job`, `task`, `engineResults` (fetch an engine's raw output for
  a task), `taskReplacementEngines` (which alternate engines can substitute for a failed
  one on a task)
- **Key mutations**: `createJob`, `cancelJob`, `retryJob`, `updateJobs`,
  `launchSingleEngineJob` (shortcut for the common single-engine case),
  `launchDAGTemplate` (launch a saved multi-step template, see §15),
  `addTasksToJobs`, `updateTask`, `appendWarningToTask`, `createTaskLog`,
  `uploadEngineResult` / `validateEngineOutput` (used by engines themselves to report
  results back), `addTaskReplacementEngine` / `removeTaskReplacementEngine`
- **Good to know**: `Task.parentTaskId` / `childTaskIds` model dependency chains (a DAG),
  used when one task's output feeds another (e.g. transcribe, then translate). `Job`/`Task`
  both take an optional `clusterId` — see §5.

## 4. Engines & Builds (the processing catalog)

**What it is**: an `Engine` is a registered processing capability — transcription, face
detection, OCR, a customer's own custom model, etc. Each `Engine` has one or more `Build`s
(versioned, deployable artifacts, e.g. a Docker image), and belongs to an `EngineCategory`
(what it does, e.g. "Transcription") and `EngineClass` (how it runs, e.g. streaming vs.
batch).

**Why it exists**: this is Veritone's "app store" of processing capability. Anyone can
publish an engine; organizations choose which ones they're willing to run (see whitelist/
blacklist below).

- **Key types**: `Engine`, `Build`, `EngineCategory`, `EngineClass`, `EngineDependency`,
  `EngineField`, `EngineOverview`
- **Key queries**: `engines`, `engine`, `engineBuild`, `recentBuilds`, `engineOverview`
  (dashboard-style counts, e.g. how many builds are `ready`), `engineCategories`,
  `engineCategory`, `engineClasses`, `engineClass`
- **Key mutations**: `createEngine`, `updateEngine`, `deleteEngine`, `createEngineBuild`,
  `updateEngineBuild`, `deleteEngineBuild`, `engineWorkflow` (drive an engine through its
  approval/publish state machine — see `EngineStateAction`)
- **Good to know**: an `Organization` can restrict which engines it will run via
  `addToEngineWhitelist` / `addToEngineBlacklist`; a `Cluster` can further restrict via
  `Cluster.allowedEngines` (§5). Two layers of restriction can both apply.

## 5. Clusters (where processing runs)

**What it is**: a `Cluster` is a pool of compute (cloud or on-prem/"edge") where Jobs/Tasks
actually execute. Every organization has a `defaultCluster`; a `Job`/`Task` can pin to a
specific `clusterId` instead. Clusters are made of individual `ClusterNode`s (the actual
machines/containers), and can be shared to other organizations as a `ClusterCollaborator`.

**Why it exists**: not all processing should — or can — run in Veritone's shared cloud;
some customers run their own edge hardware. Cluster is the abstraction that lets a Job be
routed to the right compute.

- **Key types**: `Cluster`, `ClusterNode`, `ClusterCollaborator`, `ClusterType`,
  `ClusterPermission`
- **Key queries**: `Organization.defaultCluster`, `Cluster.jobs` (jobs currently on this
  cluster), `Cluster.nodes`, `Cluster.collaborators`
- **Key mutations**: cluster/node creation, pause/unpause, and collaborator management
  live in `modules/v3DataModel` (e.g. `PauseCluster`/`UnpauseCluster` inputs,
  `CreateClusterNode`/`UpdateClusterNode`, `CreateClusterCollaborator`)
- **Good to know**: `Cluster`, `ClusterNode`, and `ClusterCollaborator` are defined in
  `modules/v3DataModel/v3DataModel.graphql`, **not** `schema/schema.graphql` — if you grep
  the main schema file for `type Cluster` and find nothing, that's why.

## 6. Applications & Organizations (tenancy)

**What it is**: an `Organization` is the top-level tenant (a customer). An `Application` is
an authorization + branding construct that lives inside (or is shared to) an organization —
most content queries accept either an `organizationId` or an `applicationId`
interchangeably, because "an application ID maps directly to organization ID" per the
schema's own docs. Applications also carry UI/branding config (`ApplicationHeaderbar`,
icons), viewer plugins (`ApplicationViewer`, for rendering custom content types), and
right-click UI extensions (`ContextMenuExtension`).

**Why it exists**: this is the tenancy and branding boundary. When debugging "why can't
this user see that TDO," the answer is almost always about organization/application scope.

- **Key types**: `Organization`, `Application`, `ApplicationConfig`,
  `ApplicationConfigDefinition`, `ApplicationHeaderbar`, `ApplicationComponent`,
  `ApplicationViewer`, `ContextMenuExtension`, `PlatformVersion`, `StaticAppConfig`,
  `IntegrationConfig`
- **Key queries**: `organizations`, `organization`, `myOrganizations`, `applications`,
  `application`, `applicationHeaderbar`, `applicationConfig`,
  `applicationConfigDefinition`, `applicationViewers`, `staticAppConfig` (front-end
  bootstrap config — API roots, login URL, etc., fetched once on app load),
  `platformInfo`
- **Key mutations**: `createOrganization`, `updateOrganization`,
  `createApplication`, `updateApplication`, `deleteApplication`,
  `applicationAddToOrg` / `applicationRemoveFromOrg` (share an app to another org
  without changing ownership), `fileApplication`/`unfileApplication`,
  `applicationConfigSet`/`applicationConfigDelete`, `applicationWorkflow` (state machine,
  like `engineWorkflow`), `createApplicationViewer`/`createApplicationViewerBuild`,
  `createContextMenuExtension`/`updateContextMenuExtension`/`deleteContextMenuExtension`/
  `bulkDeleteContextMenuExtensions`, `setOrganizationIntegrationConfig`/
  `deleteOrganizationIntegrationConfig` (per-org config for third-party integrations),
  `addPlatformVersion`/`setCurrentPlatformVersion`/`setPlatformProperties` (on-prem/
  private-cloud instance version management)
- **Good to know**: `Application.organizationId` (current owner) and
  `Application.ownerOrganizationId` (original creator) can differ once an app is shared.

## 7. Identity, Access & RBAC

**What it is**: `User`s authenticate and belong to an `Organization`; `Role`/`Permission`
define what a user or application may do; `Token`/`ApiToken` are the bearer credentials
presented on requests. `OpenIdProvider` / `InstanceLoginConfiguration` /
`RegistrationConfiguration` configure SSO and self-registration per organization/instance.

**Why it exists**: authorization is enforced everywhere in this schema (see the `@scopes`,
`@auth`, `@requireAuthRole` directives on nearly every field) — this topic is the source of
truth for who a caller is and what they're allowed to touch.

- **Key types**: `User`, `Group`, `Role`, `Permission`, `Token`, `ApiToken`,
  `BasicUserInfo`, `MFAInfo`, `UserSetting`, `OpenIdProvider`, `LoginConfiguration`,
  `InstanceLoginConfiguration`, `RegistrationConfiguration`, `OrganizationInvite`
- **Key queries**: `me` (the canonical "who am I / what can I do" query — the best
  starting point for a new engineer exploring the schema), `basicUserInfo` (a lighter,
  widely-embeddable version of `User`, used e.g. as `Asset.createdBy`), `users`, `user`,
  `groups`, `permissions`, `myRights`, `tokens`, `apiTokens`, `getUserSettingDefinitions`/
  `getUserSettings`, `openIdProviders`/`openIdProvider`, `loginConfiguration`,
  `instanceLoginConfigurations`, `registrationConfiguration`/`registrationConfigurationInfo`
- **Key mutations**: `createUser`, `updateUser`, `updateUserRoles`, `deleteUser`,
  `updateUserStatus`, `addUserToOrganization`/`removeUserFromOrganization`,
  `switchUserToOrganization`/`setUserDefaultOrganization` (for users in multiple orgs),
  `userLogin`, `userLogout`, `refreshToken`, `extendToken`, `validateToken`,
  `createPasswordUpdateRequest`/`createPasswordResetRequest`/`changePassword`/
  `getCurrentUserPasswordToken`, `updateCurrentUser`, `createUserSettingDefinition`/
  `updateUserSetting`, `apiTokenCreate`/`apiTokenUpdate`, `createOpenIdProvider`/
  `updateOpenIdProvider`/`enableOpenIdProviderForOrg`/`disableOpenIdProviderForOrg`,
  `createOrganizationInvite`/`updateOrganizationInvite`/`deleteOrganizationInvite`,
  `getEngineJWT`/`getSourceJWT`/`getApplicationJWT`/`verifyJWT` (specialized short-lived
  tokens for engines/sources/apps rather than end users)
- **Good to know**: almost every resource type in the schema (`TemporalDataObject`,
  `Folder`, `Job`, …) declares its own `@requireAuthRole(resourceType: ...)` — access
  control is enforced **per object**, not just per organization membership. Don't assume
  "user is in the org" is sufficient to explain access; check the specific resource's auth
  directive.

## 8. Libraries & Entities (recognition reference data)

**What it is**: a `Library` is a curated collection of `Entity` records (people, objects,
logos, etc.) used by recognition/matching engines (face, voice, logo, etc.). Each `Entity`
carries one or more `EntityIdentifier`s — the actual biometric/matching template — of a
given `EntityIdentifierType`. A `LibraryEngineModel` is a trained model artifact built from
a library's entities that an `Engine` actually loads at runtime.

**Why it exists**: this is *reference data*, distinct from the TDO/Asset content being
scanned (§1). Think of it as "who/what are we looking for" vs. "here's the media to look in."

- **Key types**: `Library`, `LibraryType`, `Entity`, `EntityIdentifier`,
  `EntityIdentifierType`, `LibraryEngineModel`, `LibraryConfiguration`,
  `LibraryCollaborator`, `Dataset`
- **Key queries**: `libraries`, `library`, `libraryTypes`, `libraryType`, `entities`,
  `entity`, `entityIdentifierTypes`, `entityIdentifierType`, `libraryEngineModel`,
  `libraryConfiguration`, `matchEntityTags` (given tags/hints, find likely matching
  entities — used by review UIs), `datasets`, `dataset`, `datasetDataQuery`
- **Key mutations**: `createLibrary`, `updateLibrary`, `deleteLibrary`, `publishLibrary`
  (promote a library so engines can start using it), `createEntity`, `updateEntity`,
  `deleteEntity`, `createEntityIdentifier`, `updateEntityIdentifier`,
  `deleteEntityIdentifier`, `createEntityIdentifierType`, `updateEntityIdentifierType`,
  `createLibraryType`, `updateLibraryType`, `createLibraryEngineModel`,
  `updateLibraryEngineModel`, `deleteLibraryEngineModel`, `createLibraryCollaborator`/
  `updateLibraryCollaborator`/`deleteLibraryCollaborator` (share a library across orgs,
  same pattern as `ClusterCollaborator`), `createLibraryConfiguration`/
  `updateLibraryConfiguration`/`deleteLibraryConfiguration`, `addLibraryDataset`/
  `deleteLibraryDataset`, `createDataset`, `createDatasetSchema`, `updateDataset`,
  `deleteDataset`, `datasetDataOperation`

## 9. Structured Data (Schemas & Data Registries)

**What it is**: a general-purpose, schema-validated JSON storage mechanism, independent of
media. A `DataRegistry` (scoped to an organization) owns one or more versioned `Schema`s
(`majorVersion`/`minorVersion`, with one marked `publishedSchema`); a
`StructuredDataObject` is an instance of data that validates against a specific schema
version.

**Why it exists**: not everything is media. When a customer needs to store arbitrary
structured metadata (e.g. an external system's records, custom form data) with real schema
validation, this is the mechanism, rather than stuffing it into `Asset.jsondata` unchecked.

- **Key types**: `DataRegistry`, `Schema`, `StructuredDataObject`
- **Key queries**: `dataRegistries`, `dataRegistry`, `schemas`, `schema`,
  `schemaProperties`, `structuredData`, `structuredDataObject`, `structuredDataObjects`
- **Key mutations**: `createDataRegistry`, `updateDataRegistry`, `createSchema`,
  `upsertSchemaDraft`, `updateSchemaState` (draft → published lifecycle),
  `createStructuredData`, `updateStructuredData`, `deleteStructuredData`

## 10. Folders, Collections & Sharing

**What it is**: two different ways of organizing content, plus the sharing mechanisms
layered on both. A `Folder` is a hierarchical container (like a filesystem) for TDOs and
other folders, scoped to an organization/user. A `Collection` groups `Mention`s (§11) for
review/curation and can be shared externally as a `SharedCollection`, or embedded via a
`Widget` (§2). `MediaShare` is a one-off share link for a specific piece of media.

**Why it exists**: TDOs need a "where do I file this" answer (folders), and separately,
review teams need a "here's a curated set of results to look at" answer (collections) —
these are deliberately different concepts even though both feel like "grouping."

- **Key types**: `Folder`, `FolderOverview`, `FolderSummaryDetail`,
  `FolderContentTemplate`, `Collection`, `CollectionMention`, `MediaShare`,
  `SharedCollection`
- **Key queries**: `rootFolders`, `folder`, `folderOverview`, `folderSummaryDetails`,
  `sharedFolders`, `collections`, `collection`, `collectionMention`, `collectionMentions`,
  `mediaShare`, `sharedCollection`, `sharedCollectionHistory`
- **Key mutations**: `createFolder`, `updateFolder`, `moveFolder`/`moveFolders`,
  `deleteFolder`, `shareFolder`, `createRootFolders`,
  `fileTemporalDataObject`/`unfileTemporalDataObject`/`moveTemporalDataObject` (file a TDO
  into/out of a folder), `createFolderContentTemplate`/`updateFolderContentTemplate`/
  `deleteFolderContentTemplate` (note: older, misspelled `...Tempate` variants of these
  three also exist for backward compatibility — prefer the correctly-spelled ones),
  `createCollection`, `updateCollection`, `deleteCollection`, `shareCollection`,
  `updateSharedCollectionMentions`/`updateSharedCollectionHistory`,
  `createCollectionMention(s)`, `updateCollectionMention`, `deleteCollectionMention`,
  `shareMentionFromCollection`/`shareMention`/`shareMentionInBulk`, `createMediaShare`

## 11. Mentions & Monitoring (Watchlists & Search)

**What it is**: how the platform surfaces "we found something interesting." A `Mention` is
a single hit — a reference to a `temporalDataObject` where a match occurred, tied to the
`Watchlist` that produced it. A `Watchlist` defines an ongoing, standing search (by brand,
advertiser, keyword, source, etc.). `CognitiveSearch` and `SavedSearch` are more ad-hoc /
replayable ways to define a search rather than a permanent watchlist. `Creative` groups
mentions by the underlying ad/creative asset (used in ad-verification use cases).

**Why it exists**: media-monitoring customers don't want to manually browse every TDO —
they define what they're looking for once (a `Watchlist`) and the platform notifies them
via `Mention`s as jobs process new media.

- **Key types**: `Mention`, `Watchlist`, `CognitiveSearch`, `SavedSearch`, `Creative`
- **Key queries**: `mention`, `mentions`, `sharedMention`, `searchMentions`, `searchMedia`,
  `mentionStatusOptions`, `watchlists`, `watchlist`, `cognitiveSearch`, `savedSearches`,
  `creative`
- **Key mutations**: `createMention`, `updateMention`, `updateMentions`, `createMentions`,
  `createMentionComment`/`updateMentionComment`/`deleteMentionComment`,
  `createMentionRating`/`updateMentionRating`/`deleteMentionRating`,
  `createMentionExportRequest`/`updateMentionExportRequest`, `createWatchlist`,
  `updateWatchlist`, `deleteWatchlist`, `bulkCreateWatchlist`/`bulkUpdateWatchlist`,
  `fileWatchlist`/`unfileWatchlist`, `createCognitiveSearch`/`updateCognitiveSearch`/
  `deleteCognitiveSearch`, `createSavedSearch`/`deleteSavedSearch`/`replaceSavedSearch`,
  `createCreative`/`updateCreative`/`deleteCreative`

## 12. Scheduled Subscriptions (recurring reports/alerts)

**What it is**: **not** GraphQL's real-time subscription protocol — this is a distinct
domain type, `Subscription`, representing a recurring notification (e.g. "email me a daily
digest of new mentions on this watchlist"), with a `frequency`, `scheduledTime`, and
`contact` (who receives it).

**Why it exists**: it's easy to confuse this with the GraphQL *subscription* operation type
because of the shared name — new engineers should know these are unrelated. This schema's
subscriptions are periodic report deliveries, configured as ordinary data via mutations.

- **Key types**: `Subscription`, `SubscriptionObjectType`, `SubscriptionFrequency`,
  `SubscriptionContact`
- **Key queries**: `subscription`
- **Key mutations**: `createSubscription`, `updateSubscription`, `deleteSubscription`

## 13. Events, Triggers & Notifications

**What it is**: the cross-cutting "glue" layer. An `Event` is a typed occurrence (e.g. "job
completed") scoped to an `application`; an `EventSubscription` lets a consumer listen for
those events; an `EventCustomRule` filters which occurrences actually fire; a `Trigger`
routes a matched event to a target (typically a webhook). `NotificationMailbox` /
`NotificationTemplate` / `NotificationAction` are the user-facing counterpart — in-app or
emailed notifications for a specific user (e.g. "your job finished").

**Why it exists**: almost every other topic can be a *source* (something happened) or a
*sink* (something should react) for an event — this topic doesn't own primary data, it
reacts to and routes everyone else's.

- **Key types**: `Event`, `EventSubscription`, `EventCustomRule`, `EventActionTemplate`,
  `Trigger`, `NotificationMailbox`, `NotificationTemplate`, `NotificationAction`
- **Key queries**: `event`, `events`, `eventSubscriptions`, `eventSubscription`,
  `eventCustomRule`, `eventCustomRules`, `eventActionTemplate`, `eventActionTemplates`,
  `trigger`, `triggers`, `notificationMailboxes`, `notificationTemplates`,
  `notificationActions`
- **Key mutations**: `createEvent`, `updateEvent`, `emitEvent`, `emitSystemEvent`,
  `emitAuditEvent`, `subscribeEvent`/`unsubscribeEvent`, `createEventActionTemplate`/
  `updateEventActionTemplate`, `createEventCustomRule`/`updateEventCustomRule`/
  `deleteEventCustomRule`, `createTriggers`/`deleteTrigger`,
  `removeApplicationEventEndpoint`/`updateApplicationEventEndpoint`,
  `notificationMailboxCreate`/`notificationMailboxPause`/`notificationMailboxUnpause`/
  `notificationMailboxDelete`, `notificationPost`, `addNotificationTemplate`/
  `removeNotificationTemplate`, `addNotificationAction`/`removeNotificationAction`,
  `setNotificationFlag`, `markAllNotificationsRead`/`markAllNotificationsSeen`

## 14. Automation & Workflow Templates

**What it is**: reusable, saved definitions of multi-step work. A `ProcessTemplate` stores
a `taskList` (effectively a saved DAG shape) that job creation can instantiate against a
new target via `launchDAGTemplate` (§3). `createAutomateFlow` and `automatePackage` connect
into Veritone's separate low-code "Automate" (Node-RED-based) product for building
cross-service workflows beyond simple engine DAGs.

**Why it exists**: customers running the same multi-engine pipeline repeatedly shouldn't
have to re-specify it every time — this topic is where that shape is saved and replayed.

- **Key types**: `ProcessTemplate`
- **Key queries**: `processTemplates`, `processTemplate`, `automatePackage`
- **Key mutations**: `createProcessTemplate`, `updateProcessTemplate`,
  `deleteProcessTemplate`, `createAutomateFlow`

## 15. Dashboards

**What it is**: `CustomDashboard` stores arbitrary dashboard configuration (`data: JSONData`)
per application, so a front-end can persist a user's custom widget/report layout.

**Why it exists**: a small, self-contained topic — mentioned here mainly so a newcomer
doesn't miss it when scanning the schema for "where would UI layout preferences live?"

- **Key types**: `CustomDashboard`
- **Key queries**: `customDashboards`, `customDashboard`
- **Key mutations**: `createCustomDashboard`, `updateCustomDashboard`,
  `deleteCustomDashboard`

## 16. Email & Communications

**What it is**: platform-level email sending and templating, used for both transactional
mail (password resets, invites) and customer-configurable templates.
`PlatformEmailProvider` lets an instance/organization configure its own SMTP/email
provider instead of Veritone's default.

- **Key types**: `EmailTemplate`, `PlatformEmailProvider`
- **Key queries**: `emailTemplateGet`, `platformEmailProvider`
- **Key mutations**: `sendEmail`, `emailTemplateCreate`, `emailTemplateUpdate`,
  `emailTemplateDelete`, `addPlatformEmailProvider`

## 17. Packages & API Tokens (developer distribution)

**What it is**: a `Package` bundles resources (e.g. engines, automate flows) for
distribution/installation, with its own grants and resource list. This is distinct from
`ApiToken` (§7, listed here again because it's the credential a package's automated
integration typically uses).

- **Key types**: `Package`
- **Key queries**: `packages`
- **Key mutations**: `packageCreate`, `packageUpdate`, `packageDelete`,
  `packageUpdateResources`, `packageUpdateGrants`

## 18. Platform Operations (audit, ingest, managed processing)

**What it is**: cross-cutting operational tooling, mostly used by internal/managed-services
workflows rather than typical customer integrations. `AuditLog` records who did what across
the whole platform. `IngestSlug` / `ProcessingProject` / `ProcessingDeliverable` model
managed-ingestion pipelines (a professional-services team ingesting and processing a
customer's media on their behalf, tracked as a project with deliverables).
`ExportRequest` handles bulk data export.

- **Key types**: `AuditLog`, `ExportRequest`, `IngestSlug`, `ProcessingProject`,
  `ProcessingDeliverable`, `PlatformInfo`
- **Key queries**: `auditLog`, `auditEvents`, `exportRequests`, `exportRequest`,
  `ingestSlug`, `ingestSlugs`, `processingProject`, `processingProjects`,
  `processingDeliverable`, `processingDeliverables`, `platformInfo`, `graphqlServiceInfo`
  (server version/health info), `timeZones` (a plain utility lookup, listed here for lack
  of a better home)
- **Key mutations**: `createExportRequest`, `updateExportRequest`, `ingestSlugsCreate`,
  `ingestSlugUpdate`, `ingestSlugUpdateStatus`, `ingestSlugsDelete`,
  `ingestSlugsDeleteForSource`, `processingProjectCreate`, `processingProjectDelete`,
  `processingDeliverableCreate`, `processingDeliverableCancel`

## 19. Subscription & Billing

**What it is**: billing/usage information, mostly exposed as fields *on* `Organization`
and `Application` rather than standalone top-level queries, tracking plan, spend, and
processing usage over time.

- **Key types/fields**: `Organization.billingPlanId`, `Organization.remainingBudget`,
  `Organization.pendingCost`, `Organization.monthlyProcessingHoursTotal`,
  `Organization.monthlyProcessingBytesTotal`, `Organization.currentStorageBytes`,
  `Application.billingPlanId`, `Application.billingDirty`
- **Key queries**: `getUsageByTaskType` (usage/cost breakdown by task type — the query
  behind most billing/usage dashboards)
- **Key mutations**: `updateOrganizationBilling`, `updateApplicationBillingPlanId`,
  `updateApplicationBillingDirty`

---

## Glossary (fast lookups for new members)

| Term | One-line meaning |
|---|---|
| TDO | `TemporalDataObject` — a piece of media's metadata record |
| Asset | A file or data blob attached to a TDO (source media, engine output, etc.) |
| Job / Task | A unit of processing work / one engine run within that job |
| Engine / Build | A processing capability / one versioned deployable of it |
| Cluster | Where a job's tasks actually execute (compute pool) |
| Application | Tenancy + branding construct scoped to (or shared with) an Organization |
| Mention | A single "we found something" hit from a Watchlist |
| Library / Entity | Reference data ("who/what to look for") for recognition engines |
| Schema / StructuredDataObject | Schema-validated JSON storage, independent of media |
| `Subscription` (type) | A recurring report/alert — **not** GraphQL's subscription protocol |

## Where to look next

- For request/response shape and auth basics: [`graphql.md`](graphql.md)
- For how these topics reference one another end-to-end (e.g. Job → Engine → Cluster →
  TDO): [`graphql-topic-relationships.md`](graphql-topic-relationships.md)
- For the authoritative field-level detail (arguments, deprecations, auth directives):
  `schema/schema.graphql`, and `modules/v3DataModel/v3DataModel.graphql` for
  `Cluster`/`Library`/`Entity`
- For which Postgres tables back each topic: `knowledge/data/postgres/entities/` at the
  repo root (e.g. `job-execution.md`, `engine-catalog.md`, `libraries-and-entities.md`)
- To explore live: query `me { id name }` first (see `graphql.md`), then use GraphiQL's
  autocomplete (`<ctrl-space>`) to browse any type mentioned above
