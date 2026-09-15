const chaiExpect = require('chai').expect;

const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dalEntityTags = require('./entityTags')(serviceContext);
const coreDbRead = serviceContext.dbConnections['core'].read;

describe('entityTags.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#matchEntityTags', function () {
    const dbTags = [
      {
        tag_key: 'first-tag',
        tag_value: 'first-value',
        entity_type: 'engine',
        organization_id: 7682
      },
      {
        tag_key: 'second-tag',
        tag_value: 'second-value',
        entity_type: 'app',
        organization_id: 7682
      }
    ];

    it.skip('should retrieve tags regex matching input', async function () {
      let res, err;
      const options = {
        input: {
          tagKey: 'tag'
        },
        organizationId: 7682
      };

      coreDbRead._push(dbTags);

      try {
        res = await dalEntityTags.getMatchedEntityTags(options);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.haveOwnProperty('records');
      chaiExpect(res.records).to.have.lengthOf(dbTags.length);
    });

    it.skip('should retrieve 1 tag by regex matching input', async function () {
      let res, err;
      const options = {
        input: {
          tagKey: 'fir'
        },
        organizationId: 7682
      };

      coreDbRead._push(dbTags);

      try {
        res = await dalEntityTags.getMatchedEntityTags(options);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.haveOwnProperty('records');
      chaiExpect(res.records).to.have.lengthOf(1);
    });

    it.skip('should throw error when tagKey is undefined', async function () {
      let res, err;
      const options = {
        input: {},
        organizationId: 7682
      };

      coreDbRead._push(dbTags);

      try {
        res = await dalEntityTags.getMatchedEntityTags(options);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.message).to.equal('tagKey param is required');
    });
  });
});
