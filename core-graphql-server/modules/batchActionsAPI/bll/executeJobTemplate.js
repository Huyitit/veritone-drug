const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  const batchUtil = require('./util.js')(serviceContext);
  const dalTdoBatch = serviceContext.dal.tdoBatch;
  const dalBpRedis = serviceContext.dal.batchProcessRedis;
  const dagTemplate = serviceContext.bll.dagTemplate;
  const cluster = require('../../v3DataModel/dal/cluster')(serviceContext);
  const batchEvent = require('../messaging/event-emitter')(serviceContext);
  const { InvalidInput, NotAllowed } = require('../../../error')(
    serviceContext.config
  );
  const resUtil = require('../../../resolvers/util.js')(serviceContext);

  /**
   * create and execute or rerun an existing batch process from the parent TDOBatch object and captures the specifics about
   * the creation of a job per TDO in the process_definition in the db.
   * An event is emitted and the rest of the processing takes place in eventing-service.
   *
   * @param {Object} context The request context
   * @param {Object} root
   * @param {Object} args
   **/
  async function exec(context, root, args) {
    if (
      !batchUtil.isAValidOrganization(context, {
        organizationId: root.orgId
      })
    ) {
      throw new NotAllowed({
        message: 'user does not belong to the organization',
        data: {
          objectType: 'batch'
        }
      });
    }

    if (!batchUtil.hasOperationsRightForBatchExecutions(context)) {
      throw new NotAllowed({
        data: {
          objectType: 'batch'
        }
      });
    }

    const processDefinition = args.input.processDefinition;
    if (!processDefinition) {
      throw new InvalidInput({
        message: 'processDefinition is a mandatory input argument'
      });
    }

    if (!processDefinition.dagTemplateId) {
      throw new InvalidInput({
        message:
          'dagTemplateId is a mandatory input argument in processDefinition'
      });
    }

    if (!processDefinition.clusterId) {
      throw new InvalidInput({
        message: 'clusterId is a mandatory input argument in processDefinition'
      });
    }

    // to validate if dagTemplateId exists. It throws an error if not
    const templateResult = await dagTemplate.getDagTemplate(context, {
      id: processDefinition.dagTemplateId,
      organizationId: root.orgId
    });

    // A super admin can retrieve any DAG template; however, they cannot create a new batch process with a DAG template
    // outside their organization due to the limited scope of the JWT token used for job creation.
    if (!_.isNil(templateResult) && resUtil.isSuperAdmin(context._authInfo)) {
      if (Number(templateResult.targetOrganizationId) !== root.orgId) {
        throw new InvalidInput({
          message: 'dagTemplate does not belong to the organization'
        });
      }
    }

    // to validate if the clusterId exists. It throws an error if not
    await cluster.getCluster(context, {
      id: processDefinition.clusterId
    });

    if (!args.input.concurrency || !(args.input.concurrency > 0)) {
      throw new InvalidInput({
        message: `concurrency for executeJobTemplate needs to be greater than zero`,
        data: {
          objectType: 'searchQuery'
        }
      });
    }

    const bpFound = await dalTdoBatch.getBatchProcesses(context, {
      batchId: root.id,
      organizationId: root.orgId
    });

    // if a batch process already exists, it's necessary to has a valid status to be executed again
    if (bpFound.length > 0) {
      const batchProcess = bpFound[0];
      const notAllowedStatuses = [
        dalTdoBatch.batchProcessStatus.creating,
        dalTdoBatch.batchProcessStatus.pending,
        dalTdoBatch.batchProcessStatus.running,
        dalTdoBatch.batchProcessStatus.canceling,
        dalTdoBatch.batchProcessStatus.failed
      ];
      if (notAllowedStatuses.includes(batchProcess.status)) {
        throw new InvalidInput({
          message: `batchProcess need to be with status 'completed', 'canceled' or 'aborted'.
           batchProcess with id ${batchProcess.id} has status ${batchProcess.status}`
        });
      }

      // pending is the status to be taken until the eventing service gets it and starts the action execution process.
      // At that point 'running' will be the new status.
      // it's an automatic process connected by an event
      const bpUpdated = await dalTdoBatch.updateBatchProcess(context, {
        batchProcessId: batchProcess.id,
        status: dalTdoBatch.batchProcessStatus.pending,
        organizationId: root.orgId,
        concurrency: args.input.concurrency,
        processDefinition: processDefinition,
        modifiedBy: args.input.modifiedBy ? args.input.modifiedBy : null
      });

      // a new redis object is created with jobsRunning zero
      await dalBpRedis.createBatchProcessObject(context, {
        batchProcessId: bpUpdated.id,
        status: bpUpdated.status,
        concurrency: bpUpdated.concurrency,
        jobsRunning: 0
      });

      const token = batchUtil.createBatchJwtToken(context, {
        batchId: bpUpdated.batchId,
        batchProcessId: bpUpdated.id,
        organizationId: bpUpdated.organizationId
      });

      // event emitted to be handled in eventing service
      batchEvent.emitTDOBatchJobProcessCreated({
        batchProcessId: bpUpdated.id,
        organizationId: bpUpdated.organizationId,
        token
      });
      return bpUpdated;
    }

    // if batch process not exists, a new one will be created
    const defaultInputToCreateBp = {
      batchId: root.id,
      processDefinition: processDefinition,
      orgId: root.orgId,
      concurrency: args.input.concurrency,
      createdBy: root.createdBy ? root.createdBy : null
    };

    const isDynamic = !root.selectionCriteria.tdoIds;

    if (isDynamic) {
      if (root.fromTdoBatchQuery) {
        const itemsCount = await dalTdoBatch.countBatchItems(context, {
          batchId: root.id
        });
        defaultInputToCreateBp.status = dalTdoBatch.batchProcessStatus.pending;
        defaultInputToCreateBp.pendingCount = itemsCount[0].total;
        defaultInputToCreateBp.totalCount = itemsCount[0].total;
      } else {
        defaultInputToCreateBp.status = dalTdoBatch.batchProcessStatus.creating;
      }
    } else {
      const count = root.selectionCriteria.tdoIds.length;
      defaultInputToCreateBp.status = dalTdoBatch.batchProcessStatus.pending;
      defaultInputToCreateBp.pendingCount = count;
      defaultInputToCreateBp.totalCount = count;
    }

    const bpCreated = await dalTdoBatch.insertBatchProcess(
      context,
      defaultInputToCreateBp
    );

    // a new redis object is created with jobsRunning zero
    await dalBpRedis.createBatchProcessObject(context, {
      batchProcessId: bpCreated.id,
      status: bpCreated.status,
      concurrency: bpCreated.concurrency,
      jobsRunning: 0
    });

    // for a dynamic case, a TDOBatchJobProcessCreated event will be thrown from graphql server only for the case when a
    // batch process is created using TDOBatch query. In other case, the event will be thrown from handler tdoSearchProcessCreated in eventing service.
    // For a static case, a TDOBatchJobProcessCreated event will be thrown only from graphql server.
    if ((isDynamic && root.fromTdoBatchQuery) || !isDynamic) {
      const token = batchUtil.createBatchJwtToken(context, {
        batchId: bpCreated.batchId,
        batchProcessId: bpCreated.id,
        organizationId: bpCreated.organizationId
      });

      await batchEvent.emitTDOBatchJobProcessCreated({
        batchProcessId: bpCreated.id,
        organizationId: bpCreated.organizationId,
        token
      });
    }

    return bpCreated;
  }

  return {
    exec
  };
};
