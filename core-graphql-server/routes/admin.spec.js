const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

let getFunc;
let putFunc;
let context;
serviceContext.app = {
  use: () => {},
  get: (path, func) => {
    getFunc = func;
  },
  put: (path, func) => {
    putFunc = func;
  },
  middleware: {
    authenticationOption: () => {},
    loadAuthDataByToken: () => {}
  }
};

const mockMyOrgRequest = () => {
  return {
    context
  };
};

const mockSwitchOrgRequest = (organizationGuid) => {
  return {
    context,
    headers: {},
    params: {
      organizationGuid
    }
  };
};

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.sendStatus = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.writeHead = jest.fn().mockReturnValue(res);
  res.contentType = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(function () {
  context = {
    userInfo: mockUtil.getGraphQLContext(null, 'user').userInfo
  };
});

describe('admin endpoints', function () {
  beforeEach(() => {
    serviceContext._clearAll();

    jest.mock('../resolvers/util.js', () => (serviceContext) => {
      return {
        authorizeAppIds: jest.fn(),
        authorizeOrgIds: jest.fn()
      };
    });

    require('./admin.js')(serviceContext);
  });

  describe('#organization/mine', function () {
    it('should get my organizations', async function () {
      const req = mockMyOrgRequest();
      const res = mockResponse();

      serviceContext.dbConnections['sso'].read._push([
        {
          id: '123',
          guid: '1234-5678',
          priority: 0
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 123,
          organization_name: 'test-org'
        }
      ]);

      await getFunc(req, res);

      const myOrg = {
        guid: '1234-5678',
        id: 123,
        name: 'test-org',
        organizationId: 123,
        organizationName: 'test-org',
        organizationGuid: '1234-5678',
        priority: 0
      };

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          records: expect.arrayContaining([expect.objectContaining(myOrg)])
        })
      );
    });
  });

  describe('#switch-org', function () {
    it('should switch organization', async function () {
      const req = mockSwitchOrgRequest('c0e6a828-43c2-4ba6-b0b5-c5ade0533bf6');
      const res = mockResponse();

      jest
        .spyOn(serviceContext.dal.admin, 'switchUserToOrganization')
        .mockReturnValue({ token: 'e3cf70bc-ae70-4e3a-9cd0-40ad848d24c1' });

      await putFunc(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({
        token: 'e3cf70bc-ae70-4e3a-9cd0-40ad848d24c1'
      });
      expect(
        serviceContext.dal.admin.switchUserToOrganization
      ).toHaveBeenCalled();
    });
  });
});
