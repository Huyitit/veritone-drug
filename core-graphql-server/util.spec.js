const { makeExecutableSchema } = require('graphql-tools');
const validator = require('validator');

const util = require('./util.js')({});
const _ = require('lodash');
const fs = require('fs');
const LocalTime = require('js-joda').LocalTime;
const moment = require('moment-timezone');

const sampleJwtJson = `
{
  "authTokenType": "jwt",
  "jwtToken": {
    "scope": [
      {
        "actions": [
          "asset:uri",
          "recording:read",
          "recording:update"
        ],
        "resources": {
          "recordingIds": [
            "400002405"
          ]
        }
      },
      {
        "actions": [
          "task:update",
          "task:event"
        ],
        "resources": {
          "jobIds": [
            "d79f0abf-cd3d-45e6-9706-6e1289177e54"
          ],
          "taskIds": [
            "d79f0abf-cd3d-45e6-9706-6e1289177e54-7c95ceac-0a5d-4204-9538-e454debefa37"
          ]
        }
      }
    ],
    "iat": 1515626354,
    "exp": 1516231154,
    "sub": "engine-run",
    "jti": "45b020f6-8266-43c7-b386-799cdceb1e74"
  },
  "authenticationOption": "optional",
  "authToken": "Ao",
  "tokenInfo": {
    "json": {
      "tokenLabel": "auth2 generated",
      "rights": [
        "asset:uri",
        "recording:read",
        "recording:update",
        "task:update",
        "task:event"
      ],
      "isRevoked": false
    }
  }
}
`;

const sampleField = JSON.parse(`
{
  "type": "Asset",
  "description": "Create a media asset. Optionally, upload content using multipart form POST.",
  "args": [
    {
      "name": "input",
      "description": "Fields needed to create an asset.",
      "type": "CreateAsset!",
      "astNode": {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "input",
          "loc": {
            "start": 19543,
            "end": 19548
          }
        },
        "type": {
          "kind": "NonNullType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": "CreateAsset",
              "loc": {
                "start": 19550,
                "end": 19561
              }
            },
            "loc": {
              "start": 19550,
              "end": 19561
            }
          },
          "loc": {
            "start": 19550,
            "end": 19562
          }
        },
        "defaultValue": null,
        "directives": [],
        "loc": {
          "start": 19543,
          "end": 19562
        }
      }
    }
  ],
  "astNode": {
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": "createAsset",
      "loc": {
        "start": 19486,
        "end": 19497
      }
    },
    "arguments": [
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "input",
          "loc": {
            "start": 19543,
            "end": 19548
          }
        },
        "type": {
          "kind": "NonNullType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": "CreateAsset",
              "loc": {
                "start": 19550,
                "end": 19561
              }
            },
            "loc": {
              "start": 19550,
              "end": 19561
            }
          },
          "loc": {
            "start": 19550,
            "end": 19562
          }
        },
        "defaultValue": null,
        "directives": [],
        "loc": {
          "start": 19543,
          "end": 19562
        }
      }
    ],
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Asset",
        "loc": {
          "start": 19568,
          "end": 19573
        }
      },
      "loc": {
        "start": 19568,
        "end": 19573
      }
    },
    "directives": [
      {
        "kind": "Directive",
        "name": {
          "kind": "Name",
          "value": "scopes",
          "loc": {
            "start": 19577,
            "end": 19583
          }
        },
        "arguments": [
          {
            "kind": "Argument",
            "name": {
              "kind": "Name",
              "value": "scopes",
              "loc": {
                "start": 19584,
                "end": 19590
              }
            },
            "value": {
              "kind": "ListValue",
              "values": [
                {
                  "kind": "StringValue",
                  "value": "recording.update",
                  "loc": {
                    "start": 19593,
                    "end": 19611
                  }
                }
              ],
              "loc": {
                "start": 19592,
                "end": 19612
              }
            },
            "loc": {
              "start": 19584,
              "end": 19612
            }
          }
        ],
        "loc": {
          "start": 19576,
          "end": 19613
        }
      },
      {
        "kind": "Directive",
        "name": {
          "kind": "Name",
          "value": "auth",
          "loc": {
            "start": 19617,
            "end": 19621
          }
        },
        "arguments": [
          {
            "kind": "Argument",
            "name": {
              "kind": "Name",
              "value": "allowOrgless",
              "loc": {
                "start": 19622,
                "end": 19634
              }
            },
            "value": {
              "kind": "BooleanValue",
              "value": true,
              "loc": {
                "start": 19636,
                "end": 19640
              }
            },
            "loc": {
              "start": 19622,
              "end": 19640
            }
          },
          {
            "kind": "Argument",
            "name": {
              "kind": "Name",
              "value": "objectAuthType",
              "loc": {
                "start": 19642,
                "end": 19656
              }
            },
            "value": {
              "kind": "EnumValue",
              "value": "TemporalDataObject",
              "loc": {
                "start": 19658,
                "end": 19676
              }
            },
            "loc": {
              "start": 19642,
              "end": 19676
            }
          },
          {
            "kind": "Argument",
            "name": {
              "kind": "Name",
              "value": "objectAuthIdParam",
              "loc": {
                "start": 19689,
                "end": 19706
              }
            },
            "value": {
              "kind": "StringValue",
              "value": "input.parentId",
              "loc": {
                "start": 19708,
                "end": 19724
              }
            },
            "loc": {
              "start": 19689,
              "end": 19724
            }
          }
        ],
        "loc": {
          "start": 19616,
          "end": 19725
        }
      }
    ],
    "loc": {
      "start": 19486,
      "end": 19725
    }
  },
  "isDeprecated": false,
  "name": "createAsset"
}
`);

const sampleTypeDefs = `
    type Foo {
      id: ID!
    }

    type Asset {
      id: ID!
    }

    type Mutation {
      createFoo(input: CreateFoo!, topId: ID): Foo
      createAsset(input: CreateAsset): Asset
    }

    type Query {
      foo(id: ID!): Foo
    }

    input CreateFoo {
      id: ID!
      status: String
    }

    input CreateAsset {
      parentId: ID!
      id: ID!
    }
  `;

const schema = makeExecutableSchema({
  typeDefs: sampleTypeDefs,
  resolvers: {}
});

