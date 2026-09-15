const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('../../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

let resolvers;

beforeAll(() => {
  resolvers = require('./ScheduledJob.js')(serviceContext);
});

beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

describe('#ScheduledJob', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolvers).to.be.a('object');
      chaiExpect(Object.keys(resolvers).length).to.equal(15);
      chaiExpect(typeof resolvers.affiliates).to.equal('function');
      chaiExpect(typeof resolvers.primarySourceType).to.equal('function');
      chaiExpect(typeof resolvers.collaborators).to.equal('function');
      chaiExpect(typeof resolvers.permission).to.equal('function');
      chaiExpect(typeof resolvers.primarySource).to.equal('function');
      chaiExpect(typeof resolvers.organization).to.equal('function');
      chaiExpect(typeof resolvers.organizationId).to.equal('function');
      chaiExpect(typeof resolvers.jobs).to.equal('function');
      chaiExpect(typeof resolvers.contentTemplates).to.equal('function');
      chaiExpect(typeof resolvers.jobTemplateIds).to.equal('function');
      chaiExpect(typeof resolvers.jobTemplates).to.equal('function');
      chaiExpect(typeof resolvers.allJobTemplates).to.equal('function');
      chaiExpect(typeof resolvers.parts).to.equal('function');
      chaiExpect(typeof resolvers.sources).to.equal('function');
      chaiExpect(typeof resolvers.details).to.equal('function');
    });
  });

  describe('affiliates', function () {
    it('should get affiliates', async function () {
      const context = getGraphQLContext('user');
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 1234,
          source_id: 1234,
          scheduled_job_id: 123,
          hours_aired: 3,
          start_time: '01:00',
          stop_time: '02:00',
          status: 'active',
          scheduled_day: 3,
          start_date_time: moment().subtract(1, 'week').toISOString(),
          stop_date_time: moment().toISOString()
        }
      ]);
      const res = await resolvers.affiliates({ id: 123 }, {}, context);
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
    });
  });

  describe('collaborators', function () {
    it('should get collaborators - no source', async function () {
      const context = getGraphQLContext('user');
      const res = await resolvers.collaborators(
        {
          id: 123,
          organizationId: 7682
        },
        {},
        context
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records).to.deep.include({
        permission: 'owner',
        organizationId: '7682'
      });
    });
    it('should get collaborators - with source', async function () {
      const context = getGraphQLContext('user');
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            group_id: 'e2bef3f2-e3b1-43ef-9729-a174d75922d4'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            organizationId: 7682
          }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          kvp: {
            organizationId: 7681
          }
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 1234,
          group_id: 'e2bef3f2-e3b1-43ef-9729-a174d75922d4',
          permission: 'viewer'
        },
        {
          source_id: 1234,
          group_id: 'e2bef3f2-e3b1-43ef-9729-a174d75922d5',
          permission: 'editor'
        }
      ]);
      const res = await resolvers.collaborators(
        { id: 123, primarySourceId: 1234 },
        {},
        context
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);

      chaiExpect(res.records).to.deep.include({
        permission: 'viewer',
        sourceId: 1234,
        groupId: 'e2bef3f2-e3b1-43ef-9729-a174d75922d4',
        organizationId: '7682'
      });
      chaiExpect(res.records).to.deep.include({
        permission: 'editor',
        sourceId: 1234,
        groupId: 'e2bef3f2-e3b1-43ef-9729-a174d75922d5',
        organizationId: '7681'
      });
    });
  });

  describe('parts', function () {
    it('should get parts - source timezone', async function () {
      const obj = {
        id: 123,
        primarySourceId: 1231
      };
      const context = getGraphQLContext('user');
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 12300,
          name: 'test scheduled job part',
          status: 'active',
          start_time: '10:00',
          stop_time: '11:00',
          schedule_type: 'Weekly',
          scheduled_day: 1
        },
        {
          id: 12301,
          name: 'test scheduled job part',
          status: 'active',
          start_time: '01:00',
          stop_time: '02:00',
          schedule_type: 'Weekly',
          scheduled_day: 5
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 1231,
          liveTimezone: 'EST'
        }
      ]);
      const res = await resolvers.parts(obj, {}, context);

      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
    });

    it('should get parts - default timezone', async function () {
      const obj = {
        id: 123,
        primarySourceId: 1231
      };
      const context = getGraphQLContext('user');
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 12300,
          name: 'test scheduled job part',
          status: 'active',
          start_time: '10:00',
          stop_time: '11:00',
          schedule_type: 'Weekly',
          scheduled_day: 1
        },
        {
          id: 12301,
          name: 'test scheduled job part',
          status: 'active',
          start_time: '01:00',
          stop_time: '02:00',
          schedule_type: 'Weekly',
          scheduled_day: 5
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 1231,
          liveTimezone: 'EST'
        }
      ]);
      const res = await resolvers.parts(obj, {}, context);

      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
    });

    describe.each(['2020-02-01', '2020-06-01', '2020-12-01'])(
      'test day part time conversions at date: %s',
      function (date) {
        let dateNowSpy;
        beforeAll(() => {
          // Lock Time
          dateNowSpy = jest
            .spyOn(Date, 'now')
            .mockImplementation(() => Date.parse(date));
        });
        afterAll(() => {
          // Unlock Time
          dateNowSpy.mockRestore();
        });
        it.each([...moment.tz.names()])('tz: %s', async function (timeZone) {
          const obj = {
            id: 123,
            primarySourceId: 1231
          };
          const context = getGraphQLContext('user');
          const parts = [];
          for (let i = 0; i < 24; i++) {
            parts.push({
              id: i,
              name: `test scheduled job part at ${i} o'clock`,
              status: 'active',
              start_time: `${i}:00`.padStart(5, '0'),
              stop_time: `${(i + 3) % 24}:00`.padStart(5, '0'),
              schedule_type: 'Weekly',
              scheduled_day: 2
            });
          }
          // mock the ScheduleJob
          serviceContext.dbConnections['media_platform'].read._push(parts);
          serviceContext.dbConnections['media_platform'].read._push([]);
          serviceContext.dbConnections['media_platform'].read._push([
            {
              id: 1231,
              liveTimezone: timeZone
            }
          ]);

          const res = await resolvers.parts(obj, {}, context);

          chaiExpect(res).to.exist;
          chaiExpect(res.length).to.equal(24);
          for (const part of res) {
            chaiExpect(part.scheduleType).to.equal('Weekly');

            // converting the start/stopTime from UTC
            // to local time should give the same local hour
            // that we store in the id.
            chaiExpect(
              moment
                .utc()
                .set({
                  day: part.scheduledDayAsInt,
                  hour: parseInt(part.startTime),
                  minute: parseFloat(part.startTime.split(':')[1])
                })
                .tz(timeZone)
                .hour()
            ).to.equal(parseInt(part.id));
            chaiExpect(
              moment
                .utc()
                .set({
                  day: part.scheduledDayAsInt,
                  hour: parseInt(part.stopTime),
                  minute: parseFloat(part.startTime.split(':')[1])
                })
                .tz(timeZone)
                .hour()
            ).to.equal((parseInt(part.id) + 3) % 24);
          }
        });
      }
    );
  });

  describe('details', function () {
    it('should get details', async function () {
      const obj = {
        id: 123,
        hoursPerWeek: 10,
        kvp: {
          programLiveImage: 'https://s3.aws.amazon.com/test',
          programImage: 'https://s3.aws.amazon.com/test2',
          programFormat: 'foo',
          other: {
            foo: 'bar'
          }
        }
      };
      const res = await resolvers.details(obj, {}, {});
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'other.foo')).to.equal('bar');
      chaiExpect(res.programLiveImage).to.exist;
      chaiExpect(res.hoursPerWeek).to.equal(10);
    });
  });

  describe('jobTemplates', function () {
    it('should get some job templates - user', async function () {
      const context = getGraphQLContext('user');
      await testGetJobTemplates(context);
    });
    it('should get some job templates - org', async function () {
      const context = getGraphQLContext('api_org');
      await testGetJobTemplates(context);
    });
    it('should get some job templates - internal', async function () {
      const context = getGraphQLContext('api_internal');
      await testGetJobTemplates(context);
    });

    it('should get no job templates', async function () {
      const obj = {
        id: 123,
        taskData: {
          jobTemplateIds: []
        }
      };
      const res = await resolvers.jobTemplates(obj, {}, {});
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
  });

  describe('allJobTemplates', function () {
    it('should get some of all job templates - user', async function () {
      const context = getGraphQLContext('user');
      await testGetAllJobTemplates(context);
    });
    it('should get some of all job templates - org', async function () {
      const context = getGraphQLContext('api_org');
      await testGetAllJobTemplates(context);
    });
    it('should get some of all job templates - internal', async function () {
      const context = getGraphQLContext('api_internal');
      await testGetAllJobTemplates(context);
    });

    it('should get none of all job templates', async function () {
      const obj = {
        id: 123,
        taskData: {
          jobTemplateIds: []
        }
      };
      const res = await resolvers.allJobTemplates(obj, {}, {});
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
  });

  describe('primarySourceType', function () {
    it('should not get if no primary source type id', async function () {
      const obj = { id: 1123 };
      const res = await resolvers.primarySourceType(obj, {}, {});
      chaiExpect(res).to.be.null;
    });
    it('should get if primary source type id', async function () {
      const obj = {
        id: 123,
        primarySourceTypeId: 15
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 15,
          name: 'test source type'
        }
      ]);
      const res = await resolvers.primarySourceType(obj, {}, {});
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(obj.primarySourceTypeId);
    });
  });

  describe('primarySource', function () {
    it('should not get if no primary source id', async function () {
      const obj = { id: 1123 };
      const res = await resolvers.primarySource(obj, {}, {});
      chaiExpect(res).to.be.null;
    });
    it('should get if primary source id - user', async function () {
      const context = getGraphQLContext(null, 'user');
      await testGetPrimarySource(context);
    });
    it('should get if primary source id - api', async function () {
      const context = getGraphQLContext(null, 'api_org');
      await testGetPrimarySource(context);
    });
    it('should get if primary source id - internal', async function () {
      const context = getGraphQLContext(null, 'api_internal');
      await testGetPrimarySource(context);
    });
  });

  describe('organization', function () {
    it('should get non-default org', async function () {
      const obj = {
        id: 134,
        organizationId: 1
      };
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organization_id: 1,
            organization_name: 'foo'
          }
        ],
        false
      );
      chaiExpect(resolvers.organizationId(obj, {}, {})).to.equal(1);
      const org = await resolvers.organization(obj, {}, {});
      chaiExpect(org).to.exist;
      chaiExpect(org.id).to.equal(1);
    });
    it('should get default org', async function () {
      const obj = { id: 134 };
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organization_id: 7682,
            organization_name: 'default org'
          }
        ],
        false
      );

      chaiExpect(resolvers.organizationId(obj, {}, {})).to.equal(7682);
      const org = await resolvers.organization(obj, {}, {});
      chaiExpect(org).to.exist;
      chaiExpect(org.id).to.equal(7682);
    });
  });

  describe('sources', function () {
    it('should get sources - user', async function () {
      const context = getGraphQLContext(null, 'user');
      await testGetSources(context);
    });
    it('should get sources - internal', async function () {
      const context = getGraphQLContext(null, 'api_internal');
      await testGetSources(context);
    });
    it('should get sources - org', async function () {
      const context = getGraphQLContext(null, 'api_org');
      await testGetSources(context);
    });
  });

  describe('jobs', function () {
    it('should get jobs - user', async function () {
      const context = getGraphQLContext(null, 'user');
      await testGetJobs(context);
    });
    it('should get jobs - internal', async function () {
      const context = getGraphQLContext(null, 'api_internal');
      await testGetJobs(context);
    });
    it('should get jobs - org', async function () {
      const context = getGraphQLContext(null, 'api_org');
      await testGetJobs(context);
    });
  });

  describe('contentTemplates', function () {
    it('should get content templates - user', async function () {
      const context = getGraphQLContext(null, 'user');
      await testGetContentTemplates(context);
    });
    it('should get content templates - org', async function () {
      const context = getGraphQLContext(null, 'api_org');
      await testGetContentTemplates(context);
    });
    it('should get content templates - user', async function () {
      const context = getGraphQLContext(null, 'api_internal');
      await testGetContentTemplates(context);
    });
  });

  describe('permission', function () {
    it('should get permission - user', async function () {
      const context = mockUtil.makeContext();
      await testGetPermission(context, 'user');
    });
    it('should get permission - org', async function () {
      const context = mockUtil.makeContext({ authType: 'api_org' });
      await testGetPermission(context, 'api_org');
    });
    it('should get permission - internal', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      await testGetPermission(context, 'api_internal');
    });
  });
});

