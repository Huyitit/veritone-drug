const _ = require('lodash');
const {
  config,
  postRetry,
  signin,
  requestOptions,
  supertest,
  responseStatusParserThrowErrorOnNon200Status,
  responseParserThrowErrorOnBodyError
} = require('./index');
class GraphqlClient {
  constructor(environment) {
    this.env = environment || config.env;
    // Prefer explicit core_admin_url; fall back to ingress_url+/api so that
    // CI (Docker Compose) uses local admin even when core_admin_url is absent.
    // Without this, auth falls back to https://api.<env>.veritone.com/v1 (dev),
    // issuing a dev session token that local graphql's /bearer check rejects.
    this.authUrl =
      config.core_admin_url ||
      (config.ingress_url && `${config.ingress_url}/api`) ||
      `https://api.${environment}.veritone.com/v1`;
    this.url =
      config.graphql_url ||
      (config.ingress_url && `${config.ingress_url}/v3/graphql`) ||
      `https://api.${environment}.veritone.com/v3/graphql`;
    this.internalUrl = this.url.replace('graphql', 'vgraphql');
    this.testAuth = requestOptions(config.apiToken);
    this.structuredDataUrl =
      config.structured_data_url ||
      'https://api.' + environment + '.veritone.com/v3/structured-data';

    // TODO: Update to use hard-coded Hub tokens once they have been generated for all test environments
    if (config.apiInternalOrgLessToken) {
      this.testAuthInternalOrgLessToken = requestOptions(
        config.apiInternalOrgLessToken
      );
    }
    if (config.apiAIDataOrgToken) {
      this.testAuthAPIAIDataOrgToken = requestOptions(config.apiAIDataOrgToken);
    }

    if (config.apiInternalEngineDeploymentToken) {
      this.testAuthInternalEngineDeploymentToken = requestOptions(config.apiInternalEngineDeploymentToken);
    }
  }
  async connect() {
    const result = await signin(this.authUrl);
    this.userAuth = requestOptions(result.token);
    this.tokenAuth = requestOptions(result.apiToken);
    this.userToken = result.token;
    return result;
  }

  // TODO: When Hub the proper hub tokens have been generated, update this logic to check for supported environments and
  //       root org ids instead
  isEnableResourceTest() {
    return config.apiInternalOrgLessToken && config.apiAIDataOrgToken;
  }

  isEnabledInternalEngineDeploymentTest() {
    return config.apiInternalEngineDeploymentToken;
  }

  getUrl() {
    return this.url;
  }

  getAuthUrl() {
    return this.authUrl;
  }

  async query(
    query,
    variables,
    useTokenAuth = false,
    rbp = responseParserThrowErrorOnBodyError,
    rsp = responseStatusParserThrowErrorOnNon200Status
  ) {
    let options = this.userAuth;
    if (_.isBoolean(useTokenAuth) && useTokenAuth) {
      options = this.tokenAuth;
    } else if (useTokenAuth === 'testToken') {
      options = this.testAuth;
    } else if (_.get(useTokenAuth, 'headers')) {
      options = useTokenAuth;
    }
    return this._execQuery(this.url, query, variables, options, rbp, rsp);
  }

  async queryByInternalOrglessToken(query, variables) {
    let options = this.testAuthInternalOrgLessToken;
    return this._execQuery(this.url, query, variables, options);
  }
  async queryByAIDataOrgToken(query, variables) {
    let options = this.testAuthAPIAIDataOrgToken;
    return this._execQuery(this.url, query, variables, options);
  }

  async queryByInternalEngineDeploymentToken(query, variables) {
    let options = this.testAuthInternalEngineDeploymentToken;
    return this._execQuery(this.url, query, variables, options);
  }

  async queryInternal(query, variables) {
    return this._execQuery(this.internalUrl, query, variables, this.testAuth);
  }

  async _execQuery(
    url,
    query,
    variables,
    options,
    rbp = responseParserThrowErrorOnBodyError,
    rsp = responseStatusParserThrowErrorOnNon200Status
  ) {
    const respObj = await postRetry(
      url,
      {
        query,
        variables
      },
      options,
      3 // retry count
    );

    rsp(respObj);
    return rbp(respObj);
  }

  async uploadFile(query, fileName, filePath, options) {
    if (!options) {
      options = this.userAuth.headers;
    }

    const res = await supertest(this.url)
      .post('')
      .set(options)
      .field('query', query)
      .field('filename', fileName)
      .attach('file', filePath)
      .expect(200);
    return _.get(res, 'body.data');
  }

  async uploadFileGetRawResponse(query, fileName, filePath, options) {
    if (!options) {
      options = this.userAuth.headers;
    }

    const res = await supertest(this.url)
      .post('')
      .set(options)
      .field('query', query)
      .field('filename', fileName)
      .attach('file', filePath)
      .expect(200);
    return res;
  }

  async uploadFileByAIDataOrgToken(query, fileName, filePath) {
    return this.uploadFile(
      query,
      fileName,
      filePath,
      this.testAuthAPIAIDataOrgToken.headers
    );
  }

  async switchOrg(userName, orgGuid) {
    const result = await this._execQuery(
      this.url,
      `
    mutation($token: String! $userName: String! $orgGuid: ID!) {
      switchUserToOrganization(token: $token userName: $userName organizationGuid: $orgGuid) {
        apiToken
        token
      }
    }
    `,
      {
        token: this.userToken,
        userName,
        orgGuid
      },
      this.userAuth
    );
    this.userAuth = requestOptions(result.switchUserToOrganization.token);
    this.tokenAuth = requestOptions(result.switchUserToOrganization.apiToken);
    this.userToken = result.switchUserToOrganization.token;
    return result;
  }
}

module.exports = GraphqlClient;
