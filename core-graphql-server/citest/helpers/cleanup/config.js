const uuid = require('uuid');
const citestMarker = global.citestMarker || 'citest-should-delete';

const ROLE_IDS = {
  CMS_EDITOR: 'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  ADMIN_ROLE: '032218c3-d47e-4287-9d16-7bb867c01266',
  ADMIN_ROLE_LEGACY: 'ddca9b68-d775-4934-8ffd-7aecc779b652'
};

const TEST_CONFIG = {
  userNamePrefix: citestMarker,
  newAdminUserName: `${citestMarker}-admin-${uuid.v4()}@localhost`,
  testUserPassword: 'testUserPassword'
};

module.exports = {
  ROLE_IDS,
  TEST_CONFIG
};
