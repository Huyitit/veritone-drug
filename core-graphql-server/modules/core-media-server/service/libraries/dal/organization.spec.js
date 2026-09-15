/* global describe, it, expect, beforeEach */
'use strict';

let queryStub;
const commonDalMock = {
  get query() {
    return queryStub;
  }
};

jest.mock('./common', () => () => commonDalMock);
const initDal = require('./organization');

const conn = {
  read: 'postgres://read@sso',
  write: 'postgres://write@sso'
};

const pagingConfig = { defaultLimit: 10, maxLimit: 25 };
const paging = require('../../../util/pagination')(pagingConfig);

describe('libraries.dal.organization:', function () {
  let dal;

  beforeEach(function () {
    queryStub = jest.fn().mockResolvedValue([]);
    dal = initDal(conn, paging);
  });

  it('passes organizationId value into SQL parameters when filter is a string', function () {
    const params = { organizationId: 'org-abc', limit: 10, offset: 0 };
    return dal.getOrganizations(params).then(function () {
      expect(queryStub).toHaveBeenCalledTimes(1);
      const [, , queryValues] = queryStub.mock.calls[0];
      expect(queryValues).toContain('org-abc');
    });
  });

  it('omits WHERE clause from SQL when organizationId is not provided', function () {
    const params = { limit: 10, offset: 0 };
    return dal.getOrganizations(params).then(function () {
      expect(queryStub).toHaveBeenCalledTimes(1);
      const [, querySql] = queryStub.mock.calls[0];
      expect(querySql).not.toContain('WHERE');
    });
  });

  it('passes array of organizationIds into SQL parameters when filter is an array', function () {
    const params = { organizationId: ['org-1', 'org-2'], limit: 10, offset: 0 };
    return dal.getOrganizations(params).then(function () {
      expect(queryStub).toHaveBeenCalledTimes(1);
      const [, , queryValues] = queryStub.mock.calls[0];
      expect(queryValues).toContainEqual(['org-1', 'org-2']);
    });
  });
});
