'use strict';

const dal = {
  engine: { getEngines: jest.fn() },
  structuredData: { getDataRegistries: jest.fn() },
  application: { getContextMenuExtensions: jest.fn() }
};
const resolvers = require('./ApplicationComponent.js')({ dal });

const context = { reqId: 'r1' };

beforeEach(() => {
  dal.engine.getEngines.mockReset();
  dal.structuredData.getDataRegistries.mockReset();
  dal.application.getContextMenuExtensions.mockReset();
});

describe('ApplicationComponent.engines', () => {
  it('loads engines scoped to the app package id, skipping cache', async () => {
    dal.engine.getEngines.mockResolvedValue('engines');
    const result = await resolvers.engines({ id: 'app1' }, {}, context);
    expect(dal.engine.getEngines).toHaveBeenCalledWith(context, { appPackageId: 'app1', skipCache: true });
    expect(result).toBe('engines');
  });
});

describe('ApplicationComponent.dataRegistries', () => {
  it('returns the registries for the app package', async () => {
    dal.structuredData.getDataRegistries.mockResolvedValue('registries');
    const result = await resolvers.dataRegistries({ id: 'app1' }, {}, context);
    expect(dal.structuredData.getDataRegistries).toHaveBeenCalledWith(context, { appPackageId: 'app1' });
    expect(result).toBe('registries');
  });

  it('falls back to an empty page (echoing offset/limit) on error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    dal.structuredData.getDataRegistries.mockRejectedValue(new Error('boom'));

    const result = await resolvers.dataRegistries({ id: 'app1' }, { offset: 5, limit: 10 }, context);

    expect(result).toEqual({ records: [], count: 0, offset: 5, limit: 10 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('defaults offset/limit to 0 in the error fallback when args are absent', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    dal.structuredData.getDataRegistries.mockRejectedValue(new Error('boom'));

    const result = await resolvers.dataRegistries({ id: 'app1' }, {}, context);

    expect(result).toEqual({ records: [], count: 0, offset: 0, limit: 0 });
    spy.mockRestore();
  });
});

describe('ApplicationComponent.contextMenuExtensions', () => {
  it('loads context-menu extensions by application id', async () => {
    dal.application.getContextMenuExtensions.mockResolvedValue('ext');
    const result = await resolvers.contextMenuExtensions({ id: 'app1' }, {});
    expect(dal.application.getContextMenuExtensions).toHaveBeenCalledWith({ applicationId: 'app1' });
    expect(result).toBe('ext');
  });
});
