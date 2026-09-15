Link to Ticket: https://steel-ventures.atlassian.net/browse/VTN-XXXX
aiware-core issue: #

_Mandatory - every PR must have a ticket and every commit must be tagged with that ticket._

Before opening a PR, make sure you are familiar with the
contributor guidelines at (CONTRIBUTING.md).

**STOP!**

- Is your branch named correctly? Jenkins will only build branches named `feature/VTN-*`.
- Does the PR merge a **release branch** into `master`? _STOP_. This is not safe. To back-merge changes to a release branch, fork a new branch off the release branch and then open a PR to merge your new feature branch to `master`.
- Does this PR have a database script dependency? Make sure the `database` repo PR is merged _first_.
- Does this PR modify `package-lock.json`? _STOP_. Is the change strictly required? If not, revert it before continuing
  as changes to the package lock file can cause regressions and require extra testing.

## Reviewers

_Please remove reviewers not appropriate._

All changes:

@veritone/api-team

Please note that certain files such as the GraphQL require approval from specific code owners.

_Also look at the Github recommendations for the files you are touching, as a number of others have contributed to this repo._

## Purpose

## What Changed

## Where is the API test?

_API test (in citest/) required for all non-trivial changes. In many cases a new field and assertion
added to an existing test is sufficient. Note that only test suites in tests.sh are run as part of the
CI/CD pipeline._

## Where is the unit test?

_Unit tests required for all commits. A change set without unit tests will likely fail the
coverage threshold check in the build. DAL and resolver
functions should be unit tested using the mock utilities -- see contributors guide for examples._

## Dependencies

_Does PR depend on any other changes such as database updates or changes to core-server-base or other embedded components?_

## Operational changes

_If this PR makes any changes to the way the service is built, run, or managed, describe in detail here.
This includes any changes affected local development (these should be documented in README.md).
If any changes affect production deployment, devops and/or release management should be made aware._

## How should we monitor this?

_What should we be monitoring due to this change?_

## Extensibility

- [ ] Events Defined
- [ ] APIs defined and leveraged

## Hygiene

- [ ] README.md updated
- [ ] Runbooks updated
- [ ] Code is documented (Clean Code book)
- [ ] Tested in dev environment
- [ ] Monitoring is defined
