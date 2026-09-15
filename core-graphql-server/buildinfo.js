const yaml = require('js-yaml');
const fs = require('fs');

const mainUtil = require('./util.js')();

let buildInfo;

function getBuildInfo() {
  if (!buildInfo) {
    try {
      // first load the core-graphql-specific file
      try {
        buildInfo = require('./buildinfo.json');
      } catch (err) {
        // new jenkins build does not yet generate this file
        buildInfo = {};
      }

      if (buildInfo.jenkins_build) {
        const details = mainUtil.parseBuild(buildInfo.jenkins_build);
        buildInfo.buildNumber = details.number;
        buildInfo.environment = details.env;
      }

      if (!buildInfo.commitHash) {
        buildInfo.commitHash = 'unknown';
      }

      if (!buildInfo.environment) {
        buildInfo.environment = 'unknown';
      }

      if (!buildInfo.buildNumber) {
        buildInfo.buildNumber = 'unknown';
      }
    } catch (err) {
      // this should happen only on local developer systems.
      buildInfo = {
        buildDate: 'unknown',
        buildNumber: 'unknown',
        commitHash: 'unknown',
        commitDate: 'unknown',
        branch: 'unknown'
      };
    }
  }
  // map all the keys to a standard format
  return buildInfo;
  // {
  //   commitHash: buildInfo.git_commit,
  //   branch: buildInfo.git_branch,
  //   buildNumber: buildInfo.buildNumber,
  //   buildDate: buildInfo.buildDate,
  //   environment: buildInfo.environment,
  //   commitDate: buildInfo.commitDate
  // };
}

module.exports = {
  getBuildInfo: getBuildInfo
};
