// tests/k6/config/profiles.ts
function getExecutionOptions() {
  const profile = (__ENV.PROFILE || "load").toLowerCase();
  const vusOverride = __ENV.VUS ? parseInt(__ENV.VUS, 10) : void 0;
  const durationOverride = __ENV.DURATION || void 0;
  const baseThresholds = {
    http_req_failed: ["rate<0.01"],
    // Less than 1% HTTP failures
    checks: ["rate>0.99"],
    // More than 99% check pass rate
    graphql_errors: ["rate<0.01"]
    // Less than 1% business logic errors
  };
  if (profile === "smoke") {
    return {
      vus: vusOverride || 1,
      duration: durationOverride || "15s",
      thresholds: {
        ...baseThresholds,
        http_req_duration: ["p(95)<1500", "p(99)<3000"]
      }
    };
  }
  if (profile === "stress") {
    return {
      stages: [
        { duration: "30s", target: vusOverride ? Math.floor(vusOverride / 2) : 25 },
        { duration: "1m", target: vusOverride || 50 },
        { duration: durationOverride || "1m", target: vusOverride || 50 },
        { duration: "30s", target: 0 }
      ],
      thresholds: {
        ...baseThresholds,
        http_req_duration: ["p(95)<2500", "p(99)<5000"]
      }
    };
  }
  return {
    stages: [
      { duration: "14s", target: vusOverride || 50 },
      { duration: durationOverride || "1m", target: vusOverride || 50 },
      { duration: "10s", target: 0 }
    ],
    thresholds: {
      ...baseThresholds,
      http_req_duration: ["p(95)<1500", "p(99)<3000"]
    }
  };
}

// tests/k6/helpers/client.ts
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
var graphqlErrors = new Rate("graphql_errors");
var graphqlDuration = new Trend("graphql_duration");
function executeGraphQL(endpointUrl, operation, variables = {}, token, operationName = "GraphQL_Op", expectError = false) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json"
  };
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  const payload = JSON.stringify({
    query: operation,
    variables
  });
  const res = http.post(endpointUrl, payload, {
    headers,
    tags: { operation: operationName }
  });
  graphqlDuration.add(res.timings.duration, { operation: operationName });
  let parsedBody = {};
  let isJsonValid = false;
  try {
    parsedBody = JSON.parse(res.body ? res.body.toString() : "{}");
    isJsonValid = true;
  } catch {
    parsedBody = {
      errors: [{ message: `HTTP ${res.status}: Failed to parse JSON response` }]
    };
  }
  const hasBusinessErrors = Array.isArray(parsedBody.errors) && parsedBody.errors.length > 0;
  if (!expectError && (res.status !== 200 || hasBusinessErrors)) {
    console.error(`[k6 client error] ${operationName} (HTTP ${res.status}): ${JSON.stringify(parsedBody.errors || parsedBody)}`);
  }
  if (expectError) {
    const passed = (res.status === 200 || res.status === 400) && hasBusinessErrors;
    check(res, {
      [`${operationName} responded with expected error`]: () => passed
    });
    graphqlErrors.add(false);
  } else {
    const pass = check(res, {
      [`${operationName} status is 200`]: (r) => r.status === 200,
      [`${operationName} response has valid JSON`]: () => isJsonValid,
      [`${operationName} has no business errors`]: () => !hasBusinessErrors
    });
    graphqlErrors.add(!pass || hasBusinessErrors);
  }
  return {
    data: parsedBody.data,
    errors: parsedBody.errors,
    status: res.status,
    raw: res
  };
}

// tests/graphql/folder/mutations.ts
var USER_LOGIN = `
  mutation Login($input: UserLogin!) {
    userLogin(input: $input) {
      token
      user {
        id
        organizationId
        organization {
          id
          name
        }
      }
      organization {
        id
        name
      }
    }
  }
`;
var CREATE_ROOT_FOLDERS = `
  mutation CreateRootFolders($rootFolderType: RootFolderType) {
    createRootFolders(rootFolderType: $rootFolderType) {
      id
      rootFolderTypeId
      name
    }
  }
`;
var CREATE_FOLDER = `
  mutation CreateFolder($input: CreateFolder!) {
    createFolder(input: $input) {
      id
      name
      description
    }
  }
`;
var UPDATE_FOLDER = `
  mutation UpdateFolder($input: UpdateFolder!) {
    updateFolder(input: $input) {
      id
      name
    }
  }
`;
var MOVE_FOLDER = `
  mutation MoveFolder($input: MoveFolder!) {
    moveFolder(input: $input) {
      id
      name
    }
  }
`;
var MOVE_FOLDERS = `
  mutation MoveFolders($input: MoveFolders!) {
    moveFolders(input: $input) {
      organizationId
      newParentFolderId
      validFolderIds
      invalidFolderIds
      message
    }
  }
`;
var DELETE_FOLDER = `
  mutation DeleteFolder($input: DeleteFolder!) {
    deleteFolder(input: $input) {
      message
    }
  }
`;

// tests/graphql/folder/queries.ts
var CHECK_ROOT_FOLDERS = `
  query CheckRootFolders($type: RootFolderType) {
    rootFolders(type: $type) {
      id
      typeId
      rootFolderTypeId
      name
    }
  }
`;
var GET_ROOT_FOLDERS = `
  query GetRootFolders {
    rootFolders {
      id
      ownerId
    }
  }
`;
var GET_FOLDER = `
  query GetFolder($id: ID!) {
    folder(id: $id) {
      id
      name
      childFolders {
        records {
          id
          name
        }
      }
    }
  }
`;
var GET_FOLDER_OVERVIEW = `
  query GetFolderOverview($ids: [ID!]!) {
    folderOverview(ids: $ids) {
      childFoldersCount
      childNonFolderObjectsCount
    }
  }
`;

// tests/k6/helpers/auth.ts
function setupAuthAndEnvironment() {
  const endpointUrl = __ENV.GRAPHQL_API_URL || "https://api.stage.us-1.veritone.com/v3/graphql";
  const userName = __ENV.AUTH_USER_NAME || "citest-should-delete+55525-admin@veritone.com";
  const password = __ENV.AUTH_PASSWORD || "testUserPassword";
  if (!userName || !password) {
    throw new Error("Missing AUTH_USER_NAME or AUTH_PASSWORD credentials for k6 load test");
  }
  const loginRes = executeGraphQL(
    endpointUrl,
    USER_LOGIN,
    {
      input: { userName, password }
    },
    void 0,
    "Setup_UserLogin"
  );
  if (loginRes.errors && loginRes.errors.length > 0) {
    throw new Error(`k6 setup login failed: ${loginRes.errors.map((e) => e.message).join(", ")}`);
  }
  const token = loginRes.data?.userLogin?.token;
  const organizationId = loginRes.data?.userLogin?.user?.organizationId || loginRes.data?.userLogin?.organization?.id || "";
  if (!token) {
    throw new Error("k6 setup login failed: No bearer token returned");
  }
  let rootCmsId = "";
  const cmsRootRes = executeGraphQL(
    endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "cms" },
    token,
    "Setup_CheckCmsRoot"
  );
  if (cmsRootRes.data?.rootFolders && cmsRootRes.data.rootFolders.length > 0) {
    rootCmsId = cmsRootRes.data.rootFolders[0].id;
  } else {
    const cmsCreateRes = executeGraphQL(
      endpointUrl,
      CREATE_ROOT_FOLDERS,
      { rootFolderType: "cms" },
      token,
      "Setup_CreateCmsRoot"
    );
    rootCmsId = cmsCreateRes.data?.createRootFolders?.[0]?.id || "";
  }
  let rootWatchlistId = "";
  const wlRootRes = executeGraphQL(
    endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "watchlist" },
    token,
    "Setup_CheckWatchlistRoot"
  );
  if (wlRootRes.data?.rootFolders && wlRootRes.data.rootFolders.length > 0) {
    rootWatchlistId = wlRootRes.data.rootFolders[0].id;
  } else {
    const wlCreateRes = executeGraphQL(
      endpointUrl,
      CREATE_ROOT_FOLDERS,
      { rootFolderType: "watchlist" },
      token,
      "Setup_CreateWatchlistRoot"
    );
    rootWatchlistId = wlCreateRes.data?.createRootFolders?.[0]?.id || "";
  }
  const rootFolderId = rootWatchlistId || rootCmsId;
  const rootFolderType = rootWatchlistId ? "watchlist" : "cms";
  if (!rootFolderId) {
    throw new Error("k6 setup failed: Could not resolve or initialize any root folder anchor");
  }
  const runId = Math.random().toString(36).substring(2, 9);
  return {
    endpointUrl,
    token,
    organizationId,
    rootCmsId,
    rootWatchlistId,
    rootFolderId,
    rootFolderType,
    runId
  };
}

// tests/k6/helpers/cleanup.ts
function teardownSweep(data) {
  if (!data || !data.token) {
    console.log("[k6 teardown] Skipping sweep: Missing session data");
    return;
  }
  const rootIds = Array.from(
    new Set([data.rootFolderId, data.rootCmsId, data.rootWatchlistId].filter(Boolean))
  );
  console.log(`[k6 teardown] Starting bulk sweep for runId: ${data.runId}...`);
  let totalDeleted = 0;
  for (const rootId of rootIds) {
    try {
      const rootFolderRes = executeGraphQL(
        data.endpointUrl,
        GET_FOLDER,
        { id: rootId },
        data.token,
        "Teardown_GetRootChildren"
      );
      const records = rootFolderRes.data?.folder?.childFolders?.records || [];
      const runPrefix = `k6-`;
      const matchingFolders = records.filter(
        (f) => f.name && f.name.startsWith(runPrefix) && f.name.includes(data.runId)
      );
      if (matchingFolders.length > 0) {
        console.log(
          `[k6 teardown] Found ${matchingFolders.length} test folder(s) under root ${rootId}`
        );
        for (const folder of matchingFolders) {
          try {
            const childRes = executeGraphQL(
              data.endpointUrl,
              GET_FOLDER,
              { id: folder.id },
              data.token,
              "Teardown_GetSubChildren"
            );
            const subRecords = childRes.data?.folder?.childFolders?.records || [];
            for (const sub of subRecords) {
              executeGraphQL(
                data.endpointUrl,
                DELETE_FOLDER,
                { input: { id: sub.id, orderIndex: 0 } },
                data.token,
                "Teardown_DeleteSubChild"
              );
            }
            const deleteRes = executeGraphQL(
              data.endpointUrl,
              DELETE_FOLDER,
              { input: { id: folder.id, orderIndex: 0 } },
              data.token,
              "Teardown_DeleteFolder"
            );
            if (!deleteRes.errors || deleteRes.errors.length === 0) {
              totalDeleted++;
            }
          } catch {
          }
        }
      }
    } catch {
    }
  }
  console.log(`[k6 teardown] Sweep complete: Cleanly deleted ${totalDeleted} test folder(s).`);
}

