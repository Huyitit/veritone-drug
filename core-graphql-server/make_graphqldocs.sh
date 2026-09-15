#!/bin/sh
set -e # this will exit on error

mkdir -p ./web/graphqldocs

cp ./schema/schema.graphql ./web/graphqldocs/fullschema.graphql

find ./modules -name "*.graphql" \
  -not -path "*internalAPI*" \
  -not -path "*rbac*" \
  -print0 | xargs -0 cat >> ./web/graphqldocs/fullschema.graphql # -print0 and -0 handle filenames with spaces
# installed and locked package
./node_modules/.bin/graphqldoc -s ./web/graphqldocs/fullschema.graphql -o ./web/graphqldocs -f
