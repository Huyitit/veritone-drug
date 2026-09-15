const GraphqlClient = require('./gql');
const helpers = require('./index');
const { createIsolatedSuperadmin } = require('./superadminSession');

const config = helpers.config;
const env = config.env;

(new GraphqlClient(env).isEnableResourceTest() ? describe : describe.skip)(
  'citest_package: createIsolatedSuperadmin',
  () => {
    let gqlClient;
    let session;

    beforeAll(async () => {
      gqlClient = new GraphqlClient(env);
      session = await createIsolatedSuperadmin({ gqlClient });
    });

    afterAll(async () => {
      await session?.cleanup();
    });

    it('creates a throwaway org + superadmin and returns a working session', async () => {
      expect(session.token).toBeDefined();
      expect(session.orgId).toBeDefined();
      expect(session.userId).toBeDefined();

      const meResult = await gqlClient.query(
        `query { me { id organization { id } } }`,
        null,
        session.options
      );
      expect(meResult.me.id).toEqual(session.userId);
      expect(meResult.me.organization.id).toEqual(session.orgId);
    });

    it('the throwaway user is not a member of any other org', async () => {
      // Guards the core isolation property the whole fix depends on: this session
      // must never be enumerable by an org-scoped `KEYS TOKEN:*:<otherOrgGuid>` sweep.
      const meResult = await gqlClient.query(
        `query { me { organizationGuids } }`,
        null,
        session.options
      );
      expect(meResult.me.organizationGuids).toHaveLength(1);
    });
  }
);

(new GraphqlClient(env).isEnableResourceTest() ? describe : describe.skip)(
  'citest_package: createIsolatedSuperadmin cleanup',
  () => {
    let gqlClient;
    let session;

    beforeAll(async () => {
      gqlClient = new GraphqlClient(env);
      session = await createIsolatedSuperadmin({ gqlClient });
    });

    it('cleanup soft-deletes the org and invalidates the user session', async () => {
      const { orgId, options: staleOptions } = session;

      await session.cleanup();
      session = null; // prevent double-cleanup in afterAll (there is none here, but stay consistent)

      const bootstrap = await gqlClient.connect();
      const bootstrapOptions = helpers.requestOptions(bootstrap.token);

      const orgResult = await gqlClient.query(
        `query($id: ID!) { organization(id: $id) { id status } }`,
        { id: orgId },
        bootstrapOptions
      );
      expect(orgResult.organization.status).toEqual('deleted');

      // The pre-cleanup session token must no longer authenticate — proves the user
      // record (and/or its session) was actually removed, not merely that our own
      // reference to it went stale.
      await expect(
        gqlClient.query(`query { me { id } }`, null, staleOptions)
      ).rejects.toThrow();
    });
  }
);
