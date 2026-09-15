const helpers = require('./helpers/index');

const config = helpers.config;
const env = config.env;
const moment = require('moment');
const _ = require('lodash');



describe('Wide Orbit SDO adapter test', () => {
  

  const advertiserRegistryId = 'd3badf83-942d-445c-aae8-0f04ea903a72';
  const stationPlayoutRegistryId = 'c8444503-1dff-4ee4-a906-4341a6d2296d';
  const options = helpers.requestOptions(config.apiToken);
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;

  console.log('URL:  ' + url);

  it('should handle advertiser registry payload', async () => {
    let ingestionOptions;

    const query = `query {
      dataRegistry(id: "${advertiserRegistryId}") {
        name
        ingestionToken
      }
    }`;

    let response = await chakram.post(url, { query: query }, options);
    const ingestionToken = _.get(
      response,
      'body.data.dataRegistry.ingestionToken'
    );
    ingestionOptions = helpers.requestOptions(ingestionToken);

    const body = {
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
    };
    response = await chakram.post(
      config.structured_data_url,
      body,
      ingestionOptions
    );
    
    expect(_.get(response, 'body')).to.be.an('array');
    expect(_.get(response, 'body').length).toEqual(1);
    expect(_.get(response, 'body[0].id')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
      '3342a572-3e7c-4793-9cde-46d415ad7a2d'
    );
    expect(_.get(response, 'body[0].data')).toBeDefined();
    expect(_.get(response, 'body[0].data.id')).toBeDefined();
  });

  it('should handle single playout data request', async () => {
    const query = `query {
      dataRegistry(id: "${stationPlayoutRegistryId}") {
        name
        ingestionToken
      }
    }`;

    let response = await chakram.post(url, { query: query }, options);
    const ingestionToken = _.get(
      response,
      'body.data.dataRegistry.ingestionToken'
    );
    const ingestionOptions = helpers.requestOptions(ingestionToken);

    const body = {
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
        startTime: '72000000',
        intendedAirDate: moment().format('YYYY-MM-DD'),
        trafficStationInt: '4',
        spotLength: '30000'
      }
    };

    response = await chakram.post(
      config.structured_data_url,
      body,
      ingestionOptions
    );
    
    expect(_.get(response, 'body')).to.be.an('array');
    expect(_.get(response, 'body').length).toEqual(1);
    expect(_.get(response, 'body[0].id')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
      '1f2f7561-f067-4c08-948d-4f9827451fa6'
    );
    expect(_.get(response, 'body[0].data')).toBeDefined();
    expect(_.get(response, 'body[0].data.id')).toBeDefined();
    expect(_.get(response, 'body[0].data.advertiserId')).toEqual(
      body.data.materialDescription
    );
    expect(_.get(response, 'body[0].data.market')).toEqual(body.data.market);
    expect(_.get(response, 'body[0].data.text')).toEqual(
      body.data.orderProductDescription
    );

    const sdt = moment(_.get(response, 'body[0].data.startDateTime'));
    const edt = moment(_.get(response, 'body[0].data.endDateTime'));
    const duration = moment.duration(edt.diff(sdt)).as('seconds');
    expect(duration).toEqual(30);
    expect(_.get(response, 'body[0].data.batchId')).toBeDefined();
  });

  it('should handle playout data with 0s duration', async () => {
    const query = `query {
      dataRegistry(id: "${stationPlayoutRegistryId}") {
        name
        ingestionToken
      }
    }`;

    let response = await chakram.post(url, { query: query }, options);
    const ingestionToken = _.get(
      response,
      'body.data.dataRegistry.ingestionToken'
    );
    const ingestionOptions = helpers.requestOptions(ingestionToken);

    const body = {
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
        startTime: '72000000',
        intendedAirDate: moment().format('YYYY-MM-DD'),
        trafficStationInt: '4',
        spotLength: '0'
      }
    };

    response = await chakram.post(
      config.structured_data_url,
      body,
      ingestionOptions
    );
    
    expect(_.get(response, 'body')).to.be.an('array');
    expect(_.get(response, 'body').length).toEqual(1);
    expect(_.get(response, 'body[0].id')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
      '1f2f7561-f067-4c08-948d-4f9827451fa6'
    );
    expect(_.get(response, 'body[0].data')).toBeDefined();
    expect(_.get(response, 'body[0].data.id')).toBeDefined();
    expect(_.get(response, 'body[0].data.advertiserId')).toEqual(
      body.data.materialDescription
    );
    expect(_.get(response, 'body[0].data.market')).toEqual(body.data.market);
    expect(_.get(response, 'body[0].data.text')).toEqual(
      body.data.orderProductDescription
    );
    expect(_.get(response, 'body[0].data.batchId')).toBeDefined();

    const sdt = moment(_.get(response, 'body[0].data.startDateTime'));
    const edt = moment(_.get(response, 'body[0].data.endDateTime'));
    const duration = moment.duration(edt.diff(sdt)).as('seconds');
    expect(duration).toEqual(0);
  });

  it('should use provided advertiser name', async () => {
    const query = `query {
      dataRegistry(id: "${stationPlayoutRegistryId}") {
        name
        ingestionToken
      }
    }`;

    let response = await chakram.post(url, { query: query }, options);
    const ingestionToken = _.get(
      response,
      'body.data.dataRegistry.ingestionToken'
    );
    const ingestionOptions = helpers.requestOptions(ingestionToken);

    const body = {
      data: {
        spotStatus: 'Reconciled',
        channelInt: '4',
        orderProductDescription: 'Radio Promo/ PSA',
        spotId: 'e50d2736-6c36-403f-a73d-cf9a45f65ca7',
        spotType: 'Normal',
        invoiceIsciCode: 'ZNGB9052',
        advertiserId: '1234',
        advertiserName: 'Test Advertiser',
        market: 'Columbus Radio',
        rate: '0.0000',
        startTime: '72000000',
        intendedAirDate: moment().format('YYYY-MM-DD'),
        trafficStationInt: '4',
        spotLength: '0'
      }
    };

    response = await chakram.post(
      config.structured_data_url,
      body,
      ingestionOptions
    );
    
    expect(_.get(response, 'body')).to.be.an('array');
    expect(_.get(response, 'body').length).toEqual(1);
    expect(_.get(response, 'body[0].id')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
      '1f2f7561-f067-4c08-948d-4f9827451fa6'
    );
    expect(_.get(response, 'body[0].data')).toBeDefined();
    expect(_.get(response, 'body[0].data.id')).toBeDefined();
    expect(_.get(response, 'body[0].data.advertiserId')).toEqual(
      body.data.advertiserId
    );
    expect(_.get(response, 'body[0].data.advertiserName')).toEqual(
      body.data.advertiserName
    );
    expect(_.get(response, 'body[0].data.market')).toEqual(body.data.market);
    expect(_.get(response, 'body[0].data.text')).toEqual(
      body.data.orderProductDescription
    );
    expect(_.get(response, 'body[0].data.batchId')).toBeDefined();

    const sdt = moment(_.get(response, 'body[0].data.startDateTime'));
    const edt = moment(_.get(response, 'body[0].data.endDateTime'));
    const duration = moment.duration(edt.diff(sdt)).as('seconds');
    expect(duration).toEqual(0);
  });

  it('should handle multiple playout data request', async () => {
    const query = `query {
      dataRegistry(id: "${stationPlayoutRegistryId}") {
        name
        ingestionToken
      }
    }`;

    let response = await chakram.post(url, { query: query }, options);
    const ingestionToken = _.get(
      response,
      'body.data.dataRegistry.ingestionToken'
    );
    const ingestionOptions = helpers.requestOptions(ingestionToken);

    const body = {
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
          intendedAirDate: moment().format('YYYY-MM-DD'),
          trafficStationInt: '4',
          spotLength: '30000'
        },
        {
          spotStatus: 'Reconciled',
          channelInt: '4',
          orderProductDescription: 'Radio Promo/ PSA',
          spotId: '4a60f43f-777d-478d-8db0-3f679b743cb0',
          spotType: 'Normal',
          invoiceIsciCode: 'ZNGB9052',
          advertiserId: 'df3bd346-7fdf-450a-8930-dc7b59db286f',
          materialDescription: "OH. ARMY NAT'L GUARD ",
          market: 'Columbus Radio',
          rate: '5.0000',
          startTime: '102458000',
          intendedAirDate: moment().format('YYYY-MM-DD'),
          trafficStationInt: '4',
          spotLength: '40000'
        }
      ]
    };

    response = await chakram.post(
      config.structured_data_url,
      body,
      ingestionOptions
    );
    
    expect(_.get(response, 'body')).to.be.an('array');
    expect(_.get(response, 'body').length).toEqual(2);
    expect(_.get(response, 'body[0].id')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
      '1f2f7561-f067-4c08-948d-4f9827451fa6'
    );
    expect(_.get(response, 'body[0].data')).toBeDefined();
    expect(_.get(response, 'body[0].data.id')).toBeDefined();

    expect(_.get(response, 'body[0].data.advertiserId')).toEqual(
      body.data[0].materialDescription
    );
    expect(_.get(response, 'body[0].data.market')).toEqual(
      body.data[0].market
    );
    expect(_.get(response, 'body[0].data.text')).toEqual(
      body.data[0].orderProductDescription
    );
    expect(_.get(response, 'body[1].data.advertiserId')).toEqual(
      body.data[1].materialDescription
    );
    expect(_.get(response, 'body[1].data.market')).toEqual(
      body.data[1].market
    );
    expect(_.get(response, 'body[1].data.text')).toEqual(
      body.data[1].orderProductDescription
    );
    expect(_.get(response, 'body[0].data.batchId')).toBeDefined();
    expect(_.get(response, 'body[1].data.batchId')).toBeDefined();

    let sdt = moment(_.get(response, 'body[0].data.startDateTime'));
    let edt = moment(_.get(response, 'body[0].data.endDateTime'));
    let duration = moment.duration(edt.diff(sdt)).as('seconds');
    expect(duration).toEqual(30);

    sdt = moment(_.get(response, 'body[1].data.startDateTime'));
    edt = moment(_.get(response, 'body[1].data.endDateTime'));
    duration = moment.duration(edt.diff(sdt)).as('seconds');
    expect(duration).toEqual(40);
  });

  it('should handle single playout data string request', async () => {
    const query = `query {
      dataRegistry(id: "${stationPlayoutRegistryId}") {
        name
        ingestionToken
      }
    }`;

    let response = await chakram.post(url, { query: query }, options);
    const ingestionToken = _.get(
      response,
      'body.data.dataRegistry.ingestionToken'
    );
    const ingestionOptions = helpers.requestOptions(ingestionToken);

    const body = {
      data: `{"spotStatus":"Reconciled","channelInt":"4","orderProductDescription":"Radio Promo/ PSA","spotId":"e50d2736-6c36-403f-a73d-cf9a45f65ca7","spotType":"Normal","endDateTime":"2020-03-05T04:28:08","invoiceIsciCode":"ZNGB9052","advertiserId":"df3bd346-7fdf-450a-8930-dc7b59db286f","materialDescription":"OH. ARMY NAT'L GUARD ","market":"Columbus Radio","startDateTime":"2020-03-05T04:27:38","rate":"0.0000","startTime":"102458000","intendedAirDate":"2020-03-04","trafficStationInt":"4","spotLength":"30000"}`
    };

    response = await chakram.post(
      config.structured_data_url,
      body,
      ingestionOptions
    );
    
    expect(_.get(response, 'body')).to.be.an('array');
    expect(_.get(response, 'body').length).toEqual(1);
    expect(_.get(response, 'body[0].id')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
    expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
      '1f2f7561-f067-4c08-948d-4f9827451fa6'
    );
    expect(_.get(response, 'body[0].data')).toBeDefined();
    expect(_.get(response, 'body[0].data.id')).toBeDefined();
    expect(_.get(response, 'body[0].data.batchId')).toBeDefined();
  });

  it(
    'should handle multiple playout data as string request',
    async () => {
      const query = `query {
        dataRegistry(id: "${stationPlayoutRegistryId}") {
          name
          ingestionToken
        }
      }`;

      let response = await chakram.post(url, { query: query }, options);
      const ingestionToken = _.get(
        response,
        'body.data.dataRegistry.ingestionToken'
      );
      const ingestionOptions = helpers.requestOptions(ingestionToken);

      const body = {
        data: `[{"spotStatus":"Reconciled","channelInt":"4","orderProductDescription":"Radio Promo/ PSA","spotId":"e50d2736-6c36-403f-a73d-cf9a45f65ca7","spotType":"Normal","endDateTime":"2020-03-05T04:28:08","invoiceIsciCode":"ZNGB9052","advertiserId":"df3bd346-7fdf-450a-8930-dc7b59db286f","materialDescription":"OH. ARMY NAT'L GUARD ","market":"Columbus Radio","startDateTime":"2020-03-05T04:27:38","rate":"0.0000","startTime":"102458000","intendedAirDate":"2020-03-04","trafficStationInt":"4","spotLength":"30000"},{"spotStatus":"Reconciled","channelInt":"4","orderProductDescription":"Radio Promo/ PSA","spotId":"4a60f43f-777d-478d-8db0-3f679b743cb0","spotType":"Normal","endDateTime":"2020-03-05T05:28:08","invoiceIsciCode":"ZNGB9052","advertiserId":"df3bd346-7fdf-450a-8930-dc7b59db286f","materialDescription":"OH. ARMY NAT'L GUARD ","market":"Columbus Radio","startDateTime":"2020-03-05T05:27:38","rate":"5.0000","startTime":"102458000","intendedAirDate":"2020-03-04","trafficStationInt":"4","spotLength":"30000"}]`
      };

      response = await chakram.post(
        config.structured_data_url,
        body,
        ingestionOptions
      );
      
      expect(_.get(response, 'body')).to.be.an('array');
      expect(_.get(response, 'body').length).toEqual(2);
      expect(_.get(response, 'body[0].id')).toBeDefined();
      expect(_.get(response, 'body[0].dataRegistryId')).toBeDefined();
      expect(_.get(response, 'body[0].dataRegistryId')).toEqual(
        '1f2f7561-f067-4c08-948d-4f9827451fa6'
      );
      expect(_.get(response, 'body[0].data')).toBeDefined();
      expect(_.get(response, 'body[0].data.id')).toBeDefined();
      expect(_.get(response, 'body[0].data.batchId')).toBeDefined();
    }
  );
});
