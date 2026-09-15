# core-graphql-server: Veritone GraphQL API

See the public documentation at https://docs.veritone.com
for more information, including an overview of GraphQL and the APIs.

Before you open a PR, read the whole README and (CONTRIBUTING.md).

## Getting started

Clone the repo.

Review the default settings in `server.json`. They will work for most development environments.

Make sure Tunnelblick is running and you have connections to the dev VPN.

Now install all dependencies. You'll need to do this once after cloning,
and again after any `git pull` that pulls down a new dependency change in
`package.json` (a "cannot find module" error from Node is a hint that this
has happened).

```
npm install
```
If you run into issues with node-gyp, check: https://github.com/nodejs/node-gyp/blob/master/macOS_Catalina.md#node-gyp-v7
TLDR: `npm intstall -g node-gyp`, `npm config set node_gyp <path to node-gyp>`


Run the build:

```
npm run build
```

This is only needed the first time, after you clone the repo, or after a fresh `npm install`.

To run the server you need a VPN tunnel open to the aws-dev environment
and a local instance of NSQ. Without these connections the server will crash on start (this is a recent change as of August 2018).

You can choose to install/run NSQ manually, or run it via Docker:

1.  Running NSQ manually

```
// Install nsq
brew install nsq

// Start nsq service
brew services start nsq
```

2.  Alternatively, you could use docker compose to launch all dependencies to run the server:

```
cd ./local

// To startup
docker-compose up -d

// To shutdown
docker-compose down

// To restart, used to flush cache and queue
docker-compose restart
```

Ensure you are configured to run the correct verison of node. You will need to do this every
time you open a new terminal (assuming your system-wide default node version isn't already
set to what this project requires in the `.nvmrc` file). If you get an error saying the version
is not installed yet, follow the instructions in the error to install it.

```
# Node 16

nvm use
```

For LOCAL mode: We must run a few scripts to init the DB
```
./local/db/create-db.sql
./local/db/create-user.sql
```

Now start up the Core GraphQL server:

```
# Set env to run: export ENVIRONMENT=env
# [env=dev|stage|prod] will use ./server.json
# By default: ENVIRONMENT=dev

# DB info
export PG_READ_USER= #?
export PG_READ_PASS= #?
export PG_WRITE_USER= #?
export PG_WRITE_PASS= #?

cd ./local && ./run-local.sh
```

The server is running and you should see some console log output as it
initializes.

