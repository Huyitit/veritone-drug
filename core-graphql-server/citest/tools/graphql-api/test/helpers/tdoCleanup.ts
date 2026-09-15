import { GraphqlClient } from '../../src/graphqlUtil';

/**
 * Best-effort teardown for TDOs a spec created.
 *
 * Replaces the hand-rolled pattern of joining N aliased root fields into one
 * mutation string (`d0: deleteTDO(id:"…"){…}\nd1: …`). That could not use the
 * typed SDK — a static document cannot express a variable-arity alias list — and
 * it also meant one bad id failed the whole batch. Here each delete is its own
 * typed call, run concurrently in slices so teardown does not fan out
 * unboundedly, and individual failures are logged rather than thrown: a TDO the
 * spec already deleted is the normal case, not an error.
 */
export async function deleteTdos(
  client: GraphqlClient,
  ids: string[],
  label = 'TDO',
  batchSize = 20
): Promise<void> {
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (id) => {
        try {
          await client.sdk.deleteTDO({ id });
        } catch (err) {
          console.warn(
            `cleanup (delete ${label} ${id}) failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      })
    );
  }
  console.log(`Cleaned up ${ids.length} ${label}s`);
}
