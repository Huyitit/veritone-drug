## Default Flow Template

This document outlines the process for applying, using, and updating the default flow template for AI processing workflows in the database.

### Applying a New Default Flow Template

**Step 1: Create a Migration File**

To insert a new default flow template into the database, create a migration file using the following SQL example:

<details>
  <summary>
    Example of migration file
  </summary>

```sql
INSERT INTO job_new.flow_templates
(
    title,
    sub_title,
    description,
    categories,
    flow,
    image,
    screenshots,
    organization_id,
    tags,
    author,
    public,
    learn_more_link,
    logo,
    package,
    created_date_time,
    modified_date_time,
    flow_id
) VALUES(
    'aiWare Workflow Base Template',
    'Essential Nodes for AI Process Foundation',
    'This template includes the fundamental nodes required to establish a baseline for AI processing workflows. It offers the basic structure needed for data intake, success and failure outputs, error catching, and debug output. This setup serves as the groundwork upon which complete processes can be built.',
    '{aiWARE}',
    'W3siaWQiOiIyYzM5NTJmMzc4YzNhOGJmIiwidHlwZSI6InRhYiIsImxhYmVsIjoiRmxvdyAxIiwiZGlzYWJsZWQiOmZhbHNlLCJpbmZvIjoiIiwiZW52IjpbXX0seyJpZCI6IjI0NTJlZDRkYWNhOTcxYmEiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwiZm9ybWF0Ijoib2JqZWN0Iiwic2FtcGxlcyI6W3siaWQiOiJoMm53YmgiLCJuYW1lIjoiRGVmYXVsdCIsInZhbHVlIjp7InBheWxvYWQiOiJ0ZXN0In0sInN0YXR1cyI6ImFjdGl2ZSJ9XSwidGRvQ29udGVudCI6Int9IiwiX210aW1lIjoxNzMwMzk2NjE4OTY1LCJ3YWl0Rm9yUmVzdWx0cyI6ZmFsc2UsImtlZXBQYXlsb2FkIjpmYWxzZSwia2VlcEFsaXZlIjowLCJzZXJ2aWNlTW9kZU9ubHkiOnRydWUsIngiOjI0MCwieSI6MTAwLCJ3aXJlcyI6W1tdXX0seyJpZCI6ImUyZDQ0MWZmOGQ5YmExNzIiLCJ0eXBlIjoiYWl3YXJlLW91dCIsInoiOiIyYzM5NTJmMzc4YzNhOGJmIiwibmFtZSI6IiIsInN0YXR1c0NvZGUiOiJzdWNjZXNzIiwiZmFpbHVyZU1zZyI6IiIsImZhaWx1cmVNc2dUeXBlIjoiIiwiZmFpbHVyZVJlYXNvbiI6IiIsImZhaWx1cmVSZWFzb25UeXBlIjoiIiwic2tpcFJlc3VsdENhbGxiYWNrIjpmYWxzZSwiZGlzYWJsZURlYnVnIjpmYWxzZSwiZXhjbHVkZU1ldGFkYXRhIjpmYWxzZSwieCI6NTgwLCJ5IjoxMDAsIndpcmVzIjpbXX0seyJpZCI6IjU5ODQwNzY5MjI4MTAyMGQiLCJ0eXBlIjoiY2F0Y2giLCJ6IjoiMmMzOTUyZjM3OGMzYThiZiIsIm5hbWUiOiIiLCJzY29wZSI6bnVsbCwidW5jYXVnaHQiOmZhbHNlLCJ4IjoyNjAsInkiOjI0MCwid2lyZXMiOltbIjBlZWY0M2M1NmE0NTVkNjkiLCI5NTI2OTk2YTc3NTc2MDA1Il1dfSx7ImlkIjoiMGVlZjQzYzU2YTQ1NWQ2OSIsInR5cGUiOiJhaXdhcmUtb3V0IiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwic3RhdHVzQ29kZSI6ImZhaWx1cmUiLCJmYWlsdXJlTXNnIjoiIiwiZmFpbHVyZU1zZ1R5cGUiOiJzdHIiLCJmYWlsdXJlUmVhc29uIjoiIiwiZmFpbHVyZVJlYXNvblR5cGUiOiJzdHIiLCJza2lwUmVzdWx0Q2FsbGJhY2siOmZhbHNlLCJkaXNhYmxlRGVidWciOmZhbHNlLCJleGNsdWRlTWV0YWRhdGEiOmZhbHNlLCJ4Ijo1MTAsInkiOjIwMCwid2lyZXMiOltdfSx7ImlkIjoiOTUyNjk5NmE3NzU3NjAwNSIsInR5cGUiOiJkZWJ1ZyIsInoiOiIyYzM5NTJmMzc4YzNhOGJmIiwibmFtZSI6ImRlYnVnIGVycm9yIiwiYWN0aXZlIjp0cnVlLCJ0b3NpZGViYXIiOnRydWUsImNvbnNvbGUiOmZhbHNlLCJ0b3N0YXR1cyI6ZmFsc2UsImNvbXBsZXRlIjoiZXJyb3IiLCJ0YXJnZXRUeXBlIjoibXNnIiwic3RhdHVzVmFsIjoiIiwic3RhdHVzVHlwZSI6ImF1dG8iLCJ4Ijo0OTAsInkiOjI4MCwid2lyZXMiOltdfV0=',
    '',
    '{"null"}',
    '@@{ROOT_ORG_ID}@@',
    '{aiWARE,Template}',
    'Veritone',
    true,
    NULL,
    NULL,
    'eyJkZXBlbmRlbmNpZXMiOnt9fQ==',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    '40b2b9b4-28bf-4e5e-b3e9-3c45dc40bb22'::uuid
) ON CONFLICT DO NOTHING;
```

