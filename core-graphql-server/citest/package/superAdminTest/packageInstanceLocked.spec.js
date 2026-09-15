const uuid = require('uuid');
const _ = require('lodash');
const supertest = require('supertest')('');

const citestMarker = global.citestMarker || 'citest-should-delete';

/* 
  This test is to verify the package with instance-locked distribution type can only be accessed in the instance which created it.
  To run this test, make sure to have 
  - two instances up and running, and update the instance info in the code below.
  - turn on cloudflare Zero Trust while run this test (allow it to access to instances)
*/
const instance1 = {
  url: 'URL_OF_INSTANCE_1', // example: 'https://instance1.aiware.run/graphql'
  superAdmin: {
    username: 'SUPER_ADMIN_USERNAME',
    password: 'PASSWORD'
  }
};

const instance2 = {
  url: 'URL_OF_INSTANCE_2', // example: 'https://instance2.aiware.run/graphql'
  superAdmin: {
    username: 'SUPER_ADMIN_USERNAME',
    password: 'PASSWORD'
  }
};
const testUserPassword = 'testUserPassword';

let superToken1, org1, admin1, tokenAdmin1, package1;
let superToken2, org2, admin2, tokenAdmin2;
describe('package instance locked', () => {
  beforeAll(async () => {
    // login instance 1
    const data = await supertest
      .post(instance1.url)
      .set('Content-Type', 'application/json')
      .send({
        query: queries.login.query,
        operationName: 'login',
        variables: {
          userName: instance1.superAdmin.username,
          password: instance1.superAdmin.password
        }
      });
    superToken1 = _.get(data, 'body.data.userLogin.token');
    expect(superToken1).toBeDefined();

    // login instance 2
    const data2 = await supertest
      .post(instance2.url)
      .set('Content-Type', 'application/json')
      .send({
        query: queries.login.query,
        operationName: 'login',
        variables: {
          userName: instance2.superAdmin.username,
          password: instance2.superAdmin.password
        }
      });

    superToken2 = _.get(data2, 'body.data.userLogin.token');
    expect(superToken2).toBeDefined();

    // create org
    const createOrg1 = await supertest
      .post(instance1.url)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${superToken1}`)
      .send({
        query: queries.createOrg.query,
        operationName: queries.createOrg.operationName,
        variables: {
          input: {
            name: `${citestMarker}-${uuid.v4()}`,
            businessUnit: 'Legal',
            types: ['agency', 'broadcaster'],
            metadata: {},
            applications: [
              {
                applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
                applicationKey: 'cms'
              },
              {
                applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
                applicationKey: 'discovery'
              }
            ]
          }
        }
      });
    org1 = _.get(createOrg1, 'body.data.createOrganization', {});
    expect(org1.id).toBeDefined();

    const createOrg2 = await supertest
      .post(instance2.url)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${superToken2}`)
      .send({
        query: queries.createOrg.query,
        operationName: queries.createOrg.operationName,
        variables: {
          input: {
            name: `${citestMarker}-${uuid.v4()}`,
            businessUnit: 'Legal',
            types: ['agency', 'broadcaster'],
            metadata: {},
            applications: [
              {
                applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
                applicationKey: 'cms'
              },
              {
                applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
                applicationKey: 'discovery'
              }
            ]
          }
        }
      });
    org2 = _.get(createOrg2, 'body.data.createOrganization', {});
    expect(org2.id).toBeDefined();

    // create admin
    const createAdmin1 = await supertest
      .post(instance1.url)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${superToken1}`)
      .send({
        query: queries.createUser.query,
        operationName: 'createUser',
        variables: {
          input: {
            name: `${citestMarker}-admin-${uuid.v4()}`,
            password: 'testUserPassword',
            organizationId: org1.id,
            roleIds: [
              '032218c3-d47e-4287-9d16-7bb867c01266',
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
            ]
          }
        }
      });
    admin1 = _.get(createAdmin1, 'body.data.createUser', {});
    expect(admin1.id).toBeDefined();

    const createAdmin2 = await supertest
      .post(instance2.url)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${superToken2}`)
      .send({
        query: queries.createUser.query,
        operationName: 'createUser',
        variables: {
          input: {
            name: `${citestMarker}-admin-${uuid.v4()}`,
            password: 'testUserPassword',
            organizationId: org2.id,
            roleIds: [
              '032218c3-d47e-4287-9d16-7bb867c01266',
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
            ]
          }
        }
      });
    admin2 = _.get(createAdmin2, 'body.data.createUser', {});
    expect(admin2.id).toBeDefined();

    // login org admin
    const loginAdmin1 = await supertest
      .post(instance1.url)
      .set('Content-Type', 'application/json')
      .send({
        query: queries.login.query,
        operationName: 'login',
        variables: {
          userName: admin1.name,
          password: testUserPassword
        }
      });
    tokenAdmin1 = _.get(loginAdmin1, 'body.data.userLogin.token');
    expect(tokenAdmin1).toBeDefined();

    const loginAdmin2 = await supertest
      .post(instance2.url)
      .set('Content-Type', 'application/json')
      .send({
        query: queries.login.query,
        operationName: 'login',
        variables: {
          userName: admin2.name,
          password: testUserPassword
        }
      });
    tokenAdmin2 = _.get(loginAdmin2, 'body.data.userLogin.token');
    expect(tokenAdmin2).toBeDefined();
  });

  it('instance 1 create instance-locked package success', async () => {
    const createPackage = await supertest
      .post(instance1.url)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${tokenAdmin1}`)
      .send({
        query: queries.packageCreate.query,
        operationName: 'packageCreate',
        variables: {
          input: {
            name: `${citestMarker}-package-${uuid.v4()}`,
            version: '1.0.0',
            distributionType: 'instance_locked'
          }
        }
      });

    package1 = _.get(createPackage, 'body.data.packageCreate');
    expect(package1.id).toBeDefined();
  });

  it('instance 1 query package success', async () => {
    const queryPackage = await supertest
      .post(instance1.url)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${tokenAdmin1}`)
      .send({
        query: queries.packages.query,
        operationName: 'packages',
        variables: {
          ids: [package1.id]
        }
      });
    const packages = _.get(queryPackage, 'body.data.packages.records', []);
    expect(packages).toHaveLength(1);
    expect(packages[0].id).toBe(package1.id);
  });

  describe('test package cross instances', () => {
    it('instance 2 can not query instance_locked package', async () => {
      const queryPackage = await supertest
        .post(instance2.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken2}`)
        .send({
          query: queries.packages.query,
          operationName: 'packages',
          variables: {
            ids: [package1.id]
          }
        });

      const packages = _.get(queryPackage, 'body.data.packages.records', []);
      expect(packages).toHaveLength(0);
    });

    it('instance 1 publish package success', async () => {
      const publishPackage = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${tokenAdmin1}`)
        .send({
          query: queries.packageUpdate.query,
          operationName: 'packageUpdate',
          variables: {
            input: {
              id: package1.id,
              status: 'published'
            }
          }
        });

      const updatedPackage = _.get(
        publishPackage,
        'body.data.packageUpdate',
        {}
      );
      expect(updatedPackage.id).toBe(package1.id);
      expect(updatedPackage.status).toBe('published');
    });

    it('instance 2 can not query published instance_locked package', async () => {
      const queryPackage = await supertest
        .post(instance2.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken2}`)
        .send({
          query: queries.packages.query,
          operationName: 'packages',
          variables: {
            ids: [package1.id]
          }
        });

      const packages = _.get(queryPackage, 'body.data.packages.records', []);
      expect(packages).toHaveLength(0);
    });

    it('instance 1 grant package to org of other instance', async () => {
      const grantPackage = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${tokenAdmin1}`)
        .send({
          query: queries.packageUpdateGrants.query,
          operationName: 'packageUpdateGrants',
          variables: {
            input: {
              packageId: package1.id,
              packageGrants: [
                {
                  organizationId: org2.id,
                  grantType: 'VIEW',
                  action: 'ADD'
                }
              ]
            }
          }
        });

      const grantedPackage = _.get(
        grantPackage,
        'body.data.packageUpdateGrants',
        {}
      );
      expect(grantedPackage.id).toBe(package1.id);
    });

    it('org from instance 2 can not get package from instance 1', async () => {
      const queryPackage = await supertest
        .post(instance2.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${tokenAdmin2}`)
        .send({
          query: queries.packages.query,
          operationName: 'packages',
          variables: {
            ids: [package1.id]
          }
        });

      const packages = _.get(queryPackage, 'body.data.packages.records', []);
      expect(packages).toHaveLength(0);
    });
  });

  describe('test package same instance', () => {
    let newOrg, newAdmin, tokenNewAdmin;
    beforeAll(async () => {
      // create new org in instance 1
      const newOrgCreate = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken1}`)
        .send({
          query: queries.createOrg.query,
          operationName: queries.createOrg.operationName,
          variables: {
            input: {
              name: `${citestMarker}-${uuid.v4()}`,
              businessUnit: 'Legal',
              types: ['agency', 'broadcaster'],
              metadata: {},
              applications: [
                {
                  applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
                  applicationKey: 'cms'
                },
                {
                  applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
                  applicationKey: 'discovery'
                }
              ]
            }
          }
        });
      newOrg = _.get(newOrgCreate, 'body.data.createOrganization', {});
      expect(newOrg.id).toBeDefined();

      // create new org admin
      const newAdminCreate = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken1}`)
        .send({
          query: queries.createUser.query,
          operationName: 'createUser',
          variables: {
            input: {
              name: `${citestMarker}-admin-${uuid.v4()}`,
              password: testUserPassword,
              organizationId: newOrg.id,
              roleIds: [
                '032218c3-d47e-4287-9d16-7bb867c01266',
                'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
              ]
            }
          }
        });
      newAdmin = _.get(newAdminCreate, 'body.data.createUser', {});
      expect(newAdmin.id).toBeDefined();

      // login new org admin
      const loginNewAdmin = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .send({
          query: queries.login.query,
          operationName: 'login',
          variables: {
            userName: newAdmin.name,
            password: testUserPassword
          }
        });
      tokenNewAdmin = _.get(loginNewAdmin, 'body.data.userLogin.token');
      expect(tokenNewAdmin).toBeDefined();
    });

    it('grant package to org of same instance success', async () => {
      const grantPackage = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${tokenAdmin1}`)
        .send({
          query: queries.packageUpdateGrants.query,
          operationName: 'packageUpdateGrants',
          variables: {
            input: {
              packageId: package1.id,
              packageGrants: [
                {
                  organizationId: newOrg.id,
                  grantType: 'VIEW',
                  action: 'ADD'
                }
              ]
            }
          }
        });

      const grantedPackage = _.get(
        grantPackage,
        'body.data.packageUpdateGrants',
        {}
      );
      expect(grantedPackage.id).toBe(package1.id);
    });

    it('org from same instance can get package', async () => {
      const queryPackage = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${tokenNewAdmin}`)
        .send({
          query: queries.packages.query,
          operationName: 'packages',
          variables: {
            ids: [package1.id]
          }
        });

      const packages = _.get(queryPackage, 'body.data.packages.records', []);
      expect(packages).toHaveLength(1);
      expect(packages[0].id).toBe(package1.id);
    });

    afterAll(async () => {
      // delete new org admin
      if (newAdmin && newAdmin.id) {
        const deleteRes = await supertest
          .post(instance1.url)
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${superToken1}`)
          .send({
            query: queries.deleteUser.query,
            operationName: 'deleteUser',
            variables: {
              id: newAdmin.id
            }
          });

        const deletedAdmin = _.get(deleteRes, 'body.data.deleteUser', {});
        expect(deletedAdmin.id).toBe(newAdmin.id);
      }

      // clean up new org
      if (newOrg && newOrg.id) {
        const deleteOrg = await supertest
          .post(instance1.url)
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${superToken1}`)
          .send({
            query: queries.updateOrganization.query,
            operationName: 'updateOrganization',
            variables: {
              input: {
                id: newOrg.id,
                status: 'deleted'
              }
            }
          });

        const deletedOrg = _.get(deleteOrg, 'body.data.updateOrganization', {});
        expect(deletedOrg.id).toBe(newOrg.id);
      }
    });
  });

  afterAll(async () => {
    // clean up package
    if (package1 && package1.id) {
      const deletePackage = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${tokenAdmin1}`)
        .send({
          query: queries.packageDelete.query,
          operationName: 'packageDelete',
          variables: {
            id: package1.id
          }
        });

      const deletedPackage = _.get(
        deletePackage,
        'body.data.packageDelete',
        {}
      );
      expect(deletedPackage.success).toBe(true);
    }

    // clean up admin users
    if (admin1 && admin1.id) {
      const deleteAdmin1 = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken1}`)
        .send({
          query: queries.deleteUser.query,
          operationName: 'deleteUser',
          variables: {
            id: admin1.id
          }
        });

      const deletedAdmin1 = _.get(deleteAdmin1, 'body.data.deleteUser', {});
      expect(deletedAdmin1.id).toBe(admin1.id);
    }

    if (admin2 && admin2.id) {
      const deleteAdmin2 = await supertest
        .post(instance2.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken2}`)
        .send({
          query: queries.deleteUser.query,
          operationName: 'deleteUser',
          variables: {
            id: admin2.id
          }
        });

      const deletedAdmin2 = _.get(deleteAdmin2, 'body.data.deleteUser', {});
      expect(deletedAdmin2.id).toBe(admin2.id);
    }

    // clean up orgs
    if (org1 && org1.id) {
      const deleteOrg1 = await supertest
        .post(instance1.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken1}`)
        .send({
          query: queries.updateOrganization.query,
          operationName: 'updateOrganization',
          variables: {
            input: {
              id: org1.id,
              status: 'deleted'
            }
          }
        });

      const deletedOrg1 = _.get(deleteOrg1, 'body.data.updateOrganization', {});
      expect(deletedOrg1.id).toBe(org1.id);
      expect(deletedOrg1.status).toBe('deleted');
    }

    if (org2 && org2.id) {
      const deleteOrg2 = await supertest
        .post(instance2.url)
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${superToken2}`)
        .send({
          query: queries.updateOrganization.query,
          operationName: 'updateOrganization',
          variables: {
            input: {
              id: org2.id,
              status: 'deleted'
            }
          }
        });

      const deletedOrg2 = _.get(deleteOrg2, 'body.data.updateOrganization', {});
      expect(deletedOrg2.id).toBe(org2.id);
      expect(deletedOrg2.status).toBe('deleted');
    }
  });
});

