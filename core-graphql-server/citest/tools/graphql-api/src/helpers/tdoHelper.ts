import { GraphqlClient } from '../graphqlUtil';
import { JobStatusFilter, UpdateJobsStatus } from '../gql';

async function getAllJobIdsFromTDO(
  gqlClient: GraphqlClient,
  tdoId: string,
  headers?: Record<string, string>
): Promise<string[]> {
  const allJobIds: string[] = [];
  const limit = 100;
  let offset = 0;
  let count = 0;
  try {
    do {
      const result = await gqlClient.sdk.jobs(
        {
          targetId: tdoId,
          status: [
            JobStatusFilter.Pending,
            JobStatusFilter.Queued,
            JobStatusFilter.Running
          ],
          limit,
          offset
        },
        headers
      );
      const jobs = result?.data?.jobs?.records ?? [];
      if (jobs.length === 0) {
        break;
      }
      allJobIds.push(...jobs.map((job) => job!.id));
      offset += limit;
      count = jobs.length;
    } while (count === limit);
  } catch (error) {
    console.warn(error);
  }

  return allJobIds;
}

async function updateJobStatus(
  gqlClient: GraphqlClient,
  jobIds: string[],
  status: UpdateJobsStatus,
  headers?: Record<string, string>
): Promise<void> {
  const batchSize = 10;
  // Since the update may fail (v1, v2 jobs), update each job independently.
  for (let i = 0; i < jobIds.length; i += batchSize) {
    const batch = jobIds.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (jobId) => {
        try {
          await gqlClient.sdk.updateJobs(
            { input: { ids: [jobId], status } },
            headers
          );
        } catch (error) {
          console.warn(error);
        }
      })
    );
  }
}

async function deleteTDO(
  gqlClient: GraphqlClient,
  tdoId: string,
  headers?: Record<string, string>
) {
  try {
    return await gqlClient.sdk.deleteTDO({ id: tdoId }, headers);
  } catch (error) {
    console.warn(error);
  }
}

/**
 * Delete and abort jobs that belong to a TDO, then delete the TDO.
 */
export async function processTDODeletion(
  gqlClient: GraphqlClient,
  tdoId: string,
  abortJobs: boolean = true,
  headers?: Record<string, string>
) {
  if (abortJobs) {
    const jobIds = await getAllJobIdsFromTDO(gqlClient, tdoId, headers);
    if (jobIds.length > 0) {
      await updateJobStatus(gqlClient, jobIds, UpdateJobsStatus.Aborted, headers);
    }
  }

  return deleteTDO(gqlClient, tdoId, headers);
}

export default { processTDODeletion };
