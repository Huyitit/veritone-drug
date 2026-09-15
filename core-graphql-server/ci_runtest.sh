#!/bin/sh

# Runs all tests in the citest folder. These should all run clean
# with no failures.
JEST=jest
# install dev dependencies if not installed
JEST --version
if [ $? -ne 0 ]; then
    npm install
fi
jest citest/*.spec.js