async function testGetPermission(context, tokenType) {
  const obj = {
    id: 123,
    organizationId: 7683,
    primarySourceId: 1231
  };
  // first check where there is an explicit permission
  serviceContext.dbConnections['media_platform'].read._push([
    {
      permission: 'editor'
    }
  ]);

  let res = await resolvers.permission(obj, {}, context);
  chaiExpect(res).to.exist;
  chaiExpect(res).to.equal('editor');

  serviceContext.dbConnections['media_platform'].read._clearResultQueue();

  serviceContext.dbConnections['media_platform'].read._push([]);
  const obj2 = {
    id: 134,
    organizationId: 7682,
    primarySourceId: 1233
  };

  // check that tokens own their own org's objects
  // or that internal tokens get 'viewer' only
  let res2 = await resolvers.permission(obj2, {}, context);
  chaiExpect(res2).to.exist;

  const expected = tokenType === 'api_internal' ? 'viewer' : 'owner';
  chaiExpect(res2).to.equal(expected);
}

async function testGetSources(context) {
  const obj = {
    id: 1234,
    organizationId: 7682
  };
  serviceContext.dbConnections['media_platform'].read._push([
    {
      id: 3455,
      name: 'test primary source 1'
    }
  ]);
  serviceContext.dbConnections['core'].read._push([
    {
      id: 3456
    }
  ]);
  serviceContext.dbConnections['media_platform'].read._push([
    {
      id: 3455,
      name: 'test primary source 1'
    },
    {
      id: 3456,
      name: 'test other source'
    }
  ]);
  serviceContext.dbConnections['sso'].read._push(
    [
      {
        group_id: '725ce522-6bdd-428c-8edf-8bcab4241e26'
      }
    ],
    false
  );
  const res = await resolvers.sources(obj, {}, context);
  chaiExpect(res).to.exist;
  chaiExpect(res.count).to.equal(2);
}

