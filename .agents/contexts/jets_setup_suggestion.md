Yes. If you're aiming for **simple + maintainable + reusable**, I would avoid building a huge testing framework around Jest.

 For GraphQL API unit tests, I'd use a small layered structure:

```
tests/
├── setup.ts                 # global Jest setup
├── helpers/
│   └── graphqlTestClient.ts # reusable GraphQL caller
├── factories/
│   └── folderFactory.ts     # reusable test data
└── folder/
    ├── folder.query.test.ts
    ├── folder.mutation.test.ts
    └── folder.permissions.test.ts
```

 The design principle is:

 > **Tests should describe behavior; helpers should hide infrastructure.**

 So your test should ideally read like this:

```
const result = await graphqlClient.query(GET_FOLDER, {
  id: folder.id,
});

expect(result.data.folder).toMatchObject({
  id: folder.id,
  name: "Documents",
});
```

 rather than repeating HTTP/GraphQL plumbing in every test.

---

 # 1\. The architecture I'd recommend

 Think about your test setup as four layers:

```
┌──────────────────────────────────────┐
│             Test Cases               │
│                                      │
│  "should return a folder"            │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│         GraphQL Test Client           │
│                                      │
│  query()                             │
│  mutate()                            │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│         Application / API             │
│                                      │
│       GraphQL → Resolver → Service   │
└──────────────────────────────────────┘
```

 Then separately:

```
Factories
    │
    └── createFolder()
    └── createUser()
    └── createTenant()
```

 The tests use factories to prepare data.

---

 # 2\. Keep Jest configuration boring

 For example:

```
jest.config.ts
```

```
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",

  setupFilesAfterEnv: [
    "<rootDir>/tests/setup.ts",
  ],

  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
  ],

  clearMocks: true,

  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.types.ts",
  ],
};

export default config;
```

 Nothing fancy.

 You don't want 500 lines of Jest configuration.

---

 # 3\. Global setup should be minimal

```
tests/setup.ts
```

 For example:

```
beforeEach(() => {
  jest.clearAllMocks();
});
```

 That's it.

 Don't put test-specific setup here.

 A common mistake is turning `setup.ts` into:

```
setup.ts
    ├── database
    ├── users
    ├── folders
    ├── authentication
    ├── GraphQL
    ├── mocks
    ├── environment
    └── everything else
```

 Eventually nobody knows what the tests actually depend on.

 Keep global setup truly global.

---

 # 4\. Create one reusable GraphQL test client

 This is probably the **most valuable abstraction**.

 For example:

```
tests/helpers/graphqlTestClient.ts
```

```
export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
  }>;
}

export interface GraphQLClient {
  query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>>;

  mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>>;
}
```

 Then implement it around whatever your application uses.

 For example, if you're testing over HTTP:

```
import request from "supertest";

export function createGraphQLClient(app: unknown): GraphQLClient {
  return {
    async query<T>(query, variables) {
      const response = await request(app)
        .post("/graphql")
        .send({
          query,
          variables,
        });

      return response.body;
    },

    async mutate<T>(mutation, variables) {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: mutation,
          variables,
        });

      return response.body;
    },
  };
}
```

 Now your tests don't need to know about `supertest`.

 That's good separation of concerns.

---

 # 5\. Why `query()` and `mutate()`?

 GraphQL has different operation types:

```
query {
  ...
}
```

 and:

```
mutation {
  ...
}
```

 But from the testing infrastructure perspective, they're both just GraphQL requests.

 You could even simplify the abstraction to:

```
graphqlClient.execute(...)
```

 Personally, I prefer:

```
client.query(...)
client.mutate(...)
```

 because the test becomes easier to read.

---

 # 6\. Put GraphQL operations in their own files

 Don't do this everywhere:

```
const response = await client.query(`
  query GetFolder($id: ID!) {
    folder(id: $id) {
      id
      name
      parent {
        id
        name
      }
    }
  }
`);
```

 Instead:

```
tests/
└── graphql/
    └── folder/
        └── operations.ts
```

```
export const GET_FOLDER = `
  query GetFolder($id: ID!) {
    folder(id: $id) {
      id
      name
      parent {
        id
        name
      }
    }
  }
`;
```

 Then:

```
const result = await client.query(GET_FOLDER, {
  id: folder.id,
});
```

 Much cleaner.

---

 # 7\. Use typed GraphQL responses

 This is where TypeScript becomes really useful.

 Define:

```
interface GetFolderData {
  folder: {
    id: string;
    name: string;
    parent: {
      id: string;
      name: string;
    } | null;
  } | null;
}
```

 Then:

