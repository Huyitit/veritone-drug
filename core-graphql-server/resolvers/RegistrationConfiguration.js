const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const mainUtil = require('../util.js')();

  const parseJSONField = (field) => {
    try {
      return JSON.parse(field);
    } catch {
      return null;
    }
  };

  return {
    files: async (obj) => {
      const files = await serviceContext.dal.organizationRegistration.getRegistrationFiles(
        {
          registrationConfigurationId: obj.id
        }
      );

      return files.map((file) => ({
        ...file,
        fileId: file.id,
        type: _.camelCase(file.type),
        url: util.getSignedUrlOrVirtual(file.url)
      }));
    },
    uiSettings: async (obj) => {
      const uiSettings = await serviceContext.dal.organizationRegistration.getRegistrationUiSettings(
        {
          registrationConfigurationId: obj.id
        }
      );

      if (uiSettings) {
        uiSettings.customRegistrationFields = parseJSONField(
          uiSettings.customRegistrationFields
        );
        uiSettings.registrationButtonStyle = parseJSONField(
          uiSettings.registrationButtonStyle
        );
      }

      return uiSettings;
    },
    domainSettings: async (obj) => {
      return serviceContext.dal.organizationRegistration.getDomainSettings({
        registrationConfigurationId: obj.id
      });
    },
    dateCreated: (obj) => mainUtil.fixDateTime(obj.dateCreated),
    dateModified: (obj) => mainUtil.fixDateTime(obj.dateModified)
  };
};
