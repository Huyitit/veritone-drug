#!/bin/bash

if [ -f $HUSKY_GIT_PARAMS ]; then
  # typically this file is .get/COMMIT_EDITMSG
  TICKET=`cat $HUSKY_GIT_PARAMS`
else
  # 0 is branch
  # 1 is commit hash
  # ticket number should be the first element after that.
  PARTS=($HUSKY_GIT_PARAMS)
  TICKET=${PARTS[2]}
fi

# Require a project ID of between 3 and 6 characters (VTN, ITSM, etc.)
# Require numberical ID of at least 4 digits (this can be changed if we
# need to add tickets in new projects, but VTN- is already over 10k).
echo "Commit message is "$TICKET
test "" != "$(echo $TICKET | egrep '([A-Z]+\d*-\d+|merge|Merge)')" || {
    echo >&2 Your commit message must begin with a Jira ticket number such as AI2-67 or VTN-1234 or merge notes.
    exit 1
}
