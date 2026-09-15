'use strict';

module.exports = function init() {
  const nodeMetricsModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      cpuCount: { type: 'number', required: true },
      mbRam: { type: 'number', required: true },
      mbDisk: { type: 'number', required: true },
      ipExternal: { type: 'string' },
      ipInternal: { type: 'string' },
      ami: { type: 'string' },
      ec2InstanceType: { type: 'string' },
      ec2Region: { type: 'string' },
      awsAccount: { type: 'string' },
      loadAverage: { type: 'json' }
    }
  );

  return nodeMetricsModel;
};
