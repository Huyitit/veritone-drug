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
        <div class="card-title">p(95) Duration</div>
        <div class="card-val" style="color: var(--primary);">${fmtMs(httpReqDuration["p(95)"])}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
          p(99): ${fmtMs(httpReqDuration["p(99)"])} | Med: ${fmtMs(httpReqDuration.med)}
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
          <th>p(99)</th>
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
          <td style="color: var(--primary);">${fmtMs(httpReqDuration["p(99)"])}</td>
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
Duration (p99):    ${(httpDuration["p(99)"] || 0).toFixed(1)} ms
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vdGVzdHMvazYvY29uZmlnL3Byb2ZpbGVzLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L2hlbHBlcnMvY2xpZW50LnRzIiwgIi4uLy4uL3Rlc3RzL2dyYXBocWwvZm9sZGVyL211dGF0aW9ucy50cyIsICIuLi8uLi90ZXN0cy9ncmFwaHFsL2ZvbGRlci9xdWVyaWVzLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L2hlbHBlcnMvYXV0aC50cyIsICIuLi8uLi90ZXN0cy9rNi9oZWxwZXJzL2NsZWFudXAudHMiLCAiLi4vLi4vdGVzdHMvazYvaGVscGVycy9yZXBvcnRlci50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvbGlmZWN5Y2xlLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L3NjZW5hcmlvcy9idXJzdC50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvcmVhZC50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvbW92ZS50cyIsICIuLi8uLi90ZXN0cy9rNi9zY2VuYXJpb3MvZGVsZXRlLnRzIiwgIi4uLy4uL3Rlc3RzL2s2L21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiazYvb3B0aW9uc1wiO1xuXG5leHBvcnQgdHlwZSBQcm9maWxlVHlwZSA9IFwic21va2VcIiB8IFwibG9hZFwiIHwgXCJzdHJlc3NcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4ZWN1dGlvbk9wdGlvbnMoKTogT3B0aW9ucyB7XG4gIGNvbnN0IHByb2ZpbGUgPSAoX19FTlYuUFJPRklMRSB8fCBcImxvYWRcIikudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdnVzT3ZlcnJpZGUgPSBfX0VOVi5WVVMgPyBwYXJzZUludChfX0VOVi5WVVMsIDEwKSA6IHVuZGVmaW5lZDtcbiAgY29uc3QgZHVyYXRpb25PdmVycmlkZSA9IF9fRU5WLkRVUkFUSU9OIHx8IHVuZGVmaW5lZDtcblxuICBjb25zdCBiYXNlVGhyZXNob2xkcyA9IHtcbiAgICBodHRwX3JlcV9mYWlsZWQ6IFtcInJhdGU8MC4wMVwiXSwgLy8gTGVzcyB0aGFuIDElIEhUVFAgZmFpbHVyZXNcbiAgICBjaGVja3M6IFtcInJhdGU+MC45OVwiXSwgICAgICAgICAgLy8gTW9yZSB0aGFuIDk5JSBjaGVjayBwYXNzIHJhdGVcbiAgICBncmFwaHFsX2Vycm9yczogW1wicmF0ZTwwLjAxXCJdLCAgLy8gTGVzcyB0aGFuIDElIGJ1c2luZXNzIGxvZ2ljIGVycm9yc1xuICB9O1xuXG4gIGlmIChwcm9maWxlID09PSBcInNtb2tlXCIpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdnVzOiB2dXNPdmVycmlkZSB8fCAxLFxuICAgICAgZHVyYXRpb246IGR1cmF0aW9uT3ZlcnJpZGUgfHwgXCIxNXNcIixcbiAgICAgIHRocmVzaG9sZHM6IHtcbiAgICAgICAgLi4uYmFzZVRocmVzaG9sZHMsXG4gICAgICAgIGh0dHBfcmVxX2R1cmF0aW9uOiBbXCJwKDk1KTwxNTAwXCIsIFwicCg5OSk8MzAwMFwiXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9maWxlID09PSBcInN0cmVzc1wiKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7IGR1cmF0aW9uOiBcIjMwc1wiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlID8gTWF0aC5mbG9vcih2dXNPdmVycmlkZSAvIDIpIDogMjUgfSxcbiAgICAgICAgeyBkdXJhdGlvbjogXCIxbVwiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlIHx8IDUwIH0sXG4gICAgICAgIHsgZHVyYXRpb246IGR1cmF0aW9uT3ZlcnJpZGUgfHwgXCIxbVwiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlIHx8IDUwIH0sXG4gICAgICAgIHsgZHVyYXRpb246IFwiMzBzXCIsIHRhcmdldDogMCB9LFxuICAgICAgXSxcbiAgICAgIHRocmVzaG9sZHM6IHtcbiAgICAgICAgLi4uYmFzZVRocmVzaG9sZHMsXG4gICAgICAgIGh0dHBfcmVxX2R1cmF0aW9uOiBbXCJwKDk1KTwyNTAwXCIsIFwicCg5OSk8NTAwMFwiXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIC8vIERlZmF1bHQ6IFwibG9hZFwiIHByb2ZpbGVcbiAgcmV0dXJuIHtcbiAgICBzdGFnZXM6IFtcbiAgICAgIHsgZHVyYXRpb246IFwiMTRzXCIsIHRhcmdldDogdnVzT3ZlcnJpZGUgfHwgNTAgfSxcbiAgICAgIHsgZHVyYXRpb246IGR1cmF0aW9uT3ZlcnJpZGUgfHwgXCIxbVwiLCB0YXJnZXQ6IHZ1c092ZXJyaWRlIHx8IDUwIH0sXG4gICAgICB7IGR1cmF0aW9uOiBcIjEwc1wiLCB0YXJnZXQ6IDAgfSxcbiAgICBdLFxuICAgIHRocmVzaG9sZHM6IHtcbiAgICAgIC4uLmJhc2VUaHJlc2hvbGRzLFxuICAgICAgaHR0cF9yZXFfZHVyYXRpb246IFtcInAoOTUpPDE1MDBcIiwgXCJwKDk5KTwzMDAwXCJdLFxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IGh0dHAsIHsgUmVzcG9uc2UgfSBmcm9tIFwiazYvaHR0cFwiO1xuaW1wb3J0IHsgY2hlY2sgfSBmcm9tIFwiazZcIjtcbmltcG9ydCB7IFJhdGUsIFRyZW5kIH0gZnJvbSBcIms2L21ldHJpY3NcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxFcnJvcnMgPSBuZXcgUmF0ZShcImdyYXBocWxfZXJyb3JzXCIpO1xuZXhwb3J0IGNvbnN0IGdyYXBocWxEdXJhdGlvbiA9IG5ldyBUcmVuZChcImdyYXBocWxfZHVyYXRpb25cIik7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSzZHcmFwaFFMUmVzcG9uc2U8VCA9IGFueT4ge1xuICBkYXRhPzogVDtcbiAgZXJyb3JzPzogQXJyYXk8eyBtZXNzYWdlOiBzdHJpbmc7IFtrZXk6IHN0cmluZ106IGFueSB9PjtcbiAgc3RhdHVzOiBudW1iZXI7XG4gIHJhdzogUmVzcG9uc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlR3JhcGhRTDxUID0gYW55PihcbiAgZW5kcG9pbnRVcmw6IHN0cmluZyxcbiAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gIHZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSxcbiAgdG9rZW4/OiBzdHJpbmcsXG4gIG9wZXJhdGlvbk5hbWU6IHN0cmluZyA9IFwiR3JhcGhRTF9PcFwiLFxuICBleHBlY3RFcnJvcjogYm9vbGVhbiA9IGZhbHNlXG4pOiBLNkdyYXBoUUxSZXNwb25zZTxUPiB7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgYWNjZXB0OiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgfTtcblxuICBpZiAodG9rZW4pIHtcbiAgICBoZWFkZXJzW1wiYXV0aG9yaXphdGlvblwiXSA9IGBCZWFyZXIgJHt0b2tlbn1gO1xuICB9XG5cbiAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICBxdWVyeTogb3BlcmF0aW9uLFxuICAgIHZhcmlhYmxlcyxcbiAgfSk7XG5cbiAgY29uc3QgcmVzID0gaHR0cC5wb3N0KGVuZHBvaW50VXJsLCBwYXlsb2FkLCB7XG4gICAgaGVhZGVycyxcbiAgICB0YWdzOiB7IG9wZXJhdGlvbjogb3BlcmF0aW9uTmFtZSB9LFxuICB9KTtcblxuICBncmFwaHFsRHVyYXRpb24uYWRkKHJlcy50aW1pbmdzLmR1cmF0aW9uLCB7IG9wZXJhdGlvbjogb3BlcmF0aW9uTmFtZSB9KTtcblxuICBsZXQgcGFyc2VkQm9keTogYW55ID0ge307XG4gIGxldCBpc0pzb25WYWxpZCA9IGZhbHNlO1xuXG4gIHRyeSB7XG4gICAgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UocmVzLmJvZHkgPyByZXMuYm9keS50b1N0cmluZygpIDogXCJ7fVwiKTtcbiAgICBpc0pzb25WYWxpZCA9IHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHBhcnNlZEJvZHkgPSB7XG4gICAgICBlcnJvcnM6IFt7IG1lc3NhZ2U6IGBIVFRQICR7cmVzLnN0YXR1c306IEZhaWxlZCB0byBwYXJzZSBKU09OIHJlc3BvbnNlYCB9XSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgaGFzQnVzaW5lc3NFcnJvcnMgPSBBcnJheS5pc0FycmF5KHBhcnNlZEJvZHkuZXJyb3JzKSAmJiBwYXJzZWRCb2R5LmVycm9ycy5sZW5ndGggPiAwO1xuXG4gIGlmICghZXhwZWN0RXJyb3IgJiYgKHJlcy5zdGF0dXMgIT09IDIwMCB8fCBoYXNCdXNpbmVzc0Vycm9ycykpIHtcbiAgICBjb25zb2xlLmVycm9yKGBbazYgY2xpZW50IGVycm9yXSAke29wZXJhdGlvbk5hbWV9IChIVFRQICR7cmVzLnN0YXR1c30pOiAke0pTT04uc3RyaW5naWZ5KHBhcnNlZEJvZHkuZXJyb3JzIHx8IHBhcnNlZEJvZHkpfWApO1xuICB9XG5cbiAgaWYgKGV4cGVjdEVycm9yKSB7XG4gICAgY29uc3QgcGFzc2VkID0gKHJlcy5zdGF0dXMgPT09IDIwMCB8fCByZXMuc3RhdHVzID09PSA0MDApICYmIGhhc0J1c2luZXNzRXJyb3JzO1xuICAgIGNoZWNrKHJlcywge1xuICAgICAgW2Ake29wZXJhdGlvbk5hbWV9IHJlc3BvbmRlZCB3aXRoIGV4cGVjdGVkIGVycm9yYF06ICgpID0+IHBhc3NlZCxcbiAgICB9KTtcbiAgICBncmFwaHFsRXJyb3JzLmFkZChmYWxzZSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTm9ybWFsIG9wZXJhdGlvbiBleHBlY3RpbmcgMjAwIE9LIGFuZCBOTyBidXNpbmVzcyBlcnJvcnNcbiAgICBjb25zdCBwYXNzID0gY2hlY2socmVzLCB7XG4gICAgICBbYCR7b3BlcmF0aW9uTmFtZX0gc3RhdHVzIGlzIDIwMGBdOiAocikgPT4gci5zdGF0dXMgPT09IDIwMCxcbiAgICAgIFtgJHtvcGVyYXRpb25OYW1lfSByZXNwb25zZSBoYXMgdmFsaWQgSlNPTmBdOiAoKSA9PiBpc0pzb25WYWxpZCxcbiAgICAgIFtgJHtvcGVyYXRpb25OYW1lfSBoYXMgbm8gYnVzaW5lc3MgZXJyb3JzYF06ICgpID0+ICFoYXNCdXNpbmVzc0Vycm9ycyxcbiAgICB9KTtcblxuICAgIGdyYXBocWxFcnJvcnMuYWRkKCFwYXNzIHx8IGhhc0J1c2luZXNzRXJyb3JzKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZGF0YTogcGFyc2VkQm9keS5kYXRhLFxuICAgIGVycm9yczogcGFyc2VkQm9keS5lcnJvcnMsXG4gICAgc3RhdHVzOiByZXMuc3RhdHVzLFxuICAgIHJhdzogcmVzLFxuICB9O1xufVxuIiwgImV4cG9ydCBjb25zdCBVU0VSX0xPR0lOID0gYFxuICBtdXRhdGlvbiBMb2dpbigkaW5wdXQ6IFVzZXJMb2dpbiEpIHtcbiAgICB1c2VyTG9naW4oaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgdG9rZW5cbiAgICAgIHVzZXIge1xuICAgICAgICBpZFxuICAgICAgICBvcmdhbml6YXRpb25JZFxuICAgICAgICBvcmdhbml6YXRpb24ge1xuICAgICAgICAgIGlkXG4gICAgICAgICAgbmFtZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBvcmdhbml6YXRpb24ge1xuICAgICAgICBpZFxuICAgICAgICBuYW1lXG4gICAgICB9XG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgQ1JFQVRFX1JPT1RfRk9MREVSUyA9IGBcbiAgbXV0YXRpb24gQ3JlYXRlUm9vdEZvbGRlcnMoJHJvb3RGb2xkZXJUeXBlOiBSb290Rm9sZGVyVHlwZSkge1xuICAgIGNyZWF0ZVJvb3RGb2xkZXJzKHJvb3RGb2xkZXJUeXBlOiAkcm9vdEZvbGRlclR5cGUpIHtcbiAgICAgIGlkXG4gICAgICByb290Rm9sZGVyVHlwZUlkXG4gICAgICBuYW1lXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgQ1JFQVRFX0ZPTERFUiA9IGBcbiAgbXV0YXRpb24gQ3JlYXRlRm9sZGVyKCRpbnB1dDogQ3JlYXRlRm9sZGVyISkge1xuICAgIGNyZWF0ZUZvbGRlcihpbnB1dDogJGlucHV0KSB7XG4gICAgICBpZFxuICAgICAgbmFtZVxuICAgICAgZGVzY3JpcHRpb25cbiAgICB9XG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCBVUERBVEVfRk9MREVSID0gYFxuICBtdXRhdGlvbiBVcGRhdGVGb2xkZXIoJGlucHV0OiBVcGRhdGVGb2xkZXIhKSB7XG4gICAgdXBkYXRlRm9sZGVyKGlucHV0OiAkaW5wdXQpIHtcbiAgICAgIGlkXG4gICAgICBuYW1lXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgTU9WRV9GT0xERVIgPSBgXG4gIG11dGF0aW9uIE1vdmVGb2xkZXIoJGlucHV0OiBNb3ZlRm9sZGVyISkge1xuICAgIG1vdmVGb2xkZXIoaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgaWRcbiAgICAgIG5hbWVcbiAgICB9XG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCBNT1ZFX0ZPTERFUlMgPSBgXG4gIG11dGF0aW9uIE1vdmVGb2xkZXJzKCRpbnB1dDogTW92ZUZvbGRlcnMhKSB7XG4gICAgbW92ZUZvbGRlcnMoaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgb3JnYW5pemF0aW9uSWRcbiAgICAgIG5ld1BhcmVudEZvbGRlcklkXG4gICAgICB2YWxpZEZvbGRlcklkc1xuICAgICAgaW52YWxpZEZvbGRlcklkc1xuICAgICAgbWVzc2FnZVxuICAgIH1cbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IERFTEVURV9GT0xERVIgPSBgXG4gIG11dGF0aW9uIERlbGV0ZUZvbGRlcigkaW5wdXQ6IERlbGV0ZUZvbGRlciEpIHtcbiAgICBkZWxldGVGb2xkZXIoaW5wdXQ6ICRpbnB1dCkge1xuICAgICAgbWVzc2FnZVxuICAgIH1cbiAgfVxuYDtcbiIsICJleHBvcnQgY29uc3QgQ0hFQ0tfUk9PVF9GT0xERVJTID0gYFxuICBxdWVyeSBDaGVja1Jvb3RGb2xkZXJzKCR0eXBlOiBSb290Rm9sZGVyVHlwZSkge1xuICAgIHJvb3RGb2xkZXJzKHR5cGU6ICR0eXBlKSB7XG4gICAgICBpZFxuICAgICAgdHlwZUlkXG4gICAgICByb290Rm9sZGVyVHlwZUlkXG4gICAgICBuYW1lXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgR0VUX1JPT1RfRk9MREVSUyA9IGBcbiAgcXVlcnkgR2V0Um9vdEZvbGRlcnMge1xuICAgIHJvb3RGb2xkZXJzIHtcbiAgICAgIGlkXG4gICAgICBvd25lcklkXG4gICAgfVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgR0VUX0ZPTERFUiA9IGBcbiAgcXVlcnkgR2V0Rm9sZGVyKCRpZDogSUQhKSB7XG4gICAgZm9sZGVyKGlkOiAkaWQpIHtcbiAgICAgIGlkXG4gICAgICBuYW1lXG4gICAgICBjaGlsZEZvbGRlcnMge1xuICAgICAgICByZWNvcmRzIHtcbiAgICAgICAgICBpZFxuICAgICAgICAgIG5hbWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IEdFVF9GT0xERVJfT1ZFUlZJRVcgPSBgXG4gIHF1ZXJ5IEdldEZvbGRlck92ZXJ2aWV3KCRpZHM6IFtJRCFdISkge1xuICAgIGZvbGRlck92ZXJ2aWV3KGlkczogJGlkcykge1xuICAgICAgY2hpbGRGb2xkZXJzQ291bnRcbiAgICAgIGNoaWxkTm9uRm9sZGVyT2JqZWN0c0NvdW50XG4gICAgfVxuICB9XG5gO1xuIiwgImltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4vY2xpZW50XCI7XG5pbXBvcnQgeyBVU0VSX0xPR0lOLCBDUkVBVEVfUk9PVF9GT0xERVJTIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL211dGF0aW9uc1wiO1xuaW1wb3J0IHsgQ0hFQ0tfUk9PVF9GT0xERVJTIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL3F1ZXJpZXNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTZXR1cERhdGEge1xuICBlbmRwb2ludFVybDogc3RyaW5nO1xuICB0b2tlbjogc3RyaW5nO1xuICBvcmdhbml6YXRpb25JZDogc3RyaW5nO1xuICByb290Q21zSWQ6IHN0cmluZztcbiAgcm9vdFdhdGNobGlzdElkOiBzdHJpbmc7XG4gIHJvb3RGb2xkZXJJZDogc3RyaW5nO1xuICByb290Rm9sZGVyVHlwZTogc3RyaW5nO1xuICBydW5JZDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBBdXRoQW5kRW52aXJvbm1lbnQoKTogU2V0dXBEYXRhIHtcbiAgY29uc3QgZW5kcG9pbnRVcmwgPVxuICAgIF9fRU5WLkdSQVBIUUxfQVBJX1VSTCB8fFxuICAgIHByb2Nlc3MuZW52LkdSQVBIUUxfQVBJX1VSTCB8fFxuICAgIFwiaHR0cHM6Ly9hcGkuc3RhZ2UudXMtMS52ZXJpdG9uZS5jb20vdjMvZ3JhcGhxbFwiO1xuXG4gIGNvbnN0IHVzZXJOYW1lID1cbiAgICBfX0VOVi5BVVRIX1VTRVJfTkFNRSB8fFxuICAgIHByb2Nlc3MuZW52LkFVVEhfVVNFUl9OQU1FIHx8XG4gICAgXCJcIjtcblxuICBjb25zdCBwYXNzd29yZCA9XG4gICAgX19FTlYuQVVUSF9QQVNTV09SRCB8fFxuICAgIHByb2Nlc3MuZW52LkFVVEhfUEFTU1dPUkQgfHxcbiAgICBcIlwiO1xuXG4gIGlmICghdXNlck5hbWUgfHwgIXBhc3N3b3JkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyBBVVRIX1VTRVJfTkFNRSBvciBBVVRIX1BBU1NXT1JEIGNyZWRlbnRpYWxzIGZvciBrNiBsb2FkIHRlc3RcIik7XG4gIH1cblxuICAvLyAxLiBBdXRoZW50aWNhdGUgYWdhaW5zdCBhaVdBUkUgR3JhcGhRTCBBUElcbiAgY29uc3QgbG9naW5SZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBlbmRwb2ludFVybCxcbiAgICBVU0VSX0xPR0lOLFxuICAgIHtcbiAgICAgIGlucHV0OiB7IHVzZXJOYW1lLCBwYXNzd29yZCB9LFxuICAgIH0sXG4gICAgdW5kZWZpbmVkLFxuICAgIFwiU2V0dXBfVXNlckxvZ2luXCJcbiAgKTtcblxuICBpZiAobG9naW5SZXMuZXJyb3JzICYmIGxvZ2luUmVzLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBrNiBzZXR1cCBsb2dpbiBmYWlsZWQ6ICR7bG9naW5SZXMuZXJyb3JzLm1hcCgoZSkgPT4gZS5tZXNzYWdlKS5qb2luKFwiLCBcIil9YCk7XG4gIH1cblxuICBjb25zdCB0b2tlbiA9IGxvZ2luUmVzLmRhdGE/LnVzZXJMb2dpbj8udG9rZW47XG4gIGNvbnN0IG9yZ2FuaXphdGlvbklkID1cbiAgICBsb2dpblJlcy5kYXRhPy51c2VyTG9naW4/LnVzZXI/Lm9yZ2FuaXphdGlvbklkIHx8XG4gICAgbG9naW5SZXMuZGF0YT8udXNlckxvZ2luPy5vcmdhbml6YXRpb24/LmlkIHx8XG4gICAgXCJcIjtcblxuICBpZiAoIXRva2VuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiazYgc2V0dXAgbG9naW4gZmFpbGVkOiBObyBiZWFyZXIgdG9rZW4gcmV0dXJuZWRcIik7XG4gIH1cblxuICAvLyAyLiBEaXNjb3ZlciBvciBib290c3RyYXAgQ01TIHJvb3QgZm9sZGVyIGFuY2hvclxuICBsZXQgcm9vdENtc0lkID0gXCJcIjtcbiAgY29uc3QgY21zUm9vdFJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGVuZHBvaW50VXJsLFxuICAgIENIRUNLX1JPT1RfRk9MREVSUyxcbiAgICB7IHR5cGU6IFwiY21zXCIgfSxcbiAgICB0b2tlbixcbiAgICBcIlNldHVwX0NoZWNrQ21zUm9vdFwiXG4gICk7XG5cbiAgaWYgKGNtc1Jvb3RSZXMuZGF0YT8ucm9vdEZvbGRlcnMgJiYgY21zUm9vdFJlcy5kYXRhLnJvb3RGb2xkZXJzLmxlbmd0aCA+IDApIHtcbiAgICByb290Q21zSWQgPSBjbXNSb290UmVzLmRhdGEucm9vdEZvbGRlcnNbMF0uaWQ7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgY21zQ3JlYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICBlbmRwb2ludFVybCxcbiAgICAgIENSRUFURV9ST09UX0ZPTERFUlMsXG4gICAgICB7IHJvb3RGb2xkZXJUeXBlOiBcImNtc1wiIH0sXG4gICAgICB0b2tlbixcbiAgICAgIFwiU2V0dXBfQ3JlYXRlQ21zUm9vdFwiXG4gICAgKTtcbiAgICByb290Q21zSWQgPSBjbXNDcmVhdGVSZXMuZGF0YT8uY3JlYXRlUm9vdEZvbGRlcnM/LlswXT8uaWQgfHwgXCJcIjtcbiAgfVxuXG4gIC8vIDMuIERpc2NvdmVyIG9yIGJvb3RzdHJhcCBXYXRjaGxpc3Qgcm9vdCBmb2xkZXIgYW5jaG9yXG4gIGxldCByb290V2F0Y2hsaXN0SWQgPSBcIlwiO1xuICBjb25zdCB3bFJvb3RSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBlbmRwb2ludFVybCxcbiAgICBDSEVDS19ST09UX0ZPTERFUlMsXG4gICAgeyB0eXBlOiBcIndhdGNobGlzdFwiIH0sXG4gICAgdG9rZW4sXG4gICAgXCJTZXR1cF9DaGVja1dhdGNobGlzdFJvb3RcIlxuICApO1xuXG4gIGlmICh3bFJvb3RSZXMuZGF0YT8ucm9vdEZvbGRlcnMgJiYgd2xSb290UmVzLmRhdGEucm9vdEZvbGRlcnMubGVuZ3RoID4gMCkge1xuICAgIHJvb3RXYXRjaGxpc3RJZCA9IHdsUm9vdFJlcy5kYXRhLnJvb3RGb2xkZXJzWzBdLmlkO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHdsQ3JlYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICBlbmRwb2ludFVybCxcbiAgICAgIENSRUFURV9ST09UX0ZPTERFUlMsXG4gICAgICB7IHJvb3RGb2xkZXJUeXBlOiBcIndhdGNobGlzdFwiIH0sXG4gICAgICB0b2tlbixcbiAgICAgIFwiU2V0dXBfQ3JlYXRlV2F0Y2hsaXN0Um9vdFwiXG4gICAgKTtcbiAgICByb290V2F0Y2hsaXN0SWQgPSB3bENyZWF0ZVJlcy5kYXRhPy5jcmVhdGVSb290Rm9sZGVycz8uWzBdPy5pZCB8fCBcIlwiO1xuICB9XG5cbiAgY29uc3Qgcm9vdEZvbGRlcklkID0gcm9vdFdhdGNobGlzdElkIHx8IHJvb3RDbXNJZDtcbiAgY29uc3Qgcm9vdEZvbGRlclR5cGUgPSByb290V2F0Y2hsaXN0SWQgPyBcIndhdGNobGlzdFwiIDogXCJjbXNcIjtcblxuICBpZiAoIXJvb3RGb2xkZXJJZCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIms2IHNldHVwIGZhaWxlZDogQ291bGQgbm90IHJlc29sdmUgb3IgaW5pdGlhbGl6ZSBhbnkgcm9vdCBmb2xkZXIgYW5jaG9yXCIpO1xuICB9XG5cbiAgLy8gNC4gR2VuZXJhdGUgdW5pcXVlIHJ1biBzZXNzaW9uIHRhZ1xuICBjb25zdCBydW5JZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCA5KTtcblxuICByZXR1cm4ge1xuICAgIGVuZHBvaW50VXJsLFxuICAgIHRva2VuLFxuICAgIG9yZ2FuaXphdGlvbklkLFxuICAgIHJvb3RDbXNJZCxcbiAgICByb290V2F0Y2hsaXN0SWQsXG4gICAgcm9vdEZvbGRlcklkLFxuICAgIHJvb3RGb2xkZXJUeXBlLFxuICAgIHJ1bklkLFxuICB9O1xufVxuIiwgImltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4vY2xpZW50XCI7XG5pbXBvcnQgeyBTZXR1cERhdGEgfSBmcm9tIFwiLi9hdXRoXCI7XG5pbXBvcnQgeyBHRVRfRk9MREVSIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL3F1ZXJpZXNcIjtcbmltcG9ydCB7IERFTEVURV9GT0xERVIgfSBmcm9tIFwiLi4vLi4vZ3JhcGhxbC9mb2xkZXIvbXV0YXRpb25zXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiB0ZWFyZG93blN3ZWVwKGRhdGE6IFNldHVwRGF0YSk6IHZvaWQge1xuICBpZiAoIWRhdGEgfHwgIWRhdGEudG9rZW4pIHtcbiAgICBjb25zb2xlLmxvZyhcIltrNiB0ZWFyZG93bl0gU2tpcHBpbmcgc3dlZXA6IE1pc3Npbmcgc2Vzc2lvbiBkYXRhXCIpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHJvb3RJZHMgPSBBcnJheS5mcm9tKFxuICAgIG5ldyBTZXQoW2RhdGEucm9vdEZvbGRlcklkLCBkYXRhLnJvb3RDbXNJZCwgZGF0YS5yb290V2F0Y2hsaXN0SWRdLmZpbHRlcihCb29sZWFuKSlcbiAgKTtcblxuICBjb25zb2xlLmxvZyhgW2s2IHRlYXJkb3duXSBTdGFydGluZyBidWxrIHN3ZWVwIGZvciBydW5JZDogJHtkYXRhLnJ1bklkfS4uLmApO1xuICBsZXQgdG90YWxEZWxldGVkID0gMDtcblxuICBmb3IgKGNvbnN0IHJvb3RJZCBvZiByb290SWRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJvb3RGb2xkZXJSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgICAgR0VUX0ZPTERFUixcbiAgICAgICAgeyBpZDogcm9vdElkIH0sXG4gICAgICAgIGRhdGEudG9rZW4sXG4gICAgICAgIFwiVGVhcmRvd25fR2V0Um9vdENoaWxkcmVuXCJcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IHJlY29yZHM6IEFycmF5PHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0+ID1cbiAgICAgICAgcm9vdEZvbGRlclJlcy5kYXRhPy5mb2xkZXI/LmNoaWxkRm9sZGVycz8ucmVjb3JkcyB8fCBbXTtcblxuICAgICAgY29uc3QgcnVuUHJlZml4ID0gYGs2LWA7XG4gICAgICBjb25zdCBtYXRjaGluZ0ZvbGRlcnMgPSByZWNvcmRzLmZpbHRlcihcbiAgICAgICAgKGYpID0+IGYubmFtZSAmJiBmLm5hbWUuc3RhcnRzV2l0aChydW5QcmVmaXgpICYmIGYubmFtZS5pbmNsdWRlcyhkYXRhLnJ1bklkKVxuICAgICAgKTtcblxuICAgICAgaWYgKG1hdGNoaW5nRm9sZGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGBbazYgdGVhcmRvd25dIEZvdW5kICR7bWF0Y2hpbmdGb2xkZXJzLmxlbmd0aH0gdGVzdCBmb2xkZXIocykgdW5kZXIgcm9vdCAke3Jvb3RJZH1gXG4gICAgICAgICk7XG5cbiAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgbWF0Y2hpbmdGb2xkZXJzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIGZvbGRlciBoYXMgc3ViY2hpbGRyZW4gdG8gcHJ1bmUgZmlyc3RcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICAgICAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICAgICAgICAgIEdFVF9GT0xERVIsXG4gICAgICAgICAgICAgIHsgaWQ6IGZvbGRlci5pZCB9LFxuICAgICAgICAgICAgICBkYXRhLnRva2VuLFxuICAgICAgICAgICAgICBcIlRlYXJkb3duX0dldFN1YkNoaWxkcmVuXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBzdWJSZWNvcmRzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gPVxuICAgICAgICAgICAgICBjaGlsZFJlcy5kYXRhPy5mb2xkZXI/LmNoaWxkRm9sZGVycz8ucmVjb3JkcyB8fCBbXTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBzdWIgb2Ygc3ViUmVjb3Jkcykge1xuICAgICAgICAgICAgICBleGVjdXRlR3JhcGhRTChcbiAgICAgICAgICAgICAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgICAgICAgICAgICAgIERFTEVURV9GT0xERVIsXG4gICAgICAgICAgICAgICAgeyBpbnB1dDogeyBpZDogc3ViLmlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICAgICAgICAgICAgICBkYXRhLnRva2VuLFxuICAgICAgICAgICAgICAgIFwiVGVhcmRvd25fRGVsZXRlU3ViQ2hpbGRcIlxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBkZWxldGVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICAgICAgICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgICAgICAgICAgREVMRVRFX0ZPTERFUixcbiAgICAgICAgICAgICAgeyBpbnB1dDogeyBpZDogZm9sZGVyLmlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICAgICAgICAgICAgZGF0YS50b2tlbixcbiAgICAgICAgICAgICAgXCJUZWFyZG93bl9EZWxldGVGb2xkZXJcIlxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKCFkZWxldGVSZXMuZXJyb3JzIHx8IGRlbGV0ZVJlcy5lcnJvcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHRvdGFsRGVsZXRlZCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBmb3IgYWxyZWFkeSBkZWxldGVkIGZvbGRlcnNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIElnbm9yZSByb290IHF1ZXJ5IGVycm9yc1xuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUubG9nKGBbazYgdGVhcmRvd25dIFN3ZWVwIGNvbXBsZXRlOiBDbGVhbmx5IGRlbGV0ZWQgJHt0b3RhbERlbGV0ZWR9IHRlc3QgZm9sZGVyKHMpLmApO1xufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUh0bWxSZXBvcnQoZGF0YTogYW55KTogc3RyaW5nIHtcbiAgY29uc3QgbWV0cmljcyA9IGRhdGEubWV0cmljcyB8fCB7fTtcbiAgY29uc3Qgcm9vdEdyb3VwID0gZGF0YS5yb290X2dyb3VwIHx8IHt9O1xuXG4gIGNvbnN0IGh0dHBSZXFEdXJhdGlvbiA9IG1ldHJpY3MuaHR0cF9yZXFfZHVyYXRpb24/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgaHR0cFJlcXMgPSBtZXRyaWNzLmh0dHBfcmVxcz8udmFsdWVzIHx8IHt9O1xuICBjb25zdCBodHRwRmFpbGVkID0gbWV0cmljcy5odHRwX3JlcV9mYWlsZWQ/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgdnVzID0gbWV0cmljcy52dXM/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgY2hlY2tzID0gbWV0cmljcy5jaGVja3M/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgZ3JhcGhxbEVycm9ycyA9IG1ldHJpY3MuZ3JhcGhxbF9lcnJvcnM/LnZhbHVlcyB8fCB7fTtcblxuICBmdW5jdGlvbiBmbXRNcyhudW06IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gICAgaWYgKG51bSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKG51bSkpIHJldHVybiBcIk4vQVwiO1xuICAgIHJldHVybiBudW0gPj0gMTAwMCA/IChudW0gLyAxMDAwKS50b0ZpeGVkKDIpICsgXCJzXCIgOiBudW0udG9GaXhlZCgxKSArIFwibXNcIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZtdFBjdChudW06IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gICAgaWYgKG51bSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKG51bSkpIHJldHVybiBcIjAuMCVcIjtcbiAgICByZXR1cm4gKG51bSAqIDEwMCkudG9GaXhlZCgyKSArIFwiJVwiO1xuICB9XG5cbiAgLy8gQ291bnQgY2hlY2tzIHJlY3Vyc2l2ZWx5XG4gIGxldCBwYXNzZWRDaGVja3MgPSAwO1xuICBsZXQgZmFpbGVkQ2hlY2tzID0gMDtcbiAgZnVuY3Rpb24gY291bnRDaGVja3MoZ3JvdXA6IGFueSkge1xuICAgIGlmIChncm91cC5jaGVja3MpIHtcbiAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgZ3JvdXAuY2hlY2tzKSB7XG4gICAgICAgIHBhc3NlZENoZWNrcyArPSBjaGVjay5wYXNzZXMgfHwgMDtcbiAgICAgICAgZmFpbGVkQ2hlY2tzICs9IGNoZWNrLmZhaWxzIHx8IDA7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChncm91cC5ncm91cHMpIHtcbiAgICAgIGZvciAoY29uc3Qgc3ViR3JvdXAgb2YgZ3JvdXAuZ3JvdXBzKSB7XG4gICAgICAgIGNvdW50Q2hlY2tzKHN1Ykdyb3VwKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY291bnRDaGVja3Mocm9vdEdyb3VwKTtcblxuICBjb25zdCB0b3RhbENoZWNrcyA9IHBhc3NlZENoZWNrcyArIGZhaWxlZENoZWNrcztcbiAgY29uc3QgY2hlY2tzUGFzc1JhdGUgPSB0b3RhbENoZWNrcyA+IDAgPyAocGFzc2VkQ2hlY2tzIC8gdG90YWxDaGVja3MpICogMTAwIDogMTAwO1xuICBjb25zdCBpc0hlYWx0aHkgPSAoaHR0cEZhaWxlZC5yYXRlIHx8IDApIDwgMC4wMSAmJiAoZ3JhcGhxbEVycm9ycy5yYXRlIHx8IDApIDwgMC4wMTtcblxuICAvLyBCdWlsZCBjaGVja3MgbGlzdFxuICBsZXQgY2hlY2tzSHRtbCA9IFwiXCI7XG4gIGZ1bmN0aW9uIHJlbmRlckNoZWNrcyhncm91cDogYW55KSB7XG4gICAgaWYgKGdyb3VwLmNoZWNrcyAmJiBncm91cC5jaGVja3MubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChjb25zdCBjIG9mIGdyb3VwLmNoZWNrcykge1xuICAgICAgICBjb25zdCBwYXNzID0gKGMuZmFpbHMgfHwgMCkgPT09IDA7XG4gICAgICAgIGNoZWNrc0h0bWwgKz0gYFxuICAgICAgICAgIDx0ciBjbGFzcz1cIiR7cGFzcyA/IFwiY2hlY2stcGFzc1wiIDogXCJjaGVjay1mYWlsXCJ9XCI+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJmb250LXdlaWdodDogNTAwO1wiPiR7Yy5uYW1lfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJ0ZXh0LWFsaWduOiBjZW50ZXI7XCI+JHtwYXNzID8gXCJcdTI3MTMgUEFTU1wiIDogXCJcdTI3MTcgRkFJTFwifTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJ0ZXh0LWFsaWduOiByaWdodDtcIj4ke2MucGFzc2VzfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJ0ZXh0LWFsaWduOiByaWdodDsgY29sb3I6ICR7Yy5mYWlscyA+IDAgPyBcIiNlZjQ0NDRcIiA6IFwiaW5oZXJpdFwifTtcIj4ke2MuZmFpbHN9PC90ZD5cbiAgICAgICAgICA8L3RyPlxuICAgICAgICBgO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZ3JvdXAuZ3JvdXBzKSB7XG4gICAgICBmb3IgKGNvbnN0IGcgb2YgZ3JvdXAuZ3JvdXBzKSB7XG4gICAgICAgIHJlbmRlckNoZWNrcyhnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmVuZGVyQ2hlY2tzKHJvb3RHcm91cCk7XG5cbiAgcmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cbjxodG1sIGxhbmc9XCJlblwiPlxuPGhlYWQ+XG4gIDxtZXRhIGNoYXJzZXQ9XCJVVEYtOFwiPlxuICA8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PVwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMFwiPlxuICA8dGl0bGU+azYgTG9hZCBUZXN0IEV4ZWN1dGlvbiBSZXBvcnQ8L3RpdGxlPlxuICA8c3R5bGU+XG4gICAgOnJvb3Qge1xuICAgICAgLS1iZzogIzBmMTcyYTtcbiAgICAgIC0tY2FyZC1iZzogIzFlMjkzYjtcbiAgICAgIC0tdGV4dDogI2Y4ZmFmYztcbiAgICAgIC0tdGV4dC1tdXRlZDogIzk0YTNiODtcbiAgICAgIC0tYm9yZGVyOiAjMzM0MTU1O1xuICAgICAgLS1wcmltYXJ5OiAjMzhiZGY4O1xuICAgICAgLS1zdWNjZXNzOiAjMjJjNTVlO1xuICAgICAgLS1kYW5nZXI6ICNlZjQ0NDQ7XG4gICAgICAtLXdhcm5pbmc6ICNmNTllMGI7XG4gICAgfVxuICAgIGJvZHkge1xuICAgICAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgJ1NlZ29lIFVJJywgUm9ib3RvLCBIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICAgICAgYmFja2dyb3VuZC1jb2xvcjogdmFyKC0tYmcpO1xuICAgICAgY29sb3I6IHZhcigtLXRleHQpO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMnJlbTtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU7XG4gICAgfVxuICAgIC5jb250YWluZXIge1xuICAgICAgbWF4LXdpZHRoOiAxMjAwcHg7XG4gICAgICBtYXJnaW46IDAgYXV0bztcbiAgICB9XG4gICAgaGVhZGVyIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbiAgICAgIHBhZGRpbmctYm90dG9tOiAxcmVtO1xuICAgICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG4gICAgfVxuICAgIGgxIHtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcbiAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICBjb2xvcjogdmFyKC0tcHJpbWFyeSk7XG4gICAgfVxuICAgIC5iYWRnZSB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBwYWRkaW5nOiAwLjM1cmVtIDAuODVyZW07XG4gICAgICBib3JkZXItcmFkaXVzOiA5OTk5cHg7XG4gICAgICBmb250LXNpemU6IDAuODc1cmVtO1xuICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgfVxuICAgIC5iYWRnZS1zdWNjZXNzIHsgYmFja2dyb3VuZDogcmdiYSgzNCwgMTk3LCA5NCwgMC4yKTsgY29sb3I6IHZhcigtLXN1Y2Nlc3MpOyBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1zdWNjZXNzKTsgfVxuICAgIC5iYWRnZS1mYWlsIHsgYmFja2dyb3VuZDogcmdiYSgyMzksIDY4LCA2OCwgMC4yKTsgY29sb3I6IHZhcigtLWRhbmdlcik7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWRhbmdlcik7IH1cbiAgICBcbiAgICAuZ3JpZCB7XG4gICAgICBkaXNwbGF5OiBncmlkO1xuICAgICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoYXV0by1maXQsIG1pbm1heCgyMjBweCwgMWZyKSk7XG4gICAgICBnYXA6IDFyZW07XG4gICAgICBtYXJnaW4tYm90dG9tOiAycmVtO1xuICAgIH1cbiAgICAuY2FyZCB7XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBwYWRkaW5nOiAxLjI1cmVtO1xuICAgIH1cbiAgICAuY2FyZC10aXRsZSB7XG4gICAgICBmb250LXNpemU6IDAuODVyZW07XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDVlbTtcbiAgICAgIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcbiAgICB9XG4gICAgLmNhcmQtdmFsIHtcbiAgICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcbiAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgfVxuICAgIFxuICAgIHRhYmxlIHtcbiAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgYm9yZGVyLWNvbGxhcHNlOiBjb2xsYXBzZTtcbiAgICAgIG1hcmdpbi10b3A6IDFyZW07XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO1xuICAgIH1cbiAgICB0aCwgdGQge1xuICAgICAgcGFkZGluZzogMC43NXJlbSAxcmVtO1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO1xuICAgIH1cbiAgICB0aCB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDE1LCAyMywgNDIsIDAuNik7XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgZm9udC1zaXplOiAwLjg1cmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICB9XG4gICAgLnNlY3Rpb24tdGl0bGUge1xuICAgICAgZm9udC1zaXplOiAxLjI1cmVtO1xuICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgIG1hcmdpbi10b3A6IDJyZW07XG4gICAgICBtYXJnaW4tYm90dG9tOiAwLjc1cmVtO1xuICAgICAgY29sb3I6IHZhcigtLXRleHQpO1xuICAgIH1cbiAgPC9zdHlsZT5cbjwvaGVhZD5cbjxib2R5PlxuICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XG4gICAgPGhlYWRlcj5cbiAgICAgIDxkaXY+XG4gICAgICAgIDxoMT5haVdBUkUgR3JhcGhRTCBrNiBMb2FkIFRlc3QgUmVwb3J0PC9oMT5cbiAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgZm9udC1zaXplOiAwLjlyZW07IG1hcmdpbi10b3A6IDAuMjVyZW07XCI+XG4gICAgICAgICAgRXhlY3V0ZWQgb24gJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9IHwgVGFyZ2V0OiBWZXJpdG9uZSBhaVdBUkUgRm9sZGVyIExpZmVjeWNsZVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJiYWRnZSAke2lzSGVhbHRoeSA/IFwiYmFkZ2Utc3VjY2Vzc1wiIDogXCJiYWRnZS1mYWlsXCJ9XCI+XG4gICAgICAgICAgJHtpc0hlYWx0aHkgPyBcIkhFQUxUSFkgLyBQQVNTRURcIiA6IFwiRkFJTFVSRVMgREVURUNURURcIn1cbiAgICAgICAgPC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgPC9oZWFkZXI+XG5cbiAgICA8ZGl2IGNsYXNzPVwiZ3JpZFwiPlxuICAgICAgPGRpdiBjbGFzcz1cImNhcmRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdGl0bGVcIj5Ub3RhbCBSZXF1ZXN0czwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC12YWxcIj4ke2h0dHBSZXFzLmNvdW50IHx8IDB9PC9kaXY+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGZvbnQtc2l6ZTogMC44NXJlbTsgbWFyZ2luLXRvcDogMC4yNXJlbTtcIj5cbiAgICAgICAgICBSYXRlOiAkeyhodHRwUmVxcy5yYXRlIHx8IDApLnRvRml4ZWQoMSl9IHJlcS9zXG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLXRpdGxlXCI+cCg5NSkgRHVyYXRpb248L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdmFsXCIgc3R5bGU9XCJjb2xvcjogdmFyKC0tcHJpbWFyeSk7XCI+JHtmbXRNcyhodHRwUmVxRHVyYXRpb25bXCJwKDk1KVwiXSl9PC9kaXY+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGZvbnQtc2l6ZTogMC44NXJlbTsgbWFyZ2luLXRvcDogMC4yNXJlbTtcIj5cbiAgICAgICAgICBwKDk5KTogJHtmbXRNcyhodHRwUmVxRHVyYXRpb25bXCJwKDk5KVwiXSl9IHwgTWVkOiAke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbi5tZWQpfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC10aXRsZVwiPkhUVFAgRmFpbHVyZSBSYXRlPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLXZhbFwiIHN0eWxlPVwiY29sb3I6ICR7KGh0dHBGYWlsZWQucmF0ZSB8fCAwKSA+IDAgPyBcInZhcigtLWRhbmdlcilcIiA6IFwidmFyKC0tc3VjY2VzcylcIn07XCI+XG4gICAgICAgICAgJHtmbXRQY3QoaHR0cEZhaWxlZC5yYXRlKX1cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGZvbnQtc2l6ZTogMC44NXJlbTsgbWFyZ2luLXRvcDogMC4yNXJlbTtcIj5cbiAgICAgICAgICBGYWlsZWQ6ICR7aHR0cEZhaWxlZC5wYXNzZXMgfHwgMH0gcmVxc1xuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC10aXRsZVwiPkNoZWNrcyBQYXNzIFJhdGU8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdmFsXCIgc3R5bGU9XCJjb2xvcjogJHtjaGVja3NQYXNzUmF0ZSA+PSA5OSA/IFwidmFyKC0tc3VjY2VzcylcIiA6IFwidmFyKC0tZGFuZ2VyKVwifTtcIj5cbiAgICAgICAgICAke2NoZWNrc1Bhc3NSYXRlLnRvRml4ZWQoMSl9JVxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgZm9udC1zaXplOiAwLjg1cmVtOyBtYXJnaW4tdG9wOiAwLjI1cmVtO1wiPlxuICAgICAgICAgICR7cGFzc2VkQ2hlY2tzfSBwYXNzZWQgLyAke2ZhaWxlZENoZWNrc30gZmFpbGVkXG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLXRpdGxlXCI+TWF4IFZpcnR1YWwgVXNlcnM8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtdmFsXCI+JHt2dXMubWF4IHx8IHZ1cy52YWx1ZSB8fCAxfTwvZGl2PlxuICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpOyBmb250LXNpemU6IDAuODVyZW07IG1hcmdpbi10b3A6IDAuMjVyZW07XCI+XG4gICAgICAgICAgR3JhcGhRTCBFcnJvcnM6ICR7Zm10UGN0KGdyYXBocWxFcnJvcnMucmF0ZSl9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG5cbiAgICA8ZGl2IGNsYXNzPVwic2VjdGlvbi10aXRsZVwiPkhUVFAgVGltaW5nIFBlcmNlbnRpbGVzPC9kaXY+XG4gICAgPHRhYmxlPlxuICAgICAgPHRoZWFkPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRoPk1ldHJpYzwvdGg+XG4gICAgICAgICAgPHRoPk1pbjwvdGg+XG4gICAgICAgICAgPHRoPk1lZGlhbiAocDUwKTwvdGg+XG4gICAgICAgICAgPHRoPnAoOTApPC90aD5cbiAgICAgICAgICA8dGg+cCg5NSk8L3RoPlxuICAgICAgICAgIDx0aD5wKDk5KTwvdGg+XG4gICAgICAgICAgPHRoPk1heDwvdGg+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RoZWFkPlxuICAgICAgPHRib2R5PlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRkIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDYwMDtcIj5odHRwX3JlcV9kdXJhdGlvbjwvdGQ+XG4gICAgICAgICAgPHRkPiR7Zm10TXMoaHR0cFJlcUR1cmF0aW9uLm1pbil9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtmbXRNcyhodHRwUmVxRHVyYXRpb24ubWVkKX08L3RkPlxuICAgICAgICAgIDx0ZD4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbltcInAoOTApXCJdKX08L3RkPlxuICAgICAgICAgIDx0ZCBzdHlsZT1cImNvbG9yOiB2YXIoLS1wcmltYXJ5KTsgZm9udC13ZWlnaHQ6IDYwMDtcIj4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbltcInAoOTUpXCJdKX08L3RkPlxuICAgICAgICAgIDx0ZCBzdHlsZT1cImNvbG9yOiB2YXIoLS1wcmltYXJ5KTtcIj4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbltcInAoOTkpXCJdKX08L3RkPlxuICAgICAgICAgIDx0ZD4ke2ZtdE1zKGh0dHBSZXFEdXJhdGlvbi5tYXgpfTwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3Rib2R5PlxuICAgIDwvdGFibGU+XG5cbiAgICA8ZGl2IGNsYXNzPVwic2VjdGlvbi10aXRsZVwiPkFzc2VydGlvbiBDaGVja3MgQnJlYWtkb3duPC9kaXY+XG4gICAgPHRhYmxlPlxuICAgICAgPHRoZWFkPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRoPkNoZWNrIE5hbWU8L3RoPlxuICAgICAgICAgIDx0aCBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjtcIj5TdGF0dXM8L3RoPlxuICAgICAgICAgIDx0aCBzdHlsZT1cInRleHQtYWxpZ246IHJpZ2h0O1wiPlBhc3NlczwvdGg+XG4gICAgICAgICAgPHRoIHN0eWxlPVwidGV4dC1hbGlnbjogcmlnaHQ7XCI+RmFpbHM8L3RoPlxuICAgICAgICA8L3RyPlxuICAgICAgPC90aGVhZD5cbiAgICAgIDx0Ym9keT5cbiAgICAgICAgJHtjaGVja3NIdG1sIHx8IFwiPHRyPjx0ZCBjb2xzcGFuPSc0JyBzdHlsZT0ndGV4dC1hbGlnbjpjZW50ZXI7Jz5ObyBpbmRpdmlkdWFsIGNoZWNrcyByZWNvcmRlZDwvdGQ+PC90cj5cIn1cbiAgICAgIDwvdGJvZHk+XG4gICAgPC90YWJsZT5cbiAgPC9kaXY+XG48L2JvZHk+XG48L2h0bWw+YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ29uc29sZVN1bW1hcnkoZGF0YTogYW55KTogc3RyaW5nIHtcbiAgY29uc3QgbWV0cmljcyA9IGRhdGEubWV0cmljcyB8fCB7fTtcbiAgY29uc3QgaHR0cER1cmF0aW9uID0gbWV0cmljcy5odHRwX3JlcV9kdXJhdGlvbj8udmFsdWVzIHx8IHt9O1xuICBjb25zdCByZXFzID0gbWV0cmljcy5odHRwX3JlcXM/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgZmFpbGVkID0gbWV0cmljcy5odHRwX3JlcV9mYWlsZWQ/LnZhbHVlcyB8fCB7fTtcbiAgY29uc3QgY2hlY2tzID0gbWV0cmljcy5jaGVja3M/LnZhbHVlcyB8fCB7fTtcblxuICByZXR1cm4gYFxuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgICAgICAgICAgICAgICAgazYgTE9BRCBURVNUIEVYRUNVVElPTiBTVU1NQVJZXG49PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuVG90YWwgUmVxdWVzdHM6ICAgICR7cmVxcy5jb3VudCB8fCAwfSAoJHsocmVxcy5yYXRlIHx8IDApLnRvRml4ZWQoMSl9IHJlcS9zKVxuSFRUUCBGYWlsdXJlczogICAgICR7KChmYWlsZWQucmF0ZSB8fCAwKSAqIDEwMCkudG9GaXhlZCgyKX0lICgke2ZhaWxlZC5wYXNzZXMgfHwgMH0gZmFpbGVkKVxuQ2hlY2tzIFBhc3MgUmF0ZTogICR7KChjaGVja3MucmF0ZSB8fCAwKSAqIDEwMCkudG9GaXhlZCgxKX0lICgke2NoZWNrcy5wYXNzZXMgfHwgMH0gcGFzc2VkIC8gJHtjaGVja3MuZmFpbHMgfHwgMH0gZmFpbGVkKVxuLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbkR1cmF0aW9uIChwNTApOiAgICAkeyhodHRwRHVyYXRpb24ubWVkIHx8IDApLnRvRml4ZWQoMSl9IG1zXG5EdXJhdGlvbiAocDkwKTogICAgJHsoaHR0cER1cmF0aW9uW1wicCg5MClcIl0gfHwgMCkudG9GaXhlZCgxKX0gbXNcbkR1cmF0aW9uIChwOTUpOiAgICAkeyhodHRwRHVyYXRpb25bXCJwKDk1KVwiXSB8fCAwKS50b0ZpeGVkKDEpfSBtc1xuRHVyYXRpb24gKHA5OSk6ICAgICR7KGh0dHBEdXJhdGlvbltcInAoOTkpXCJdIHx8IDApLnRvRml4ZWQoMSl9IG1zXG5EdXJhdGlvbiAobWF4KTogICAgJHsoaHR0cER1cmF0aW9uLm1heCB8fCAwKS50b0ZpeGVkKDEpfSBtc1xuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbkhUTUwgUmVwb3J0IHdyaXR0ZW4gdG86IGs2LXJlcG9ydC5odG1sXG5gO1xufVxuXG4iLCAiaW1wb3J0IHsgc2xlZXAsIGNoZWNrIH0gZnJvbSBcIms2XCI7XG5pbXBvcnQgeyBleGVjdXRlR3JhcGhRTCB9IGZyb20gXCIuLi9oZWxwZXJzL2NsaWVudFwiO1xuaW1wb3J0IHsgU2V0dXBEYXRhIH0gZnJvbSBcIi4uL2hlbHBlcnMvYXV0aFwiO1xuaW1wb3J0IHtcbiAgQ1JFQVRFX0ZPTERFUixcbiAgVVBEQVRFX0ZPTERFUixcbiAgTU9WRV9GT0xERVIsXG4gIE1PVkVfRk9MREVSUyxcbiAgREVMRVRFX0ZPTERFUixcbn0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL211dGF0aW9uc1wiO1xuaW1wb3J0IHsgR0VUX0ZPTERFUl9PVkVSVklFVyB9IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9xdWVyaWVzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaWZlY3ljbGVTY2VuYXJpbyhkYXRhOiBTZXR1cERhdGEpOiB2b2lkIHtcbiAgY29uc3QgdnVJZCA9IF9fVlU7XG4gIGNvbnN0IGl0ZXJJZCA9IF9fSVRFUjtcbiAgY29uc3QgcHJlZml4ID0gYGs2LXJ1bi0ke2RhdGEucnVuSWR9LXZ1JHt2dUlkfS1pdCR7aXRlcklkfWA7XG4gIGNvbnN0IHJvb3RJZCA9IGRhdGEucm9vdEZvbGRlcklkIHx8IGRhdGEucm9vdFdhdGNobGlzdElkIHx8IGRhdGEucm9vdENtc0lkO1xuICBjb25zdCByb290VHlwZSA9IGRhdGEucm9vdEZvbGRlclR5cGUgfHwgKGRhdGEucm9vdFdhdGNobGlzdElkID8gXCJ3YXRjaGxpc3RcIiA6IFwiY21zXCIpO1xuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUEhBU0UgMjogVFJFRSBDT05TVFJVQ1RJT04gJiBISUVSQVJDSFkgRVhQQU5TSU9OXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAvLyBTdGVwIDIuMTogQ3JlYXRlIFByaW1hcnkgVG9wLUxldmVsIEZvbGRlcnMgKEZvbGRlciBBIGFuZCBGb2xkZXIgQilcbiAgY29uc3QgZm9sZGVyQVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LUZvbGRlckFgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJQcmltYXJ5IGluZ2VzdCByb290IEEgZm9yIGs2IGxpZmVjeWNsZSBsb2FkIHRlc3RcIixcbiAgICAgICAgcGFyZW50SWQ6IHJvb3RJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9DcmVhdGVGb2xkZXJBXCJcbiAgKTtcblxuICBjb25zdCBmb2xkZXJBSWQgPSBmb2xkZXJBUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG4gIGNoZWNrKGZvbGRlckFSZXMsIHtcbiAgICBcIkZvbGRlciBBIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5XCI6ICgpID0+ICEhZm9sZGVyQUlkLFxuICB9KTtcblxuICBjb25zdCBmb2xkZXJCUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDUkVBVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG5hbWU6IGAke3ByZWZpeH0tRm9sZGVyQmAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlByaW1hcnkgc3RhZ2luZyByb290IEIgZm9yIGs2IGxpZmVjeWNsZSBsb2FkIHRlc3RcIixcbiAgICAgICAgcGFyZW50SWQ6IHJvb3RJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9DcmVhdGVGb2xkZXJCXCJcbiAgKTtcblxuICBjb25zdCBmb2xkZXJCSWQgPSBmb2xkZXJCUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG4gIGNoZWNrKGZvbGRlckJSZXMsIHtcbiAgICBcIkZvbGRlciBCIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5XCI6ICgpID0+ICEhZm9sZGVyQklkLFxuICB9KTtcblxuICBpZiAoIWZvbGRlckFJZCB8fCAhZm9sZGVyQklkKSB7XG4gICAgY29uc29sZS5lcnJvcihgW1ZVICR7dnVJZH1dIEZhaWxlZCB0byBjcmVhdGUgdG9wLWxldmVsIHRlc3QgZm9sZGVyc2ApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFN0ZXAgMi4yOiBDcmVhdGUgU3ViLUZvbGRlcnMgdW5kZXIgRm9sZGVyIEFcbiAgY29uc3Qgc3ViMVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LVN1YjFgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJDaGlsZCBzdWJmb2xkZXIgMSBmb3IgcmVsb2NhdGlvblwiLFxuICAgICAgICBwYXJlbnRJZDogZm9sZGVyQUlkLFxuICAgICAgICByb290Rm9sZGVyVHlwZTogcm9vdFR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAxX0NyZWF0ZVN1YjFcIlxuICApO1xuICBjb25zdCBzdWIxSWQgPSBzdWIxUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG5cbiAgY29uc3Qgc3ViMlJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LVN1YjJgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJDaGlsZCBzdWJmb2xkZXIgMiBmb3IgYnVsayBtaWdyYXRpb25cIixcbiAgICAgICAgcGFyZW50SWQ6IGZvbGRlckFJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9DcmVhdGVTdWIyXCJcbiAgKTtcbiAgY29uc3Qgc3ViMklkID0gc3ViMlJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUEhBU0UgMzogSU4tUExBQ0UgTUFJTlRFTkFOQ0UgJiBNRVRBREFUQSBFVk9MVVRJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBpZiAoc3ViMklkKSB7XG4gICAgY29uc3QgdXBkYXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgICAgVVBEQVRFX0ZPTERFUixcbiAgICAgIHtcbiAgICAgICAgaW5wdXQ6IHtcbiAgICAgICAgICBpZDogc3ViMklkLFxuICAgICAgICAgIG5hbWU6IGAke3ByZWZpeH0tU3ViMi1BcmNoaXZlZGAsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgZGF0YS50b2tlbixcbiAgICAgIFwiVENfTFRfMDFfVXBkYXRlRm9sZGVyXCJcbiAgICApO1xuXG4gICAgY2hlY2sodXBkYXRlUmVzLCB7XG4gICAgICBcIlN1YjIgbmFtZSB1cGRhdGVkIHN1Y2Nlc3NmdWxseVwiOiAocikgPT5cbiAgICAgICAgci5kYXRhPy51cGRhdGVGb2xkZXI/Lm5hbWUgPT09IGAke3ByZWZpeH0tU3ViMi1BcmNoaXZlZGAsXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBIQVNFIDQ6IENPTkNVUlJFTkNZLVNBRkUgU0lOR0xFIFJFTE9DQVRJT04gKE9DQylcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBpZiAoc3ViMUlkKSB7XG4gICAgY29uc3QgbW92ZVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgIE1PVkVfRk9MREVSLFxuICAgICAge1xuICAgICAgICBpbnB1dDoge1xuICAgICAgICAgIGZvbGRlcklkOiBzdWIxSWQsXG4gICAgICAgICAgZnJvbUZvbGRlcklkOiBmb2xkZXJBSWQsXG4gICAgICAgICAgdG9Gb2xkZXJJZDogZm9sZGVyQklkLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGRhdGEudG9rZW4sXG4gICAgICBcIlRDX0xUXzAxX01vdmVGb2xkZXJTaW5nbGVcIlxuICAgICk7XG5cbiAgICBjaGVjayhtb3ZlUmVzLCB7XG4gICAgICBcIlN1YjEgbW92ZWQgdG8gRm9sZGVyIEJcIjogKHIpID0+ICEhci5kYXRhPy5tb3ZlRm9sZGVyPy5pZCxcbiAgICB9KTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUEhBU0UgNTogQlVMSyBNSUdSQVRJT04gJiBSRUJBTEFOQ0lOR1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGlmIChzdWIySWQpIHtcbiAgICBjb25zdCBidWxrTW92ZVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgIE1PVkVfRk9MREVSUyxcbiAgICAgIHtcbiAgICAgICAgaW5wdXQ6IHtcbiAgICAgICAgICBmb2xkZXJJZHM6IFtzdWIySWRdLFxuICAgICAgICAgIG5ld1BhcmVudEZvbGRlcklkOiBmb2xkZXJCSWQsXG4gICAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGRhdGEudG9rZW4sXG4gICAgICBcIlRDX0xUXzAxX01vdmVGb2xkZXJzQnVsa1wiXG4gICAgKTtcblxuICAgIGNoZWNrKGJ1bGtNb3ZlUmVzLCB7XG4gICAgICBcIlN1YjIgYnVsayBtb3ZlZCB0byBGb2xkZXIgQlwiOiAocikgPT5cbiAgICAgICAgQXJyYXkuaXNBcnJheShyLmRhdGE/Lm1vdmVGb2xkZXJzPy52YWxpZEZvbGRlcklkcykgJiZcbiAgICAgICAgci5kYXRhLm1vdmVGb2xkZXJzLnZhbGlkRm9sZGVySWRzLmluY2x1ZGVzKHN1YjJJZCksXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBIQVNFIDY6IE9WRVJWSUVXIFFVRVJZICYgSElFUkFSQ0hZIFBSVU5JTkcgLyBERVNUUlVDVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGNvbnN0IG92ZXJ2aWV3UmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBHRVRfRk9MREVSX09WRVJWSUVXLFxuICAgIHtcbiAgICAgIGlkczogW2ZvbGRlckFJZCwgZm9sZGVyQklkXSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9HZXRGb2xkZXJPdmVydmlld1wiXG4gICk7XG5cbiAgY2hlY2sob3ZlcnZpZXdSZXMsIHtcbiAgICBcIk92ZXJ2aWV3IHF1ZXJ5IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseVwiOiAocikgPT5cbiAgICAgICEhci5kYXRhPy5mb2xkZXJPdmVydmlldyAmJlxuICAgICAgdHlwZW9mIHIuZGF0YS5mb2xkZXJPdmVydmlldy5jaGlsZEZvbGRlcnNDb3VudCAhPT0gXCJ1bmRlZmluZWRcIixcbiAgfSk7XG5cbiAgLy8gUHJ1bmUgY3JlYXRlZCBsZWFmIG5vZGVzIGZpcnN0IHRvIHNhdGlzZnkgYWlXQVJFJ3Mgbm9uLWVtcHR5IGZvbGRlciB2YWxpZGF0aW9uXG4gIGlmIChzdWIxSWQpIHtcbiAgICBleGVjdXRlR3JhcGhRTChcbiAgICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgICBERUxFVEVfRk9MREVSLFxuICAgICAge1xuICAgICAgICBpbnB1dDoge1xuICAgICAgICAgIGlkOiBzdWIxSWQsXG4gICAgICAgICAgb3JkZXJJbmRleDogMCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkYXRhLnRva2VuLFxuICAgICAgXCJUQ19MVF8wMV9EZWxldGVTdWIxXCJcbiAgICApO1xuICB9XG5cbiAgaWYgKHN1YjJJZCkge1xuICAgIGV4ZWN1dGVHcmFwaFFMKFxuICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgIERFTEVURV9GT0xERVIsXG4gICAgICB7XG4gICAgICAgIGlucHV0OiB7XG4gICAgICAgICAgaWQ6IHN1YjJJZCxcbiAgICAgICAgICBvcmRlckluZGV4OiAwLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGRhdGEudG9rZW4sXG4gICAgICBcIlRDX0xUXzAxX0RlbGV0ZVN1YjJcIlxuICAgICk7XG4gIH1cblxuICAvLyBEZWxldGUgcGFyZW50IGZvbGRlcnMgKG5vdyBlbXB0eSlcbiAgZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBERUxFVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIGlkOiBmb2xkZXJBSWQsXG4gICAgICAgIG9yZGVySW5kZXg6IDAsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAxX0RlbGV0ZUZvbGRlckFcIlxuICApO1xuXG4gIGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgREVMRVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBpZDogZm9sZGVyQklkLFxuICAgICAgICBvcmRlckluZGV4OiAwLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMV9EZWxldGVGb2xkZXJCXCJcbiAgKTtcblxuICBzbGVlcCgwLjUpO1xufVxuIiwgImltcG9ydCB7IHNsZWVwLCBjaGVjayB9IGZyb20gXCJrNlwiO1xuaW1wb3J0IHsgZXhlY3V0ZUdyYXBoUUwgfSBmcm9tIFwiLi4vaGVscGVycy9jbGllbnRcIjtcbmltcG9ydCB7IFNldHVwRGF0YSB9IGZyb20gXCIuLi9oZWxwZXJzL2F1dGhcIjtcbmltcG9ydCB7IENSRUFURV9GT0xERVIsIERFTEVURV9GT0xERVIgfSBmcm9tIFwiLi4vLi4vZ3JhcGhxbC9mb2xkZXIvbXV0YXRpb25zXCI7XG5pbXBvcnQgeyBHRVRfRk9MREVSIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL3F1ZXJpZXNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkJ1cnN0U2NlbmFyaW8oZGF0YTogU2V0dXBEYXRhKTogdm9pZCB7XG4gIGNvbnN0IHZ1SWQgPSBfX1ZVO1xuICBjb25zdCBpdGVySWQgPSBfX0lURVI7XG4gIGNvbnN0IHByZWZpeCA9IGBrNi1idXJzdC0ke2RhdGEucnVuSWR9LXZ1JHt2dUlkfS1pdCR7aXRlcklkfWA7XG4gIGNvbnN0IHJvb3RJZCA9IGRhdGEucm9vdEZvbGRlcklkIHx8IGRhdGEucm9vdFdhdGNobGlzdElkIHx8IGRhdGEucm9vdENtc0lkO1xuICBjb25zdCByb290VHlwZSA9IGRhdGEucm9vdEZvbGRlclR5cGUgfHwgKGRhdGEucm9vdFdhdGNobGlzdElkID8gXCJ3YXRjaGxpc3RcIiA6IFwiY21zXCIpO1xuXG4gIC8vIFN0ZXAgMTogQ3JlYXRlIHRvcC1sZXZlbCBmb2xkZXIgdW5kZXIgcm9vdFxuICBjb25zdCBjcmVhdGVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1Ob2RlYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiazYgYnVyc3Qgc2NlbmFyaW8gcm9vdCBub2RlXCIsXG4gICAgICAgIHBhcmVudElkOiByb290SWQsXG4gICAgICAgIHJvb3RGb2xkZXJUeXBlOiByb290VHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDJfQnVyc3RDcmVhdGVSb290Tm9kZVwiXG4gICk7XG5cbiAgY29uc3QgbmV3SWQgPSBjcmVhdGVSZXMuZGF0YT8uY3JlYXRlRm9sZGVyPy5pZDtcbiAgY2hlY2soY3JlYXRlUmVzLCB7XG4gICAgXCJCdXJzdCB0b3Agbm9kZSBjcmVhdGVkXCI6ICgpID0+ICEhbmV3SWQsXG4gIH0pO1xuXG4gIGlmICghbmV3SWQpIHJldHVybjtcblxuICAvLyBTdGVwIDI6IEltbWVkaWF0ZWx5IGF0dGFjaCBjaGlsZCBub2RlXG4gIGNvbnN0IGNoaWxkUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDUkVBVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG5hbWU6IGAke3ByZWZpeH0tQ2hpbGRgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJrNiBidXJzdCBzY2VuYXJpbyBjaGlsZCBub2RlXCIsXG4gICAgICAgIHBhcmVudElkOiBuZXdJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wMl9CdXJzdENyZWF0ZUNoaWxkTm9kZVwiXG4gICk7XG5cbiAgY29uc3QgY2hpbGRJZCA9IGNoaWxkUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG4gIGNoZWNrKGNoaWxkUmVzLCB7XG4gICAgXCJCdXJzdCBjaGlsZCBub2RlIGF0dGFjaGVkXCI6ICgpID0+ICEhY2hpbGRJZCxcbiAgfSk7XG5cbiAgLy8gU3RlcCAzOiBWZXJpZnkgcGFyZW50IGhhcyBjaGlsZFxuICBjb25zdCBnZXRSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIEdFVF9GT0xERVIsXG4gICAgeyBpZDogbmV3SWQgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDJfQnVyc3RWZXJpZnlIaWVyYXJjaHlcIlxuICApO1xuXG4gIGNoZWNrKGdldFJlcywge1xuICAgIFwiUGFyZW50IGhpZXJhcmNoeSBpbmNsdWRlcyBjaGlsZFwiOiAocikgPT5cbiAgICAgIEFycmF5LmlzQXJyYXkoci5kYXRhPy5mb2xkZXI/LmNoaWxkRm9sZGVycz8ucmVjb3JkcykgJiZcbiAgICAgIHIuZGF0YS5mb2xkZXIuY2hpbGRGb2xkZXJzLnJlY29yZHMubGVuZ3RoID4gMCxcbiAgfSk7XG5cbiAgLy8gU3RlcCA0OiBDbGVhbiB1cCBjaGlsZCBmaXJzdCwgdGhlbiB0b3Agbm9kZVxuICBpZiAoY2hpbGRJZCkge1xuICAgIGV4ZWN1dGVHcmFwaFFMKFxuICAgICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICAgIERFTEVURV9GT0xERVIsXG4gICAgICB7IGlucHV0OiB7IGlkOiBjaGlsZElkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICAgIGRhdGEudG9rZW4sXG4gICAgICBcIlRDX0xUXzAyX0RlbGV0ZUNoaWxkTm9kZVwiXG4gICAgKTtcbiAgfVxuXG4gIGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgREVMRVRFX0ZPTERFUixcbiAgICB7IGlucHV0OiB7IGlkOiBuZXdJZCwgb3JkZXJJbmRleDogMCB9IH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAyX0RlbGV0ZVRvcE5vZGVcIlxuICApO1xuXG4gIHNsZWVwKDAuMik7XG59XG4iLCAiaW1wb3J0IHsgc2xlZXAsIGNoZWNrIH0gZnJvbSBcIms2XCI7XG5pbXBvcnQgeyBleGVjdXRlR3JhcGhRTCB9IGZyb20gXCIuLi9oZWxwZXJzL2NsaWVudFwiO1xuaW1wb3J0IHsgU2V0dXBEYXRhIH0gZnJvbSBcIi4uL2hlbHBlcnMvYXV0aFwiO1xuaW1wb3J0IHsgQ0hFQ0tfUk9PVF9GT0xERVJTLCBHRVRfUk9PVF9GT0xERVJTLCBHRVRfRk9MREVSIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL3F1ZXJpZXNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJ1blJlYWRTY2VuYXJpbyhkYXRhOiBTZXR1cERhdGEpOiB2b2lkIHtcbiAgLy8gU3RlcCAxOiBRdWVyeSBDTVMgcm9vdCBmb2xkZXJzXG4gIGNvbnN0IGNtc1Jvb3RSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENIRUNLX1JPT1RfRk9MREVSUyxcbiAgICB7IHR5cGU6IFwiY21zXCIgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDNfQ2hlY2tDbXNSb290Rm9sZGVyc1wiXG4gICk7XG5cbiAgY2hlY2soY21zUm9vdFJlcywge1xuICAgIFwiQ01TIHJvb3QgZm9sZGVyIGZvdW5kXCI6IChyKSA9PlxuICAgICAgQXJyYXkuaXNBcnJheShyLmRhdGE/LnJvb3RGb2xkZXJzKSAmJiByLmRhdGEucm9vdEZvbGRlcnMubGVuZ3RoID4gMCxcbiAgfSk7XG5cbiAgLy8gU3RlcCAyOiBRdWVyeSBXYXRjaGxpc3Qgcm9vdCBmb2xkZXJzXG4gIGNvbnN0IHdsUm9vdFJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ0hFQ0tfUk9PVF9GT0xERVJTLFxuICAgIHsgdHlwZTogXCJ3YXRjaGxpc3RcIiB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wM19DaGVja1dhdGNobGlzdFJvb3RGb2xkZXJzXCJcbiAgKTtcblxuICBjaGVjayh3bFJvb3RSZXMsIHtcbiAgICBcIldhdGNobGlzdCByb290IGZvbGRlciBmb3VuZFwiOiAocikgPT5cbiAgICAgIEFycmF5LmlzQXJyYXkoci5kYXRhPy5yb290Rm9sZGVycykgJiYgci5kYXRhLnJvb3RGb2xkZXJzLmxlbmd0aCA+IDAsXG4gIH0pO1xuXG4gIC8vIFN0ZXAgMzogR2V0IGFsbCByb290IGZvbGRlcnMgYWNyb3NzIHRoZSBvcmdhbml6YXRpb25cbiAgY29uc3QgYWxsUm9vdHNSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIEdFVF9ST09UX0ZPTERFUlMsXG4gICAge30sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzAzX0dldEFsbFJvb3RGb2xkZXJzXCJcbiAgKTtcblxuICBjaGVjayhhbGxSb290c1Jlcywge1xuICAgIFwiQWxsIHJvb3QgZm9sZGVycyBxdWVyaWVkXCI6IChyKSA9PlxuICAgICAgQXJyYXkuaXNBcnJheShyLmRhdGE/LnJvb3RGb2xkZXJzKSAmJiByLmRhdGEucm9vdEZvbGRlcnMubGVuZ3RoID4gMCxcbiAgfSk7XG5cbiAgLy8gU3RlcCA0OiBGZXRjaCBmb2xkZXIgaGllcmFyY2h5IG9mIHByaW1hcnkgcm9vdCBhbmNob3JcbiAgY29uc3Qgcm9vdElkID0gZGF0YS5yb290Rm9sZGVySWQgfHwgZGF0YS5yb290V2F0Y2hsaXN0SWQgfHwgZGF0YS5yb290Q21zSWQ7XG4gIGNvbnN0IGZvbGRlclJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgR0VUX0ZPTERFUixcbiAgICB7IGlkOiByb290SWQgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDNfR2V0Rm9sZGVySGllcmFyY2h5XCJcbiAgKTtcblxuICBjaGVjayhmb2xkZXJSZXMsIHtcbiAgICBcIkZvbGRlciBxdWVyeSByZXR1cm5lZCB2YWxpZCBwYXlsb2FkXCI6IChyKSA9PiAhIXIuZGF0YT8uZm9sZGVyPy5pZCxcbiAgfSk7XG5cbiAgc2xlZXAoMC4xKTtcbn1cbiIsICJpbXBvcnQgeyBzbGVlcCwgY2hlY2sgfSBmcm9tIFwiazZcIjtcbmltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4uL2hlbHBlcnMvY2xpZW50XCI7XG5pbXBvcnQgeyBTZXR1cERhdGEgfSBmcm9tIFwiLi4vaGVscGVycy9hdXRoXCI7XG5pbXBvcnQge1xuICBDUkVBVEVfRk9MREVSLFxuICBNT1ZFX0ZPTERFUixcbiAgREVMRVRFX0ZPTERFUixcbn0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL211dGF0aW9uc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gcnVuTW92ZVNjZW5hcmlvKGRhdGE6IFNldHVwRGF0YSk6IHZvaWQge1xuICBjb25zdCB2dUlkID0gX19WVTtcbiAgY29uc3QgaXRlcklkID0gX19JVEVSO1xuICBjb25zdCBwcmVmaXggPSBgazYtbW92ZS0ke2RhdGEucnVuSWR9LXZ1JHt2dUlkfS1pdCR7aXRlcklkfWA7XG4gIGNvbnN0IHJvb3RJZCA9IGRhdGEucm9vdEZvbGRlcklkIHx8IGRhdGEucm9vdFdhdGNobGlzdElkIHx8IGRhdGEucm9vdENtc0lkO1xuICBjb25zdCByb290VHlwZSA9IGRhdGEucm9vdEZvbGRlclR5cGUgfHwgKGRhdGEucm9vdFdhdGNobGlzdElkID8gXCJ3YXRjaGxpc3RcIiA6IFwiY21zXCIpO1xuXG4gIC8vIDEuIENyZWF0ZSB0d28gcGFyZW50IGJ1Y2tldHMgKEFscGhhIGFuZCBCZXRhKVxuICBjb25zdCBidWNrZXRBbHBoYVJlcyA9IGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgQ1JFQVRFX0ZPTERFUixcbiAgICB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBuYW1lOiBgJHtwcmVmaXh9LUFscGhhYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiazYgbW92ZSBzY2VuYXJpbyBBbHBoYSBidWNrZXRcIixcbiAgICAgICAgcGFyZW50SWQ6IHJvb3RJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNF9DcmVhdGVCdWNrZXRBbHBoYVwiXG4gICk7XG4gIGNvbnN0IGFscGhhSWQgPSBidWNrZXRBbHBoYVJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuXG4gIGNvbnN0IGJ1Y2tldEJldGFSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1CZXRhYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiazYgbW92ZSBzY2VuYXJpbyBCZXRhIGJ1Y2tldFwiLFxuICAgICAgICBwYXJlbnRJZDogcm9vdElkLFxuICAgICAgICByb290Rm9sZGVyVHlwZTogcm9vdFR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA0X0NyZWF0ZUJ1Y2tldEJldGFcIlxuICApO1xuICBjb25zdCBiZXRhSWQgPSBidWNrZXRCZXRhUmVzLmRhdGE/LmNyZWF0ZUZvbGRlcj8uaWQ7XG5cbiAgaWYgKCFhbHBoYUlkIHx8ICFiZXRhSWQpIHJldHVybjtcblxuICAvLyAyLiBDcmVhdGUgbW9iaWxlIGZvbGRlciBpbnNpZGUgQWxwaGFcbiAgY29uc3QgbW9iaWxlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBDUkVBVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG5hbWU6IGAke3ByZWZpeH0tTW9iaWxlSXRlbWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIms2IG1vdmUgc2NlbmFyaW8gbW9iaWxlIGNoaWxkIGZvbGRlclwiLFxuICAgICAgICBwYXJlbnRJZDogYWxwaGFJZCxcbiAgICAgICAgcm9vdEZvbGRlclR5cGU6IHJvb3RUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNF9DcmVhdGVNb2JpbGVJdGVtXCJcbiAgKTtcbiAgY29uc3QgbW9iaWxlSWQgPSBtb2JpbGVSZXMuZGF0YT8uY3JlYXRlRm9sZGVyPy5pZDtcbiAgaWYgKCFtb2JpbGVJZCkgcmV0dXJuO1xuXG4gIC8vIDMuIFJlbG9jYXRlIG1vYmlsZSBmb2xkZXIgZnJvbSBBbHBoYSB0byBCZXRhXG4gIGNvbnN0IG1vdmVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIE1PVkVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIGZvbGRlcklkOiBtb2JpbGVJZCxcbiAgICAgICAgZnJvbUZvbGRlcklkOiBhbHBoYUlkLFxuICAgICAgICB0b0ZvbGRlcklkOiBiZXRhSWQsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA0X01vdmVGb2xkZXJBbHBoYVRvQmV0YVwiXG4gICk7XG5cbiAgY2hlY2sobW92ZVJlcywge1xuICAgIFwiTW9iaWxlIGZvbGRlciByZWxvY2F0ZWQgdG8gQmV0YVwiOiAocikgPT4gISFyLmRhdGE/Lm1vdmVGb2xkZXI/LmlkLFxuICB9KTtcblxuICAvLyA0LiBWYWxpZGF0aW9uIC8gQ3ljbGUgUHJldmVudGlvbiBUZXN0OiBTZWxmLVJlbG9jYXRpb24gUmVqZWN0aW9uIChmb2xkZXJJZCA9PSB0b0ZvbGRlcklkKVxuICBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIE1PVkVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIGZvbGRlcklkOiBtb2JpbGVJZCxcbiAgICAgICAgZnJvbUZvbGRlcklkOiBiZXRhSWQsXG4gICAgICAgIHRvRm9sZGVySWQ6IG1vYmlsZUlkLCAvLyBJbnZhbGlkOiBtb3ZpbmcgZm9sZGVyIGludG8gaXRzZWxmIVxuICAgICAgfSxcbiAgICB9LFxuICAgIGRhdGEudG9rZW4sXG4gICAgXCJUQ19MVF8wNF9Nb3ZlRm9sZGVySW52YWxpZFNlbGZNb3ZlXCIsXG4gICAgdHJ1ZSAvLyBleHBlY3RFcnJvciA9IHRydWVcbiAgKTtcblxuICAvLyA1LiBDbGVhbnVwOiBEZWxldGUgbW9iaWxlIGxlYWYgZmlyc3QsIHRoZW4gZW1wdHkgQWxwaGEgYW5kIEJldGFcbiAgZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBERUxFVEVfRk9MREVSLFxuICAgIHsgaW5wdXQ6IHsgaWQ6IG1vYmlsZUlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDRfRGVsZXRlTW9iaWxlSXRlbVwiXG4gICk7XG4gIGV4ZWN1dGVHcmFwaFFMKFxuICAgIGRhdGEuZW5kcG9pbnRVcmwsXG4gICAgREVMRVRFX0ZPTERFUixcbiAgICB7IGlucHV0OiB7IGlkOiBhbHBoYUlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDRfRGVsZXRlQWxwaGFcIlxuICApO1xuICBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIERFTEVURV9GT0xERVIsXG4gICAgeyBpbnB1dDogeyBpZDogYmV0YUlkLCBvcmRlckluZGV4OiAwIH0gfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDRfRGVsZXRlQmV0YVwiXG4gICk7XG5cbiAgc2xlZXAoMC4yKTtcbn1cbiIsICJpbXBvcnQgeyBzbGVlcCwgY2hlY2sgfSBmcm9tIFwiazZcIjtcbmltcG9ydCB7IGV4ZWN1dGVHcmFwaFFMIH0gZnJvbSBcIi4uL2hlbHBlcnMvY2xpZW50XCI7XG5pbXBvcnQgeyBTZXR1cERhdGEgfSBmcm9tIFwiLi4vaGVscGVycy9hdXRoXCI7XG5pbXBvcnQgeyBDUkVBVEVfRk9MREVSLCBERUxFVEVfRk9MREVSIH0gZnJvbSBcIi4uLy4uL2dyYXBocWwvZm9sZGVyL211dGF0aW9uc1wiO1xuaW1wb3J0IHsgR0VUX0ZPTERFUiB9IGZyb20gXCIuLi8uLi9ncmFwaHFsL2ZvbGRlci9xdWVyaWVzXCI7XG5cblxuXG5leHBvcnQgZnVuY3Rpb24gcnVuRGVsZXRlU2NlbmFyaW8oZGF0YTogU2V0dXBEYXRhKTogdm9pZCB7XG5cbiAgY29uc3QgdnVJZCA9IF9fVlU7XG4gIGNvbnN0IGl0ZXJJZCA9IF9fSVRFUjtcbiAgY29uc3QgcHJlZml4ID0gYGs2LWRlbGV0ZS0ke2RhdGEucnVuSWR9LXZ1JHt2dUlkfS1pdCR7aXRlcklkfWA7XG4gIGNvbnN0IHJvb3RJZCA9IGRhdGEucm9vdEZvbGRlcklkIHx8IGRhdGEucm9vdFdhdGNobGlzdElkIHx8IGRhdGEucm9vdENtc0lkO1xuICBjb25zdCByb290VHlwZSA9IGRhdGEucm9vdEZvbGRlclR5cGUgfHwgKGRhdGEucm9vdFdhdGNobGlzdElkID8gXCJ3YXRjaGxpc3RcIiA6IFwiY21zXCIpO1xuXG4gIC8vIDEuIENyZWF0ZSB0ZW1wb3JhcnkgdGFyZ2V0IGZvbGRlclxuICBjb25zdCBjcmVhdGVSZXMgPSBleGVjdXRlR3JhcGhRTChcbiAgICBkYXRhLmVuZHBvaW50VXJsLFxuICAgIENSRUFURV9GT0xERVIsXG4gICAge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbmFtZTogYCR7cHJlZml4fS1UYXJnZXRgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJrNiBkZWxldGUgc2NlbmFyaW8gdGFyZ2V0IGZvbGRlclwiLFxuICAgICAgICBwYXJlbnRJZDogcm9vdElkLFxuICAgICAgICByb290Rm9sZGVyVHlwZTogcm9vdFR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA1X0NyZWF0ZVB1cmdlVGFyZ2V0XCJcbiAgKTtcblxuICBjb25zdCB0YXJnZXRJZCA9IGNyZWF0ZVJlcy5kYXRhPy5jcmVhdGVGb2xkZXI/LmlkO1xuICBjaGVjayhjcmVhdGVSZXMsIHtcbiAgICBcIlRhcmdldCBjcmVhdGVkIGZvciBkZWxldGlvbiB0ZXN0XCI6ICgpID0+ICEhdGFyZ2V0SWQsXG4gIH0pO1xuXG4gIGlmICghdGFyZ2V0SWQpIHJldHVybjtcblxuICAvLyAyLiBJc3N1ZSBkZWxldGVGb2xkZXJcbiAgY29uc3QgZGVsZXRlUmVzID0gZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBERUxFVEVfRk9MREVSLFxuICAgIHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIGlkOiB0YXJnZXRJZCxcbiAgICAgICAgb3JkZXJJbmRleDogMCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBkYXRhLnRva2VuLFxuICAgIFwiVENfTFRfMDVfRGVsZXRlVGFyZ2V0XCJcbiAgKTtcblxuICBjaGVjayhkZWxldGVSZXMsIHtcbiAgICBcIlRhcmdldCBkZWxldGVkIHN1Y2Nlc3NmdWxseVwiOiAocikgPT5cbiAgICAgIHIuc3RhdHVzID09PSAyMDAgJiYgKCFyLmVycm9ycyB8fCByLmVycm9ycy5sZW5ndGggPT09IDApLFxuICB9KTtcblxuICAvLyAzLiBWZXJpZnkgdG9tYnN0b25lIHZpYSBHRVRfRk9MREVSIChleHBlY3RzIGVycm9yL25vdF9mb3VuZClcbiAgZXhlY3V0ZUdyYXBoUUwoXG4gICAgZGF0YS5lbmRwb2ludFVybCxcbiAgICBHRVRfRk9MREVSLFxuICAgIHsgaWQ6IHRhcmdldElkIH0sXG4gICAgZGF0YS50b2tlbixcbiAgICBcIlRDX0xUXzA1X1ZlcmlmeVRvbWJzdG9uZVwiLFxuICAgIHRydWUgLy8gZXhwZWN0RXJyb3IgPSB0cnVlXG4gICk7XG5cbiAgc2xlZXAoMC4xKTtcbn1cbiIsICJpbXBvcnQgeyBnZXRFeGVjdXRpb25PcHRpb25zIH0gZnJvbSBcIi4vY29uZmlnL3Byb2ZpbGVzXCI7XG5pbXBvcnQgeyBzZXR1cEF1dGhBbmRFbnZpcm9ubWVudCwgU2V0dXBEYXRhIH0gZnJvbSBcIi4vaGVscGVycy9hdXRoXCI7XG5pbXBvcnQgeyB0ZWFyZG93blN3ZWVwIH0gZnJvbSBcIi4vaGVscGVycy9jbGVhbnVwXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZUh0bWxSZXBvcnQsIGdlbmVyYXRlQ29uc29sZVN1bW1hcnkgfSBmcm9tIFwiLi9oZWxwZXJzL3JlcG9ydGVyXCI7XG5pbXBvcnQgeyBydW5MaWZlY3ljbGVTY2VuYXJpbyB9IGZyb20gXCIuL3NjZW5hcmlvcy9saWZlY3ljbGVcIjtcbmltcG9ydCB7IHJ1bkJ1cnN0U2NlbmFyaW8gfSBmcm9tIFwiLi9zY2VuYXJpb3MvYnVyc3RcIjtcbmltcG9ydCB7IHJ1blJlYWRTY2VuYXJpbyB9IGZyb20gXCIuL3NjZW5hcmlvcy9yZWFkXCI7XG5pbXBvcnQgeyBydW5Nb3ZlU2NlbmFyaW8gfSBmcm9tIFwiLi9zY2VuYXJpb3MvbW92ZVwiO1xuaW1wb3J0IHsgcnVuRGVsZXRlU2NlbmFyaW8gfSBmcm9tIFwiLi9zY2VuYXJpb3MvZGVsZXRlXCI7XG5cbmV4cG9ydCBjb25zdCBvcHRpb25zID0gZ2V0RXhlY3V0aW9uT3B0aW9ucygpO1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXAoKTogU2V0dXBEYXRhIHtcbiAgcmV0dXJuIHNldHVwQXV0aEFuZEVudmlyb25tZW50KCk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChkYXRhOiBTZXR1cERhdGEpOiB2b2lkIHtcbiAgY29uc3Qgc2NlbmFyaW8gPSAoX19FTlYuU0NFTkFSSU8gfHwgXCJsaWZlY3ljbGVcIikudG9Mb3dlckNhc2UoKTtcblxuICBzd2l0Y2ggKHNjZW5hcmlvKSB7XG4gICAgY2FzZSBcImJ1cnN0XCI6XG4gICAgICBydW5CdXJzdFNjZW5hcmlvKGRhdGEpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlYWRcIjpcbiAgICAgIHJ1blJlYWRTY2VuYXJpbyhkYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJtb3ZlXCI6XG4gICAgICBydW5Nb3ZlU2NlbmFyaW8oZGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiZGVsZXRlXCI6XG4gICAgICBydW5EZWxldGVTY2VuYXJpbyhkYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaWZlY3ljbGVcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcnVuTGlmZWN5Y2xlU2NlbmFyaW8oZGF0YSk7XG4gICAgICBicmVhaztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGVhcmRvd24oZGF0YTogU2V0dXBEYXRhKTogdm9pZCB7XG4gIHRlYXJkb3duU3dlZXAoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVTdW1tYXJ5KGRhdGE6IGFueSk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICByZXR1cm4ge1xuICAgIFwiazYtcmVwb3J0Lmh0bWxcIjogZ2VuZXJhdGVIdG1sUmVwb3J0KGRhdGEpLFxuICAgIHN0ZG91dDogZ2VuZXJhdGVDb25zb2xlU3VtbWFyeShkYXRhKSxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7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QSxJQUNBO0FBQUE7QUFBQSxFQUNGO0FBRUEsRUFBQUMsT0FBTSxHQUFHO0FBQ1g7OztBQzNETyxJQUFNLFVBQVUsb0JBQW9CO0FBRXBDLFNBQVMsUUFBbUI7QUFDakMsU0FBTyx3QkFBd0I7QUFDakM7QUFFZSxTQUFSLGFBQWtCLE1BQXVCO0FBQzlDLFFBQU0sWUFBWSxNQUFNLFlBQVksYUFBYSxZQUFZO0FBRTdELFVBQVEsVUFBVTtBQUFBLElBQ2hCLEtBQUs7QUFDSCx1QkFBaUIsSUFBSTtBQUNyQjtBQUFBLElBQ0YsS0FBSztBQUNILHNCQUFnQixJQUFJO0FBQ3BCO0FBQUEsSUFDRixLQUFLO0FBQ0gsc0JBQWdCLElBQUk7QUFDcEI7QUFBQSxJQUNGLEtBQUs7QUFDSCx3QkFBa0IsSUFBSTtBQUN0QjtBQUFBLElBQ0YsS0FBSztBQUFBLElBQ0w7QUFDRSwyQkFBcUIsSUFBSTtBQUN6QjtBQUFBLEVBQ0o7QUFDRjtBQUVPLFNBQVMsU0FBUyxNQUF1QjtBQUM5QyxnQkFBYyxJQUFJO0FBQ3BCO0FBRU8sU0FBUyxjQUFjLE1BQW1DO0FBQy9ELFNBQU87QUFBQSxJQUNMLGtCQUFrQixtQkFBbUIsSUFBSTtBQUFBLElBQ3pDLFFBQVEsdUJBQXVCLElBQUk7QUFBQSxFQUNyQztBQUNGOyIsCiAgIm5hbWVzIjogWyJncmFwaHFsRXJyb3JzIiwgImNoZWNrIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIiwgInNsZWVwIiwgImNoZWNrIiwgImNoZWNrIiwgInNsZWVwIl0KfQo=
