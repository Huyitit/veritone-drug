const _ = require('lodash');
const createServiceContext = require('../../test/serviceContext.mock.js');
const serviceContext = createServiceContext();

describe('#Folder', function () {
  describe('#addACEs', function () {
    let resolvers, bllRbac;

    beforeAll(() => {
      serviceContext._clearAll();
      bllRbac = {
        addACEsToResourceFromNestedMutation: jest.fn()
      };

      _.set(serviceContext, 'bll.rbacAuth', bllRbac);
      resolvers = require('./Folder.js')(serviceContext);
    });

    beforeEach(() => {
      serviceContext._clearAll();
    });
    it('should load module', function () {
      // load the module and validate basic structure
      const query = require('./Folder.js')(serviceContext);
      expect(bllRbac).toEqual(expect.any(Object));
      const keys = Object.keys(bllRbac);
      expect(keys.length).toEqual(1);

      keys.forEach((key) => {
        expect(typeof bllRbac[key]).toEqual('function');
      });
    });
    it('should add ACEs from nested mutation', async function () {
      bllRbac.addACEsToResourceFromNestedMutation.mockImplementation(
        (ctx, args, info) => {
          expect(args).toEqual(
            expect.objectContaining({
              ids: ['folder_id'],
              resourceType: 'Folder',
              entries: [
                {
                  member: {
                    id: 'ag_id',
                    memberType: 'Group'
                  },
                  permissionSetID: 'ps_id'
                }
              ],
              organizationId: 1
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
        { id: 'folder_id', organizationId: 1 },
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