describe('util', function () {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('#setPermissionIdToKeyMap()', function () {
    it('should set up map correctly', function () {
      const map = util.getPermissionIdToKeyMap();

      expect(map).toExist;
      expect(map['102']).toEqual('developer.engine.create');
      expect(map['10034']).toBeUndefined();
    });
  });

  describe('#listRights()', function () {
    it('should return rights strings', function () {
      const rights = util.listRights({
        permissionMasks: [-2, 536870911, 1073742335, 8335347]
      });
      expect(rights).toContain('veritone.superadmin');
    });

    it('should return all rights strings that fall under the same bit mask', function () {
      const rights = util.listRights({
        permissionMasks: [1006632960] // 26,27,28,29 - job rights
      });
      expect(rights.length).toEqual(4 * 3); // 4 rights * 3 key variants
      // 26
      expect(rights).toContain('job.create');
      expect(rights).toContain('aiware.job.create');
      expect(rights).toContain('cms.job.create');
      // 27
      expect(rights).toContain('job.read');
      expect(rights).toContain('aiware.job.read');
      expect(rights).toContain('cms.job.read');
      // 28
      expect(rights).toContain('job.update');
      expect(rights).toContain('aiware.job.update');
      expect(rights).toContain('cms.job.update');
      // 29
      expect(rights).toContain('job.delete');
      expect(rights).toContain('aiware.job.delete');
      expect(rights).toContain('cms.job.delete');
    });
  });

  describe('#listResources()', function () {
    it('should return resources', function () {
      const authInfo = JSON.parse(sampleJwtJson);
      const res = util.listResources(authInfo);
      expect(res).toExist;
      expect(_.get(res, 'TemporalDataObject[0]')).toEqual('400002405');
      expect(_.get(res, 'Task[0]')).toEqual(
        'd79f0abf-cd3d-45e6-9706-6e1289177e54-7c95ceac-0a5d-4204-9538-e454debefa37'
      );
      expect(_.get(res, 'Job[0]')).toEqual(
        'd79f0abf-cd3d-45e6-9706-6e1289177e54'
      );
    });
  });

  describe('#getResourceIdsForType()', function () {
    it('should return resource IDs', function () {
      const authInfo = JSON.parse(sampleJwtJson);
      const res = util.listResources(authInfo);
      expect(res).toExist;
    });
  });

  describe('#graphQLFieldHasParam()', function () {
    it('should detect positive matches', function () {
      expect(util.graphQLFieldHasParam(schema, sampleField, 'input')).toEqual(
        true
      );
      expect(
        util.graphQLFieldHasParam(schema, sampleField, 'input.id')
      ).toEqual(true);
    });
    it('should not match negatives', function () {
      expect(
        util.graphQLFieldHasParam(schema, sampleField, 'input.foo')
      ).toEqual(false);
      expect(util.graphQLFieldHasParam(schema, sampleField, 'foo.bar')).toEqual(
        false
      );
      expect(util.graphQLFieldHasParam(schema, sampleField, 'foobar')).toEqual(
        false
      );
    });
  });

  const sampleFieldParams = {
    input: {
      id: 'testid',
      status: 'teststatus'
    },
    topId: 'testTopId'
  };

  describe('#getGraphQLFieldParamValue', function () {
    it('should get value if it exists', function () {
      expect(
        util.getGraphQLFieldParamValue(sampleFieldParams, 'input.id')
      ).toEqual('testid');
      expect(
        util.getGraphQLFieldParamValue(sampleFieldParams, 'topId')
      ).toEqual('testTopId');
      expect(util.getGraphQLFieldParamValue(sampleFieldParams, 'input'))
        .toExist;
    });
    it('should get nothing if no value exists', function () {
      expect(util.getGraphQLFieldParamValue(sampleFieldParams, 'id'))
        .toBeUndefined;
      expect(util.getGraphQLFieldParamValue(sampleFieldParams, 'input.foo'))
        .toBeUndefined;
    });
  });

  describe('#getTimeZoneName', function () {
    it('should get time zone from name', function () {
      expect(util.getTimeZoneName('America/Los_Angeles')).toEqual(
        'America/Los_Angeles'
      );
    });
    it('should get time zone from abbrev', function () {
      expect(util.getTimeZoneName('PST')).toExist;
    });
    it('should get time zone from offset', function () {
      //expect(util.getTimeZoneName('-0800')).toExist;
    });
    it('should not get time zone from bad string', function () {
      expect(util.getTimeZoneName('ZYZ')).toEqual(null);
      expect(util.getTimeZoneName('Nowhere/not_time_zone')).toEqual(null);
      expect(util.getTimeZoneName(null)).toEqual(null);
    });
  });

  describe('#makeInsertSql', function () {
    it('should generate an insert sql statement', function () {
      const res = util.makeInsertSql(
        'engine',
        { name: 'foo', active: true },
        { name: 'engine_name', active: null }
      );

      expect(res.values).toEqual(['foo', true]);
    });
    it('should generate an insert sql statement for multiple rows', function () {
      const res = util.makeInsertSql(
        'engine',
        [
          { name: 'foo', active: true },
          { name: 'bar', active: false }
        ],
        { name: 'engine_name', active: null }
      );

      expect(res.values).toEqual(['foo', true, 'bar', false]);
      expect(res.sql).toContain('name, active');
      expect(res.sql).toContain('($1, $2),');
      expect(res.sql).toContain('($3, $4)');
      expect(res.sql).toContain('name AS engine_name');
    });
  });

  describe('#makeUpdateSql', function () {
    it('should make an update SQL statement', function () {
      const res = util.makeUpdateSql(
        'engine', // table
        { name: 'foo', active: true, data: '{"key":"val"}' }, // columns
        { name: 'engine_name', active: null }, // return mapping
        `engine_name = "whatever"`, // where clause
        2, // value index
        false, // include nulls
        {}, // include nulls map
        { data: '::JSONB' } // cast map
      );

      expect(res.values).toEqual(['foo', true, '{"key":"val"}']);
      expect(res.sql).toContain('$5::JSONB');
    });
  });

  describe('#formatString', function () {
    it('should format a string with variable', function () {
      const fmt = util.formatString('test ##test##', { test: 'foo' });
      expect(fmt).toEqual('test foo');
      expect(util.formatString('test ##test', { test: 'foo' })).toEqual(
        'test ##test'
      );
      expect(util.formatString('test test##', { test: 'foo' })).toEqual(
        'test test##'
      );
    });
  });

  describe('#expandJsonVariables', function () {
    it('should expand JSON variables', function () {
      const vals = {
        _key1: 'key1',
        _key2: 'key2'
      };
      const template = {
        key1: '##_key1##',
        key2: '##_key2##',
        key3: 'key3',
        key4: '##_key4##',
        nested: {
          key1: '##_key1##'
        }
      };

      const res = util.expandJsonVariables(template, vals);
      expect(res.key1).toEqual('key1');
      expect(res.key2).toEqual('key2');
      expect(res.key3).toEqual('key3');
      expect(res.nested.key1).toEqual('key1');
      expect(res.key4).toEqual('');

      const vals2 = {
        SCAN_SOURCE: 'test_source',
        FILE_URI: 'http://localhost'
      };
      const temp2 = {
        scanSource: '##SCAN_SOURCE##'
      };
      const r2 = util.expandJsonVariables(temp2, vals2);

      expect(r2.scanSource).toEqual('test_source');
    });
  });

  describe('#checkId', function () {
    it('should check ID strings', function () {
      expect(function () {
        util.checkId(null, false);
      }).toThrow();
      expect(function () {
        util.checkId(null, true);
      }).not.toThrow();
      expect(function () {
        util.checkId('606b91d4-a693-4624-8dce-bacd68d55883');
      }).not.toThrow();
      expect(function () {
        util.checkId('606b91d4');
      }).toThrow();
      expect(() => util.checkId('606914')).toThrow();
      expect(() => util.checkId('606914', true, true)).not.toThrow();
      expect(() => util.checkId(606914, true, true)).not.toThrow();
      expect(() => util.checkId(606914, true, false)).toThrow();
      expect(() => util.checkId(100, true, true, false, 99)).toThrow();
      expect(() => util.checkId(100, true, true, false, 200)).not.toThrow();
      expect(() => util.checkId('100', true, true, false, 99)).toThrow();
      expect(() => util.checkId('100', true, true, false, 200)).not.toThrow();
      expect(() => util.checkId('100', true, true, false, 99)).toThrow();
      expect(() => util.checkId(100, true, true, false, 200, 0)).not.toThrow();
      expect(() => util.checkId(100, true, true, false, 200, 101)).toThrow();
      expect(() =>
        util.checkId('100', true, true, false, 200, 0)
      ).not.toThrow();
      expect(() => util.checkId('100', true, true, false, 200, 101)).toThrow();
      expect(() => util.checkId('', false, false, true)).toThrow();
    });
  });

  describe('#getFakeMediaAssetId', function () {
    it('should handle fake asset id', function () {
      const tdoId = '60001466';
      const tdo = { id: tdoId };
      const id = util.getFakeMediaAssetId(tdo);

      expect(id).toExist;
      expect(id).toEqual(util.getFakeMediaAssetId(tdo));
      expect(id).toEqual(util.getFakeMediaAssetId({ id: 60001466 }));
      expect(id).not.toEqual(util.getFakeMediaAssetId({ id: 523434 }));
    });
  });
  describe('#parseFakeAssetId', function () {
    it('should parse a fake asset id', function () {
      const tdoId = '60001466';
      const tdo = { id: tdoId };
      const id = util.getFakeMediaAssetId(tdo);

      let res = util.parseFakeAssetId(id);
      expect(res).toExist;
      expect(res.tdoId).toEqual(tdoId);
      expect(res.assetType).toEqual('media');

      const id2 = util.getFakeMediaAssetId(tdo, 'transcript');
      res = util.parseFakeAssetId(id2);
      expect(res).toExist;
      expect(res.tdoId).toEqual(tdoId);
      expect(res.assetType).toEqual('transcript');

      expect(() => util.parseFakeAssetId('foo123')).toThrow();
    });
  });

  describe('#isFakeMediaAssetId', function () {
    it('should generate fake media asset id', function () {
      const tdoId = '60001466';
      const tdo = { id: tdoId };
      const id = util.getFakeMediaAssetId(tdo);
      expect(util.isFakeMediaAssetId(id, tdo)).toEqual(true);
      expect(util.isFakeMediaAssetId(id)).toEqual(true);
      expect(util.isFakeMediaAssetId('xxxBOm1lZGlhOjYwMDAxNDY2')).toEqual(
        false
      );
    });
  });

  describe('#stripSectionFromString', function () {
    it('should strip test section from a string', function () {
      const text = fs.readFileSync(
        './modules/v3DataModel/v3DataModel.graphql',
        'utf8'
      );
      const result = util.stripSectionFromString('type Query {', '}', text);
      expect(result).toExist;
      expect(result.indexOf('type Query')).toEqual(-1);
      //

      function stripType(type, typeDef) {
        const extendStr = `extend type ${type} {`;
        const typeStr = `type ${type} {`;
        //

        // first strip extend type, if present
        let res = util.stripSectionFromString(extendStr, '}', typeDef);
        // now strip base type
        res = util.stripSectionFromString(typeStr, '}', res);
        return res;
      }

      //
    });
  });

  describe('#stripUrlQuery', function () {
    it('should correctly format url', function () {
      expect(util.stripUrlQuery('http://localhost:9000/api?query=foo')).toEqual(
        'http://localhost:9000/api'
      );
      expect(util.stripUrlQuery('http://localhost:9000/api')).toEqual(
        'http://localhost:9000/api'
      );
    });
  });

  describe('#generateLikeClause', function () {
    it('should generate like clause', function () {
      const where = [];
      const values = [];
      let r = util.makeLikeClause('name', 'foo', where, values, 'exact', true);
      expect(r).toEqual('name LIKE $1');
      r = util.makeLikeClause('name', 'foo', where, values, 'exact', false);
      expect(r).toEqual('name ILIKE $2');
      r = util.makeLikeClause('name', 'foo', where, values, 'startsWith');
      expect(r).toEqual(`name ILIKE $3||'%'`);
      r = util.makeLikeClause('name', 'foo', where, values, 'endsWith');
      expect(r).toEqual(`name ILIKE '%'||$4`);
      r = util.makeLikeClause('name', 'foo', where, values, 'contains');
      expect(r).toEqual(`name ILIKE '%'||$5||'%'`);
      r = util.makeLikeClause('name', 'foo', where, values, 'contains', true);
      expect(r).toEqual(`name LIKE '%'||$6||'%'`);
      expect(values.length).toEqual(6);
      expect(where.length).toEqual(6);
    });
  });

  describe('#fixDateTime', function () {
    it('should fix date/time', function () {
      expect(util.fixDateTime('')).toEqual('');
      expect(util.fixDateTime(null)).toEqual(null);
      const date = new Date();
      expect(util.fixDateTime(date)).toEqual(date);
      const str = date.toISOString();
      expect(util.fixDateTime(str)).toEqual(str);
      expect(util.fixDateTime(1526881286)).toEqual(1526881286000);
      expect(util.fixDateTime(1526881286000)).toEqual(1526881286000);
    });
  });

  describe('#isTimeInSeconds', function () {
    it('should determine if timestamp is in seconds', function () {
      expect(util.isTimeInSeconds(1526881286)).toEqual(true);
      expect(util.isTimeInSeconds(1526881286000)).toEqual(false);
      expect(util.isTimeInSeconds(null)).toEqual(false);
      expect(util.isTimeInSeconds('123')).toEqual(false);
    });
  });

  describe('#stripUrlQuery', function () {
    it('should strip query from url', function () {
      expect(util.stripUrlQuery('http://localhost:9000/api?query=foo')).toEqual(
        'http://localhost:9000/api'
      );
      expect(util.stripUrlQuery('http://localhost:9000/api')).toEqual(
        'http://localhost:9000/api'
      );
    });
  });

  describe('#parseBuild', function () {
    it('should parse build info from url', function () {
      const build = util.parseBuild(
        'https://jenkins.aws-prod.veritone.com/job/Veritone/job/core-graphql-server/job/hotfix%252FVTN-8242-2/14/display/redirect'
      );
      expect(build.env).toEqual('aws-prod.veritone.com');
      expect(build.number).toEqual('14');
      util.parseBuild('foo');
      util.parseBuild('');
      util.parseBuild(null);
    });
  });

  describe('#parseTimeOnly', function () {
    it('should parse without time zone', function () {
      const { time, timeUTC, offsetMinutes } = util.parseTimeOnly('07:00');

      expect(offsetMinutes).toEqual(0);
      expect(time.hour()).toEqual(7);
      expect(timeUTC.hour()).toEqual(7);
    });
    it('should parse without time zone, with seconds', function () {
      const { time, timeUTC, offsetMinutes } = util.parseTimeOnly('07:00:30');

      expect(offsetMinutes).toEqual(0);
      expect(time.hour()).toEqual(7);
      expect(time.second()).toEqual(30);
    });
    it('should parse without time zone, with seconds, default enabled', function () {
      const tempUtil = require('./util.js')({
        config: {
          featureFlags: {
            defaultTimezoneOffset: true
          }
        }
      });
      const { time, timeUTC, offsetMinutes } = tempUtil.parseTimeOnly(
        '07:00:30'
      );

      expect(offsetMinutes).toEqual(0);
      expect(time.hour()).toEqual(7);
      expect(time.second()).toEqual(30);
    });
    it('should parse without time zone, with seconds, default enabled', function () {
      const tempUtil = require('./util.js')({
        config: {
          featureFlags: {
            defaultTimezoneOffset: true
          },
          defaultTimezoneOffsetMinutes: 90
        }
      });
      const { time, timeUTC, offsetMinutes } = tempUtil.parseTimeOnly(
        '07:00:30'
      );

      expect(offsetMinutes).toEqual(90);
      expect(time.hour()).toEqual(7);
      expect(time.second()).toEqual(30);
    });

    it('should parse with time zone +', function () {
      const { time, timeUTC, offsetMinutes } = util.parseTimeOnly(
        '07:00+01:00'
      );

      expect(offsetMinutes).toEqual(-60);
      expect(time.hour()).toEqual(7);
      expect(timeUTC.hour()).toEqual(6);
    });
    it('should parse with time zone -', function () {
      const { time, timeUTC, offsetMinutes } = util.parseTimeOnly(
        '23:00-08:00'
      );

      expect(offsetMinutes).toEqual(8 * 60);
      expect(time.hour()).toEqual(23);
      expect(timeUTC.hour()).toEqual(7);
    });
    it('should parse with time zone - and seconds', function () {
      const { time, timeUTC, offsetMinutes } = util.parseTimeOnly(
        '23:00:30-08:00'
      );

      expect(offsetMinutes).toEqual(8 * 60);
      expect(time.hour()).toEqual(23);
      expect(timeUTC.hour()).toEqual(7);
      expect(time.second()).toEqual(30);
    });
    it('should throw on bad time', function () {
      expect(() => util.parseTimeOnly('0:0')).toThrow();
      expect(() => util.parseTimeOnly('foo')).toThrow();
      expect(() => util.parseTimeOnly('29:99')).toThrow();
    });
    it('should throw on bad time zone', function () {
      expect(() => util.parseTimeOnly('01:00+z')).toThrow();
      expect(() => util.parseTimeOnly('01:00-000234')).toThrow();
      expect(() => util.parseTimeOnly('01:00+0:0')).toThrow();
    });
    it('should convert time appropriately', function () {
      const initialTime = util.parseTimeOnly('23:00:30-08:00');
      const { time, timeUTC, offsetMinutes } = util.adjustTimeToZone(
        initialTime,
        'Asia/Seoul'
      );
      expect(offsetMinutes).toEqual(-9 * 60);
      expect(time.hour()).toEqual(16);
      expect(timeUTC.hour()).toEqual(7);
      expect(time.second()).toEqual(30);
    });
  });

  describe('#timeOnlyToString', function () {
    it('should return right string with minute offset', function () {
      const res = util.timeOnlyToString({
        time: LocalTime.parse('13:00'),
        offsetMinutes: 90
      });
      expect(res).toEqual('13:00+01:30');
    });
    it('should return right string neg offset', function () {
      const res = util.timeOnlyToString({
        time: LocalTime.parse('13:00'),
        offsetMinutes: -240
      });
      expect(res).toEqual('13:00-04:00');
    });
    it('should return right string with minute neg offset', function () {
      const res = util.timeOnlyToString({
        time: LocalTime.parse('13:00'),
        offsetMinutes: -90
      });
      expect(res).toEqual('13:00-01:30');
    });
    it('should return right string with minute neg offset and seconds', function () {
      const res = util.timeOnlyToString({
        time: LocalTime.parse('13:00:30'),
        offsetMinutes: -90
      });
      expect(res).toEqual('13:00:30-01:30');
    });
  });

  describe('#getAllTimeZones', function () {
    it('should get all time zones', function () {
      const zones = util.getAllTimeZones();
      expect(zones.length > 0).toEqual(true);
      expect(typeof zones[0].name).toBe('string');
      expect(zones[0].abbreviations).toExist;
      expect(zones[0].abbreviations.length > 0).toEqual(true);
      expect(typeof zones[0].abbreviations[0].name).toBe('string');
      expect(typeof zones[0].abbreviations[0].offset).toBe('string');
      expect(typeof zones[0].abbreviations[0].offsetMinutes).toBe('number');
    });
  });

  describe('#getTimeWindowKey', function () {
    it('should get correct key', function () {
      expect(util.getTimeWindowKey(10, moment('2018-10-01T01:00:01Z'))).toEqual(
        '2018-10-01T01:00:00.000Z'
      );
      expect(util.getTimeWindowKey(10, moment('2018-10-01T01:00:08Z'))).toEqual(
        '2018-10-01T01:00:00.000Z'
      );
      expect(
        util.getTimeWindowKey(10, moment('2018-10-01T01:09:08.111Z'))
      ).toEqual('2018-10-01T01:09:00.000Z');
      expect(util.getTimeWindowKey(10, moment('2018-10-01T01:00:22Z'))).toEqual(
        '2018-10-01T01:00:20.000Z'
      );
      expect(util.getTimeWindowKey(10)).toExist;
    });
  });

  describe('#stringReplace', function () {
    it('should replace all instances', function () {
      expect(util.stringReplace('aa-b-c-aa', 'aa', 'bb')).toEqual('bb-b-c-bb');
    });
  });
  describe('#isInternalAPIKey', function () {
    it('should return true for internal context', function () {
      const context = require('./test/tokenContextInternalApi.json');
      expect(util.isInternalAPIKey(context)).toEqual(true);
    });
    it('should return false otherwise', function () {
      expect(
        util.isInternalAPIKey(require('./test/tokenContextOrgApi.json'))
      ).toEqual(false);
      expect(
        util.isInternalAPIKey(require('./test/tokenContextUser.json'))
      ).toEqual(false);
      expect(
        util.isInternalAPIKey(require('./test/tokenContextEngineJwt.json'))
      ).toEqual(false);
    });
    it('should return false for undefined and empty input', function () {
      expect(util.isInternalAPIKey(undefined)).toEqual(false);
      expect(util.isInternalAPIKey({})).toEqual(false);
    });
  });
  describe('#isSystemOrgAPIKey', function () {
    it('should return true for internal context', function () {
      const context = require('./test/tokenContextOrgApi.json');
      expect(util.isSystemOrgAPIKey(context)).toEqual(true);
    });
    it('should return false otherwise', function () {
      expect(
        util.isSystemOrgAPIKey(require('./test/tokenContextInternalApi.json'))
      ).toEqual(false);
      expect(
        util.isSystemOrgAPIKey(require('./test/tokenContextUser.json'))
      ).toEqual(false);
      expect(
        util.isSystemOrgAPIKey(require('./test/tokenContextEngineJwt.json'))
      ).toEqual(false);
    });
  });

  describe('#addPartitionRangeWithTDO', function () {
    it('should handle partition range', function () {
      const args = ['foo'];
      const where = ['is_public = TRUE'];
      util.addPartitionRangeWithTDO(
        { id: 350195025 },
        'created_date_time',
        where,
        args
      );
      expect(args.length).toEqual(3);
      expect(where.length).toEqual(2);
      expect(where[1]).toContain('created_date_time');
      expect(where[1]).toContain('BETWEEN');
      expect(where[1]).toContain('$2');
      expect(where[1]).toContain('$3');
    });
    it('should handle no partition range', function () {
      const args = [];
      const where = [];
      util.addPartitionRangeWithTDO(
        { id: 5025 },
        'created_date_time',
        where,
        args
      );
      expect(args.length).toEqual(0);
      expect(where.length).toEqual(0);
    });
  });
  describe('#addPartitionRangeToArgs', function () {
    it('should handle partition range', function () {
      const args = ['foo'];
      const where = ['is_template = FALSE'];
      util.addPartitionRangeToArgs(
        '19020604_uZ99ETSbo7Geuny',
        'created_date_time',
        where,
        args
      );
      expect(args.length).toEqual(3);
      expect(where.length).toEqual(2);
      expect(where[1]).toContain('BETWEEN');
      expect(where[1]).toContain('created_date_time');
      expect(where[1]).toContain('$2');
      expect(where[1]).toContain('$3');
    });
    it('should handle non-partition ID', function () {
      const args = [];
      const where = [];
      util.addPartitionRangeToArgs(
        '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4',
        'created_date_time',
        where,
        args
      );
      expect(where.length).toEqual(0);
      expect(args.length).toEqual(0);
    });
  });

  describe('#sqlEscapeForLIKE', function () {
    it('should handle single quote', function () {
      expect(util.sqlEscapeForLIKE("test's")).toEqual("test\\'s");
      expect(util.sqlEscapeForLIKE("test's function's")).toEqual(
        "test\\'s function\\'s"
      );
    });
    it('should handle %', function () {
      expect(util.sqlEscapeForLIKE('test % like % that')).toEqual(
        'test \\% like \\% that'
      );
    });
    it('should handle _', function () {
      expect(util.sqlEscapeForLIKE('test _ like _ that')).toEqual(
        'test \\_ like \\_ that'
      );
    });
  });
  describe('#addDateTimeFilters', function () {
    it('should error if no filter params set', function () {
      try {
        util.addDateTimeFilters(
          'test',
          { dateTimeFilter: [{ field: 'foo' }] },
          []
        );
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should add both toDateTime and correctly', function () {
      const sqlWhere = [];
      util.addDateTimeFilters(
        'test',
        {
          dateTimeFilter: [
            {
              toDateTime: '2019-06-26T07:00:10.000Z',
              field: 'field'
            },
            {
              fromDateTime: '2019-06-26T07:30:10.000Z',
              field: 'field'
            }
          ]
        },
        sqlWhere
      );
      expect(sqlWhere.length).toEqual(2);
      expect(sqlWhere[0].toLowerCase()).toContain('field <= ');
      expect(sqlWhere[0]).toContain(
        _.toString(moment('2019-06-26T07:00:10.000Z').valueOf())
      );
      expect(sqlWhere[1].toLowerCase()).toContain('field >= ');
      expect(sqlWhere[1]).toContain(
        _.toString(moment('2019-06-26T07:30:10.000Z').valueOf())
      );
    });
    it('should add both to/fromDateTimeExclusive and correctly', function () {
      const sqlWhere = [];
      util.addDateTimeFilters(
        'test',
        {
          dateTimeFilter: [
            {
              toDateTime: '2019-06-26T07:00:10.000Z',
              toDateTimeExclusive: true,
              field: 'field'
            },
            {
              fromDateTime: '2019-06-26T07:30:10.000Z',
              fromDateTimeExclusive: true,
              field: 'field'
            }
          ]
        },
        sqlWhere
      );
      expect(sqlWhere.length).toEqual(2);
      expect(sqlWhere[0].toLowerCase()).toContain('field < ');
      expect(sqlWhere[0]).toContain(
        _.toString(moment('2019-06-26T07:00:10.000Z').valueOf())
      );
      expect(sqlWhere[1].toLowerCase()).toContain('field > ');
      expect(sqlWhere[1]).toContain(
        _.toString(moment('2019-06-26T07:30:10.000Z').valueOf())
      );
    });
    it('should handle includeEmpty', function () {
      const sqlWhere = [];
      util.addDateTimeFilters(
        'test',
        {
          dateTimeFilter: [
            {
              toDateTime: '2019-06-26T07:00:10.000Z',
              toDateTimeExclusive: true,
              field: 'field',
              includeEmpty: true
            }
          ]
        },
        sqlWhere
      );
      expect(sqlWhere.length).toEqual(1);
      expect(sqlWhere[0].toLowerCase()).toContain('is null');
      expect(sqlWhere[0].toLowerCase()).toContain(' or ');
      expect(sqlWhere[0].toLowerCase()).toContain('field < ');
      expect(sqlWhere[0]).toContain(
        _.toString(moment('2019-06-26T07:00:10.000Z').valueOf())
      );
    });
    it('should handle fallbackColumn', function () {
      const sqlWhere = [];
      util.addDateTimeFilters(
        'test',
        {
          dateTimeFilter: [
            {
              toDateTime: '2019-06-26T07:00:10.000Z',
              toDateTimeExclusive: true,
              field: 'field',
              fallbackField: 'field2'
            }
          ]
        },
        sqlWhere
      );
      expect(sqlWhere.length).toEqual(1);
      expect(sqlWhere[0].toLowerCase()).toContain('is null and ');
      expect(sqlWhere[0]).toContain('field2 < ');
      expect(sqlWhere[0]).toContain('field < ');
      expect(sqlWhere[0]).toContain(
        _.toString(moment('2019-06-26T07:00:10.000Z').valueOf())
      );
    });
  });

  describe('#checkForForbiddenContent', function () {
    let testUtil;
    beforeAll(() => {
      testUtil = require('./util.js')({
        config: {
          security: {
            dataContentRules: [
              {
                objectKey: 'job.task.payload',
                patterns: [
                  {
                    action: 'disallow',
                    regex: '169\\.254\\.169\\.254',
                    flags: 'g',
                    securityNote: 'err1'
                  },
                  {
                    action: 'disallow',
                    regex: '127\\.0\\.0\\.1',
                    flags: 'g',
                    securityNote: 'err2'
                  }
                ]
              },
              {
                objectKey: 'testObjectKey',
                patterns: [
                  {
                    action: 'disallow',
                    regex: '^test',
                    flags: 'gi',
                    securityNote: 'err3'
                  },
                  {
                    action: 'allow',
                    regex: '\\w*',
                    flags: 'g',
                    securityNote: 'err4'
                  }
                ]
              }
            ]
          }
        }
      });
    });

    it('should handle empty content and key not in the list', function () {
      expect(testUtil.checkForForbiddenContent('testObjectKey', '')).toEqual(
        true
      );
      expect(testUtil.checkForForbiddenContent('testObjectKey')).toBeTruthy();
      expect(testUtil.checkForForbiddenContent('testObjectKey', null)).toEqual(
        true
      );
      expect(testUtil.checkForForbiddenContent('testObjectKey', {})).toEqual(
        true
      );
      expect(
        testUtil.checkForForbiddenContent('otherKey', '127.0.0.1')
      ).toEqual(true);
    });

    it('should throw an exception of the content matches pattern', function () {
      expect(() => {
        testUtil.checkForForbiddenContent('job.task.payload', {
          downloadUrl: 'http://169.254.169.254/path/to/resource?query&flags=123'
        });
      }).toThrow();

      expect(() => {
        testUtil.checkForForbiddenContent('job.task.payload', {
          downloadUrl: 'http://127.0.0.1/path/to/resource?query&flags=123'
        });
      }).toThrow();

      expect(() => {
        testUtil.checkForForbiddenContent('testObjectKey', {
          downloadUrl: 'test string validate'
        });
      }).not.toThrow();

      expect(() => {
        testUtil.checkForForbiddenContent('testObjectKey', {
          downloadUrl: 'valid body'
        });
      }).not.toThrow();
    });
  });

  describe('#get', () => {
    const config = JSON.parse(`{
      "s3": {
        "bucket": "uk-prod-veritone-recordings",
        "maxRetry": 3,
        "path": "assets",
        "region": "eu-west-2",
        "timeout": 30000,
        "enableUrlSigning": true,
        "signedUrlExpires": 604800,
        "preventS3SignerReuse": true,
        "buckets": {
          "assets": {
            "name": "uk-prod-veritone-recordings",
            "region": "eu-west-2",
            "signedUrlExpires": 604800,
            "preventS3SignerReuse": true
          },
          "api": {
            "name": "uk-prod-api.veritone.com",
            "path": "signedUrl",
            "region": "eu-west-2",
            "signedUrlExpires": 86400,
            "preventS3SignerReuse": true
          },
          "uk-prod-api.veritone.com": {
            "name": "uk-prod-api.veritone.com",
            "path": "signedUrl",
            "region": "eu-west-2",
            "signedUrlExpires": 86400,
            "preventS3SignerReuse": true
          },
          "face": {
            "name": "uk-prod-veritone-face",
            "signedUrlExpires": 86400,
            "region": "eu-west-2"
          }
        }
      }
    }
    `);
    it('should get key name without dash', () => {
      expect(util.get(config, ['s3', 'bucket'])).toEqual(
        'uk-prod-veritone-recordings'
      );
    });

    it('should get key name with dash', () => {
      expect(
        util.get(config, ['s3', 'buckets', 'uk-prod-api.veritone.com'])
      ).toBeDefined();
    });

    it('should return undefined if key is not found', () => {
      expect(
        util.get(config, ['s3', 'buckets', 'uk-prod-api.veritone.com.com'])
      ).toBeUndefined();
    });

    it('should return provided default if key is not found', () => {
      expect(
        util.get(config, ['s3', 'buckets', 'uk-prod-api.veritone.com.com'], {})
      ).toEqual({});
    });

    it('should return undefined if key is not array', () => {
      expect(
        util.get(config, 's3.buckets.uk-prod-api.veritone.com')
      ).toBeUndefined();
    });
  });

  describe('#getDnsZoneName', function () {
    it('should return dns zone name', function () {
      expect(util.getDnsZoneName()).toEqual('dev.us-1.veritone.com');
    });

    it('should return dns zone name from publicDnsZoneName key ', () => {
      const tempUtil = require('./util.js')({
        config: {
          publicDnsZoneName: 'dns_from_key'
        }
      });

      const result = tempUtil.getDnsZoneName();
      expect(result).toBe('dns_from_key');
    });

    it('should return dns zone name from env variable ', () => {
      const tempUtil = require('./util.js')({
        config: {}
      });
      process.env.PUBLIC_DNS_ZONE_NAME = 'custom.dns.zone';
      const result = tempUtil.getDnsZoneName();
      expect(result).toBe('custom.dns.zone');
    });
  });

  describe('#isEnableFeatureInOrganization', function () {
    let util1, serviceContext1, context, organization;
    beforeAll(() => {
      serviceContext1 = {
        config: {
          featureFlags: {
            featureName: true
          }
        },
        dal: {}
      };

      serviceContext1.dal.organization = {
        getOrganization: jest.fn()
      };

      util1 = require('./util.js')(serviceContext1);
      context = {};

      organization = {
        organizationId: 1,
        kvp: {}
      };
    });
    it('should return false if a feature is not set in the config.featureFlags', async function () {
      expect(
        await util.isEnableFeatureInOrganization(
          context,
          undefined,
          undefined,
          'featureName'
        )
      ).toEqual(false);
    });

    it('should return false if a feature is not set or disabled in the organization features', async function () {
      expect(
        await util.isEnableFeatureInOrganization(
          context,
          organization,
          undefined,
          'featureName'
        )
      ).toEqual(false);

      _.set(organization, 'kvp.features.featureName', 'disabled');

      expect(
        await util1.isEnableFeatureInOrganization(
          context,
          organization,
          undefined,
          'featureName'
        )
      ).toEqual(false);
    });

    it('should return true if a feature is enabled in the organization features', async function () {
      _.set(organization, 'kvp.features.featureName', 'enabled');
      expect(
        await util1.isEnableFeatureInOrganization(
          context,
          organization,
          undefined,
          'featureName'
        )
      ).toEqual(true);
    });

    it('get the org via the ID param to determine whether the feature is on or off.', async function () {
      const orgId = 1;
      serviceContext1.dal.organization.getOrganization.mockResolvedValueOnce(
        organization
      );

      expect(
        await util1.isEnableFeatureInOrganization(
          context,
          undefined,
          orgId,
          'featureName'
        )
      ).toEqual(true);
      expect(
        serviceContext1.dal.organization.getOrganization
      ).toHaveBeenCalled();
    });

    it('should skip checking config and return true if a feature is enabled in the organization features', async function () {
      _.set(organization, 'kvp.features.otherFeatureName', 'enabled');
      expect(
        await util1.isEnableFeatureInOrganization(
          context,
          organization,
          undefined,
          'otherFeatureName',
          true
        )
      ).toEqual(true);
    });

    it('the names of the configuration feature and the organization feature are not the same', async function () {
      _.set(organization, 'kvp.features.orgFeatureName', 'enabled');
      expect(
        await util1.isEnableFeatureInOrganization(
          context,
          organization,
          undefined,
          ['featureName', 'orgFeatureName']
        )
      ).toEqual(true);
    });
  });

  describe('#validateCacheKey', function () {
    let util1, serviceContext1, con;
    beforeAll(() => {
      serviceContext1 = {
        redisCache: {
          markCacheDirty: jest.fn(),
          get: jest.fn(),
          isCacheDirty: jest.fn(),
          asyncClear: jest.fn(),
          asyncSet: jest.fn()
        },
        localCache: {
          get: jest.fn(),
          set: jest.fn(),
          clear: jest.fn()
        }
      };

      util1 = require('./util.js')(serviceContext1);
    });

    it('should return two async functions', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false);
      const {
        asyncGetCacheValue,
        asyncRefreshCacheValue
      } = await util1.validateCacheKey(markedKey, type, cacheKey);
      expect(asyncGetCacheValue).toBeDefined();
      expect(asyncRefreshCacheValue).toBeDefined();
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        tsType,
        tsKey
      );
      expect(serviceContext1.redisCache.asyncClear).not.toHaveBeenCalled();

      // get cache value
      serviceContext1.redisCache.get.mockResolvedValueOnce({ foo: 'bar' });
      const value = await asyncGetCacheValue();
      expect(value).toEqual(
        expect.objectContaining({
          foo: 'bar'
        })
      );
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        type,
        cacheKey
      );

      // get cache value with a default value
      serviceContext1.redisCache.get.mockResolvedValueOnce(null);
      const value1 = await asyncGetCacheValue({ bar: 'baz' });
      expect(value1).toEqual(
        expect.objectContaining({
          bar: 'baz'
        })
      );

      // refresh cache value with new value
      serviceContext1.redisCache.asyncSet.mockImplementationOnce(
        (t, k, newValue) => {
          expect(t).toEqual(type);
          expect(k).toEqual(cacheKey);
          expect(newValue).toEqual(
            expect.objectContaining({
              key: 'value'
            })
          );

          return Promise.resolve();
        }
      );
      serviceContext1.redisCache.asyncSet.mockImplementationOnce(
        (t, k, newValue) => {
          expect(t).toEqual(tsType);
          expect(k).toEqual(tsKey);
          expect(newValue).toEqual(expect.any(Number));

          return Promise.resolve();
        }
      );
      await asyncRefreshCacheValue({ key: 'value' });
      expect(serviceContext1.redisCache.asyncSet).toHaveBeenCalledTimes(2);
    });

    it('when cache key is not dirty', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockImplementationOnce(
        (markedKey, tsValue) => {
          expect(markedKey).toEqual(markedKey);
          expect(tsValue).toEqual(tsCachedValue);
          return false;
        }
      );
      await util1.validateCacheKey(markedKey, type, cacheKey);
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        tsType,
        tsKey
      );
      expect(serviceContext1.redisCache.asyncClear).not.toHaveBeenCalled();
    });

    it('when cache key is dirty', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValueOnce(true);
      serviceContext1.redisCache.asyncClear.mockImplementationOnce((t, k) => {
        expect(t).toEqual(type);
        expect(k).toEqual(cacheKey);
        return Promise.resolve();
      });
      serviceContext1.redisCache.asyncClear.mockImplementationOnce((t, k) => {
        expect(t).toEqual(tsType);
        expect(k).toEqual(tsKey);
        return Promise.resolve();
      });
      await util1.validateCacheKey(markedKey, type, cacheKey);
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        tsType,
        tsKey
      );
      expect(serviceContext1.redisCache.asyncClear).toHaveBeenCalledTimes(2);
    });

    it('when cache key is not dirty with multiple markedKeys', async function () {
      const markedKeys = ['marked_key_1', 'marked_key_2'];
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false);

      await util1.validateCacheKey(markedKeys, type, cacheKey);

      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(tsType, tsKey);
      expect(serviceContext1.redisCache.isCacheDirty).toHaveBeenCalledTimes(2);
      expect(serviceContext1.redisCache.asyncClear).not.toHaveBeenCalled();
    });

    it('when at least one cache key is dirty with multiple markedKeys', async function () {
      const markedKeys = ['marked_key_1', 'marked_key_2', 'marked_key_3'];
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      // Mock that second key is dirty
      serviceContext1.redisCache.isCacheDirty
        .mockResolvedValueOnce(false)  // first key not dirty
        .mockResolvedValueOnce(true)   // second key is dirty
        .mockResolvedValueOnce(false); // third key not dirty

      serviceContext1.redisCache.asyncClear.mockImplementationOnce((t, k) => {
        expect(t).toEqual(type);
        expect(k).toEqual(cacheKey);
        return Promise.resolve();
      });
      serviceContext1.redisCache.asyncClear.mockImplementationOnce((t, k) => {
        expect(t).toEqual(tsType);
        expect(k).toEqual(tsKey);
        return Promise.resolve();
      });

      await util1.validateCacheKey(markedKeys, type, cacheKey);

      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(tsType, tsKey);
      expect(serviceContext1.redisCache.isCacheDirty).toHaveBeenCalledTimes(3);
      expect(serviceContext1.redisCache.asyncClear).toHaveBeenCalledTimes(2);
    });

    it('should use L1 cache when available and not dirty', async function () {
      const l1CachedValue = { foo: 'bar', fromL1: true };
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false); // not dirty
      serviceContext1.localCache.get.mockReturnValueOnce(l1CachedValue);

      const { asyncGetCacheValue } = await util1.validateCacheKey(markedKey, type, cacheKey, { useL1Cache: true });

      const value = await asyncGetCacheValue();
      expect(value).toEqual(l1CachedValue);
      // always check timestamp first
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        tsType,
        tsKey
      );
      expect(serviceContext1.localCache.get).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.redisCache.get).not.toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.redisCache.asyncClear).not.toHaveBeenCalled();
      expect(serviceContext1.localCache.clear).not.toHaveBeenCalled();
    });

    it('should fallback to L2 cache when L1 cache is empty, not dirty', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';
      const l2CachedValue = { foo: 'bar', fromL2: true };

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false); // not dirty
      serviceContext1.localCache.get.mockReturnValueOnce(null);
      serviceContext1.redisCache.get.mockResolvedValueOnce(l2CachedValue);

      const { asyncGetCacheValue } = await util1.validateCacheKey(markedKey, type, cacheKey, { useL1Cache: true });

      const value = await asyncGetCacheValue();
      expect(value).toEqual(l2CachedValue);
      // always check timestamp first
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        tsType,
        tsKey
      );
      expect(serviceContext1.localCache.get).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.localCache.set).toHaveBeenCalledWith(type, cacheKey, l2CachedValue);
      expect(serviceContext1.redisCache.asyncSet).not.toHaveBeenCalled();
    });

    it('should fallback to L2 cache when L1 timestamp is older than redis dirtyMark', async function () {
      const l1CachedValue = { foo: 'bar', fromL1: true };
      const l1Timestamp = Date.now() - 1000; // 1 second ago
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = Date.now();
      const l2CachedValue = { foo: 'bar', fromL2: true };

      serviceContext1.redisCache.get.mockImplementationOnce((t, k) => {
        expect(t).toEqual(tsType);
        expect(k).toEqual(tsKey);

        return tsCachedValue;
      });
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false); // not dirty
      serviceContext1.localCache.get.mockImplementationOnce((t, k) => {
        expect(t).toEqual(type);
        expect(k).toEqual(cacheKey);

        return l1CachedValue;
      });
      serviceContext1.localCache.get.mockImplementationOnce((t, k) => {
        expect(t).toEqual(tsType);
        expect(k).toEqual(tsKey);

        return l1Timestamp;
      });
      serviceContext1.redisCache.get.mockResolvedValueOnce(l2CachedValue);

      const { asyncGetCacheValue } = await util1.validateCacheKey(markedKey, type, cacheKey, { useL1Cache: true });

      const value = await asyncGetCacheValue();
      expect(value).toEqual(l2CachedValue);
      // always check timestamp first
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(
        tsType,
        tsKey
      );
      expect(serviceContext1.localCache.get).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.redisCache.get).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.localCache.set).toHaveBeenCalledWith(type, cacheKey, l2CachedValue);
      expect(serviceContext1.redisCache.asyncSet).not.toHaveBeenCalled();
      expect(serviceContext1.localCache.clear).toHaveBeenCalledTimes(2);
    });

    it('should update both L1 and L2 cache when refreshing cache value, not dirty', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';
      const newValue = { key: 'value', updated: true };

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false);

      const { asyncRefreshCacheValue } = await util1.validateCacheKey(markedKey, type, cacheKey, { useL1Cache: true });

      serviceContext1.redisCache.asyncSet.mockResolvedValueOnce();
      serviceContext1.redisCache.asyncSet.mockResolvedValueOnce();

      await asyncRefreshCacheValue(newValue);

      expect(serviceContext1.localCache.set).toHaveBeenCalledWith(type, cacheKey, newValue);
      expect(serviceContext1.redisCache.asyncSet).toHaveBeenCalledWith(type, cacheKey, newValue);
      expect(serviceContext1.redisCache.asyncSet).toHaveBeenCalledWith(tsType, tsKey, expect.any(Number));
    });

    it('should apply a ttlMinOverride to both the value key and the timestamp key when refreshing cache value', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';
      const newValue = { key: 'override_value' };
      const ttlOverride = 5 / 60;

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValue(false);

      const { asyncRefreshCacheValue } = await util1.validateCacheKey(markedKey, type, cacheKey, { useL1Cache: true });

      serviceContext1.redisCache.asyncSet.mockResolvedValueOnce();
      serviceContext1.redisCache.asyncSet.mockResolvedValueOnce();

      await asyncRefreshCacheValue(newValue, ttlOverride);

      // Both the value key AND the timestamp key must share the override TTL — a mismatch
      // here would let the timestamp outlive the value and reintroduce the T28 stale-denial bug.
      expect(serviceContext1.redisCache.asyncSet).toHaveBeenCalledWith(type, cacheKey, newValue, null, ttlOverride);
      expect(serviceContext1.redisCache.asyncSet).toHaveBeenCalledWith(tsType, tsKey, expect.any(Number), null, ttlOverride);
    });

    it('should clear both L1 and L2 cache when cache key is dirty', async function () {
      const markedKey = 'marked_key';
      const type = 'type_of_cache_key';
      const cacheKey = 'cache_key';
      const tsKey = `${type}:${cacheKey}`;
      const tsType = 'timestamp';
      const tsCachedValue = 'timestamp_value';

      serviceContext1.redisCache.get.mockResolvedValueOnce(tsCachedValue);
      serviceContext1.redisCache.isCacheDirty.mockResolvedValueOnce(true);
      serviceContext1.redisCache.asyncClear.mockResolvedValue();
      serviceContext1.localCache.clear.mockReturnValue();

      await util1.validateCacheKey(markedKey, type, cacheKey, { useL1Cache: true });

      expect(serviceContext1.localCache.clear).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.redisCache.asyncClear).toHaveBeenCalledWith(type, cacheKey);
      expect(serviceContext1.redisCache.asyncClear).toHaveBeenCalledWith(tsType, tsKey);
    });
  });

  describe('#buildFilterOptionKey', function () {
    it('should return a v5 uuid', function () {
      const key = util.buildFilterOptionKey({
        foo: 'bar',
        keys: [{ bar: 'baz' }]
      });
      expect(validator.isUUID(key, 5)).toEqual(true);
    });
  });

  describe('#compareOrganizationId', function () {
    it('The input is invalid: 1', function () {
      const result = util.compareOrganizationIds();
      expect(result).toEqual(false);
    });
    it('The input is invalid: 2', function () {
      const result = util.compareOrganizationIds('123');
      expect(result).toEqual(false);
    });
    it('The input is invalid: 3', function () {
      const result = util.compareOrganizationIds(null, '321');
      expect(result).toEqual(false);
    });
    it('The values do not match: 1', function () {
      const result = util.compareOrganizationIds('123', 453);
      expect(result).toEqual(false);
    });
    it('The values do not match: 2', function () {
      const result = util.compareOrganizationIds(123, '453');
      expect(result).toEqual(false);
    });
    it('The values do not match: 3', function () {
      const result = util.compareOrganizationIds('123', '453');
      expect(result).toEqual(false);
    });
    it('The values do not match: 4', function () {
      const result = util.compareOrganizationIds('123', -123);
      expect(result).toEqual(false);
    });
    it('The values are matched: 1', function () {
      const result = util.compareOrganizationIds('123', '123');
      expect(result).toEqual(true);
    });
    it('The values are matched: 2', function () {
      const result = util.compareOrganizationIds(123, '123');
      expect(result).toEqual(true);
    });
    it('The values are matched: 3', function () {
      const result = util.compareOrganizationIds(123, 123);
      expect(result).toEqual(true);
    });
    it('The values are matched: 4', function () {
      const result = util.compareOrganizationIds('123', 123);
      expect(result).toEqual(true);
    });
  });
});

