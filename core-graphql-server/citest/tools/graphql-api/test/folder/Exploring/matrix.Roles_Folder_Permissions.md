# Role vs. Folder Permissions & Actions Traceability Matrix

> **Document Type**: Senior QA Requirements & Test Traceability Matrix (RTM)  
> **Target Domain**: Folder Service & Object-Level Permissions (OLP) / RBAC  
> **Service**: `core-graphql-server`  
> **Source Test Suites**:  
> - [`RBAC/folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) / [`RBAC/folderOlpREP.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlpREP.spec.ts) (`FO1`–`FO77`)  
> - [`folderNonOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/folderNonOlp.spec.ts) (`A1`–`A62`)  
> - [`RBAC/folderUserRbac.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderUserRbac.spec.ts)  
> - [`RBAC/folderAdminRbac.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderAdminRbac.spec.ts)  
> - [`RBAC/folderInherit.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderInherit.spec.ts)  
> - [`RBAC/folderShare.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderShare.spec.ts)  
> - [`folderMultiOrg.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/folderMultiOrg.spec.ts)  

---

## 1. Executive Summary & Matrix Legend

This Traceability Matrix maps **System Roles** (Rows) against **Folder Permissions & GraphQL API Actions** (Columns). It provides end-to-end verification traceability between user privilege levels, granular permission tokens, GraphQL operations, expected authorization responses, and automated test cases.

### Access Status Legend
| Symbol | Access Status | Meaning |
| :--- | :--- | :--- |
| ✅ | **ALLOWED** | Unrestricted execution allowed within role scope. |
| ❌ | **DENIED** | Operation rejected (`403 Unauthorized` / `PermissionDenied` / `not_allowed`). |
| 🔑 | **CONDITIONAL (ACE)** | Requires explicit Access Control Entry (`AuthACE`) binding the user's `AuthGroup` to the resource. |
| 🚫 | **SYSTEM GUARD** | Operation prohibited across all roles by system architecture rules (e.g. deleting root folders, circular parent-child moves). |
| 🛡️ | **SCOPED / OWNER** | Allowed only for resources created/owned by the user, or within the tenant boundary. |

---

## 2. Master Traceability Matrix: Roles vs. Folder Permissions & Actions

