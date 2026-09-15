const organization = require('../dal/organization');
const createBll = require('./organizationRegistration');
const uuid = require('uuid');
const chaiExpect = require('chai').expect;
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();
let bll = createBll(serviceContext);

beforeEach(function () {
  serviceContext._clearAll();
  serviceContext.dal.organizationRegistration = {
    createRegistrationConfiguration: jest.fn(),
    updateRegistrationConfiguration: jest.fn(),
    deleteRegistrationConfiguration: jest.fn(),
    _registrationConfigurationPrefetch: jest.fn()
  };
});

const mpDbWrite = serviceContext.dbConnections['sso'].write;
const mpDbRead = serviceContext.dbConnections['sso'].read;
describe('bll organization registration tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(bll).to.be.an('object');
      chaiExpect(Object.keys(bll).length).to.equal(3);
      chaiExpect(typeof bll.createRegistrationConfiguration).to.equal(
        'function'
      );
      chaiExpect(typeof bll.updateRegistrationConfiguration).to.equal(
        'function'
      );
      chaiExpect(typeof bll.deleteRegistrationConfiguration).to.equal(
        'function'
      );
    });
  });

  describe('#createRegistrationConfiguration', function () {
    const context = {
      _authInfo: {
        userId: '1234-5678',
        organization: {
          organizationGuid: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    const input = {
      name: 'Test Config',
      slug: 'test-config',
      openRegistrationStatus: 'restricted',
      adminApprovalRequired: true,
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
      ]
    };
    serviceContext.dal.admin.allowedToUpdateOrganization = jest.fn();
    serviceContext.dal.application.getAppIdFromOrgId = jest.fn();

    it('should create a registration configuration successfully', async function () {
      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );

      serviceContext.dal.organizationRegistration.createRegistrationConfiguration.mockResolvedValue(
        { name: 'Test Config' }
      );
      // Mocking DB operations
      mpDbWrite._push([
        // Mock for _insertRegistrationConfig
        {
          id: uuid.v4(),
          name: input.name,
          slug: input.slug
        }
      ]);

      const result = await bll.createRegistrationConfiguration(context, {
        input
      });
      chaiExpect(result).to.be.an('object');
      chaiExpect(result.name).to.equal(input.name);
    });

    it('should throw an error if domain name is invalid', async function () {
      const invalidInput = {
        ...input,
        domainSettings: [
          {
            domainName: 'invalid_domain',
            authGroupId: 'group1',
            applicationRoleIds: ['role1', 'role2']
          }
        ]
      };

      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      try {
        await bll.createRegistrationConfiguration(context, {
          input: invalidInput
        });

        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.equal('Invalid domain');
      }
    });
    it('should throw an error if organizationGuid is not a valid UUID', async function () {
      const invalidInput = { ...input, organizationGuid: 'invalid-uuid' };

      try {
        await bll.createRegistrationConfiguration(context, {
          input: invalidInput
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'organizationGuid must be a valid UUID'
        );
      }
    });

    it('should throw an error if role id is not found', async function () {
      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        }
      ]);

      try {
        await bll.createRegistrationConfiguration(context, {
          input
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Invalid input applicationRoleIds'
        );
      }
    });
    // invalid url
    it('should throw an error if file url is invalid', async function () {
      const invalidInput = {
        ...input,
        files: [{ name: 'file1', url: 'invalid-url', type: 'terms_of_service' }]
      };

      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      try {
        await bll.createRegistrationConfiguration(context, {
          input: invalidInput
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain('Invalid URL');
      }
    });
    it('should throw an error if org access is not allowed', async function () {
      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        false
      );

      try {
        await bll.createRegistrationConfiguration(context, {
          input
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain('Access denied');
      }
    });
  });

  describe('#updateRegistrationConfiguration', function () {
    const context = {
      _authInfo: {
        userId: '1234-5678',
        organization: {
          organizationGuid: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    const id = '00000000-0000-0000-0000-000000000002';
    const input = {
      name: 'Updated Config',
      slug: 'updated-config',
      openRegistrationStatus: 'restricted',
      adminApprovalRequired: true,
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
      ]
    };
    serviceContext.dal.admin.allowedToUpdateOrganization = jest.fn();
    serviceContext.dal.application.getAppIdFromOrgId = jest.fn();

    mpDbWrite._push([
      {
        id,
        name: input.name,
        slug: input.slug,
        organization_guid: context._authInfo.organization.organizationGuid
      }
    ]);

    it('should update a registration configuration successfully', async function () {
      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );
      serviceContext.dal.organizationRegistration.updateRegistrationConfiguration.mockResolvedValue(
        { name: input.name }
      );

      const result = await bll.updateRegistrationConfiguration(context, {
        id,
        input
      });
      chaiExpect(result).to.be.an('object');
      chaiExpect(result.name).to.equal(input.name);
    });

    it('should throw an error if domain name is invalid', async function () {
      const invalidInput = {
        ...input,
        domainSettings: [
          {
            domainName: 'invalid_domain',
            authGroupId: 'group1',
            applicationRoleIds: ['role1', 'role2']
          }
        ]
      };

      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );

      try {
        await bll.updateRegistrationConfiguration(context, {
          id,
          input: invalidInput
        });

        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.equal('Invalid domain');
      }
    });

    it('should throw an error if role id is not found', async function () {
      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );

      try {
        await bll.updateRegistrationConfiguration(context, {
          id,
          input
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Invalid input applicationRoleIds'
        );
      }
    });

    it('should throw an error if file url is invalid', async function () {
      const invalidInput = {
        ...input,
        files: [{ name: 'file1', url: 'invalid-url', type: 'terms_of_service' }]
      };

      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );

      try {
        await bll.updateRegistrationConfiguration(context, {
          id,
          input: invalidInput
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain('Invalid URL');
      }
    });

    it('should throw an error if org access is not allowed', async function () {
      mpDbRead._push([
        {
          id: 'role1',
          role_name: 'test role'
        },
        {
          id: 'role2',
          role_name: 'test role 2'
        }
      ]);

      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        false
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );

      try {
        await bll.updateRegistrationConfiguration(context, {
          id,
          input
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain('Access denied');
      }
    });
  });

  describe('#deleteRegistrationConfiguration', function () {
    const context = {
      _authInfo: {
        userId: '1234-5678',
        organization: {
          organizationGuid: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    const id = '00000000-0000-0000-0000-000000000002';

    it('should delete a registration configuration successfully', async function () {
      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );
      serviceContext.dal.organizationRegistration.deleteRegistrationConfiguration.mockResolvedValue(
        { message: `Registration Configuration ${id} has been deleted` }
      );

      const result = await bll.deleteRegistrationConfiguration(context, {
        id
      });
      chaiExpect(result).to.be.an('object');
      chaiExpect(result.message).to.contain('deleted');
    });

    it('should throw an error if registration configuration does not exist', async function () {
      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        null
      );

      try {
        await bll.deleteRegistrationConfiguration(context, {
          id
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain(
          `Failed to retrieve registration configuration with ${id}.`
        );
      }
    });

    it('should throw an error if org access is not allowed', async function () {
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );
      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        false
      );

      try {
        await bll.deleteRegistrationConfiguration(context, {
          id
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain('Access denied');
      }
    });

    it('should throw an error if there is an internal server error', async function () {
      serviceContext.dal.admin.allowedToUpdateOrganization.mockResolvedValue(
        true
      );
      serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch.mockResolvedValue(
        context._authInfo.organization.organizationGuid
      );
      serviceContext.dal.organizationRegistration.deleteRegistrationConfiguration.mockRejectedValue(
        new Error('Internal server error')
      );

      try {
        await bll.deleteRegistrationConfiguration(context, {
          id
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Failed to delete registration configuration'
        );
      }
    });
  });
});
