# Overview

This util attempts to provide a type-safe interface to execute GraphQL calls in the context of the citest.

## Goals
- Reduce boilerplate and redundant code (ex. creating tdo, job etc.)
- Improve code readability
- Ensure type safety
- Reduce wasted time on generating GraphQL queries and dealing with syntax errors
- Streamline AI code generation (ai tends to hallucinate often about what the graphql schema is) by providing a clear and concise interface for calling graphql.

# Using in tests

See the provided sample tests in the ./test directory and use `npm run create-test` to generalte boilerplate test.

# Adding queries/mutations

The current set is auto-extracted from the existing citests. You can add your own queries/mutations by either defining them preferably in the category under queries/extracted or in a new file under queries/extra.

1. run `bun run codegen` to generate the regenerate the client and type mappings.

2. run `bun build` to compile the generated typescript and fix the error about the duplucate definition by deleting the line (something in our schema seems to be causing this, will need to fix at some point)

3. write your test and do `bun run test` to run the tests.