| Role in System | Initialize Root Folders (`createRootFolders`) | Query Root Folders (`rootFolders`) | Query Folder Details (`folder` / `folderBasic`) | Browse Child Folders (`childFolders`) | Create Subfolder (`createFolder`) | Update / Rename Folder (`updateFolder`) | Move Folder (`moveFolder` / `moveFolders`) | Delete Subfolder (`deleteFolder`) | Delete Root Folder (`deleteFolder` on Root) | Share Folder Cross-Org (`shareFolder`) | File Content into Folder (`createTDO`, `fileTDO`) | Unfile Content from Folder (`unfileTDO`) | Manage OLP ACEs & Groups (`createAuthGroup`, `addACEs`) | ACE Inheritance (`inheritPermissionSet`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Superadmin**<br/>*(Global / Platform Admin)* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_CREATE`<br/>*Test: Suite Bootstrap* | ✅ **ALLOWED**<br/>Global scope<br/>*Test: `setupSuperadmin`* | ✅ **ALLOWED**<br/>Cross-tenant<br/>*Test: `superadminSession`* | ✅ **ALLOWED**<br/>All levels<br/>*Test: `superadminSession`* | ✅ **ALLOWED**<br/>Any org<br/>*Test: `setupSuperadmin`* | ✅ **ALLOWED**<br/>Any org<br/>*Test: `commonHelper`* | ✅ **ALLOWED**<br/>Any org<br/>*Test: `superadminSession`* | ✅ **ALLOWED**<br/>Any org<br/>*Test: Suite Teardown* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO76.1`* | ✅ **ALLOWED**<br/>Orchestrates cross-tenant<br/>*Test: `FO33.2`, `FO44`* | ✅ **ALLOWED**<br/>Global content<br/>*Test: `superadminSession`* | ✅ **ALLOWED**<br/>Global content<br/>*Test: `superadminSession`* | ✅ **ALLOWED**<br/>System flags & config<br/>*Test: `superadminSession`* | ✅ **ALLOWED**<br/>Enforces OLP rules<br/>*Test: `folderInherit.spec.ts`* |
| **2. Org Admin (Owner / Creator)**<br/>*(Tenant Admin & Creator)* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_CREATE`<br/>*Test: `Setup`, `A1`* | ✅ **ALLOWED**<br/>Org & User roots<br/>*Test: `Setup`, `A2`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_READ`<br/>*Test: `FO1`, `A3`* | ✅ **ALLOWED**<br/>Full tree<br/>*Test: `FO1`, `A4`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_CREATE`<br/>*Test: `Setup`, `FO1`, `A5`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_UPDATE`<br/>*Test: `FO16`, `A10`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_UPDATE`<br/>*Test: `FO16`, `A20`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_DELETE`<br/>*Test: `FO72`, `A30`* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO76.1`, `A35`* | ✅ **ALLOWED**<br/>Tenant boundary<br/>*Test: `folderShare.spec.ts`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_FILE`<br/>*Test: `FO52`, `Setup`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_FILE`<br/>*Test: `FO59`* | ✅ **ALLOWED**<br/>Full OLP admin<br/>*Test: `FO6`, `FO22`, `folderAdminRbac`* | ✅ **ALLOWED**<br/>Configures inheritance<br/>*Test: `FO12`, `folderInherit`* |
| **3. Org Admin (Non-Owner)**<br/>*(Secondary Tenant Admin)* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_CREATE`<br/>*Test: `folderAdminRbac`* | ✅ **ALLOWED**<br/>Org roots<br/>*Test: `FO2`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_READ`<br/>*Test: `FO2`* | ✅ **ALLOWED**<br/>All org folders<br/>*Test: `FO2`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_CREATE`<br/>*Test: `folderAdminRbac`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_UPDATE`<br/>*Test: `FO18`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_UPDATE`<br/>*Test: `FO18`* | ✅ **ALLOWED**<br/>Admin override<br/>*Test: `folderAdminRbac`* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO76.1`* | ✅ **ALLOWED**<br/>Tenant boundary<br/>*Test: `folderAdminRbac`* | ✅ **ALLOWED**<br/>`AIWARE_FOLDER_FILE`<br/>*Test: `folderAdminRbac`* | ✅ **ALLOWED**<br/>Can unfile any org item<br/>*Test: `FO58`* | ✅ **ALLOWED**<br/>Group & ACE admin<br/>*Test: `folderAdminRbac`* | ✅ **ALLOWED**<br/>Evaluated down tree<br/>*Test: `FO2`* |
| **4. CMS Editor**<br/>*(Standard Write Role)* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Org CMS roots<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED** (Non-OLP)<br/>🔑 **CONDITIONAL** (OLP)<br/>*Test: `FO3`, `folderUserRbac`* | ✅ **ALLOWED** (Non-OLP)<br/>🔑 **CONDITIONAL** (OLP)<br/>*Test: `FO3`* | ✅ **ALLOWED**<br/>Under allowed parent<br/>*Test: `FO61`, `A5`* | 🛡️ **OWNER ONLY**<br/>Cannot edit others'<br/>*Test: `FO19.1`* | ✅ **ALLOWED**<br/>With update rights<br/>*Test: `FO19.2`, `A20`* | 🛡️ **OWNER ONLY**<br/>Cannot delete others'<br/>*Test: `FO70` (VE-16854)* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO76.1`, `FO76.2`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO33.1` (VE-16539)* | ✅ **ALLOWED** (Own)<br/>❌ **DENIED** (Others)<br/>*Test: `FO27`, `FO55`* | 🛡️ **OWNER ONLY**<br/>Cannot unfile others'<br/>*Test: `FO52`, `FO56`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Inherits from parent<br/>*Test: `FO13`, `folderInherit`* |
| **5. CMS Viewer / Regular User**<br/>*(Standard Read-Only Role)* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Org CMS roots<br/>*Test: `FO75`, `A2`* | ✅ **ALLOWED** (Non-OLP)<br/>🔑 **CONDITIONAL** (OLP)<br/>*Test: `FO3`, `A3`* | ✅ **ALLOWED** (Non-OLP)<br/>🔑 **CONDITIONAL** (OLP)<br/>*Test: `FO3`, `A4`* | ✅ **ALLOWED**<br/>Under accessible parent<br/>*Test: `FO61`* | ❌ **DENIED**<br/>Blocked on others'<br/>*Test: `FO19.1`* | ✅ **ALLOWED**<br/>Standard reparenting<br/>*Test: `FO19.2`* | ❌ **DENIED**<br/>Cannot delete admin/others<br/>*Test: `FO70` (VE-16854)* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO76.1`, `FO76.2`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO33.1` (VE-16539)* | ❌ **DENIED** (Default)<br/>🔑 **CONDITIONAL** (FO54)<br/>*Test: `FO52`, `FO54`* | 🛡️ **OWNER ONLY**<br/>Cannot unfile admin's<br/>*Test: `FO52`, `FO57`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Inherits read rights<br/>*Test: `FO13`, `folderInherit`* |
| **6. Restricted User (Default Deny)**<br/>*(Zero Roles & Stripped Groups)* | ❌ **DENIED**<br/>`not_allowed`<br/>*Test: `FO73`* | ❌ **DENIED**<br/>Zero access (`[]` / 403)<br/>*Test: `FO73`, `FO74`* | ❌ **DENIED**<br/>`No auth access`<br/>*Test: `FO5`* | ❌ **DENIED**<br/>Blocked by default<br/>*Test: `FO8`* | ❌ **DENIED**<br/>`not_allowed`<br/>*Test: `FO62`* | ❌ **DENIED**<br/>`not_allowed`<br/>*Test: `FO20` (VE-16583)* | ❌ **DENIED**<br/>`not_allowed`<br/>*Test: `FO21` (VE-16695)* | ❌ **DENIED**<br/>`not_allowed`<br/>*Test: `FO69`* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO73`, `FO76.1`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO31` (VE-16539)* | ❌ **DENIED**<br/>`No auth access`<br/>*Test: `FO28`, `FO53`* | ❌ **DENIED**<br/>`No auth access`<br/>*Test: `FO29`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ❌ **DENIED**<br/>No root ACE exists<br/>*Test: `FO5`, `FO8`* |
| **7. Restricted User + Read ACE**<br/>*(`AIWARE_FOLDER_READ` Granted)* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO73`* | ❌ **DENIED** (Org Root)<br/>✅ **ALLOWED** (Target)<br/>*Test: `FO7`, `FO73`* | ✅ **ALLOWED**<br/>On target folder<br/>*Test: `FO7`* | 🔑 **CONDITIONAL**<br/>Needs inherited ACE<br/>*Test: `FO8`, `FO14`* | ❌ **DENIED**<br/>Needs Create ACE<br/>*Test: `FO62`* | ❌ **DENIED**<br/>Needs Update ACE<br/>*Test: `FO20`* | ❌ **DENIED**<br/>Needs Update ACE<br/>*Test: `FO21`* | ❌ **DENIED**<br/>Needs Delete ACE<br/>*Test: `FO69`* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO73`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO31`* | ❌ **DENIED**<br/>Needs File ACE<br/>*Test: `FO28`* | ❌ **DENIED**<br/>Needs File ACE<br/>*Test: `FO29`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Inherits to new subfolders<br/>*Test: `FO14`, `FO11`* |
| **8. Restricted User + Update ACE**<br/>*(`AIWARE_FOLDER_UPDATE` Granted)* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO73`* | ❌ **DENIED** (Org Root)<br/>✅ **ALLOWED** (Target)<br/>*Test: `FO23`* | ✅ **ALLOWED**<br/>Target folder<br/>*Test: `FO23`* | ✅ **ALLOWED**<br/>Descendant folders<br/>*Test: `FO24`* | ❌ **DENIED**<br/>Needs Create ACE<br/>*Test: `FO62`* | ✅ **ALLOWED**<br/>Rename & Edit<br/>*Test: `FO23`, `FO24`* | ✅ **ALLOWED**<br/>Move allowed folder<br/>*Test: `FO23`* | ❌ **DENIED**<br/>Needs Delete ACE<br/>*Test: `FO69`* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO73`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO31`* | ❌ **DENIED**<br/>Needs File ACE<br/>*Test: `FO26`* | ❌ **DENIED**<br/>Needs File ACE<br/>*Test: `FO29`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Update child folder<br/>*Test: `FO24`* |
| **9. Restricted User + Full Folder ACE**<br/>*(Read + Create + Update + Delete + File)* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO73`* | ❌ **DENIED** (Org Root)<br/>✅ **ALLOWED** (Target)<br/>*Test: `FO7`* | ✅ **ALLOWED**<br/>Target folder<br/>*Test: `FO7`* | ✅ **ALLOWED**<br/>Target tree<br/>*Test: `FO14`* | ✅ **ALLOWED**<br/>Create child/grandchild<br/>*Test: `FO64`* | ✅ **ALLOWED**<br/>Rename & Edit<br/>*Test: `FO23`* | ✅ **ALLOWED**<br/>Reparent target<br/>*Test: `FO23`* | ✅ **ALLOWED**<br/>Delete target & own<br/>*Test: `FO68`, `FO72`* | 🚫 **PROHIBITED**<br/>Root protected<br/>*Test: `FO73`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `FO31`* | ✅ **ALLOWED**<br/>File items (with TDO perm)<br/>*Test: `FO55`* | 🛡️ **OWNER ONLY**<br/>Unfile own items<br/>*Test: `FO56`* | ❌ **DENIED**<br/>Admin privilege<br/>*Test: `folderUserRbac`* | ✅ **ALLOWED**<br/>Inherits full ACE tree<br/>*Test: `FO64`, `FO77`* |
| **10. Cross-Org User (Read-Shared)**<br/>*(External Org 2 with Read Access)* | ❌ **DENIED**<br/>Cannot touch Org 1 roots<br/>*Test: `FO35.1`* | ❌ **DENIED** (Org 1 Roots)<br/>✅ **ALLOWED** (Org 2 Roots)<br/>*Test: `FO35.1`* | ✅ **ALLOWED**<br/>Shared folder in Org 1<br/>*Test: `FO35.1`* | 🔑 **CONDITIONAL**<br/>Shared child folders<br/>*Test: `FO35.2` (VE-16715)* | ❌ **DENIED**<br/>Read-only shared access<br/>*Test: `FO40` (VE-16540)* | ❌ **DENIED**<br/>`PermissionDenied`<br/>*Test: `FO42`* | ❌ **DENIED**<br/>Cannot move Org 1 folder<br/>*Test: `folderShare.spec.ts`* | ❌ **DENIED**<br/>`PermissionDenied`<br/>*Test: `FO43` (VE-16403)* | 🚫 **PROHIBITED**<br/>Tenant isolation<br/>*Test: `folderMultiOrg.spec.ts`* | ❌ **DENIED**<br/>Cannot re-share Org 1 folder<br/>*Test: `folderShare.spec.ts`* | ❌ **DENIED**<br/>Read-only grant<br/>*Test: `FO40` (VE-16540)* | ❌ **DENIED**<br/>Cannot modify Org 1<br/>*Test: `folderShare.spec.ts`* | ❌ **DENIED**<br/>Tenant boundary<br/>*Test: `folderMultiOrg.spec.ts`* | 🔑 **CONDITIONAL**<br/>Inherits read to child<br/>*Test: `FO38` (VE-16715)* |
| **11. Cross-Org User (Write-Shared)**<br/>*(External Org 2 with Write Access)* | ❌ **DENIED**<br/>Cannot touch Org 1 roots<br/>*Test: `FO47`* | ❌ **DENIED** (Org 1 Roots)<br/>✅ **ALLOWED** (Org 2 Roots)<br/>*Test: `FO47`* | ✅ **ALLOWED**<br/>Shared folder in Org 1<br/>*Test: `FO35.1`* | ✅ **ALLOWED**<br/>Shared child tree<br/>*Test: `FO35.2`* | ✅ **ALLOWED**<br/>Add child under shared<br/>*Test: `FO46` (VE-16541)* | ✅ **ALLOWED**<br/>Update shared folder<br/>*Test: `FO45` (VE-16718)* | ❌ **DENIED**<br/>Cross-org reparent blocked<br/>*Test: `folderShare.spec.ts`* | 🛡️ **OWN CREATED ONLY**<br/>Cannot delete Org 1's<br/>*Test: `FO43`* | 🚫 **PROHIBITED**<br/>Tenant isolation<br/>*Test: `folderMultiOrg.spec.ts`* | ❌ **DENIED**<br/>Cannot re-share Org 1 folder<br/>*Test: `folderShare.spec.ts`* | ✅ **ALLOWED**<br/>Add Org 2 content to shared<br/>*Test: `FO47`, `FO48`* | 🛡️ **ORG 2 CONTENT ONLY**<br/>Cannot unfile Org 1's<br/>*Test: `FO49`–`FO51`* | ❌ **DENIED**<br/>Tenant boundary<br/>*Test: `folderMultiOrg.spec.ts`* | ✅ **ALLOWED**<br/>Inherits write to own child<br/>*Test: `FO46`, `FO48`* |

---

## 3. Granular Operations & Permission Mapping Details

### 3.1 Root Folder Operations
* **`createRootFolders(rootFolderType: RootFolderType!)`**:
  * **Required Token**: `AIWARE_FOLDER_CREATE` (Admin scope)
  * **Behavior**: Idempotent. Returns existing root folder GUIDs if already provisioned.
  * **Security Rule**: Restricted and Standard CMS users cannot execute root initialization.
  * **Test Coverage**: [`folderUserRootTreeObjectId.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/folderUserRootTreeObjectId.spec.ts), [`folderOlp.spec.ts:L104`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts#L104).

* **`rootFolders(type: RootFolderType)`**:
  * **Required Token**: `AIWARE_FOLDER_READ`
  * **Behavior**: Returns top-level organizational anchor folders (`CMS`, `Watchlist`, `Collection`).
  * **OLP Rule**: Restricted users with stripped groups receive empty array or `403` (`FO73`, `FO74`).

### 3.2 Folder CRUD Operations
* **`folder(id: ID!)` / `folderBasic(id: ID!)`**:
  * **Required Token**: `AIWARE_FOLDER_READ`
  * **OLP Rule**: Under OLP (`enableRBACFeature = 'enabled'`), requests without an active ACE return `No authorization access` / `Unauthorized` (`FO5`).
  * **Positive Path**: Unlocked immediately upon granting ACE with `AIWARE_FOLDER_READ` (`FO6`, `FO7`).

* **`createFolder(input: CreateFolder!)`**:
  * **Required Token**: `AIWARE_FOLDER_CREATE` on parent folder / organization.
  * **OLP Rule**: Restricted user fails (`FO62`). Succeeded once `createAuthPermissionSet` with `AIWARE_FOLDER_CREATE` is linked to parent folder via ACE (`FO63`, `FO64`).

* **`updateFolder(input: UpdateFolder!)`**:
  * **Required Token**: `AIWARE_FOLDER_UPDATE`
  * **OLP Rule**: Restricted user fails (`FO20`). CMS Viewer fails to modify folders owned by others (`FO19.1`). Succeeded for restricted user once `AIWARE_FOLDER_UPDATE` ACE is attached (`FO22`, `FO23`).

* **`deleteFolder(input: DeleteFolder!)`**:
  * **Required Token**: `AIWARE_FOLDER_DELETE`
  * **System Guard Rule**: Cannot delete Root Folders (`FO76.1`, `FO76.2`).
  * **OLP Rule**: Restricted user fails (`FO69`). CMS Viewer cannot delete folders owned by Admin (`FO70`). Succeeded for restricted user once `AIWARE_FOLDER_DELETE` ACE is attached (`FO71`, `FO72`).

### 3.3 Hierarchy & Reparenting Operations
* **`moveFolder(input: MoveFolder)` / `moveFolders(input: MoveFolders)`**:
  * **Required Token**: `AIWARE_FOLDER_UPDATE` on moving folder AND target destination folder.
  * **Anti-Loop System Guard**: Attempting to move a folder into its own child/subtree fails with `InvalidInput` / `ResourceConflict` (`FO17` — VE-16402).
  * **OLP Rule**: Restricted user fails without update ACE (`FO21` — VE-16695).

### 3.4 Cross-Organization Sharing
* **`shareFolder(input: ShareFolderInput)`**:
  * **Execution Context**: Superadmin / Org Admin.
  * **Read Sharing (`readOrganizationIds`)**: Allows target organization to view shared folder tree (`FO33.2`, `FO35.1`).
  * **Write Sharing (`writeOrganizationIds`)**: Allows target organization to update folder (`FO45`) and upload isolated content (`FO47`).
  * **Cross-Tenant Content Privacy**: Content added by Org 2 inside Org 1's shared folder is isolated and hidden from Org 1 users (`FO49`, `FO50`, `FO51`).

### 3.5 Content Filing & Permission Inheritance
* **`createTDOWithAsset` / `fileTemporalDataObject`**:
  * **Required Tokens**: `AIWARE_FOLDER_FILE` on folder AND `AIWARE_TDO_CREATE` / `AIWARE_TDO_READ` on asset.
  * **OLP Rule**: Restricted user cannot file content without explicit file/TDO rights (`FO28`, `FO53`).
* **`unfileTemporalDataObject`**:
  * **Required Tokens**: `AIWARE_FOLDER_FILE` + Asset Ownership.
  * **OLP Rule**: CMS user cannot unfile admin's media without administrative permissions (`FO52`).
* **`inheritPermissionSet`**:
  * **Behavior**: Child folders (`FO14`) and filed TDOs (`FO11`, `FO13`) automatically inherit parent folder ACE grants when `options: ["inheritPermissionSet"]` is set during `addACEsToResources`.

---

## 4. Test Case & Defect Cross-Reference Index

| Test Case ID | Test Spec File | Verified Scenario & Target Action | Expected Result / Status Code | Defect / Tracking Reference |
| :--- | :--- | :--- | :--- | :--- |
| **`FO1`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Owner get parent and child folder | `200 OK` (Success) | Core OLP Read Baseline |
| **`FO2`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Admin 2 get folder and child folder | `200 OK` (Success) | Org-wide Admin Read |
| **`FO3`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user get parent and child folder | `200 OK` (Success) | Regular CMS Browse |
| **`FO4`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user get folder content (TDO, App, Watchlist) | `200 OK` (Success) | Content Read |
| **`FO5`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user get folder without ACE | `403 / No authorization access` | Default Deny Verification |
| **`FO6`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Add `AIWARE_FOLDER_READ` ACE for restricted user | `200 OK` (ACE Created) | OLP Grant Read |
| **`FO7`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user get parent folder after ACE | `200 OK` (Success) | Post-Grant Assertion |
| **`FO8`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user get child folder without inherit | `403 / No authorization access` | Scoped Boundary Check |
| **`FO10`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Add `AIWARE_TDO_READ` ACE on parent folder | `200 OK` (ACE Created) | TDO Read Grant |
| **`FO11`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user get shared TDO via inheritance | `200 OK` (Success) | ACE Inheritance |
| **`FO16`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Owner update and move folder | `200 OK` (Success) | Owner Write Baseline |
| **`FO17`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Move folder to its own child | `InvalidInput / Error` | Bug Ticket: `VE-16402` |
| **`FO18`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Admin update and move folder | `200 OK` (Success) | Admin Write Scope |
| **`FO19.1`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user update folder of others | `403 / Unauthorized` | Ownership Guard |
| **`FO19.2`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user move folder | `200 OK` (Success) | Viewer Move Capability |
| **`FO20`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user update folder | `403 / not_allowed` | Bug Ticket: `VE-16583` |
| **`FO21`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user move folder | `403 / not_allowed` | Bug Ticket: `VE-16695` |
| **`FO22`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Add `AIWARE_FOLDER_UPDATE` ACE for restricted user | `200 OK` (ACE Created) | OLP Grant Update |
| **`FO23`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user update folder succeeds | `200 OK` (Success) | Post-Grant Update Assertion |
| **`FO31`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user share folder to other org | `403 / Unauthorized` | Bug Ticket: `VE-16539` |
| **`FO33.1`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user share folder to other org | `403 / Unauthorized` | Bug Ticket: `VE-16539` |
| **`FO33.2`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | SuperAdmin share folder to other org (Read) | `200 OK` (Success) | Cross-Tenant Read Share |
| **`FO35.1`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target Org 2 get shared folder | `200 OK` (Success) | Partner Org Access |
| **`FO40`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target org create content in read-shared folder | `403 / PermissionDenied` | Bug Ticket: `VE-16540` |
| **`FO42`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target org update read-shared folder | `403 / PermissionDenied` | Write Protection on Read Share |
| **`FO43`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target org delete shared folder | `403 / PermissionDenied` | Bug Ticket: `VE-16403` |
| **`FO44`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | SuperAdmin share folder with Write permission | `200 OK` (Success) | Cross-Tenant Write Share |
| **`FO45`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target org update folder with write permission | `200 OK` (Success) | Bug Ticket: `VE-16718` |
| **`FO46`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target org add child folder to shared folder | `200 OK` (Success) | Bug Ticket: `VE-16541` |
| **`FO47`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Target org add content to shared folder | `200 OK` (Success) | Shared Content Ingestion |
| **`FO49`–`FO51`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Org 1 users cannot access Org 2 content in shared folder | `403 / Empty Record` | Multi-Tenant Content Isolation |
| **`FO52`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user unfile admin content | `403 / No authorization access` | Asset Protection |
| **`FO53`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user file new content | `403 / No authorization access` | Filing Block Baseline |
| **`FO54`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Add file permission for CMS user | `200 OK` (Permission Set Created) | File Permission Activation |
| **`FO55`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user file content to folder | `200 OK` (Success) | Post-Grant Filing Assertion |
| **`FO61`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user create child folder | `200 OK` (Success) | Standard User Subfolder Creation |
| **`FO62`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user create folder | `403 / not_allowed` | Create Block Baseline |
| **`FO63`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Add `AIWARE_FOLDER_CREATE` ACE for restricted user | `200 OK` (ACE Created) | OLP Grant Create |
| **`FO64`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user create folder and child folder | `200 OK` (Success) | Post-Grant Creation Assertion |
| **`FO68`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user delete owned folder | `200 OK` (Success) | Delete Owned Asset |
| **`FO69`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user delete folder without ACE | `403 / not_allowed` | Delete Block Baseline |
| **`FO70`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user delete admin-created folder | `403 / not_allowed` | Bug Ticket: `VE-16854` |
| **`FO71`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Add `AIWARE_FOLDER_DELETE` ACE for restricted user | `200 OK` (ACE Created) | OLP Grant Delete |
| **`FO72`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user delete folder succeeds | `200 OK` (Success) | Post-Grant Delete Assertion |
| **`FO73`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user query Org Root Folder | `403 / Empty Array` | Root Isolation |
| **`FO74`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Restricted user query Admin User Root Folder | `403 / Empty Array` | User Root Isolation |
| **`FO75`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | CMS user access Org Root Folder | `200 OK` (Success) | Standard CMS Root Access |
| **`FO76.1`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Delete non-empty root folder | `400 / 403 / Prohibited` | System Guard on Root Deletion |
| **`FO76.2`**| [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Delete empty root folder | `400 / 403 / Prohibited` | System Guard on Root Deletion |
| **`FO77`** | [`folderOlp.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderOlp.spec.ts) | Child folder auto-deleted with parent folder (v1) | `200 OK` (Cascade Deleted) | Hierarchy Cascade Lifecycle |

---
*Traceability Matrix maintained under [`citest/tools/graphql-api/test/folder/Exploring/matrix.Roles_Folder_Permissions.md`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/Exploring/matrix.Roles_Folder_Permissions.md).*
