#!/bin/sh

# jobTemplate.js temp disabled
# libraries.js disabled due to weird s3 error

NODE_DOCKER=`cat Dockerfile | grep -m 1 -e "^FROM" | awk '{ print $2 }'`
NODE_VERSION=`docker run --rm $NODE_DOCKER node --version | tr -d '^v'`

# Check for existence of environment variables introduced by CI pipeline
# and bail if not present.
if [ -z $TESTS_USER ]; then
  echo 'No TESTS_USER'
  exit 1
fi

if [ -z $TESTS_PASSWORD ]; then
  echo 'No TESTS_PASSWORD'
  exit 1
fi

if [ -z $TESTS_TOKEN ]; then
  echo 'No TESTS_TOKEN'
  exit 1
fi

if [ -z $ENVIRONMENT ]; then
  echo 'No ENVIRONMENT'
  exit 1
fi

if [ -z $GITHUB_TOKEN ]; then
  echo 'No GITHUB_TOKEN'
  exit 1
fi

handleDarwin() {
  set -e

  if [ -z $IGNORE_NPM_INSTALL ]; then
    npm install --unsafe
  fi

  ENVIRONMENT_PREFIX=
  if [ "$ENVIRONMENT" = "uk-prod" ]; then
    ENVIRONMENT_PREFIX=".uk-1"
  elif [ "$ENVIRONMENT" != "prod" ]; then
    ENVIRONMENT_PREFIX=".$ENVIRONMENT.us-1"
  elif [ "ENVIRONMENT" = "prod" ]; then
    ENVIRONMENT_PREFIX=".us-1"
  fi

  if [ -z $GRAPHQL_URL ]; then
    GRAPHQL_URL="https://api$ENVIRONMENT_PREFIX.veritone.com/v3/graphql"
    echo "No GRAPHQL_URL defined, defaulting to: $GRAPHQL_URL"
  fi

  echo '{"ci":true,"userName":"'"$TESTS_USER"'","env":"'"aws-$ENVIRONMENT"'","graphql_url":"'"$GRAPHQL_URL"'"}' > ./testconfig-ci.json
  echo "Running $RUNTESTS"
  echo "Using GRAPHQL_URL=$GRAPHQL_URL"
  $MOCHA $RUNTESTS --conf ./testconfig-ci.json

  set +e
}

if [ "$(uname)" = "Darwin" ]; then
  echo "Handling Darwin"
  handleDarwin
  exit
fi

if [ -z $CODE_DIR ]; then
  export CODE_DIR=/app
else
  echo 'Using code dir '$CODE_DIR
fi

which node
node --version > /dev/null 2>&1
NODE_INSTALLED=$?
CHECK_NODE_VERSION=`node --version`

if [ $CHECK_NODE_VERSION == "v$NODE_VERSION" ]; then
# if [ $NODE_INSTALLED -eq 0 ] || [ $CHECK_NODE_VERSION == "v$NODE_VERSION" ]; then
  echo 'Node already installed'
  node --version
else
  echo 'Node not available. Installing now.'

  # install node
  cd $HOME
  wget https://nodejs.org/download/release/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz
  tar -xvzf node-v$NODE_VERSION-linux-x64.tar.gz
  cd node-v$NODE_VERSION-linux-x64
  export PATH=$PATH:$HOME/node-v$NODE_VERSION-linux-x64/bin
  echo $PATH
  echo 'Node installed'

  # Re-verify after installation and print active version
  node --version > /dev/null 2>&1
  NODE_INSTALLED=$?
  if [ $NODE_INSTALLED -eq 0 ]; then
    echo 'Installed node '`node --version`
    update-alternatives --install /usr/bin/node node $HOME/node-v$NODE_VERSION-linux-x64/bin/node 100
    update-alternatives --install /usr/bin/npm npm $HOME/node-v$NODE_VERSION-linux-x64/bin/npm 100
    node --version
  else
    echo 'node installation failed.'
    exit 1
  fi
fi


mkdir -p $CODE_DIR
cd $CODE_DIR

# Set up authenticated Git URL with our token
GIT_URL="https://$GITHUB_TOKEN:x-oauth-basic@github.com/"
REPO_URL="https://$GITHUB_TOKEN:x-oauth-basic@github.com/veritone/aiware-core.git"
apt-get update && apt-get install ca-certificates

# check out code if not exists
if [ -f $CODE_DIR/package.json ]; then
  echo 'Code already checked out.'
else
  if [ -z $GIT_COMMIT ]; then
    echo 'No GIT_COMMIT'
    exit 1
  fi

  if [ -z $GIT_REPO_NAME ]; then
    echo 'No GIT_REPO_NAME'
    exit 1
  fi
  git --version > /dev/null 2>&1
  GIT_INSTALLED=$?
  if [ $GIT_INSTALLED -eq 0 ]; then
    echo 'Git installed'
    git --version
  else
    echo 'Git is not available!'
    exit 1
  fi
fi

# configure git to use authenticated URL. This is needed by npm install to
# get internal private repos referenced in package.json.
git config --global url."$GIT_URL".insteadOf "https://github.com/"

# Clone the repo

echo 'git clone into '`pwd`; git clone $REPO_URL $CODE_DIR
# Check out the right commit/branch
echo `checking out $GIT_COMMIT` ; cd $CODE_DIR ; git checkout $GIT_COMMIT
# npm install.
# No other node dependencies outside of package.json should be required.
echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> ~/.npmrc && cat ~/.npmrc
cd $CODE_DIR/services/api/core-graphql-server ; echo 'npm install in '`pwd` ; npm install --unsafe
NPM_SUCCESS=$?
if [ $NPM_SUCCESS -eq 0 ]; then
  echo 'NPM install successful'
else
  echo 'NPM install failed! Code ' $NPM_SUCCESS
  exit 1
fi

cd $CODE_DIR/services/api/core-graphql-server
echo 'Working in '`pwd`

sh run_tests.sh
TEST_STAT=$?
echo 'test process status is ' $TEST_STAT
exit $TEST_STAT
