const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const GraphqlClient = require('../../helpers/gql');
const { safe } = require('../../helpers/cleanup/utils');
const {
  createPackageQuery,
  deletePackageQuery,
  getPackageByIdQuery,
  grantPackageQuery,
  meGql,
  queryGrant,
  updatePackageQuery,
  updatePackageResourcesQuery
} = require('../packageCommonQuery');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const moment = require('moment');
let gqlClient;

const citestMarker = global.citestMarker || 'citest-should-delete';
const isEnablePackageGrantLogic = global.enablePackageGrantLogic;
const env = config.env;

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

let superOrgId;
let deletedOrgId, activeOrgId;
let regId, schemaId, deletedSchemaId;
let packageId, packageName;
let resourcesPackage1, resourcesPackage2;

const createdPackageIds = new Set();
const createdSchemaIds = new Set();
const createdOrgIds = new Set();

const schemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    name: {
      type: 'string',
      title: 'Name'
    },
    phone: {
      type: 'string',
      title: 'Phone'
    }
  }
};

console.log(
  '>> Run CI Test with enablePackageGrantLogic = ',
  isEnablePackageGrantLogic
);

describe('citest_package: public package basic test', () => {
  let superToken;
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;

    result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    superOrgId = _.get(result, 'me.organization.id');

    const createOrgQuery = `
        mutation createOrg {
          createOrganization (input: {
            name: "${global.orgMarker.package}-${uuid.v4()}"
            businessUnit: "Legal"
            types: [agency, broadcaster]
            status: deleted
            metadata: { features: {} }
            applications: []
          }) {
            id
            guid
            name
            type
            status
            jsondata
          }
        }`;

    const orgRes = await gqlClient.query(createOrgQuery);
    const org = _.get(orgRes, 'createOrganization');
    expect(org).toBeDefined();
    expect(org.status).toEqual('deleted');
    deletedOrgId = org.id;

    // create resources for org 7682
    const registry = await gqlClient.query(
      `
          mutation createDataRegistry {
            createDataRegistry(input: {
              name: "${citestMarker}-reg-${uuid.v4()}",
              description: "", 
              source: ""
            }) {
              id
              name
              organizationId
            }
          }`
    );

    regId = _.get(registry, 'createDataRegistry.id');
    expect(registry.createDataRegistry.organizationId).toEqual(superOrgId);

    const schema = await gqlClient.query(
      `
          mutation upsertSchemaDraft ($schema: JSONData!) {
            upsertSchemaDraft(
            input: {
              schema: $schema
              dataRegistryId: "${regId}"
            }) {
              id
            }
          }`,
      {
        schema: schemaInput
      }
    );

    schemaId = _.get(schema, 'upsertSchemaDraft.id');
    createdSchemaIds.add(schemaId);
  });

  // local docker enablePackageGrantLogic = true
  describeif(
    isEnablePackageGrantLogic,
    'basic test public package with enablePackageGrantLogic = true',
    () => {
      describe('create package', () => {
        // resource is not required
        it('create package without resource should success', async () => {
          const packageRes = await gqlClient.query(createPackageQuery, {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [],
            organizationId: superOrgId
          });

          expect(packageRes.packageCreate).toBeDefined();
          resourcesPackage1 = packageRes.packageCreate.id;
          createdPackageIds.add(resourcesPackage1);

          expect(
            _.get(packageRes, 'packageCreate.resources.records', []).length
          ).toEqual(0);
        });

        it('create package using not active resource', async () => {
          const packageRes = await gqlClient.query(createPackageQuery, {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ],
            organizationId: superOrgId
          });

          const packageData = packageRes.packageCreate;
          resourcesPackage2 = packageData.id;
          createdPackageIds.add(resourcesPackage2);
          expect(packageData).toBeDefined();
          expect(_.get(packageData, 'name')).toContain(
            `${citestMarker}-public-package`
          );
          expect(_.get(packageData, 'distributionType')).toEqual('public');
          expect(
            _.get(packageData, 'resources.records').map(
              (record) => record.resourceId
            )
          ).toContain(schemaId);
        });

        xit('create package using private resource of other org should fail', async () => {
          const queryGetPrivateRes = `
            query getPrivate{
              packages(distributionType: private, status: published, limit: 1, packageFilter: {
                organizationId: 1
              }) {
                  records {
                    id
                    status
                    distributionType
                    organization {
                      id
                    }
                    name
                  }
              }
            }
          `;

          const privateRes = await gqlClient.query(queryGetPrivateRes);
          const privatePackage = _.get(privateRes, 'packages.records[0]', {});

          expect(privatePackage.id).toBeDefined();
          const privatePackageId = privatePackage.id;
          expect(privatePackage.status).toEqual('published');
          expect(privatePackage.distributionType).toEqual('private');
          expect(privatePackage.organization.id).toEqual('1');

          await expect(
            gqlClient.query(createPackageQuery, {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: 'public',
              resources: [
                {
                  resourceType: 'package',
                  resourceId: privatePackageId,
                  action: 'ADD'
                }
              ]
            })
          ).rejects.toThrow();
        });

        xit('create package using deleted org should fail', async () => {
          await expect(
            gqlClient.query(createPackageQuery, {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: 'public',
              organizationId: deletedOrgId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            })
          ).rejects.toThrow();
        });

        it('create package should success', async () => {
          const packageRes = await gqlClient.query(createPackageQuery, {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            organizationId: superOrgId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const packageData = _.get(packageRes, 'packageCreate');
          expect(packageData).toBeDefined();
          packageId = packageData.id;
          createdPackageIds.add(packageId);
          expect(packageData.organization.id).toEqual(superOrgId);
          expect(packageData.resources.records.length).toEqual(1);
        });

        it('get package by id should success', async () => {
          const packageRes = await gqlClient.query(getPackageByIdQuery, {
            id: packageId
          });
          const packageData = _.get(packageRes, 'packages.records[0]');
          expect(packageData).toBeDefined();
          expect(packageData.id).toEqual(packageId);
          packageName = packageData.name;
        });

        xit('create package with duplicate name should fail', async () => {
          const packageRes = gqlClient.query(createPackageQuery, {
            name: packageName,
            distributionType: 'public',
            organizationId: superOrgId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          await expect(packageRes).rejects.toThrow();
        });
      });

      describe('update package', () => {
        it('update package basic info should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.description).toEqual('test description');
          expect(updatedPackage.name).toContain(citestMarker + '-updateName-');
        });

        // add, remove resources to pending package
        it('add not active resources to package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(1);
        });

        it('add not active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'package',
                resourceId: resourcesPackage2,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === resourcesPackage2)
              .length
          ).toEqual(1);
        });

        it('remove resources from package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'REMOVE'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(0);
        });

        it('remove resources from package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'REMOVE'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to package using updatePackage should success', async () => {
          const updateStatusRes = await gqlClient.query(`
            mutation updateSche {
              updateSchemaState (input : {
                id: "${schemaId}"
                status: published
              }) {
                id
                status
              }
            }`);

          const schemaData = _.get(updateStatusRes, 'updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData.status).toEqual('published');

          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        // action with pending package
        it('change resources status to not active', async () => {
          const updateStatusRes = await gqlClient.query(`
            mutation updateSche {
              updateSchemaState (input : {
                id: "${schemaId}"
                status: inactive
              }) {
                id
                status
              }
            }`);

          const schemaData = _.get(updateStatusRes, 'updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData.status).toEqual('inactive');
        });

        xit('approve package has no active resources should fail', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'approved'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          console.log(564, updatedPackage);
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('approved');
        }); // skip til fixed

        xit('grant pending package to current org should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        // change package status and grant package
        it('update all resources status to active', async () => {
          // publish schema resources
          const updateStatusSchemaRes = await gqlClient.query(`
            mutation updateSche {
              updateSchemaState (input : {
                id: "${schemaId}"
                status: published
              }) {
                id
                status
              }
            }`);

          const schemaData = _.get(updateStatusSchemaRes, 'updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData.status).toEqual('published');

          // remove pending package from resources
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'REMOVE'
                },
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage2,
                  action: 'REMOVE'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(resources.length).toEqual(1);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('approve package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'approved'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('approved');
        });

        xit('grant approved package to current org should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // console.log(663, grantData);
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('publish package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'published'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('published');
        });

        it('deactive package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'deactivated'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('deactivated');
        });

        xit('grant deactive package should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // console.log(663, grantData);
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('re publish package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'published'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('published');
        });

        it('grant published package VIEW grant type to current org should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == superOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('VIEW');
        });

        it('grant published package VIEW grant type to active org should success', async () => {
          // create active org
          const orgRes = await orgHelpers.createTestOrganization(
            { gqlClient },
            {
              name: `${citestMarker}-org-testing-${uuid.v4()}`,
              businessUnit: 'Legal',
              types: ['agency', 'broadcaster'],
              kvp: { test: 'value' },
              apps: [],
              remainingBudget: 0,
              isLimitEnforced: true
            }
          );

          expect(orgRes).toBeDefined();
          activeOrgId = orgRes.id;
          createdOrgIds.add(activeOrgId);

          // grant package to new org
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('VIEW');
        });

        xit('grant published package to deactive org should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: deletedOrgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();
        });

        it('get package grant should success', async () => {
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();
          // granted to activeOrgId and superOrgId
          expect(getGrant.length).toEqual(2);
          expect(
            getGrant.find((rec) => rec.organization.id == activeOrgId)
          ).toBeDefined();
          expect(
            getGrant.find((rec) => rec.organization.id == superOrgId)
          ).toBeDefined();
        });

        it('change package grant type to GRANT should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant.length).toEqual(2);
          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('GRANT');
        });

        it('change package grant type to DENY should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'DENY',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant.length).toEqual(2);
          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('DENY');
        });

        it('change package grant action to REMOVE should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'DENY',
                action: 'REMOVE'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);
        });

        it('get package grant should success', async () => {
          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to superOrgId
          expect(getGrant.length).toEqual(1);
          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toEqual(undefined);
        });

        // update resources in published package
        it('update resource action to REMOVE should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'REMOVE'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage.id; // get lastest lineage
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to pulished package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage.id; // get lastest lineage
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to pulished package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();
          packageId = updatedPackage.id; // get lastest lineage

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        xit('add disabled resources to pulished published package using updatePackage should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: resourcesPackage1,
              status: 'deactivated'
            }
          });

          const updatedResource = _.get(updateResourceRes, 'packageUpdate');
          expect(updatedResource).toBeDefined();
          expect(updatedResource.status).toEqual('deactivated');

          // add disabled resources to package
          const updatePackageRes = gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'ADD'
                }
              ]
            }
          });

          await expect(updatePackageRes).rejects.toThrow();

          // const updatedPackage = _.get(updatePackageRes, 'packageUpdate');
          // expect(updatedPackage).toBeDefined();

          // packageId = updatedPackage.id; // get lastest lineage
          // const resources = _.get(updatedPackage, 'resources.records', []);
          // expect(
          //   resources.filter((rec) => rec.resourceId === resourcesPackage1)
          //     .length
          // ).toEqual(1);
        });

        xit('add disabled resources to pulished package using packageUpdateResources should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: resourcesPackage2,
              status: 'deactivated'
            }
          });

          const updatedResource = _.get(updateResourceRes, 'packageUpdate');
          expect(updatedResource).toBeDefined();
          expect(updatedResource.status).toEqual('deactivated');

          // add disabled resources to package
          const updatePackageRes = gqlClient.query(
            updatePackageResourcesQuery,
            {
              packageId: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage2,
                  action: 'ADD'
                }
              ]
            }
          );

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('create deleted resources', async () => {
          const schemaRes = await gqlClient.query(
            `mutation upsertSchemaDraft ($schema: JSONData!) {
              upsertSchemaDraft(
              input: {
                schema: $schema
                dataRegistryId: "${regId}"
              }) {
                id
              }
            }`,
            {
              schema: schemaInput
            }
          );

          deletedSchemaId = _.get(schemaRes, 'upsertSchemaDraft.id');
          expect(deletedSchemaId).toBeDefined();
          createdSchemaIds.add(deletedSchemaId);
          const deleteScheRes = await gqlClient.query(`mutation updateSche {
              updateSchemaState (input : {
                id: "${deletedSchemaId}"
                status: deleted
              }) {
                id
                status
              }
            }`);

          const deleteSche = _.get(deleteScheRes, 'updateSchemaState');
          expect(deleteSche.status).toEqual('deleted');
          createdSchemaIds.delete(deletedSchemaId);
        });

        it('add deleted resources to pulished package using updatePackage should fail', async () => {
          const updatePackageRes = gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: deletedSchemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('add deleted resources to pulished package using packageUpdateResources should fail', async () => {
          const updatePackageRes = gqlClient.query(
            updatePackageResourcesQuery,
            {
              packageId: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: deletedSchemaId,
                  action: 'ADD'
                }
              ]
            }
          );

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('delete package should success', async () => {
          const deleteRes = await gqlClient.query(deletePackageQuery, {
            id: resourcesPackage1
          });

          expect(_.get(deleteRes, 'packageDelete.success')).toEqual(true);
          createdPackageIds.delete(resourcesPackage1);
        });

        it('query delete package should empty', async () => {
          const getPackageRes = await gqlClient.query(getPackageByIdQuery, {
            id: resourcesPackage1
          });

          const packageData = _.get(getPackageRes, 'packages.records');
          expect(packageData.length).toEqual(0);
          resourcesPackage1 = undefined;
        });
      });

      afterAll(async () => {
        if (packageId) {
          // remove package from org
          await safe('delete package', async () =>
            gqlClient.query(grantPackageQuery, {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: 'DENY',
                  action: 'REMOVE'
                }
              ]
            })
          );
        }

        // delete package
        if (createdPackageIds.size) {
          for (const packageId of createdPackageIds) {
            await safe('delete resourcesPackage2', async () =>
              gqlClient.query(deletePackageQuery, {
                id: packageId
              })
            );
          }

          createdPackageIds.clear();
        }

        // delete schema
        if (createdSchemaIds.size) {
          for (const schemaId of createdSchemaIds) {
            await safe(`delete schema ${schemaId}`, async () =>
              gqlClient.query(`
                mutation updateSche {
                  updateSchemaState (input : {
                    id: "${schemaId}"
                    status: deleted
                  }) {
                    id
                    status
                  }
                }`)
            );
          }

          createdSchemaIds.clear();
        }

        if (createdOrgIds.size) {
          for (const orgId of createdOrgIds) {
            await safe(`delete org ${orgId}`, async () =>
              orgHelpers.deleteOrganization({ gqlClient }, orgId)
            );
          }
          createdOrgIds.clear();
        }
      });
    }
  );

  // Stage enablePackageGrantLogic = false
  describeif(
    !isEnablePackageGrantLogic,
    'basic test public package with enablePackageGrantLogic = false',
    () => {
      describe('create package', () => {
        // resource is not required
        it('create package without resource should success', async () => {
          const packageRes = await gqlClient.query(createPackageQuery, {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [],
            organizationId: superOrgId
          });

          expect(packageRes.packageCreate).toBeDefined();
          resourcesPackage1 = packageRes.packageCreate.id;
          createdPackageIds.add(resourcesPackage1);
          expect(
            _.get(packageRes, 'packageCreate.resources.records', []).length
          ).toEqual(0);
        });

        it('create package using not active resource', async () => {
          const packageRes = await gqlClient.query(createPackageQuery, {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ],
            organizationId: superOrgId
          });

          const packageData = packageRes.packageCreate;
          resourcesPackage2 = packageData.id;
          createdPackageIds.add(resourcesPackage2);
          expect(packageData).toBeDefined();
          expect(_.get(packageData, 'name')).toContain(
            `${citestMarker}-public-package`
          );
          expect(_.get(packageData, 'distributionType')).toEqual('public');
          expect(
            _.get(packageData, 'resources.records').map(
              (record) => record.resourceId
            )
          ).toContain(schemaId);
        });

        xit('create package using private resource of other org should fail', async () => {
          const queryGetPrivateRes = `
            query getPrivate{
              packages(distributionType: private, status: published, limit: 1, packageFilter: {
                organizationId: 1
              }) {
                  records {
                    id
                    status
                    distributionType
                    organization {
                      id
                    }
                    name
                  }
              }
            }
          `;

          const privateRes = await gqlClient.query(queryGetPrivateRes);
          const privatePackage = _.get(privateRes, 'packages.records[0]', {});

          expect(privatePackage.id).toBeDefined();
          const privatePackageId = privatePackage.id;
          expect(privatePackage.status).toEqual('published');
          expect(privatePackage.distributionType).toEqual('private');
          expect(privatePackage.organization.id).toEqual('1');

          await expect(
            gqlClient.query(createPackageQuery, {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: 'public',
              resources: [
                {
                  resourceType: 'package',
                  resourceId: privatePackageId,
                  action: 'ADD'
                }
              ]
            })
          ).rejects.toThrow();
        });

        xit('create package using deleted org should fail', async () => {
          await expect(
            gqlClient.query(createPackageQuery, {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: 'public',
              organizationId: deletedOrgId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            })
          ).rejects.toThrow();
        });

        it('create package should success', async () => {
          const packageRes = await gqlClient.query(createPackageQuery, {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            organizationId: superOrgId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const packageData = _.get(packageRes, 'packageCreate');
          expect(packageData).toBeDefined();
          packageId = packageData.id;
          createdPackageIds.add(packageId);
          expect(packageData.organization.id).toEqual(superOrgId);
          expect(packageData.resources.records.length).toEqual(1);
        });

        it('get package by id should success', async () => {
          const packageRes = await gqlClient.query(getPackageByIdQuery, {
            id: packageId
          });
          const packageData = _.get(packageRes, 'packages.records[0]');
          expect(packageData).toBeDefined();
          expect(packageData.id).toEqual(packageId);
          packageName = packageData.name;
        });

        xit('create package with duplicate name should fail', async () => {
          const packageRes = gqlClient.query(createPackageQuery, {
            name: packageName,
            distributionType: 'public',
            organizationId: superOrgId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          await expect(packageRes).rejects.toThrow();
        });
      });

      describe('update package', () => {
        it('update package basic info should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.description).toEqual('test description');
          expect(updatedPackage.name).toContain(citestMarker + '-updateName-');
        });

        // add, remove resources to pending package
        it('add not active resources to package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(1);
        });

        it('add not active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'package',
                resourceId: resourcesPackage2,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === resourcesPackage2)
              .length
          ).toEqual(1);
        });

        it('remove resources from package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'REMOVE'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(0);
        });

        it('remove resources from package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'REMOVE'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to package using updatePackage should success', async () => {
          const updateStatusRes = await gqlClient.query(`
            mutation updateSche {
              updateSchemaState (input : {
                id: "${schemaId}"
                status: published
              }) {
                id
                status
              }
            }`);

          const schemaData = _.get(updateStatusRes, 'updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData.status).toEqual('published');

          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        // action with pending package
        it('change resources status to not active', async () => {
          const updateStatusRes = await gqlClient.query(`
            mutation updateSche {
              updateSchemaState (input : {
                id: "${schemaId}"
                status: inactive
              }) {
                id
                status
              }
            }`);

          const schemaData = _.get(updateStatusRes, 'updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData.status).toEqual('inactive');
        });

        xit('approve package has no active resources should fail', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'approved'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          console.log(564, updatedPackage);
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('approved');
        }); // skip til fixed

        xit('grant pending package to current org should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        // change package status and grant package
        it('update all resources status to active', async () => {
          // publish schema resources
          const updateStatusSchemaRes = await gqlClient.query(`
            mutation updateSche {
              updateSchemaState (input : {
                id: "${schemaId}"
                status: published
              }) {
                id
                status
              }
            }`);

          const schemaData = _.get(updateStatusSchemaRes, 'updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData.status).toEqual('published');

          // remove pending package from resources
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'REMOVE'
                },
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage2,
                  action: 'REMOVE'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(resources.length).toEqual(1);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('approve package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'approved'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('approved');
        });

        xit('grant approved package to current org should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // console.log(663, grantData);
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('publish package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'published'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('published');
        });

        it('deactive package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'deactivated'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('deactivated');
        });

        xit('grant deactive package should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // console.log(663, grantData);
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('re publish package should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              status: 'published'
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage.status).toEqual('published');
        });

        it('grant published package VIEW grant type to current org should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: superOrgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == superOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('VIEW');
        });

        it('grant published package VIEW grant type to active org should success', async () => {
          // create active org
          const orgRes = await orgHelpers.createTestOrganization(
            { gqlClient },
            {
              name: `${citestMarker}-org-testing-${uuid.v4()}`,
              businessUnit: 'Legal',
              types: ['agency', 'broadcaster'],
              kvp: { test: 'value' },
              apps: [],
              remainingBudget: 0,
              isLimitEnforced: true
            }
          );

          expect(orgRes).toBeDefined();
          activeOrgId = orgRes.id;
          createdOrgIds.add(activeOrgId);

          // grant package to new org
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('VIEW');
        });

        xit('grant published package to deactive org should fail', async () => {
          const grantRes = gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: deletedOrgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          });

          await expect(grantRes).rejects.toThrow();
        });

        it('get package grant should success', async () => {
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();
          // granted to activeOrgId and superOrgId
          expect(getGrant.length).toEqual(2);
          expect(
            getGrant.find((rec) => rec.organization.id == activeOrgId)
          ).toBeDefined();
          expect(
            getGrant.find((rec) => rec.organization.id == superOrgId)
          ).toBeDefined();
        });

        it('change package grant type to GRANT should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant.length).toEqual(2);
          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('GRANT');
        });

        it('change package grant type to DENY should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'DENY',
                action: 'ADD'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);

          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant.length).toEqual(2);
          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant.grantType).toEqual('DENY');
        });

        it('change package grant action to REMOVE should success', async () => {
          const grantRes = await gqlClient.query(grantPackageQuery, {
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: 'DENY',
                action: 'REMOVE'
              }
            ]
          });

          const grantData = _.get(grantRes, 'packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData.id).toEqual(packageId);
        });

        it('get package grant should success', async () => {
          // check grant
          const getGrantRes = await gqlClient.query(queryGrant, {
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to superOrgId
          expect(getGrant.length).toEqual(1);
          const currentGrant = getGrant.find(
            (rec) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toEqual(undefined);
        });

        // update resources in published package
        it('update resource action to REMOVE should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'REMOVE'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage.id; // get lastest lineage
          createdPackageIds.add(packageId);
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to pulished package using updatePackage should success', async () => {
          const updateRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: schemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage.id; // get lastest lineage
          createdPackageIds.add(packageId);
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to pulished package using packageUpdateResources should success', async () => {
          const updateRes = await gqlClient.query(updatePackageResourcesQuery, {
            packageId: packageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: schemaId,
                action: 'ADD'
              }
            ]
          });

          const updatedPackage = _.get(updateRes, 'packageUpdateResources');
          expect(updatedPackage).toBeDefined();
          packageId = updatedPackage.id; // get lastest lineage
          createdPackageIds.add(packageId);

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        xit('add disabled resources to pulished published package using updatePackage should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: resourcesPackage1,
              status: 'deactivated'
            }
          });

          const updatedResource = _.get(updateResourceRes, 'packageUpdate');
          expect(updatedResource).toBeDefined();
          expect(updatedResource.status).toEqual('deactivated');

          // add disabled resources to package
          const updatePackageRes = gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage1,
                  action: 'ADD'
                }
              ]
            }
          });

          await expect(updatePackageRes).rejects.toThrow();

          // const updatedPackage = _.get(updatePackageRes, 'packageUpdate');
          // expect(updatedPackage).toBeDefined();

          // packageId = updatedPackage.id; // get lastest lineage
          // const resources = _.get(updatedPackage, 'resources.records', []);
          // expect(
          //   resources.filter((rec) => rec.resourceId === resourcesPackage1)
          //     .length
          // ).toEqual(1);
        });

        xit('add disabled resources to pulished package using packageUpdateResources should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await gqlClient.query(updatePackageQuery, {
            input: {
              id: resourcesPackage2,
              status: 'deactivated'
            }
          });

          const updatedResource = _.get(updateResourceRes, 'packageUpdate');
          expect(updatedResource).toBeDefined();
          expect(updatedResource.status).toEqual('deactivated');

          // add disabled resources to package
          const updatePackageRes = gqlClient.query(
            updatePackageResourcesQuery,
            {
              packageId: packageId,
              resources: [
                {
                  resourceType: 'package',
                  resourceId: resourcesPackage2,
                  action: 'ADD'
                }
              ]
            }
          );

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('create deleted resources', async () => {
          const schemaRes = await gqlClient.query(
            `mutation upsertSchemaDraft ($schema: JSONData!) {
              upsertSchemaDraft(
              input: {
                schema: $schema
                dataRegistryId: "${regId}"
              }) {
                id
              }
            }`,
            {
              schema: schemaInput
            }
          );

          deletedSchemaId = _.get(schemaRes, 'upsertSchemaDraft.id');
          expect(deletedSchemaId).toBeDefined();
          createdSchemaIds.add(deletedSchemaId);
          const deleteScheRes = await gqlClient.query(`mutation updateSche {
              updateSchemaState (input : {
                id: "${deletedSchemaId}"
                status: deleted
              }) {
                id
                status
              }
            }`);

          const deleteSche = _.get(deleteScheRes, 'updateSchemaState');
          expect(deleteSche.status).toEqual('deleted');
          createdSchemaIds.delete(deletedSchemaId);
        });

        it('add deleted resources to pulished package using updatePackage should fail', async () => {
          const updatePackageRes = gqlClient.query(updatePackageQuery, {
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: deletedSchemaId,
                  action: 'ADD'
                }
              ]
            }
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('add deleted resources to pulished package using packageUpdateResources should fail', async () => {
          const updatePackageRes = gqlClient.query(
            updatePackageResourcesQuery,
            {
              packageId: packageId,
              resources: [
                {
                  resourceType: 'schema',
                  resourceId: deletedSchemaId,
                  action: 'ADD'
                }
              ]
            }
          );

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('delete package should success', async () => {
          const deleteRes = await gqlClient.query(deletePackageQuery, {
            id: resourcesPackage1
          });

          expect(_.get(deleteRes, 'packageDelete.success')).toEqual(true);
          createdPackageIds.delete(resourcesPackage1);
        });

        it('query delete package should empty', async () => {
          const getPackageRes = await gqlClient.query(getPackageByIdQuery, {
            id: resourcesPackage1
          });

          const packageData = _.get(getPackageRes, 'packages.records');
          expect(packageData.length).toEqual(0);
          resourcesPackage1 = undefined;
        });
      });

      afterAll(async () => {
        if (packageId) {
          // remove package from org
          await safe('delete package', async () =>
            gqlClient.query(grantPackageQuery, {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: 'DENY',
                  action: 'REMOVE'
                }
              ]
            })
          );
        }

        // delete package
        if (createdPackageIds.size) {
          for (const packageId of createdPackageIds) {
            await safe('delete resourcesPackage2', async () =>
              gqlClient.query(deletePackageQuery, {
                id: packageId
              })
            );
          }

          createdPackageIds.clear();
        }

        // delete schema
        if (createdSchemaIds.size) {
          for (const schemaId of createdSchemaIds) {
            await safe(`delete schema ${schemaId}`, async () =>
              gqlClient.query(`
                mutation updateSche {
                  updateSchemaState (input : {
                    id: "${schemaId}"
                    status: deleted
                  }) {
                    id
                    status
                  }
                }`)
            );
          }

          createdSchemaIds.clear();
        }

        if (createdOrgIds.size) {
          for (const orgId of createdOrgIds) {
            await safe(`delete org ${orgId}`, async () =>
              orgHelpers.deleteOrganization(gqlClient, orgId)
            );
          }

          createdOrgIds.clear();
        }
      });
    }
  );
});
