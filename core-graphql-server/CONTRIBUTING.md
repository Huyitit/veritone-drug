# core-graphql-server Contributor's guide

WIP

## Schema changes

"Schema Conventions" in the main README has some details on the
expected format for new types, queries, and mutations.
PRs that do not comply will be rejected.

It's best to submit a schema change proposal AHEAD of the PR for
anything non-trivial.

## package-lock changes

Don't!

Changes to `package-lock.json` have the potential to cause serious regressions by
changing the versions of various nested dependencies.

The file should _not_ be checked in if it only changed because you ran `npm install`.
New or modified dependencies in `package.json` might require a `package-lock.json` update.
In this case, be prepared for extra regression testing; the change should be merged
at least a full day before release branches are cut, preferably longer.

## Code factoring

A typical code stack looks like this:

- Query, mutation or type definition in `schema.graphql`
- Resolver function in `Query.js`, `Mutation.js`, or `TypeName.js`
  that does nothing except call a corresponding function in `dal/typeName.js`
- Business logic related to access control, logging, audit, etc. handled by the framework (typically no operation-specific code needed)
- GraphQL-independent logic in `dal/typeName.js`

In many projects, the DAL/data access layer is kept as thin as possible and does nothing but read/write data to a given back end. All other
logic is kept in a separate BLL/business logic layer.

In core-graphql-server it's okay to add some business logic in
DAL functions. We do this to avoid adding an extra code layer that,
in most cases, would do nothing because most business logic is
handled by the generic framework.

`dal/mapper.js` is also optional.

Most source files go in the implicit core module (`/dal`, `/resolvers`, `/schema` etc.). We have the ability to separate API components out
into modules that can, theoretically by `require`'d from anywhere.
A given server instance or schema can be configured to use only
certain modules. We use this method, for example, to expose an
"internal" schema only on a separate endpoint.

For most features this is not needed and code can go in the "core" module. The largest existing separate module, `v3DataModel`, is
separated only for historical reasons and eventually be folded
back into the core.

## SQL queries

All access to Postgres should use plain `pg` via the
connection objects provided in `serviceContext.dbConnections`.

We experimented with the use of ORM (in the structured data APIs).
Although the concept is sound, it proved inflexible, difficult to
optimize, and difficult to work into our change management process.
No more ORM.

GraphQL largely obviates the need for huge queries with complex
joins, since resolver functions for nested fields are independent.
Queries should be kept as simple and contained as possible, returning
only the data needed for top-level fields on a given object.
With the structure, size, and load on our Postgres databases, it's
proven much better to make many small, lightweight queries than
one complex query.

Queries should be declared directly in the functions that use them
as plain strings. This makes the code easy to read, and makes it
easy to identify where a given query is coming from.
That said, dynamic elements such as `where` clauses can be
injected dynamically. Here's a common pattern:

```
const where = [];
where.push('stuff = 1');
const sql = `
SELECT stuff FROM TABLE WHERE ${where.join(',')}
`;
```

The SQL utilities in `util.js`, such as `addSqlWhere`, can be used
but are not required. Consider using `addSqlWhere` as it handles
a lot of boilerplate such as array vs. single input detect, etc.

SQL variables should be used wherever possible.

When writing queries, assume that the tables you are working
with have 500 million rows.

Do not use complex transactions, especially in large tables.
It's better to make simple transactions (one write) and handle
cleanup in the code. This is due to the scale of many of our tables.
Multi-table transactions cause high locks and CPU load, contributing
to errors and even outages.

Make sure that unit tests cover your query generation
logic (see unit testing below). This helps to avoid runtime
error caused by things like an empty `where` array in
our example above.

_All new SQL queries must be reviewed by the API lead(s) and
database lead(s)!_

## Metrics and logging

You do not normally have to add any specific logging
or audit code. The framework handles this.

## Unit testing

Starting December 2018 we are enforcing more controls over unit test
coverage.

Guidelines:

- Each source file should have a corresponding unit test file in the
  same directly called `<fileName>.spec.js`. For example, we have `util.spec.js`, `rateLimit.spec.js`, etc.
- General utilities related to unit tests, such as reusable mocks,
  go in `/test`.
- Utility functions with no dependencies are easy to unit test; we should never have any without unit tests (this is not a new rule)
- Functions with dependencies, such as middleware and DAL functions,
  should use the mock utilities in `/test` to inject and use mock
  objects for full unit test coverage. See `rateLimit.spec.js` for an
  example of how to do this.
