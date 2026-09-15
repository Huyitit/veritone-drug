const _ = require('lodash');
const uuid = require('uuid');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dal = require('./dalOrganizationRegistration.js')(serviceContext), // Replace with your actual file name
  mpDbWrite = serviceContext.dbConnections['sso'].write,
  mpDbRead = serviceContext.dbConnections['sso'].read;

const FALLBACK_USER_ID = '00000000-0000-0000-0000-000000000000';

describe('organizationRegistration', () => {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(15);
      expect(dal.createRegistrationConfiguration).toEqual(expect.any(Function));
    });
  });

  describe('#createRegistrationConfiguration', function () {
    it('should create a registration configuration successfully', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };
      const input = {
        name: 'Test Config',
        slug: 'test-config',
        openRegistrationStatus: 'open',
        adminApprovalRequired: true,
        organizationGuid: '00000000-0000-0000-0000-000000000001',
        files: [
          {
            name: 'file1',
            url: 'http://example.com/file1',
            type: 'terms_of_service'
          },
          {
            name: 'file2',
            url: 'http://example.com/file2',
            type: 'terms_of_service'
          }
        ],
        domainSettings: [
          {
            domainName: 'example.com',
            authGroupId: 'group1',
            applicationRoleIds: ['role1', 'role2']
          }
        ],
        uiSettings: {
          logo: 'http://example.com/logo.png',
          customRegistrationFields: {
            fields: [{ key: 'Company Name', type: 'text' }]
          },
          registrationButtonStyle: {
            backgroundColor: '#0000FF'
          },
          veritoneBranding: true
        }
      };

      // Mocking DB operations
      mpDbWrite._push([
        // Mock for _insertRegistrationConfig
        {
          id: uuid.v4(),
          name: input.name,
          slug: input.slug
        }
      ]);

      // Mock for _insertRegistrationFiles
      mpDbWrite._push([{ name: input.files[0].name }]);

      mpDbWrite._push([{ name: input.files[1].name }]);

      // Mock for _insertDomainSettings
      mpDbWrite._push([{ domain_name: input.domainSettings[0].domainName }]);

      // Mock for _insertRegistrationUiSettings
      mpDbRead._push([]);
      mpDbWrite._push([
        {
          registration_configuration_id: uuid.v4(),
          logo: input.uiSettings.logo,
          custom_registration_fields: JSON.stringify(
            input.uiSettings.customRegistrationFields
          ),
          registration_button_style: JSON.stringify(
            input.uiSettings.registrationButtonStyle
          ),
          veritone_branding: input.uiSettings.veritoneBranding,
          created_by: context._authInfo.userId,
          modified_by: context._authInfo.userId
        }
      ]);

      let result;
      try {
        result = await dal.createRegistrationConfiguration(context, input);
      } catch (err) {
        console.error(err);
      }

      // Assertions
      expect(result).toBeDefined();
      expect(result.name).toEqual(input.name);
      expect(result.slug).toEqual(input.slug);
      expect(result.files).toHaveLength(2);
      expect(result.domainSettings).toHaveLength(1);

      // Ensure UI settings were inserted correctly
      expect(result.uiSettings).toBeDefined();
      expect(result.uiSettings.logo).toEqual(input.uiSettings.logo);
      expect(result.uiSettings.customRegistrationFields).toEqual(
        JSON.stringify(input.uiSettings.customRegistrationFields)
      );
      expect(result.uiSettings.registrationButtonStyle).toEqual(
        JSON.stringify(input.uiSettings.registrationButtonStyle)
      );
      expect(result.uiSettings.veritoneBranding).toEqual(
        input.uiSettings.veritoneBranding
      );
    });

    it('should throw an error if registration config creation fails', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };
      const input = {
        name: 'Test Config',
        slug: 'test-config',
        openRegistrationStatus: 'open',
        adminApprovalRequired: true,
        organizationGuid: '00000000-0000-0000-0000-000000000001',
        files: [],
        domainSettings: [],
        uiSettings: {}
      };

      // Simulate failure
      mpDbWrite._push([null]);

      let err;
      try {
        await dal.createRegistrationConfiguration(context, input);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toEqual(
        'Failed to create registration configuration.'
      );
    });
  });

  describe('#updateRegistrationConfiguration', function () {
    it('should update a registration configuration successfully', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };
      const input = {
        id: uuid.v4(),
        name: 'Updated Config',
        slug: 'updated-config',
        openRegistrationStatus: 'closed',
        adminApprovalRequired: false,
        organizationGuid: '00000000-0000-0000-0000-000000000002',
        files: [
          {
            name: 'file1',
            url: 'http://example.com/file1',
            type: 'terms_of_service'
          }
        ],
        domainSettings: [
          {
            domainName: 'example.org',
            authGroupId: 'group2',
            applicationRoleIds: ['role3', 'role4']
          }
        ],
        uiSettings: {
          logo: 'http://example.com/newlogo.png',
          customRegistrationFields: {
            fields: [{ key: 'Company Name', type: 'text' }]
          },
          registrationButtonStyle: {
            backgroundColor: '#FF0000'
          },
          veritoneBranding: false
        }
      };

      // Mocking DB operations
      mpDbWrite._push([
        // Mock for _updateRegistrationConfig
        {
          id: input.id,
          name: input.name,
          slug: input.slug
        }
      ]);

      // Mock for _updateRegistrationFiles
      mpDbRead._push([]);
      mpDbWrite._push([{ name: input.files[0].name }]);

      // Mock for _updateDomainSettings
      mpDbRead._push([]);
      mpDbWrite._push([{ domain_name: input.domainSettings[0].domainName }]);

      // Mock for _insertOrUpdateRegistrationUiSettings
      mpDbRead._push([]);
      mpDbWrite._push([
        {
          registration_configuration_id: input.id,
          logo: input.uiSettings.logo,
          custom_registration_fields: JSON.stringify(
            input.uiSettings.customRegistrationFields
          ),
          registration_button_style: JSON.stringify(
            input.uiSettings.registrationButtonStyle
          ),
          veritone_branding: input.uiSettings.veritoneBranding,
          created_by: context._authInfo.userId,
          modified_by: context._authInfo.userId
        }
      ]);

      let result;
      try {
        result = await dal.updateRegistrationConfiguration(context, input);
      } catch (err) {
        console.error(err);
      }

      // Assertions
      expect(result).toBeDefined();
      expect(result.name).toEqual(input.name);
      expect(result.slug).toEqual(input.slug);
      expect(result.files).toHaveLength(1);
      expect(result.domainSettings).toHaveLength(1);

      // Ensure UI settings were updated correctly
      expect(result.uiSettings).toBeDefined();
      expect(result.uiSettings.logo).toEqual(input.uiSettings.logo);
      expect(result.uiSettings.customRegistrationFields).toEqual(
        JSON.stringify(input.uiSettings.customRegistrationFields)
      );
      expect(result.uiSettings.registrationButtonStyle).toEqual(
        JSON.stringify(input.uiSettings.registrationButtonStyle)
      );
      expect(result.uiSettings.veritoneBranding).toEqual(
        input.uiSettings.veritoneBranding
      );
    });

    it('should throw an error if registration config update fails', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };
      const input = {
        id: uuid.v4(),
        name: 'Updated Config',
        slug: 'updated-config',
        openRegistrationStatus: 'closed',
        adminApprovalRequired: false,
        organizationGuid: '00000000-0000-0000-0000-000000000002',
        files: [],
        domainSettings: [],
        uiSettings: {}
      };

      // Simulate failure
      mpDbWrite._push([null]);

      let err;
      try {
        await dal.updateRegistrationConfiguration(context, input);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toEqual(
        'Failed to update registration configuration.'
      );
    });
  });

  describe('#deleteRegistrationConfiguration', function () {
    it('should delete a registration configuration successfully', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };
      const args = { id: uuid.v4() };

      // Mocking DB operations
      mpDbRead._push([]); // Mock for fetching registration configuration
      mpDbWrite._push([{}]); // Mock for deleting registration files
      mpDbWrite._push([{}]); // Mock for deleting domain settings
      mpDbWrite._push([{}]); // Mock for deleting UI settings
      mpDbWrite._push([{}]); // Mock for deleting registration configuration

      let result;
      try {
        result = await dal.deleteRegistrationConfiguration(context, args);
      } catch (err) {
        console.error(err);
      }

      // Assertions
      expect(result).toBeDefined();
      expect(result.id).toEqual(args.id);
      expect(result.message).toEqual(
        `Registration Configuration ${args.id} has been deleted`
      );
    });

    it('should throw an error if registration config deletion fails', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };
      const args = { id: uuid.v4() };

      // Simulate failure
      mpDbWrite._push([null]);

      let err;
      try {
        await dal.deleteRegistrationConfiguration(context, args);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
    });
  });

  describe('#_updateRegistrationConfig', function () {
    it('should update registration config successfully', async function () {
      const context = { _authInfo: { userId: FALLBACK_USER_ID } };
      const input = {
        id: uuid.v4(),
        name: 'Updated Config',
        slug: 'updated-config',
        openRegistrationStatus: 'closed',
        adminApprovalRequired: false,
        organizationGuid: '00000000-0000-0000-0000-000000000002'
      };

      // Mock DB responses
      mpDbWrite._push([
        {
          id: input.id,
          name: input.name,
          slug: input.slug
        }
      ]);

      const result = await dal._updateRegistrationConfig(
        context,
        input,
        mpDbWrite
      );

      expect(result).toBeDefined();
      expect(result.name).toEqual(input.name);
      expect(result.slug).toEqual(input.slug);
    });
  });

  describe('#_updateRegistrationFiles', function () {
    it('should update registration files successfully', async function () {
      const context = { _authInfo: { userId: FALLBACK_USER_ID } };
      const registrationId = uuid.v4();
      const files = [
        { name: 'file1', url: 'http://example.com/file1', type: 'pdf' },
        { name: 'file2', url: 'http://example.com/file2', type: 'pdf' }
      ];

      // Mock DB responses
      mpDbRead._push([]);
      mpDbWrite._push([{ name: files[0].name }]);
      mpDbWrite._push([{ name: files[1].name }]);

      const result = await dal._updateRegistrationFiles(
        context,
        files,
        registrationId,
        mpDbWrite
      );

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual(files[0].name);
      expect(result[1].name).toEqual(files[1].name);
    });
  });

  describe('#_registrationConfigurationPrefetch', function () {
    it('should prefetch registration configuration successfully', async function () {
      const context = { _authInfo: { userId: FALLBACK_USER_ID } };
      const registrationConfigId = uuid.v4();

      // Mock DB responses
      mpDbRead._push([
        {
          organization_guid: '00000000-0000-0000-0000-000000000001'
        }
      ]);

      const result = await dal._registrationConfigurationPrefetch(
        context,
        registrationConfigId
      );

      expect(result).toBeDefined();
      expect(result).toEqual('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('#_insertRegistrationFiles', function () {
    it('should insert registration files successfully', async function () {
      const context = { _authInfo: { userId: FALLBACK_USER_ID } };
      const registrationId = uuid.v4();
      const files = [
        { name: 'file1', url: 'http://example.com/file1', type: 'pdf' },
        { name: 'file2', url: 'http://example.com/file2', type: 'pdf' }
      ];

      // Mock DB responses
      mpDbWrite._push([{ name: files[0].name }]);
      mpDbWrite._push([{ name: files[1].name }]);

      const result = await dal._insertRegistrationFiles(
        context,
        files,
        registrationId,
        mpDbWrite
      );

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual(files[0].name);
      expect(result[1].name).toEqual(files[1].name);
    });
  });

  describe('#_insertDomainSettings', function () {
    it('should insert domain settings successfully', async function () {
      const context = { _authInfo: { userId: FALLBACK_USER_ID } };
      const registrationId = uuid.v4();
      const domainSettings = [
        {
          domainName: 'example.com',
          authGroupId: 'group1',
          applicationRoleIds: ['role1', 'role2']
        }
      ];

      // Mock DB responses
      mpDbWrite._push([{ domain_name: domainSettings[0].domainName }]);

      const result = await dal._insertDomainSettings(
        context,
        domainSettings,
        registrationId,
        mpDbWrite
      );

      expect(result).toHaveLength(1);
      expect(result[0].domainName).toEqual(domainSettings[0].domainName);
    });
  });

  describe('#_insertRegistrationUiSettings', function () {
    it('should insert UI settings successfully', async function () {
      const context = { _authInfo: { userId: FALLBACK_USER_ID } };
      const registrationId = uuid.v4();
      const uiSettings = {
        logo: 'http://example.com/logo.png',
        customRegistrationFields: {
          fields: [{ key: 'Company Name', type: 'text' }]
        },
        registrationButtonStyle: {
          backgroundColor: '#0000FF'
        },
        veritoneBranding: true
      };

      // Mock DB responses
      mpDbRead._push([]);
      mpDbWrite._push([
        {
          logo: uiSettings.logo,
          custom_registration_fields: JSON.stringify(
            uiSettings.customRegistrationFields
          ),
          registration_button_style: JSON.stringify(
            uiSettings.registrationButtonStyle
          ),
          veritone_branding: uiSettings.veritoneBranding
        }
      ]);

      const result = await dal._insertOrUpdateRegistrationUiSettings(
        context,
        uiSettings,
        registrationId,
        mpDbWrite
      );

      expect(result).toBeDefined();
      expect(result.logo).toEqual(uiSettings.logo);
      expect(result.customRegistrationFields).toEqual(
        JSON.stringify(uiSettings.customRegistrationFields)
      );
      expect(result.registrationButtonStyle).toEqual(
        JSON.stringify(uiSettings.registrationButtonStyle)
      );
      expect(result.veritoneBranding).toEqual(uiSettings.veritoneBranding);
    });
  });

  describe('#getRegistrationConfigurations', function () {
    it('should return registration configurations successfully', async function () {
      const context = { _authInfo: { userId: '1234-5678' } };

      // Mock DB responses
      mpDbRead._push([
        {
          registration_configuration_id: uuid.v4(),
          name: 'Test Config 1',
          slug: 'test-config-1'
        },
        {
          registration_configuration_id: uuid.v4(),
          name: 'Test Config 2',
          slug: 'test-config-2'
        }
      ]);

      const result = await dal.getRegistrationConfigurations(context);

      expect(result).toBeDefined();
      expect(result.records).toHaveLength(2);
      expect(result.records[0].name).toEqual('Test Config 1');
      expect(result.records[1].name).toEqual('Test Config 2');
    });
  });

  describe('#getRegistrationFiles', function () {
    const registrationConfigurationId = uuid.v4();

    it('should not filter on status when none is supplied, so the admin view keeps superseded files', async function () {
      let capturedSql;
      let capturedValues;
      mpDbRead._push([], true, [], (sql, args) => {
        capturedSql = sql;
        capturedValues = args;
        return true; // the mock rejects the query unless the check function returns truthy
      });

      await dal.getRegistrationFiles({ registrationConfigurationId });

      expect(capturedSql).toContain('registration_configuration_id');
      expect(capturedSql).not.toContain('status =');
      expect(capturedValues).toEqual([registrationConfigurationId]);
    });

    it('should filter on status when one is supplied', async function () {
      let capturedSql;
      let capturedValues;
      mpDbRead._push([], true, [], (sql, args) => {
        capturedSql = sql;
        capturedValues = args;
        return true; // the mock rejects the query unless the check function returns truthy
      });

      await dal.getRegistrationFiles({
        registrationConfigurationId,
        status: 'active'
      });

      expect(capturedSql).toContain('status =');
      expect(capturedValues).toEqual([registrationConfigurationId, 'active']);
    });

    it('should order by date_modified first so a reactivated document outranks an older edit', async function () {
      // _updateRegistrationFiles reuses the row whose uri and type already match, so reactivating a
      // superseded document leaves its original date_created in place. Ordering on date_created
      // alone would rank that row behind a document it is meant to supersede.
      let capturedSql;
      mpDbRead._push([], true, [], (sql) => {
        capturedSql = sql;
        return true;
      });

      await dal.getRegistrationFiles({ registrationConfigurationId });

      expect(capturedSql).toContain('ORDER BY');
      expect(capturedSql).toContain(
        'date_modified DESC, date_created DESC, id DESC'
      );
    });

    it('should tiebreak on id when the timestamps are equal', async function () {
      // Both timestamp columns default to NOW(), so a batch insert can tie on either; without the
      // id tiebreak two identical calls could resolve different documents.
      let capturedSql;
      mpDbRead._push([], true, [], (sql) => {
        capturedSql = sql;
        return true;
      });

      await dal.getRegistrationFiles({ registrationConfigurationId });

      expect(capturedSql.trim().endsWith('id DESC')).toBe(true);
    });

    it('should return the rows in the order the database supplied them', async function () {
      const newer = uuid.v4();
      const older = uuid.v4();
      mpDbRead._push([
        { id: newer, type: 'terms_of_service', status: 'active', uri: 'http://x/new' },
        { id: older, type: 'terms_of_service', status: 'inactive', uri: 'http://x/old' }
      ]);

      const result = await dal.getRegistrationFiles({
        registrationConfigurationId
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toEqual(newer);
      expect(result[1].id).toEqual(older);
    });
  });
});
