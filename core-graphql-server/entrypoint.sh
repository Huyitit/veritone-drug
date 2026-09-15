#! /bin/sh

# Get datacenter configuration
if [ "$ENVIRONMENT" != "ON_PREM" ]; then
  ./getconfig.sh
else
  echo "On-prem detected.."
fi

# Execute without the config file if AIWARE_VERSION variable is set
if [ -z "$AIWARE_VERSION" ]; then
  exec node --max-old-space-size=${GRAPHQL_MEMORY:-3956} ./index.js --conf /app/config.json
elif [ -z "WATCH" ]; then
  ./node_modules/.bin/nodemon ./index.js --ignore './test/' --ignore './citest' --exec node --conf $CONF
else
  exec node --max-old-space-size=${GRAPHQL_MEMORY:-3956} ./index.js
fi