- Test coverage should include tests for events emitted, redis activity,
  etc. (again, see `rateLimit.spec.js`)
- A commit _cannot_ reduce or lower overall test coverage
- Files with dependencies on other services (database, etc.) should
  use mocks for those services. The generic mocks generated by `jest`
  are suitable for some cases. For Postgres, always use the mocks
  generated in `test/serviceContext.mock.js` to ensure that queries
  are parsed and we have a uniform way of injecting mock results.
- Calls to service mocks should be part of the unit test assertions,
  even if they don't affect function output. For example, a function
  that is supposed to emit messages should have assertions validating
  that the `messageUtil` mock was in fact called the correct number of times.
- `jest` runs tests in the build and can be used to auto-generate mocks.
  This is especially useful for system and third-party modules. Either
  generated or hand-built mocks can be used (or the existing common mocks
  in `serviceContext.mock.js`).
- `nock` is handy for mocking out raw HTTP calls. See the `download()` tests
  in `resolvers/util.spec.js` for an example.
- `jest` or `chai` can be used for `expect` assertion. We should gradually
  migrate toward `jest`, but either is fine as long as a given test file is consistent.

Unit tests affected by any staged file are run in a pre-commit hook.
The entire suite is run as part of the build (again, not new).

Test coverage analysis is now built into the test runs. It's set
at a minimum threshold configured in `package.json`. A commit that
decreases coverage below this threshold, either by adding code that
is not tested or deactivating existing tests, will be rejected either
in the precommit hook or the build.

As time goes on and we increase coverage over older code, this threshold
will ratchet up until it reaches a target level of > 90%.

### The service context mock

Most test files have a line like this:

```
// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
```

This sets up a mock service context that can be passed to any
resolver or DAL function that requires one (most do).
It also initializes some global mocks to make sure that code does not
attempt to call out to a real database, file system, etc.

These mocks can be disabled by passing options to the require function:

```
const serviceContext = require('../test/serviceContext.mock.js')({
  mockTimers: false,
  mockHttp: false,
  mockMessaging: false
});
```

This is sometimes necessary for a unit test suite that mocks at a different level.
For example, if we use `nock` to mock specific HTTP responses then the `http` and
`https` modules don't need to be mocked (and will generate errors if they are).
More mocks might be added over time -- refer to the top portions of the file
for an authoritative list.

This file is also where the handlers for unhandled exceptions and
rejections are configured. These are used to make sure we fail a test
if asynchronous code somewhere failed to handle an exception or rejection
(rather than fail silently with a console warning).

### Postgres SQL mocks

Nearly every GraphQL API hits the Postgres database. Thus, unit testing around
the handling of database responses _and_ the SQL itself is essential.
Unit tests use SQL mocks heavily.

Here's an example. Say the DAL function under test makes a query like:

```
SELECT
  library_engine_model_id AS id
FROM
  library.library_engine_model
WHERE
  library_engine_model_id = $1 AND
  library_id = $2 AND
  engine_id = $3 AND
  library_version = $4
```

We mock the result and validate the input (SQL and variables) like so:

```
// we're going to push a SQL result to the core database read connection.
serviceContext.dbConnections['core'].read._push(
      // the mock result. must be an array of objects with keys matching
      // the query's SELECT clause and realistic values.
      [
        {
          id: libEngineModelId
        }
      ],

      // parse SQL. by default this is true. set to false
      // only for certain queries that the test SQL parser can't handle.
      true,

      // strings that must be found in the
      // SQL. used for quick and easy validation.
      ['library_engine_model_id', 'engine_id', 'library_id', 'library.library_engine_model', 'library_version'],

      // a function that validates the SQL and variable values.
      // handy for deeper validation.
      (sql,  // the SQL text passed to pg.query/map/etc.
       vars, // the SQL variable array. might be null.
       ast   // the full abstract syntax tree, if you want to get clever
       ) => {
        // here we'll validate that $3 is a string. if it isn't,
        // Postgres will error out.
        if (!_.isString(vars[4]))
          throw new Error('version param $3 not a string');
        // here we'll validate that the correct, expected values were
        // passed in the variables $1, $2, and $3.
        // similar logic can be used to validate time ranges for date/time
        // variables, etc.
        if (vars[0] !== libEngineModelId)
          throw new Error('wrong $1:  ' + vars[0]);
        if (vars[1] !== libId) throw new Error('wrong $2:  ' + vars[1]);
        if (vars[2] !== engId) throw new Error('wrong $3:  ' + vars[2]);

        // be sure to return true.
        return true;
      }
    );
```

