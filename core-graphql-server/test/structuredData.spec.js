const Validator = require('../modules/structureddata/model/validator');
const config = require('../server.json');

let validator = null;

beforeAll((done) => {
  validator = new Validator({ logger: console, config: config });
  done();
});

describe('Structured data - Validation check geo & date types', function () {
  const schema = JSON.parse(
    '{"$id":"http://example.com/example.json","type":"object","$schema":"http://json-schema.org/draft-07/schema#","properties":{"humidity":{"$id":"/properties/humidity","type":"integer"},"pressure":{"$id":"/properties/pressure","type":"integer"},"windSpeed":{"$id":"/properties/windSpeed","type":"number"},"visibility":{"$id":"/properties/visibility","type":"integer"},"windDegree":{"$id":"/properties/windDegree","type":"number"},"datetimeEnd":{"$id":"/properties/datetimeEnd","type":"dateTime"},"geoLocation":{"$id":"/properties/geoLocation","type":"geoPoint"},"temperature":{"$id":"/properties/temperature","type":"number"},"locationName":{"$id":"/properties/locationName","type":"string"},"datetimeStart":{"$id":"/properties/datetimeStart","type":"dateTime"},"temperatureMax":{"$id":"/properties/temperatureMax","type":"number"},"temperatureMin":{"$id":"/properties/temperatureMin","type":"integer"}},"definitions":{}}'
  );
  it('Happy path', () => {
    const data = JSON.parse(
      '{"geoLocation":"41.12,-71.34","temperature":58,"pressure":1019,"humidity":58,"temperatureMin":55,"temperatureMax":60.8,"visibility":16093,"windSpeed":2.08,"windDegree":195.502,"datetimeStart":"2018-02-22T03:00:00.000Z","datetimeEnd":"2018-02-22T03:00:00.000Z","locationName":"Los Angeles"}'
    );
    validator.validateData(data, schema, (errors, passed) => {
      expect(passed).toEqual(true);
    });
  });
  it('Unhappy path', () => {
    const dataGeo = JSON.parse(
      '{"geoLocation":"180.12,-271.34","temperature":58,"pressure":1019,"humidity":58,"temperatureMin":55,"temperatureMax":60.8,"visibility":16093,"windSpeed":2.08,"windDegree":195.502,"datetimeStart":"2018-03-01T25:00:00.000Z","datetimeEnd":"2018-14-01T18:00:00.000Z","locationName":"Los Angeles"}'
    );
    const dataDates = JSON.parse(
      '{"geoLocation":"41.12,-71.34","temperature":58,"pressure":1019,"humidity":58,"temperatureMin":55,"temperatureMax":60.8,"visibility":16093,"windSpeed":2.08,"windDegree":195.502,"datetimeStart":"2018-13-01T14:00:00.000Z","datetimeEnd":"2018-11-01T18:00:00.000Z","locationName":"Los Angeles"}'
    );
    expect(function check() { validator.validateData(dataGeo, schema)}).toThrow();
    expect(function check() { validator.validateData(dataGdataDateseo, schema)}).toThrow();
  });
});