// tests/k6/helpers/reporter.ts
function generateHtmlReport(data) {
  const metrics = data.metrics || {};
  const rootGroup = data.root_group || {};
  const httpReqDuration = metrics.http_req_duration?.values || {};
  const httpReqs = metrics.http_reqs?.values || {};
  const httpFailed = metrics.http_req_failed?.values || {};
  const vus = metrics.vus?.values || {};
  const checks = metrics.checks?.values || {};
  const graphqlErrors2 = metrics.graphql_errors?.values || {};
  function fmtMs(num) {
    if (num === void 0 || isNaN(num)) return "N/A";
    return num >= 1e3 ? (num / 1e3).toFixed(2) + "s" : num.toFixed(1) + "ms";
  }
  function fmtPct(num) {
    if (num === void 0 || isNaN(num)) return "0.0%";
    return (num * 100).toFixed(2) + "%";
  }
  let passedChecks = 0;
  let failedChecks = 0;
  function countChecks(group) {
    if (group.checks) {
      for (const check7 of group.checks) {
        passedChecks += check7.passes || 0;
        failedChecks += check7.fails || 0;
      }
    }
    if (group.groups) {
      for (const subGroup of group.groups) {
        countChecks(subGroup);
      }
    }
  }
  countChecks(rootGroup);
  const totalChecks = passedChecks + failedChecks;
  const checksPassRate = totalChecks > 0 ? passedChecks / totalChecks * 100 : 100;
  const isHealthy = (httpFailed.rate || 0) < 0.01 && (graphqlErrors2.rate || 0) < 0.01;
  let checksHtml = "";
  function renderChecks(group) {
    if (group.checks && group.checks.length > 0) {
      for (const c of group.checks) {
        const pass = (c.fails || 0) === 0;
        checksHtml += `
          <tr class="${pass ? "check-pass" : "check-fail"}">
            <td style="font-weight: 500;">${c.name}</td>
            <td style="text-align: center;">${pass ? "\u2713 PASS" : "\u2717 FAIL"}</td>
            <td style="text-align: right;">${c.passes}</td>
            <td style="text-align: right; color: ${c.fails > 0 ? "#ef4444" : "inherit"};">${c.fails}</td>
          </tr>
        `;
      }
    }
    if (group.groups) {
      for (const g of group.groups) {
        renderChecks(g);
      }
    }
  }
  renderChecks(rootGroup);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>k6 Load Test Execution Report</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --primary: #38bdf8;
      --success: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      line-height: 1.5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--primary);
    }
    .badge {
      display: inline-block;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-success { background: rgba(34, 197, 94, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid var(--danger); }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
    }
    .card-title {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .card-val {
      font-size: 1.75rem;
      font-weight: 700;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      background: var(--card-bg);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: rgba(15, 23, 42, 0.6);
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>aiWARE GraphQL k6 Load Test Report</h1>
        <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">
          Executed on ${(/* @__PURE__ */ new Date()).toISOString()} | Target: Veritone aiWARE Folder Lifecycle
        </div>
      </div>
      <div>
        <span class="badge ${isHealthy ? "badge-success" : "badge-fail"}">
          ${isHealthy ? "HEALTHY / PASSED" : "FAILURES DETECTED"}
        </span>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Total Requests</div>
        <div class="card-val">${httpReqs.count || 0}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
          Rate: ${(httpReqs.rate || 0).toFixed(1)} req/s
        </div>
      </div>

      <div class="card">
        <div class="card-title">HTTP Failure Rate</div>
        <div class="card-val" style="color: ${(httpFailed.rate || 0) > 0 ? "var(--danger)" : "var(--success)"};">
          ${fmtPct(httpFailed.rate)}
        </div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
          Failed: ${httpFailed.passes || 0} reqs
        </div>
      </div>

      <div class="card">
        <div class="card-title">Checks Pass Rate</div>
        <div class="card-val" style="color: ${checksPassRate >= 99 ? "var(--success)" : "var(--danger)"};">
          ${checksPassRate.toFixed(1)}%
        </div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
          ${passedChecks} passed / ${failedChecks} failed
        </div>
      </div>

      <div class="card">
        <div class="card-title">Max Virtual Users</div>
        <div class="card-val">${vus.max || vus.value || 1}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
          GraphQL Errors: ${fmtPct(graphqlErrors2.rate)}
        </div>
      </div>
    </div>

    <div class="section-title">HTTP Timing Percentiles</div>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Min</th>
          <th>Median (p50)</th>
          <th>p(90)</th>
          <th>p(95)</th>
          <th>Max</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight: 600;">http_req_duration</td>
          <td>${fmtMs(httpReqDuration.min)}</td>
          <td>${fmtMs(httpReqDuration.med)}</td>
          <td>${fmtMs(httpReqDuration["p(90)"])}</td>
          <td style="color: var(--primary); font-weight: 600;">${fmtMs(httpReqDuration["p(95)"])}</td>
          <td>${fmtMs(httpReqDuration.max)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Assertion Checks Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Check Name</th>
          <th style="text-align: center;">Status</th>
          <th style="text-align: right;">Passes</th>
          <th style="text-align: right;">Fails</th>
        </tr>
      </thead>
      <tbody>
        ${checksHtml || "<tr><td colspan='4' style='text-align:center;'>No individual checks recorded</td></tr>"}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
function generateConsoleSummary(data) {
  const metrics = data.metrics || {};
  const httpDuration = metrics.http_req_duration?.values || {};
  const reqs = metrics.http_reqs?.values || {};
  const failed = metrics.http_req_failed?.values || {};
  const checks = metrics.checks?.values || {};
  return `
================================================================================
                    k6 LOAD TEST EXECUTION SUMMARY
================================================================================
Total Requests:    ${reqs.count || 0} (${(reqs.rate || 0).toFixed(1)} req/s)
HTTP Failures:     ${((failed.rate || 0) * 100).toFixed(2)}% (${failed.passes || 0} failed)
Checks Pass Rate:  ${((checks.rate || 0) * 100).toFixed(1)}% (${checks.passes || 0} passed / ${checks.fails || 0} failed)
--------------------------------------------------------------------------------
Duration (p50):    ${(httpDuration.med || 0).toFixed(1)} ms
Duration (p90):    ${(httpDuration["p(90)"] || 0).toFixed(1)} ms
Duration (p95):    ${(httpDuration["p(95)"] || 0).toFixed(1)} ms
Duration (max):    ${(httpDuration.max || 0).toFixed(1)} ms
================================================================================
HTML Report written to: k6-report.html
`;
}

// tests/k6/scenarios/lifecycle.ts
import { sleep, check as check2 } from "k6";
function runLifecycleScenario(data) {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-run-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");
  const folderARes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-FolderA`,
        description: "Primary ingest root A for k6 lifecycle load test",
        parentId: rootId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_01_CreateFolderA"
  );
  const folderAId = folderARes.data?.createFolder?.id;
  check2(folderARes, {
    "Folder A created successfully": () => !!folderAId
  });
  const folderBRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-FolderB`,
        description: "Primary staging root B for k6 lifecycle load test",
        parentId: rootId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_01_CreateFolderB"
  );
  const folderBId = folderBRes.data?.createFolder?.id;
  check2(folderBRes, {
    "Folder B created successfully": () => !!folderBId
  });
  if (!folderAId || !folderBId) {
    console.error(`[VU ${vuId}] Failed to create top-level test folders`);
    return;
  }
  const sub1Res = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Sub1`,
        description: "Child subfolder 1 for relocation",
        parentId: folderAId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_01_CreateSub1"
  );
  const sub1Id = sub1Res.data?.createFolder?.id;
  const sub2Res = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Sub2`,
        description: "Child subfolder 2 for bulk migration",
        parentId: folderAId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_01_CreateSub2"
  );
  const sub2Id = sub2Res.data?.createFolder?.id;
  if (sub2Id) {
    const updateRes = executeGraphQL(
      data.endpointUrl,
      UPDATE_FOLDER,
      {
        input: {
          id: sub2Id,
          name: `${prefix}-Sub2-Archived`
        }
      },
      data.token,
      "TC_LT_01_UpdateFolder"
    );
    check2(updateRes, {
      "Sub2 name updated successfully": (r) => r.data?.updateFolder?.name === `${prefix}-Sub2-Archived`
    });
  }
  if (sub1Id) {
    const moveRes = executeGraphQL(
      data.endpointUrl,
      MOVE_FOLDER,
      {
        input: {
          folderId: sub1Id,
          fromFolderId: folderAId,
          toFolderId: folderBId
        }
      },
      data.token,
      "TC_LT_01_MoveFolderSingle"
    );
    check2(moveRes, {
      "Sub1 moved to Folder B": (r) => !!r.data?.moveFolder?.id
    });
  }
  if (sub2Id) {
    const bulkMoveRes = executeGraphQL(
      data.endpointUrl,
      MOVE_FOLDERS,
      {
        input: {
          folderIds: [sub2Id],
          newParentFolderId: folderBId,
          rootFolderType: rootType
        }
      },
      data.token,
      "TC_LT_01_MoveFoldersBulk"
    );
    check2(bulkMoveRes, {
      "Sub2 bulk moved to Folder B": (r) => Array.isArray(r.data?.moveFolders?.validFolderIds) && r.data.moveFolders.validFolderIds.includes(sub2Id)
    });
  }
  const overviewRes = executeGraphQL(
    data.endpointUrl,
    GET_FOLDER_OVERVIEW,
    {
      ids: [folderAId, folderBId]
    },
    data.token,
    "TC_LT_01_GetFolderOverview"
  );
  check2(overviewRes, {
    "Overview query executed successfully": (r) => !!r.data?.folderOverview && typeof r.data.folderOverview.childFoldersCount !== "undefined"
  });
  if (sub1Id) {
    executeGraphQL(
      data.endpointUrl,
      DELETE_FOLDER,
      {
        input: {
          id: sub1Id,
          orderIndex: 0
        }
      },
      data.token,
      "TC_LT_01_DeleteSub1"
    );
  }
  if (sub2Id) {
    executeGraphQL(
      data.endpointUrl,
      DELETE_FOLDER,
      {
        input: {
          id: sub2Id,
          orderIndex: 0
        }
      },
      data.token,
      "TC_LT_01_DeleteSub2"
    );
  }
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    {
      input: {
        id: folderAId,
        orderIndex: 0
      }
    },
    data.token,
    "TC_LT_01_DeleteFolderA"
  );
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    {
      input: {
        id: folderBId,
        orderIndex: 0
      }
    },
    data.token,
    "TC_LT_01_DeleteFolderB"
  );
  sleep(0.5);
}

// tests/k6/scenarios/burst.ts
import { sleep as sleep2, check as check3 } from "k6";
function runBurstScenario(data) {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-burst-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");
  const createRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Node`,
        description: "k6 burst scenario root node",
        parentId: rootId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_02_BurstCreateRootNode"
  );
  const newId = createRes.data?.createFolder?.id;
  check3(createRes, {
    "Burst top node created": () => !!newId
  });
  if (!newId) return;
  const childRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Child`,
        description: "k6 burst scenario child node",
        parentId: newId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_02_BurstCreateChildNode"
  );
  const childId = childRes.data?.createFolder?.id;
  check3(childRes, {
    "Burst child node attached": () => !!childId
  });
  const getRes = executeGraphQL(
    data.endpointUrl,
    GET_FOLDER,
    { id: newId },
    data.token,
    "TC_LT_02_BurstVerifyHierarchy"
  );
  check3(getRes, {
    "Parent hierarchy includes child": (r) => Array.isArray(r.data?.folder?.childFolders?.records) && r.data.folder.childFolders.records.length > 0
  });
  if (childId) {
    executeGraphQL(
      data.endpointUrl,
      DELETE_FOLDER,
      { input: { id: childId, orderIndex: 0 } },
      data.token,
      "TC_LT_02_DeleteChildNode"
    );
  }
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: newId, orderIndex: 0 } },
    data.token,
    "TC_LT_02_DeleteTopNode"
  );
  sleep2(0.2);
}

// tests/k6/scenarios/read.ts
import { sleep as sleep3, check as check4 } from "k6";
function runReadScenario(data) {
  const cmsRootRes = executeGraphQL(
    data.endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "cms" },
    data.token,
    "TC_LT_03_CheckCmsRootFolders"
  );
  check4(cmsRootRes, {
    "CMS root folder found": (r) => Array.isArray(r.data?.rootFolders) && r.data.rootFolders.length > 0
  });
  const wlRootRes = executeGraphQL(
    data.endpointUrl,
    CHECK_ROOT_FOLDERS,
    { type: "watchlist" },
    data.token,
    "TC_LT_03_CheckWatchlistRootFolders"
  );
  check4(wlRootRes, {
    "Watchlist root folder found": (r) => Array.isArray(r.data?.rootFolders) && r.data.rootFolders.length > 0
  });
  const allRootsRes = executeGraphQL(
    data.endpointUrl,
    GET_ROOT_FOLDERS,
    {},
    data.token,
    "TC_LT_03_GetAllRootFolders"
  );
  check4(allRootsRes, {
    "All root folders queried": (r) => Array.isArray(r.data?.rootFolders) && r.data.rootFolders.length > 0
  });
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const folderRes = executeGraphQL(
    data.endpointUrl,
    GET_FOLDER,
    { id: rootId },
    data.token,
    "TC_LT_03_GetFolderHierarchy"
  );
  check4(folderRes, {
    "Folder query returned valid payload": (r) => !!r.data?.folder?.id
  });
  sleep3(0.1);
}

