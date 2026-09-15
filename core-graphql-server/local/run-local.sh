#!/bin/sh

# This will be connecting to dev env. Please make sure you have a VPN connection

# docker-compose down
docker-compose up -d

# Envs
export ENVIRONMENT="${ENVIRONMENT:=dev}"
export ENVIRONMENT_NEW="${ENVIRONMENT_NEW:=dev.us-1}"
export JWT_SECRET=test-jwt-secret
export APPLICATION=core-graphql-server
export RUN_ENVIRONMENT=LOCAL
export NODE_ENV=development

if [ "$ENVIRONMENT" = "dev" ]; then
  ENVIRONMENT=aws-dev
  ENVIRONMENT_NEW=dev.us-1
fi

if [ "$ENVIRONMENT" = "stage" ]; then
  ENVIRONMENT=aws-stage
  ENVIRONMENT_NEW=stage.us-1
fi

cd ../

#using node
node server.js --conf server.json

# #using run script
# yarn start

# By default the API URL will be http://localhost:3000/graphql
