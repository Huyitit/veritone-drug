const {
  StubInitGenerator,
  StubOutputFormat
} = require('@veritone/ts-config-lib');
const ServiceConfig = require('../config');
const ServiceFeatureFlags = require('../featureFlags');

const config = new ServiceConfig();
const featureFlags = new ServiceFeatureFlags();

let format = StubOutputFormat.sql;
if (process.argv.indexOf('yaml') >= 0) {
  format = StubOutputFormat.yaml;
}

const configOutput = StubInitGenerator.processConfig(
  config.getServiceConfigSchema(),
  format
);
process.stdout.write(configOutput);

const flagsOutput = StubInitGenerator.processConfig(
  featureFlags.getServiceConfigSchema(),
  format
);

process.stdout.write(flagsOutput);
