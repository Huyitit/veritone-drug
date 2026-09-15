#!/bin/sh

if [ -f ./node_modules/.bin/mocha ]
  then
    echo "Code present. Continuing to tests."
else
  echo "Unpacking source and running NPM install"
  cd $WERCKER_ROOT
  ls
  tar xzf $WERCKER_ROOT/$WERCKER_GIT_REPO.tgz
  ls
  NODE_ENV=dev npm install
fi
