import http, { Response } from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

export const graphqlErrors = new Rate("graphql_errors");
export const graphqlDuration = new Trend("graphql_duration");

export interface K6GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; [key: string]: any }>;
  status: number;
  raw: Response;
}

export function executeGraphQL<T = any>(
  endpointUrl: string,
  operation: string,
  variables: Record<string, unknown> = {},
  token?: string,
  operationName: string = "GraphQL_Op",
  expectError: boolean = false
): K6GraphQLResponse<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }

  const payload = JSON.stringify({
    query: operation,
    variables,
  });

  const res = http.post(endpointUrl, payload, {
    headers,
    tags: { operation: operationName },
  });

  graphqlDuration.add(res.timings.duration, { operation: operationName });

  let parsedBody: any = {};
  let isJsonValid = false;

  try {
    parsedBody = JSON.parse(res.body ? res.body.toString() : "{}");
    isJsonValid = true;
  } catch {
    parsedBody = {
      errors: [{ message: `HTTP ${res.status}: Failed to parse JSON response` }],
    };
  }

  const hasBusinessErrors = Array.isArray(parsedBody.errors) && parsedBody.errors.length > 0;

  if (!expectError && (res.status !== 200 || hasBusinessErrors)) {
    console.error(`[k6 client error] ${operationName} (HTTP ${res.status}): ${JSON.stringify(parsedBody.errors || parsedBody)}`);
  }

  if (expectError) {
    const passed = (res.status === 200 || res.status === 400) && hasBusinessErrors;
    check(res, {
      [`${operationName} responded with expected error`]: () => passed,
    });
    graphqlErrors.add(false);
  } else {
    // Normal operation expecting 200 OK and NO business errors
    const pass = check(res, {
      [`${operationName} status is 200`]: (r) => r.status === 200,
      [`${operationName} response has valid JSON`]: () => isJsonValid,
      [`${operationName} has no business errors`]: () => !hasBusinessErrors,
    });

    graphqlErrors.add(!pass || hasBusinessErrors);
  }

  return {
    data: parsedBody.data,
    errors: parsedBody.errors,
    status: res.status,
    raw: res,
  };
}