async function testGetPrimarySource(context) {
  const obj = {
    id: 123,
    primarySourceId: 30015
  };
  serviceContext.dbConnections['media_platform'].read._push([
    {
      id: 30015,
      name: 'test source'
    }
  ]);
  const res = await resolvers.primarySource(obj, {}, {});
  chaiExpect(res).to.exist;
  chaiExpect(res.id).to.equal(obj.primarySourceId);
}

async function testGetJobTemplates(context) {
  const obj = {
    id: 123,
    taskData: {
      jobTemplateIds: [456, 789]
    }
  };
  serviceContext.dbConnections['core'].write._push([
    {
      id: 789
    },
    {
      id: 456
    }
  ]);
  const res = await resolvers.jobTemplates(obj, {}, {});
  chaiExpect(res).to.exist;
  chaiExpect(res.count).to.equal(2);
  const ids = await resolvers.jobTemplateIds(obj, {}, {});
  chaiExpect(ids).to.deep.equal([456, 789]);
}

async function testGetAllJobTemplates(context) {
  const obj = {
    id: 123,
    taskData: {
      allJobTemplateIds: [456, 789]
    }
  };
  serviceContext.dbConnections['core'].write._push([
    {
      id: 789
    },
    {
      id: 456
    }
  ]);
  const res = await resolvers.allJobTemplates(obj, {}, {});
  chaiExpect(res).to.exist;
  chaiExpect(res.count).to.equal(2);
}

