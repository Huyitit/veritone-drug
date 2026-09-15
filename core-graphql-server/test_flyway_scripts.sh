#!/bin/sh
export AIWARE_DOMAIN_NAME=local.aiware.com
docker-compose --project-directory ./flyway/test/ up -d
sleep 20
node server.js --conf ./flyway/test/migration_config.json || true
docker-compose --project-directory ./flyway/test/ down
