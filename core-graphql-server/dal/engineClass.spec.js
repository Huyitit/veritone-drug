const chaiExpect = require('chai').expect;
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dalEngineClass = require('./engineClass')(serviceContext);
const coreDbRead = serviceContext.dbConnections['core'].read;

describe('engineClass.js', function () {
  describe('#getEngineClass', function () {
    const results = [
      { name: 'Foo 1', description: 'Bar 1' },
      { name: 'Foo 2', description: 'Bar 2' }
    ];

    it('should retrieve all engine classes', async function () {
      let res, err;
      const results = [
        { name: 'Foo 1', description: 'Bar 1' },
        { name: 'Foo 2', description: 'Bar 2' }
      ];

      coreDbRead._push(results);

      try {
        res = await dalEngineClass.getEngineClasses(mockUtil.makeContext());
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.haveOwnProperty('records');
      chaiExpect(res.records).to.have.lengthOf(results.length);
    });

    describe('#retrieve a single engine class', function () {
      it('should throw error when id is undefined', async function () {
        let res, err;
        const options = {};

        coreDbRead._push(results);

        try {
          res = await dalEngineClass.getEngineClass(
            mockUtil.makeContext(),
            options
          );
        } catch (error) {
          err = error;
        }

        chaiExpect(err).to.exist;
        chaiExpect(res).to.be.undefined;
        chaiExpect(err.message).to.equal('id param is required');
      });
      it('should retrieve a single engine class', async function () {
        let res, err;
        const options = {
          id: '5a3923b5-c94c-4ff6-8d04-2402eeb64bd7'
        };

        coreDbRead._push(results);

        try {
          res = await dalEngineClass.getEngineClass(
            mockUtil.makeContext(),
            options
          );
        } catch (error) {
          err = error;
        }

        chaiExpect(err).to.be.undefined;
        chaiExpect(res)
          .to.be.an('object')
          .that.has.all.keys('name', 'description');
      });
    });
  });
});
