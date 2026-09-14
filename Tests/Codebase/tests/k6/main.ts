import { getExecutionOptions } from "./config/profiles";
import { setupAuthAndEnvironment, SetupData } from "./helpers/auth";
import { teardownSweep } from "./helpers/cleanup";
import { generateHtmlReport, generateConsoleSummary } from "./helpers/reporter";
import { runLifecycleScenario } from "./scenarios/lifecycle";
import { runBurstScenario } from "./scenarios/burst";
import { runReadScenario } from "./scenarios/read";
import { runMoveScenario } from "./scenarios/move";
import { runDeleteScenario } from "./scenarios/delete";

export const options = getExecutionOptions();

export function setup(): SetupData {
  return setupAuthAndEnvironment();
}

export default function (data: SetupData): void {
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

export function teardown(data: SetupData): void {
  teardownSweep(data);
}

export function handleSummary(data: any): Record<string, string> {
  return {
    "k6-report.html": generateHtmlReport(data),
    stdout: generateConsoleSummary(data),
  };
}
