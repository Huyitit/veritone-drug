#!/bin/sh

# if a config file was not provided on the command line, use a default.
# if dist/config.json exist, use it for default (as on a deployed server).
# otherwise default to server.json (as on a local dev system)
if [ -z $1 ]
  then
  if [ -f config.json ]
   then
    CONF=`pwd`/config.json
   else
    CONF=./server.json
  fi
else
    CONF=$1
fi

# to specify a log directory run using both arguments, e.g.
# sh start.sh server.json /var/log.
# this is done only to test this script. otherwise defaults are applied.
if [ -z $2 ]
then
  LOGDIR=/var/log
else
  LOGDIR=$2
fi

if [ ! -f ./node_modules/.bin/nodemon ]
  then
    echo "nodemon is required for local dev. installing now."
    echo "This happens only the first time you start the server in a given clone directory."
    npm install --no-save --no-package-lock nodemon
fi

RUN_ENVIRONMENT="LOCAL"

if [ ! -d ./graphiql/build ]
  then
    echo "start building Graphiql."
    cd ./graphiql && npm ci --force && npm run build && cd ../
fi

./node_modules/.bin/nodemon ./server.js --ignore './test/' --ignore './citest' --exec node --conf $CONF
