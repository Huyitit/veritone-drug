const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const batchUtil = require('./util.js')(serviceContext);
  const dalTdoBatch = serviceContext.dal.tdoBatch;
  const dalBpRedis = serviceContext.dal.batchProcessRedis;
  const dalJob = serviceContext.dal.job;
  const dalTdo = serviceContext.dal.tdo;
  const mainUtil = require('../../../util.js')(serviceContext);
  const batchEvent = require('../messaging/event-emitter')(serviceContext);
  const resUtil = require('../../../resolvers/util.js')(serviceContext);

  const {
    InvalidInput,
    NotFound,
    InternalServerError,
    NotAllowed
  } = require('../../../error')(serviceContext.config);

  // the maximum size for a batch
  const SANITY_LIMIT_OF_TDOS = 200000;

  if (!_.isObject(dalTdoBatch)) {
    throw new InternalServerError({
      message: 'dal.tdoBatch dependency needs to be injected'
    });
  }

  /**
   * Create a new batch
   * If input comes with a dynamic query in the batchSelector field, then the initial status will be 'creating' until the search
   * process of all tdos get done in eventing service.
   * If input comes with a defined list of tdos in the batchSelector field, then the initial status will be 'pending' due to
   * it's not necessary goes against the search server in the eventing service
   *
   * @param {Object} context The request context
   * @param {Object} args
   **/
  async function createBatch(context, args) {
    if (
      !batchUtil.isAValidOrganization(context, {
        organizationId: args.input.orgId
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

    const selector = args.input.batchSelector;
    if (!selector.tdoIds && !selector.searchQuery) {
      throw new InvalidInput({
        message: `input argument 'batchSelector' must has one of mutually exclusive fields 'tdoIds' or 'searchQuery'`
      });
    }

    if (selector.tdoIds) {
      if (selector.tdoIds.length === 0) {
        throw new InvalidInput({
          message: `tdoIds list must contain at least one element`
        });
      }

      args.input.status = dalTdoBatch.batchStatus.created;
      const res = await dalTdoBatch.insertBatch(context, args.input);

      // saving all the tdos that will be members of the batch
      await dalTdoBatch.insertBatchItem(context, {
        batchId: res.id,
        tdoIds: selector.tdoIds
      });
      return res;

      // it's necessary goes asynchronously against search server using an event for eventing service.
      // meantime the initial status for batch  will be 'creating'.
    } else if (selector.searchQuery) {
      validateSearchQueryObject(selector.searchQuery);
      args.input.status = dalTdoBatch.batchStatus.creating;
      const res = await dalTdoBatch.insertBatch(context, args.input);

      const token = batchUtil.createBatchJwtToken(context, {
        batchId: res.id,
        organizationId: res.orgId
      });

      await batchEvent.emitTDOSearchProcessCreated({
        batchId: res.id,
        organizationId: res.orgId,
        searchQuery: selector.searchQuery,
        token,
        skipTdosAfterEventCreation: args.input.skipTdosAfterEventCreation
      });

      return res;
    }
  }

  /**
   * find all tdos related to the selector defined from input.
   * This tdos are the members of the batch and are available to be executed by each mutator attached to the batch
   *
   * @param {Object} context The request context
   * @param {Object} root
   * @param {Object} args
   **/
  async function getBatchItemsId(context, root, args) {
    args.batchId = root.id;
    args.organizationId = root.orgId;
    const itemsList = await dalTdoBatch.getBatchItems(context, args);
    const idList = itemsList.map((item) => item.itemId);
    return mainUtil.toPage(args, idList);
  }

  /**
   * Get the temporalDataObject details of a batch member
   * This request can come from the TDOBatch type in graphql schema
   *
   * @param {Object} context The request context
   * @param {Object} root
   * @param {Object} args
   **/
  async function getTdosForBatch(context, root, args) {
    const idList = await getBatchItemsId(context, root, args);
    return await dalTdo.getTDOs(context, {
      id: idList.records,
      offset: args.offset,
      limit: args.limit
    });
  }

  /**
   * Get existing batch by id and orgId
   *
   * @param {Object} context The request context
   * @param {Object} args
   **/
  async function getTdoBatch(context, args) {
    const ownerOrgId = resUtil.getOrgFromAuthContext(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (_.isNil(ownerOrgId) && !isSuperAdmin) {
      throw new NotAllowed({
        message:
          'user does not belong to the organization or does not have rights',
        data: {
          batchId: args.id,
          objectType: 'batch'
        }
      });
    }

    try {
      const batchObj = await dalTdoBatch.getBatch(context, {
        id: args.id,
        organizationId: ownerOrgId
      });
      batchObj.fromTdoBatchQuery = true;
      return batchObj;
    } catch (e) {
      throw new NotFound({
        message: `batchId not exists or access denied`,
        data: {
          batchId: args.id,
          objectType: 'batch'
        }
      });
    }
  }

  /**
   * Get BatchProcesses by ID, status or a tdo that is member of the batch.
   * If 'args.tdoId' is passed, it will get the BatchProcessId from the
   * item member of the batch process in batch_process_item table.
   *
   * @param {Object} context The request context
   * @param {Object} args
   **/
  async function getBatchProcesses(context, args) {
    const ownerOrgId = resUtil.getOrgFromAuthContext(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (_.isNil(ownerOrgId) && !isSuperAdmin) {
      throw new NotAllowed({
        message:
          'user does not belong to the organization or does not have rights',
        data: {
          batchId: args.id,
          objectType: 'batch'
        }
      });
    }

    const input = args.input;
    input.organizationId = ownerOrgId;

    if (input.tdoId) {
      // member exists in batch_process_item table because some mutator was executed previously over the tdo set.
      const bpItems = await dalTdoBatch.getBatchProcessItem(context, {
        tdoId: input.tdoId,
        organizationId: input.organizationId,
        orderBy: input.orderBy ? input.orderBy : null
      });
      if (bpItems.length === 0) {
        throw new NotFound({
          message: `Specified tdo doesn't exist or access denied`,
          objectId: input.tdoId
        });
      }
      input.ids = bpItems.map((item) => {
        return item.batchProcessId;
      });
    }

    return await dalTdoBatch.getBatchProcesses(context, input);
  }

  /**
   * Get the actions/jobs generated for each member of a batch process.
   * It can filter actions by jobs status.
   * It will get the members from batch_process_item table.
   * action has its own type `BatchActionResultList` in graphql schema,
   * This type has a list of `TDOBatchJobActionResult` that is a graphql type
   * where the job and tdo related to the batch process can be recovered.
   *
   * @param {Object} context The request context
   * @param {Object} root
   * @param {Object} args
   **/
  async function GetActionsForABatchProcess(context, root, args) {
    args.batchProcessId = root.id;
    args.organizationId = root.organizationId;
    const membersList = await dalTdoBatch.getBatchProcessItem(context, args);

    let actionIds = [];
    for (const member of membersList) {
      if (!_.isNil(member.actionId)) {
        actionIds.push(member.actionId);
      }
    }

    if (actionIds.length === 0) {
      return mainUtil.emptyPage(args);
    }

    const jobInput = {
      id: actionIds,
      orderBy: args.orderBy || null
    };
    if (args.status) {
      jobInput.status = args.status;
    }

    const jobs = await dalJob.getJobs(context, jobInput);

    const objs = jobs.records.map((job) => {
      return {
        targetId: job.targetId,
        actionId: job.jobId,
        status: job.status,
        details: {
          name: job.name,
          description: job.description,
          clusterId: job.clusterId,
          jobConfig: job.jobConfig
        }
      };
    });

    return mainUtil.toPage(args, objs);
  }

  /**
   * Update a batch process to 'canceling'.
   * With this new status in batch process the further actions
   * to execute over members of a batch process will be canceled.
   * Once the actions executed previous to canceling request get done, the
   * running counting in batch process will be zero and the final status for the batch process will be 'canceled'.
   *
   * @param {Object} context The request context
   * @param {Object} args
   **/
  async function cancelTdoBatchProcess(context, args) {
    const ownerOrgId = resUtil.getOrgFromAuthContext(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (_.isNil(ownerOrgId) && !isSuperAdmin) {
      throw new NotAllowed({
        message:
          'user does not belong to the organization or does not have rights',
        data: {
          batchId: args.id,
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

    const bpFounds = await dalTdoBatch.getBatchProcesses(context, {
      id: args.id,
      organizationId: ownerOrgId
    });

    if (bpFounds.length === 0) {
      throw new NotFound({
        message: `batchProcessId not exists or access denied`,
        data: {
          batchProcessId: args.id,
          objectType: 'batchProcess'
        }
      });
    }

    // to update a batch process to canceling, it's necessary to have a current valid status
    const bpFound = bpFounds[0];
    const availableStatus = [
      dalTdoBatch.batchProcessStatus.running,
      dalTdoBatch.batchProcessStatus.creating
    ];
    if (!availableStatus.includes(bpFound.status)) {
      throw new InvalidInput({
        message: `batchProcessId needs to be in status 'creating' or 'running' before to cancel the process. Current status: ${bpFound.status}`,
        data: {
          batchProcessId: bpFound.id,
          objectType: 'batchProcess'
        }
      });
    }

    const bpUpdated = await dalTdoBatch.updateBatchProcess(context, {
      batchProcessId: args.id,
      status: dalTdoBatch.batchProcessStatus.canceling,
      organizationId: bpFound.organizationId
    });

    await dalBpRedis.updateBatchProcessObject(context, {
      batchProcessId: bpUpdated.id,
      status: bpUpdated.status
    });

    return bpUpdated;
  }

  function validateSearchQueryObject(searchQuery) {
    if (
      searchQuery.limit &&
      (searchQuery.limit < 0 || searchQuery.limit > SANITY_LIMIT_OF_TDOS)
    ) {
      throw new InvalidInput({
        message: `searchQuery.limit must be greater than 0 and equal or less than ${SANITY_LIMIT_OF_TDOS} that is the maximum possible amount of elements per batch`,
        data: {
          objectType: 'searchQuery'
        }
      });
    }
    if (searchQuery.offset && searchQuery.offset < 0) {
      throw new InvalidInput({
        message: `searchQuery.offset must be equal or greater than 0`,
        data: {
          objectType: 'searchQuery'
        }
      });
    }

    searchQuery.offset = !searchQuery.offset ? 0 : searchQuery.offset;
    searchQuery.limit = !searchQuery.limit
      ? SANITY_LIMIT_OF_TDOS
      : searchQuery.limit;

    searchQuery.sort = !searchQuery.sort
      ? [
          {
            field: 'recordingId',
            order: 'desc'
          }
        ]
      : searchQuery.sort;

    if (!searchQuery.query.operator || !searchQuery.query.conditions) {
      throw new InvalidInput({
        message: `operator and conditions must be added as part of the search query`,
        data: {
          objectType: 'searchQuery'
        }
      });
    }
  }

  return {
    createBatch,
    getTdoBatch,
    getBatchItemsId,
    getTdosForBatch,
    getBatchProcesses,
    GetActionsForABatchProcess,
    cancelTdoBatchProcess
  };
};
