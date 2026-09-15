#!/bin/sh
echo "SHARD_INDEX=$SHARD_INDEX"
echo "MAX_WORKERS=$MAX_WORKERS"
echo "MAX_SHARDS=$MAX_SHARDS"

# The citest suite is split into two tiers via the @nightly test-name tag.
# PR tier (default) -> run the categories below but EXCLUDE @nightly-tagged specs.
# Nightly tier (NIGHTLY) -> run the same categories INCLUDING @nightly-tagged specs.
# The @nightly tag replaces the old process.env.CITEST_AUDIT_LOGS gate for audit-log specs.

# NIGHTLY is set only by the nightly-citest.yaml wrapper (via citest-runner.yaml -> compose);
# it is unset on PR/push, so PRs keep excluding @nightly.
CITEST_INCLUDE_LIST='(critical-path|audit-log|citest_package|citest_folder|citest_structureddata|citest_auth|citest_engine|citest_jobs|citest_orginvite|citest_application|citest_tdo|citest_misc|citest_media|citest_cluster|citest_token|citest_trigger|citest_vanity|citest_schema|citest_savedSearch|citest_openid|citest_mention|citest_ingestSlug|citest_source|citest_dashboard|citest_dataset|citest_emailTemplate|citest_eventing|citest_export|citest_flow|citest_hub|citest_audit|citest_licensePlate|citest_storage|citest_platform|citest_library|citest_ingest|citest_llm|citest_email|citest_destination|citest_export)'

if [ "${NIGHTLY:-}" = "true" ]; then
  echo "NIGHTLY=true -> running full citest suite INCLUDING @nightly-tagged specs"
  DEFAULT_CITEST_FILTER="$CITEST_INCLUDE_LIST"
else
  echo "NIGHTLY unset -> PR tier: EXCLUDING @nightly-tagged specs"
  DEFAULT_CITEST_FILTER="^(?!.*@nightly).*$CITEST_INCLUDE_LIST"
fi

mkdir -p ./test-results && \
CANCEL_TEAR_DOWN=true \
npx jest --projects citest \
  --testTimeout=300000 \
  --json --outputFile=./test-results/test-results.json \
  --max-workers="${MAX_WORKERS:-1}" \
  --shard="${SHARD_INDEX:-1}/${MAX_SHARDS:-1}" \
  --detectOpenHandles \
  --forceExit \
  -t "${COMPOSE_CITEST_FILTER:-$DEFAULT_CITEST_FILTER}"
