module.exports = function createModule() {
  const serviceContext = require('../../../test/serviceContext.mock.js')();
  if (!serviceContext.dal) serviceContext.dal = {};
  serviceContext.dal.taskTemplate = require('../dal/taskTemplate.js')(
    serviceContext
  );
  serviceContext.dal.jobTemplate = require('../dal/jobTemplate.js')(
    serviceContext
  );
  serviceContext.dal.sourceType = require('../dal/sourceType.js')(
    serviceContext
  );
  serviceContext.dal.source = require('../dal/source.js')(serviceContext);
  serviceContext.dal.scheduledJob = require('../dal/scheduledJob.js')(
    serviceContext
  );
  serviceContext.dal.jobPipeline = require('../dal/jobPipeline.js')(
    serviceContext
  );
  serviceContext.dal.dagTemplate = require('../dal/dagTemplate.js')(
    serviceContext
  );
  serviceContext.dal.jobDagTemplate = require('../dal/jobDagTemplate.js')(
    serviceContext
  );
  return serviceContext;
};
