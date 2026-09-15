const _ = require('lodash');
const {
  LEGACY_SA, LEGACY_ADMIN, LEGACY_FINANCE_ADMIN,
  DESKTOP_SA, DESKTOP_ADMIN, DESKTOP_FINANCE_ADMIN,
  buildLegacyToDesktopRoleMap,
} = require('@veritone/core-server-base/legacy-role-constants');

// copy from core-admin-server
module.exports = function setupConstants(app = {}) {
  const enableDefaultDesktopApp = _.get(
    app,
    'config.featureFlags.enableDefaultDesktopApp',
    false
  );
  // DESKTOP is going to replace ADMIN
  const ADMIN_APPLICATION_ID = enableDefaultDesktopApp
    ? 'e4739d44-53d2-4153-b55f-5e246fc989b1' // DESKTOP
    : 'ea1d26ab-0d29-4e97-8ae7-d998a243374e'; // ADMIN

  const ADMIN = enableDefaultDesktopApp ? 'aiware_desktop' : 'admin';
  const SUPER_ADMIN   = enableDefaultDesktopApp ? DESKTOP_SA            : LEGACY_SA;
  const ADMIN_ROLE    = enableDefaultDesktopApp ? DESKTOP_ADMIN         : LEGACY_ADMIN;
  const FINANCE_ADMIN = enableDefaultDesktopApp ? DESKTOP_FINANCE_ADMIN : LEGACY_FINANCE_ADMIN;
  // Maps legacy admin role IDs to their Desktop equivalents. Empty when enableDefaultDesktopApp is false
  // so that legacy environments are unaffected.
  const LEGACY_TO_DESKTOP_ROLE_MAP = buildLegacyToDesktopRoleMap(app);
  return {
    APP_IDS: {
      EXPLORE_APPLICATION_ID: '90eda64f-a2e5-4010-bcb3-8fb5c195d631',
      ADVERTISER_APPLICATION_ID: '7f402a84-4ae6-451f-85ca-9447397610b7',
      BROADCASTER_APPLICATION_ID: '92269e7a-2859-406a-ad5e-1a00c30b3512',
      POLITICS_APPLICATION_ID: '10abcbcf-59bc-4054-9f56-9b3baf3f0935',

      DISCOVERY_APPLICATION_ID: '32babe30-fb42-11e4-89bc-27b69865858a',
      ENTERPRISE_APPLICATION_ID: '32babe30-fb42-11e4-89bc-27b69865858a', // "enterprise" app was renamed to "discovery". kept for compatibility.

      DEVELOPER_APPLICATION_ID: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
      DEVELOPER_SANDBOX_APPLICATION_ID: '732c697a-0eb1-4c92-9c40-5d6f5dab8baa',

      AUTOMATE_APPLICATION_ID: 'bdf9375e-1092-4233-8197-9ccbc11357c5',
      AUTOMATE_BETA_APPLICATION_ID: 'bdf9375e-1092-4233-8197-9ccbc11357c6',

      CMS_APPLICATION_ID: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
      COLLECTIONS_APPLICATION_ID: 'cc4e0e89-3420-49c2-b06d-8d9a929c941c',
      ADMIN_APPLICATION_ID,
      ANALYTICS_APPLICATION_ID: 'bc519e7f-7953-408d-8991-57f217286d6c',

      REDACT_APPLICATION_ID: '766e9916-9536-47e9-8dcb-dc225654bab3',

      LIBRARY_APPLICATION_ID: 'cf05552b-52e0-46fa-8f7f-4c9eee135c51',

      VOICE_APPLICATION_ID: '3a9a9364-535c-4388-920a-806c3664a2bb',
      BENCHMARK_APPLICATION_ID: '865f0dc3-393b-4c83-8c90-3e0f0a3a18d2',
      SPORTX_APPLICATION_ID: 'f6a7e14e-dcdb-4ce3-9ce5-50c8d5e0ac37',
      DESKTOP_APPLICATION_ID: 'e4739d44-53d2-4153-b55f-5e246fc989b1'
    },
    APPS: {
      EXPLORE: 'explore',
      ADVERTISER: 'advertiser',
      BROADCASTER: 'broadcaster',
      POLITICS: 'politics',

      DISCOVERY: 'discovery',
      ENTERPRISE: 'enterprise',

      DEVELOPER: 'developer',
      DEVELOPER_SANDBOX: 'developer_sandbox',

      AUTOMATE: 'automate',
      AUTOMATE_BETA: 'automate_beta',

      REDACT: 'redaction_2_0',

      CMS: 'cms',
      COLLECTIONS: 'collections',
      ADMIN,
      ANALYTICS: 'analytics',
      BENCHMARK: 'benchmark',
      LIBRARY: 'library',
      SPORTX: 'sportx'
    },
    EMPTY_UUID: '00000000-0000-0000-0000-000000000000',
    ROLES: {
      REDACT_EDITOR: 'd0136963-c244-452d-9539-d27447a60f47',
      SUPER_ADMIN,
      ADMIN: ADMIN_ROLE,
      FINANCE_ADMIN,
      CMS_CUSTOMER_SERVICE: '6d982ee9-ff07-499f-a182-03457a6187f6',
      COLLECTIONS_EDITOR: 'e9c2c71a-80dd-4a35-af68-cbc256bb23a6',
      DISCOVERY_EDITOR: '3577dfc6-f441-41f9-8dab-ef9079530450',
      CMS_EDITOR: 'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
      DEVELOPER_EDITOR: '912e377e-f4a4-4184-8db1-baa9670d8081',
      AUTOMATE_EDITOR: 'a5f72287-10b2-47d5-8b68-bd97b0a31f16',
      BENCHMARK_ADMIN: 'e098268f-014f-4518-a7d4-553a0544a032',
      NO_APP_ACCESS: '13634222-b879-4677-be03-d4ecad8fb2c2',
      DEFAULT_APP_ACCESS: '5e9cfff9-4652-4755-ae49-796615079375'
    },
    BUSINESS_UNITS: {
      DEVELOPER: 'Developer',
      MACHINEBOX: 'MachineBox',
      REDACT_SELF_SERVICE: 'Redact Self Service',
      ME: 'M&E'
    },
    ROLE_NAMES: {
      DEFAULT_APP_EVENT_ROLE_NAME: 'Default App Access'
    },
    DEFAULT_AUTH_GROUP_NAME: {
      ORG_ADMIN: 'orgAdmin',
      ORG_ALL_ACCESS: 'orgAllAccess'
    },
    DEFAULT_AUTH_GROUP_SUFFIX: {
      ORG_ADMIN: 'Administrators',
      ORG_ALL_ACCESS: 'Users'
    },
    ADMIN_ROLE_SET: new Set([
      ADMIN_ROLE,
      '032218c3-d47e-4287-9d16-7bb867c01266',
      'ddca9b68-d775-4934-8ffd-7aecc779b652'
    ]),
    LEGACY_TO_DESKTOP_ROLE_MAP
  };
};
