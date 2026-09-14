export interface GraphQLErrorLocation {
  line: number;
  column: number;
}

export interface GraphQLError {
  message: string;
  locations?: GraphQLErrorLocation[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  status?: number;
}

export interface GraphQLClient {
  query<T>(
    query: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>>;

  mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>>;
}

export function createGraphQLClient(
  endpointUrl: string = process.env.GRAPHQL_API_URL || "https://api.stage.us-1.veritone.com/v3/graphql",
  defaultHeaders: Record<string, string> = {}
): GraphQLClient {
  async function execute<T>(
    operation: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>> {
    const combinedHeaders: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      ...defaultHeaders,
      ...headers,
    };

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: combinedHeaders,
      body: JSON.stringify({
        query: operation,
        variables,
      }),
    });

    let body: any = {};
    try {
      body = await response.json();
    } catch {
      body = {
        errors: [{ message: `HTTP ${response.status}: ${response.statusText}` }],
      };
    }

    return {
      ...body,
      status: response.status,
    };
  }

  return {
    async query<T>(
      query: string,
      variables?: Record<string, unknown>,
      headers?: Record<string, string>
    ) {
      return execute<T>(query, variables, headers);
    },

    async mutate<T>(
      mutation: string,
      variables?: Record<string, unknown>,
      headers?: Record<string, string>
    ) {
      return execute<T>(mutation, variables, headers);
    },
  };
}