```
const result =
  await client.query<GetFolderData>(
    GET_FOLDER,
    {
      id: folder.id,
    },
  );
```

 Now TypeScript understands:

```
result.data?.folder?.id
```

 and:

```
result.data?.folder?.name
```

 This is much better than:

```
result.data.folder.whateverRandomProperty
```

---

 # 8\. Eventually, generate these types

 For a real GraphQL project, I wouldn't manually maintain all those interfaces forever.

 I'd strongly consider **GraphQL Code Generator**.

 The architecture becomes:

```
GraphQL schema
      │
      ▼
GraphQL Code Generator
      │
      ├── TypeScript types
      ├── operation types
      └── variables types
```

 Then your tests get strong typing automatically.

 For example:

```
client.query<GetFolderQuery>(
  GET_FOLDER,
  {
    id: folderId,
  },
);
```

 You don't manually define `GetFolderQuery`.

 But I'd learn the basic approach first before introducing code generation.

---

 # 9\. Use factories for test data

 This is the second major abstraction I'd recommend.

 Suppose your folder requires:

```
type Folder = {
  id: string;
  name: string;
  tenantId: string;
  parentId: string | null;
};
```

 Don't repeat this everywhere:

```
const folder = {
  id: "123",
  name: "Documents",
  tenantId: "tenant-1",
  parentId: null,
};
```

 Instead:

```
tests/factories/folderFactory.ts
```

```
export function buildFolder(
  overrides: Partial<Folder> = {},
): Folder {
  return {
    id: crypto.randomUUID(),
    name: "Documents",
    tenantId: "tenant-1",
    parentId: null,
    ...overrides,
  };
}
```

 Now:

```
const folder = buildFolder();
```

 Or:

```
const folder = buildFolder({
  name: "Videos",
});
```

 This follows the **Object Mother / Test Data Builder** style of pattern.

---

 # 10\. Separate `build` from `create`

 This is an important pattern when your tests become bigger.

 I'd eventually have:

```
buildFolder()
```

 and:

```
createFolder()
```

 They mean different things.

 ### `buildFolder()`

 Creates an object in memory:

```
buildFolder()
     ↓
JavaScript object
```

 ### `createFolder()`

 Persists it:

```
createFolder()
     ↓
Database
```

 For example:

```
const folder = buildFolder({
  name: "Documents",
});
```

 versus:

```
const folder = await createFolder({
  name: "Documents",
});
```

 That distinction makes tests much easier to reason about.

---

 # 11\. Authentication should also be a helper

 Because you're working with an enterprise multi-tenant API, authentication will probably become important.

 You don't want every test doing:

```
request(app)
  .post("/graphql")
  .set("Authorization", `Bearer ${token}`)
  .set("x-tenant-id", tenantId)
```

 Instead:

```
const client = createGraphQLClient(app, {
  user,
  tenant,
});
```

 Then:

```
const result = await client.query(
  GET_FOLDER,
  { id: folder.id },
);
```

 The client handles:

```
user
 ↓
authentication
 ↓
tenant context
 ↓
GraphQL request
```

 Your test focuses on behavior.

---

 # 12\. Your final test becomes very small

 This is what we're aiming for.

```
describe("Get Folder", () => {
  it("returns a folder belonging to the tenant", async () => {
    const tenant = await createTenant();

    const folder = await createFolder({
      tenantId: tenant.id,
      name: "Documents",
    });

    const client = createGraphQLClient(app, {
      tenant,
    });

    const result = await client.query<GetFolderData>(
      GET_FOLDER,
      {
        id: folder.id,
      },
    );

    expect(result.errors).toBeUndefined();

    expect(result.data?.folder).toMatchObject({
      id: folder.id,
      name: "Documents",
    });
  });
});
```

 Read that test aloud:

 > Given a tenant, create a folder.\
>  Ask the GraphQL API for that folder.\
>  Expect the folder to be returned.

 That's a **good test**.

---

 # 13\. Don't over-abstract your assertions

 There's a temptation to create:

```
expectGraphQLSuccess(...)
expectGraphQLError(...)
expectFolder(...)
expectTenantIsolation(...)
```

 for everything.

 Be careful.

 This:

```
expect(result.data?.folder).toMatchObject({
  id: folder.id,
  name: "Documents",
});
```

 is already extremely readable.

 You don't need:

```
expectFolderResponseToMatchExpectedFolder(
  result,
  folder,
);
```

 unless that logic is genuinely repeated many times.

 ### Good abstraction

 Hides technical plumbing:

```
createGraphQLClient()
createFolder()
createTenant()
```

 ### Bad abstraction

 Hides what the test is actually asserting:

