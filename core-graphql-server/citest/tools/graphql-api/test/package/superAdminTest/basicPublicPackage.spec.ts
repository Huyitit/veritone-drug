import { helpers } from '../../../src/helpers/index';
import * as _ from 'lodash';
import * as uuid from 'uuid';

import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import {
  EngineDistributionType,
  OrganizationStatus,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageResourceAction,
  PackageResourceType,
  PackageStatus,
  SchemaStatus
} from '../../../src/gql';

const config = helpers.config;
let sdkClient: GraphqlClient;

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isEnablePackageGrantLogic = (global as any).enablePackageGrantLogic;
const env = config.env;

const describeif = (condition: any, ...args: any[]) =>
  condition ? describe(...args) : describe.skip(...args);

let superOrgId: string;
let deletedOrgId: string, activeOrgId: string;
let regId: string, schemaId: string, deletedSchemaId: string;
let packageId: string, packageName: string;
let resourcesPackage1: any, resourcesPackage2: any;

const createdPackageIds = new Set<string>();
const createdSchemaIds = new Set<string>();
const createdOrgIds = new Set<string>();

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

let superToken, superOptions;
const safe = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err: any) {
    console.warn(`afterAll cleanup (${label}) failed: ${err?.message ?? err}`);
  }
};

describe('citest_package: public package basic test', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    expect(sdkClient.sessionToken).toBeDefined();
    superToken = sdkClient.sessionToken as string;
    superOptions = helpers.requestOptions(superToken);

    const result = await sdkClient.sdk.me();
    expect(result.data.me).toBeDefined();
    superOrgId = _.get(result, 'data.me.organization.id', '');

    const orgRes = await sdkClient.sdk.createOrganization({
      input: {
        name: `${(global as any).orgMarker.package}-${uuid.v4()}`,
        businessUnit: 'Legal',
        types: [OrganizationType.Agency, OrganizationType.Broadcaster],
        status: OrganizationStatus.Deleted,
        metadata: { features: {} },
        applications: []
      }
    });

    const org = _.get(orgRes, 'data.createOrganization');

    expect(org).toBeDefined();
    expect(org?.status).toEqual('deleted');
    deletedOrgId = org?.id || '';

    // create resources for org 7682
    const registry = await sdkClient.sdk.createDataRegistry({
      input: {
        name: `${citestMarker}-reg-${uuid.v4()}`,
        description: '',
        source: ''
      }
    });

    const registryData = _.get(registry, 'data.createDataRegistry');
    regId = _.get(registryData, 'id', '');
    expect(_.get(registryData, 'organizationId')).toEqual(superOrgId);

    const schema = await sdkClient.sdk.upsertSchemaDraft({
      input: {
        schema: schemaInput,
        dataRegistryId: regId
      }
    });

    schemaId = _.get(schema, 'data.upsertSchemaDraft.id', '');
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
          const packageRes = await sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [],
              organizationId: superOrgId,
              version: '1.0.0'
            }
          });

          const packageData = _.get(packageRes, 'data.packageCreate');
          expect(packageData).toBeDefined();
          resourcesPackage1 = packageData?.id;
          createdPackageIds.add(resourcesPackage1);

          expect(_.get(packageData, 'resources.records', []).length).toEqual(0);
        });

        it('create package using not active resource', async () => {
          const packageRes = await sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              organizationId: superOrgId,
              version: '1.0.0'
            }
          });

          const packageData = _.get(packageRes, 'data.packageCreate');
          resourcesPackage2 = packageData?.id;
          createdPackageIds.add(resourcesPackage2);

          expect(packageData).toBeDefined();
          expect(_.get(packageData, 'name')).toContain(
            `${citestMarker}-public-package`
          );
          expect(_.get(packageData, 'distributionType')).toEqual('public');
          expect(
            _.get(packageData, 'resources.records')?.map(
              (record: any) => record.resourceId
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

          const privateRes = await sdkClient.query(queryGetPrivateRes);

          const privatePackage = _.get(privateRes, 'packages.records[0]', {});
          expect(privatePackage.id).toBeDefined();
          const privatePackageId = privatePackage.id;
          expect(privatePackage.status).toEqual('published');
          expect(privatePackage.distributionType).toEqual('private');
          expect(privatePackage.organization.id).toEqual('1');

          const createPackageReq = sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: privatePackageId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          await expect(createPackageReq).rejects.toThrow();
        });

        xit('create package using deleted org should fail', async () => {
          const reqCreatePackage = sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              organizationId: deletedOrgId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });
          await expect(reqCreatePackage).rejects.toThrow();
        });

        it('create package should success', async () => {
          const packageRes = await sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              organizationId: superOrgId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          const packageData = _.get(packageRes, 'data.packageCreate');
          expect(packageData).toBeDefined();
          packageId = packageData?.id || '';
          createdPackageIds.add(packageId);

          expect(packageData?.organization?.id).toEqual(superOrgId);
          expect(packageData?.resources?.records.length).toEqual(1);
        });

        it('get package by id should success', async () => {
          const packageRes = await sdkClient.sdk.queryPackages({
            id: packageId
          });

          const packageData = _.get(packageRes, 'data.packages.records[0]');
          expect(packageData).toBeDefined();
          expect(packageData?.id).toEqual(packageId);
          packageName = packageData?.name || '';
        });

        xit('create package with duplicate name should fail', async () => {
          const packageRes = sdkClient.sdk.packageCreate({
            input: {
              name: packageName,
              distributionType: EngineDistributionType.Public,
              organizationId: superOrgId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          await expect(packageRes).rejects.toThrow();
        });
      });

      describe('update package', () => {
        it('update package basic info should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.description).toEqual('test description');
          expect(updatedPackage?.name).toContain(citestMarker + '-updateName-');
        });

        // add, remove resources to pending package
        it('add not active resources to package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(1);
        });

        it('add not active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Package,
                resourceId: resourcesPackage2,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === resourcesPackage2)
              .length
          ).toEqual(1);
        });

        it('remove resources from package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(0);
        });

        it('remove resources from package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Remove
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to package using updatePackage should success', async () => {
          const updateStatusRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: schemaId,
              status: SchemaStatus.Published
            }
          });

          const schemaData = _.get(updateStatusRes, 'data.updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData?.status).toEqual('published');

          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        // action with pending package
        it('change resources status to not active', async () => {
          const updateStatusRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: schemaId,
              status: SchemaStatus.Inactive
            }
          });

          const schemaData = _.get(updateStatusRes, 'data.updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData?.status).toEqual(SchemaStatus.Inactive);
        });

        xit('approve package has no active resources should fail', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Approved
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Approved);
        }); // skip til fixed

        xit('grant pending package to current org should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        // change package status and grant package
        it('update all resources status to active', async () => {
          // publish schema resources
          const updateStatusSchemaRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: schemaId,
              status: SchemaStatus.Published
            }
          });

          const schemaData = _.get(
            updateStatusSchemaRes,
            'data.updateSchemaState'
          );
          expect(schemaData).toBeDefined();
          expect(schemaData?.status).toEqual(SchemaStatus.Published);

          // remove pending package from resources
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Remove
                },
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage2,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(resources.length).toEqual(1);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('approve package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Approved
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Approved);
        });

        xit('grant approved package to current org should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('publish package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Published
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Published);
        });

        it('deactive package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Deactivated
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Deactivated);
        });

        xit('grant deactive package should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('re publish package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Published
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Published);
        });

        it('grant published package VIEW grant type to current org should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == superOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('VIEW');
        });

        it('grant published package VIEW grant type to active org should success', async () => {
          // create active org
          const orgCreateRes = await sdkClient.sdk.createOrganization({
            input: {
              name: `${citestMarker}-${uuid.v4()}`,
              businessUnit: 'Legal',
              types: [OrganizationType.Agency, OrganizationType.Broadcaster],
              metadata: {},
              applications: [],
              remainingBudget: 0,
              isLimitEnforced: true
            }
          });

          const orgRes = _.get(orgCreateRes, 'data.createOrganization');
          expect(orgRes).toBeDefined();
          activeOrgId = orgRes?.id || '';
          createdOrgIds.add(activeOrgId);

          // grant package to new org
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('VIEW');
        });

        xit('grant published package to deactive org should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: deletedOrgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();
        });

        it('get package grant should success', async () => {
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();
          // granted to activeOrgId and superOrgId
          expect(getGrant?.length).toEqual(2);
          expect(
            getGrant?.find((rec: any) => rec.organization.id == activeOrgId)
          ).toBeDefined();
          expect(
            getGrant?.find((rec: any) => rec.organization.id == superOrgId)
          ).toBeDefined();
        });

        it('change package grant type to GRANT should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant?.length).toEqual(2);
          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('GRANT');
        });

        it('change package grant type to DENY should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.Deny,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant?.length).toEqual(2);
          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('DENY');
        });

        it('change package grant action to REMOVE should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.Deny,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);
        });

        it('get package grant should success', async () => {
          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to superOrgId
          expect(getGrant?.length).toEqual(1);
          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toEqual(undefined);
        });

        // update resources in published package
        it('update resource action to REMOVE should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage?.id || ''; // get lastest lineage
          createdPackageIds.add(packageId);
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to published package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage?.id || ''; // get lastest lineage
          createdPackageIds.add(packageId);
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to published package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();
          packageId = updatedPackage?.id || ''; // get lastest lineage
          createdPackageIds.add(packageId);

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add disabled resources to published published package using updatePackage should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: resourcesPackage1,
              status: PackageStatus.Deactivated
            }
          });

          const updatedResource = _.get(
            updateResourceRes,
            'data.packageUpdate'
          );
          expect(updatedResource).toBeDefined();
          expect(updatedResource?.status).toEqual(PackageStatus.Deactivated);

          // add disabled resources to package
          const updatePackageRes = sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Add
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

        it('add disabled resources to published package using packageUpdateResources should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: resourcesPackage2,
              status: PackageStatus.Deactivated
            }
          });

          const updatedResource = _.get(
            updateResourceRes,
            'data.packageUpdate'
          );
          expect(updatedResource).toBeDefined();
          expect(updatedResource?.status).toEqual(PackageStatus.Deactivated);

          // add disabled resources to package
          const updatePackageRes = sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Package,
                resourceId: resourcesPackage2,
                action: PackageResourceAction.Add
              }
            ]
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('create deleted resources', async () => {
          const schemaRes = await sdkClient.sdk.upsertSchemaDraft({
            input: {
              schema: schemaInput,
              dataRegistryId: regId
            }
          });

          deletedSchemaId = _.get(schemaRes, 'data.upsertSchemaDraft.id', '');
          createdSchemaIds.add(deletedSchemaId);

          const deleteScheRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: deletedSchemaId,
              status: SchemaStatus.Deleted
            }
          });

          const deleteSche = _.get(deleteScheRes, 'data.updateSchemaState');
          expect(deleteSche?.status).toEqual(SchemaStatus.Deleted);
          createdSchemaIds.delete(deletedSchemaId);
        });

        it('add deleted resources to published package using updatePackage should fail', async () => {
          const updatePackageRes = sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: deletedSchemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('add deleted resources to published package using packageUpdateResources should fail', async () => {
          const updatePackageRes = sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: deletedSchemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('delete package should success', async () => {
          const deleteRes = await sdkClient.sdk.packageDelete({
            id: resourcesPackage1
          });

          expect(_.get(deleteRes, 'data.packageDelete.success')).toEqual(true);
          createdPackageIds.delete(resourcesPackage1);
        });

        it('query delete package should empty', async () => {
          const getPackageRes = await sdkClient.sdk.queryPackages({
            id: resourcesPackage1
          });

          const packageData = _.get(getPackageRes, 'data.packages.records');
          expect(packageData?.length).toEqual(0);
        });
      });

      afterAll(async () => {
        if (packageId) {
          await safe('delete package', async () => {
            // remove resources
            const removeRes = await sdkClient.sdk.packageUpdateResources({
              packageId: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Remove
                }
              ]
            });

            const removeResources = _.get(
              removeRes,
              'data.packageUpdateResources'
            );
            packageId = removeResources?.id!; // get new lineage

            const getPackageRes = await sdkClient.sdk.queryPackages({
              id: packageId
            });

            const packageData = _.get(
              getPackageRes,
              'data.packages.records[0]'
            );
            expect(_.get(packageData, 'resources.records')?.length).toEqual(0);

            // delete resources
            // delete last schema in data registry will also delete the data registry
            const updateStatusRes = await sdkClient.sdk.updateSchemaState({
              input: {
                id: schemaId,
                status: SchemaStatus.Deleted
              }
            });

            const schemaData = _.get(updateStatusRes, 'data.updateSchemaState');
            expect(schemaData).toBeDefined();
            expect(schemaData?.status).toEqual(SchemaStatus.Deleted);

            // remove grant for org
            await sdkClient.sdk.packageUpdateGrants({
              input: {
                packageId,
                packageGrants: [
                  {
                    organizationId: superOrgId,
                    grantType: PackageGrantType.View,
                    action: PackageGrantAction.Remove
                  }
                ]
              }
            });

            const getGrantRes = await sdkClient.sdk.packageGrants({
              id: packageId
            });

            const listGrant = _.get(getGrantRes, 'data.packageGrants.records');
            expect(listGrant?.length).toEqual(0);

            // delete package
            await sdkClient.sdk.packageDelete({ id: packageId });
          });
        }

        // fallback cleanup for any packages/schemas/orgs still tracked
        for (const id of createdPackageIds) {
          await safe(`delete package ${id}`, () =>
            sdkClient.sdk.packageDelete({ id })
          );
        }
        createdPackageIds.clear();

        for (const id of createdSchemaIds) {
          await safe(`delete schema ${id}`, () =>
            sdkClient.sdk.updateSchemaState({
              input: { id, status: SchemaStatus.Deleted }
            })
          );
        }
        createdSchemaIds.clear();

        for (const id of createdOrgIds) {
          await safe(`delete org ${id}`, () =>
            sdkClient.sdk.updateOrganization({
              input: { id, status: OrganizationStatus.Deleted }
            })
          );
        }
        createdOrgIds.clear();
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
          const packageRes = await sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [],
              organizationId: superOrgId,
              version: '1.0.0'
            }
          });

          expect(packageRes.data.packageCreate).toBeDefined();
          resourcesPackage1 = packageRes?.data?.packageCreate?.id;
          createdPackageIds.add(resourcesPackage1);

          expect(
            _.get(packageRes, 'data.packageCreate.resources.records', []).length
          ).toEqual(0);
        });

        it('create package using not active resource', async () => {
          const packageRes = await sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              organizationId: superOrgId,
              version: '1.0.0'
            }
          });

          const packageData = _.get(packageRes, 'data.packageCreate');
          resourcesPackage2 = packageData?.id || '';
          createdPackageIds.add(resourcesPackage2);

          expect(packageData).toBeDefined();
          expect(_.get(packageData, 'name')).toContain(
            `${citestMarker}-public-package`
          );
          expect(_.get(packageData, 'distributionType')).toEqual(
            EngineDistributionType.Public
          );
          expect(
            _.get(packageData, 'resources.records')?.map(
              (record: any) => record.resourceId
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

          const privateRes = await sdkClient.query({
            query: queryGetPrivateRes
          });
          const privatePackage = _.get(privateRes, 'packages.records[0]', {});

          expect(privatePackage.id).toBeDefined();
          const privatePackageId = privatePackage.id;
          expect(privatePackage.status).toEqual('published');
          expect(privatePackage.distributionType).toEqual('private');
          expect(privatePackage.organization.id).toEqual('1');

          const createPackageReq = sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: privatePackageId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          await expect(createPackageReq).rejects.toThrow();
        });

        xit('create package using deleted org should fail', async () => {
          const createPackageReq = sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              organizationId: deletedOrgId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          await expect(createPackageReq).rejects.toThrow();
        });

        it('create package should success', async () => {
          const packageRes = await sdkClient.sdk.packageCreate({
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              organizationId: superOrgId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          const packageData = _.get(packageRes, 'data.packageCreate');
          expect(packageData).toBeDefined();
          packageId = packageData?.id || '';
          createdPackageIds.add(packageId);

          expect(packageData?.organization?.id).toEqual(superOrgId);
          expect(packageData?.resources?.records.length).toEqual(1);
        });

        it('get package by id should success', async () => {
          const packageRes = await sdkClient.sdk.queryPackages({
            id: packageId
          });

          const packageData = _.get(packageRes, 'data.packages.records[0]');
          expect(packageData).toBeDefined();
          expect(packageData?.id).toEqual(packageId);
          packageName = packageData?.name || '';
        });

        xit('create package with duplicate name should fail', async () => {
          const packageRes = sdkClient.sdk.packageCreate({
            input: {
              name: packageName,
              distributionType: EngineDistributionType.Public,
              organizationId: superOrgId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          });

          await expect(packageRes).rejects.toThrow();
        });
      });

      describe('update package', () => {
        it('update package basic info should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.description).toEqual('test description');
          expect(updatedPackage?.name).toContain(citestMarker + '-updateName-');
        });

        // add, remove resources to pending package
        it('add not active resources to package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(1);
        });

        it('add not active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Package,
                resourceId: resourcesPackage2,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === resourcesPackage2)
              .length
          ).toEqual(1);
        });

        it('remove resources from package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === resourcesPackage1)
              .length
          ).toEqual(0);
        });

        it('remove resources from package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Remove
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to package using updatePackage should success', async () => {
          const updateStatusRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: schemaId,
              status: SchemaStatus.Published
            }
          });

          const schemaData = _.get(updateStatusRes, 'data.updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData?.status).toEqual('published');

          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add duplicate resources to package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        // action with pending package
        it('change resources status to not active', async () => {
          const updateStatusRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: schemaId,
              status: SchemaStatus.Inactive
            }
          });

          const schemaData = _.get(updateStatusRes, 'data.updateSchemaState');
          expect(schemaData).toBeDefined();
          expect(schemaData?.status).toEqual(SchemaStatus.Inactive);
        });

        xit('approve package has no active resources should fail', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Approved
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Approved);
        }); // skip til fixed

        xit('grant pending package to current org should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        // change package status and grant package
        it('update all resources status to active', async () => {
          // publish schema resources
          const updateStatusSchemaRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: schemaId,
              status: SchemaStatus.Published
            }
          });

          const schemaData = _.get(
            updateStatusSchemaRes,
            'data.updateSchemaState'
          );
          expect(schemaData).toBeDefined();
          expect(schemaData?.status).toEqual(SchemaStatus.Published);

          // remove pending package from resources
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Remove
                },
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage2,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(resources.length).toEqual(1);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('approve package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Approved
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Approved);
        });

        xit('grant approved package to current org should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('publish package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Published
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Published);
        });

        it('deactive package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Deactivated
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Deactivated);
        });

        xit('grant deactive package should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();

          // const grantData = _.get(await grantRes, 'packageUpdateGrants');
          // expect(grantData).toBeDefined();
          // expect(grantData.id).toEqual(packageId);
        });

        it('re publish package should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              status: PackageStatus.Published
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();
          expect(updatedPackage?.status).toEqual(PackageStatus.Published);
        });

        it('grant published package VIEW grant type to current org should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: superOrgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == superOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('VIEW');
        });

        it('grant published package VIEW grant type to active org should success', async () => {
          // create active org
          const orgCreateRes = await sdkClient.sdk.createOrganization({
            input: {
              name: `${citestMarker}-org-testing-${uuid.v4()}`,
              businessUnit: 'Legal',
              types: [OrganizationType.Agency, OrganizationType.Broadcaster],
              metadata: { test: 'value' },
              applications: [],
              remainingBudget: 0,
              isLimitEnforced: true
            }
          });

          const orgRes = _.get(orgCreateRes, 'data.createOrganization');
          expect(orgRes).toBeDefined();
          activeOrgId = orgRes?.id || '';
          createdOrgIds.add(activeOrgId);

          // grant package to new org
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('VIEW');
        });

        xit('grant published package to deactive org should fail', async () => {
          const grantRes = sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: deletedOrgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          await expect(grantRes).rejects.toThrow();
        });

        it('get package grant should success', async () => {
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();
          // granted to activeOrgId and superOrgId
          expect(getGrant?.length).toEqual(2);
          expect(
            getGrant?.find((rec: any) => rec.organization.id == activeOrgId)
          ).toBeDefined();
          expect(
            getGrant?.find((rec: any) => rec.organization.id == superOrgId)
          ).toBeDefined();
        });

        it('change package grant type to GRANT should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant?.length).toEqual(2);
          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('GRANT');
        });

        it('change package grant type to DENY should success', async () => {
          const grantRes = await sdkClient.sdk.mutationPackageUpdateGrants({
            packageId,
            packageGrants: [
              {
                organizationId: activeOrgId,
                grantType: PackageGrantType.Deny,
                action: PackageGrantAction.Add
              }
            ]
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);

          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to activeOrgId and superOrgId
          expect(getGrant?.length).toEqual(2);
          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toBeDefined();
          expect(currentGrant?.grantType).toEqual('DENY');
        });

        it('change package grant action to REMOVE should success', async () => {
          const grantRes = await sdkClient.sdk.packageUpdateGrants({
            input: {
              packageId,
              packageGrants: [
                {
                  organizationId: activeOrgId,
                  grantType: PackageGrantType.Deny,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          });

          const grantData = _.get(grantRes, 'data.packageUpdateGrants');
          expect(grantData).toBeDefined();
          expect(grantData?.id).toEqual(packageId);
        });

        it('get package grant should success', async () => {
          // check grant
          const getGrantRes = await sdkClient.sdk.packageGrants({
            id: packageId
          });

          const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
          expect(getGrant).toBeDefined();

          // granted to superOrgId
          expect(getGrant?.length).toEqual(1);
          const currentGrant = getGrant?.find(
            (rec: any) => rec.organization.id == activeOrgId
          );
          expect(currentGrant).toEqual(undefined);
        });

        // update resources in published package
        it('update resource action to REMOVE should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage?.id || ''; // get lastest lineage
          createdPackageIds.add(packageId);
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(0);
        });

        it('add active resources to published package using updatePackage should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          const updatedPackage = _.get(updateRes, 'data.packageUpdate');
          expect(updatedPackage).toBeDefined();

          packageId = updatedPackage?.id || ''; // get lastest lineage
          createdPackageIds.add(packageId);
          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add active resources to published package using packageUpdateResources should success', async () => {
          const updateRes = await sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: schemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          const updatedPackage = _.get(
            updateRes,
            'data.packageUpdateResources'
          );
          expect(updatedPackage).toBeDefined();
          packageId = updatedPackage?.id || ''; // get lastest lineage
          createdPackageIds.add(packageId);

          const resources = _.get(updatedPackage, 'resources.records', []);
          expect(
            resources.filter((rec: any) => rec.resourceId === schemaId).length
          ).toEqual(1);
        });

        it('add disabled resources to published published package using updatePackage should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: resourcesPackage1,
              status: PackageStatus.Deactivated
            }
          });

          const updatedResource = _.get(
            updateResourceRes,
            'data.packageUpdate'
          );
          expect(updatedResource).toBeDefined();
          expect(updatedResource?.status).toEqual(PackageStatus.Deactivated);

          // add disabled resources to package
          const updatePackageRes = sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: resourcesPackage1,
                  action: PackageResourceAction.Add
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

        it('add disabled resources to published package using packageUpdateResources should fail', async () => {
          // update resources to disabled
          const updateResourceRes = await sdkClient.sdk.packageUpdate({
            input: {
              id: resourcesPackage2,
              status: PackageStatus.Deactivated
            }
          });

          const updatedResource = _.get(
            updateResourceRes,
            'data.packageUpdate'
          );
          expect(updatedResource).toBeDefined();
          expect(updatedResource?.status).toEqual(PackageStatus.Deactivated);

          // add disabled resources to package
          const updatePackageRes = sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Package,
                resourceId: resourcesPackage2,
                action: PackageResourceAction.Add
              }
            ]
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('create deleted resources', async () => {
          const schemaRes = await sdkClient.sdk.upsertSchemaDraft({
            input: {
              schema: schemaInput,
              dataRegistryId: regId
            }
          });

          deletedSchemaId = _.get(schemaRes, 'data.upsertSchemaDraft.id', '');
          createdSchemaIds.add(deletedSchemaId);

          const deleteScheRes = await sdkClient.sdk.updateSchemaState({
            input: {
              id: deletedSchemaId,
              status: SchemaStatus.Deleted
            }
          });

          const deleteSche = _.get(deleteScheRes, 'data.updateSchemaState');
          expect(deleteSche?.status).toEqual(SchemaStatus.Deleted);
          createdSchemaIds.delete(deletedSchemaId);
        });

        it('add deleted resources to published package using updatePackage should fail', async () => {
          const updatePackageRes = sdkClient.sdk.packageUpdate({
            input: {
              id: packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: deletedSchemaId,
                  action: PackageResourceAction.Add
                }
              ]
            }
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('add deleted resources to published package using packageUpdateResources should fail', async () => {
          const updatePackageRes = sdkClient.sdk.packageUpdateResources({
            packageId: packageId,
            resources: [
              {
                resourceType: PackageResourceType.Schema,
                resourceId: deletedSchemaId,
                action: PackageResourceAction.Add
              }
            ]
          });

          await expect(updatePackageRes).rejects.toThrow();
        });

        it('delete package should success', async () => {
          const deleteRes = await sdkClient.sdk.packageDelete({
            id: resourcesPackage1
          });

          expect(_.get(deleteRes, 'data.packageDelete.success')).toEqual(true);
          createdPackageIds.delete(resourcesPackage1);
        });

        it('query delete package should empty', async () => {
          const getPackageRes = await sdkClient.sdk.queryPackages({
            id: resourcesPackage1
          });

          const packageData = _.get(getPackageRes, 'data.packages.records', []);
          expect(packageData.length).toEqual(0);
        });
      });

      afterAll(async () => {
        if (packageId) {
          await safe('delete package', async () => {
            // remove resources
            const removeRes = await sdkClient.sdk.packageUpdateResources({
              packageId,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: schemaId,
                  action: PackageResourceAction.Remove
                }
              ]
            });

            const removeResources = _.get(
              removeRes,
              'data.packageUpdateResources'
            );
            packageId = removeResources?.id!; // get new lineage

            const getPackageRes = await sdkClient.sdk.queryPackages({
              id: packageId
            });

            const packageData = _.get(
              getPackageRes,
              'data.packages.records[0]'
            );
            expect(_.get(packageData, 'resources.records', []).length).toEqual(
              0
            );

            // delete resources
            // delete last schema in data registry will also delete the data registry
            const updateStatusRes = await sdkClient.sdk.updateSchemaState({
              input: {
                id: schemaId,
                status: SchemaStatus.Deleted
              }
            });

            const schemaData = _.get(updateStatusRes, 'data.updateSchemaState');
            expect(schemaData).toBeDefined();
            expect(schemaData?.status).toEqual(SchemaStatus.Deleted);

            // remove grant for org
            await sdkClient.sdk.packageUpdateGrants({
              input: {
                packageId,
                packageGrants: [
                  {
                    organizationId: activeOrgId,
                    grantType: PackageGrantType.View,
                    action: PackageGrantAction.Remove
                  }
                ]
              }
            });

            const getGrantRes = await sdkClient.sdk.packageGrants({
              id: packageId
            });

            const listGrant = _.get(
              getGrantRes,
              'data.packageGrants.records',
              []
            );
            expect(listGrant.length).toEqual(0);

            // delete package
            await sdkClient.sdk.packageDelete({ id: packageId });
          });
        }

        // fallback cleanup for any packages/schemas/orgs still tracked
        for (const id of createdPackageIds) {
          await safe(`delete package ${id}`, () =>
            sdkClient.sdk.packageDelete({ id })
          );
        }
        createdPackageIds.clear();

        for (const id of createdSchemaIds) {
          await safe(`delete schema ${id}`, () =>
            sdkClient.sdk.updateSchemaState({
              input: { id, status: SchemaStatus.Deleted }
            })
          );
        }
        createdSchemaIds.clear();

        for (const id of createdOrgIds) {
          await safe(`delete org ${id}`, () =>
            sdkClient.sdk.updateOrganization({
              input: { id, status: OrganizationStatus.Deleted }
            })
          );
        }
        createdOrgIds.clear();
      });
    }
  );
});