describe('#isJSON', function () {
  it('should return false for non-JSON input', function () {
    expect(util.isJSON('not-a-json')).toBe(false);
    expect(util.isJSON('0')).toBe(false);
    expect(util.isJSON(2)).toBe(false);
  });
  it('should return true for JSON input', function () {
    expect(util.isJSON([])).toBe(true);
    expect(util.isJSON({})).toBe(true);
    expect(util.isJSON({ properties: { type: 'string' } })).toBe(true);
  });
  it('should return false for bad JSON string', function () {
    expect(util.isJSON("{ properties: { type: 'string' } }")).toBe(false);
  });
  it('should return true for JSON string', function () {
    expect(util.isJSON(`{ "properties": { "type": "string" } }`)).toBe(true);
  });
});

describe('#addSqlWhere', function () {
  let whereConditions, values, columName, value;
  beforeEach(() => {
    columName = 'test_column';
    value = null;
    whereConditions = [];
    values = [];
  });
  it('the input is empty', function () {
    util.addSqlWhere(columName, value, whereConditions, values);
    expect(whereConditions.length).toBe(0);
    expect(values.length).toBe(0);
  });

  it('the input is not an array', function () {
    value = 'test_value';
    util.addSqlWhere(columName, value, whereConditions, values);
    expect(whereConditions.length).toBe(1);
    expect(values.length).toBe(1);
    expect(values[0]).toEqual(value);
    expect(whereConditions[0]).toEqual(`test_column = $1`);
  });

  it('the input is an array but empty', function () {
    value = [];
    util.addSqlWhere(columName, value, whereConditions, values);
    expect(whereConditions.length).toBe(1);
    expect(values.length).toBe(0);
  });

  it('the input is an array but not empty', function () {
    value = [1, 2];
    util.addSqlWhere(columName, value, whereConditions, values);
    expect(whereConditions.length).toBe(1);
    expect(values.length).toBe(2);
    expect(values[0]).toEqual(1);
    expect(values[1]).toEqual(2);
    expect(whereConditions[0]).toEqual(`test_column IN ($1, $2)`);
  });
});

