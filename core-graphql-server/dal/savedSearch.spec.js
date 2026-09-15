const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);

const dal = require('./savedSearch.js')(serviceContext);

describe('savedSearch.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#deleteSavedSearch', function () {
    it('should delete a saved search', async function () {
      serviceContext._clearAll();
      serviceContext.dbConnections['media_platform'].write._push([
        { id: '123' }
      ]);
      const res = await dal.deleteSavedSearch(
        {
          id: '123',
          orgId: '7682',
          userId: 'u123'
        },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
    });
  });

  describe('#replaceSavedSearch', function () {
    it('should replace a saved search - did not exist', async function () {
      serviceContext.dbConnections['media_platform'].write._push([]);
      const res = await dal.replaceSavedSearch(
        {
          input: {
            name: 'test',
            csp: {},
            sharedWithOrganization: true
          }
        },
        mockUtil.makeContext()
      );
    });

    it('should replace a saved search - did exist', async function () {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 'id1',
          org_id: '7682',
          name: 'test search',
          csp: {},
          shared_with_org: true,
          created_at: moment().valueOf(),
          updated_at: moment().valueOf()
        }
      ]);

      const res = await dal.replaceSavedSearch(
        {
          input: {
            name: 'test',
            csp: {},
            sharedWithOrganization: true
          }
        },
        mockUtil.makeContext()
      );
    });
  });

  describe('#createSavedSearch', function () {
    it('should create a saved search - error on conflict', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '123' }
      ]);
      try {
        await dal.createSavedSearch(
          {
            input: {
              name: 'test',
              csp: {},
              sharedWithOrganization: true
            }
          },
          mockUtil.makeContext()
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('should create a saved search - no conflict', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 'id1',
          org_id: '7682',
          name: 'test search',
          csp: {},
          shared_with_org: true,
          created_at: moment().valueOf(),
          updated_at: moment().valueOf()
        }
      ]);

      const res = await dal.createSavedSearch(
        {
          input: {
            name: 'test',
            csp: {},
            sharedWithOrganization: true
          }
        },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.exist;
    });
  });
  describe('#getSavedSearch', function () {
    it('should get saved searches - shared', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'id1',
          org_id: '7682',
          name: 'test search',
          csp: {},
          shared_with_org: true,
          created_at: moment().valueOf(),
          updated_at: moment().valueOf()
        }
      ]);
      const res = await dal.getSavedSearch(mockUtil.makeContext(), {
        organizationId: '7682',
        includeShared: true,
        orderBy: 'name',
        orderDirection: 'asc'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should get saved searches - own', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'id1',
          org_id: '7682',
          name: 'test search',
          csp: {},
          shared_with_org: false,
          created_at: moment().valueOf(),
          updated_at: moment().valueOf()
        }
      ]);
      const res = await dal.getSavedSearch(mockUtil.makeContext(), {
        organizationId: '7682',
        includeShared: false,
        orderBy: 'createdDateTime',
        orderDirection: 'desc',
        fitlerByName: 'test'
      });
      chaiExpect(res).to.exist;
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });
  });
});
