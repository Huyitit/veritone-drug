const _ = require('lodash');
const moment = require('moment-timezone');

module.exports = function createFunction(serviceContext) {
  const dalSource = serviceContext.dal.source;
  const dalScheduledJob = serviceContext.dal.scheduledJob;
  const dalJobTemplate = serviceContext.dal.jobTemplate;
  const dalJobPipeline = serviceContext.dal.jobPipeline;
  const dalJob = serviceContext.dal.job;
  const dalSourceType = serviceContext.dal.sourceType;
  const cache = require('../../resolvers/cache.js')(serviceContext);

  const mainUtil = require('../../util.js')(serviceContext);
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const useNewJobQuery =
    _.get(serviceContext, 'config.featureFlags.useNewJobQuery', true) === true;

  const dayMap = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday'
  };

  async function getLiveTimeZone(context, scheduledJob) {
    let res = 'US/Pacific';
    if (scheduledJob.primarySourceId) {
      const _args = {
        organizationId: scheduledJob.organizationId,
        id: scheduledJob.primarySourceId
      };
      const source = await cache.get(context, _args, 'Source', () =>
        serviceContext.dal.source.getSource(context, _args)
      );

      if (source.liveTimezone) res = source.liveTimezone;
    }
    return res;
  }

  return {
    details: (obj, args, context) => dalScheduledJob.getDetails(obj, context),
    sources: (obj, args, context) =>
      dalSource.getSourcesForSchedule(
        context,
        Object.assign(
          {
            organizationId: obj.organizationId,
            applicationId: obj.applicationId
          },
          args
        ),
        obj.id
      ),
    parts: async (obj, args, context) => {
      args.scheduledJob = obj;
      const parts = await dalScheduledJob.getScheduleParts(
        context,
        Object.assign({ id: obj.id }, args)
      );

      // default to US/Pacific if live timezone is missing
      const timezone = await getLiveTimeZone(context, obj);
      const tzMoment = moment().tz(timezone);
      const tzOffsetMinutes = tzMoment._offset;

      // covert data stored in station local timezone to utc
      if (parts && parts.length > 0) {
        parts.forEach((part) => {
          part.scheduledDayLocal = part.scheduledDay;

          if (part.scheduledDay && part.startTime) {
            const b = moment
              .tz(part.startTime, 'HH:mm:ss', timezone)
              .day(part.scheduledDay)
              .utc();

            part.scheduledDay = dayMap[b.day()];
          }

          if (part.startTime) {
            part.startTime = mainUtil
              .parseTimeOnly(part.startTime)
              .time.minusMinutes(tzOffsetMinutes)
              .toLocaleString();
          }

          if (part.stopTime) {
            part.stopTime = mainUtil
              .parseTimeOnly(part.stopTime)
              .time.minusMinutes(tzOffsetMinutes)
              .toLocaleString();
          }
        });
      }

      return parts;
    },
    jobTemplates: (obj, args, context) => {
      const _args = Object.assign({
        organizationId: obj.organizationId
      });
      if (useNewJobQuery) {
        const ids = _.get(obj, 'taskData.jobTemplateIds', []);
        if (!ids.length) return mainUtil.emptyPage(args);
        _args.id = ids;
      } else {
        _args.scheduledJobId = obj.id;
      }
      return cache.get(context, _args, 'JobTemplates', () =>
        dalJobTemplate.getJobTemplates(context, _args)
      );
    },
    allJobTemplates: (obj, args, context) => {
      const _args = Object.assign({
        organizationId: obj.organizationId
      });
      if (useNewJobQuery) {
        const ids = [...new Set(_.get(obj, 'taskData.allJobTemplateIds', []))];
        if (!ids.length) return mainUtil.emptyPage(args);
        _args.id = ids;
      } else {
        _args.allForScheduledJobId = obj.id;
      }
      return cache.get(context, _args, 'JobTemplates', () =>
        dalJobTemplate.getJobTemplates(context, _args)
      );
    },
    jobTemplateIds: (obj, args, context) =>
      useNewJobQuery
        ? _.get(obj, 'taskData.jobTemplateIds', [])
        : dalScheduledJob.getJobTemplateIdsForScheduledJob(context, obj),
    contentTemplates: (obj, args, context) => {
      return cache.get(
        context,
        { id: obj.id },
        'ScheduledJobContentTemplates',
        () =>
          dalScheduledJob.getScheduledJobContentTemplates(context, {
            id: obj.id
          })
      );
    },
    jobs: (obj, args, context) => {
      const _args = Object.assign(
        {
          scheduledJobId: obj.id,
          organizationId: obj.organizationId,
          applicationId:
            obj.applicationId ||
            _.get(context, '_authInfo.groups[0].applicationId')
        },
        args
      );

      // Add a date filter to reduce the number of scanned partitions
      // jobs should be always newer than the program
      const minStart = moment(obj.createdDateTime);
      if (moment.unix().subtract(5, 'minutes').isBefore(minStart)) {
        // if the the program is new/just created skip the job retrieval
        return mainUtil.emptyPage(args);
      }
      const dateFilters = _args.dateFilter || [];
      dateFilters.push({
        field: 'createdDateTime',
        fromDateTime: minStart.toISOString()
      });
      _args.dateFilter = dateFilters;

      return cache.get(context, _args, 'Jobs', () =>
        dalJob.getJobs(context, _args)
      );
    },
    organizationId: (obj) => obj.organizationId || 7682,
    organization: (obj, args, context) => {
      const id = obj.organizationId || 7682;
      return cache.get(context, { id: id }, 'Organization', () =>
        serviceContext.dal.organization.getOrganization(context, { id: id })
      );
    },
    primarySource: (obj, args, context) => {
      const _args = {
        organizationId: obj.organizationId,
        id: obj.primarySourceId
      };
      return obj.primarySourceId
        ? cache.get(context, _args, 'Source', () =>
            serviceContext.dal.source.getSource(context, _args)
          )
        : null;
    },
    permission: (obj, args, context) =>
      dalScheduledJob.getScheduledJobPermission(context, args, obj),
    collaborators: (obj, args, context) => {
      return dalScheduledJob.getCollaborators(context, args, obj);
    },
    primarySourceType: (obj, args, context) => {
      return obj.primarySourceTypeId
        ? cache.get(
            context,
            { id: obj.primarySourceTypeId },
            'SourceType',
            () =>
              dalSourceType.getSourceType(context, {
                id: obj.primarySourceTypeId
              })
          )
        : null;
    },
    affiliates: async (obj, args, context) => {
      const affiliatePage = await dalScheduledJob.getAffiliates(
        context,
        args,
        obj
      );
      // default to US/Pacific if primary source or live timezone is missing
      const timezone = await getLiveTimeZone(context, obj);
      const tzMoment = moment().tz(timezone);
      const tzOffsetMinutes = Math.abs(tzMoment._offset);

      if (affiliatePage.records && affiliatePage.records > 0) {
        const affiliates = affiliatePage.records;
        // covert data stored in station timezone to utc
        affiliates.forEach((affiliate) => {
          if (affiliate.scheduledDay && affiliate.startTime) {
            const b = moment
              .tz(affiliate.startTime, 'HH:mm:ss', timezone)
              .day(affiliate.scheduledDay)
              .utc();

            affiliate.scheduledDay = dayMap[b.day()];
          }

          if (affiliate.startTime) {
            affiliate.startTime = mainUtil
              .parseTimeOnly(affiliate.startTime)
              .time.plusMinutes(tzOffsetMinutes)
              .toLocaleString();
          }
          if (affiliate.stopTime) {
            affiliate.stopTime = mainUtil
              .parseTimeOnly(affiliate.stopTime)
              .time.plusMinutes(tzOffsetMinutes)
              .toLocaleString();
          }
          affiliate.scheduledDayLocal = affiliate.scheduledDay;
        });
      }
      return affiliatePage;
    }
  };
};