describe('RedactedFields', () => {
  const query = `mutation login {
                userLogin(input: {userName: "test", password: "test_password"}) {
                  token
                  lastLoggedIn
                  applications
                }
              }
              `;
  const variables = `{
              "password": "test_password"
            }`;
  const maskedFields = [
    {
      operation: 'userLogin',
      field: 'password'
    }
  ];

  it('missing maskedFields, return the original query and variables', () => {
    const redactedFields = util.redactFields(query, variables, undefined);
    expect(redactedFields.query).toEqual(query);
    expect(redactedFields.variables).toContain('test_password');
  });
  it('successful query masked, no variables', () => {
    const redactedFields = util.redactFields(query, undefined, maskedFields);
    expect(redactedFields.query).toContain('redacted');
    expect(redactedFields.variables).toBeUndefined();
  });
  it('successful query and variables masked', () => {
    const redactedFields = util.redactFields(query, variables, maskedFields);
    expect(redactedFields.query).toContain('redacted');
    expect(redactedFields.variables).toContain('redacted');
  });
  it('successful execution, nothing to mask', () => {
    const queryString = `mutation login {
                userLogout(input: {userName: "test", password: "test_pass"}) {
                  token
                  lastLoggedIn
                  applications
                }
              }
              `;
    const maskedFields = [
      {
        operation: 'userLogin',
        field: 'password'
      }
    ];
    const redactedFields = util.redactFields(
      queryString,
      variables,
      maskedFields
    );
    expect(redactedFields.query).toEqual(queryString);
    expect(redactedFields.variables).toContain('test_password');
  });
  it('successful variables masked, query with no pass', () => {
    const queryString = `mutation login {
                userLogin(input: {userName: "test", pass: "test_pass"}) {
                  token
                  lastLoggedIn
                  applications
                }
              }
              `;
    const variablesString = `{"input":{"userName":"test-user","password":"password"}} `;
    const maskedFields = [
      {
        operation: 'userLogin',
        field: 'password'
      }
    ];
    const redactedFields = util.redactFields(
      queryString,
      variablesString,
      maskedFields
    );
    expect(redactedFields.query).toEqual(queryString);
    expect(redactedFields.variables).toContain('redacted');
  });
});