</details>
</br>

*Note that the `flow` and `package` fields must be encoded in base64 format from the original JSON structure (see additional details below).*

<details>
  <summary>
    Example of flow's original JSON
  </summary>

```json
[
  {
    "id": "2c3952f378c3a8bf",
    "type": "tab",
    "label": "Flow 1",
    "disabled": false,
    "info": "",
    "env": []
  },
  {
    "id": "2452ed4daca971ba",
    "type": "aiware-in",
    "z": "2c3952f378c3a8bf",
    "name": "",
    "format": "object",
    "samples": [
      {
        "id": "h2nwbh",
        "name": "Default",
        "value": {
          "payload": "test"
        },
        "status": "active"
      }
    ],
    "tdoContent": "{}",
    "_mtime": 1730396618965,
    "waitForResults": false,
    "keepPayload": false,
    "keepAlive": 0,
    "serviceModeOnly": true,
    "x": 240,
    "y": 100,
    "wires": [
      []
    ]
  },
  {
    "id": "e2d441ff8d9ba172",
    "type": "aiware-out",
    "z": "2c3952f378c3a8bf",
    "name": "",
    "statusCode": "success",
    "failureMsg": "",
    "failureMsgType": "",
    "failureReason": "",
    "failureReasonType": "",
    "skipResultCallback": false,
    "disableDebug": false,
    "excludeMetadata": false,
    "x": 580,
    "y": 100,
    "wires": []
  },
  {
    "id": "598407692281020d",
    "type": "catch",
    "z": "2c3952f378c3a8bf",
    "name": "",
    "scope": null,
    "uncaught": false,
    "x": 260,
    "y": 240,
    "wires": [
      [
        "0eef43c56a455d69",
        "9526996a77576005"
      ]
    ]
  },
  {
    "id": "0eef43c56a455d69",
    "type": "aiware-out",
    "z": "2c3952f378c3a8bf",
    "name": "",
    "statusCode": "failure",
    "failureMsg": "",
    "failureMsgType": "str",
    "failureReason": "",
    "failureReasonType": "str",
    "skipResultCallback": false,
    "disableDebug": false,
    "excludeMetadata": false,
    "x": 510,
    "y": 200,
    "wires": []
  },
  {
    "id": "9526996a77576005",
    "type": "debug",
    "z": "2c3952f378c3a8bf",
    "name": "debug error",
    "active": true,
    "tosidebar": true,
    "console": false,
    "tostatus": false,
    "complete": "error",
    "targetType": "msg",
    "statusVal": "",
    "statusType": "auto",
    "x": 490,
    "y": 280,
    "wires": []
  }
]
```

</details>

<details>
  <summary>
    Example of package's original JSON
  </summary>

```json
{"dependencies":{"node-red-debugger":"~1.1.1"}}
```

</details>
</br>

**Step 2: Update the Flow Template ID in the Codebase**

Once the new flow template is added, update the defaultFlowTemplateId in the file located at dal/dalFlow.js.

### Updating an Existing Default Flow Template

Follow the steps below to update an existing default flow template with new flow data.

**Step 1: Export the runtime data of flow (JSON format)**

From your runtime environment (Automate Studio), export the flow data you wish to update in JSON format.

1. Create or Open a flow
2. Navigate to `File` → `Export`
3. Download the flow data as a file or copy the JSON data directly to your clipboard.

**Step 2: Encode the flow's original JSON to Base64**

Using any base64 encoding tool, convert the JSON flow data from Step 1 to base64 format. This encoded data will be required in the next step for updating the flow template.

**Step 3: Call GraphQL API to update default flow**

To modify an existing flow template, use the updateFlowTemplate GraphQL mutation. Here are some necessary arguments:  

