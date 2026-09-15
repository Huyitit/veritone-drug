'use strict';

const mockGetUiSettings = jest.fn();
const mockGetDomainSettings = jest.fn();

const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.organizationRegistration = {
  getRegistrationUiSettings: mockGetUiSettings,
  getDomainSettings: mockGetDomainSettings,
  getRegistrationFiles: jest.fn()
};

const resolvers = require('./RegistrationConfiguration.js')(serviceContext);

beforeEach(() => {
  mockGetUiSettings.mockReset();
  mockGetDomainSettings.mockReset();
});

describe('RegistrationConfiguration.uiSettings', () => {
  it('parses the JSON string fields when settings exist', async () => {
    mockGetUiSettings.mockResolvedValue({
      customRegistrationFields: '[{"name":"age"}]',
      registrationButtonStyle: '{"color":"blue"}'
    });

    const result = await resolvers.uiSettings({ id: 'rc1' });

    expect(mockGetUiSettings).toHaveBeenCalledWith({ registrationConfigurationId: 'rc1' });
    expect(result.customRegistrationFields).toEqual([{ name: 'age' }]);
    expect(result.registrationButtonStyle).toEqual({ color: 'blue' });
  });

  it('sets the fields to null when their JSON is invalid', async () => {
    mockGetUiSettings.mockResolvedValue({
      customRegistrationFields: 'not-json',
      registrationButtonStyle: '{bad'
    });

    const result = await resolvers.uiSettings({ id: 'rc1' });
    expect(result.customRegistrationFields).toBeNull();
    expect(result.registrationButtonStyle).toBeNull();
  });

  it('returns the falsy settings unchanged without parsing', async () => {
    mockGetUiSettings.mockResolvedValue(null);
    expect(await resolvers.uiSettings({ id: 'rc1' })).toBeNull();
  });
});

describe('RegistrationConfiguration.domainSettings', () => {
  it('delegates to getDomainSettings scoped to the configuration id', async () => {
    mockGetDomainSettings.mockResolvedValue('domains');
    const result = await resolvers.domainSettings({ id: 'rc1' });
    expect(mockGetDomainSettings).toHaveBeenCalledWith({ registrationConfigurationId: 'rc1' });
    expect(result).toBe('domains');
  });
});
