const serviceContext = require('../../../test/serviceContext.mock.js')();
const util = require('./util.js')(serviceContext);

const ALL_RIGHTS = ['job.create', 'job.read', 'job.update', 'job.delete'];

function authInfoWithRights(rights) {
  return { json: { rights } };
}

describe('batchActionsAPI bll util.hasOperationsRightForBatchExecutions', () => {
  it('returns true when the user holds all four batch operation rights', () => {
    const context = { _authInfo: authInfoWithRights(ALL_RIGHTS) };
    expect(util.hasOperationsRightForBatchExecutions(context)).toBe(true);
  });

  it('returns false when the user is missing one of the batch operation rights', () => {
    const context = { _authInfo: authInfoWithRights(['job.create', 'job.read', 'job.update']) };
    expect(util.hasOperationsRightForBatchExecutions(context)).toBe(false);
  });
});

describe('batchActionsAPI bll util.isAValidOrganization', () => {
  it('returns true when the context organization matches the input organization', () => {
    const context = { requestContext: { userInfo: { organization: { organizationId: 7642 } } } };
    expect(util.isAValidOrganization(context, { organizationId: 7642 })).toBe(true);
  });

  it('returns false when the organizations differ', () => {
    const context = { requestContext: { userInfo: { organization: { organizationId: 7642 } } } };
    expect(util.isAValidOrganization(context, { organizationId: 999 })).toBe(false);
  });

  it('compares organizations as strings (numeric vs string ids match)', () => {
    const context = { requestContext: { userInfo: { organization: { organizationId: 7642 } } } };
    expect(util.isAValidOrganization(context, { organizationId: '7642' })).toBe(true);
  });

  it('falls back to _authInfo.organization.organizationId when getOrganizationId is unset', () => {
    const context = { requestContext: { _authInfo: { organization: { organizationId: 55 } } } };
    expect(util.isAValidOrganization(context, { organizationId: 55 })).toBe(true);
  });
});