async function testGetContentTemplates(context) {
  const obj = {
    id: 123
  };
  serviceContext.dbConnections['media_platform'].read._push([
    {
      id: 12300,
      scheduled_job_id: 123,
      sdo_id: 12300,
      schema_id: 212300,
      created_date_time: moment().toISOString(),
      modified_date_time: moment().toISOString()
    },
    {
      id: 12301,
      scheduled_job_id: 123,
      sdo_id: 12200,
      schema_id: 212200,
      created_date_time: moment().toISOString(),
      modified_date_time: moment().toISOString()
    }
  ]);
  const res = await resolvers.contentTemplates(obj, {}, context);
  chaiExpect(res).to.exist;
  chaiExpect(res.length).to.equal(2);
}

async function testGetJobs(context) {
  const obj = {
    id: 123,
    organizationId: 7682
  };
  serviceContext.dbConnections['core'].read._push([
    {
      id: 1231
    },
    {
      id: 1232
    },
    {
      id: 1233
    }
  ]);
  const res = await resolvers.jobs(obj, {}, context);
  chaiExpect(res).to.exist;
  chaiExpect(res.count).to.equal(3);
}

function getGraphQLContext(token, type) {
  const context = mockUtil.getGraphQLContext(token, type);
  const res = {
    _authInfo: context
  };

  return res;
}
