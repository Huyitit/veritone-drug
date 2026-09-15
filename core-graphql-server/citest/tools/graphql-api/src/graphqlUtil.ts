import { GraphQLClient } from 'graphql-request';
import { getSdk, RootFolderType } from './gql/gql'; // This is the generated SDK
import { loadConfig } from './config';
import supertest from 'supertest';

const client = new GraphQLClient(
  'https://api.stage.us-1.veritone.com/v3/graphql'
);
const sdk = getSdk(client);

export interface GraphqlClient {
  query: any;
  environment: string;
  authUrl: string;
  url: string;
  internalUrl?: string;
  structuredDataUrl: string;
  sdk: typeof sdk;
  sessionToken?: string;
  apiToken?: string;
  uploadFile: (
    query: string,
    fileName: string,
    filePath: string,
    options?: any,
    variables?: Record<string, unknown>
  ) => Promise<any>;
}

export enum AuthType {
  SESSION_TOKEN = 'SESSION_TOKEN',
  USER_API_TOKEN = 'USER_API_TOKEN',
  API_KEY = 'API_KEY',
  ORGLESS_API_KEY = 'ORGLESS_API_KEY'
}

const cachedAuthTokens = new Map<AuthType, string>();
const cachedSDKClients = new Map<AuthType, typeof sdk>();
const cachedQueryFns = new Map<AuthType, GraphqlClient['query']>();
type CachedClient = {
  sdk: typeof sdk;
  query: (query: string, variables?: any, headers?: any) => any;
  sessionToken?: string;
  apiToken?: string;
};
const cachedClients = new Map<AuthType | undefined, CachedClient>();

function addUploadFileMethod(gqlClient: any) {
  gqlClient.uploadFile = async function (
    query: string,
    fileName: string,
    filePath: string,
    options?: any,
    variables?: Record<string, unknown>
  ) {
    if (!options) {
      options = {};
      if (this.sessionToken) {
        options['Authorization'] = `Bearer ${this.sessionToken}`;
      } else if (this.apiToken) {
        options['Authorization'] = `Bearer ${this.apiToken}`;
      }
    }

    let req = supertest(this.url)
      .post('')
      .set(options)
      .field('query', query)
      .field('filename', fileName);

    // Optional: lets a multipart upload use a parameterised document from
    // `src/queries/extracted/` instead of an interpolated inline string. Only
    // sent when the caller supplies variables, so existing callers are
    // unaffected.
    if (variables) {
      req = req.field('variables', JSON.stringify(variables));
    }

    const res = await req.attach('file', filePath);
    return res;
  };
}

