const _ = require('lodash');
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
serviceContext.config.instanceAuditLog = {
  instanceAuditLog: {
    maximumTimeWindowLengthDays: 365,
    defaultTimeWindowLengthDays: 7
  }
};

const httpCallMock = jest.fn().mockImplementation(() =>
  Promise.resolve({
    statusCode: 200,
    results: [
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        organizationName: 'my private organization 1',
        targetId: '1232812301',
        requestIP: '23.185.0.1',
        targetType: 'authentication',
        eventType: 'authentication',
        organizationGuid: '38e2c453-20bc-4470-98ef-7c972bca67d6',
        userName: 'lowercase09',
        userId: '1959213091',
        actionResult: 'success',
        impersonatorUserId: '00081',
        organizationId: '45788',
        eventId: '100009',
        eventName: 'LoginSucceeded',
        originatorApplication: 'developer app',
        actionDetails: 'login successful',
        impersonatorUserName: 'otherUser01',
        actionName: 'login',
        originatorService: 'core-graphql-server',
        timestamp: '2023-12-18T22:03:21.021Z',
        id: '100',
        correlationId: '1cc96fed-353d-43f0-b0b4-d97103a6eabc'
      },
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        organizationName: 'my private organization 2',
        targetId: '1232812302',
        requestIP: '23.185.0.2',
        targetType: 'authentication',
        eventType: 'authentication',
        organizationGuid: '38e2c453-20bc-4470-98ef-7c972bca67d6',
        userName: 'lowercase02',
        userId: '19592130912',
        actionResult: 'success',
        impersonatorUserId: '00082',
        organizationId: '45788',
        eventId: '100002',
        eventName: 'LoginSucceeded',
        originatorApplication: 'developer app',
        actionDetails: 'login successful',
        impersonatorUserName: 'otherUser01',
        actionName: 'login',
        originatorService: 'core-graphql-server',
        timestamp: '2023-12-18T22:03:21.021Z',
        id: '200',
        correlationId: '1cc96fed-353d-43f0-b0b4-d97103a6eabc'
      },
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        organizationName: 'my private organization 3',
        targetId: '1232812303',
        requestIP: '23.185.0.3',
        targetType: 'authentication',
        eventType: 'authentication',
        organizationGuid: '38e2c453-20bc-4470-98ef-7c972bca67d6',
        userName: 'lowercase03',
        userId: '19592130913',
        actionResult: 'success',
        impersonatorUserId: '00083',
        organizationId: '45788',
        eventId: '100003',
        eventName: 'LoginSucceeded',
        originatorApplication: 'developer app',
        actionDetails: 'login successful',
        impersonatorUserName: 'otherUser01',
        actionName: 'login',
        originatorService: 'core-graphql-server',
        timestamp: '2023-12-18T22:03:21.021Z',
        id: '300',
        correlationId: '1cc96fed-353d-43f0-b0b4-d97103a6eabc'
      },
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        organizationName: 'my private organization 3',
        targetId: '1232812304',
        requestIP: '23.185.0.4',
        targetType: 'authentication',
        eventType: 'authentication',
        organizationGuid: '38e2c453-20bc-4470-98ef-7c972bca67d6',
        userName: 'lowercase03',
        userId: '19592130913',
        actionResult: 'success',
        impersonatorUserId: '00084',
        organizationId: '45788',
        eventId: '100004',
        eventName: 'LoginSucceeded',
        originatorApplication: 'developer app',
        actionDetails: 'login successful',
        impersonatorUserName: 'otherUser01',
        actionName: 'login',
        originatorService: 'core-graphql-server',
        timestamp: '2023-12-18T22:03:21.021Z',
        id: '400',
        correlationId: '1cc96fed-353d-43f0-b0b4-d97103a6eabc'
      }
    ],
    totalResults: 3,
    limit: 4,
    from: 0,
    to: 4,
    searchToken: '0e50b570-fc8e-11ee-9890-afa45be57983',
    timestamp: 1713339755,
    headers: { 'content-type': 'application/json' }
  })
);