```
assertExpectedFolderResponse()
```

 A good rule:

 > **Abstract setup and infrastructure; keep business assertions visible.**

---

 # 14\. Organize tests by business behavior

 I'd avoid:

```
tests/
├── queries/
├── mutations/
├── resolvers/
├── services/
└── controllers/
```

 for GraphQL API tests.

 Instead, organize around the feature:

```
tests/
└── folder/
    ├── folder.query.test.ts
    ├── folder.mutation.test.ts
    ├── folder.permissions.test.ts
    └── folder.tenant-isolation.test.ts
```

 Because when someone changes the folder feature, they know exactly where to look.

 For a larger system:

```
tests/
├── folder/
├── watchlist/
├── application/
├── asset/
└── authentication/
```

 This scales nicely.

---

 # 15\. A pattern I particularly recommend for your situation

 Since you're testing a **multi-tenant GraphQL API**, I'd use this architecture:

```
tests/
│
├── setup.ts
│
├── helpers/
│   ├── graphql-client.ts
│   └── auth-context.ts
│
├── factories/
│   ├── tenant.factory.ts
│   ├── user.factory.ts
│   └── folder.factory.ts
│
├── graphql/
│   ├── folder/
│   │   ├── queries.ts
│   │   └── mutations.ts
│   │
│   └── watchlist/
│       ├── queries.ts
│       └── mutations.ts
│
└── folder/
    ├── folder.query.test.ts
    ├── folder.mutation.test.ts
    └── folder.tenant-isolation.test.ts
```

 The dependency direction is roughly:

```
              TEST
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
    Client  Factory  GraphQL operation
       │
       ▼
     API
       │
       ▼
   Application
```

 The test doesn't care how HTTP requests are constructed.

 The test doesn't care how authentication tokens are generated.

 The test doesn't care how fake folders are constructed.

 It cares about **behavior**.

---

 # 16\. One distinction I'd make early: unit vs API integration

 You said "GraphQL API unit tests."

 Strictly speaking, there's an important distinction.

 If your test does:

```
Jest
 ↓
HTTP
 ↓
GraphQL
 ↓
Resolver
 ↓
Service
 ↓
Database
```

 that's **not really a unit test**.

 It's an **integration/API test**.

 A true unit test might be:

```
Jest
 ↓
Resolver
 ↓
mocked service
```

 For example:

```
it("returns a folder", async () => {
  folderService.getFolder.mockResolvedValue(folder);

  const result = await resolver.folder(
    { id: folder.id },
    context,
  );

  expect(result).toEqual(folder);
});
```

 Both are valuable.

 I'd generally use:

```
                 Tests
                   │
          ┌────────┴────────┐
          │                 │
      Unit tests       API/integration
          │                 │
       Fast/many        Slower/fewer
          │                 │
       mocked             real-ish
       dependencies      application
```

 Don't make every GraphQL test hit the database.

---

 # 17\. The testing pyramid I'd use

 For an enterprise GraphQL API:

```
                 /\
                /  \
               / E2E\
              /------\
             /  API   \
            /Integration\
           /------------\
          /  Unit Tests  \
         /________________\
```

 Something like:

