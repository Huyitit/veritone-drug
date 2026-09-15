const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);

  const parseJSONField = (field) => {
    try {
      return JSON.parse(field);
    } catch {
      return null;
    }
  };

  return {
    files: async (obj) => {
      // Public (@noAuth) view: the registration page and the first-login terms check both want only
      // the current document. RegistrationConfiguration is the admin-facing counterpart and does not
      // filter, so superseded files stay visible there.
      const files = await serviceContext.dal.organizationRegistration.getRegistrationFiles(
        {
          registrationConfigurationId: obj.id,
          status: 'active'
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
      if (!obj || !obj.id) {
        return [];
      }
      return serviceContext.dal.organizationRegistration.getDomainSettings({
        registrationConfigurationId: obj.id
      });
    }
  };
};
