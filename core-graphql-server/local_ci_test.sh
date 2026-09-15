#!/bin/bash

MOCHA=./node_modules/.bin/mocha
# install dev dependencies if not installed
if [ ! -f "$MOCHA" ]; then
    npm install
fi

# Check for existence of environment variables introduced by CI pipeline
# and bail if not present.
if [ -z $TESTS_USER ]; then
  TESTS_USER=`node --eval "try { console.log(require('./testconfig.json').userName); } catch(err) {}"`
  if [ -z $TESTS_USER ]; then
    echo 'No TESTS_USER'
    exit 1
  fi
fi

if [ -z $TESTS_PASSWORD ]; then
  TESTS_PASSWORD=`node --eval "try { console.log(require('./testconfig.json').password); } catch(err) {}"`
  if [ -z $TESTS_PASSWORD ]; then
    echo 'No TESTS_PASSWORD'
    exit 1
  fi
fi

if [ -z $TESTS_TOKEN ]; then
  TESTS_TOKEN=`node --eval "try { console.log(require('./testconfig.json').apiToken); } catch(err) {}"`
  if [ -z $TESTS_TOKEN ]; then
    echo 'No TESTS_TOKEN'
    exit 1
  fi
fi

if [ -z $ENVIRONMENT ]; then
  ENVIRONMENT=`node --eval "try { console.log(require('./testconfig.json').env.replace('aws-', '')); } catch(err) {}"`
  if [ -z $ENVIRONMENT ]; then
    echo 'No ENVIRONMENT, defaulting to aws-dev'
    ENVIRONMENT=dev
  fi
fi

# detemine if we need to install timeout
# which is a utility that wraps a child process with a forced time limit
APT=`which apt-get`
if [ -z $APT ]; then
  echo apt-get$APT not present. using gtimeout.
  # Mac / workstation
  TIMEOUT_EXEC=gtimeout
  TIMEOUT_TEST=`which gtimeout`

  if [ -z $TIMEOUT_TEST ]; then
    echo 'timeout command not available. try installing with "brew install coreutils".'#
    exit 1
  fi
else
  # linux / container
  TIMEOUT_EXEC=timeout
  TIMEOUT_TEST=`which timeout`
  if [ -z $TIMEOUT_TEST ]; then
    echo timeout command not installed. installing core-utils now.
    apt-get install -y core-utils
  fi
fi

# Instrument code for coverage reporting
echo 'Instrumenting code for coverage...'
if [ -d _instrumented ]; then
  echo Code already instrumented
else
  ./node_modules/.bin/nyc instrument --complete-copy --delete . _instrumented
  echo 'Instrumentation complete in _instrumented'
fi

# Read coverage thresholds from the file citest_coverage_threshold
LINE_THRESHOLD=`grep LINE_THRESHOLD ./citest_coverage_threshold.sh | xargs node --eval "console.log(process.argv[2].split('=')[1])"`
BRANCH_THRESHOLD=`grep BRANCH_THRESHOLD ./citest_coverage_threshold.sh | xargs node --eval "console.log(process.argv[2].split('=')[1])"`
FUNCTION_THRESHOLD=`grep FUNCTION_THRESHOLD ./citest_coverage_threshold.sh | xargs node --eval "console.log(process.argv[2].split('=')[1])"`
STATEMENT_THRESHOLD=`grep STATEMENT_THRESHOLD ./citest_coverage_threshold.sh | xargs node --eval "console.log(process.argv[2].split('=')[1])"`

CDIR=`pwd`
cd _instrumented

# Run server with a hard timeout. This value is passed into server.js,
# which will shut itself down cleanly if possible.
export LOCAL_TEST_KILL_SERVER_AFTER_SEC=900
export G_TIMEOUT=`expr $LOCAL_TEST_KILL_SERVER_AFTER_SEC + 1`
echo Starting local test server with $TIMEOUT_EXEC and will kill at after $G_TIMEOUT seconds at `pwd`
$TIMEOUT_EXEC --signal=HUP --kill-after=30 $G_TIMEOUT node -- server.js --conf local_ci_server.json > ./server.out &
export GT_PID=$!

# sleep so that server has time to start
sleep 110

# extract node.js PID (child process of timeout)
# if we can't do this, server process probably died. error out.
NODE_PID=`pgrep -P $GT_PID`
if [ -z $NODE_PID ]; then
  echo 'Unable to determine Node process PID! The server may have failed to start.'
  tail -100 ./server.out
  exit 1
fi

echo Node PID=$NODE_PID
echo Timeout PID=$GT_PID

# Run the tests
echo 'Running test suite...'
cd $CDIR
TESTS_USER=$TESTS_USER TESTS_PASSWORD=$TESTS_PASSWORD TESTS_TOKEN=$TESTS_TOKEN ENVIRONMENT=$ENVIRONMENT sh run_tests.sh true
TEST_STAT=$?

# if the server has self-destructed because we hit the timeout, then
# coverage cannot be generated and this will fail.
mkdir -p .nyc_output
curl http://localhost:9000/dump_coverage > .nyc_output/out.json
CURL_RES=$?
if [ $CURL_RES != 0 ]; then
  echo 'COVERAGE DUMP FAILED'
else
  echo 'Test suite complete. Kill server now.'
fi

# kill the test server, if it didn't time out already. first SIGHUP.
TPID=`ps -o pid= $NODE_PID`
if [ -n "$TPID" ]; then
  kill -1 $NODE_PID
fi

# then SIGKILL in case SIGHUP didn't work
sleep 2
TPID=`ps -o pid= $NODE_PID`
if [ -n "$TPID" ]; then
  echo $TPID still running
  kill -9 $NODE_PID
fi
TPID=`ps -o pid= $GT_PID`
if [ -n "$TPID" ]; then
  echo $TPID still running
  kill -9 $GT_PID
fi

echo Coverage thresholds:
echo   "Line:      $LINE_THRESHOLD"
echo   "Branch:    $BRANCH_THRESHOLD"
echo   "Function:  $FUNCTION_THRESHOLD"
echo   "Statement: $STATEMENT_THRESHOLD"

# Print the report and check coverage
./node_modules/.bin/nyc report --report=html --check-coverage --branches $BRANCH_THRESHOLD --functions $FUNCTION_THRESHOLD --lines $LINE_THRESHOLD --statements $STATEMENT_THRESHOLD
COV_STAT=$?

# exit with sum test process status and coverage check status.
# if both are 0 => success (0)
# either failed => failed/error (1 or 2)
exit `expr $TEST_STAT + $COV_STAT`
