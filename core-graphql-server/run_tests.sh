#!/bin/sh

JEST=./node_modules/.bin/jest

IS_CI=$1
ENVIRONMENT_PREFIX=
if [ "$ENVIRONMENT" = "uk-prod" ]; then
  ENVIRONMENT_PREFIX=".uk-1"
elif [ "$ENVIRONMENT" = "me-stage" ]; then
  ENVIRONMENT_PREFIX=".stage-me.us-1"
elif [ "$ENVIRONMENT" = "us2-prod" ]; then
  ENVIRONMENT_PREFIX=".wpcc03.useast1"
elif [ "$ENVIRONMENT" != "prod" ]; then
  ENVIRONMENT_PREFIX=".$ENVIRONMENT.us-1"
elif [ "ENVIRONMENT" = "prod" ]; then
  ENVIRONMENT_PREFIX=".us-1"
fi

echo IS_CI=$IS_CI
if [ "$IS_CI" = "true" ]; then
  # Set up test config file
  echo {\"ci\":true, \"localci\":true,\"userName\":\"$TESTS_USER\", \"env\":\"aws-$ENVIRONMENT\", \"graphql_url\":\"http://localhost:9000/graphql\"} > ./testconfig-ci.json
else
  # Set up test config file
  echo {\"ci\":true, \"userName\":\"$TESTS_USER\", \"env\":\"aws-$ENVIRONMENT\", \"graphql_url\":\"https://api$ENVIRONMENT_PREFIX.veritone.com/v3/graphql\", \"core_admin_url\":\"https://api$ENVIRONMENT_PREFIX.veritone.com/v1\", \"media_streamer_url\":\"https://api$ENVIRONMENT_PREFIX.veritone.com/media-streamer\" } > ./testconfig-ci.json
  # TODO: run _wait.spec.js to make sure all containers are running the same version
fi

echo 'Working in '`pwd`
cat ./testconfig-ci.json

export CITEST_CONFIG="$(pwd)/testconfig-ci.json"

$JEST --projects citest --testTimeout=50000 --runInBand

TEST_STAT=$?
echo 'Test process status is '$TEST_STAT
exit $TEST_STAT