1. `id` - Use the ID for the default flow template - `40b2b9b4-28bf-4e5e-b3e9-3c45dc40bb22`.
2. `organizationId` - ID of the root organization
3. `flow` - the flow field containing the base64-encoded data obtained from [Step 2](#step-2-encode-the-flows-original-json-to-base64).

Below is an example of the updateFlowTemplate mutation, which will update the default flow template’s data:
```graphql
mutation {
  updateFlowTemplate(input: {
    id: "40b2b9b4-28bf-4e5e-b3e9-3c45dc40bb22",
    organizationId: "7682",
    flow: "W3siaWQiOiIyYzM5NTJmMzc4YzNhOGJmIiwidHlwZSI6InRhYiIsImxhYmVsIjoiRmxvdyAxIiwiZGlzYWJsZWQiOmZhbHNlLCJpbmZvIjoiIiwiZW52IjpbXX0seyJpZCI6IjI0NTJlZDRkYWNhOTcxYmEiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwiZm9ybWF0Ijoib2JqZWN0Iiwic2FtcGxlcyI6W3siaWQiOiJoMm53YmgiLCJuYW1lIjoiRGVmYXVsdCIsInZhbHVlIjp7InBheWxvYWQiOiJ0ZXN0In0sInN0YXR1cyI6ImFjdGl2ZSJ9XSwidGRvQ29udGVudCI6Int9IiwiX210aW1lIjoxNzMwMzk2NjE4OTY1LCJ3YWl0Rm9yUmVzdWx0cyI6ZmFsc2UsImtlZXBQYXlsb2FkIjpmYWxzZSwia2VlcEFsaXZlIjowLCJzZXJ2aWNlTW9kZU9ubHkiOnRydWUsIngiOjI0MCwieSI6MTAwLCJ3aXJlcyI6W1tdXX0seyJpZCI6ImUyZDQ0MWZmOGQ5YmExNzIiLCJ0eXBlIjoiYWl3YXJlLW91dCIsInoiOiIyYzM5NTJmMzc4YzNhOGJmIiwibmFtZSI6IiIsInN0YXR1c0NvZGUiOiJzdWNjZXNzIiwiZmFpbHVyZU1zZyI6IiIsImZhaWx1cmVNc2dUeXBlIjoiIiwiZmFpbHVyZVJlYXNvbiI6IiIsImZhaWx1cmVSZWFzb25UeXBlIjoiIiwic2tpcFJlc3VsdENhbGxiYWNrIjpmYWxzZSwiZGlzYWJsZURlYnVnIjpmYWxzZSwiZXhjbHVkZU1ldGFkYXRhIjpmYWxzZSwieCI6NTgwLCJ5IjoxMDAsIndpcmVzIjpbXX0seyJpZCI6IjU5ODQwNzY5MjI4MTAyMGQiLCJ0eXBlIjoiY2F0Y2giLCJ6IjoiMmMzOTUyZjM3OGMzYThiZiIsIm5hbWUiOiIiLCJzY29wZSI6bnVsbCwidW5jYXVnaHQiOmZhbHNlLCJ4IjoyNjAsInkiOjI0MCwid2lyZXMiOltbIjBlZWY0M2M1NmE0NTVkNjkiLCI5NTI2OTk2YTc3NTc2MDA1Il1dfSx7ImlkIjoiMGVlZjQzYzU2YTQ1NWQ2OSIsInR5cGUiOiJhaXdhcmUtb3V0IiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwic3RhdHVzQ29kZSI6ImZhaWx1cmUiLCJmYWlsdXJlTXNnIjoiIiwiZmFpbHVyZU1zZ1R5cGUiOiJzdHIiLCJmYWlsdXJlUmVhc29uIjoiIiwiZmFpbHVyZVJlYXNvblR5cGUiOiJzdHIiLCJza2lwUmVzdWx0Q2FsbGJhY2siOmZhbHNlLCJkaXNhYmxlRGVidWciOmZhbHNlLCJleGNsdWRlTWV0YWRhdGEiOmZhbHNlLCJ4Ijo1MTAsInkiOjIwMCwid2lyZXMiOltdfSx7ImlkIjoiOTUyNjk5NmE3NzU3NjAwNSIsInR5cGUiOiJkZWJ1ZyIsInoiOiIyYzM5NTJmMzc4YzNhOGJmIiwibmFtZSI6ImRlYnVnIGVycm9yIiwiYWN0aXZlIjp0cnVlLCJ0b3NpZGViYXIiOnRydWUsImNvbnNvbGUiOmZhbHNlLCJ0b3N0YXR1cyI6ZmFsc2UsImNvbXBsZXRlIjoiZXJyb3IiLCJ0YXJnZXRUeXBlIjoibXNnIiwic3RhdHVzVmFsIjoiIiwic3RhdHVzVHlwZSI6ImF1dG8iLCJ4Ijo0OTAsInkiOjI4MCwid2lyZXMiOltdfV0="
  }) {
    id,
    title,
    subtitle,
    flow,
    package
  }
}
```