```
Many
 │
 │  Unit tests
 │  ████████████████████
 │
 │  Service/resolver tests
 │  ███████████████
 │
 │  GraphQL API tests
 │  ████████
 │
 │  E2E tests
 │  ██
 ▼
Few
```

 # 18\. Example of cURL to login  (you should use it as authentication fixture, environment variables)

 ```
curl 'https://api.stage.us-1.veritone.com/v3/graphql' \
  --compressed \
  -X POST \
  -H 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0' \
  -H 'Accept: application/json, multipart/mixed' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Accept-Encoding: gzip, deflate, br, zstd' \
  -H 'Referer: https://api.stage.us-1.veritone.com/v3/graphiql' \
  -H 'content-type: application/json' \
  -H 'Origin: https://api.stage.us-1.veritone.com' \
  -H 'Connection: keep-alive' \
  -H 'Cookie: OptanonConsent=isGpcEnabled=0&datestamp=Fri+Sep+04+2026+10%3A22%3A47+GMT%2B0700+(Indochina+Time)&version=202606.1.0&browserGpcFlag=0&isDntEnabled=0&isIABGlobal=false&hosts=&consentId=435e26d8-bd0b-4252-8c20-ca866433a71b&interactionCount=1&isAnonUser=1&prevHadToken=0&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1&fclco=&lastConsentTs=1788491822&intType=1&crTime=1788491823638&geolocation=VN%3B38&AwaitingReconsent=false; _clck=joz5bl%5E2%5Eg96%5E1%5E2438; OptanonAlertBoxClosed=2026-09-04T03:17:02.754Z; _gcl_au=1.1.1190530988.1788491823; _ga=GA1.1.1777421819.1788491811; _ga_V9F3W9WQ5R=GS2.1.s1788491810$o1$g1$t1788492458$j11$l0$h0; __q_state_Ksyr7F8Ps2SN5uio=eyJ1dWlkIjoiNzcxOGY4MTEtNTY0Yy00N2I5LThlMTAtOThiZDQ2NjA0YWZmIiwiY29va2llRG9tYWluIjoidmVyaXRvbmUuY29tIiwibWVzc2VuZ2VyRXhwYW5kZWQiOm51bGwsInByb21wdERpc21pc3NlZCI6ZmFsc2UsImNvbnZlcnNhdGlvbklkIjpudWxsLCJtcmQiOjE3ODg0OTIyMTIyMTN9; _uetvid=19508c00a80f11f1a0dde9e84cbc435c; _bti=%7B%22app_id%22%3A%22veritone%22%2C%22bsin%22%3A%22o7qF647HZ2o2GGX5QSP5uklKpJLyVFH3di34pZD5yLEBWFMQ4s13erhjAiX5JBIfesEboj6yS8GAxqKNu65A3Q%3D%3D%22%2C%22external_ids%22%3A%7B%22zync%22%3A%22492851d8-b06d-45a8-9e22-c4864f0579d9%3A1788492189.5728643%22%7D%2C%22is_identified%22%3Afalse%2C%22known_to_zeta%22%3Afalse%7D; stage-veritone-session-id=0eb54c25-2960-4915-b972-43f2237fb3b3' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Priority: u=0' \
  --data-raw '{"query":"mutation login {\n  userLogin(\n    input: {\n      userName: \"citest-should-delete+55525-admin@veritone.com\",  \n      password: \"testUserPassword\"    \n    }\n  ) {\n    user {\n      id\n      organizationId\n      organization {\n        id\n        name\n      }\n    }\n    token\n    organization {\n      id\n      jsondata\n    }\n  }\n}\n\n# Create root folder\n\nmutation createRootFolder{\n\tcreateRootFolders {\n    id, \n    rootFolderTypeId,\n#     childFolders{\n      \n#     }\n\t}\n}\n\nquery getRootFolders{\n  rootFolders {\n    id\n    ownerId\n  }\n}\n\nquery getFolder{\nfolder(id: \"c9052eb0-7ae3-4369-9543-898bfe87deb9\") {\n  id\n  childFolders{\n    records{\n    \tid\n      name\n    }\n}}}\n\n# Create child example folder \n# in root folder\n\nmutation createFolder{\ncreateFolder(input: {\n  name: \"example\",\n  description: \"example\",\n  parentId: \"c9052eb0-7ae3-4369-9543-898bfe87deb9\",\n  rootFolderType:watchlist}) \n  {\n    id\n    name\n\t}\n}\n\n\nmutation updateFolder{\n  updateFolder(input: {\n    id: \"60cb9da1-ba01-41d7-91ce-4193f55dc204\",\n    name: \"new name\"}) {\n      name\n    }\n}\n\n\n\n\n\n","operationName":"login"}'
 
 ```

 Your GraphQL API tests should verify important integration points, while the majority of detailed business logic can be covered by faster unit tests.

---

 ## The design rules I'd give you

 If you're starting this project from scratch, I'd follow these:

 1. **Keep Jest configuration simple.**
2. **Create one reusable GraphQL test client.**
3. **Keep GraphQL queries/mutations separate from test code.**
4. **Use factories/builders for test data.**
5. **Separate `build` (memory) from `create` (database).**
6. **Hide authentication/tenant setup inside test helpers.**
7. **Keep assertions directly inside the test.**
8. **Organize tests around business features.**
9. **Don't call integration tests "unit tests"—know which layer you're testing.**
10. **Don't build a giant testing framework before you have repeated pain.**

 The end goal is that a new engineer can open a test and understand it in **30 seconds**:

```
it("does not allow a tenant to access another tenant's folder", async () => {
  const tenantA = await createTenant();
  const tenantB = await createTenant();

  const folderB = await createFolder({
    tenantId: tenantB.id,
  });

  const client = createGraphQLClient(app, {
    tenant: tenantA,
  });

  const result = await client.query(GET_FOLDER, {
    id: folderB.id,
  });

  expect(result.data?.folder).toBeNull();
});
```

 That's the standard I'd aim for: **boring infrastructure, expressive tests, minimal duplication.**