jest.mock('./util.js');
const dalUtil = require('./util.js');

dalUtil.mockImplementation(() => {
  return {
    httpCall: httpCallMock
  };
});

const dal = require('./instanceAuditLog.js')(serviceContext);
const errors = require('../error')(serviceContext.config);

describe('audit log sinks', function () {
  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(7);
      expect(typeof test.getAuditLog).toEqual('function');
      expect(typeof test.cleanInputConsideringTier).toEqual('function');
      expect(typeof test.buildSearchAfterCondition).toEqual('function');
      expect(typeof test.buildSearchQuery).toEqual('function');
      expect(typeof test.orderBy).toEqual('function');
      expect(typeof test.validateOrganization).toEqual('function');
    });
  });

  describe('getAuditLog for elastic search sink', function () {
    it('window length days is more than 365 days', async function () {
      // dif of 374 days
      const fromDateTime = '2023-04-11T15:52:39.000Z';
      const toDateTime = '2024-04-19T15:52:39.000Z';
      try {
        const res = await dal.getAuditLog(serviceContext, {
          input: {
            fromDateTime,
            toDateTime
          }
        });
      } catch (err) {
        expect(err.message).toEqual(
          'Audit log time window must be equal or less than 365 days.'
        );
        expect(err.data.fromDateTime).toEqual(fromDateTime);
        expect(err.data.toDateTime).toEqual(toDateTime);
      }
    });

    it('input.limit value is bigger than maximum number of records that search server can return (10K)', async function () {
      const fromDateTime = '2024-04-11T15:52:39.000Z';
      const toDateTime = '2024-04-19T15:52:39.000Z';
      serviceContext.requestContext = {
        userInfo: {
          userId: 123,
          organization: {
            organizationGuid: 456
          }
        }
      };

      try {
        const res = await dal.getAuditLog(serviceContext, {
          input: {
            eventName: 'LoginSucceeded',
            limit: 10001,
            fromDateTime,
            toDateTime
          }
        });
      } catch (err) {
        expect(err.message).toEqual(
          "input.limit is bigger than 10000. It's the maximum number of records that search server can return per request"
        );
        expect(err.data.code).toEqual(400);
        expect(err.data.objectType).toEqual('search-server');
      }
    });

    it(`input.offset is bigger than 10000. It's the maximum number of records that search server can return per request. Element in 
    position input.offset need to be calculated before to start the search query`, async function () {
      const fromDateTime = '2024-04-11T15:52:39.000Z';
      const toDateTime = '2024-04-19T15:52:39.000Z';
      serviceContext.requestContext = {
        userInfo: {
          userId: 123,
          organization: {
            organizationGuid: 456
          }
        }
      };

      const res = await dal.getAuditLog(serviceContext, {
        input: {
          eventName: 'LoginSucceeded',
          offset: 10002,
          limit: 2,
          fromDateTime,
          toDateTime,
          orderBy: [
            {
              field: 'id',
              direction: 'desc'
            }
          ]
        }
      });
      expect(res).toBeDefined();
      expect(res.limit).toEqual(2);
      expect(res.offset).toEqual(10002);
    });

    it(`input.offset <= 10000 and offset + limit is bigger thant the maximum result per search request. Element in 
    position input.offset need to be calculated before to start the search query`, async function () {
      const fromDateTime = '2024-04-11T15:52:39.000Z';
      const toDateTime = '2024-04-19T15:52:39.000Z';
      serviceContext.requestContext = {
        userInfo: {
          userId: 123,
          organization: {
            organizationGuid: 456
          }
        }
      };

      const res = await dal.getAuditLog(serviceContext, {
        input: {
          eventName: 'LoginSucceeded',
          offset: 6000,
          limit: 8000,
          fromDateTime,
          toDateTime,
          orderBy: [
            {
              field: 'id',
              direction: 'desc'
            }
          ]
        }
      });
      expect(res).toBeDefined();
      expect(res.limit).toEqual(8000);
      expect(res.offset).toEqual(6000);
    });

    it('A super admin can query audit logs for any organization', function () {
      const serviceContextForSuperAdmin = {
        _authInfo: {
          permissionMasks: [
            -2,
            805306367,
            -1071874305,
            1845493759,
            67108872,
            0,
            0,
            536870912
          ]
        }
      };
      let input = {
        organizationId: 9999,
        userId: 5555
      };

      dal.cleanInputConsideringTier(serviceContextForSuperAdmin, input);
      expect(input.organizationId).toBe(undefined);
      expect(input.userId).toEqual(5555);
    });
  });

  it('A super admin can query audit logs for an specific organization', function () {
    const serviceContextForSuperAdmin = {
      _authInfo: {
        permissionMasks: [
          -2,
          805306367,
          -1071874305,
          1845493759,
          67108872,
          0,
          0,
          536870912
        ]
      }
    };
    let input = {
      organizationId: '7682',
      userId: 5555
    };

    dal.cleanInputConsideringTier(serviceContextForSuperAdmin, input);
    expect(input.organizationId).toBe('7682');
    expect(input.userId).toEqual(5555);
  });

  it('validate if super admin can query audit logs for any organization', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: [
          -2,
          805306367,
          -1071874305,
          1845493759,
          67108872,
          0,
          0,
          536870912
        ]
      }
    };
    let input = {
      organizationId: '7682'
    };

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp).toBeUndefined();
  });

  it('validate if super admin can query audit logs for its own organization', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: [
          -2,
          805306367,
          -1071874305,
          1845493759,
          67108872,
          0,
          0,
          536870912
        ]
      }
    };
    let input = {
      organizationId: '123'
    };

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp).toBeUndefined();
  });

  it('validate if org admin can query audit logs for any organization', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: [16]
      }
    };
    let input = {
      organizationId: '7682'
    };

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp.message).toEqual(
      'Only a super admin can get audit logs from different organizations'
    );
    expect(resp.data.organizationId).toEqual(7682);
  });

  it('validate if org admin can query audit logs for its own organization', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: [16]
      }
    };
    let input = {
      organizationId: '123'
    };

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp).toBeUndefined();
  });

  it('validate if regular user can query audit logs for any organization', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: []
      }
    };
    let input = {
      organizationId: '7682'
    };

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp.message).toEqual(
      'Only a super admin can get audit logs from different organizations'
    );
    expect(resp.data.organizationId).toEqual(7682);
  });

  it('validate if regular user can query audit logs for its own organization', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: []
      }
    };
    let input = {
      organizationId: '123'
    };

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp).toBeUndefined();
  });

  it('validate that input param organizationId is ignored when it is null or undefined', function () {
    const serviceContextForSuperAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: []
      }
    };
    let input = {};

    let resp;
    try {
      dal.validateOrganization(
        serviceContextForSuperAdmin,
        input.organizationId
      );
    } catch (err) {
      resp = err;
    }
    expect(resp).toBeUndefined();
  });

  it('A org admin can query audit logs only for its organization', function () {
    const serviceContextForOrgAdmin = {
      requestContext: {
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: [16]
      }
    };
    let input = {
      organizationId: 9999,
      userId: 5555
    };

    dal.cleanInputConsideringTier(serviceContextForOrgAdmin, input);
    expect(input.organizationId).toEqual(123);
    expect(input.userId).toEqual(5555);
  });

  it('A org user can query audit logs only for its own actions into the org', function () {
    const serviceContextForRegularUser = {
      requestContext: {
        userInfo: {
          userId: 777,
          organization: {
            organizationId: 123
          }
        }
      },
      _authInfo: {
        permissionMasks: []
      }
    };
    let input = {
      eventNames: ['LoginSucceeded'],
      organizationId: 9999,
      userId: 5555
    };

    dal.cleanInputConsideringTier(serviceContextForRegularUser, input);
    expect(input.organizationId).toEqual(123);
    expect(input.userId).toEqual(777);
  });

  it('create the conditions to be added as part of the original query when offset position need to be moved', function () {
    const lastElement = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      organizationName: 'my private organization 1',
      targetId: '1232812301',
      requestIP: '23.185.0.1',
      targetType: 'authentication',
      eventType: 'authentication',
      organizationGuid: '38e2c453-20bc-4470-98ef-7c972bca67d6',
      userName: 'lowercase09',
      userId: '1959213091',
      actionResult: 'success',
      impersonatorUserId: '00081',
      organizationId: '45788',
      eventId: '100009',
      eventName: 'LoginSucceeded',
      originatorApplication: 'developer app',
      actionDetails: 'login successful',
      impersonatorUserName: 'otherUser01',
      actionName: 'login',
      originatorService: 'core-graphql-server',
      timestamp: '2023-12-18T22:03:21.021Z',
      id: '100'
    };
    const input = [
      {
        operator: 'range',
        field: 'timestamp',
        order: 'asc'
      }
    ];
    const result = dal.buildSearchAfterCondition(
      serviceContext,
      input,
      lastElement
    );
    expect(result.operator).toEqual('range');
    expect(result.field).toEqual('timestamp');
    expect(result.gt).toEqual('2023-12-18T22:03:21.021Z');
  });

  it('build the search query with the input params', function () {
    const gqlInfo = {
      schema: {
        _typeMap: {
          EventTypeEnum: {
            _values: [
              {
                name: 'media'
              },
              {
                name: 'task'
              },
              {
                name: 'asset'
              }
            ]
          }
        }
      }
    };

    const extraCondition = {
      operator: 'range',
      field: 'eventId',
      lt: '100009'
    };
    const input = {
      id: ['100006', '100007', '100005'],
      organizationId: '45788',
      userName: 'IamTheUser06',
      impersonatorUserName: 'otheruser',
      userId: '195921306',
      clientIpAddress: '23.185.0.6',
      clientUserAgent: 'Mozilla',
      objectId: '1232812303',
      targetType: 'task',
      eventType: 'task',
      eventName: 'Logout',
      eventNames: ['LoginSucceeded', 'LoginFailed'],
      impersonatorUserId: '0006',
      actionName: 'complete',
      correlationId: '1cc96fed-353d-43f0-b0b4-d97103a6eabc',
      toDateTime: '2024-04-10T22:03:21.021Z',
      fromDateTime: '2023-04-25:03:21.021Z',
      offset: 9,
      limit: 7,
      orderBy: [
        {
          field: 'id',
          direction: 'desc'
        },
        {
          field: 'objectId',
          direction: 'desc'
        },
        {
          field: 'targetType',
          direction: 'desc'
        },
        {
          field: 'createdDateTime',
          direction: 'desc'
        },
        {
          field: 'eventName',
          direction: 'desc'
        },
        {
          field: 'event',
          direction: 'desc'
        },
        {
          field: 'userName',
          direction: 'desc'
        },
        {
          field: 'userId',
          direction: 'desc'
        },
        {
          field: 'clientIpAddress',
          direction: 'desc'
        },
        {
          field: 'clientUserAgent',
          direction: 'desc'
        },
        {
          field: 'actionResult',
          direction: 'desc'
        },
        {
          field: 'actionName',
          direction: 'desc'
        },
        {
          field: 'impersonatorUserId',
          direction: 'desc'
        },
        {
          field: 'impersonatorUserName',
          direction: 'desc'
        },
        {
          field: 'originatorApplication',
          direction: 'desc'
        },
        {
          field: 'originatorService',
          direction: 'desc'
        },
        {
          field: 'organizationId',
          direction: 'desc'
        },
        {
          field: 'organizationName',
          direction: 'desc'
        }
      ]
    };

    const responseExpected = {
      index: ['audit_log'],
      query: {
        operator: 'and',
        conditions: [
          {
            operator: 'terms',
            field: '_id',
            _analyzer: null,
            values: ['100006', '100007', '100005']
          },
          {
            operator: 'term',
            field: 'organizationId',
            _analyzer: null,
            value: '45788'
          },
          {
            operator: 'query_string',
            field: 'userName',
            _analyzer: 'generic_name_analyzer',
            value: 'IamTheUser06'
          },
          {
            operator: 'query_string',
            field: 'impersonatorUserName',
            _analyzer: 'generic_name_analyzer',
            value: 'otheruser'
          },
          {
            operator: 'term',
            field: 'userId',
            _analyzer: null,
            value: '195921306'
          },
          {
            operator: 'term',
            field: 'requestIP',
            _analyzer: null,
            value: '23.185.0.6'
          },
          {
            operator: 'query_string',
            field: 'userAgent',
            _analyzer: 'autocomplete_index',
            value: 'Mozilla'
          },
          {
            operator: 'term',
            field: 'targetId',
            _analyzer: null,
            value: '1232812303'
          },
          {
            operator: 'term',
            field: 'targetType',
            _analyzer: null,
            value: 'task'
          },
          {
            operator: 'term',
            field: 'eventType.sort',
            _analyzer: null,
            value: 'task'
          },
          {
            operator: 'terms',
            field: 'eventName',
            _analyzer: null,
            values: ['LoginSucceeded', 'LoginFailed', 'Logout']
          },
          {
            operator: 'term',
            field: 'impersonatorUserId',
            _analyzer: null,
            value: '0006'
          },
          {
            operator: 'term',
            field: 'actionName',
            _analyzer: null,
            value: 'complete'
          },
          {
            operator: 'term',
            field: 'correlationId',
            _analyzer: null,
            value: '1cc96fed-353d-43f0-b0b4-d97103a6eabc'
          },
          {
            operator: 'range',
            field: 'timestamp',
            lte: '2024-04-10T22:03:21.021Z',
            gte: '2023-04-25:03:21.021Z'
          },
          {
            operator: 'terms',
            field: 'eventType.sort',
            values: ['media', 'task', 'asset']
          },
          {
            operator: 'range',
            field: 'eventId',
            lt: '100009'
          }
        ]
      },
      offset: 9,
      limit: 7
    };
    const result = dal.buildSearchQuery(
      serviceContext,
      input,
      extraCondition,
      gqlInfo
    );

    const areEqual =
      JSON.stringify(responseExpected) === JSON.stringify(result);
    expect(areEqual).toEqual(true);
  });

  it('build the sort property without to continue query', function () {
    const input = {
      orderBy: [
        {
          field: 'id',
          direction: 'desc'
        },
        {
          field: 'objectId',
          direction: 'desc'
        },
        {
          field: 'targetType',
          direction: 'desc'
        },
        {
          field: 'createdDateTime',
          direction: 'desc'
        },
        {
          field: 'eventName',
          direction: 'desc'
        },
        {
          field: 'eventType',
          direction: 'desc'
        },
        {
          field: 'userName',
          direction: 'desc'
        },
        {
          field: 'userId',
          direction: 'desc'
        },
        {
          field: 'clientIpAddress',
          direction: 'desc'
        },
        {
          field: 'clientUserAgent',
          direction: 'desc'
        },
        {
          field: 'actionResult',
          direction: 'desc'
        },
        {
          field: 'actionName',
          direction: 'desc'
        },
        {
          field: 'impersonatorUserId',
          direction: 'desc'
        },
        {
          field: 'impersonatorUserName',
          direction: 'desc'
        },
        {
          field: 'originatorApplication',
          direction: 'desc'
        },
        {
          field: 'originatorService',
          direction: 'desc'
        },
        {
          field: 'organizationId',
          direction: 'desc'
        },
        {
          field: 'organizationName',
          direction: 'desc'
        }
      ]
    };

    const responseExpected = [
      {
        field: '_id',
        order: 'desc'
      },
      {
        field: 'targetId',
        order: 'desc'
      },
      {
        field: 'targetType',
        order: 'desc'
      },
      {
        field: 'timestamp',
        order: 'desc'
      },
      {
        field: 'eventName',
        order: 'desc'
      },
      {
        field: 'eventType.sort',
        order: 'desc'
      },
      {
        field: 'userName.sort',
        order: 'desc'
      },
      {
        field: 'userId',
        order: 'desc'
      },
      {
        field: 'requestIP',
        order: 'desc'
      },
      {
        field: 'userAgent.sort',
        order: 'desc'
      },
      {
        field: 'actionResult',
        order: 'desc'
      },
      {
        field: 'actionName',
        order: 'desc'
      },
      {
        field: 'impersonatorUserId',
        order: 'desc'
      },
      {
        field: 'impersonatorUserName.sort',
        order: 'desc'
      },
      {
        field: 'originatorApplication',
        order: 'desc'
      },
      {
        field: 'originatorService',
        order: 'desc'
      },
      {
        field: 'organizationId',
        order: 'desc'
      },
      {
        field: 'organizationName.sort',
        order: 'desc'
      }
    ];
    const result = dal.orderBy(serviceContext, input, false);
    const areEqual =
      JSON.stringify(responseExpected) === JSON.stringify(result);
    expect(areEqual).toEqual(true);
  });

  it('build the sort property to continue query', function () {
    const input = {
      orderBy: [
        {
          field: 'id',
          direction: 'asc'
        },
        {
          field: 'objectId',
          direction: 'asc'
        },
        {
          field: 'targetType',
          direction: 'asc'
        },
        {
          field: 'createdDateTime',
          direction: 'asc'
        },
        {
          field: 'eventName',
          direction: 'asc'
        },
        {
          field: 'event',
          direction: 'asc'
        },
        {
          field: 'userName',
          direction: 'asc'
        },
        {
          field: 'userId',
          direction: 'asc'
        },
        {
          field: 'clientIpAddress',
          direction: 'asc'
        },
        {
          field: 'clientUserAgent',
          direction: 'asc'
        },
        {
          field: 'actionResult',
          direction: 'asc'
        },
        {
          field: 'actionName',
          direction: 'asc'
        },
        {
          field: 'impersonatorUserId',
          direction: 'asc'
        },
        {
          field: 'impersonatorUserName',
          direction: 'asc'
        },
        {
          field: 'originatorApplication',
          direction: 'asc'
        },
        {
          field: 'originatorService',
          direction: 'asc'
        },
        {
          field: 'organizationId',
          direction: 'asc'
        },
        {
          field: 'organizationName',
          direction: 'asc'
        }
      ]
    };

    const responseExpected = [
      {
        field: 'timestamp',
        order: 'asc'
      }
    ];
    const result = dal.orderBy(serviceContext, input, true);
    const areEqual =
      JSON.stringify(responseExpected) === JSON.stringify(result);
    expect(areEqual).toEqual(true);
  });

  it('build the sort property to continue query but without the input orderBy', function () {
    const input = {};
    const responseExpected = [
      {
        field: 'timestamp',
        order: 'desc'
      }
    ];
    const result = dal.orderBy(serviceContext, input, true);
    const areEqual =
      JSON.stringify(responseExpected) === JSON.stringify(result);
    expect(areEqual).toEqual(true);
  });

  it('builds the search query passing all supported event names if none was specified by the user', function () {
    const input = {};
    const testEvent_1 = 'LoginSucceeded';
    const testEvent_2 = 'LoginFailed';
    const testEvent_3 = 'PasswordChanged';
    const testType_1 = 'task';
    const testType_2 = 'asset';
    const testType_3 = 'engine';
    const gqlInfo = {
      schema: {
        _typeMap: {
          EventNameEnum: {
            _values: [
              {
                name: testEvent_1
              },
              {
                name: testEvent_2
              },
              {
                name: testEvent_3
              }
            ]
          },
          EventTypeEnum: {
            _values: [
              {
                name: testType_1
              },
              {
                name: testType_2
              },
              {
                name: testType_3
              }
            ]
          }
        }
      }
    };
    const result = dal.buildSearchQuery(serviceContext, input, null, gqlInfo);

    expect(result.query.conditions[1]).toEqual(
      expect.objectContaining({
        field: 'eventType.sort',
        operator: 'terms',
        values: [testType_1, testType_2, testType_3]
      })
    );
    expect(result.query.conditions[2]).toEqual(
      expect.objectContaining({
        field: 'eventName',
        operator: 'terms',
        values: [testEvent_1, testEvent_2, testEvent_3]
      })
    );
  });

  describe('buildAuditLogMessage', () => {
    it('should build message with all fields and multiple eventNames', () => {
      const userInfo = { userId: 'user-001' };
      const input = {
        organizationId: 'org-123',
        id: ['1', '2'],
        eventNames: ['LoginSucceeded', 'Logout'],
        userId: 'user-002',
        userName: 'johndoe',
        fromDateTime: '2024-01-01T00:00:00Z',
        toDateTime: '2024-01-31T23:59:59Z'
      };

      const message = dal.buildAuditLogMessage(userInfo, input);
      expect(message).toBe(
        'Query instanceAuditLog executed by user user-001 to get audit logs with organizationId org-123, ids [1, 2], eventNames [LoginSucceeded, Logout], userId user-002, userName johndoe, from 2024-01-01T00:00:00Z to 2024-01-31T23:59:59Z.'
      );
    });

    it('should build message with single eventName and single id', () => {
      const userInfo = { debug: { userName: 'adminUser' } };
      const input = {
        id: ['100'],
        eventNames: ['LoginFailed'],
        fromDateTime: '2024-03-01T00:00:00Z',
        toDateTime: '2024-03-10T00:00:00Z'
      };

      const message = dal.buildAuditLogMessage(userInfo, input);
      expect(message).toBe(
        'Query instanceAuditLog executed by user adminUser to get audit logs with id 100, eventName LoginFailed, from 2024-03-01T00:00:00Z to 2024-03-10T00:00:00Z.'
      );
    });

    it('should build message with minimal input and fallback user', () => {
      const userInfo = {};
      const input = {
        fromDateTime: '2024-04-01T00:00:00Z',
        toDateTime: '2024-04-15T00:00:00Z'
      };

      const message = dal.buildAuditLogMessage(userInfo, input);
      expect(message).toBe(
        'Query instanceAuditLog executed by user unknown to get audit logs with dateTime filter from 2024-04-01T00:00:00Z to 2024-04-15T00:00:00Z.'
      );
    });

    it('should include error message for InvalidInput error', () => {
      const userInfo = { debug: { userName: 'sysadmin' } };
      const input = {
        fromDateTime: '2024-05-01T00:00:00Z',
        toDateTime: '2024-05-10T00:00:00Z'
      };
      const error = new errors.InvalidInput(
        'The provided input failed validation checks.'
      );

      const message = dal.buildAuditLogMessage(userInfo, input, error);
      expect(message).toBe(
        'Error during execution of query instanceAuditLog by user sysadmin: The provided input failed validation checks.'
      );
    });

    it('should include generic error message for non-InvalidInput error', () => {
      const userInfo = { userId: 'generic-user' };
      const input = {
        fromDateTime: '2024-06-01T00:00:00Z',
        toDateTime: '2024-06-10T00:00:00Z'
      };
      const error = new Error('Unexpected error');

      const message = dal.buildAuditLogMessage(userInfo, input, error);
      expect(message).toBe(
        'Error during execution of query instanceAuditLog by user generic-user'
      );
    });
  });
});