export async function createGraphqlClient(
  authType?: AuthType,
  environment?: string
): Promise<GraphqlClient> {
  const config = loadConfig();
  const gqlClient: any = {
    environment: environment || config.env,
    authUrl:
      config.core_admin_url || `https://api.${environment}.veritone.com/v1`,
    url:
      config.graphql_url ||
      `https://api.${environment}.veritone.com/v3/graphql`,
    structuredDataUrl:
      config.structured_data_url ||
      'https://api.' + environment + '.veritone.com/v3/structured-data'
  };

  gqlClient.internalUrl = gqlClient.url.replace('graphql', 'vgraphql');

  if (cachedSDKClients.has(authType)) {
    gqlClient.sdk = cachedSDKClients.get(authType);
    // Restore the token and raw-query function captured when this AuthType's
    // SDK was first built. Without this, every cache-hit client comes back
    // with sessionToken/apiToken/query undefined, so callers that need the
    // raw token (e.g. to build request headers or bootstrap an isolated
    // superadmin) or the untyped `query` escape hatch silently break on the
    // second and later createGraphqlClient calls for the same AuthType.
    const cachedToken = cachedAuthTokens.get(authType);
    if (authType === AuthType.SESSION_TOKEN) {
      gqlClient.sessionToken = cachedToken;
    } else {
      gqlClient.apiToken = cachedToken;
    }
    gqlClient.query = cachedQueryFns.get(authType);
  }
  if (cachedClients.has(authType)) {
    const cached = cachedClients.get(authType)!;
    gqlClient.sdk = cached.sdk;
    gqlClient.query = cached.query;
    gqlClient.sessionToken = cached.sessionToken;
    gqlClient.apiToken = cached.apiToken;
  } else {
    const client = new GraphQLClient(gqlClient.url);
    gqlClient.sdk = getSdk(client);

    gqlClient.query = (query: string, variables?: any, headers?: any) => {
      return client.request(query, variables, headers);
    };

    cachedSDKClients.set(authType, gqlClient.sdk);
    cachedQueryFns.set(authType, gqlClient.query);

    // set client headers based on auth type
    if (authType === AuthType.API_KEY && config.apiAIDataOrgToken) {
      client.setHeader('Authorization', `Bearer ${config.apiAIDataOrgToken}`);
      gqlClient.apiToken = config.apiAIDataOrgToken;
      cachedAuthTokens.set(authType, gqlClient.apiToken);
    } else if (
      authType === AuthType.ORGLESS_API_KEY &&
      config.apiInternalOrgLessToken
    ) {
      client.setHeader(
        'Authorization',
        `Bearer ${config.apiInternalOrgLessToken}`
      );
      gqlClient.apiToken = config.apiInternalOrgLessToken;
      cachedAuthTokens.set(authType, gqlClient.apiToken);
    } else {
      // session tokens
      const userLoginResponse = await gqlClient.sdk.userLogin({
        input: { userName: config.userName, password: config.password }
      });
      if (authType === AuthType.SESSION_TOKEN) {
        client.setHeader(
          'Authorization',
          `Bearer ${userLoginResponse.data.userLogin?.token}`
        );
        gqlClient.sessionToken = userLoginResponse.data.userLogin?.token;
        cachedAuthTokens.set(authType, gqlClient.sessionToken);
      } else if (authType === AuthType.USER_API_TOKEN) {
        client.setHeader(
          'Authorization',
          `Bearer ${userLoginResponse.data.userLogin?.apiToken}`
        );
        gqlClient.apiToken = userLoginResponse.data.userLogin?.apiToken;
        cachedAuthTokens.set(authType, gqlClient.apiToken);
      }
    }

    cachedClients.set(authType, {
      sdk: gqlClient.sdk,
      query: gqlClient.query,
      sessionToken: gqlClient.sessionToken,
      apiToken: gqlClient.apiToken
    });
  }

  // Add uploadFile method
  addUploadFileMethod(gqlClient);

  return gqlClient;
}

export async function createClientWithUser(
  userName: string,
  password: string,
  environment?: string
): Promise<GraphqlClient> {
  const config = loadConfig();
  const env = environment || config.env;
  const url =
    config.graphql_url || `https://api.${env}.veritone.com/v3/graphql`;

  const client = new GraphQLClient(url);
  const sdk = getSdk(client);

  const query = (q: string, v?: any, h?: any) => client.request(q, v, h);

  const userLoginResponse = await sdk.userLogin({
    input: {
      userName: userName,
      password: password
    }
  });

  const token = userLoginResponse.data.userLogin?.token;
  if (token) {
    client.setHeader('Authorization', `Bearer ${token}`);
  }

  const gqlClient: GraphqlClient = {
    environment: env,
    authUrl: config.core_admin_url || `https://api.${env}.veritone.com/v1`,
    url: url,
    internalUrl: url.replace('graphql', 'vgraphql'),
    structuredDataUrl:
      config.structured_data_url ||
      `https://api.${env}.veritone.com/v3/structured-data`,
    sdk: sdk,
    query: query,
    sessionToken: token,
    uploadFile: function (
      query: string,
      fileName: string,
      filePath: string,
      options?: any
    ): Promise<any> {
      throw new Error('Function not implemented.');
    }
  };

  addUploadFileMethod(gqlClient);

  return gqlClient;
}

export async function buildRequestHeaders(
  client: GraphqlClient,
  credentials: {
    userName: string;
    password: string;
    organizationGuid?: string;
  }
): Promise<Record<string, string>> {
  const { userName, password, organizationGuid } = credentials;

  const loginResult = await client.sdk.userLogin({
    input: {
      userName,
      password,
      ...(organizationGuid && { organizationGuid })
    }
  });

  const token = loginResult?.data?.userLogin?.token;

  if (!token) {
    const errorMsg =
      loginResult?.errors?.[0]?.message ||
      loginResult?.data?.errors?.[0]?.message ||
      'Unknown login error';

    throw new Error(`Login failed for user ${userName}: ${errorMsg}`);
  }

  return {
    Authorization: `Bearer ${token}`
  };
}
