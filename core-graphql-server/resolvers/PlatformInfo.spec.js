const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./PlatformInfo.js')(serviceContext);

describe('#PlatformInfo', function () {
  this.beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#signedPropertyUrls', function () {
    it('the paths is empty', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            testField1: 'test1',
            jsonProperties: {
              testField1: 'test1',
              testField2: 'test2',
              loginConfig: {}
            }
          }
        ],
        false
      );
      const res = await resolvers.signedPropertyUrls(null, null);
      expect(res).toBeDefined();
      expect(res).toEqual([]);
    });
    it('logoUrl does not exist', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            testField1: 'test1',
            jsonProperties: {
              testField1: 'test1',
              testField2: 'test2',
              loginConfig: {}
            }
          }
        ],
        false
      );
      const res = await resolvers.signedPropertyUrls(null, {
        propertyPaths: ['loginConfig.logoUrl']
      });
      expect(res).toBeDefined();
      expect(res).toEqual([
        {
          propertyPath: 'loginConfig.logoUrl',
          signedUrl: ''
        }
      ]);
    });
    it('logoUrl exists', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            testField1: 'test1',
            jsonProperties: {
              testField1: 'test1',
              testField2: 'test2',
              loginConfig: {
                logoUrl: 'https://mylogo.com/fdsgasw.jpg'
              }
            }
          }
        ],
        false
      );
      const res = await resolvers.signedPropertyUrls(null, {
        propertyPaths: ['loginConfig.logoUrl']
      });
      expect(res).toBeDefined();
      expect(res).toEqual([
        {
          propertyPath: 'loginConfig.logoUrl',
          signedUrl: 'https://mylogo.com/fdsgasw.jpg'
        }
      ]);
    });
    it('seatLimitDomainIgnoreList exists', async function () {
      const res = await resolvers.seatLimitDomainIgnoreList(null, null);
      expect(res).toBeDefined();
      expect(res).toEqual([
        "veritone.com",
        "setacinq.vn"
      ]);
    });
  });
});