The SQL mock module maintains a queue per database connection.
Mocked results are popped from the queue in sequence, so if the DAL function
under test makes four queries to the `core` database, then the test code will
need to `_push()` four mock results before executing the function.

You are also free to use `jest` to mock SQL calls instead of the homebrew
module. If you do, be sure to plug in real mock functions that parse the
SQL (see `test/mockSql.js`) and perform real validation in the same way
as the example above.

### Note on unit test philosophy

In the conventional unit test methodology, the unit test for a
given source file should be independent of other source files.
Any dependencies are mocked. For example, say `dal/asset.js`
calls functions in `dal/tdo.js`. `dal/asset.spec.js` would use
a mock of `dal/tdo.js` so that the tests only depend on the file
under test.

We do _not_ follow this model in all cases.
In the above example, the `dal/asset.js`
module is configured with the _real_ `dal/tdo.js` code; only external
dependencies such as `pg` are mocked.

The disadvantage of this approach
is that unit tests in `asset.spec.js` may be affected by unrelated
changes to the implementation in `tdo.js`, such as optimizations that
reduce the number of database queries made.

The advantage is better test coverage. The DAL and resolver modules
are complex and have many interwoven dependencies that are sensitive
to minor changes such as object key names and async vs. sync functions
(that is, returning a Promise vs. a plain value).

### Running the tests

To run a single test module:
`jest dal/library.spec.js`

If `jest` is not on your command PATH, then:
`node_modules/.bin/jest dal/library.spec.js`

To watch a module and run tests whenever it (or the test file) changes:
`jest --watch dal/library.spec.js`

To run them all and generate coverage:
`npm test -- --noci`

By default, `npm test` will run the unit test but then also start up a
local server and run the API test suite with coverage instrumentation.
If you want to skip this, pass the `--noci` option as above.

## API Testing

Every API change must have a corresponding API test in `citest`,
activated in the `tests.sh` file for use in the post-deploy CI stage.
See any existing file for examples of how to write API tests.
Unit tests are _not_ a replacement for API tests.

To run a single test suite:
`mocha citest/libraries.js`

To run the entire set, set the environment variables `TESTS_USER`, `TESTS_PASSWORD`, and `TESTS_TOKEN`, then run `npm test`.

See the main README.md for more information.

# core-graphql-server Contributor's guide

WIP

## Schema changes

"Schema Conventions" in the main README has some details on the
expected format for new types, queries, and mutations.
PRs that do not comply will be rejected.

It's best to submit a schema change proposal AHEAD of the PR for
anything non-trivial.

## package-lock changes

Don't!

Changes to `package-lock.json` have the potential to cause serious regressions by
changing the versions of various nested dependencies.

The file should _not_ be checked in if it only changed because you ran `npm install`.
New or modified dependencies in `package.json` might require a `package-lock.json` update.
In this case, be prepared for extra regression testing; the change should be merged
at least a full day before release branches are cut, preferably longer.

## Code factoring

A typical code stack looks like this:

- Query, mutation or type definition in `schema.graphql`
- Resolver function in `Query.js`, `Mutation.js`, or `TypeName.js`
  that does nothing except call a corresponding function in `dal/typeName.js`
- Business logic related to access control, logging, audit, etc. handled by the framework (typically no operation-specific code needed)
- GraphQL-independent logic in `dal/typeName.js`

In many projects, the DAL/data access layer is kept as thin as possible and does nothing but read/write data to a given back end. All other
logic is kept in a separate BLL/business logic layer.

In core-graphql-server it's okay to add some business logic in
DAL functions. We do this to avoid adding an extra code layer that,
in most cases, would do nothing because most business logic is
handled by the generic framework.

`dal/mapper.js` is also optional.

Most source files go in the implicit core module (`/dal`, `/resolvers`, `/schema` etc.). We have the ability to separate API components out
into modules that can, theoretically by `require`'d from anywhere.
A given server instance or schema can be configured to use only
certain modules. We use this method, for example, to expose an
"internal" schema only on a separate endpoint.

For most features this is not needed and code can go in the "core" module. The largest existing separate module, `v3DataModel`, is
separated only for historical reasons and eventually be folded
back into the core.

## SQL queries

All access to Postgres should use plain `pg` via the
connection objects provided in `serviceContext.dbConnections`.

We experimented with the use of ORM (in the structured data APIs).
Although the concept is sound, it proved inflexible, difficult to
optimize, and difficult to work into our change management process.
No more ORM.

