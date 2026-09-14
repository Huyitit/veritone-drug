import { Options } from "k6/options";

export type ProfileType = "smoke" | "load" | "stress";

export function getExecutionOptions(): Options {
  const profile = (__ENV.PROFILE || "load").toLowerCase();
  const vusOverride = __ENV.VUS ? parseInt(__ENV.VUS, 10) : undefined;
  const durationOverride = __ENV.DURATION || undefined;

  const baseThresholds = {
    http_req_failed: ["rate<0.01"], // Less than 1% HTTP failures
    checks: ["rate>0.99"],          // More than 99% check pass rate
    graphql_errors: ["rate<0.01"],  // Less than 1% business logic errors
  };

  if (profile === "smoke") {
    return {
      vus: vusOverride || 1,
      duration: durationOverride || "15s",
      thresholds: {
        ...baseThresholds,
        http_req_duration: ["p(95)<1500", "p(99)<3000"],
      },
    };
  }

  if (profile === "stress") {
    return {
      stages: [
        { duration: "30s", target: vusOverride ? Math.floor(vusOverride / 2) : 25 },
        { duration: "1m", target: vusOverride || 50 },
        { duration: durationOverride || "1m", target: vusOverride || 50 },
        { duration: "30s", target: 0 },
      ],
      thresholds: {
        ...baseThresholds,
        http_req_duration: ["p(95)<2500", "p(99)<5000"],
      },
    };
  }

  // Default: "load" profile
  return {
    stages: [
      { duration: "14s", target: vusOverride || 50 },
      { duration: durationOverride || "1m", target: vusOverride || 50 },
      { duration: "10s", target: 0 },
    ],
    thresholds: {
      ...baseThresholds,
      http_req_duration: ["p(95)<1500", "p(99)<3000"],
    },
  };
}
