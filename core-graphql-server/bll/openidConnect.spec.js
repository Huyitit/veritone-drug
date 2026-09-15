const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

describe('bll openidConnect tests', function () {
  let bll, context;
  const CONNECT_ID = 'bb85ccaa-70c5-44ca-83dc-1a1267301bb5';
  const REQUESTER_ORG_GUID = 'cf05552b-52e0-46fa-8f7f-4c9eee135c51';
  const OPENID_NAME = 'Test OpenId Name';
  const OPENID_DESC = 'Test OpenId description';
  const WEBSITE_URL = 'http://localhost.com';
  const BTN_TEXT = 'Button login OpenId';
  const ISSUER_URL = 'https://google.com';
  const CLIENT_SECRET = 'secret';
  const REDIRECT_BASE_URL = 'https://local.veritone.com';

  beforeEach(function () {
    context = mockUtil.makeContext();
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      serviceContext.allowedOriginHosts = ['local.veritone.com:*'];
      bll = require('./openidConnect.js')(serviceContext);
      chaiExpect(bll).to.be.a('object');
      chaiExpect(Object.keys(bll).length).to.equal(1);
      chaiExpect(typeof bll.updateOpenidConnect).to.equal('function');
    });
  });

  describe('#updateOpenidConnect', function () {
    it('should throw - OpenId Connect ID is required.', async function () {
      const args = { input: {} };

      try {
        await bll.updateOpenidConnect(context, args);
        expect.fail('no invalid_input');
      } catch (error) {
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(error.message).to.equal('OpenId Connect ID is required.');
      }
    });

    it('should throw - Org admin is not allowed to update Global OpenId Provider', async function () {
      const args = { input: { id: CONNECT_ID } };

      // isSuperAdmin = false
      _.set(context, '_authInfo.permissionMasks', []);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([{}]);
      // serviceContext.dal.openidConnect.getOpenIdConnect
      serviceContext.dbConnections['sso'].read._push([
        { id: CONNECT_ID, is_global: true }
      ]);

      try {
        await bll.updateOpenidConnect(context, args);
        expect.fail('no not_allowed');
      } catch (error) {
        chaiExpect(error.name).to.equal('not_allowed');
        chaiExpect(error.message).to.equal(
          'Org admin is not allowed to update Global OpenId Provider'
        );
      }
    });

    it('should throw - Org admin cannot update OpenId Provider of other organizations', async function () {
      const args = { input: { id: CONNECT_ID } };

      // isSuperAdmin = false
      _.set(context, '_authInfo.permissionMasks', []);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([{}]);
      // serviceContext.dal.openidConnect.getOpenIdConnect
      serviceContext.dbConnections['sso'].read._push([
        {
          id: CONNECT_ID,
          is_global: false,
          owner_organization_guid: REQUESTER_ORG_GUID + '_invalid'
        }
      ]);

      try {
        await bll.updateOpenidConnect(context, args);
        expect.fail('no not_allowed');
      } catch (error) {
        chaiExpect(error.name).to.equal('not_allowed');
        chaiExpect(error.message).to.equal(
          'Org admin cannot update OpenId Provider of other organizations'
        );
      }
    });

    it('should throw - The redirect target URL is invalid. Please check the format.', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          id: CONNECT_ID,
          is_global: false,
          owner_organization_guid: REQUESTER_ORG_GUID,
          login_button_style: {
            btnLogo: 'logo'
          },
          credentials_ciphertext:
            'd160458eeebadc3735c7b995b9438a30d47a4f03be0f992aae72e5dfe7ebd5c646d18b2748ed076e3b5388131a5b1218ae9b37711ce928deb4386be27622c3c2f812c5682276b64e2a1d82324a92e7452045e39cd9618f1429f3c1a2e8ec81945b98c3083ce7994c2e011c7c07ca0a3408723f426e3e9fef7dae21ce7278eebdb21fe91f6aacf60a54f387654176495ae27b6a9148288f015e4a05a65b6afc59e3b3dae37687e660796e09e424a21954c49a51d70ba333dd171ccfdb8f77cf230845207d5b7efa39fd0430402554235a323b80f848003d69dff389c2c569c86c7830dc3a72d7cc5b3e469e34f2b76233'
        }
      ]);
      const args = {
        input: {
          id: CONNECT_ID,
          name: OPENID_NAME,
          description: OPENID_DESC,
          websiteUrl: WEBSITE_URL,
          btnText: BTN_TEXT,
          issuerUrl: ISSUER_URL,
          clientSecret: CLIENT_SECRET,
          allowedRedirectTargets: ['invali_format']
        }
      };

      try {
        await bll.updateOpenidConnect(context, args);
      } catch (error) {
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(error.message).to.equal(
          'The redirect URL is invalid. Please check the format.'
        );
      }
    });

    it('should throw - The next redirect target URLs are not allowed', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          id: CONNECT_ID,
          is_global: false,
          owner_organization_guid: REQUESTER_ORG_GUID,
          login_button_style: {
            btnLogo: 'logo'
          },
          credentials_ciphertext:
            'd160458eeebadc3735c7b995b9438a30d47a4f03be0f992aae72e5dfe7ebd5c646d18b2748ed076e3b5388131a5b1218ae9b37711ce928deb4386be27622c3c2f812c5682276b64e2a1d82324a92e7452045e39cd9618f1429f3c1a2e8ec81945b98c3083ce7994c2e011c7c07ca0a3408723f426e3e9fef7dae21ce7278eebdb21fe91f6aacf60a54f387654176495ae27b6a9148288f015e4a05a65b6afc59e3b3dae37687e660796e09e424a21954c49a51d70ba333dd171ccfdb8f77cf230845207d5b7efa39fd0430402554235a323b80f848003d69dff389c2c569c86c7830dc3a72d7cc5b3e469e34f2b76233'
        }
      ]);
      const args = {
        input: {
          id: CONNECT_ID,
          name: OPENID_NAME,
          description: OPENID_DESC,
          websiteUrl: WEBSITE_URL,
          btnText: BTN_TEXT,
          issuerUrl: ISSUER_URL,
          clientSecret: CLIENT_SECRET,
          allowedRedirectTargets: [
            'http://mylocal.veritone.net',
            'http://mylocal.aiware.com',
            'http://mylocal.veritone.com'
          ]
        }
      };

      try {
        await bll.updateOpenidConnect(context, args);
      } catch (error) {
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(error.message).to.equal(
          'The next redirect URLs are not allowed: http://mylocal.veritone.net, http://mylocal.aiware.com'
        );
      }
    });

    it('should update openid Connect', async function () {
      const args = {
        input: {
          id: CONNECT_ID,
          name: OPENID_NAME,
          description: OPENID_DESC,
          websiteUrl: WEBSITE_URL,
          btnText: BTN_TEXT,
          issuerUrl: ISSUER_URL,
          clientSecret: CLIENT_SECRET,
          redirectBaseUrl: REDIRECT_BASE_URL
        }
      };

      // isSuperAdmin = false
      _.set(context, '_authInfo.permissionMasks', []);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([{}]);
      // serviceContext.dal.openidConnect.getOpenIdConnect
      serviceContext.dbConnections['sso'].read._push([
        {
          id: CONNECT_ID,
          is_global: false,
          owner_organization_guid: REQUESTER_ORG_GUID,
          login_button_style: {
            btnLogo: 'logo'
          },
          credentials_ciphertext:
            'oEKTyk0N7zDw3z6ykdLyWw==::f1NvVeoyQ3oZyUOUtIB6ICjumh1HDBRgilGdxlw+P9lgwkXHlyPDAXVIM+x1trXYRLpI2iIDWyxxAaV88rphMFx7kuAHAQJaLSE0VIVNYxoXhnc3A/5Y/RSqTIicWunYL1ANw4ZcxuuXAf65/7W4C5uHz39BRDHxmGdX3IEaPZ85jB/2chszZ/XNCeTc+SU7mJQy581Mao+Vd8ra6TxiNHCDwQYDSSUyglLa3UDqCTI=',
          redirect_base_url: "https://local.veritone.com"
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          credentialsCiphertext:
            'bqhrlrMBfkihdKaYZXx1YA==::lCGtbGWz20yrHnLnHeeBQ5f3kW1P9P4CsVu4wXcQ4SCT054SAolZv3+raozhBG32kU9NVEeZ614eC4Ilyo1enNGRXvjOiZC3QL3NRYgCEDO88IQL/U9E98OxZbNAU0zagYUA2QAg42wDq+qGjzzCmA==',
          redirect_base_url: "https://local.veritone.com"
        }
      ]);
      // serviceContext.dal.openidConnect.updateOpenidConnect
      serviceContext.dbConnections['sso'].write._push([{ id: CONNECT_ID, redirect_base_url: "https://local.veritone.com" }]);

      const res = await bll.updateOpenidConnect(context, args);

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(CONNECT_ID);
      chaiExpect(res.redirectBaseUrl).to.equal("https://local.veritone.com");
      // set redirect targets + del OIDC client Key + set/get ExternalCredentialKey
      chaiExpect(serviceContext.redisClient._counter()).to.equal(4);
    });
  });
});
