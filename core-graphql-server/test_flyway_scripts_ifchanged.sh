#!/bin/sh
git diff --quiet --cached  -- ./flyway || sh "./test_flyway_scripts.sh"
