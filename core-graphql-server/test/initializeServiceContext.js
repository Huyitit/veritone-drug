const path = require('path');
const MOCK_DATA_TYPE = {
  DEFAULT: 'default',
  V3_DATA_MODEL: 'v3DataModel'
};
const MOCK_DATA_PATHS = {
  [MOCK_DATA_TYPE.DEFAULT]: './serviceContext.mock.js',
  [MOCK_DATA_TYPE.V3_DATA_MODEL]:
    '../modules/v3DataModel/test/serviceContext.mock.js'
};
function initializeServiceContext(
  typeOrPath = MOCK_DATA_TYPE.DEFAULT,
  customParams = {}
) {
  const mockPath = MOCK_DATA_PATHS[typeOrPath] || typeOrPath;
  const serviceContext = require(mockPath)(customParams);

  const suiteKey = path.relative(process.cwd(), expect.getState().testPath);

  if (global.serviceContextMap) {
    global.serviceContextMap[suiteKey] = serviceContext;
  }

  return serviceContext;
}

module.exports = {
  initializeServiceContext,
  MOCK_DATA_TYPE
};
