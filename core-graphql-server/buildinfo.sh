#!/bin/sh

BFILE=buildinfo.json
if [ -f $BFILE ];
then
  echo "'$BFILE' already exists and '$BFILE' will not be created, exiting 0"
  exit 0
fi;

GITBRANCH=`git rev-parse --abbrev-ref HEAD`
GITCOMMIT=`git log -1 --format=%H`
GITDATE=`git log -1 --format=%cI`
GITCOMMITSHORT=`git log -1 --format=%h`
DATE=`date -u +%Y-%m-%dT%H:%M:%S-00:00`
DATESHORT=`date -u +%Y%m%d%H%M%S`
BUILDNUM="$DATESHORT-$GITCOMMITSHORT"

echo {\"commitHash\":\"$GITCOMMIT\", \"commitDate\":\"$GITDATE\", \"buildNumber\":\"$BUILDNUM\", \"buildDate\":\"$DATE\", \"branch\":\"$GITBRANCH\"} > $BFILE
