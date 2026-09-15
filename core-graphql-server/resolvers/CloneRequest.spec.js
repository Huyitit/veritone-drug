'use strict';

const dal = { organization: { getOrganization: jest.fn() } };
const resolvers = require('./CloneRequest.js')({ dal });

const context = { reqId: 'r1' };

beforeEach(() => dal.organization.getOrganization.mockReset());

describe('CloneRequest.sourceOrganization', () => {
  it('loads the organization by the parent sourceApplicationId when present', () => {
    dal.organization.getOrganization.mockReturnValue('sourceOrg');

    const result = resolvers.sourceOrganization(
      { sourceApplicationId: 'src1', destinationApplicationId: 'dst1' },
      { applicationId: 'argApp' },
      context
    );

    expect(dal.organization.getOrganization).toHaveBeenCalledWith(context, {
      id: 'src1'
    });
    expect(result).toBe('sourceOrg');
  });

  it('falls back to args.applicationId when the parent sourceApplicationId is absent', () => {
    dal.organization.getOrganization.mockReturnValue('argOrg');

    const result = resolvers.sourceOrganization(
      { destinationApplicationId: 'dst1' },
      { applicationId: 'argApp' },
      context
    );

    expect(dal.organization.getOrganization).toHaveBeenCalledWith(context, {
      id: 'argApp'
    });
    expect(result).toBe('argOrg');
  });
});

describe('CloneRequest.destinationOrganization', () => {
  it('loads the organization by the parent destinationApplicationId', () => {
    dal.organization.getOrganization.mockReturnValue('destOrg');

    const result = resolvers.destinationOrganization(
      { sourceApplicationId: 'src1', destinationApplicationId: 'dst1' },
      {},
      context
    );

    expect(dal.organization.getOrganization).toHaveBeenCalledWith(context, {
      id: 'dst1'
    });
    expect(result).toBe('destOrg');
  });
});
