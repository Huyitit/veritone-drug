#!/bin/sh

DO_CITEST=1
while [ "$1" ]; do
  case "$1" in
    --noci) DO_CITEST=0;;
    *) 
      echo "ERROR: Unknown parameter '$1'" >>/dev/stderr
      echo "Usage: $(basename "$0") [--noci]"
      echo ""
      exit 1
      ;;
  esac
  shift
done

if [ $DO_CITEST -eq 0 ]; then
  echo "Skipping CI API tests. This is for local unit test run only."
else
  echo "Including CI API tests. Run npm test -- --noci to skip (for local unit test runs only!)"
fi

GIT_BRANCH=`git rev-parse --abbrev-ref HEAD`
GIT_RES=$?

#if [ -z "$GIT_BRANCH" ]; then
if [ $GIT_RES != 0 ]; then
  echo Not in a Git repo. Trying build manifest.
  if [ -f build-manifest.yml ]; then
    GIT_BRANCH=`grep git_branch build-manifest.yml | xargs node --eval "console.log(process.argv[2])"`
    echo Got Git branch $GIT_BRANCH from build manifest.
  fi
else
  echo Got Git branch $GIT_BRANCH from Git repo.
fi

STATUS=0
echo 'Starting unit tests...'
./node_modules/.bin/jest --coverage --coverageDirectory=coverage --silent
STATUS=$?
if [ $STATUS -ne 0 ]; then
  exit $STATUS
fi

if [ $DO_CITEST -ne 1 ]; then
  exit $STATUS
fi

# you can do this with bash regex but it's not as portable; we always have node available.
GIT_MATCH=`echo $GIT_BRANCH | xargs node --eval "console.log(process.argv[1].match(/feature\\//g)||'')"`
if [ -n "$GIT_MATCH" ]; then
  echo Build is on feature branch $GIT_BRANCH. Running local integration tests.
  sh local_ci_test.sh
  STATUS=$?
else
  echo $GIT_BRANCH is not a feature branch. Skipping local integration tests.
fi

exit $STATUS
