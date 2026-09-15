const chaiExpect = require('chai').expect;
const { v5: uuidv5 } = require('uuid');

const serviceContext = require('../test/serviceContext.mock.js')();
serviceContext.dal = {
  search: {
    searchMedia: (context, args) =>
      Promise.resolve({
        jsondata: {
          results: [
            {
              stationMainPhone: '(614) 460-3850',
              trafficStationId: '24528bcf-9a03-425f-b4c1-023aba3c2dca',
              stationName: 'The Fan',
              stationInt: 8378,
              broadcasterInt: 376,
              stationCallLetters: 'WBNS-FM',
              trafficStationInt: 4,
              stationId: '2d65de88-4a53-4eef-8580-06aa78d97dfe'
            },
            {
              stationMainPhone: '(614) 460-3850',
              trafficStationId: '24528bcf-9a03-425f-b4c1-023aba3c2dca',
              stationName: 'KLVE-FM - Univision LA',
              stationInt: 78077,
              broadcasterInt: 112,
              stationCallLetters: 'KLVEF-FM',
              trafficStationInt: 4,
              stationId: '2d65de88-4a53-4eef-8580-06aa78d97dfe'
            }
          ],
          totalResults: 2,
          limit: 2,
          from: 0,
          to: 0,
          searchToken: '0e66a140-afe5-11ea-8abb-7775d36d9413',
          timestamp: 1592320891
        }
      })
  },
  structuredData: {
    getStructuredDataObjects: (context, args) =>
      Promise.resolve({
        records: [
          {
            id: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
            data: {
              id: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              advertiserName: 'Blue Buffalo',
              productCodeDisplay: 'Pet Stores',
              defaultOrderTypeInt: '379',
              defaultRevenueCodeInt: '124',
              defaultPriorityCodeInt: '579',
              defaultRevenueCode2Int: '182',
              defaultRevenueCode3Int: '206',
              defaultRevenueCodeName: 'Agency Business',
              advertiserReportingName: 'Blue Buffalo',
              defaultPriorityCodeName: 'Please Select',
              defaultRevenueCode2Name: 'Regular',
              defaultRevenueCode3Name: 'Spot'
            }
          }
        ]
      }),
    getSchemas: (context, args) =>
      Promise.resolve({
        count: 1,
        records: [
          {
            id: '77d76430-db7e-4229-aba1-0f33a4502b14',
            definition: {
              type: 'object',
              $schema: 'http://json-schema.org/draft-07/schema#',
              properties: {}
            }
          }
        ]
      })
  }
};

const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';

beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