// tests/k6/scenarios/move.ts
import { sleep as sleep4, check as check5 } from "k6";
function runMoveScenario(data) {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-move-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");
  const bucketAlphaRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Alpha`,
        description: "k6 move scenario Alpha bucket",
        parentId: rootId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_04_CreateBucketAlpha"
  );
  const alphaId = bucketAlphaRes.data?.createFolder?.id;
  const bucketBetaRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Beta`,
        description: "k6 move scenario Beta bucket",
        parentId: rootId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_04_CreateBucketBeta"
  );
  const betaId = bucketBetaRes.data?.createFolder?.id;
  if (!alphaId || !betaId) return;
  const mobileRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-MobileItem`,
        description: "k6 move scenario mobile child folder",
        parentId: alphaId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_04_CreateMobileItem"
  );
  const mobileId = mobileRes.data?.createFolder?.id;
  if (!mobileId) return;
  const moveRes = executeGraphQL(
    data.endpointUrl,
    MOVE_FOLDER,
    {
      input: {
        folderId: mobileId,
        fromFolderId: alphaId,
        toFolderId: betaId
      }
    },
    data.token,
    "TC_LT_04_MoveFolderAlphaToBeta"
  );
  check5(moveRes, {
    "Mobile folder relocated to Beta": (r) => !!r.data?.moveFolder?.id
  });
  executeGraphQL(
    data.endpointUrl,
    MOVE_FOLDER,
    {
      input: {
        folderId: mobileId,
        fromFolderId: betaId,
        toFolderId: mobileId
        // Invalid: moving folder into itself!
      }
    },
    data.token,
    "TC_LT_04_MoveFolderInvalidSelfMove",
    true
    // expectError = true
  );
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: mobileId, orderIndex: 0 } },
    data.token,
    "TC_LT_04_DeleteMobileItem"
  );
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: alphaId, orderIndex: 0 } },
    data.token,
    "TC_LT_04_DeleteAlpha"
  );
  executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    { input: { id: betaId, orderIndex: 0 } },
    data.token,
    "TC_LT_04_DeleteBeta"
  );
  sleep4(0.2);
}

// tests/k6/scenarios/delete.ts
import { sleep as sleep5, check as check6 } from "k6";
function runDeleteScenario(data) {
  const vuId = __VU;
  const iterId = __ITER;
  const prefix = `k6-delete-${data.runId}-vu${vuId}-it${iterId}`;
  const rootId = data.rootFolderId || data.rootWatchlistId || data.rootCmsId;
  const rootType = data.rootFolderType || (data.rootWatchlistId ? "watchlist" : "cms");
  const createRes = executeGraphQL(
    data.endpointUrl,
    CREATE_FOLDER,
    {
      input: {
        name: `${prefix}-Target`,
        description: "k6 delete scenario target folder",
        parentId: rootId,
        rootFolderType: rootType
      }
    },
    data.token,
    "TC_LT_05_CreatePurgeTarget"
  );
  const targetId = createRes.data?.createFolder?.id;
  check6(createRes, {
    "Target created for deletion test": () => !!targetId
  });
  if (!targetId) return;
  const deleteRes = executeGraphQL(
    data.endpointUrl,
    DELETE_FOLDER,
    {
      input: {
        id: targetId,
        orderIndex: 0
      }
    },
    data.token,
    "TC_LT_05_DeleteTarget"
  );
  check6(deleteRes, {
    "Target deleted successfully": (r) => r.status === 200 && (!r.errors || r.errors.length === 0)
  });
  executeGraphQL(
    data.endpointUrl,
    GET_FOLDER,
    { id: targetId },
    data.token,
    "TC_LT_05_VerifyTombstone",
    true
    // expectError = true
  );
  sleep5(0.1);
}

// tests/k6/main.ts
var options = getExecutionOptions();
function setup() {
  return setupAuthAndEnvironment();
}
function main_default(data) {
  const scenario = (__ENV.SCENARIO || "lifecycle").toLowerCase();
  switch (scenario) {
    case "burst":
      runBurstScenario(data);
      break;
    case "read":
      runReadScenario(data);
      break;
    case "move":
      runMoveScenario(data);
      break;
    case "delete":
      runDeleteScenario(data);
      break;
    case "lifecycle":
    default:
      runLifecycleScenario(data);
      break;
  }
}
function teardown(data) {
  teardownSweep(data);
}
function handleSummary(data) {
  return {
    "k6-report.html": generateHtmlReport(data),
    stdout: generateConsoleSummary(data)
  };
}
export {
  main_default as default,
  handleSummary,
  options,
  setup,
  teardown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vdGVzdHMvazYvY29uZmlnL3Byb2ZpbGVzLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L2hlbHBlcnMvY2xpZW50LnRzIiwgIi4uLy4uL3Rlc3RzL2dyYXBocWwvZm9sZGVyL211dGF0aW9ucy50cyIsICIuLi8uLi90ZXN0cy9ncmFwaHFsL2ZvbGRlci9xdWVyaWVzLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L2hlbHBlcnMvYXV0aC50cyIsICIuLi8uLi90ZXN0cy9rNi9oZWxwZXJzL2NsZWFudXAudHMiLCAiLi4vLi4vdGVzdHMvazYvaGVscGVycy9yZXBvcnRlci50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvbGlmZWN5Y2xlLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L3NjZW5hcmlvcy9idXJzdC50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvcmVhZC50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvbW92ZS50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvZGVsZXRlLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiazYvb3B0aW9uc1wiO1xuXG5leHBvcnQgdHlwZSBQcm9maWxlVHlwZSA9IFwic21va2VcIiB8IFwibG9hZFwiIHwgXCJzdHJlc3NcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4ZWN1dGlvbk9wdGlvbnMoKTogT3B0aW9ucyB7XG4gIGNvbnN0IHByb2ZpbGUgPSAoX19FTlYuUFJPRklMRSB8fCBcImxvYWRcIikudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdnVzT3ZlcnJpZGUgPSBfX0VOVi5WVVMgPyBwYXJzZUludChfX0VOVi5WVVMsIDEwKSA6IHVuZGVmaW5lZDtcbiAgY29uc3QgZHVyYXRpb25PdmVycmlkZSA9IF9fRU5WLkRVUkFUSU9OIHx8IHVuZGVmaW5lZDtcblxuICBjb25zdCBiYXNlVGhyZXNob2xkcyA9IHtcbiAgICBodHRwX3JlcV9mYWlsZWQ6IFtcInJhdGU8MC4wMVwiXSwgLy8gTGVzcyB0aGFuIDElIEhUVFAgZmFpbHVyZXNcbiAgICBjaGVja3M6IFtcInJhdGU+MC45OVwiXSwgICAgICAgICAgLy8gTW9yZSB0aGFuIDk5JSBjaGVjayBwYXNzIHJhdGVcbiAgICBncmFwaHFsX2Vycm9yczogW1wicmF0ZTwwLjAxXCJdLCAgLy8gTGVzcyB0aGFuIDElIGJ1c2luZXNzIGxvZ2ljIGVycm9yc1xuICB9O1xuXG4gIGlmIChwcm9maWxlID09PSBcInNtb2tlXCIpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdnVzOiB2dXNPdmVycmlkZSB8fCAxLFxuICAgICAgZHVyYXRpb246IGR1cmF0aW9uT3ZlcnJpZGUgfHwgXCIxNXNcIixcbiAgICAgIHRocmVzaG9sZHM6IHtcbiAgICAgICAgLi4uYmFzZVRocmVzaG9sZHMsXG4gICAgICAgIGh0dHBfcmVxX2R1cmF0aW9uOiBbXCJwKDk1KTwxNTAwXCIsIFwicCg5OSk8MzAwMFwiXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9maWxlID09PSBcInN0cmVzc1wiKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7IGR1cmF0aW9uOiBcIjMwc1wiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlID8gTWF0aC5mbG9vcih2dXNPdmVycmlkZSAvIDIpIDogMjUgfSxcbiAgICAgICAgeyBkdXJhdGlvbjogXCIxbVwiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlIHx8IDUwIH0sXG4gICAgICAgIHsgZHVyYXRpb246IGR1cmF0aW9uT3ZlcnJpZGUgfHwgXCIxbVwiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlIHx8IDUwIH0sXG4gICAgICAgIHsgZHVyYXRpb246IFwiMzBzXCIsIHRhcmdldDogMCB9LFxuICAgICAgXSxcbiAgICAgIHRocmVzaG9sZHM6IHtcbiAgICAgICAgLi4uYmFzZVRocmVzaG9sZHMsXG4gICAgICAgIGh0dHBfcmVxX2R1cmF0aW9uOiBbXCJwKDk1KTwyNTAwXCIsIFwicCg5OSk8NTAwMFwiXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIC8vIERlZmF1bHQ6IFwibG9hZFwiIHByb2ZpbGVcbiAgcmV0dXJuIHtcbiAgICBzdGFnZXM6IFtcbiAgICAgIHsgZHVyYXRpb246IFwiMTRzXCIsIHRhcmdldDogdnVzT3ZlcnJpZGUgfHwgNTAgfSxcbiAgICAgIHsgZHVyYXRpb246IGR1cmF0aW9uT3ZlcnJpZGUgfHwgXCIxbVwiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlIHx8IDUwIH0sXG4gICAgICB7IGR1cmF0aW9uOiBcIjEwc1wiLCB0YXJnZXQ6IDAgfSxcbiAgICBdLFxuICAgIHRocmVzaG9sZHM6IHtcbiAgICAgIC4uLmJhc2VUaHJlc2hvbGRzLFxuICAgICAgaHR0cF9yZXFfZHVyYXRpb246IFtcInAoOTUpPDE1MDBcIiwgXCJwKDk5KTwzMDAwXCJdLFxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IGh0dHAsIHsgUmVzcG9uc2UgfSBmcm9tIFwiazYvaHR0cFwiO1xuaW1wb3J0IHsgY2hlY2sgfSBmcm9tIFwiazZcIjtcbmltcG9ydCB7IFJhdGUsIFRyZW5kIH0gZnJvbSBcIms2L21ldHJpY3NcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxFcnJvcnMgPSBuZXcgUmF0ZShcImdyYXBocWxfZXJyb3JzXCIpO1xuZXhwb3J0IGNvbnN0IGdyYXBocWxEdXJhdGlvbiA9IG5ldyBUcmVuZChcImdyYXBocWxfZHVyYXRpb25cIik7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSzZHcmFwaFFMUmVzcG9uc2U8VCA9IGFueT4ge1xuICBkYXRhPzogVDtcbiAgZXJyb3JzPzogQXJyYXk8eyBtZXNzYWdlOiBzdHJpbmc7IFtrZXk6IHN0cmluZ106IGFueSB9PjtcbiAgc3RhdHVzOiBudW1iZXI7XG4gIHJhdzogUmVzcG9uc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlR3JhcGhRTDxUID0gYW55PihcbiAgZW5kcG9pbnRVcmw6IHN0cmluZyxcbiAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gIHZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSxcbiAgdG9rZW4/OiBzdHJpbmcsXG4gIG9wZXJhdGlvbk5hbWU6IHN0cmluZyA9IFwiR3JhcGhRTF9PcFwiLFxuICBleHBlY3RFcnJvcjogYm9vbGVhbiA9IGZhbHNlXG4pOiBLNkdyYXBoUUxSZXNwb25zZTxUPiB7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgYWNjZXB0OiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgfTtcblxuICBpZiAodG9rZW4pIHtcbiAgICBoZWFkZXJzW1wiYXV0aG9yaXphdGlvblwiXSA9IGBCZWFyZXIgJHt0b2tlbn1gO1xuICB9XG5cbiAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICBxdWVyeTogb3BlcmF0aW9uLFxuICAgIHZhcmlhYmxlcyxcbiAgfSk7XG5cbiAgY29uc3QgcmVzID0gaHR0cC5wb3N0KGVuZHBvaW50VXJsLCBwYXlsb2FkLCB7XG4gICAgaGVhZGVycyxcbiAgICB0YWdzOiB7IG9wZXJhdGlvbjogb3BlcmF0aW9uTmFtZSB9LFxuICB9KTtcblxuICBncmFwaHFsRHVyYXRpb24uYWRkKHJlcy50aW1pbmdzLmR1cmF0aW9uLCB7IG9wZXJhdGlvbjogb3BlcmF0aW9uTmFtZSB9KTtcblxuICBsZXQgcGFyc2VkQm9keTogYW55ID0ge307XG4gIGxldCBpc0pzb25WYWxpZCA9IGZhbHNlO1xuXG4gIHRyeSB7XG4gICAgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UocmVzLmJvZHkgPyByZXMuYm9keS50b1N0cmluZygpIDogXCJ7fVwiKTtcbiAgICBpc0pzb25WYWxpZCA9IHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHBhcnNlZEJvZHkgPSB7XG4gICAgICBlcnJvcnM6IFt7IG1lc3NhZ2U6IGBIVFRQICR7cmVzLnN0YXR1c306IEZhaWxlZCB0byBwYXJzZSBKU09OIHJlc3BvbnNlYCB9XSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgaGFzQnVzaW5lc3NFcnJvcnMgPSBBcnJheS5pc0FycmF5KHBhcnNlZEJvZHkuZXJyb3JzKSAmJiBwYXJzZWRCb2R5LmVycm9ycy5sZW5ndGggPiAwO1xuXG4gIGlmICghZXhwZWN0RXJyb3IgJiYgKHJlcy5zdGF0dXMgIT09IDIwMCB8fCBoYXNCdXNpbmVzc0Vycm9ycykpIHtcbiAgICBjb25zb2xlLmVycm9yKGBbazYgY2xpZW50IGVycm9yXSAke29wZXJhdGlvbk5hbWV9IChIVFRQICR7cmVzLnN0YXR1c30pOiAke0pTT04uc3RyaW5naWZ5KHBhcnNlZEJvZHkuZXJyb3JzIHx8IHBhcnNlZEJvZHkpfWApO1xuICB9XG5cbiAgaWYgKGV4cGVjdEVycm9yKSB7XG4gICAgY29uc3QgcGFzc2VkID0gKHJlcy5zdGF0dXMgPT09IDIwMCB8fCByZXMuc3RhdHVzID09PSA0MDApICYmIGhhc0J1c2luZXNzRXJyb3JzO1xuICAgIGNoZWNrKHJlcywge1xuICAgICAgW2Ake29wZXJhdGlvbk5hbWV9IHJlc3BvbmRlZCB3aXRoIGV4cGVjdGVkIGVycm9yYF06ICgpID0+IHBhc3NlZCxcbiAgICB9KTtcbiAgICBncmFwaHFsRXJyb3JzLmFkZChmYWxzZSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTm9ybWFsIG9wZXJhdGlvbiBleHBlY3RpbmcgMjAwIE9LIGFuZCBOTyBidXNpbmVzcyBlcnJvcnNcbiAgICBjb25zdCBwYXNzID0gY2hlY2socmVzLCB7XG4gICAgICBbYCR7b3BlcmF0aW9uTmFtZX0gc3RhdHVzIGlzIDIwMGBdOiAocikgPT4gci5zdGF0dXMgPT09IDIwMCxcbiAgICAgIFtgJHtvcGVyYXRpb25OYW1lfSByZXNwb25zZSBoYXMgdmFsaWQgSlNPTmBdOiAoKSA9PiBpc0pzb25WYWxpZCxcbiAgICAgIFtgJHtvcGVyYXRpb25OYW1lfSBoYXMgbm8gYnVzaW5lc3MgZXJyb3JzYF06ICgpID0+ICFoYXNCdXNpbmVzc0Vycm9ycyxcbiAgICB9KTtcblxuICAgIGdyYXBocWxFcnJvcnMuYWRkKCFwYXNzIHx8IGhhc0J1c2luZXNzRXJyb3JzKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZGF0YTogcGFyc2VkQm9keS5kYXRhLFxuICAgIGVycm9yczogcGFyc2VkQm9keS5lcnJvcnMsXG4gICAgc3RhdHVzOiByZXMuc3RhdHVzLFxuICAgIHJhdzogcmVzLFxuICB9O1xufVxuIiwgImV4cG9ydCBjb25zdCBVU0VSX0xPR0lOID0gYFxuICBtdXRhdGlvbiBMb2dpbigkaW5wdXQ6IFVzZXJMb2dpbiEpIHtcbiAgICB1c2VyTG9naW4oaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgdG9rZW5cbiAgICAgIHVzZXIge1xuICAgICAgICBpZFxuICAgICAgICBvcmdhbml6YXRpb25JZFxuICAgICAgICBvcmdhbml6YXRpb24ge1xuICAgICAgICAgIGlkXG4gICAgICAgICAgbmFtZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBvcmdhbml6YXRpb24ge1xuICAgICAgICBpZFxuICAgICAgICBuYW1lXG4gICAgICB9XG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgQ1JFQVRFX1JPT1RfRk9MREVSUyA9IGBcbiAgbXV0YXRpb24gQ3JlYXRlUm9vdEZvbGRlcnMoJHJvb3RGb2xkZXJUeXBlOiBSb290Rm9sZGVyVHlwZSkge1xuICAgIGNyZWF0ZVJvb3RGb2xkZXJzKHJvb3RGb2xkZXJUeXBlOiAkcm9vdEZvbGRlclR5cGUpIHtcbiAgICAgIGlkXG4gICAgICByb290Rm9sZGVyVHlwZUlkXG4gICAgICBuYW1lXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgQ1JFQVRFX0ZPTERFUiA9IGBcbiAgbXV0YXRpb24gQ3JlYXRlRm9sZGVyKCRpbnB1dDogQ3JlYXRlRm9sZGVyISkge1xuICAgIGNyZWF0ZUZvbGRlcihpbnB1dDogJGlucHV0KSB7XG4gICAgICBpZFxuICAgICAgbmFtZVxuICAgICAgZGVzY3JpcHRpb25cbiAgICB9XG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCBVUERBVEVfRk9MREVSID0gYFxuICBtdXRhdGlvbiBVcGRhdGVGb2xkZXIoJGlucHV0OiBVcGRhdGVGb2xkZXIhKSB7XG4gICAgdXBkYXRlRm9sZGVyKGlucHV0OiAkaW5wdXQpIHtcbiAgICAgIGlkXG4gICAgICBuYW1lXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgTU9WRV9GT0xERVIgPSBgXG4gIG11dGF0aW9uIE1vdmVGb2xkZXIoJGlucHV0OiBNb3ZlRm9sZGVyISkge1xuICAgIG1vdmVGb2xkZXIoaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgaWRcbiAgICAgIG5hbWVcbiAgICB9XG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCBNT1ZFX0ZPTERFUlMgPSBgXG4gIG11dGF0aW9uIE1vdmVGb2xkZXJzKCRpbnB1dDogTW92ZUZvbGRlcnMhKSB7XG4gICAgbW92ZUZvbGRlcnMoaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgb3JnYW5pemF0aW9uSWRcbiAgICAgIG5ld1BhcmVudEZvbGRlcklkXG4gICAgICB2YWxpZEZvbGRlcklkc1xuICAgICAgaW52YWxpZEZvbGRlcklkc1xuICAgICAgbWVzc2FnZVxuICAgIH1cbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IERFTEVURV9GT0xERVIgPSBgXG4gIG11dGF0aW9uIERlbGV0ZUZvbGRlcigkaW5wdXQ6IERlbGV0ZUZvbGRlciEpIHtcbiAgICBkZWxldGVGb2xkZXIoaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgbWVzc2FnZVxuICAgIH1cbiAgfVxuYDtcbiIsICJleHBvcnQgY29uc3QgQ0hFQ0tfUk9PVF9GT0xERVJTID0gYFxuICBxdWVyeSBDaGVja1Jvb3RGb2xkZXJzKCR0eXBlOiBSb290Rm9sZGVyVHlwZSkge1xuICAgIHJvb3RGb2xkZXJzKHR5cGU6ICR0eXBlKSB7XG4gICAgICBpZFxuICAgICAgdHlwZUlkXG4gICAgICByb290Rm9sZGVyVHlwZUlkXG4gICAgICBuYW1lXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgR0VUX1JPT1RfRk9MREVSUyA9IGBcbiAgcXVlcnkgR2V0Um9vdEZvbGRlcnMge1xuICAgIHJvb3RGb2xkZXJzIHtcbiAgICAgIGlkXG4gICAgICBvd25lcklkXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgR0VUX0ZPTERFUiA9IGBcbiAgcXVlcnkgR2V0Rm9sZGVyKCRpZDogSUQhKSB7XG4gICAgZm9sZGVyKGlkOiAkaWQpIHtcbiAgICAgIGlkXG4gICAgICBuYW1lXG4gICAgICBjaGlsZEZvbGRlcnMge1xuICAgICAgICByZWNvcmRzIHtcbiAgICAgICAgICBpZFxuICAgICAgICAgIG5hbWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IEdFVF9GT0xERVJfT1ZFUlZJRVcgPSBgXG4gIHF1ZXJ5IEdldEZvbGRlck92ZXJ2aWV3KCRpZHM6IFtJRCFdISkge1xuICAgIGZvbGRlck92ZXJ2aWV3KGlkczogJGlkcykge1xuICAgICAgY2hpbGRGb2xkZXJzQ291bnRcbiAgICAgIGNoaWxkTm9uRm9sZGVyT2JqZWN0c0NvdW50XG4gICAgfVxuICB9XG5gO1xuIiwgImltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4vY2xpZW50XCI7XG5pbXBvcnQgeyBVU0VSX0xPR0lOLCBDUkVBVEVfUk9PVF9GT0xERVJTIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL211dGF0aW9uc1wiO1xuaW1wb3J0IHsgQ0hFQ0tfUk9PVF9GT0xERVJTIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL3F1ZXJpZXNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTZXR1cERhdGEge1xuICBlbmRwb2ludFVybDogc3RyaW5nO1xuICB0b2tlbjogc3RyaW5nO1xuICBvcmdhbml6YXRpb25JZDogc3RyaW5nO1xuICByb290Q21zSWQ6IHN0cmluZztcbiAgcm9vdFdhdGNobGlzdElkOiBzdHJpbmc7XG4gIHJvb3RGb2xkZXJJZDogc3RyaW5nO1xuICByb290Rm9sZGVyVHlwZTogc3RyaW5nO1xuICBydW5JZDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBBdXRoQW5kRW52aXJvbm1lbnQoKTogU2V0dXBEYXRhIHtcbiAgY29uc3QgZW5kcG9pbnRVcmwgPVxuICAgIF9fRU5WLkdSQVBIUUxfQVBJX1VSTCB8fFxuICAgIHByb2Nlc3MuZW52LkdSQVBIUUxfQVBJX1VSTCB8fFxuICAgIFwiaHR0cHM6Ly9hcGkuc3RhZ2UudXMtMS52ZXJpdG9uZS5jb20vdjMvZ3JhcGhxbFwiO1xuXG4gIGNvbnN0IHVzZXJOYW1lID1cbiAgICBfX0VOVi5BVVRIX1VTRVJfTkFNRSB8fFxuICAgIHByb2Nlc3MuZW52LkFVVEhfVVNFUl9OQU1FIHx8XG4gICAgXCJcIjtcblxuICBjb25zdCBwYXNzd29yZCA9XG4gICAgX19FTlYuQVVUSF9QQVNTV09SRCB8fFxuICAgIHByb2Nlc3MuZW52LkFVVEhfUEFTU1dPUkQgfHxcbiAgICBcIlwiO1xuXG4gIGlmICghdXNlck5hbWUgfHwgIXBhc3N3b3JkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyBBVVRIX1VTRVJfTkFNRSBvciBBVVRIX1BBU1NXT1JEIGNyZWRlbnRpYWxzIGZvciBrNiBsb2FkIHRlc3RcIik7XG4gIH1cblxuICAvLyAxLiBBdXRoZW50aWNhdGUgYWdhaW5zdCBhaVdBUkUgR3JhcGhRTCBBUElcbiAgY29uc3QgbG9naW5SZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBlbmRwb2ludFVybCxcbiAgICBVU0VSX0xPR0lOLFxuICAgIHtcbiAgICAgIGlucHV0OiB7IHVzZXJOYW1lLCBwYXNzd29yZCB9LFxuICAgIH0sXG4gICAgdW5kZWZpbmVkLFxuICAgIFwiU2V0dXBfVXNlckxvZ2luXCJcbiAgKTtcblxuICBpZiAobG9naW5SZXMuZXJyb3JzICYmIGxvZ2luUmVzLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBrNiBzZXR1cCBsb2dpbiBmYWlsZWQ6ICR7bG9naW5SZXMuZXJyb3JzLm1hcCgoZSkgPT4gZS5tZXNzYWdlKS5qb2luKFwiLCBcIil9YCk7XG4gIH1cblxuICBjb25zdCB0b2tlbiA9IGxvZ2luUmVzLmRhdGE/LnVzZXJMb2dpbj8udG9rZW47XG4gIGNvbnN0IG9yZ2FuaXphdGlvbklkID1cbiAgICBsb2dpblJlcy5kYXRhPy51c2VyTG9naW4/LnVzZXI/Lm9yZ2FuaXphdGlvbklkIHx8XG4gICAgbG9naW5SZXMuZGF0YT8udXNlckxvZ2luPy5vcmdhbml6YXRpb24/LmlkIHx8XG4gICAgXCJcIjtcblxuICBpZiAoIXRva2VuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiazYgc2V0dXAgbG9naW4gZmFpbGVkOiBObyBiZWFyZXIgdG9rZW4gcmV0dXJuZWRcIik7XG4gIH1cblxuICAvLyAyLiBEaXNjb3ZlciBvciBib290c3RyYXAgQ01TIHJvb3QgZm9sZGVyIGFuY2hvclxuICBsZXQgcm9vdENtc0lkID0gXCJcIjtcbiAgY29uc3QgY21zUm9vdFJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGVuZHBvaW50VXJsLFxuICAgIENIRUNLX1JPT1RfRk9MREVSUyxcbiAgICB7IHR5cGU6IFwiY21zXCIgfSxcbiAgICB0b2tlbixcbiAgICBcIlNldHVwX0NoZWNrQ21zUm9vdFwiXG4gICk7XG5cbiAgaWYgKGNtc1Jvb3RSZXMuZGF0YT8ucm9vdEZvbGRlcnMgJiYgY21zUm9vdFJlcy5kYXRhLnJvb3RGb2xkZXJzLmxlbmd0aCA+IDApIHtcbiAgICByb290Q21zSWQgPSBjbXNSb290UmVzLmRhdGEucm9vdEZvbGRlcnNbMF0uaWQ7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgY21zQ3JlYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICBlbmRwb2ludFVybCxcbiAgICAgIENSRUFURV9ST09UX0ZPTERFUlMsXG4gICAgICB7IHJvb3RGb2xkZXJUeXBlOiBcImNtc1wiIH0sXG4gICAgICB0b2tlbixcbiAgICAgIFwiU2V0dXBfQ3JlYXRlQ21zUm9vdFwiXG4gICAgKTtcbiAgICByb290Q21zSWQgPSBjbXNDcmVhdGVSZXMuZGF0YT8uY3JlYXRlUm9vdEZvbGRlcnM/LlswXT8uaWQgfHwgXCJcIjtcbiAgfVxuXG4gIC8vIDMuIERpc2NvdmVyIG9yIGJvb3RzdHJhcCBXYXRjaGxpc3Qgcm9vdCBmb2xkZXIgYW5jaG9yXG4gIGxldCByb290V2F0Y2hsaXN0SWQgPSBcIlwiO1xuICBjb25zdCB3bFJvb3RSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBlbmRwb2ludFVybCxcbiAgICBDSEVDS19ST09UX0ZPTERFUlMsXG4gICAgeyB0eXBlOiBcIndhdGNobGlzdFwiIH0sXG4gICAgdG9rZW4sXG4gICAgXCJTZXR1cF9DaGVja1dhdGNobGlzdFJvb3RcIlxuICApO1xuXG4gIGlmICh3bFJvb3RSZXMuZGF0YT8ucm9vdEZvbGRlcnMgJiYgd2xSb290UmVzLmRhdGEucm9vdEZvbGRlcnMubGVuZ3RoID4gMCkge1xuICAgIHJvb3RXYXRjaGxpc3RJZCA9IHdsUm9vdFJlcy5kYXRhLnJvb3RGb2xkZXJzWzBdLmlkO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHdsQ3JlYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICBlbmRwb2ludFVybCxcbiAgICAgIENSRUFURV9ST09UX0ZPTERFUlMsXG4gICAgICB7IHJvb3RGb2xkZXJUeXBlOiBcIndhdGNobGlzdFwiIH0sXG4gICAgICB0b2tlbixcbiAgICAgIFwiU2V0dXBfQ3JlYXRlV2F0Y2hsaXN0Um9vdFwiXG4gICAgKTtcbiAgICByb290V2F0Y2hsaXN0SWQgPSB3bENyZWF0ZVJlcy5kYXRhPy5jcmVhdGVSb290Rm9sZGVycz8uWzBdPy5pZCB8fCBcIlwiO1xuICB9XG5cbiAgY29uc3Qgcm9vdEZvbGRlcklkID0gcm9vdFdhdGNobGlzdElkIHx8IHJvb3RDbXNJZDtcbiAgY29uc3Qgcm9vdEZvbGRlclR5cGUgPSByb290V2F0Y2hsaXN0SWQgPyBcIndhdGNobGlzdFwiIDogXCJjbXNcIjtcblxuICBpZiAoIXJvb3RGb2xkZXJJZCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIms2IHNldHVwIGZhaWxlZDogQ291bGQgbm90IHJlc29sdmUgb3IgaW5pdGlhbGl6ZSBhbnkgcm9vdCBmb2xkZXIgYW5jaG9yXCIpO1xuICB9XG5cbiAgLy8gNC4gR2VuZXJhdGUgdW5pcXVlIHJ1biBzZXNzaW9uIHRhZ1xuICBjb25zdCBydW5JZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCA5KTtcblxuICByZXR1cm4ge1xuICAgIGVuZHBvaW50VXJsLFxuICAgIHRva2VuLFxuICAgIG9yZ2FuaXphdGlvbklkLFxuICAgIHJvb3RDbXNJZCxcbiAgICByb290V2F0Y2hsaXN0SWQsXG4gICAgcm9vdEZvbGRlcklkLFxuICAgIHJvb3RGb2xkZXJUeXBlLFxuICAgIHJ1bklkLFxuICB9O1xufVxuIiwgImltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4vY2xpZW50XCI7XG5pbXBvcnQgeyBTZXR1cERhdGEgfSBmcm9tIFwiLi9hdXRoXCI7XG5pbXBvcnQgeyBHRVRfRk9MREVSIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL3F1ZXJpZXNcIjtcbmltcG9ydCB7IERFTEVURV9GT0xERVIgfSBmcm9tIFwiLi4vLi4vZ3JhcGhxbC9mb2xkZXIvbXV0YXRpb25zXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiB0ZWFyZG93blN3ZWVwKGRhdGE6IFNldHVwRGF0YSk6IHZvaWQge1xuICBpZiAoIWRhdGEgfHwgIWRhdGEudG9rZW4pIHtcbiAgICBjb25zb2xlLmxvZyhcIltrNiB0ZWFyZG93bl0gU2tpcHBpbmcgc3dlZXA6IE1pc3Npbmcgc2Vzc2lvbiBkYXRhXCIpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHJvb3RJZHMgPSBBcnJheS5mcm9tKFxuICAgIG5ldyBTZXQoW2RhdGEucm9vdEZvbGRlcklkLCBkYXRhLnJvb3RDbXNJZCwgZGF0YS5yb290V2F0Y2hsaXN0SWRdLmZpbHRlcihCb29sZWFuKSlcbiAgKTtcblxuICBjb25zb2xlLmxvZyhgW2s2IHRlYXJkb3duXSBTdGFydGluZyBidWxrIHN3ZWVwIGZvciBydW5JZDogJHtkYXRhLnJ1bklkfS4uLmApO1xuICBsZXQgdG90YWxEZWxldGVkID0gMDtcblxuICBmb3IgKGNvbnN0IHJvb3RJZCBvZiByb290SWRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJvb3RGb2xkZXJSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgICAgR0VUX0ZPTERFUixcbiAgICAgICAgeyBpZDogcm9vdElkIH0sXG4gICAgICAgIGRhdGEudG9rZW4sXG4gICAgICAgIFwiVGVhcmRvd25fR2V0Um9vdENoaWxkcmVuXCJcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IHJlY29yZHM6IEFycmF5PHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0+ID1cbiAgICAgICAgcm9vdEZvbGRlclJlcy5kYXRhPy5mb2xkZXI/LmNoaWxkRm9sZGVycz8ucmVjb3JkcyB8fCBbXTtcblxuICAgICAgY29uc3QgcnVuUHJlZml4ID0gYGs2LWA7XG4gICAgICBjb25zdCBtYXRjaGluZ0ZvbGRlcnMgPSByZWNvcmRzLmZpbHRlcihcbiAgICAgICAgKGYpID0+IGYubmFtZSAmJiBmLm5hbWUuc3RhcnRzV2l0aChydW5QcmVmaXgpICYmIGYubmFtZS5pbmNsdWRlcyhkYXRhLnJ1bklkKVxuICAgICAgKTtcblxuICAgICAgaWYgKG1hdGNoaW5nRm9sZGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbazYgdGVhcmRvd25dIEZvdW5kICR7bWF0Y2hpbmdGb2xkZXJzLmxlbmd0aH0gdGVzdCBmb2xkZXIocykgdW5kZXIgcm9vdCAke3Jvb3RJZH1gXG4gICAgICAgICk7XG5cbiAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgbWF0Y2hpbmdGb2xkZXJzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIGZvbGRlciBoYXMgc3ViY2hpbGRyZW4gdG8gcHJ1bmUgZmlyc3RcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICAgICAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICAgICAgICAgIEdFVF9GT0xERVIsXG4gICAgICAgICAgICAgIHsgaWQ6IGZvbGRlci5pZCB9LFxuICAgICAgICAgICAgICBkYXRhLnRva2VuLFxuICAgICAgICAgICAgICBcIlRlYXJkb3duX0dldFN1YkNoaWxkcmVuXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBzdWJSZWNvcmRzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gPVxuICAgICAgICAgICAgICBjaGlsZFJlcy5kYXRhPy5mb2xkZXI/LmNoaWxkRm9sZGVycz8ucmVjb3JkcyB8fCBbXTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBzdWIgb2Ygc3ViUmVjb3Jkcykge1xuICAgICAgICAgICAgICBleGVjdXRlR3JhcGhRTChcbiAgICAgICAgICAgICAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgICAgICAgICAgICAgIERFTEVURV9GT0xERVIsXG4gICAgICAgICAgICAgICAgeyBpbnB1dDogeyBpZDogc3ViLmlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICAgICAgICAgICAgICBkYXRhLnRva2VuLFxuICAgICAgICAgICAgICAgIFwiVGVhcmRvd25fRGVsZXRlU3ViQ2hpbGRcIlxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBkZWxldGVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICAgICAgICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgICAgICAgICAgREVMRVRFX0ZPTERFUixcbiAgICAgICAgICAgICAgeyBpbnB1dDogeyBpZDogZm9sZGVyLmlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICAgICAgICAgICAgZGF0YS50b2tlbixcbiAgICAgICAgICAgICAgXCJUZWFyZG93bl9EZWxldGVGb2xkZXJcIlxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKCFkZWxldGVSZXMuZXJyb3JzIHx8IGRlbGV0ZVJlcy5lcnJvcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHRvdGFsRGVsZXRlZCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBmb3IgYWxyZWFkeSBkZWxldGVkIGZvbGRlcnNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIElnbm9yZSByb290IHF1ZXJ5IGVycm9yc1xuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUubG9nKGBbazYgdGVhcmRvd25dIFN3ZWVwIGNvbXBsZXRlOiBDbGVhbmx5IGRlbGV0ZWQgJHt0b3RhbERlbGV0ZWR9IHRlc3QgZm9sZGVyKHMpLmApO1xufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUh0bWxSZXBvcnQoZGF0YTogYW55KTogc3RyaW5nIHtcbiAgY29uc3QgbWV0cmljcyA9IGRhdGEubWV0cmljcyB8fCB7fTtcbiAgY29uc3Qgcm9vdEdyb3VwID0gZGF0YS5yb290X2dyb3VwIHx8IHt9O1xuXG4gIGNvbnN0IGh0dHBSZXFEdXJhdGlvbiA9IG1ldHJpY3MuaHR0cF9yZXFfZHVyYXRpb24/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgaHR0cFJlcXMgPSBtZXRyaWNzLmh0dHBfcmVxcz8udmFsdWVzIHx8IHt9O1xuICBjb25zdCBodHRwRmFpbGVkID0gbWV0cmljcy5odHRwX3JlcV9mYWlsZWQ/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgdnVzID0gbWV0cmljcy52dXM/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgY2hlY2tzID0gbWV0cmljcy5jaGVja3M/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgZ3JhcGhxbEVycm9ycyA9IG1ldHJpY3MuZ3JhcGhxbF9lcnJvcnM/LnZhbHVlcyB8fCB7fTtcblxuICBmdW5jdGlvbiBmbXRNcyhudW06IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gICAgaWYgKG51bSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKG51bSkpIHJldHVybiBcIk4vQVwiO1xuICAgIHJldHVybiBudW0gPj0gMTAwMCA/IChudW0gLyAxMDAwKS50b0ZpeGVkKDIpICsgXCJzXCIgOiBudW0udG9GaXhlZCgxKSArIFwibXNcIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZtdFBjdChudW06IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gICAgaWYgKG51bSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKG51bSkpIHJldHVybiBcIjAuMCVcIjtcbiAgICByZXR1cm4gKG51bSAqIDEwMCkudG9GaXhlZCgyKSArIFwiJVwiO1xuICB9XG5cbiAgLy8gQ291bnQgY2hlY2tzIHJlY3Vyc2l2ZWx5XG4gIGxldCBwYXNzZWRDaGVja3MgPSAwO1xuICBsZXQgZmFpbGVkQ2hlY2tzID0gMDtcbiAgZnVuY3Rpb24gY291bnRDaGVja3MoZ3JvdXA6IGFueSkge1xuICAgIGlmIChncm91cC5jaGVja3MpIHtcbiAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgZ3JvdXAuY2hlY2tzKSB7XG4gICAgICAgIHBhc3NlZENoZWNrcyArPSBjaGVjay5wYXNzZXMgfHwgMDtcbiAgICAgICAgZmFpbGVkQ2hlY2tzICs9IGNoZWNrLmZhaWxzIHx8IDA7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChncm91cC5ncm91cHMpIHtcbiAgICAgIGZvciAoY29uc3Qgc3ViR3JvdXAgb2YgZ3JvdXAuZ3JvdXBzKSB7XG4gICAgICAgIGNvdW50Q2hlY2tzKHN1Ykdyb3VwKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY291bnRDaGVja3Mocm9vdEdyb3VwKTtcblxuICBjb25zdCB0b3RhbENoZWNrcyA9IHBhc3NlZENoZWNrcyArIGZhaWxlZENoZWNrcztcbiAgY29uc3QgY2hlY2tzUGFzc1JhdGUgPSB0b3RhbENoZWNrcyA+IDAgPyAocGFzc2VkQ2hlY2tzIC8gdG90YWxDaGVja3MpICogMTAwIDogMTAwO1xuICBjb25zdCBpc0hlYWx0aHkgPSAoaHR0cEZhaWxlZC5yYXRlIHx8IDApIDwgMC4wMSAmJiAoZ3JhcGhxbEVycm9ycy5yYXRlIHx8IDApIDwgMC4wMTtcblxuICAvLyBCdWlsZCBjaGVja3MgbGlzdFxuICBsZXQgY2hlY2tzSHRtbCA9IFwiXCI7XG4gIGZ1bmN0aW9uIHJlbmRlckNoZWNrcyhncm91cDogYW55KSB7XG4gICAgaWYgKGdyb3VwLmNoZWNrcyAmJiBncm91cC5jaGVja3MubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChjb25zdCBjIG9mIGdyb3VwLmNoZWNrcykge1xuICAgICAgICBjb25zdCBwYXNzID0gKGMuZmFpbHMgfHwgMCkgPT09IDA7XG4gICAgICAgIGNoZWNrc0h0bWwgKz0gYFxuICAgICAgICAgIDx0ciBjbGFzcz1cIiR7cGFzcyA/IFwiY2hlY2stcGFzc1wiIDogXCJjaGVjay1mYWlsXCJ9XCI+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJmb250LXdlaWdodDogNTAwO1wiPiR7Yy5uYW1lfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJ0ZXh0LWFsaWduOiBjZW50ZXI7XCI+JHtwYXNzID8gXCJcdTI3MTMgUEFTU1wiIDogXCJcdTI3MTcgRkFJTFwifTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJ0ZXh0LWFsaWduOiByaWdodDtcIj4ke2MucGFzc2VzfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJ0ZXh0LWFsaWduOiByaWdodDsgY29sb3I6ICR7Yy5mYWlscyA+IDAgPyBcIiNlZjQ0NDRcIiA6IFwiaW5oZXJpdFwifTtcIj4ke2MuZmFpbHN9PC90ZD5cbiAgICAgICAgICA8L3RyPlxuICAgICAgICBgO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZ3JvdXAuZ3JvdXBzKSB7XG4gICAgICBmb3IgKGNvbnN0IGcgb2YgZ3JvdXAuZ3JvdXBzKSB7XG4gICAgICAgIHJlbmRlckNoZWNrcyhnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmVuZGVyQ2hlY2tzKHJvb3RHcm91cCk7XG5cbiAgcmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cbjxodG1sIGxhbmc9XCJlblwiPlxuPGhlYWQ+XG4gIDxtZXRhIGNoYXJzZXQ9XCJVVEYtOFwiPlxuICA8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PVwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMFwiPlxuICA8dGl0bGU+azYgTG9hZCBUZXN0IEV4ZWN1dGlvbiBSZXBvcnQ8L3RpdGxlPlxuICA8c3R5bGU+XG4gICAgOnJvb3Qge1xuICAgICAgLS1iZzogIzBmMTcyYTtcbiAgICAgIC0tY2FyZC1iZzogIzFlMjkzYjtcbiAgICAgIC0tdGV4dDogI2Y4ZmFmYztcbiAgICAgIC0tdGV4dC1tdXRlZDogIzk0YTNiODtcbiAgICAgIC0tYm9yZGVyOiAjMzM0MTU1O1xuICAgICAgLS1wcmltYXJ5OiAjMzhiZGY4O1xuICAgICAgLS1zdWNjZXNzOiAjMjJjNTVlO1xuICAgICAgLS1kYW5nZXI6ICNlZjQ0NDQ7XG4gICAgICAtLXdhcm5pbmc6ICNmNTllMGI7XG4gICAgfVxuICAgIGJvZHkge1xuICAgICAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgJ1NlZ29lIFVJJywgUm9ib3RvLCBIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICAgICAgYmFja2dyb3VuZC1jb2xvcjogdmFyKC0tYmcpO1xuICAgICAgY29sb3I6IHZhcigtLXRleHQpO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMnJlbTtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU7XG4gICAgfVxuICAgIC5jb250YWluZXIge1xuICAgICAgbWF4LXdpZHRoOiAxMjAwcHg7XG4gICAgICBtYXJnaW46IDAgYXV0bztcbiAgICB9XG4gICAgaGVhZGVyIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbiAgICAgIHBhZGRpbmctYm90dG9tOiAxcmVtO1xuICAgICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG4gICAgfVxuICAgIGgxIHtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcbiAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICBjb2xvcjogdmFyKC0tcHJpbWFyeSk7XG4gICAgfVxuICAgIC5iYWRnZSB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBwYWRkaW5nOiAwLjM1cmVtIDAuODVyZW07XG4gICAgICBib3JkZXItcmFkaXVzOiA5OTk5cHg7XG4gICAgICBmb250LXNpemU6IDAuODc1cmVtO1xuICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgfVxuICAgIC5iYWRnZS1zdWNjZXNzIHsgYmFja2dyb3VuZDogcmdiYSgzNCwgMTk3LCA5NCwgMC4yKTsgY29sb3I6IHZhcigtLXN1Y2Nlc3MpOyBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1zdWNjZXNzKTsgfVxuICAgIC5iYWRnZS1mYWlsIHsgYmFja2dyb3VuZDogcmdiYSgyMzksIDY4LCA2OCwgMC4yKTsgY29sb3I6IHZhcigtLWRhbmdlcik7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWRhbmdlcik7IH1cbiAgICBcbiAgICAuZ3JpZCB7XG4gICAgICBkaXNwbGF5OiBncmlkO1xuICAgICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoYXV0by1maXQsIG1pbm1heCgyMjBweCwgMWZyKSk7XG4gICAgICBnYXA6IDFyZW07XG4gICAgICBtYXJnaW4tYm90dG9tOiAycmVtO1xuICAgIH1cbiAgICAuY2FyZCB7XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBwYWRkaW5nOiAxLjI1cmVtO1xuICAgIH1cbiAgICAuY2FyZC10aXRsZSB7XG4gICAgICBmb250LXNpemU6IDAuODVyZW07XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDVlbTtcbiAgICAgIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcbiAgICB9XG4gICAgLmNhcmQtdmFsIHtcbiAgICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcbiAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgfVxuICAgIFxuICAgIHRhYmxlIHtcbiAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgYm9yZGVyLWNvbGxhcHNlOiBjb2xsYXBzZTtcbiAgICAgIG1hcmdpbi10b3A6IDFyZW07XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO1xuICAgIH1cbiAgICB0aCwgdGQge1xuICAgICAgcGFkZGluZzogMC43NXJlbSAxcmVtO1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO1xuICAgIH1cbiAgICB0aCB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDE1LCAyMywgNDIsIDAuNik7XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgZm9udC1zaXplOiAwLjg1cmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICB9XG4gICAgLnNlY3Rpb24tdGl0bGUge1xuICAgICAgZm9udC1zaXplOiAxLjI1cmVtO1xuICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgIG1hcmdpbi10b3A6IDJyZW07XG4gICAgICBtYXJnaW4tYm90dG9tOiAwLjc1cmVtO1xuICAgICAgY29sb3I6IHZhcigtLXRleHQpO1xuICAgIH1cbiAgPC9zdHlsZT5cbjwvaGVhZD5cbjxib2R5PlxuICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XG4gICAgPGhlYWRlcj5cbiAgICAgIDxkaXY+XG4gICAgICAgIDxoMT5haVdBUkUgR3JhcGhRTCBrNiBMb2FkIFRlc3QgUmVwb3J0PC9oMT5cbiAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgZm9udC1zaXplOiAwLjlyZW07IG1hcmdpbi10b3A6IDAuMjVyZW07XCI+XG4gICAgICAgICAgRXhlY3V0ZWQgb24gJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9IHwgVGFyZ2V0OiBWZXJpdG9uZSBhaVdBUkUgRm9sZGVyIExpZmVjeWNsZVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJiYWRnZSAke2lzSGVhbHRoeSA/IFwiYmFkZ2Utc3VjY2Vzc1wiIDogXCJiYWRnZS1mYWlsXCJ9XCI+XG4gICAgICAgICAgJHtpc0hlYWx0aHkgPyBcIkhFQUxUSFkgLyBQQVNTRURcIiA6IFwiRkFJTFVSRVMgREVURUNURURcIn1cbiAgICAgICAgPC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgPC9oZWFkZXI+XG5cbiAgICA8ZGl2IGNsYXNzPVwiZ3JpZFwiPlxuICAgICAgPGRpdiBjbGFzcz1cImNhcmRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdGl0bGVcIj5Ub3RhbCBSZXF1ZXN0czwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC12YWxcIj4ke2h0dHBSZXFzLmNvdW50IHx8IDB9PC9kaXY+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGZvbnQtc2l6ZTogMC44NXJlbTsgbWFyZ2luLXRvcDogMC4yNXJlbTtcIj5cbiAgICAgICAgICBSYXRlOiAkeyhodHRwUmVxcy5yYXRlIHx8IDApLnRvRml4ZWQoMSl9IHJlcS9zXG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLXRpdGxlXCI+SFRUUCBGYWlsdXJlIFJhdGU8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdmFsXCIgc3R5bGU9XCJjb2xvcjogJHsoaHR0cEZhaWxlZC5yYXRlIHx8IDApID4gMCA/IFwidmFyKC0tZGFuZ2VyKVwiIDogXCJ2YXIoLS1zdWNjZXNzKVwifTtcIj5cbiAgICAgICAgICAke2ZtdFBjdChodHRwRmFpbGVkLnJhdGUpfVxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgZm9udC1zaXplOiAwLjg1cmVtOyBtYXJnaW4tdG9wOiAwLjI1cmVtO1wiPlxuICAgICAgICAgIEZhaWxlZDogJHtodHRwRmFpbGVkLnBhc3NlcyB8fCAwfSByZXFzXG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLXRpdGxlXCI+Q2hlY2tzIFBhc3MgUmF0ZTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC12YWxcIiBzdHlsZT1cImNvbG9yOiAke2NoZWNrc1Bhc3NSYXRlID49IDk5ID8gXCJ2YXIoLS1zdWNjZXNzKVwiIDogXCJ2YXIoLS1kYW5nZXIpXCJ9O1wiPlxuICAgICAgICAgICR7Y2hlY2tzUGFzc1JhdGUudG9GaXhlZCgxKX0lXG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpOyBmb250LXNpemU6IDAuODVyZW07IG1hcmdpbi10b3A6IDAuMjVyZW07XCI+XG4gICAgICAgICAgJHtwYXNzZWRDaGVja3N9IHBhc3NlZCAvICR7ZmFpbGVkQ2hlY2tzfSBmYWlsZWRcbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cImNhcmRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdGl0bGVcIj5NYXggVmlydHVhbCBVc2VyczwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC12YWxcIj4ke3Z1cy5tYXggfHwgdnVzLnZhbHVlIHx8IDF9PC9kaXY+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGZvbnQtc2l6ZTogMC44NXJlbTsgbWFyZ2luLXRvcDogMC4yNXJlbTtcIj5cbiAgICAgICAgICBHcmFwaFFMIEVycm9yczogJHtmbXRQY3QoZ3JhcGhxbEVycm9ycy5yYXRlKX1cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgY2xhc3M9XCJzZWN0aW9uLXRpdGxlXCI+SFRUUCBUaW1pbmcgUGVyY2VudGlsZXM8L2Rpdj5cbiAgICA8dGFibGU+XG4gICAgICA8dGhlYWQ+XG4gICAgICAgIDx0cj5cbiAgICAgICAgICA8dGg+TWV0cmljPC90aD5cbiAgICAgICAgICA8dGg+TWluPC90aD5cbiAgICAgICAgICA8dGg+TWVkaWFuIChwNTApPC90aD5cbiAgICAgICAgICA8dGg+cCg5MCk8L3RoPlxuICAgICAgICAgIDx0aD5wKDk1KTwvdGg+XG4gICAgICAgICAgPHRoPk1heDwvdGg+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RoZWFkPlxuICAgICAgPHRib2R5PlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRkIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDYwMDtcIj5odHRwX3JlcV9kdXJhdGlvbjwvdGQ+XG4gICAgICAgICAgPHRkPiR7Zm10TXMoaHR0cFJlcUR1cmF0aW9uLm1pbil9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtmbXRNcyhodHRwUmVxRHVyYXRpb24ubWVkKX08L3RkPlxuICAgICAgICAgIDx0ZD4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbltcInAoOTApXCJdKX08L3RkPlxuICAgICAgICAgIDx0ZCBzdHlsZT1cImNvbG9yOiB2YXIoLS1wcmltYXJ5KTsgZm9udC13ZWlnaHQ6IDYwMDtcIj4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbltcInAoOTUpXCJdKX08L3RkPlxuICAgICAgICAgIDx0ZD4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbi5tYXgpfTwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3Rib2R5PlxuICAgIDwvdGFibGU+XG5cbiAgICA8ZGl2IGNsYXNzPVwic2VjdGlvbi10aXRsZVwiPkFzc2VydGlvbiBDaGVja3MgQnJlYWtkb3duPC9kaXY+XG4gICAgPHRhYmxlPlxuICAgICAgPHRoZWFkPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRoPkNoZWNrIE5hbWU8L3RoPlxuICAgICAgICAgIDx0aCBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjtcIj5TdGF0dXM8L3RoPlxuICAgICAgICAgIDx0aCBzdHlsZT1cInRleHQtYWxpZ246IHJpZ2h0O1wiPlBhc3NlczwvdGg+XG4gICAgICAgICAgPHRoIHN0eWxlPVwidGV4dC1hbGlnbjogcmlnaHQ7XCI+RmFpbHM8L3RoPlxuICAgICAgICA8L3RyPlxuICAgICAgPC90aGVhZD5cbiAgICAgIDx0Ym9keT5cbiAgICAgICAgJHtjaGVja3NIdG1sIHx8IFwiPHRyPjx0ZCBjb2xzcGFuPSc0JyBzdHlsZT0ndGV4dC1hbGlnbjpjZW50ZXI7Jz5ObyBpbmRpdmlkdWFsIGNoZWNrcyByZWNvcmRlZDwvdGQ+PC90cj5cIn1cbiAgICAgIDwvdGJvZHk+XG4gICAgPC90YWJsZT5cbiAgPC9kaXY+XG48L2JvZHk+XG48L2h0bWw+YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ29uc29sZVN1bW1hcnkoZGF0YTogYW55KTogc3RyaW5nIHtcbiAgY29uc3QgbWV0cmljcyA9IGRhdGEubWV0cmljcyB8fCB7fTtcbiAgY29uc3QgaHR0cER1cmF0aW9uID0gbWV0cmljcy5odHRwX3JlcV9kdXJhdGlvbj8udmFsdWVzIHx8IHt9O1xuICBjb25zdCByZXFzID0gbWV0cmljcy5odHRwX3JlcXM/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgZmFpbGVkID0gbWV0cmljcy5odHRwX3JlcV9mYWlsZWQ/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgY2hlY2tzID0gbWV0cmljcy5jaGVja3M/LnZhbHVlcyB8fCB7fTtcblxuICByZXR1cm4gYFxuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgICAgICAgICAgICAgICAgazYgTE9BRCBURVNUIEVYRUNVVElPTiBTVU1NQVJZXG49PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuVG90YWwgUmVxdWVzdHM6ICAgICR7cmVxcy5jb3VudCB8fCAwfSAoJHsocmVxcy5yYXRlIHx8IDApLnRvRml4ZWQoMSl9IHJlcS9zKVxuSFRUUCBGYWlsdXJlczogICAgICR7KChmYWlsZWQucmF0ZSB8fCAwKSAqIDEwMCkudG9GaXhlZCgyKX0lICgke2ZhaWxlZC5wYXNzZXMgfHwgMH0gZmFpbGVkKVxuQ2hlY2tzIFBhc3MgUmF0ZTogICR7KChjaGVja3MucmF0ZSB8fCAwKSAqIDEwMCkudG9GaXhlZCgxKX0lICgke2NoZWNrcy5wYXNzZXMgfHwgMH0gcGFzc2VkIC8gJHtjaGVja3MuZmFpbHMgfHwgMH0gZmFpbGVkKVxuLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbkR1cmF0aW9uIChwNTApOiAgICAkeyhodHRwRHVyYXRpb24ubWVkIHx8IDApLnRvRml4ZWQoMSl9IG1zXG5EdXJhdGlvbiAocDkwKTogICAgJHsoaHR0cER1cmF0aW9uW1wicCg5MClcIl0gfHwgMCkudG9GaXhlZCgxKX0gbXNcbkR1cmF0aW9uIChwOTUpOiAgICAkeyhodHRwRHVyYXRpb25bXCJwKDk1KVwiXSB8fCAwKS50b0ZpeGVkKDEpfSBtc1xuRHVyYXRpb24gKG1heCk6ICAgICR7KGh0dHBEdXJhdGlvbi5tYXggfHwgMCkudG9GaXhlZCgxKX0gbXNcbj09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5IVE1MIFJlcG9ydCB3cml0dGVuIHRvOiBrNi1yZXBvcnQuaHRtbFxuYDtcbn1cblxuIiwgImltcG9ydCB7IHNsZWVwLCBjaGVjayB9IGZyb20gXCJrNlwiO1xuaW1wb3J0IHsgZXhlY3V0ZUdyYXBoUUwgfSBmcm9tIFwiLi4vaGVscGVycy9jbGllbnRcIjtcbmltcG9ydCB7IFNldHVwRGF0YSB9IGZyb20gXCIuLi9oZWxwZXJzL2F1dGhcIjtcbmltcG9ydCB7XG4gIENSRUFURV9GT0xERVIsXG4gIFVQREFURV9GT0xERVIsXG4gIE1PVkVfRk9MREVSLFxuICBNT1ZFX0ZPTERFUlMsXG4gIERFTEVURV9GT0xERVIsXG59IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9tdXRhdGlvbnNcIjtcbmltcG9ydCB7IEdFVF9GT0xERVJfT1ZFUlZJRVcgfSBmcm9tIFwiLi4vLi4vZ3JhcGhxbC9mb2xkZXIvcXVlcmllc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGlmZWN5Y2xlU2NlbmFyaW8oZGF0YTogU2V0dXBEYXRhKTogdm9pZCB7XG4gIGNvbnN0IHZ1SWQgPSBfX1ZVO1xuICBjb25zdCBpdGVySWQgPSBfX0lURVI7XG4gIGNvbnN0IHByZWZpeCA9IGBrNi1ydW4tJHtkYXRhLnJ1bklkfS12dSR7dnVJZH0taXQke2l0ZXJJZH1gO1xuICBjb25zdCByb290SWQgPSBkYXRhLnJvb3RGb2xkZXJJZCB8fCBkYXRhLnJvb3RXYXRjaGxpc3RJZCB8fCBkYXRhLnJvb3RDbXNJZDtcbiAgY29uc3Qgcm9vdFR5cGUgPSBkYXRhLnJvb3RGb2xkZXJUeXBlIHx8IChkYXRhLnJvb3RXYXRjaGxpc3RJZCA/IFwid2F0Y2hsaXN0XCIgOiBcImNtc1wiKTtcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBIQVNFIDI6IFRSRUUgQ09OU1RSVUNUSU9OICYgSElFUkFSQ0hZIEVYUEFOU0lPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLy8gU3RlcCAyLjE6IENyZWF0ZSBQcmltYXJ5IFRvcC1MZXZlbCBGb2xkZXJzIChGb2xkZXIgQSBhbmQgRm9sZGVyIEIpXG4gIGNvbnN0IGZvbGRlckFSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1Gb2xkZXJBYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiUHJpbWFyeSBpbmdlc3Qgcm9vdCBBIGZvciBrNiBsaWZlY3ljbGUgbG9hZCB0ZXN0XCIsXG4gICAgICAgIHBhcmVudElkOiByb290SWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDFfQ3JlYXRlRm9sZGVyQVwiXG4gICk7XG5cbiAgY29uc3QgZm9sZGVyQUlkID0gZm9sZGVyQVJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuICBjaGVjayhmb2xkZXJBUmVzLCB7XG4gICAgXCJGb2xkZXIgQSBjcmVhdGVkIHN1Y2Nlc3NmdWxseVwiOiAoKSA9PiAhIWZvbGRlckFJZCxcbiAgfSk7XG5cbiAgY29uc3QgZm9sZGVyQlJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LUZvbGRlckJgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJQcmltYXJ5IHN0YWdpbmcgcm9vdCBCIGZvciBrNiBsaWZlY3ljbGUgbG9hZCB0ZXN0XCIsXG4gICAgICAgIHBhcmVudElkOiByb290SWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDFfQ3JlYXRlRm9sZGVyQlwiXG4gICk7XG5cbiAgY29uc3QgZm9sZGVyQklkID0gZm9sZGVyQlJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuICBjaGVjayhmb2xkZXJCUmVzLCB7XG4gICAgXCJGb2xkZXIgQiBjcmVhdGVkIHN1Y2Nlc3NmdWxseVwiOiAoKSA9PiAhIWZvbGRlckJJZCxcbiAgfSk7XG5cbiAgaWYgKCFmb2xkZXJBSWQgfHwgIWZvbGRlckJJZCkge1xuICAgIGNvbnNvbGUuZXJyb3IoYFtWVSAke3Z1SWR9XSBGYWlsZWQgdG8gY3JlYXRlIHRvcC1sZXZlbCB0ZXN0IGZvbGRlcnNgKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBTdGVwIDIuMjogQ3JlYXRlIFN1Yi1Gb2xkZXJzIHVuZGVyIEZvbGRlciBBXG4gIGNvbnN0IHN1YjFSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1TdWIxYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ2hpbGQgc3ViZm9sZGVyIDEgZm9yIHJlbG9jYXRpb25cIixcbiAgICAgICAgcGFyZW50SWQ6IGZvbGRlckFJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9DcmVhdGVTdWIxXCJcbiAgKTtcbiAgY29uc3Qgc3ViMUlkID0gc3ViMVJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuXG4gIGNvbnN0IHN1YjJSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1TdWIyYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ2hpbGQgc3ViZm9sZGVyIDIgZm9yIGJ1bGsgbWlncmF0aW9uXCIsXG4gICAgICAgIHBhcmVudElkOiBmb2xkZXJBSWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDFfQ3JlYXRlU3ViMlwiXG4gICk7XG4gIGNvbnN0IHN1YjJJZCA9IHN1YjJSZXMuZGF0YT8uY3JlYXRlRm9sZGVyPy5pZDtcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBIQVNFIDM6IElOLVBMQUNFIE1BSU5URU5BTkNFICYgTUVUQURBVEEgRVZPTFVUSU9OXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgaWYgKHN1YjJJZCkge1xuICAgIGNvbnN0IHVwZGF0ZVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgIFVQREFURV9GT0xERVIsXG4gICAgICB7XG4gICAgICAgIGlucHV0OiB7XG4gICAgICAgICAgaWQ6IHN1YjJJZCxcbiAgICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LVN1YjItQXJjaGl2ZWRgLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGRhdGEudG9rZW4sXG4gICAgICBcIlRDX0xUXzAxX1VwZGF0ZUZvbGRlclwiXG4gICAgKTtcblxuICAgIGNoZWNrKHVwZGF0ZVJlcywge1xuICAgICAgXCJTdWIyIG5hbWUgdXBkYXRlZCBzdWNjZXNzZnVsbHlcIjogKHIpID0+XG4gICAgICAgIHIuZGF0YT8udXBkYXRlRm9sZGVyPy5uYW1lID09PSBgJHtwcmVmaXh9LVN1YjItQXJjaGl2ZWRgLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQSEFTRSA0OiBDT05DVVJSRU5DWS1TQUZFIFNJTkdMRSBSRUxPQ0FUSU9OIChPQ0MpXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgaWYgKHN1YjFJZCkge1xuICAgIGNvbnN0IG1vdmVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICBNT1ZFX0ZPTERFUixcbiAgICAgIHtcbiAgICAgICAgaW5wdXQ6IHtcbiAgICAgICAgICBmb2xkZXJJZDogc3ViMUlkLFxuICAgICAgICAgIGZyb21Gb2xkZXJJZDogZm9sZGVyQUlkLFxuICAgICAgICAgIHRvRm9sZGVySWQ6IGZvbGRlckJJZCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkYXRhLnRva2VuLFxuICAgICAgXCJUQ19MVF8wMV9Nb3ZlRm9sZGVyU2luZ2xlXCJcbiAgICApO1xuXG4gICAgY2hlY2sobW92ZVJlcywge1xuICAgICAgXCJTdWIxIG1vdmVkIHRvIEZvbGRlciBCXCI6IChyKSA9PiAhIXIuZGF0YT8ubW92ZUZvbGRlcj8uaWQsXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBIQVNFIDU6IEJVTEsgTUlHUkFUSU9OICYgUkVCQUxBTkNJTkdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBpZiAoc3ViMklkKSB7XG4gICAgY29uc3QgYnVsa01vdmVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICBNT1ZFX0ZPTERFUlMsXG4gICAgICB7XG4gICAgICAgIGlucHV0OiB7XG4gICAgICAgICAgZm9sZGVySWRzOiBbc3ViMklkXSxcbiAgICAgICAgICBuZXdQYXJlbnRGb2xkZXJJZDogZm9sZGVyQklkLFxuICAgICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkYXRhLnRva2VuLFxuICAgICAgXCJUQ19MVF8wMV9Nb3ZlRm9sZGVyc0J1bGtcIlxuICAgICk7XG5cbiAgICBjaGVjayhidWxrTW92ZVJlcywge1xuICAgICAgXCJTdWIyIGJ1bGsgbW92ZWQgdG8gRm9sZGVyIEJcIjogKHIpID0+XG4gICAgICAgIEFycmF5LmlzQXJyYXkoci5kYXRhPy5tb3ZlRm9sZGVycz8udmFsaWRGb2xkZXJJZHMpICYmXG4gICAgICAgIHIuZGF0YS5tb3ZlRm9sZGVycy52YWxpZEZvbGRlcklkcy5pbmNsdWRlcyhzdWIySWQpLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQSEFTRSA2OiBPVkVSVklFVyBRVUVSWSAmIEhJRVJBUkNIWSBQUlVOSU5HIC8gREVTVFJVQ1RJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBjb25zdCBvdmVydmlld1JlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgR0VUX0ZPTERFUl9PVkVSVklFVyxcbiAgICB7XG4gICAgICBpZHM6IFtmb2xkZXJBSWQsIGZvbGRlckJJZF0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDFfR2V0Rm9sZGVyT3ZlcnZpZXdcIlxuICApO1xuXG4gIGNoZWNrKG92ZXJ2aWV3UmVzLCB7XG4gICAgXCJPdmVydmlldyBxdWVyeSBleGVjdXRlZCBzdWNjZXNzZnVsbHlcIjogKHIpID0+XG4gICAgICAhIXIuZGF0YT8uZm9sZGVyT3ZlcnZpZXcgJiZcbiAgICAgIHR5cGVvZiByLmRhdGEuZm9sZGVyT3ZlcnZpZXcuY2hpbGRGb2xkZXJzQ291bnQgIT09IFwidW5kZWZpbmVkXCIsXG4gIH0pO1xuXG4gIC8vIFBydW5lIGNyZWF0ZWQgbGVhZiBub2RlcyBmaXJzdCB0byBzYXRpc2Z5IGFpV0FSRSdzIG5vbi1lbXB0eSBmb2xkZXIgdmFsaWRhdGlvblxuICBpZiAoc3ViMUlkKSB7XG4gICAgZXhlY3V0ZUdyYXBoUUwoXG4gICAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgICAgREVMRVRFX0ZPTERFUixcbiAgICAgIHtcbiAgICAgICAgaW5wdXQ6IHtcbiAgICAgICAgICBpZDogc3ViMUlkLFxuICAgICAgICAgIG9yZGVySW5kZXg6IDAsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgZGF0YS50b2tlbixcbiAgICAgIFwiVENfTFRfMDFfRGVsZXRlU3ViMVwiXG4gICAgKTtcbiAgfVxuXG4gIGlmIChzdWIySWQpIHtcbiAgICBleGVjdXRlR3JhcGhRTChcbiAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICBERUxFVEVfRk9MREVSLFxuICAgICAge1xuICAgICAgICBpbnB1dDoge1xuICAgICAgICAgIGlkOiBzdWIySWQsXG4gICAgICAgICAgb3JkZXJJbmRleDogMCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkYXRhLnRva2VuLFxuICAgICAgXCJUQ19MVF8wMV9EZWxldGVTdWIyXCJcbiAgICApO1xuICB9XG5cbiAgLy8gRGVsZXRlIHBhcmVudCBmb2xkZXJzIChub3cgZW1wdHkpXG4gIGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgREVMRVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBpZDogZm9sZGVyQUlkLFxuICAgICAgICBvcmRlckluZGV4OiAwLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9EZWxldGVGb2xkZXJBXCJcbiAgKTtcblxuICBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIERFTEVURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgaWQ6IGZvbGRlckJJZCxcbiAgICAgICAgb3JkZXJJbmRleDogMCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDFfRGVsZXRlRm9sZGVyQlwiXG4gICk7XG5cbiAgc2xlZXAoMC41KTtcbn1cbiIsICJpbXBvcnQgeyBzbGVlcCwgY2hlY2sgfSBmcm9tIFwiazZcIjtcbmltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4uL2hlbHBlcnMvY2xpZW50XCI7XG5pbXBvcnQgeyBTZXR1cERhdGEgfSBmcm9tIFwiLi4vaGVscGVycy9hdXRoXCI7XG5pbXBvcnQgeyBDUkVBVEVfRk9MREVSLCBERUxFVEVfRk9MREVSIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL211dGF0aW9uc1wiO1xuaW1wb3J0IHsgR0VUX0ZPTERFUiB9IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9xdWVyaWVzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5CdXJzdFNjZW5hcmlvKGRhdGE6IFNldHVwRGF0YSk6IHZvaWQge1xuICBjb25zdCB2dUlkID0gX19WVTtcbiAgY29uc3QgaXRlcklkID0gX19JVEVSO1xuICBjb25zdCBwcmVmaXggPSBgazYtYnVyc3QtJHtkYXRhLnJ1bklkfS12dSR7dnVJZH0taXQke2l0ZXJJZH1gO1xuICBjb25zdCByb290SWQgPSBkYXRhLnJvb3RGb2xkZXJJZCB8fCBkYXRhLnJvb3RXYXRjaGxpc3RJZCB8fCBkYXRhLnJvb3RDbXNJZDtcbiAgY29uc3Qgcm9vdFR5cGUgPSBkYXRhLnJvb3RGb2xkZXJUeXBlIHx8IChkYXRhLnJvb3RXYXRjaGxpc3RJZCA/IFwid2F0Y2hsaXN0XCIgOiBcImNtc1wiKTtcblxuICAvLyBTdGVwIDE6IENyZWF0ZSB0b3AtbGV2ZWwgZm9sZGVyIHVuZGVyIHJvb3RcbiAgY29uc3QgY3JlYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDUkVBVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG5hbWU6IGAke3ByZWZpeH0tTm9kZWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIms2IGJ1cnN0IHNjZW5hcmlvIHJvb3Qgbm9kZVwiLFxuICAgICAgICBwYXJlbnRJZDogcm9vdElkLFxuICAgICAgICByb290Rm9sZGVyVHlwZTogcm9vdFR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAyX0J1cnN0Q3JlYXRlUm9vdE5vZGVcIlxuICApO1xuXG4gIGNvbnN0IG5ld0lkID0gY3JlYXRlUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG4gIGNoZWNrKGNyZWF0ZVJlcywge1xuICAgIFwiQnVyc3QgdG9wIG5vZGUgY3JlYXRlZFwiOiAoKSA9PiAhIW5ld0lkLFxuICB9KTtcblxuICBpZiAoIW5ld0lkKSByZXR1cm47XG5cbiAgLy8gU3RlcCAyOiBJbW1lZGlhdGVseSBhdHRhY2ggY2hpbGQgbm9kZVxuICBjb25zdCBjaGlsZFJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LUNoaWxkYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiazYgYnVyc3Qgc2NlbmFyaW8gY2hpbGQgbm9kZVwiLFxuICAgICAgICBwYXJlbnRJZDogbmV3SWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDJfQnVyc3RDcmVhdGVDaGlsZE5vZGVcIlxuICApO1xuXG4gIGNvbnN0IGNoaWxkSWQgPSBjaGlsZFJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuICBjaGVjayhjaGlsZFJlcywge1xuICAgIFwiQnVyc3QgY2hpbGQgbm9kZSBhdHRhY2hlZFwiOiAoKSA9PiAhIWNoaWxkSWQsXG4gIH0pO1xuXG4gIC8vIFN0ZXAgMzogVmVyaWZ5IHBhcmVudCBoYXMgY2hpbGRcbiAgY29uc3QgZ2V0UmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBHRVRfRk9MREVSLFxuICAgIHsgaWQ6IG5ld0lkIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAyX0J1cnN0VmVyaWZ5SGllcmFyY2h5XCJcbiAgKTtcblxuICBjaGVjayhnZXRSZXMsIHtcbiAgICBcIlBhcmVudCBoaWVyYXJjaHkgaW5jbHVkZXMgY2hpbGRcIjogKHIpID0+XG4gICAgICBBcnJheS5pc0FycmF5KHIuZGF0YT8uZm9sZGVyPy5jaGlsZEZvbGRlcnM/LnJlY29yZHMpICYmXG4gICAgICByLmRhdGEuZm9sZGVyLmNoaWxkRm9sZGVycy5yZWNvcmRzLmxlbmd0aCA+IDAsXG4gIH0pO1xuXG4gIC8vIFN0ZXAgNDogQ2xlYW4gdXAgY2hpbGQgZmlyc3QsIHRoZW4gdG9wIG5vZGVcbiAgaWYgKGNoaWxkSWQpIHtcbiAgICBleGVjdXRlR3JhcGhRTChcbiAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICBERUxFVEVfRk9MREVSLFxuICAgICAgeyBpbnB1dDogeyBpZDogY2hpbGRJZCwgb3JkZXJJbmRleDogMCB9IH0sXG4gICAgICBkYXRhLnRva2VuLFxuICAgICAgXCJUQ19MVF8wMl9EZWxldGVDaGlsZE5vZGVcIlxuICAgICk7XG4gIH1cblxuICBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIERFTEVURV9GT0xERVIsXG4gICAgeyBpbnB1dDogeyBpZDogbmV3SWQsIG9yZGVySW5kZXg6IDAgfSB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMl9EZWxldGVUb3BOb2RlXCJcbiAgKTtcblxuICBzbGVlcCgwLjIpO1xufVxuIiwgImltcG9ydCB7IHNsZWVwLCBjaGVjayB9IGZyb20gXCJrNlwiO1xuaW1wb3J0IHsgZXhlY3V0ZUdyYXBoUUwgfSBmcm9tIFwiLi4vaGVscGVycy9jbGllbnRcIjtcbmltcG9ydCB7IFNldHVwRGF0YSB9IGZyb20gXCIuLi9oZWxwZXJzL2F1dGhcIjtcbmltcG9ydCB7IENIRUNLX1JPT1RfRk9MREVSUywgR0VUX1JPT1RfRk9MREVSUywgR0VUX0ZPTERFUiB9IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9xdWVyaWVzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5SZWFkU2NlbmFyaW8oZGF0YTogU2V0dXBEYXRhKTogdm9pZCB7XG4gIC8vIFN0ZXAgMTogUXVlcnkgQ01TIHJvb3QgZm9sZGVyc1xuICBjb25zdCBjbXNSb290UmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDSEVDS19ST09UX0ZPTERFUlMsXG4gICAgeyB0eXBlOiBcImNtc1wiIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAzX0NoZWNrQ21zUm9vdEZvbGRlcnNcIlxuICApO1xuXG4gIGNoZWNrKGNtc1Jvb3RSZXMsIHtcbiAgICBcIkNNUyByb290IGZvbGRlciBmb3VuZFwiOiAocikgPT5cbiAgICAgIEFycmF5LmlzQXJyYXkoci5kYXRhPy5yb290Rm9sZGVycykgJiYgci5kYXRhLnJvb3RGb2xkZXJzLmxlbmd0aCA+IDAsXG4gIH0pO1xuXG4gIC8vIFN0ZXAgMjogUXVlcnkgV2F0Y2hsaXN0IHJvb3QgZm9sZGVyc1xuICBjb25zdCB3bFJvb3RSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENIRUNLX1JPT1RfRk9MREVSUyxcbiAgICB7IHR5cGU6IFwid2F0Y2hsaXN0XCIgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDNfQ2hlY2tXYXRjaGxpc3RSb290Rm9sZGVyc1wiXG4gICk7XG5cbiAgY2hlY2sod2xSb290UmVzLCB7XG4gICAgXCJXYXRjaGxpc3Qgcm9vdCBmb2xkZXIgZm91bmRcIjogKHIpID0+XG4gICAgICBBcnJheS5pc0FycmF5KHIuZGF0YT8ucm9vdEZvbGRlcnMpICYmIHIuZGF0YS5yb290Rm9sZGVycy5sZW5ndGggPiAwLFxuICB9KTtcblxuICAvLyBTdGVwIDM6IEdldCBhbGwgcm9vdCBmb2xkZXJzIGFjcm9zcyB0aGUgb3JnYW5pemF0aW9uXG4gIGNvbnN0IGFsbFJvb3RzUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBHRVRfUk9PVF9GT0xERVJTLFxuICAgIHt9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wM19HZXRBbGxSb290Rm9sZGVyc1wiXG4gICk7XG5cbiAgY2hlY2soYWxsUm9vdHNSZXMsIHtcbiAgICBcIkFsbCByb290IGZvbGRlcnMgcXVlcmllZFwiOiAocikgPT5cbiAgICAgIEFycmF5LmlzQXJyYXkoci5kYXRhPy5yb290Rm9sZGVycykgJiYgci5kYXRhLnJvb3RGb2xkZXJzLmxlbmd0aCA+IDAsXG4gIH0pO1xuXG4gIC8vIFN0ZXAgNDogRmV0Y2ggZm9sZGVyIGhpZXJhcmNoeSBvZiBwcmltYXJ5IHJvb3QgYW5jaG9yXG4gIGNvbnN0IHJvb3RJZCA9IGRhdGEucm9vdEZvbGRlcklkIHx8IGRhdGEucm9vdFdhdGNobGlzdElkIHx8IGRhdGEucm9vdENtc0lkO1xuICBjb25zdCBmb2xkZXJSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIEdFVF9GT0xERVIsXG4gICAgeyBpZDogcm9vdElkIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAzX0dldEZvbGRlckhpZXJhcmNoeVwiXG4gICk7XG5cbiAgY2hlY2soZm9sZGVyUmVzLCB7XG4gICAgXCJGb2xkZXIgcXVlcnkgcmV0dXJuZWQgdmFsaWQgcGF5bG9hZFwiOiAocikgPT4gISFyLmRhdGE/LmZvbGRlcj8uaWQsXG4gIH0pO1xuXG4gIHNsZWVwKDAuMSk7XG59XG4iLCAiaW1wb3J0IHsgc2xlZXAsIGNoZWNrIH0gZnJvbSBcIms2XCI7XG5pbXBvcnQgeyBleGVjdXRlR3JhcGhRTCB9IGZyb20gXCIuLi9oZWxwZXJzL2NsaWVudFwiO1xuaW1wb3J0IHsgU2V0dXBEYXRhIH0gZnJvbSBcIi4uL2hlbHBlcnMvYXV0aFwiO1xuaW1wb3J0IHtcbiAgQ1JFQVRFX0ZPTERFUixcbiAgTU9WRV9GT0xERVIsXG4gIERFTEVURV9GT0xERVIsXG59IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9tdXRhdGlvbnNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bk1vdmVTY2VuYXJpbyhkYXRhOiBTZXR1cERhdGEpOiB2b2lkIHtcbiAgY29uc3QgdnVJZCA9IF9fVlU7XG4gIGNvbnN0IGl0ZXJJZCA9IF9fSVRFUjtcbiAgY29uc3QgcHJlZml4ID0gYGs2LW1vdmUtJHtkYXRhLnJ1bklkfS12dSR7dnVJZH0taXQke2l0ZXJJZH1gO1xuICBjb25zdCByb290SWQgPSBkYXRhLnJvb3RGb2xkZXJJZCB8fCBkYXRhLnJvb3RXYXRjaGxpc3RJZCB8fCBkYXRhLnJvb3RDbXNJZDtcbiAgY29uc3Qgcm9vdFR5cGUgPSBkYXRhLnJvb3RGb2xkZXJUeXBlIHx8IChkYXRhLnJvb3RXYXRjaGxpc3RJZCA/IFwid2F0Y2hsaXN0XCIgOiBcImNtc1wiKTtcblxuICAvLyAxLiBDcmVhdGUgdHdvIHBhcmVudCBidWNrZXRzIChBbHBoYSBhbmQgQmV0YSlcbiAgY29uc3QgYnVja2V0QWxwaGFSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1BbHBoYWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIms2IG1vdmUgc2NlbmFyaW8gQWxwaGEgYnVja2V0XCIsXG4gICAgICAgIHBhcmVudElkOiByb290SWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDRfQ3JlYXRlQnVja2V0QWxwaGFcIlxuICApO1xuICBjb25zdCBhbHBoYUlkID0gYnVja2V0QWxwaGFSZXMuZGF0YT8uY3JlYXRlRm9sZGVyPy5pZDtcblxuICBjb25zdCBidWNrZXRCZXRhUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDUkVBVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG5hbWU6IGAke3ByZWZpeH0tQmV0YWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIms2IG1vdmUgc2NlbmFyaW8gQmV0YSBidWNrZXRcIixcbiAgICAgICAgcGFyZW50SWQ6IHJvb3RJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNF9DcmVhdGVCdWNrZXRCZXRhXCJcbiAgKTtcbiAgY29uc3QgYmV0YUlkID0gYnVja2V0QmV0YVJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuXG4gIGlmICghYWxwaGFJZCB8fCAhYmV0YUlkKSByZXR1cm47XG5cbiAgLy8gMi4gQ3JlYXRlIG1vYmlsZSBmb2xkZXIgaW5zaWRlIEFscGhhXG4gIGNvbnN0IG1vYmlsZVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LU1vYmlsZUl0ZW1gLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJrNiBtb3ZlIHNjZW5hcmlvIG1vYmlsZSBjaGlsZCBmb2xkZXJcIixcbiAgICAgICAgcGFyZW50SWQ6IGFscGhhSWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDRfQ3JlYXRlTW9iaWxlSXRlbVwiXG4gICk7XG4gIGNvbnN0IG1vYmlsZUlkID0gbW9iaWxlUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG4gIGlmICghbW9iaWxlSWQpIHJldHVybjtcblxuICAvLyAzLiBSZWxvY2F0ZSBtb2JpbGUgZm9sZGVyIGZyb20gQWxwaGEgdG8gQmV0YVxuICBjb25zdCBtb3ZlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBNT1ZFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBmb2xkZXJJZDogbW9iaWxlSWQsXG4gICAgICAgIGZyb21Gb2xkZXJJZDogYWxwaGFJZCxcbiAgICAgICAgdG9Gb2xkZXJJZDogYmV0YUlkLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNF9Nb3ZlRm9sZGVyQWxwaGFUb0JldGFcIlxuICApO1xuXG4gIGNoZWNrKG1vdmVSZXMsIHtcbiAgICBcIk1vYmlsZSBmb2xkZXIgcmVsb2NhdGVkIHRvIEJldGFcIjogKHIpID0+ICEhci5kYXRhPy5tb3ZlRm9sZGVyPy5pZCxcbiAgfSk7XG5cbiAgLy8gNC4gVmFsaWRhdGlvbiAvIEN5Y2xlIFByZXZlbnRpb24gVGVzdDogU2VsZi1SZWxvY2F0aW9uIFJlamVjdGlvbiAoZm9sZGVySWQgPT0gdG9Gb2xkZXJJZClcbiAgZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBNT1ZFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBmb2xkZXJJZDogbW9iaWxlSWQsXG4gICAgICAgIGZyb21Gb2xkZXJJZDogYmV0YUlkLFxuICAgICAgICB0b0ZvbGRlcklkOiBtb2JpbGVJZCwgLy8gSW52YWxpZDogbW92aW5nIGZvbGRlciBpbnRvIGl0c2VsZiFcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDRfTW92ZUZvbGRlckludmFsaWRTZWxmTW92ZVwiLFxuICAgIHRydWUgLy8gZXhwZWN0RXJyb3IgPSB0cnVlXG4gICk7XG5cbiAgLy8gNS4gQ2xlYW51cDogRGVsZXRlIG1vYmlsZSBsZWFmIGZpcnN0LCB0aGVuIGVtcHR5IEFscGhhIGFuZCBCZXRhXG4gIGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgREVMRVRFX0ZPTERFUixcbiAgICB7IGlucHV0OiB7IGlkOiBtb2JpbGVJZCwgb3JkZXJJbmRleDogMCB9IH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA0X0RlbGV0ZU1vYmlsZUl0ZW1cIlxuICApO1xuICBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIERFTEVURV9GT0xERVIsXG4gICAgeyBpbnB1dDogeyBpZDogYWxwaGFJZCwgb3JkZXJJbmRleDogMCB9IH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA0X0RlbGV0ZUFscGhhXCJcbiAgKTtcbiAgZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBERUxFVEVfRk9MREVSLFxuICAgIHsgaW5wdXQ6IHsgaWQ6IGJldGFJZCwgb3JkZXJJbmRleDogMCB9IH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA0X0RlbGV0ZUJldGFcIlxuICApO1xuXG4gIHNsZWVwKDAuMik7XG59XG4iLCAiaW1wb3J0IHsgc2xlZXAsIGNoZWNrIH0gZnJvbSBcIms2XCI7XG5pbXBvcnQgeyBleGVjdXRlR3JhcGhRTCB9IGZyb20gXCIuLi9oZWxwZXJzL2NsaWVudFwiO1xuaW1wb3J0IHsgU2V0dXBEYXRhIH0gZnJvbSBcIi4uL2hlbHBlcnMvYXV0aFwiO1xuaW1wb3J0IHsgQ1JFQVRFX0ZPTERFUiwgREVMRVRFX0ZPTERFUiB9IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9tdXRhdGlvbnNcIjtcbmltcG9ydCB7IEdFVF9GT0xERVIgfSBmcm9tIFwiLi4vLi4vZ3JhcGhxbC9mb2xkZXIvcXVlcmllc1wiO1xuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkRlbGV0ZVNjZW5hcmlvKGRhdGE6IFNldHVwRGF0YSk6IHZvaWQge1xuXG4gIGNvbnN0IHZ1SWQgPSBfX1ZVO1xuICBjb25zdCBpdGVySWQgPSBfX0lURVI7XG4gIGNvbnN0IHByZWZpeCA9IGBrNi1kZWxldGUtJHtkYXRhLnJ1bklkfS12dSR7dnVJZH0taXQke2l0ZXJJZH1gO1xuICBjb25zdCByb290SWQgPSBkYXRhLnJvb3RGb2xkZXJJZCB8fCBkYXRhLnJvb3RXYXRjaGxpc3RJZCB8fCBkYXRhLnJvb3RDbXNJZDtcbiAgY29uc3Qgcm9vdFR5cGUgPSBkYXRhLnJvb3RGb2xkZXJUeXBlIHx8IChkYXRhLnJvb3RXYXRjaGxpc3RJZCA/IFwid2F0Y2hsaXN0XCIgOiBcImNtc1wiKTtcblxuICAvLyAxLiBDcmVhdGUgdGVtcG9yYXJ5IHRhcmdldCBmb2xkZXJcbiAgY29uc3QgY3JlYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDUkVBVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG5hbWU6IGAke3ByZWZpeH0tVGFyZ2V0YCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiazYgZGVsZXRlIHNjZW5hcmlvIHRhcmdldCBmb2xkZXJcIixcbiAgICAgICAgcGFyZW50SWQ6IHJvb3RJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNV9DcmVhdGVQdXJnZVRhcmdldFwiXG4gICk7XG5cbiAgY29uc3QgdGFyZ2V0SWQgPSBjcmVhdGVSZXMuZGF0YT8uY3JlYXRlRm9sZGVyPy5pZDtcbiAgY2hlY2soY3JlYXRlUmVzLCB7XG4gICAgXCJUYXJnZXQgY3JlYXRlZCBmb3IgZGVsZXRpb24gdGVzdFwiOiAoKSA9PiAhIXRhcmdldElkLFxuICB9KTtcblxuICBpZiAoIXRhcmdldElkKSByZXR1cm47XG5cbiAgLy8gMi4gSXNzdWUgZGVsZXRlRm9sZGVyXG4gIGNvbnN0IGRlbGV0ZVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgREVMRVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBpZDogdGFyZ2V0SWQsXG4gICAgICAgIG9yZGVySW5kZXg6IDAsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA1X0RlbGV0ZVRhcmdldFwiXG4gICk7XG5cbiAgY2hlY2soZGVsZXRlUmVzLCB7XG4gICAgXCJUYXJnZXQgZGVsZXRlZCBzdWNjZXNzZnVsbHlcIjogKHIpID0+XG4gICAgICByLnN0YXR1cyA9PT0gMjAwICYmICghci5lcnJvcnMgfHwgci5lcnJvcnMubGVuZ3RoID09PSAwKSxcbiAgfSk7XG5cbiAgLy8gMy4gVmVyaWZ5IHRvbWJzdG9uZSB2aWEgR0VUX0ZPTERFUiAoZXhwZWN0cyBlcnJvci9ub3RfZm91bmQpXG4gIGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgR0VUX0ZPTERFUixcbiAgICB7IGlkOiB0YXJnZXRJZCB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNV9WZXJpZnlUb21ic3RvbmVcIixcbiAgICB0cnVlIC8vIGV4cGVjdEVycm9yID0gdHJ1ZVxuICApO1xuXG4gIHNsZWVwKDAuMSk7XG59XG4iLCAiaW1wb3J0IHsgZ2V0RXhlY3V0aW9uT3B0aW9ucyB9IGZyb20gXCIuL2NvbmZpZy9wcm9maWxlc1wiO1xuaW1wb3J0IHsgc2V0dXBBdXRoQW5kRW52aXJvbm1lbnQsIFNldHVwRGF0YSB9IGZyb20gXCIuL2hlbHBlcnMvYXV0aFwiO1xuaW1wb3J0IHsgdGVhcmRvd25Td2VlcCB9IGZyb20gXCIuL2hlbHBlcnMvY2xlYW51cFwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVIdG1sUmVwb3J0LCBnZW5lcmF0ZUNvbnNvbGVTdW1tYXJ5IH0gZnJvbSBcIi4vaGVscGVycy9yZXBvcnRlclwiO1xuaW1wb3J0IHsgcnVuTGlmZWN5Y2xlU2NlbmFyaW8gfSBmcm9tIFwiLi9zY2VuYXJpb3MvbGlmZWN5Y2xlXCI7XG5pbXBvcnQgeyBydW5CdXJzdFNjZW5hcmlvIH0gZnJvbSBcIi4vc2NlbmFyaW9zL2J1cnN0XCI7XG5pbXBvcnQgeyBydW5SZWFkU2NlbmFyaW8gfSBmcm9tIFwiLi9zY2VuYXJpb3MvcmVhZFwiO1xuaW1wb3J0IHsgcnVuTW92ZVNjZW5hcmlvIH0gZnJvbSBcIi4vc2NlbmFyaW9zL21vdmVcIjtcbmltcG9ydCB7IHJ1bkRlbGV0ZVNjZW5hcmlvIH0gZnJvbSBcIi4vc2NlbmFyaW9zL2RlbGV0ZVwiO1xuXG5leHBvcnQgY29uc3Qgb3B0aW9ucyA9IGdldEV4ZWN1dGlvbk9wdGlvbnMoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwKCk6IFNldHVwRGF0YSB7XG4gIHJldHVybiBzZXR1cEF1dGhBbmRFbnZpcm9ubWVudCgpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoZGF0YTogU2V0dXBEYXRhKTogdm9pZCB7XG4gIGNvbnN0IHNjZW5hcmlvID0gKF9fRU5WLlNDRU5BUklPIHx8IFwibGlmZWN5Y2xlXCIpLnRvTG93ZXJDYXNlKCk7XG5cbiAgc3dpdGNoIChzY2VuYXJpbykge1xuICAgIGNhc2UgXCJidXJzdFwiOlxuICAgICAgcnVuQnVyc3RTY2VuYXJpbyhkYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJyZWFkXCI6XG4gICAgICBydW5SZWFkU2NlbmFyaW8oZGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibW92ZVwiOlxuICAgICAgcnVuTW92ZVNjZW5hcmlvKGRhdGEpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImRlbGV0ZVwiOlxuICAgICAgcnVuRGVsZXRlU2NlbmFyaW8oZGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibGlmZWN5Y2xlXCI6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJ1bkxpZmVjeWNsZVNjZW5hcmlvKGRhdGEpO1xuICAgICAgYnJlYWs7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRlYXJkb3duKGRhdGE6IFNldHVwRGF0YSk6IHZvaWQge1xuICB0ZWFyZG93blN3ZWVwKGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlU3VtbWFyeShkYXRhOiBhbnkpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcbiAgcmV0dXJuIHtcbiAgICBcIms2LXJlcG9ydC5odG1sXCI6IGdlbmVyYXRlSHRtbFJlcG9ydChkYXRhKSxcbiAgICBzdGRvdXQ6IGdlbmVyYXRlQ29uc29sZVN1bW1hcnkoZGF0YSksXG4gIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBSU8sU0FBUyxzQkFBK0I7QUFDN0MsUUFBTSxXQUFXLE1BQU0sV0FBVyxRQUFRLFlBQVk7QUFDdEQsUUFBTSxjQUFjLE1BQU0sTUFBTSxTQUFTLE1BQU0sS0FBSyxFQUFFLElBQUk7QUFDMUQsUUFBTSxtQkFBbUIsTUFBTSxZQUFZO0FBRTNDLFFBQU0saUJBQWlCO0FBQUEsSUFDckIsaUJBQWlCLENBQUMsV0FBVztBQUFBO0FBQUEsSUFDN0IsUUFBUSxDQUFDLFdBQVc7QUFBQTtBQUFBLElBQ3BCLGdCQUFnQixDQUFDLFdBQVc7QUFBQTtBQUFBLEVBQzlCO0FBRUEsTUFBSSxZQUFZLFNBQVM7QUFDdkIsV0FBTztBQUFBLE1BQ0wsS0FBSyxlQUFlO0FBQUEsTUFDcEIsVUFBVSxvQkFBb0I7QUFBQSxNQUM5QixZQUFZO0FBQUEsUUFDVixHQUFHO0FBQUEsUUFDSCxtQkFBbUIsQ0FBQyxjQUFjLFlBQVk7QUFBQSxNQUNoRDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsTUFBSSxZQUFZLFVBQVU7QUFDeEIsV0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sRUFBRSxVQUFVLE9BQU8sUUFBUSxjQUFjLEtBQUssTUFBTSxjQUFjLENBQUMsSUFBSSxHQUFHO0FBQUEsUUFDMUUsRUFBRSxVQUFVLE1BQU0sUUFBUSxlQUFlLEdBQUc7QUFBQSxRQUM1QyxFQUFF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R0Q7QUFBQSxJQUNFLEtBQUs7QUFBQSxJQUNMO0FBQUEsSUFDQSxFQUFFLElBQUksU0FBUztBQUFBLElBQ2YsS0FBSztBQUFBLElBQ0w7QUFBQSxJQUNBO0FBQUE7QUFBQSxFQUNGO0FBRUEsRUFBQUMsT0FBTSxHQUFHO0FBQ1g7OztBQzNETyxJQUFNLFVBQVUsb0JBQW9CO0FBRXBDLFNBQVMsUUFBbUI7QUFDakMsU0FBTyx3QkFBd0I7QUFDakM7QUFFZSxTQUFSLGFBQWtCLE1BQXVCO0FBQzlDLFFBQU0sWUFBWSxNQUFNLFlBQVksYUFBYSxZQUFZO0FBRTdELFVBQVEsVUFBVTtBQUFBLElBQ2hCLEtBQUs7QUFDSCx1QkFBaUIsSUFBSTtBQUNyQjtBQUFBLElBQ0YsS0FBSztBQUNILHNCQUFnQixJQUFJO0FBQ3BCO0FBQUEsSUFDRixLQUFLO0FBQ0gsc0JBQWdCLElBQUk7QUFDcEI7QUFBQSxJQUNGLEtBQUs7QUFDSCx3QkFBa0IsSUFBSTtBQUN0QjtBQUFBLElBQ0YsS0FBSztBQUFBLElBQ0w7QUFDRSwyQkFBcUIsSUFBSTtBQUN6QjtBQUFBLEVBQ0o7QUFDRjtBQUVPLFNBQVMsU0FBUyxNQUF1QjtBQUM5QyxnQkFBYyxJQUFJO0FBQ3BCO0FBRU8sU0FBUyxjQUFjLE1BQW1DO0FBQy9ELFNBQU87QUFBQSxJQUNMLGtCQUFrQixtQkFBbUIsSUFBSTtBQUFBLElBQ3pDLFFBQVEsdUJBQXVCLElBQUk7QUFBQSxFQUNyQztBQUNGOyIsCiAgIm5hbWVzIjogWyJncmFwaHFsRXJyb3JzIiwgImNoZWNrIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIl0KfQo=
