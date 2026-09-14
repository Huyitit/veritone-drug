import { createGraphQLClient, GraphQLClient } from "./graphql-client";
import { USER_LOGIN } from "../graphql/folder/mutations";

export interface AuthSession {
  token: string;
  userId: string;
  organizationId: string;
  organizationName?: string;
}

interface LoginResponse {
  userLogin: {
    token: string;
    user: {
      id: string;
      organizationId: string;
      organization: {
        id: string;
        name: string;
      };
    };
    organization: {
      id: string;
      name: string;
    };
  };
}

let cachedSession: AuthSession | null = null;

export async function login(
  userName: string = process.env.AUTH_USER_NAME || "",
  password: string = process.env.AUTH_PASSWORD || ""
): Promise<AuthSession> {
  if (cachedSession) {
    return cachedSession;
  }

  const client = createGraphQLClient();
  const response = await client.mutate<LoginResponse>(USER_LOGIN, {
    input: {
      userName,
      password,
    },
  });

  if (response.errors && response.errors.length > 0) {
    throw new Error(
      `Authentication failed: ${response.errors.map((e) => e.message).join(", ")}`
    );
  }

  if (!response.data?.userLogin?.token) {
    throw new Error("Authentication failed: No token returned in userLogin response");
  }

  const loginData = response.data.userLogin;
  cachedSession = {
    token: loginData.token,
    userId: loginData.user.id,
    organizationId: loginData.user.organizationId || loginData.organization.id,
    organizationName: loginData.organization?.name || loginData.user.organization?.name,
  };

  return cachedSession;
}

export async function getAuthSession(): Promise<AuthSession> {
  if (!cachedSession) {
    return login();
  }
  return cachedSession;
}

export async function getAuthenticatedClient(): Promise<{
  client: GraphQLClient;
  session: AuthSession;
}> {
  const session = await getAuthSession();
  const client = createGraphQLClient(process.env.GRAPHQL_API_URL, {
    Authorization: `Bearer ${session.token}`,
  });
  return { client, session };
}