describe('restrictedPermissions util', function () {
  it('should filter restricted permissions case-insensitively', function () {
    const rights = [
      'asset:read',
      'SUPERADMIN',
      'task:update',
      'Task_Type:Internal',
      'custom:perm'
    ];

    const filtered = util.filterRestrictedPermissions(rights, ['CUSTOM:PERM', 'SUPERADMIN']);

    expect(filtered).toEqual(['asset:read', 'task:update', 'Task_Type:Internal']);
  });
});

describe('#hasPerm()', function () {
  it('should match short-form rights (job:create)', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: ['job:create'] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(true);
  });

  it('should match aiware-prefixed rights (same bit ID)', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: ['aiware:job:create'] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(true);
  });

  // Literal storage form from the VE-19651 ticket — token carries
  // dot-separated rights instead of colon-separated.
  it('should match aiware-prefixed dot-form rights (ticket case)', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: ['aiware.job.create'] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(true);
  });

  it('should match cms-prefixed rights (same bit ID)', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: ['cms:job:create'] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(true);
  });

  it('should not match unrelated rights', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: ['job:read'] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(false);
  });

  it('should return false for empty rights', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: [] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(false);
  });

  it('should match via bitmask when permissionMasks is set', function () {
    const authInfo = {
      permissionMasks: [1006632960], // bits 26-29 (job CRUD)
      tokenInfo: { json: { rights: [] } }
    };
    expect(util.hasPerm('job.create', authInfo)).toBe(true);
  });

  it('should fall back to string comparison for unknown permissions', function () {
    const authInfo = {
      permissionMasks: [],
      tokenInfo: { json: { rights: ['custom:unknown:perm'] } }
    };
    expect(util.hasPerm('custom.unknown.perm', authInfo)).toBe(true);
  });
});
