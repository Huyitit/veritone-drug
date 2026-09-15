const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: [
    'RetentionRun'    
  ]
};


const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-retention',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    });

    /** This test depends on the core-eventing having scheduler.retentionCleanup enabled and configured 
     * E.g.:
     * "scheduler": {
        ...
		    "retentionCleanup": {
			    "enabled": true,
			    "parallelTasks": 1,
			    "maxElasticRPS": 1,
			    "pollInterval": 100			
		    }
	    }
     * */ 
    it('should index audit log when running post retention cleanup', async () => {
      // 1. create test org
      const query = `
      mutation createOrg {
        createOrganization(input: {
          name: "Retention Test Org"
          metadata: {}
          businessUnit: "test"
          dataRetentionPolicies: {
            days: 1
          }
        }) {
          id
          name
        }
      }
      `;      
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN
      );
      const result = await helpersAuditLog._gqlClient.query(
        query,
        null,
        headers
      );     
      const orgId = _.get(result, 'createOrganization.id', null);   
      const orgName = _.get(result, 'createOrganization.name', null);         
      // 2. update media_platform.retention_tdo__organization with the org's id and last_run
      await helpersAuditLog.dbUpdateOrgRetention(orgId);
      // 3. publish event
      await helpersAuditLog.publishEvent('System', 'post_retention_cleanup');
      // 4. validate audit log entry      
      const expectedAuditLogItems = [
        {          
          eventName: 'RetentionRun',
          actionResult: 'success',          
          actionDetails: `Ran retention script for organization ${orgName} (${orgId})`
        }
      ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilterNoCorrelationId({
      eventName: 'RetentionRun',
      actionDetails: `Ran retention script for organization ${orgName} (${orgId})`
    }, expectedAuditLogItems);
    
    expect(auditLogItems.length).toEqual(1);
    });

  }
);
