const _ = require('lodash');
const createServiceContext = require('../../test/serviceContext.mock.js');
const serviceContext = createServiceContext();

describe('#TDO', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const query = require('./TemporalDataObject.js')(serviceContext);
      expect(query).toEqual(expect.any(Object));
      const keys = Object.keys(query);
      expect(keys.length).toEqual(1);

      keys.forEach((key) => {
        expect(typeof query[key]).toEqual('function');
      });
    });
  });
  describe('#addACEs', function () {
    let resolvers, bllRbac;
    beforeAll(() => {
      bllRbac = {
        addACEsToResourceFromNestedMutation: jest.fn()
      };
      _.set(serviceContext, 'bll.rbacAuth', bllRbac);
      resolvers = require('./TemporalDataObject.js')(serviceContext);
    });

    beforeEach(() => {
      serviceContext._clearAll();
    });
    it('should add ACEs from nested mutation', async function () {
      bllRbac.addACEsToResourceFromNestedMutation.mockImplementation(
        (ctx, args, info) => {
          expect(args).toEqual(
            expect.objectContaining({
              ids: ['tdo_id'],
              resourceType: 'TDO',
              entries: [
                {
                  member: {
                    id: 'ag_id',
                    memberType: 'Group'
                  },
                  permissionSetID: 'ps_id'
                }
              ],
              organizationGuid: 'org_guid'
            })
          );
          expect(info).toBeDefined();

          return Promise.resolve({
            records: [{ id: 'ps_1' }, { id: 'ps_2' }]
          });
        }
      );

      const schemaInfo = {
        operation: {}
      };
      const res = await resolvers.addACEs(
        { id: 'tdo_id', applicationId: 'org_guid' },
        {
          entries: [
            {
              member: {
                id: 'ag_id',
                memberType: 'Group'
              },
              permissionSetID: 'ps_id'
            }
          ]
        },
        {},
        schemaInfo
      );
      expect(res).toBeDefined();
      expect(res.records.length).toEqual(2);
      expect(bllRbac.addACEsToResourceFromNestedMutation).toHaveBeenCalled();
    });
  });
});
