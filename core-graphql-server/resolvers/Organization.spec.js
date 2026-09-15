const chaiExpect = require('chai').expect;
const _ = require('lodash');
// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

const util = require('./util.js')(serviceContext);
const resolver = require('./Organization.js')(serviceContext);

describe('#Organization.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolver).to.be.a('object');
      const keys = Object.keys(resolver);
      chaiExpect(keys.length).to.equal(26);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });
  });

  describe('#signPrimaryUrl', function () {
    it('should return signedPrimary url for discovery reports', async function () {
      let res, err;
      const url = 'https://s3.amazon.com/prod-api.abc.com/2099';
      const signedUrl = await util.getSignedUrl(url);
      const obj = {
        jsondata: {
          features: {
            discoveryReports: {
              primaryLogo: url
            }
          }
        }
      };

      try {
        res = await resolver.jsondata(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(
        _.get(res, 'features.discoveryReports.primaryLogoSignedUrl')
      ).to.be.equal(signedUrl);
    });
  });

  describe('#signSecondaryUrl', function () {
    it('should return signedPrimary url for discovery reports', async function () {
      let res, err;
      const url = 'https://s3.amazon.com/prod-api.abc.com/2099';
      const signedUrl = await util.getSignedUrl(url);
      const obj = {
        jsondata: {
          features: {
            discoveryReports: {
              secondaryLogo: url
            }
          }
        }
      };

      try {
        res = await resolver.jsondata(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(
        _.get(res, 'features.discoveryReports.secondaryLogoSignedUrl')
      ).to.be.equal(signedUrl);
    });
  });

  describe('#isRootOrganization', () => {
    it('organization is true when orgId match with rootOrgId from flyway in config for graphql server', () => {
      const obj = {
        id: 7682
      };
      const context = {
        config: {
          flyway: {
            rootOrgId: 7682
          }
        }
      };

      const resp = resolver.isRootOrganization(obj, {}, context);
      chaiExpect(resp).to.be.equal(true);
    });

    it('organization is false when orgId does not match with rootOrgId from flyway in config for graphql server', () => {
      const obj = {
        id: 7682
      };
      const context = {
        config: {
          flyway: {
            rootOrgId: 1
          }
        }
      };

      const resp = resolver.isRootOrganization(obj, {}, context);
      chaiExpect(resp).to.be.equal(false);
    });
  });

  describe('#loginConfiguration', () => {
    it('returns login configuration', async () => {
      const obj = {
        id: 7682
      };
      const context = {
        config: {
          flyway: {
            rootOrgId: 1
          }
        }
      };

      const expectedResponse = {
        name: 'Test Login Config',
        slug: 'test-login-slug',
        logo:
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
        buttonColor: '#0000FF',
        buttonTextColor: '#FFFFFF',
        organizationInfo: {
          id: 7682,
          guid: '0023c9f2-6728-4df9-ae3c-6bd15c3326a8',
          name: 'Veritone Test Org'
        }
      };

      serviceContext.dbConnections['media_platform'].read._push([
        {
          name: 'Test Login Config',
          slug: 'test-login-slug',
          logo:
            'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
          login_button_style: {
            buttonColor: '#0000FF',
            buttonTextColor: '#FFFFFF'
          },
          organization_id: 7682,
          organization_guid: '0023c9f2-6728-4df9-ae3c-6bd15c3326a8',
          organization_name: 'Veritone Test Org'
        }
      ]);

      const resp = await resolver.loginConfiguration(obj, {}, context);
      chaiExpect(resp.name).to.be.equal(expectedResponse.name);
      chaiExpect(resp.slug).to.be.equal(expectedResponse.slug);
      chaiExpect(resp.logo).to.be.equal(expectedResponse.logo);
      chaiExpect(resp.buttonColor).to.be.equal(expectedResponse.buttonColor);
      chaiExpect(resp.buttonTextColor).to.be.equal(
        expectedResponse.buttonTextColor
      );
      chaiExpect(resp.organizationInfo).contains(
        expectedResponse.organizationInfo
      );
    });
  });

  describe('#registrationConfigurations', () => {
    it('returns registration configurations', async () => {
      const obj = {
        organizationGuid: '0023c9f2-6728-4df9-ae3c-6bd15c3326a8'
      };
      const context = {
        config: {
          flyway: {
            rootOrgId: 1
          }
        }
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          id: 'a8606a9b-3d9b-4519-9c1e-a890f1921b9e',
          name: 'test1',
          slug: 'test1',
          open_registration_status: 'restricted'
        },
        {
          id: '0023c9f2-6728-4df9-ae3c-6bd15c3326a8',
          name: 'test2',
          slug: 'test2',
          open_registration_status: 'restricted'
        }
      ]);

      const resp = await resolver.registrationConfigurations(obj, {}, context);
      chaiExpect(resp).to.exist;
      chaiExpect(resp.records.length).to.equal(2);
    });
  });
});
