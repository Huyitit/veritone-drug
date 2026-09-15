'use strict';

/**
 * VE-26450 — batches `DestinationType.mediaConstraints` across one GraphQL request.
 *
 * The field resolver runs once per destination type in the result, and a per-type read made
 * `destinationTypes { mediaConstraints }` an N+1: a page of twenty types was twenty queries for a table with a
 * handful of rows. The DAL already accepts many ids in one query, so batching costs a loader and nothing else.
 *
 * Complements, rather than duplicates, the DAL's TTL cache: the cache removes the read on a warm process, this
 * removes the fan-out on a cold one.
 */

const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  /**
   * @param {Array<string>} keys destination type ids, deduplicated by DataLoader.
   * @returns {Promise<Array<Array<object>>>} one row array per key, in key order. A type that declares nothing
   *   yields [] rather than undefined — callers read "no rows" as "allow", and a hole would read as an error.
   */
  async function batchMediaConstraintsByDestinationTypeIds(context, keys) {
    const rows = await serviceContext.dal.destinationMediaConstraint.getMediaConstraints(
      context,
      { destinationTypeIds: keys }
    );
    const byType = _.groupBy(rows, (row) => _.toString(row.destinationTypeId));
    return keys.map((key) => byType[_.toString(key)] || []);
  }

  return {
    batchMediaConstraintsByDestinationTypeIds
  };
};