Sign into [https://aws-dev.veritone.com/login](aws-dev.veritone.com/login).

Add the following to your /etc/hosts file:

```
127.0.0.1   local.veritone.com
```

Then open [http://local.veritone.com:3000/graphiql](http://local.veritone.com:3000/graphiql).
This will bring up the GraphQL UI that you can use to test and debug queries.
You'll be signed in automatically.

You can also reach GraphiQL at [http://localhost:3000/graphiql](http://localhost:3000/graphiql). This URL will
not recognize your dev environment cookie, so you will not be signed in unless
you use one of the server settings below.

The API is available for direct query at [http://localhost:3000/graphql](http://localhost:3000/graphql).

See [http://graphql.org/learn/queries/](http://graphql.org/learn/queries/)
for general documentation on constructing GraphQL queries. See #docs/samples.md
for some specific examples.

### Authentication

Authentication works the same as in all the other API services.
Pass the Authorization header with a valid token. The server will validate
the token (unless authentication is disabled as described below).

The server accepts all token types (user, API, engine JWT, oauth).

### Server settings

The following settings can be added to server.json.

The GraphiQL UI makes requests to the server to introspect the schema and
make queries. Thus, if authentication is enabled on the server, GraphiQL must
send a valid authentication token with each request. If local.veritone.com
development is enabled as described above, no more action is needed.

For signed s3 urls, the AWS credentials need to be set up in your environment variable.
The following variables to the `.env` file:
`AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY`
`AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY`
You can get sample values from the server.json file but a key can be generated for your account
by following: [https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html?icmpid=docs_iam_console#Using_CreateAccessKey]

## Data model overview

See https://steel-ventures.atlassian.net/wiki/spaces/VT/pages/318439949/GraphQL+QPI+ERD
for the authoritative list or the schema documentation.

## Contributing to this repo

Be sure to read the contributor's guide at (CONTRIBUTING.md).

Contributions are welcome from anyone. However, we must take care to keep consistency
and integrity both in the API and schema and in the code itself. Contributors must
adhere to the following process.

* There must be a ticket, and that ticket must have a clear description of the
  change needed and the use case for it. Ideally, the GraphQL schema change proposal
  will be shown directly in the ticket.

* Consult the repo maintainer (@smalabarba-at-work) _before_ starting implementation.

* Document proposed schema changes. _Breaking changes require special approval
  and will usually not be accepted_. Breaking changes include: adding a new required
  field to an input type already in use, changing the
  type of a field, removing a value from an enum, removing or renaming a field,
  mutation, query, or type, etc. All schema changes must follow the schema conventions,
  detailed in the relevant section of this README.

* Determine where you'll be adding code. Generally, it's additions or modifications to
  `schema.graphql` and one or more resolver functions in the `resolvers` module.
  Note the structure in `resolvers` -- each type, include `Query` and `Mutation`, has
  its own file, and these files are all loaded in `resolvers/index.js`.

* Use GraphiQL + unit tests + API tests to test as you develop.

* Your new code _must_ have unit tests. These are tests, using the Jest+Expect
  framework, that directly test the code and live alongside in the `<filename>.spec.js` format.

* Your new code _must_ have API integration tests. These tests live in `citest`;
  see `citest/search.js`, `citest/tdo.js`, `citest/libraries.js`, etc. for examples.

* The API tests _must_ pass 100% on all environments (dev, stage, and prod)

* The API tests _must not_ have
  dependencies on pre-existing objects. For example, if your test for a new engine-related
  API requires a TDO/recording, then it must create that TDO as a setup step.

* The API tests _must_ clean up after themselves. Typically the last steps in a test
  suite delete any objects the test created.

* All _existing_ unit _and_ API tests must pass before you merge your changes.
  The Jenkins build will run them automatically against your feature branch.
  You'll need to address any failures before merging.

* Be sure to handle errors properly, within the framework.
  _Do not swallow errors._ Errors should be allowed to bubble up to the top-level
  GraphQL server layer, which will properly format and embed them into the response.
  Do catch errors and rethrow as a specific type from `errors/index.js` if doing so
  can add useful information. Do not throw plain `Error` or any other type outside
  of the `errors` module unless you're making a paranoid check for a server bug that
  would never surface to a user.

* Your PR _must_ include documentation. Any queries, fields, mutations, etc.
  added to the schema must have complete in-line documentation. Some features might
  require additional documentation on the public wiki.

* When ready, open a PR. Multiple smaller PRs are better than one big one -- it's
  OK to commit and merge code in layers. Make sure to adhere to the PR template.

_Current API tests for your feature are critical!_ The integration API tests are
how we know that your code is working. It is how we verify functionality after a
release and test for regressions. _No one else is going to test your code!_

### Branch naming

core-graphql-server, like every other Veritone engineering repo that is integrated
into the CI/CD pipeline and release process, requires the following branch naming scheme.

* normal working feature branches must be called `feature/VTN-XXXX`, where `XXXX` is a
  valid Jira ticket number corresponding to the change. A descriptive suffix can be added
  (`feature/VTN-12345-librariesQuery`, etc.)
* hotfix branches must be called `hotfix/VTN-XXXX`. Ideally the prospective hotfix
  number will be in the suffix, like `hotfix/VTN-12345-2019.24.1` (for the first
  hotfix after release `2019.24.0`). Hotfix branches are automatically deployed
  to stage. _Do not push a hotfix branch unless you are actively working on a hotfix!_
  Do not push a hotfix branch just because you want to test something on stage. This can
  disrupt release testing.
* release branches are called `release/<year>.<week of year>.0`, like `release/2019.24.0`.
  They are automatically created during the release staging process and should never be
  created manually.

If you don't use the correct naming convention for your feature branch, Jenkins won't
build it and your PR will never pass the build validation check required to merge.

## Schema conventions

* Use camel case, starting with lower case, for all field names (including query and mutation names)
* Use camel case, starting with upper case, for all type, input type, and enum names
* The input type for a mutation should be the capital-starting match for its name. For example,
  `CreateAsset` is the input type for `createAsset`.
* Every mutation should have a distinct input type, even if it contains exactly the same
  fields as another input type. This is for future-proofing, so that we can add fields to
  one without changing the other.
* The primary ID field for a given type should always be called `id`,
  not `<type>Id` (`assetId`, `entityId`, etc.).
* A type that has a relationship to another type should always have an
  object-valued field. That is, if there is a `taskId` field, then there should
  also be a `task` field (of type `Task`)
* A field that returns a list or set of results should return a type called
  `<type>List` and that type should implement `Page`. This ensures a consistent
  experience for paging through results. See `AssetList`, `EngineList`, etc.
* Similarly, a field that returns a `Page` should have the parameters `offset` and
  `limit` to control paging. They should have defaults. For example, `assets(id: ID, offset: Int=0, limit: Int=30, assetType: String): AssetList`.
* Most types should have a query that returns a single object by ID.
  It'll look like `myType(id: ID!): MyType`, or for a real example, see `asset(id: ID): Asset`.
* Most types should have a query that returns a listing or search and has multiple
  parameters a user can use to filter the results. Typically `id` will be a parameter here as
  well, but optional. If filter/search by id is supported then there should also be an `ids: [ID!]` parameter.
* Use enums for field and parameter values wherever possible, instead of freeform
  string or integer.

## Generating schema diagrams

You can easily generate updated diagrams directly from the GraphQL schema.

First do some one-time setup:
`brew install graphviz`
`npm install -g graphqlviz`

Generate a PNG from the local schema file:
`graphqlviz schema/schema.graphql -g | dot -Tpng -o graph.png`

Generate the graph and open for viewing:
`graphqlviz schema/schema.graphql -g | dot -Tpng -o graph.png | open -f -a Preview`

Generate PNG from a server-side schema:
`graphqlviz http://localhost:3000/api | dot -Tpng | open -f -a Preview`

The graph for the complete schema is huge and difficult to read.
A simplified ERD is maintained at https://steel-ventures.atlassian.net/wiki/spaces/VT/pages/318439949/GraphQL+QPI+ERD.

## Generating documentation

The GraphiQL UI provides dynamic, interactive access to schema documentation.

It may also be convenient to generate static documentation.

First install graphdoc:

```
npm install -g @2fd/graphdoc
```

Then, whenever you `git pull` or make changes you can regenerate documentation
like so:

```
graphdoc -s ./schema/schema.graphql --force -o ./docs
```

It'll put HTML files in ./docs or the directory of your choice.

## Code organization

* server.js -- the Express app root
* schema -- contains the schema definition
* resolvers -- schema resolvers that plug GraphQL into the real back end repositories
* dal -- data access layer functions. loosely organized. db.js contains code
  that directly queries the database. dal.js, engineDal.js reuse existing DAL layer
  code from other services such as core-recording-server and core-job-server.
* test -- test code. Currently these are API-level functional tests, not
  proper unit tests (.spec.js)
* flyway -- Flyway database migration configuration files and SQL script files.

The flow for a query goes like this:

* Express receives the incoming request and invokes the usual middleware (middlewareAuth, etc.)
* Middleware injects some data into the request context, such as UserInfo.
* Express delegates the request to Apollo server
* Apollo validates the query against the schema
* the schema, including valid queries, mutations, and types, along with
  their fields, arguments, and payloads, are defined in `schema.graphql`
* Apollo invokes the _resolver_ for the specified query or mutation. These
  are functions, defined in `resolvers`. The first, top-level resolver is
  for the query or mutation and will be found in the `Query` or `Mutation`
  blocks. Typically, this resolver will invoke a function from the `dal`
  package, which will make a database query.
* Most fields and types do not require additional resolvers -- they're
  just returned in the original query. Some, however, do. For example, to
  populate the `assets` field of a `TemporalDataObject` we must make a separate
  query.
* The query executes. The resolvers, as their final step, marshal the response
  data into JavaScript objects corresponding to the schema. Apollo validates
  the format against the schema and streams the result back as JSON.
* Apollo handles any errors that occur in the resolvers.

## API Testing

An initial test harness is in place. The files are in `citest`. They are API-level
integration tests that run against a live server.
First copy `testconfig-template.json` into `testconfig.json`
and fill in the appropriate values (username, etc.). The API token should be
an API key for the org your user belongs to. You can make one in the admin UI
if needed.

An example looks like this:

```
{
  "userName":"myemail+superadmin@veritone.com",
  "password":"changeme",
  "apiToken":"7682-human:522c10cf-ab14-1658-13c3-226ej21262ce-278c4596-1813-1cee-1d2d-5ba2a7143fa2",
  "env":"aws-dev",
  "graphql_url":"http://localhost:3000/graphql"
}
```

This configuration will run the tests against your local server with the supplied credentials.

Run `npm install` and `npm start` if you have't already.

Connect to the aws-dev VPN -- connectivity to dev Postgres and Redis are required (at least
if you're testing your local server).
NSQ is optional. See "Running NSQ manually" or "Run NSQ via Docker" in this file to run it.
If NSQ is not available the server will operate in failover mode and write messages to a
temporary spool. This does not interfere with API test completion.

The first time, you will need to install mocha globally by running `npm install -g mocha`.

Then `mocha citest/tdo.js`, `mocha citest/engines.js`, etc. to run a test suite.
`mocha test` will run them all.

To override the config file location, use `mocha --conf <file name>`, such as
`mocha --conf testconfig-dev.json citest/basicJobs.js` to run the basic jobs suite
against dev. `testconfig-dev.json` would look like:

```
{
  "userName":"myemail+superadmin@veritone.com",
  "password":"changeme",
  "apiToken":"7682-human:522c10cf-ab14-1658-13c3-226ej21262ce-278c4596-1813-1cee-1d2d-5ba2a7143fa2",
  "env":"aws-dev"
}
```

If you don't specify a GraphQL URL, it'll default to `https://api.<env>.veritone.com/v3/graphql`.

Most test suites log in using the supplied credentials and then use the session token
to authenticate each requests. Thus, a login failure will cause all or most
subsequent tests to fail.

Tests cannot contain hard-coded object IDs; we cannot assume these objects will
be present on all environments. Thus, most tests create and later clean up (delete)
any objects required for testing. _All_ objects created for the test should be
deleted at the end of the suite (this also ensures coverage over the delete APIs).

The tests at the top of `tests.sh` are run during the post-deploy tests and
_MUST_ pass 100% on all environments. Others are experimental and can be useful
to run manually, but don't count for test coverage.

Note that most test suites will print out the authentication token (only
on local dev environments, not in CI testing). This is a handy way to
grab the user token for manual testing.

`npm test` will run the full unit test suite and then, if it passes,
run the API test suite against a local test server with instrumented code
that generates coverage. You must have a VPN connection to the dev environment.
There are no other dependencies (messages will not be sent to core-eventing service).

## Where do I get a token?

Typically you don't need to explicitly get an authentication token.
If you're logged into the platform on the target environment, GraphiQL will
automatically pick up your authentication session. https://local.veritone.com:3000/graphiql
will leverage your `aws-dev` session (if you're logged in).

You can sniff your session token from the UI using Chrome developer tools or something similar. The `dev-veritone-session-id` cookie contains the token (on dev - on stage and prod it's `veritone-session-id`).

To get an engine JWT for testing, you can use the `getEngineJWT` mutation to generate an engine JWT

## Docker

### Building

```
# export env vars for building
export GITHUB_ACCESS_TOKEN=<YOUR_GITHUB_TOKEN>

# build it
docker build -t core-graphql-server --build-arg GITHUB_ACCESS_TOKEN=$GITHUB_ACCESS_TOKEN .
```

Note that a docker build will include unit tests and will start up a local server
inside the container and run API tests. It's the best option to duplicate a real Jenkins build.

### Running Locally

```
# export env vars for running
# [ENVIRONMENT=dev|stage|prod] fetch config.json from binaries

export ENVIRONMENT=dev
export APPLICATION=core-graphql-server
export RUN_ENVIRONMENT=LOCAL
export NODE_ENV=development
export JWT_SECRET=test-jwt-secret
export PG_USER= #?
export PG_PASS= #?

# run container and expose on localhost:3000
docker run --env ENVIRONMENT=$ENVIRONMENT --env APPLICATION=$APPLICATION --env JWT_SECRET=$JWT_SECRET --env PG_READ_USER=$PG_USER --env PG_READ_PASS=$PG_PASS --env PG_WRITE_USER=$PG_USER --env PG_WRITE_PASS=$PG_PASS -it -p 3000:3000 --network local_default core-graphql-server:latest

Note: This depends on shuttling for now because we need access to the environments' NSQ and Redis.
```

### Pulling Latest from ECS

```
aws ecr get-login --no-include-email --region us-east-1
docker pull 026972849384.dkr.ecr.us-east-1.amazonaws.com/core-graphql-server:latest
```

## Why did my commit get rejected?

A Git pre-commit hook runs validation on staged files during commit.
If it rejects your commit:

* Lint failure. Run `npm run lint` locally to see and fix error. This is rare, but happens
  occasionally when `eslint` and `prettier` disagree.
* A unit test broke. Run `npm test -- --noci` to run the whole suite and see what broke.

## Why did my feature branch build fail?

A unit test broke. Run `npm test -- --noci` to run the whole suite and see what broke.
This is rare due to the pre-commit hook, but can happen.

An API test broke. Run `npm test` locally to verify that the complete on your
local environment. If they run clean and you're sure your changes did not affect
the failed tests, there might be a "flaky" test that depends on timing. In this
case you can try re-running the build.

Jenkins weirdness. This is rare but happens. If you see the build fail _before_ it
even clones the repo, it's probably not a problem with your branch.
In this case, try re-running the build. If that doesn't work, devops might need to assist.

## Flyway

core-graphql-server will run Flyway command to perform database migration at startup time
if `flyway.migrate` in server configuration is set to `true`.

Databases to be migrated are listed under `flyway.db`. For each database, the `configPath` property
specifies where core-graphql-server saves the database's Flyway configuration file.
core-graphql-server generates Flyway configuration file for each database based on `flyway\conf\flyway_template.conf` file
and database `write` connections defined in `db` (Note: not `flyway.db`).

The migration scripts for a database should be saved under folder `${configPath}/sql`.

We use Flyway's default naming pattern for SQL script files. It is
V${major version}\_${minor version}\_\_${description}.sql

for example, `V1_01__grant_select_to_postgres_on_flyway_table.sql`.