GraphQL largely obviates the need for huge queries with complex
joins, since resolver functions for nested fields are independent.
Queries should be kept as simple and contained as possible, returning
only the data needed for top-level fields on a given object.
With the structure, size, and load on our Postgres databases, it's
proven much better to make many small, lightweight queries than
one complex query.

Queries should be declared directly in the functions that use them
as plain strings. This makes the code easy to read, and makes it
easy to identify where a given query is coming from.
That said, dynamic elements such as `where` clauses can be
injected dynamically. Here's a common pattern:

```
const where = [];
where.push('stuff = 1');
const sql = `
SELECT stuff FROM TABLE WHERE ${where.join(',')}
`;
```

The SQL utilities in `util.js`, such as `addSqlWhere`, can be used
but are not required. Consider using `addSqlWhere` as it handles
a lot of boilerplate such as array vs. single input detect, etc.

SQL variables should be used wherever possible.

When writing queries, assume that the tables you are working
with have 500 million rows.

Do not use complex transactions, especially in large tables.
It's better to make simple transactions (one write) and handle
cleanup in the code. This is due to the scale of many of our tables.
Multi-table transactions cause high locks and CPU load, contributing
to errors and even outages.

Make sure that unit tests cover your query generation
logic (see unit testing below). This helps to avoid runtime
error caused by things like an empty `where` array in
our example above.

_All new SQL queries must be reviewed by the API lead(s) and
database lead(s)!_

## Metrics and logging

You do not normally have to add any specific logging
or audit code. The framework handles this.

## Unit testing

Starting December 2018 we are enforcing more controls over unit test
coverage.

Guidelines:

- Each source file should have a corresponding unit test file in the
  same directly called `<fileName>.spec.js`. For example, we have `util.spec.js`, `rateLimit.spec.js`, etc.
- General utilities related to unit tests, such as reusable mocks,
  go in `/test`.
- Utility functions with no dependencies are easy to unit test; we should never have any without unit tests (this is not a new rule)
- Functions with dependencies, such as middleware and DAL functions,
  should use the mock utilities in `/test` to inject and use mock
  objects for full unit test coverage. See `rateLimit.spec.js` for an
  example of how to do this.
- Test coverage should include tests for events emitted, redis activity,
  etc. (again, see `rateLimit.spec.js`)
- A commit _cannot_ reduce or lower overall test coverage
- Files with dependencies on other services (database, etc.) should
  use mocks for those services. The generic mocks generated by `jest`
  are suitable for some cases. For Postgres, always use the mocks
  generated in `test/serviceContext.mock.js` to ensure that queries
  are parsed and we have a uniform way of injecting mock results.
- Calls to service mocks should be part of the unit test assertions,
  even if they don't affect function output. For example, a function
  that is supposed to emit messages should have assertions validating
  that the `messageUtil` mock was in fact called the correct number of times.
- `jest` runs tests in the build and can be used to auto-generate mocks.
  This is especially useful for system and third-party modules. Either
  generated or hand-built mocks can be used (or the existing common mocks
  in `serviceContext.mock.js`).
- `nock` is handy for mocking out raw HTTP calls. See the `download()` tests
  in `resolvers/util.spec.js` for an example.
- `jest` or `chai` can be used for `expect` assertion. We should gradually
  migrate toward `jest`, but either is fine as long as a given test file is consistent.

Unit tests affected by any staged file are run in a pre-commit hook.
The entire suite is run as part of the build (again, not new).

Test coverage analysis is now built into the test runs. It's set
at a minimum threshold configured in `package.json`. A commit that
decreases coverage below this threshold, either by adding code that
is not tested or deactivating existing tests, will be rejected either
in the precommit hook or the build.

As time goes on and we increase coverage over older code, this threshold
will ratchet up until it reaches a target level of > 90%.

### The service context mock

Most test files have a line like this:

```
// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
```

This sets up a mock service context that can be passed to any
resolver or DAL function that requires one (most do).
It also initializes some global mocks to make sure that code does not
attempt to call out to a real database, file system, etc.

These mocks can be disabled by passing options to the require function:

```
const serviceContext = require('../test/serviceContext.mock.js')({
  mockTimers: false,
  mockHttp: false,
  mockMessaging: false
});
```

This is sometimes necessary for a unit test suite that mocks at a different level.
For example, if we use `nock` to mock specific HTTP responses then the `http` and
`https` modules don't need to be mocked (and will generate errors if they are).
More mocks might be added over time -- refer to the top portions of the file
for an authoritative list.

