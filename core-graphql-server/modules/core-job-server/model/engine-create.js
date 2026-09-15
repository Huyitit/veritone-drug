'use strict';

module.exports = function init() {
  var engineCreateModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      engineName: { type: 'string', required: true },
      engineCategoryId: { type: 'string', required: true },
      engineDescription: { type: 'string', required: true },
      engineCurrency: { type: 'string' },
      deploymentModel: { type: 'number', required: true },
      isPublic: { type: 'boolean', required: true },
      libraryRequired: { type: 'boolean' },
      logoPath: { type: 'string' },
      iconPath: { type: 'string' },
      executeUri: { type: 'string' },
      fields: { type: 'json' },
      useCases: { type: 'json' },
      industries: { type: 'json' },
      engineManifest: { type: 'json' },
      metadataVersion: { type: 'number' },
      distributionType: { type: 'string' },
      priceDimension: { type: 'string' }
    }
  );

  return engineCreateModel;
};
