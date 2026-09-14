export function generateHtmlReport(data: any): string {
  const metrics = data.metrics || {};
  const rootGroup = data.root_group || {};

  const httpReqDuration = metrics.http_req_duration?.values || {};
  const httpReqs = metrics.http_reqs?.values || {};
  const httpFailed = metrics.http_req_failed?.values || {};
  const vus = metrics.vus?.values || {};
  const checks = metrics.checks?.values || {};
  const graphqlErrors = metrics.graphql_errors?.values || {};

  function fmtMs(num: number | undefined): string {
    if (num === undefined || isNaN(num)) return "N/A";
    return num >= 1000 ? (num / 1000).toFixed(2) + "s" : num.toFixed(1) + "ms";
  }

  function fmtPct(num: number | undefined): string {
    if (num === undefined || isNaN(num)) return "0.0%";
    return (num * 100).toFixed(2) + "%";
  }

  // Count checks recursively
  let passedChecks = 0;
  let failedChecks = 0;
  function countChecks(group: any) {
    if (group.checks) {
      for (const check of group.checks) {
        passedChecks += check.passes || 0;
        failedChecks += check.fails || 0;
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
  const checksPassRate = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;
  const isHealthy = (httpFailed.rate || 0) < 0.01 && (graphqlErrors.rate || 0) < 0.01;

  // Build checks list
  let checksHtml = "";
  function renderChecks(group: any) {
    if (group.checks && group.checks.length > 0) {
      for (const c of group.checks) {
        const pass = (c.fails || 0) === 0;
        checksHtml += `
          <tr class="${pass ? "check-pass" : "check-fail"}">
            <td style="font-weight: 500;">${c.name}</td>
            <td style="text-align: center;">${pass ? "✓ PASS" : "✗ FAIL"}</td>
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
          Executed on ${new Date().toISOString()} | Target: Veritone aiWARE Folder Lifecycle
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
          GraphQL Errors: ${fmtPct(graphqlErrors.rate)}
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

export function generateConsoleSummary(data: any): string {
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