This file is also where the handlers for unhandled exceptions and
rejections are configured. These are used to make sure we fail a test
if asynchronous code somewhere failed to handle an exception or rejection
(rather than fail silently with a console warning).

### Postgres SQL mocks

Nearly every GraphQL API hits the Postgres database. Thus, unit testing around
the handling of database responses _and_ the SQL itself is essential.
Unit tests use SQL mocks heavily.

Here's an example. Say the DAL function under test makes a query like:

```
SELECT
  library_engine_model_id AS id
FROM
  library.library_engine_model
WHERE
  library_engine_model_id = $1 AND
  library_id = $2 AND
  engine_id = $3 AND
  library_version = $4
```

We mock the result and validate the input (SQL and variables) like so:

```
// we're going to push a SQL result to the core database read connection.
serviceContext.dbConnections['core'].read._push(
      // the mock result. must be an array of objects with keys matching
      // the query's SELECT clause and realistic values.
      [
        {
          id: libEngineModelId
        }
      ],
      // parse SQL. by default this is true. set to false
      // only for certain queries that the test SQL parser can't handle.
      true,
      // strings that must be found in the
      // SQL. used for quick and easy validation.
      ['library_engine_model_id', 'engine_id', 'library_id', 'library.library_engine_model', 'library_version'],
      // a function that validates the SQL and variable values.
      // handy for deeper validation.
      (sql,  // the SQL text passed to pg.query/map/etc.
       vars, // the SQL variable array. might be null.
       ast   // the full abstract syntax tree, if you want to get clever
       ) => {
        // here we'll validate that $3 is a string. if it isn't,
        // Postgres will error out.
        if (!_.isString(vars[4]))
          throw new Error('version param $3 not a string');
        // here we'll validate that the correct, expected values were
        // passed in the variables $1, $2, and $3.
        // similar logic can be used to validate time ranges for date/time
        // variables, etc.
        if (vars[0] !== libEngineModelId)
          throw new Error('wrong $1:  ' + vars[0]);
        if (vars[1] !== libId) throw new Error('wrong $2:  ' + vars[1]);
        if (vars[2] !== engId) throw new Error('wrong $3:  ' + vars[2]);
        // be sure to return true.
        return true;
      }
    );
```

The SQL mock module maintains a queue per database connection.
Mocked results are popped from the queue in sequence, so if the DAL function
under test makes four queries to the `core` database, then the test code will
need to `_push()` four mock results before executing the function.

You are also free to use `jest` to mock SQL calls instead of the homebrew
module. If you do, be sure to plug in real mock functions that parse the
SQL (see `test/mockSql.js`) and perform real validation in the same way
as the example above.

### Note on unit test philosophy

In the conventional unit test methodology, the unit test for a
given source file should be independent of other source files.
Any dependencies are mocked. For example, say `dal/asset.js`
calls functions in `dal/tdo.js`. `dal/asset.spec.js` would use
a mock of `dal/tdo.js` so that the tests only depend on the file
under test.

We do _not_ follow this model in all cases.
In the above example, the `dal/asset.js`
module is configured with the _real_ `dal/tdo.js` code; only external
dependencies such as `pg` are mocked.

The disadvantage of this approach
is that unit tests in `asset.spec.js` may be affected by unrelated
changes to the implementation in `tdo.js`, such as optimizations that
reduce the number of database queries made.

The advantage is better test coverage. The DAL and resolver modules
are complex and have many interwoven dependencies that are sensitive
to minor changes such as object key names and async vs. sync functions
(that is, returning a Promise vs. a plain value).

### Running the tests

To run a single test module:
`jest dal/library.spec.js`

If `jest` is not on your command PATH, then:
`node_modules/.bin/jest dal/library.spec.js`

To watch a module and run tests whenever it (or the test file) changes:
`jest --watch dal/library.spec.js`

To run them all and generate coverage:
`npm test -- --noci`

By default, `npm test` will run the unit test but then also start up a
local server and run the API test suite with coverage instrumentation.
If you want to skip this, pass the `--noci` option as above.

## API Testing

Every API change must have a corresponding API test in `citest`,
activated in the `tests.sh` file for use in the post-deploy CI stage.
See any existing file for examples of how to write API tests.
Unit tests are _not_ a replacement for API tests.

To run a single test suite:
`jest libraries.spec.js --projects citest`

To run the entire set, set the environment variables `TESTS_USER`, `TESTS_PASSWORD`, and `TESTS_TOKEN`, then run `npm test`.

See the main README.md for more information.
