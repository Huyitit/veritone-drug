import minimist from 'minimist';
import * as _ from 'lodash';


const argv = minimist(process.argv.slice(2));

export interface TestConfig {
  env: string;
  graphql_url: string;
  structured_data_url?: string;
  media_streamer_url?: string;
  userAgent?: string;
  apiToken?: string;
  apiInternalOrgLessToken?: string;
  apiAIDataOrgToken?: string;
  password?: string;
  userName?: string;
  hubUserPassword?: string;
  hubUserName?: string;
  debug?: boolean;
  [key: string]: any;
}

function loadConfig(): TestConfig {
  const conf = argv.conf || 'testconfig.json';
  const confPath = '../../../../' + conf;

  let config: TestConfig = process.env.CITEST_CONFIG
    ? require(process.env.CITEST_CONFIG)
    : require(confPath);

  // Handle TESTS_ENV environment variable
  if (process.env.TESTS_ENV) {
    config.env = process.env.TESTS_ENV;
    console.log('got TESTS_ENV from env');
    if (config.graphql_url.indexOf('localhost') < 0) {
      config.graphql_url = `https://api.${config.env}.veritone.com/v3/graphql`;
      config.structured_data_url = `https://api.${config.env}.veritone.com/v3/graphql/structured-data`;
      config.media_streamer_url = `https://api.${config.env}.veritone.com/media-streamer`;
    }
  }

  // Handle TESTS_SERVER_URI environment variable
  if (process.env.TESTS_SERVER_URI) {
    config.graphql_url = process.env.TESTS_SERVER_URI;
    if (config.debug) console.log('got TESTS_SERVER_URI from env');
  }

  // Handle TESTS_TOKEN environment variable
  if (process.env.TESTS_TOKEN) {
    config.apiToken = process.env.TESTS_TOKEN;
    if (config.debug) console.log('got TESTS_TOKEN from env');
  }

  // Handle TESTS_INTERNAL_ORGLESS_TOKEN environment variable
  if (process.env.TESTS_INTERNAL_ORGLESS_TOKEN) {
    config.apiInternalOrgLessToken = process.env.TESTS_INTERNAL_ORGLESS_TOKEN;
    if (config.debug) console.log('got TESTS_INTERNAL_ORGLESS_TOKEN from env');
  }

  // Handle TESTS_AI_DATA_ORG_TOKEN environment variable
  if (process.env.TESTS_AI_DATA_ORG_TOKEN) {
    config.apiAIDataOrgToken = process.env.TESTS_AI_DATA_ORG_TOKEN;
    if (config.debug) console.log('got TESTS_AI_DATA_ORG_TOKEN from env');
  }

  // Handle TESTS_PASSWORD environment variable
  if (process.env.TESTS_PASSWORD) {
    config.password = process.env.TESTS_PASSWORD;
    if (config.debug) console.log('got TESTS_PASSWORD from env');
  }

  // Handle TESTS_USER environment variable
  if (process.env.TESTS_USER) {
    config.userName = process.env.TESTS_USER;
    if (config.debug) console.log('got TESTS_USER from env');
  }

  // Add @veritone.com only if userName is not a valid email
  // This is a fix for citest user
  if (!_.isNil(config.userName) && _.isNil(config.userName.split('@')[1])) {
    config.userName = config.userName + '@veritone.com';
  }

  // Handle TESTS_HUB_USER_PASSWORD environment variable
  if (process.env.TESTS_HUB_USER_PASSWORD) {
    config.hubUserPassword = process.env.TESTS_HUB_PASSWORD;
    if (config.debug) console.log('got TESTS_HUB_USER_PASSWORD from env');
  }

  // Handle TESTS_HUB_USER environment variable
  if (process.env.TESTS_HUB_USER) {
    config.hubUserName = process.env.TESTS_HUB_USER;
    if (config.debug) console.log('got TESTS_HUB_USER from env');
  }

  return config;
}

export const config: TestConfig = loadConfig();
export { loadConfig };
export default config;
