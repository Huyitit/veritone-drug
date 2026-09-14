# Architecture & Domain Report: `mutations_part3.html`

## Executive Context
[mutations_part3.html](file:///home/huycao/Coding/Examples/mutations_part3.html) (items 127–190, 64 operations) represents the **Infrastructure Orchestration, Ingestion Gateways, Workflow Runtime, and Enterprise Security Governance** tier of the Veritone aiWARE architecture.

While Part 1 focused on **data primitives** and Part 2 on **services & collaboration**, Part 3 governs the underlying distributed compute engine, hardware/stream ingestion, visual low-code workflow engine (aiWARE Automate), syndication destinations, and fine-grained ACL auditing.

---

## 1. Main Topics Breakdown

The 64 operations in Part 3 group into **8 high-level architectural domains**:

```
                              ┌────────────────────────────────────────────────────────┐
                              │            Infrastructure & Execution Topology         │
                              │        - Clusters, Cluster Nodes, Execution Locations  │
                              └───────────────────────────┬────────────────────────────┘
                                                          │
          ┌───────────────────────────────┬───────────────┴───────────────┬───────────────────────────────┐
          ▼                               ▼                               ▼                               ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│ Ingestion Engine  │           │ Scheduling & DAGs │           │ Workflow Runtime  │           │ Projects & Batch  │
│ - IngestSlugs     │           │ - ScheduledJobs   │           │ (Automate Flow)   │           │ - Projects        │
│ - Sources & Types │           │ - JobTemplates    │           │ - Flow Revisions  │           │ - Deliverables    │
│ - ExtCredentials  │           │ - DAGTemplates    │           │ - AlwaysUpFlows   │           │ - TDOBatch        │
└─────────┬─────────┘           └─────────┬─────────┘           └─────────┬─────────┘           └─────────┬─────────┘
          │                               │                               │                               │
          └───────────────────────────────┴───────────────┬───────────────┴───────────────────────────────┘
                                                          ▼
                                        ┌───────────────────────────────────┐
                                        │ Governance, Syndication & Audit   │
                                        │ - Destinations & Vendor Profiles  │
                                        │ - Fine-grained ACLs & Perm Audits │
                                        │ - Instance Audit Logs & Exports   │
                                        └───────────────────────────────────┘
```

### Domain 1: Ingestion Gateway, Sources & Connectors
* **Operations:** `ingestSlug`, `ingestSlugs`, `source`, `sources`, `sourceType`, `sourceTypes`, `sourceTypeCategories`, `sourceTypeCategory`, `externalCredential`, `externalCredentials`
* **Architectural Purpose:** 
  * **Source Connectors:** Abstracts hardware inputs, live RTMP/HLS streams, FTP dropboxes, and cloud connectors.
  * **Ingest Slugs:** High-reliability state tracking for ingestion deduplication and ingest lifecycle status.
  * **External Credentials:** Vault for storing 3rd-party OAuth tokens, S3 keys, or credentials to pull external media.

### Domain 2: Distributed Infrastructure, Clusters & Compute Nodes
* **Operations:** `cluster`, `clusters`, `clusterNode`, `clusterNodes`, `clusterTags`, `executionLocation`, `executionLocations`
* **Architectural Purpose:** Infrastructure topologies for aiWARE engine execution. Controls Kubernetes/Docker worker clusters, physical/virtual compute nodes, execution locations (hybrid cloud: AWS/Azure vs. on-prem edge appliances), and affinity node-tagging.

### Domain 3: Job Scheduling, DAG Pipelines & Engine Configurations
* **Operations:** `scheduledJob`, `scheduledJobs`, `jobTemplate`, `jobTemplates`, `taskTemplate`, `tasks`, `dagTemplate`, `dagTemplates`, `engineConfiguration`, `engineConfigurations`
* **Architectural Purpose:** Declarative pipeline orchestrator. Manages cron/timer schedules (`scheduledJobs`), reusable job/task blueprints (`jobTemplate`, `taskTemplate`), DAG dependency graphs (`dagTemplate`), and parameter configurations for cognitive engines.

### Domain 4: Workflow Engine & Flow Runtime (aiWARE Automate / Node-RED)
* **Operations:** `flows`, `flow`, `flowTemplates`, `flowRevisions`, `flowRevision`, `flowExecutions`, `flowExecution`, `workflowMetric`, `dailyTaskMetrics`, `workflowRuntime`, `workflowRuntimeStorageData`, `alwaysUpFlows`, `alwaysUpFlow`
* **Architectural Purpose:** The visual, low-code event-driven workflow engine (aiWARE Automate). Supports versioned flow revisions (`flowRevisions`), execution history debugging (`flowExecutions`), long-running daemonized services (`alwaysUpFlows`), and direct inspection of stateful execution memory (`workflowRuntimeStorageData`).

### Domain 5: Media Production Projects & Batch Processing
* **Operations:** `processingProject`, `processingProjects`, `processingDeliverable`, `processingDeliverables`, `TDOBatch`, `TDOBatchProcesses`
* **Architectural Purpose:** Business-level media production management. Groups related media into projects with deliverables (subtitles, translated dubs, compliance cuts) and orchestrates mass operations across hundreds of TDOs simultaneously via `TDOBatch`.

### Domain 6: Content Distribution & Social Syndication (Destinations)
* **Operations:** `destinations`, `destination`, `destinationVendorProfile`, `destinationTypes`, `destinationType`
* **Architectural Purpose:** Outbound publishing pipeline. Manages multi-channel distribution endpoints (e.g., YouTube, Facebook, Twitter, Ayrshare, S3/FTP endpoints) to push deliverables directly from the processing pipeline.

### Domain 7: Fine-Grained ACLs & Authorization Auditing
* **Operations:** `authGroups`, `authGroup`, `authPermissionSets`, `authPermissionSet`, `getACLForResources`, `hasPermissions`, `resourcePermissionsAudit`, `applicationRoles`, `applicationRole`
* **Architectural Purpose:** Advanced resource-level Access Control Lists (ACLs). Whereas Part 1 handled coarse tenant-level IAM, this subsystem handles exact object-level permissions (`getACLForResources`, `hasPermissions`), permission sets, and security compliance audits (`resourcePermissionsAudit`).

### Domain 8: Enterprise Compliance Auditing & Log Exports
* **Operations:** `instanceAuditLogConfig`, `instanceAuditLog`, `auditLogExportRequest`, `auditLogExportRequestForOrg`
* **Architectural Purpose:** SOC-2 / enterprise compliance tracking. Queries security and operational audit logs across the entire instance/organization and provisions asynchronous background exports (`auditLogExportRequest`).

---

## 2. Complete Trilogy Architectural Synthesis (Parts 1, 2, & 3)

With all three parts analyzed, the complete architecture of the original `mutations.html` (190 operations) forms the full **Veritone aiWARE GraphQL Query Surface**:

| Layer | File | Primary Focus | Key Abstractions |
| :--- | :--- | :--- | :--- |
| **Layer 1: Primitives & Core Data** | [mutations_part1.html](file:///home/huycao/Coding/Examples/mutations_part1.html) | Foundational Entities | Tenants (`Organization`), Users, TDOs, Assets, S3 Signed URLs, AI Engines & Builds |
| **Layer 2: Services & Intelligence** | [mutations_part2.html](file:///home/huycao/Coding/Examples/mutations_part2.html) | Collaboration & Eventing | Collections, Watchlists, Mentions, Cognitive Search, Event Bus/Webhooks, Datasets, OIDC SSO |
| **Layer 3: Infrastructure & Governance** | [mutations_part3.html](file:///home/huycao/Coding/Examples/mutations_part3.html) | Orchestration & Enterprise Controls | Ingestion Sources, Compute Clusters/Nodes, Automate Flows & Revisions, Destinations, ACLs & Audit Logs |

### Key Insight for System Integration
The original file is the complete read/query interface for aiWARE. To build a robust client or integration:
1. **Ingest & Execute:** Use **Part 3** (`sources`, `ingestSlugs`, `clusters`, `flows`) to feed media into distributed compute nodes.
2. **Track & Query:** Use **Part 1** (`temporalDataObjects`, `assets`, `jobs`) to monitor execution.
3. **Analyze & React:** Use **Part 2** (`watchlists`, `cognitiveSearch`, `eventSubscriptions`) to retrieve AI insights and trigger external downstream systems.