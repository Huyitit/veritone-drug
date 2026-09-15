const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

let bll, ctxSuperAdmin, ctxRegularUser, ctxJWTToken;

describe('bll user tests', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    jest.clearAllMocks();
    ctxSuperAdmin = _.cloneDeep(mockUtil.makeContext());
    ctxRegularUser = _.cloneDeep(mockUtil.makeContext({ authType: 'user' }));
    ctxJWTToken = _.cloneDeep(mockUtil.makeContext({ authType: 'engineJWT' }));
    ctxRegularUser._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
    bll = require('./user.js')(serviceContext);
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      expect(Object.keys(bll).length).toEqual(1);
      expect(typeof bll.getBasicUserInfo).toEqual('function');
    });
  });

  describe('#getBasicUserInfo', function () {
    it('should get basic user info in the same org - non-superadmin user', async function () {
      let err, res;
      let args = {
        id: '6daa2b7b-1160-4406-8d84-b4970933f18b',
        organizationIds: [40657],
        organizationId: 40657
      };

      // serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '6daa2b7b-1160-4406-8d84-b4970933f18b',
            user_name: '02doting_furtive@icloud.com',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            email: '02doting_furtive@icloud.com'
          }
        ],
        false,
        ['ug.group_id = g.group_id', `g.kvp->>'organizationId' IN`]
      );

      try {
        res = await bll.getBasicUserInfo(ctxRegularUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('6daa2b7b-1160-4406-8d84-b4970933f18b');
      expect(res.name).toEqual('02doting_furtive@icloud.com');
    });

    it('should get basic user info in the same org - jwt token', async function () {
      let err, res;
      let args = {
        id: '6daa2b7b-1160-4406-8d84-b4970933f18b'
      };

      // serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '6daa2b7b-1160-4406-8d84-b4970933f18b',
            user_name: '02doting_furtive@icloud.com',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            email: '02doting_furtive@icloud.com'
          }
        ],
        false,
        ['ug.group_id = g.group_id', `g.kvp->>'organizationId' IN`]
      );

      try {
        res = await bll.getBasicUserInfo(ctxJWTToken, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('6daa2b7b-1160-4406-8d84-b4970933f18b');
      expect(res.name).toEqual('02doting_furtive@icloud.com');
    });

    it('should get basic user info in the other org - superadmin user', async function () {
      let err, res;
      let args = {
        id: '6daa2b7b-1160-4406-8d84-b4970933f18b',
        organizationIds: [7682],
        organizationId: 7682
      };

      // serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '6daa2b7b-1160-4406-8d84-b4970933f18b',
            user_name: '02doting_furtive@icloud.com',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            email: '02doting_furtive@icloud.com'
          }
        ],
        false,
        ['ug.group_id = g.group_id']
      );

      try {
        res = await bll.getBasicUserInfo(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('6daa2b7b-1160-4406-8d84-b4970933f18b');
      expect(res.name).toEqual('02doting_furtive@icloud.com');
    });
  });
});