describe('#wideOrbit', function () {
  describe('#createEvents', function () {
    it('should handle advertiser registry payload', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: {
            advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
            advertiserName: 'Blue Buffalo',
            productCodeDisplay: 'Pet Stores',
            defaultOrderTypeInt: '379',
            defaultRevenueCodeInt: '124',
            defaultPriorityCodeInt: '579',
            defaultRevenueCode2Int: '182',
            defaultRevenueCode3Int: '206',
            defaultRevenueCodeName: 'Agency Business',
            advertiserReportingName: 'Blue Buffalo',
            defaultPriorityCodeName: 'Please Select',
            defaultRevenueCode2Name: 'Regular',
            defaultRevenueCode3Name: 'Spot'
          }
        }
      };
      const res = await adapter.createEvents(
        'd3badf83-942d-445c-aae8-0f04ea903a72',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(req.body.advertiserId);
    });

    it('should handle single playout data request', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            media_source_id: 1234,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'WBNS-FM',
            station_call_sign: 'WBNS',
            station_band: 'FM'
          }
        ],
        false
      );
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: {
            spotStatus: 'Reconciled',
            channelInt: '4',
            orderProductDescription: 'Radio Promo/ PSA',
            spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
            spotType: 'Normal',
            invoiceIsciCode: 'ZNGB9052',
            advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
            materialDescription: "OH. ARMY NAT'L GUARD ",
            market: 'Columbus Radio',
            rate: '0.0000',
            startTime: '102458000',
            trafficStationInt: '4',
            spotLength: '0',
            intendedAirDate: '2020-03-04'
          }
        }
      };
      const res = await adapter.createEvents(
        'c8444503-1dff-4ee4-a906-4341a6d2296d',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.an('array');
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].adId).to.equal(req.body.data.invoiceIsciCode);
      chaiExpect(res[0].stationCallLetters).to.equal('WBNS');
      chaiExpect(res[0].stationBand).to.equal('FM');
      chaiExpect(res[0].advertiserId).to.equal(
        req.body.data.materialDescription
      );
      chaiExpect(res[0].advertiserName).to.not.equal(
        req.body.data.advertiserId
      );
      chaiExpect(res[0].advertiserName).to.equal('Blue Buffalo');
      chaiExpect(res[0].market).to.equal(req.body.data.market);
      chaiExpect(res[0].text).to.equal(req.body.data.orderProductDescription);
      chaiExpect(res[0].startDateTime).to.equal('2020-03-05T12:27:38.000Z');
      chaiExpect(res[0].endDateTime).to.equal('2020-03-05T12:27:38.000Z'); // 0 seconds duration
      chaiExpect(res[0].batchId).to.exist;
    });

    it('should handle playout data with 0 duration', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            media_source_id: 1234,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'WBNS-FM',
            station_call_sign: 'WBNS',
            station_band: 'FM'
          }
        ],
        false
      );
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: {
            spotStatus: 'Reconciled',
            channelInt: '4',
            orderProductDescription: 'Radio Promo/ PSA',
            spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
            spotType: 'Normal',
            invoiceIsciCode: 'ZNGB9052',
            advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
            materialDescription: "OH. ARMY NAT'L GUARD ",
            market: 'Columbus Radio',
            rate: '0.0000',
            startTime: '102458000',
            trafficStationInt: '4',
            spotLength: '30000',
            intendedAirDate: '2020-03-04'
          }
        }
      };
      const res = await adapter.createEvents(
        'c8444503-1dff-4ee4-a906-4341a6d2296d',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.an('array');
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].adId).to.equal(req.body.data.invoiceIsciCode);
      chaiExpect(res[0].stationCallLetters).to.equal('WBNS');
      chaiExpect(res[0].stationBand).to.equal('FM');
      chaiExpect(res[0].advertiserId).to.equal(
        req.body.data.materialDescription
      );
      chaiExpect(res[0].advertiserName).to.not.equal(
        req.body.data.advertiserId
      );
      chaiExpect(res[0].advertiserName).to.equal('Blue Buffalo');
      chaiExpect(res[0].market).to.equal(req.body.data.market);
      chaiExpect(res[0].text).to.equal(req.body.data.orderProductDescription);
      chaiExpect(res[0].startDateTime).to.equal('2020-03-05T12:27:38.000Z');
      chaiExpect(res[0].endDateTime).to.equal('2020-03-05T12:28:08.000Z'); // 30 seconds duration
      chaiExpect(res[0].batchId).to.exist;
    });

    it('should handle multiple playout data request', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            media_source_id: 1234,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'WBNS-FM',
            station_call_sign: 'WBNS',
            station_band: 'FM'
          }
        ],
        false
      );
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: [
            {
              spotStatus: 'Reconciled',
              channelInt: '4',
              orderProductDescription: 'Radio Promo/ PSA',
              spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spotType: 'Normal',
              invoiceIsciCode: 'ZNGB9052',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              materialDescription: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              rate: '0.0000',
              startTime: '102458000',
              trafficStationInt: '4',
              spotLength: '30000',
              intendedAirDate: '2020-03-04'
            },
            {
              spotStatus: 'Reconciled',
              channelInt: '4',
              orderProductDescription: 'Radio Promo/ PSA',
              spotId: '4a60f43f-777d-478d-8db0-3f679b743cb0',
              spotType: 'Normal',
              invoiceIsciCode: 'ZNGB90522',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              materialDescription: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              rate: '0.0000',
              startTime: '102458000',
              trafficStationInt: '4',
              spotLength: '30000',
              intendedAirDate: '2020-03-04'
            }
          ]
        }
      };
      const res = await adapter.createEvents(
        'c8444503-1dff-4ee4-a906-4341a6d2296d',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.an('array');
      chaiExpect(res.length).to.equal(2);
      for (let i = 0; i < res.length; ++i) {
        chaiExpect(res[i].adId).to.equal(req.body.data[i].invoiceIsciCode);
        chaiExpect(res[i].stationCallLetters).to.equal('WBNS');
        chaiExpect(res[i].stationBand).to.equal('FM');
        chaiExpect(res[i].advertiserId).to.equal(
          req.body.data[i].materialDescription
        );
        chaiExpect(res[i].advertiserName).to.not.equal(
          req.body.data[i].advertiserId
        );
        chaiExpect(res[i].advertiserName).to.equal('Blue Buffalo');
        chaiExpect(res[i].market).to.equal(req.body.data[i].market);
        chaiExpect(res[i].text).to.equal(
          req.body.data[i].orderProductDescription
        );
        chaiExpect(res[i].startDateTime).to.equal('2020-03-05T12:27:38.000Z');
        chaiExpect(res[i].endDateTime).to.equal('2020-03-05T12:28:08.000Z'); // 30 seconds duration
        chaiExpect(res[i].batchId).to.exist;
      }
    });

    it('duplicate playout data request', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            media_source_id: 1234,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'WBNS-FM',
            station_call_sign: 'WBNS',
            station_band: 'FM'
          }
        ],
        false
      );
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: [
            {
              spotStatus: 'Reconciled',
              channelInt: '4',
              orderProductDescription: 'Radio Promo/ PSA',
              spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spotType: 'Normal',
              invoiceIsciCode: 'ZNGB9052',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              materialDescription: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              rate: '0.0000',
              startTime: '102458000',
              trafficStationInt: '4',
              spotLength: '30000',
              intendedAirDate: '2020-03-04'
            },
            {
              spotStatus: 'Reconciled',
              channelInt: '4',
              orderProductDescription: 'Radio Promo/ PSA',
              spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spotType: 'Normal',
              invoiceIsciCode: 'ZNGB9052',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              materialDescription: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              rate: '0.0000',
              startTime: '102458000',
              trafficStationInt: '4',
              spotLength: '30000',
              intendedAirDate: '2020-03-04'
            }
          ]
        }
      };
      const res = await adapter.createEvents(
        'c8444503-1dff-4ee4-a906-4341a6d2296d',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.an('array');
      chaiExpect(res.length).to.equal(1);
    });

    it('should filter duplicate playout data', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            media_source_id: 1234,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'WBNS-FM',
            station_call_sign: 'WBNS',
            station_band: 'FM'
          }
        ],
        false
      );
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: [
            {
              spotStatus: 'Reconciled',
              channelInt: '4',
              orderProductDescription: 'Radio Promo/ PSA',
              spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spotType: 'Normal',
              endDateTime: '2020-03-05T04:28:08',
              invoiceIsciCode: 'ZNGB9052',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              materialDescription: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              startDateTime: '2020-03-05T04:27:38',
              rate: '0.0000',
              startTime: '102458000',
              trafficStationInt: '4',
              spotLength: '30000',
              intendedAirDate: '2020-03-04'
            },
            {
              spotStatus: 'Reconciled',
              channelInt: '4',
              orderProductDescription: 'Radio Promo/ PSA',
              spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spotType: 'Normal',
              endDateTime: '2020-03-05T04:28:08',
              invoiceIsciCode: 'ZNGB9052',
              advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              materialDescription: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              startDateTime: '2020-03-05T04:27:38',
              rate: '0.0000',
              startTime: '102458000',
              trafficStationInt: '4',
              spotLength: '30000',
              intendedAirDate: '2020-03-04'
            }
          ]
        }
      };
      const res = await adapter.createEvents(
        'c8444503-1dff-4ee4-a906-4341a6d2296d',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.an('array');
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].adId).to.equal(req.body.data[0].invoiceIsciCode);
      chaiExpect(res[0].stationCallLetters).to.equal('WBNS');
      chaiExpect(res[0].stationBand).to.equal('FM');
      chaiExpect(res[0].advertiserName).to.not.equal(
        req.body.data[0].advertiserId
      );
      chaiExpect(res[0].advertiserName).to.equal('Blue Buffalo');
      chaiExpect(res[0].batchId).to.exist;
    });

    it('should handle duplicate WideOrbit Station ID', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            media_source_id: 1234,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'WBNS-FM',
            station_call_sign: 'WBNS',
            station_band: 'FM'
          },
          {
            media_source_id: 2345,
            live_timezone: 'America/Los_Angeles',
            radio_station_code: 'KLVEF-FM',
            station_call_sign: 'KLVEF',
            station_band: 'FM'
          }
        ],
        false
      );
      const req = {
        context: {
          tokenInfo: {
            organization: { organizationId: 1234 }
          }
        },
        body: {
          data: [
            {
              spot_status: 'Reconciled',
              channel_int: '4',
              channel_name: 'WBNS-FM',
              order_product_description: 'Radio Promo/ PSA',
              spot_id: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spot_type: 'Normal',
              end_date_time: '2020-03-05T04:28:08',
              invoice_isci_code: 'ZNGB9052',
              advertiser_id: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              material_description: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              start_date_time: '2020-03-05T04:27:38',
              rate: '0.0000',
              start_time: '102458000',
              traffic_station_int: '4',
              spot_length: '30000',
              intended_air_date: '2020-03-04'
            },
            {
              spot_status: 'Reconciled',
              channel_int: '4',
              channel_name: 'KLVEF',
              order_product_description: 'Radio Promo/ PSA',
              spot_id: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
              spot_type: 'Normal',
              end_date_time: '2020-03-05T04:28:08',
              invoice_isci_code: 'ZNGB9052',
              advertiser_id: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
              material_description: "OH. ARMY NAT'L GUARD ",
              market: 'Columbus Radio',
              start_date_time: '2020-03-05T04:27:38',
              rate: '0.0000',
              startTime: '102458000',
              traffic_station_int: '4',
              spot_length: '30000',
              intended_air_date: '2020-03-04'
            }
          ]
        }
      };
      const res = await adapter.createEvents(
        'c8444503-1dff-4ee4-a906-4341a6d2296d',
        req
      );
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.an('array');
      chaiExpect(res.length).to.equal(2);
      chaiExpect(res[0].adId).to.equal(req.body.data[0].invoice_isci_code);
      chaiExpect(res[0].stationCallLetters).to.equal('WBNS');
      chaiExpect(res[0].stationBand).to.equal('FM');
      chaiExpect(res[0].advertiserName).to.not.equal(
        req.body.data[0].advertiserId
      );
      chaiExpect(res[0].advertiserName).to.equal('Blue Buffalo');
      chaiExpect(res[0].batchId).to.exist;

      chaiExpect(res[1].adId).to.equal(req.body.data[1].invoice_isci_code);
      chaiExpect(res[1].stationCallLetters).to.equal('KLVEF');
      chaiExpect(res[1].stationBand).to.equal('FM');
      chaiExpect(res[1].advertiserName).to.not.equal(
        req.body.data[1].advertiserId
      );
      chaiExpect(res[1].advertiserName).to.equal('Blue Buffalo');
      chaiExpect(res[1].batchId).to.exist;
    });

    it('should handle payload with error message', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      const req = {
        body: {
          errorMessage: 'test'
        }
      };
      const res = await adapter.createEvents('abc123', req);
      chaiExpect(res).to.exist;
      chaiExpect(res).to.eql([]);
    });

    it('should throw error on body without data', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      const req = { body: {} };
      let err;
      try {
        await adapter.createEvents('abc123', req);
      } catch (e) {
        err = e;
      }
      chaiExpect(err.message).to.equal('Invalid json without data.');
    });

    it('should throw error on invalid body', async function () {
      const adapter = require('./wideOrbit')(serviceContext);
      const req = {
        body: {
          data: '{test}'
        }
      };
      let err;
      try {
        await adapter.createEvents('abc123', req);
      } catch (e) {
        err = e;
      }
      chaiExpect(err.message).to.match(/Invalid json for data/);
    });
  });
});
