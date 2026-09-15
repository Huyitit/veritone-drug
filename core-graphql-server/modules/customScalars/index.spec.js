const _ = require('lodash');
const moment = require('moment');
const serviceContext = require('../../test/serviceContext.mock.js')();
const Kind = require('graphql/language').Kind;

let mod, now, nowStr;

describe('index.js', function () {
  beforeAll(() => {
    mod = require('./index.js')(serviceContext);
    now = moment();
    nowStr = now.toISOString();
  });
  describe('#require()', function () {
    it('should load module', function () {
      expect(typeof mod).toEqual('object');
      expect(Object.keys(mod).length).toEqual(2);
      expect(typeof mod.typeDefs).toEqual('object');
      expect(Object.keys(mod.typeDefs).length).toEqual(1);
      expect(typeof mod.resolvers).toEqual('object');
      expect(Object.keys(mod.resolvers).length).toEqual(5);
      expect(typeof mod.resolvers.Time).toEqual('object');
      expect(typeof mod.resolvers.DateTime).toEqual('object');
      expect(typeof mod.resolvers.JSONData).toEqual('object');
      expect(typeof mod.resolvers.UploadedFile).toEqual('object');
    });
  });
  describe('#DateTime.parseLiteral', function () {
    it('should parse string', function () {
      const obj = {
        kind: Kind.STRING,
        value: nowStr
      };
      expect(mod.resolvers.DateTime.parseLiteral(obj)).toEqual(
        now.unix() * 1000
      );
    });
    it('should parse seconds', function () {
      const obj = {
        kind: Kind.INT,
        value: now.unix()
      };
      expect(mod.resolvers.DateTime.parseLiteral(obj)).toEqual(
        now.unix() * 1000
      );
    });
    it('should parse millis', function () {
      const obj = {
        kind: Kind.INT,
        value: now.valueOf()
      };
      expect(mod.resolvers.DateTime.parseLiteral(obj)).toEqual(now.valueOf());
    });
  });
  describe('#DateTime.serialize', function () {
    it('should serialize number', function () {
      expect(mod.resolvers.DateTime.serialize(now.valueOf())).toEqual(nowStr);
    });
    it('should serialize string', function () {
      expect(mod.resolvers.DateTime.serialize(nowStr)).toEqual(nowStr);
    });
  });
  describe('#DateTime.parseValue', function () {
    it('should parse a date value', function () {
      expect(mod.resolvers.DateTime.parseValue(nowStr)).toEqual(nowStr);
    });
    it('should convert sec', function () {
      expect(mod.resolvers.DateTime.parseValue(now.unix())).toEqual(
        now.unix() * 1000
      );
    });
    it('should handle timestamp', function () {
      expect(mod.resolvers.DateTime.parseValue(now.valueOf())).toEqual(
        now.valueOf()
      );
    });
  });
  describe('#UploadedFile', function () {
    it('should return input for serialize', function () {
      expect(mod.resolvers.UploadedFile.__serialize('foo')).toEqual('foo');
      expect(mod.resolvers.UploadedFile.__serialize(27)).toEqual(27);
      expect(mod.resolvers.UploadedFile.__serialize(null)).toEqual(null);
    });
    it('should return input for parseValue', function () {
      expect(mod.resolvers.UploadedFile.__parseValue('foo')).toEqual('foo');
      expect(mod.resolvers.UploadedFile.__parseValue(27)).toEqual(27);
      expect(mod.resolvers.UploadedFile.__parseValue(null)).toEqual(null);
    });
  });
  /* TODO WIP
  describe('#TimeparseValue', function() {
    it('should parse string', function() {
      const res = mod.resolvers.Time.parseValue('12:00');
      expect(typeof res).toEqual('object');
      expect(res.time).toEqual('12:00');
      expect(res.timeUTC).toEqual('12:00');
      console.log(JSON.stringify(res,null,2));
    });
    it('should parse string with tz', function() {
      expect(mod.resolvers.Time.parseValue('12:00+01:00')).toEqual('12:00');
    });

  });
  */

  describe('#BigInt.parseLiteral', function () {
    it('should parse bigint', function () {
      const obj = {
        kind: Kind.INT,
        value: '10000000000'
      };
      const bInt = new mod.resolvers.BigInt();
      expect(bInt.parseLiteral(obj)).toEqual(10000000000);
    });
  });
});