const queries = {
  login: {
    query:
      'mutation login ($userName: String!, $password: String!) {  userLogin (input: { userName: $userName, password: $password  }){    token }}',
    operationName: 'login'
  },
  createOrg: {
    query: `mutation createOrg ($input: CreateOrganization!) {
      createOrganization (input: $input ) {
        id
        name
      }
    }`,
    operationName: 'createOrg'
  },
  createUser: {
    query: `mutation createUser ($input: CreateUser) {
        createUser (input:$input) {
          id
          name
        }
      }`,
    operationName: 'createUser'
  },
  packageCreate: {
    query: `mutation packageCreate ($input: PackageCreateInput) {
      packageCreate (input: $input){
        id
      }
    }`,
    operationName: 'packageCreate'
  },
  packages: {
    query: `query packages ($ids: [ID!]) {
      packages (ids: $ids) {
        records {
          id
        }
      }
    }`,
    operationName: 'packages'
  },
  packageUpdate: {
    query: `mutation packageUpdate ($input: PackageUpdateInput) {
      packageUpdate (input: $input) {
        id
        status
      }
    }`,
    operationName: 'packageUpdate'
  },
  packageUpdateGrants: {
    query: `mutation packageUpdateGrants ($input: BulkPackageGrantInput!) {
      packageUpdateGrants (input: $input) {
        id
      }
    }`,
    operationName: 'packageUpdateGrants'
  },
  deleteUser: {
    query: `mutation deleteUser ($id: ID!) {
      deleteUser (id: $id) {
        id
      }
    }`,
    operationName: 'deleteUser'
  },
  updateOrganization: {
    query: `mutation updateOrganization ($input: UpdateOrganization!) {
      updateOrganization (input:$input){
        id
        status
      }
    }`,
    operationName: 'updateOrganization'
  },
  packageDelete: {
    query: `mutation packageDelete ($id: ID!) {
      packageDelete (id: $id){
        success
      }
    }`,
    operationName: 'packageDelete'
  }
};
