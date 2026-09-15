const _ = require('lodash');
const moment = require('moment');
const mockUtil = require('./test/mockUtil.js')();
// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

const mtr = require('./metering.js')(serviceContext);

describe('metering.js', function () {
  describe('meterAPIRequest', function () {
    it('should emit event with queries', async () => {
      serviceContext._clearAll();
      const context = mockUtil.makeContext();
      _.set(context, 'fieldStats', {
        'Query.temporalDataObjects': {
          count: 1,
          totalCost: 10
        },
        'Query.jobs': {
          count: 2,
          totalCost: 100
        }
      });
      _.set(context, 'requestInfo.errorCount', 2);
      _.set(context, 'requestInfo.errorNames', ['not_found']);
      await mtr.meterAPIRequest(context);
      expect(serviceContext.messageUtil._counter()).toEqual(1);
      const msg = serviceContext.messageUtil._messages()[0];
      expect(msg).toBeTruthy();
      expect(msg.correlationId).toBeTruthy();
      expect(msg.id).toEqual(context.requestInfo.requestId);
      expect(msg.eventType).toEqual('APIRequest');
      expect(msg.organizationId).toEqual('7682');
      expect(msg.userId).toBeTruthy();
      expect(msg.timestamp).toEqual(
        moment(context.requestInfo.startTime).toISOString()
      );
      expect(msg.apiUsage).toEqual({
        temporalDataObjects: 1,
        jobs: 2
      });
      expect(msg.errorCount).toEqual(2);
      expect(msg.errorNames).toEqual(['not_found']);
      expect(serviceContext.metrics.getValue('meteredEvent')).toEqual(1);
      expect(serviceContext.metrics.getValue('meteredEventError')).toEqual(0);
    });

    it('should handle event error', async () => {
      serviceContext._clearAll();
      const temp = _.clone(serviceContext);
      temp.messageUtil = {
        emitEvent: function () {
          throw new Error();
        }
      };
      const context = mockUtil.makeContext();
      const mtrTemp = require('./metering.js')(temp);
      // this should NOT throw. it should increment metric.
      await mtrTemp.meterAPIRequest(context);
      expect(serviceContext.metrics.getValue('meteredEvent')).toEqual(0);
      expect(serviceContext.metrics.getValue('meteredEventError')).toEqual(1);
    });
  });
});
