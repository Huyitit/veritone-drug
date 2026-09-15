const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const GraphqlClient = require('../../helpers/gql');
const uuid = require('uuid');
const _ = require('lodash');
const chakram = require('chakram');
const config = helpers.config;
const env = config.env;
const {
  deletePackageQuery,
  createOrgOptionDefault
} = require('../packageCommonQuery');
const {
  createIsolatedSuperadmin
} = require('../../helpers/superadminSession');
const { safe } = require('../../helpers/cleanup/utils');

const citestMarker = global.citestMarker || 'citest-should-delete';
const orgMarker = global.orgMarker.package;
const LIBRARY_TYPE_ID = 'people';
const ROLES_IDS = [
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
].filter((roleId) => roleId);

let gqlClient;
let isolatedSuperadminSession;
let superAdminOption;
let superAdminToken;
let org1Result;
let org2Result;
let org2Option;

const testData = {
  userId: '',
  libraryId: '',
  entityId: '',
  packageId: ''
};

describe('citest_package: distribute a Library via a Package to another org', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    isolatedSuperadminSession = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = isolatedSuperadminSession.options;
    superAdminOption = isolatedSuperadminSession.options;
    superAdminToken = isolatedSuperadminSession.token;

    const makeOrgInput = () => ({
      ...createOrgOptionDefault,
      name: `${orgMarker}-lib-pkg-org-${uuid.v4()}`
    });

    // org1 owns the library + package (the distributor)
    org1Result = await orgHelpers.orgSetup(null, { gqlClient }, makeOrgInput());
    expect(org1Result).toBeDefined();
    expect(org1Result.id).toBeDefined();

    // org2 is the receiving org
    org2Result = await orgHelpers.orgSetup(null, { gqlClient }, makeOrgInput());
    expect(org2Result).toBeDefined();
    expect(org2Result.id).toBeDefined();

    // A plain user in org2, impersonated to read the library as the receiving org.
    const userResult = await userHelpers.createUser(
      { gqlClient },
      {
        name: `${citestMarker}-lib-pkg-reader-${uuid.v4()}`,
        password: 'TestPassword123',
        orgId: org2Result.id,
        rolesIds: ROLES_IDS
      }
    );
    expect(userResult).toBeDefined();
    expect(userResult.id).toBeDefined();
    testData.userId = userResult.id;

    org2Option = await impersonate(
      userResult.id,
      org2Result.guid,
      superAdminToken
    );
  });

  afterAll(async () => {
    if (testData.packageId) {
      await safe('delete package', async () =>
        gqlClient.query(
          deletePackageQuery,
          { id: testData.packageId },
          superAdminOption
        )
      );
    }

    if (testData.libraryId) {
      await safe('delete library', async () =>
        gqlClient.query(
          `mutation { deleteLibrary(id: "${testData.libraryId}") { id message } }`,
          {},
          superAdminOption
        )
      );
    }

    if (testData.userId) {
      await safe('delete reader user', async () =>
        gqlClient.query(
          `mutation { deleteUser(id: "${testData.userId}") { id } }`,
          {},
          superAdminOption
        )
      );
    }

    if (org1Result && org1Result.id) {
      await safe('delete org1', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: superAdminOption },
          org1Result.id
        )
      );
    }
    if (org2Result && org2Result.id) {
      await safe('delete org2', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: superAdminOption },
          org2Result.id
        )
      );
    }

    await isolatedSuperadminSession?.cleanup();
  });

  it('org1: creates a library with an entity (nested content to share)', async () => {
    const createLibrary = `
      mutation {
        createLibrary(input: {
          name: "${citestMarker}-shared-library-${uuid.v4()}"
          libraryTypeId: "${LIBRARY_TYPE_ID}"
          organizationId: "${org1Result.id}"
          description: "library distributed via a package"
        }) {
          id
          organizationId
        }
      }
    `;
    const res = await gqlClient.query(createLibrary, {}, superAdminOption);
    expect(res.createLibrary).toBeDefined();
    expect(res.createLibrary.id).toBeDefined();
    testData.libraryId = res.createLibrary.id;

    const createEntity = `
      mutation {
        createEntity(input: {
          name: "${citestMarker}-entity-${uuid.v4()}"
          libraryId: "${testData.libraryId}"
        }) {
          id
          name
        }
      }
    `;
    const entityRes = await gqlClient.query(createEntity, {}, superAdminOption);
    expect(entityRes.createEntity).toBeDefined();
    expect(entityRes.createEntity.id).toBeDefined();
    testData.entityId = entityRes.createEntity.id;
  });

  it('org2 cannot see the library before it is shared', async () => {
    const libraries = await getLibrariesAsOrg2();
    const ids = libraries.map((l) => l.id);
    expect(ids).not.toContain(testData.libraryId);
  });

  it('org1: creates a package containing the library and grants it to org2', async () => {
    const createPackage = `
      mutation {
        packageCreate(input: {
          name: "${citestMarker}-library-package-${uuid.v4()}"
          version: "1.0"
          distributionType: public
          organizationId: "${org1Result.id}"
          primaryResourceId: "${testData.libraryId}"
          resources: [
            { resourceId: "${testData.libraryId}", resourceType: library, action: ADD }
          ]
        }) {
          id
          resources { records { resourceId resourceType } }
        }
      }
    `;
    const res = await gqlClient.query(createPackage, {}, superAdminOption);
    expect(res.packageCreate).toBeDefined();
    expect(res.packageCreate.id).toBeDefined();
    testData.packageId = res.packageCreate.id;

    // The library is accepted as a package resource (AC: a Library can be added).
    const resourceTypes = _.get(
      res,
      'packageCreate.resources.records',
      []
    ).map((r) => r.resourceType);
    expect(resourceTypes).toContain('library');

    const grant = `
      mutation {
        packageUpdateGrants(input: {
          packageId: "${testData.packageId}"
          packageGrants: { organizationId: ${org2Result.id}, grantType: GRANT }
        }) {
          id
        }
      }
    `;
    const grantRes = await gqlClient.query(grant, {}, superAdminOption);
    expect(grantRes.packageUpdateGrants).toBeDefined();
    expect(grantRes.packageUpdateGrants.id).toBeDefined();
  });

  it('org2 can read the shared library and its nested entity after the grant', async () => {
    const libraries = await getLibrariesAsOrg2();
    const shared = libraries.find((l) => l.id === testData.libraryId);

    // AC: the receiving org has access to the Library after distribution.
    expect(shared).toBeDefined();
    // AC: nested contents travel with the grant (no separate per-entity share).
    const entityIds = _.get(shared, 'entities.records', []).map((e) => e.id);
    expect(entityIds).toContain(testData.entityId);
  });

  it('org2 loses access after the grant is revoked (DENY)', async () => {
    const revoke = `
      mutation {
        packageUpdateGrants(input: {
          packageId: "${testData.packageId}"
          packageGrants: { organizationId: ${org2Result.id}, grantType: DENY }
        }) {
          id
        }
      }
    `;
    const revokeRes = await gqlClient.query(revoke, {}, superAdminOption);
    expect(revokeRes.packageUpdateGrants).toBeDefined();

    const libraries = await getLibrariesAsOrg2();
    const ids = libraries.map((l) => l.id);
    expect(ids).not.toContain(testData.libraryId);
  });

  it('re-granting the same package is idempotent (no duplicate-collaborator error)', async () => {
    const grant = `
      mutation {
        packageUpdateGrants(input: {
          packageId: "${testData.packageId}"
          packageGrants: { organizationId: ${org2Result.id}, grantType: GRANT }
        }) {
          id
        }
      }
    `;
    // First grant restores access; a second identical grant must not throw on the
    // library_collaborator unique index.
    const first = await gqlClient.query(grant, {}, superAdminOption);
    expect(first.packageUpdateGrants).toBeDefined();
    const second = await gqlClient.query(grant, {}, superAdminOption);
    expect(second.packageUpdateGrants).toBeDefined();
  });
});

async function getLibrariesAsOrg2() {
  const query = `
    query {
      libraries(includeOwnedOnly: false, limit: 100) {
        records {
          id
          name
          organizationId
          entities { records { id } }
        }
      }
    }
  `;
  const res = await gqlClient.query(query, {}, org2Option);
  return _.get(res, 'libraries.records', []);
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}
